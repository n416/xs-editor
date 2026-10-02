// パーツのブロック → 形（三角形）。機体エディタ Ver2 の画面（v2.js）・パーツエディタ（v2-partedit.js）・ゲーム用の書き出し（bodyparts.js・unitparts.js）が同じものを使う。
// ブロックの種類（kind）は機体エディタ（index.html）の部品と同じ 3 つ：
//   hull    面で囲った形（凸）：planes = [[nx, ny, nz, d], ...]。角を動かす・面を押す引くで直す。辺の面取り bevel・bevelSegs
//   extrude 押し出し：正面の断面 pts を厚み depth だけ押し出す。taper（奥のすぼまり）・bevel（厚みの方向の面取り）・corner（断面の角の面取り）・
//           tiltY（厚みの傾き）・ridge（中央の盛り上がり）・side / top（横・上から見た断面。3 つの形の重なりだけが残る）
//   lathe   回転体：断面 pts（右半分）を縦の軸のまわりに回す。segments（分割数）・corner
// どの種類にも：
//   op      'add'（足す）か 'sub'（引く：同じパーツの中で、自分より上に並ぶブロックを削る）
//   mirror  パーツの x = 0 で反転した写しも作る
//   arrayCount・arrayStep  同じ形を間隔 arrayStep で arrayCount 個並べる
//   tf      { p: 位置, r: 回転（度。x → y → z の順）, s: 拡大 }（押し出し・回転体の置き方。面で囲った形は面に焼き込むので持たない）
//   pos     ブロックの置き場所のずれ（カタログのパーツ。形には入れず、置く側が足す）
// カタログのパーツ（どれも hull だけ・引くなし）の形は、前と同じもの（buildHull の三角形そのまま）。
import * as THREE from 'three';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { Brush, Evaluator, SUBTRACTION, INTERSECTION } from 'three-bvh-csg';
import { buildHull, hullReach } from './hull.js';

const D = Math.PI / 180;
export const KIND_LABEL = { hull: '面で囲った形', extrude: '押し出し', lathe: '回転体' };
/** ブロックの設定の既定値（持っていない項目はこれ） */
export const BLOCK0 = { op: 'add', mirror: false, arrayCount: 1, arrayStep: [0, 0.05, 0], bevel: 0, bevelSegs: 1, corner: 0, cornerSegs: 1, taper: 1, tiltY: 0, ridge: 0, depth: 0.1, segments: 24, side: null, top: null };
const val = (pc, k) => pc[k] ?? BLOCK0[k];
export const kindOf = pc => pc.kind ?? 'hull';
export const isSub = pc => pc.op === 'sub';
/** カタログのパーツと同じ、そのままの凸の形（引かれもしない）か */
export const isPlain = pc => kindOf(pc) === 'hull' && !pc.mirror && !(pc.arrayCount > 1) && !isSub(pc) && !pc.tf;
/** ブロック pc を削るブロック：同じパーツの中で、pc より下に並ぶ「引く」 */
export const cuttersOf = (def, pc) => { const i = def.pieces.indexOf(pc); return i < 0 || kindOf(pc) === 'mesh' ? [] : def.pieces.slice(i + 1).filter(p => isSub(p) && !p.blockout); };
/** 形として描く・書き出すブロックか（引くブロック・あたり（下書き）・取り込んだ形（mesh。まだ Ver2 では描けない）は描かない） */
export const drawn = pc => !isSub(pc) && !pc.blockout && kindOf(pc) !== 'mesh';

// ---- 断面（2D） ----
/** 断面の角を落とす：頂点ごとに面取り（segs = 1）か丸め（segs > 1） */
export function roundCorners(pts, r, segs, closed) {
  if (!(r > 0)) return pts.map(p => p.slice());
  const n = pts.length, out = [];
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    if (!closed && (i === 0 || i === n - 1)) { out.push(p.slice()); continue; }
    const a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
    const v1 = [a[0] - p[0], a[1] - p[1]], v2 = [b[0] - p[0], b[1] - p[1]];
    const l1 = Math.hypot(...v1), l2 = Math.hypot(...v2);
    const d = Math.min(r, l1 * 0.45, l2 * 0.45);
    if (d < 1e-5) { out.push(p.slice()); continue; }
    const s = [p[0] + v1[0] / l1 * d, p[1] + v1[1] / l1 * d], e = [p[0] + v2[0] / l2 * d, p[1] + v2[1] / l2 * d];
    for (let k = 0; k <= segs; k++) { const t = k / segs, u = 1 - t; out.push([u * u * s[0] + 2 * u * t * p[0] + t * t * e[0], u * u * s[1] + 2 * u * t * p[1] + t * t * e[1]]); }
  }
  return out;
}
const signedArea = loop => { let a = 0; for (let i = 0; i < loop.length; i++) { const p = loop[i], q = loop[(i + 1) % loop.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; };
/** 回転体の断面の閉じた輪郭（右半分。軸の上の点も含む） */
export function latheLoop(pc, lod = 0) {
  const pts = roundCorners(pc.pts.map(([x, y]) => [Math.max(0, x), y]), lod ? 0 : val(pc, 'corner'), val(pc, 'cornerSegs'), false);
  let loop = [[0, pts[0][1]], ...pts, [0, pts[pts.length - 1][1]]];
  loop = loop.filter((v, i) => i === 0 || Math.hypot(v[0] - loop[i - 1][0], v[1] - loop[i - 1][1]) > 1e-6);
  if (signedArea(loop) < 0) loop.reverse();
  return loop;
}

// ---- ブロック 1 個の形（ブロックの座標） ----
const SIDE_TURN = new THREE.Matrix4().makeRotationY(-Math.PI / 2);   // 横の断面：x → 奥行き z。x に押し出す
const TOP_TURN = new THREE.Matrix4().makeRotationX(Math.PI / 2);     // 上の断面：y → 奥行き z。y に押し出す
let evaluator = null;
const csg = () => (evaluator ??= Object.assign(new Evaluator(), { attributes: ['position', 'normal'], useGroups: false }));
const brushOf = g => { const b = new Brush(g); b.updateMatrixWorld(); return b; };
/** 押し出した形 g から、横・上の断面の内側だけを残す（3 面図の重なり） */
function carve(g, pc) {
  g.clearGroups(); g.computeBoundingBox();
  const reach = g.boundingBox.getSize(new THREE.Vector3()).length() + 1;
  let brush = brushOf(g);
  for (const [pts, turn] of [[pc.side, SIDE_TURN], [pc.top, TOP_TURN]]) {
    if (!Array.isArray(pts) || pts.length < 3) continue;
    const loop = roundCorners(pts, val(pc, 'corner'), val(pc, 'cornerSegs'), true);
    const prism = new THREE.ExtrudeGeometry(new THREE.Shape(loop.map(([a, b]) => new THREE.Vector2(a, b))), { depth: 2 * reach, bevelEnabled: false, curveSegments: 1 });
    prism.translate(0, 0, -reach).applyMatrix4(turn);
    prism.deleteAttribute('uv'); prism.clearGroups();
    const next = csg().evaluate(brush, brushOf(prism), INTERSECTION);
    prism.dispose();
    if (!next.geometry.attributes.position?.count) { next.geometry.dispose(); continue; }   // 重ならない：そのまま
    if (brush.geometry !== g) brush.geometry.dispose();
    brush = next;
  }
  if (brush.geometry !== g) g.dispose();
  return brush.geometry;
}
function flipWinding(g) {
  for (const name of ['position', 'normal']) {
    const a = g.attributes[name].array;
    for (let i = 0; i < a.length; i += 9) for (let k = 0; k < 3; k++) { const t = a[i + 3 + k]; a[i + 3 + k] = a[i + 6 + k]; a[i + 6 + k] = t; }
  }
}
/** 置き方 tf の行列 */
export function tfMatrix(tf) {
  if (!tf) return new THREE.Matrix4();
  const r = tf.r ?? [0, 0, 0];
  return new THREE.Matrix4().compose(new THREE.Vector3(...(tf.p ?? [0, 0, 0])), new THREE.Quaternion().setFromEuler(new THREE.Euler(r[0] * D, r[1] * D, r[2] * D, 'XYZ')), new THREE.Vector3(...(tf.s ?? [1, 1, 1])));
}
/** ブロックの形（置き方 tf まで掛けたもの。繰り返し・ミラー・引くはまだ）。lod 1：面取りなし・粗い回転体（遠くの LOD 用） */
function baseGeo(pc, lod = 0) {
  const kind = kindOf(pc);
  let g;
  if (kind === 'mesh') {   // 取り込んだ形：まだ Ver2 では形を持たない
    g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3)); g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(0), 3));
    return g;
  }
  if (kind === 'hull') {
    const h = buildHull(pc.planes ?? [], { bevel: lod ? 0 : val(pc, 'bevel'), bevelSegs: val(pc, 'bevelSegs'), reach: hullReach(pc.planes ?? []) });
    g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(h.positions, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(h.normals, 3));
  } else if (kind === 'extrude') {
    const depth = Math.max(0.002, val(pc, 'depth'));
    const pts = roundCorners(pc.pts, lod ? 0 : val(pc, 'corner'), val(pc, 'cornerSegs'), true);
    if (signedArea(pts) < 0) pts.reverse();
    const b = lod ? 0 : Math.min(val(pc, 'bevel'), depth * 0.45), inner = Math.max(0.001, depth - 2 * b);
    g = new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y))), { depth: inner, curveSegments: 1, bevelEnabled: b > 0.0002, bevelThickness: b, bevelSize: b, bevelOffset: -b, bevelSegments: val(pc, 'bevelSegs') });
    g.translate(0, 0, -inner / 2);
    const taper = val(pc, 'taper'), tiltY = val(pc, 'tiltY'), ridge = val(pc, 'ridge'), pos = g.attributes.position, half = depth / 2;
    if (taper !== 1) for (let i = 0; i < pos.count; i++) { const s = 1 + (taper - 1) * (pos.getZ(i) + half) / depth; pos.setXY(i, pos.getX(i) * s, pos.getY(i) * s); }
    if (tiltY || ridge) for (let i = 0; i < pos.count; i++) pos.setZ(i, pos.getZ(i) * Math.max(0.05, 1 + tiltY * pos.getY(i) - ridge * Math.abs(pos.getX(i))));
    g.deleteAttribute('uv');
    if (!lod && (pc.side || pc.top)) g = carve(g, pc);
    g = toCreasedNormals(g, 35 * D);
  } else {
    g = new THREE.LatheGeometry(latheLoop(pc, lod).map(([x, y]) => new THREE.Vector2(x, y)), Math.max(3, Math.round(lod ? Math.min(val(pc, 'segments'), 8) : val(pc, 'segments'))));
    g.deleteAttribute('uv');
    g = toCreasedNormals(g, 35 * D);
  }
  if (g.index) g = g.toNonIndexed();
  if (pc.tf) { const m = tfMatrix(pc.tf); g.applyMatrix4(m); if (m.determinant() < 0) flipWinding(g); }
  return g;
}
/** 繰り返し・ミラーで並ぶ 1 個ずつの形（パーツの座標から pos を引いたもの） */
function instances(pc, lod = 0) {
  const base = baseGeo(pc, lod), n = Math.max(1, Math.round(val(pc, 'arrayCount'))), st = val(pc, 'arrayStep'), p = pc.pos ?? [0, 0, 0];
  if (n === 1 && !pc.mirror) return [base];
  const out = [];
  for (let k = 0; k < n; k++) {
    const g = k ? base.clone().translate(st[0] * k, st[1] * k, st[2] * k) : base;
    out.push(g);
    if (pc.mirror) {   // パーツの x = 0 で反転（pos の分を戻してから）
      const m = g.clone().translate(p[0], p[1], p[2]).scale(-1, 1, 1).translate(-p[0], -p[1], -p[2]);
      flipWinding(m); out.push(m);
    }
  }
  return out;
}
function merge(geos, keep = false) {
  if (geos.length === 1) return geos[0];
  let n = 0; for (const g of geos) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
  let o = 0;
  for (const g of geos) { pos.set(g.attributes.position.array, o); nor.set(g.attributes.normal.array, o); o += g.attributes.position.count * 3; if (!keep) g.dispose(); }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return out;
}

// ---- できあがりの形（削った後）。ブロックごとに覚えておき、設定が変わったら作り直す ----
const shapeKey = pc => JSON.stringify([kindOf(pc), pc.planes, pc.pts, pc.depth, pc.bevel, pc.bevelSegs, pc.corner, pc.cornerSegs, pc.taper, pc.tiltY, pc.ridge, pc.segments, pc.side, pc.top, pc.tf, pc.mirror, pc.arrayCount, pc.arrayStep, pc.pos]);
const FINAL = new WeakMap();   // ブロック → { key, geo }
const STALE = new Set();       // 作り直して要らなくなった形（画面が付け替えた後で捨てる）
/** 作り直す前の形を捨てる（置いてあるメッシュを新しい形に付け替えた後で呼ぶ） */
export function disposeStale() { for (const g of STALE) g.dispose(); STALE.clear(); }
const CUT = new WeakMap();     // 引くブロック → { key, geos: 1 個ずつの形（パーツの座標）, box }
function cutterOf(pc) {
  const key = shapeKey(pc), c = CUT.get(pc);
  if (c?.key === key) return c;
  const p = pc.pos ?? [0, 0, 0];
  const geos = instances(pc).map(g => { g.translate(p[0], p[1], p[2]); g.computeBoundingBox(); return g; });
  for (const g of c?.geos ?? []) g.dispose();
  const out = { key, geos }; CUT.set(pc, out);
  return out;
}
/**
 * パーツ def のブロック pc の、できあがりの形（1 個ずつ：繰り返し・ミラーの写しごと）。「引く」ブロックは、自分より上に並ぶブロックを削る。
 * カタログのパーツ（自分のパーツでないもの）は、一度作ったらそのまま
 */
function finalOf(def, pc) {
  const c = FINAL.get(pc);
  if (c && !def.user) return c;
  const cutters = def.user ? cuttersOf(def, pc) : [];
  const key = def.user ? shapeKey(pc) + cutters.map(shapeKey).join('') : '';
  if (c?.key === key) return c;
  let insts;
  if (!cutters.length || isSub(pc)) insts = instances(pc);
  else {
    const p = pc.pos ?? [0, 0, 0], subs = cutters.flatMap(s => cutterOf(s).geos);
    insts = instances(pc).map(g => {
      g.translate(p[0], p[1], p[2]); g.computeBoundingBox();
      let brush = brushOf(g);
      for (const s of subs) {
        if (!g.boundingBox.intersectsBox(s.boundingBox)) continue;
        const next = csg().evaluate(brush, brushOf(s), SUBTRACTION);
        if (brush.geometry !== g) brush.geometry.dispose();
        brush = next;
      }
      const out = brush.geometry;
      if (out !== g) g.dispose();
      const r = out.index ? out.toNonIndexed() : out;
      return r.translate(-p[0], -p[1], -p[2]);
    });
  }
  if (c) { for (const g of c.insts) STALE.add(g); if (c.geo) STALE.add(c.geo); }
  const out = { key, insts, geo: null };
  FINAL.set(pc, out);
  return out;
}
/** できあがりの形（ブロックの座標 = パーツの座標から pos を引いたもの。置く側が pos を足す）。写しはまとめて 1 つ */
export function geoOf(def, pc) { const f = finalOf(def, pc); return (f.geo ??= merge(f.insts, true)); }
/** できあがりの形を、1 個ずつ（自由な部品：写しごとに付く骨が違う） */
export const instGeosOf = (def, pc) => finalOf(def, pc).insts;
/** ブロックそのものの形（削る前。引くブロックを薄く見せる・大きさを測る） */
export const soloGeo = pc => merge(instances(pc));
/** ブロックの範囲（パーツの座標。繰り返し・ミラーの写しは入れない） */
export function boxOf(pc) {
  const g = baseGeo(pc), p = pc.pos ?? [0, 0, 0];
  g.computeBoundingBox();
  const b = g.boundingBox.clone().translate(new THREE.Vector3(p[0], p[1], p[2]));
  g.dispose();
  return b;
}
/** ブロックの頂点（パーツの座標。同じ点は 1 つに。面で囲った形へ変えるとき用） */
export function pointsOf(pc) {
  const g = baseGeo(pc), a = g.attributes.position, p = pc.pos ?? [0, 0, 0], seen = new Map();
  for (let i = 0; i < a.count; i++) { const q = [a.getX(i) + p[0], a.getY(i) + p[1], a.getZ(i) + p[2]]; seen.set(q.map(v => Math.round(v * 1e4)).join(','), q); }
  g.dispose();
  return [...seen.values()];
}

// ---- ゲーム用の書き出し ----
const r5 = v => Math.round(v * 1e5) / 1e5;
/**
 * パーツ def → 書き出すブロックの並び [{ pc, shape }]（「引く」ブロックは入らない：削られた側の形に入っている）。
 * shape は機体エディタ（index.html）の部品の形の項目：
 *   そのままの凸の形   → { planes }（前と同じ。kind・bevel はブロックのもの）
 *   ほか（押し出し・回転体・削られた形・ミラー・繰り返し） → { kind: 'tri', tris, nors, trisLow }（三角形そのもの。trisLow は遠くの LOD 用：面取りなし・削らない）
 */
export function shapesOf(def) {
  return def.pieces.filter(drawn).map(pc => {
    if (isPlain(pc) && !(def.user && cuttersOf(def, pc).length)) return { pc, shape: { planes: pc.planes.map(p => p.slice()) } };
    const g = geoOf(def, pc), low = merge(instances(pc, 1));
    const shape = { kind: 'tri', planes: null, tris: Array.from(g.attributes.position.array, r5), nors: Array.from(g.attributes.normal.array, r5), trisLow: Array.from(low.attributes.position.array, r5),
      op: 'add', mirror: false, arrayCount: 1, bevel: 0, corner: 0, side: null, top: null };
    low.dispose();
    return { pc, shape };
  });
}
/** 自由な部品（freeparts.js）を動かして置いたときの書き出し：1 個ずつ（写しごと）の三角形 [{ pc, shape }] */
export function freeShapes(def) {
  return def.pieces.filter(drawn).flatMap(pc => {
    const low = instances(pc, 1);
    const out = instGeosOf(def, pc).map((g, k) => ({ pc, shape: { kind: 'tri', tris: Array.from(g.attributes.position.array, r5), nors: Array.from(g.attributes.normal.array, r5), trisLow: Array.from((low[k] ?? g).attributes.position.array, r5),
      op: 'add', mirror: false, arrayCount: 1, bevel: 0, corner: 0 } }));
    for (const g of low) g.dispose();
    return out;
  });
}
