// The game export and the two checks (connections, joints) of an XS, without any screen.
// Input: the parts of 機体エディタ's documents ({ name, kind, op, color, pos, rot, scl, pts / planes / tris / mesh, ... }: DEFAULTS below),
// or a unit of 機体エディタ Ver2 (applyUnit: unitparts.js turns it into such parts). Output: the skinned .glb the game loads
// (docs/models.md: the bones, three LODs, the material classes, the attachment points) and what the checks found.
// Used by 機体エディタ Ver2 (v2.js: ゲーム用に書き出す / チェックだけする) and, through engine.html, by tools/exportxs.ts and tools/bodyxs.ts.
// This code came out of 機体エディタ 1 (index.html) as it was — the same shapes, the same numbers (tools/_genengine.py copied it once).
// This file is now the source.
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { toCreasedNormals, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { Brush, Evaluator, SUBTRACTION, INTERSECTION } from 'three-bvh-csg';
import { MeshBVH } from 'three-mesh-bvh';
import { buildHull, hullReach } from './hull.js';
import { hull2, pushAngle } from './skirtpush.js';
import { doubleJoint, ELBOW_AXES, KNEE_AXES, BEND } from './doublejoint.js';
import { MESHES, ensureMeshes, applyJoints, meshGeometry, IMPORT_BONES } from './meshparts.js';
import { registerUnit, unitParts } from './unitparts.js';
import { bodyParts, register, byId } from './bodyparts.js';

const deg = THREE.MathUtils.degToRad;

// ---------- parts ----------
const rect = (w, h) => [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]];
const DEFAULTS = {
  name: '部品', kind: 'extrude', op: 'add', color: '#c3c9d2', mirror: false,
  pts: rect(0.8, 0.8), depth: 0.4, bevel: 0.04, bevelSegs: 1, corner: 0, cornerSegs: 1, taper: 1, tiltY: 0, ridge: 0,
  segments: 24, arrayCount: 1, arrayStep: [0, 0.15, 0], metal: 0.55, rough: 0.38, blockout: false, bone: 'auto', team: false, glow: null, pivot: 'auto',
  noHit: false,            // not counted in the joint check's cutting-in (power pipes, lights)
  orb: null,               // a part of an orb (ORB) from the body generator: { i: its number, size: 's' | 'm' | 'l', len, dock: [x, y, z] its dock in the part's frame }
  noHeight: false,         // not counted in the XS's height (wings and back gear that rise above the head)
  gun: null,               // a hand weapon the game hides for melee: true / false, null = by its name
  opacity: null,           // a see-through part (lights from the body generator): 0..1, null = solid
  pos: [0, 0, 0], rot: [0, 0, 0], scl: [1, 1, 1],
  side: null, top: null,   // extrude only: outlines seen from the side [[z, y], ...] and from above [[x, z], ...]; null = none
  planes: null,            // kind 'hull' only: the planes of a convex solid [[nx, ny, nz, d, bevel?], ...] (hull.js); n·p ≤ d is kept
  mesh: null,              // kind 'mesh' only: the id of an imported mesh (IndexedDB), shown instead of an outline
  tris: null, nors: null,  // kind 'tri' only: the triangles themselves (positions and normals, 9 numbers a triangle), from 機体エディタ Ver2's
  trisLow: null,           //     parts editor (pushed-out / turned / cut blocks: partgeo.js); trisLow: the plainer shape for the far LODs
  joint: null,             // imported meshes: where the bone this part rides on turns, in the part's own frame
  rig: null,               // a skinned imported mesh: { bone name: [x, y, z] } where each bone turns, in the part's frame
  joints: null,            // an imported mesh cut by joint spheres: { joint: { p: [x, y, z], r } } in the part's frame
  regions: null,           // ... and the pieces given to a bone by hand: [{ bone, lassos: [{ view, pts: [[u, v]] }], subs, picks, unpicks, skip }]
                           //     (picks / unpicks: plates clicked, [{ p, n, a }]: the point, the face's normal, the crease angle)
                           //     (a lasso goes right through its view; subs: lassos cut out; skip: leave what earlier regions took)
  wings: null,             // ... whether it has wing joints
  fromBones: null,         // ... imported with bones of its own: their weights are what is not given by hand (not the spheres)
  mid: null,               // ... and the x of its centre line (left and right spheres mirror about it; none = 0)
};
const FIELDS = Object.keys(DEFAULTS);


let parts = [];
let sceneAi = '';     // the AI the model was made with ('' = not recorded); kept with the document
let sceneRole = '';   // what the XS is for (raid / heavy / ...): decides the moves the joint check plays
let nextId = 1;

function makePart(data) {
  const p = { id: nextId++ };
  for (const k of FIELDS) p[k] = structuredClone(data[k] ?? DEFAULTS[k]);
  p.proxy = new THREE.Object3D();   // where the part is (position, rotation, scale)
  p.proxy.position.fromArray(p.pos);
  p.proxy.rotation.set(...p.rot);
  p.proxy.scale.fromArray(p.scl);
  return p;
}
function serialize(p) {
  const out = {};
  for (const k of FIELDS) out[k] = structuredClone(p[k]);
  out.pos = p.proxy.position.toArray();
  out.rot = [p.proxy.rotation.x, p.proxy.rotation.y, p.proxy.rotation.z];
  out.scl = p.proxy.scale.toArray();
  return out;
}
const getPart = id => parts.find(p => p.id === id);

// ---------- geometry ----------
// 2D profile corners: replace each vertex by a chamfer (segs=1) or a rounded arc (segs>1)
function roundCorners(pts, r, segs, closed) {
  if (r <= 0) return pts.map(p => p.slice());
  const n = pts.length, out = [];
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    if (!closed && (i === 0 || i === n - 1)) { out.push(p.slice()); continue; }
    const a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
    const v1 = [a[0] - p[0], a[1] - p[1]], v2 = [b[0] - p[0], b[1] - p[1]];
    const l1 = Math.hypot(...v1), l2 = Math.hypot(...v2);
    const d = Math.min(r, l1 * 0.45, l2 * 0.45);
    if (d < 1e-4) { out.push(p.slice()); continue; }
    const s = [p[0] + v1[0] / l1 * d, p[1] + v1[1] / l1 * d];
    const e = [p[0] + v2[0] / l2 * d, p[1] + v2[1] / l2 * d];
    for (let k = 0; k <= segs; k++) {
      const t = k / segs, u = 1 - t;
      out.push([u * u * s[0] + 2 * u * t * p[0] + t * t * e[0], u * u * s[1] + 2 * u * t * p[1] + t * t * e[1]]);
    }
  }
  return out;
}

function signedArea(loop) {
  let a = 0;
  for (let i = 0; i < loop.length; i++) {
    const p = loop[i], q = loop[(i + 1) % loop.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

// closed silhouette of a lathe profile (right half, including the axis)
function latheLoop(p) {
  const pts = roundCorners(p.pts.map(([x, y]) => [Math.max(0, x), y]), p.corner, p.cornerSegs, false);
  let loop = [[0, pts[0][1]], ...pts, [0, pts[pts.length - 1][1]]];
  loop = loop.filter((v, i) => i === 0 || Math.hypot(v[0] - loop[i - 1][0], v[1] - loop[i - 1][1]) > 1e-6);
  if (signedArea(loop) < 0) loop.reverse();
  return loop;
}

function buildLocalGeometry(p) {
  if (p.kind === 'mesh') return meshGeometry(p);
  const key = p.kind === 'tri' ? `tri${p.tris?.length ?? 0}${p._lod ? 'L' : ''}` : JSON.stringify([p.kind, p.pts, p.depth, p.bevel, p.bevelSegs, p.corner, p.cornerSegs, p.taper, p.tiltY, p.ridge, p.segments, p.side, p.top, p.planes]);
  if (p._geoKey === key) return p._geo;
  let g;
  if (p.kind === 'tri') {   // triangles as they are (Ver2's parts editor made the shape: partgeo.js)
    const low = p._lod && p.trisLow;
    g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(low || p.tris || [], 3));
    if (!low && p.nors?.length === p.tris?.length) g.setAttribute('normal', new THREE.Float32BufferAttribute(p.nors, 3)); else g.computeVertexNormals();
    p._geo?.dispose();
    p._geo = g; p._geoKey = key;
    return g;
  }
  if (p.kind === 'hull') {   // a convex solid cut out by its planes, its edges bevelled (hull.js)
    const h = buildHull(p.planes ?? [], { bevel: p.bevel, bevelSegs: p.bevelSegs, reach: hullReach(p.planes ?? []) });
    g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(h.positions, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(h.normals, 3));
    p._geo?.dispose();
    p._geo = g; p._geoKey = key;
    return g;
  }
  if (p.kind === 'extrude') {
    const pts = roundCorners(p.pts, p.corner, p.cornerSegs, true);
    const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
    const b = Math.min(p.bevel, p.depth * 0.45);
    const inner = Math.max(0.001, p.depth - 2 * b);
    g = new THREE.ExtrudeGeometry(shape, {
      depth: inner, curveSegments: 1,
      bevelEnabled: b > 0.0005, bevelThickness: b, bevelSize: b, bevelOffset: -b, bevelSegments: p.bevelSegs,
    });
    g.translate(0, 0, -inner / 2);
    if (p.taper !== 1) {
      const pos = g.attributes.position, half = p.depth / 2;
      for (let i = 0; i < pos.count; i++) {
        const t = (pos.getZ(i) + half) / p.depth;
        const s = 1 + (p.taper - 1) * t;
        pos.setXY(i, pos.getX(i) * s, pos.getY(i) * s);
      }
    }
    // Angle the faces: thickness varies with height (tiltY) and shrinks away from the centre line (ridge),
    // so the front becomes sloped and/or folded into two planes. Rates are per unit of local x/y, which lets
    // a plate with the same pos/tiltY/ridge and a slightly larger depth sit flush on the sloped surface.
    if (p.tiltY || p.ridge) {
      const pos = g.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const k = Math.max(0.05, 1 + p.tiltY * pos.getY(i) - p.ridge * Math.abs(pos.getX(i)));
        pos.setZ(i, pos.getZ(i) * k);
      }
    }
    if (p.side || p.top) g = carve(g, p);
  } else {
    g = new THREE.LatheGeometry(latheLoop(p).map(([x, y]) => new THREE.Vector2(x, y)), p.segments);
  }
  g.deleteAttribute('uv');
  g = toCreasedNormals(g, deg(35));
  p._geo?.dispose();
  p._geo = g; p._geoKey = key;
  return g;
}

// The side and top outlines: of the part pushed out from its front outline, keep only what also lies inside the
// side outline (pushed out across x) and the top outline (pushed out up and down). Three views of one solid.
const SIDE_TURN = new THREE.Matrix4().makeRotationY(-Math.PI / 2);   // outline x -> local z, extruded along x
const TOP_TURN = new THREE.Matrix4().makeRotationX(Math.PI / 2);     // outline y -> local z, extruded along y
let carveEval = null;
function carve(g, p) {
  carveEval ??= Object.assign(new Evaluator(), { attributes: ['position', 'normal'], useGroups: false });
  g.deleteAttribute('uv'); g.clearGroups();
  g.computeBoundingBox();
  const reach = g.boundingBox.getSize(new THREE.Vector3()).length() + 1;
  let brush = new Brush(g); brush.updateMatrixWorld();
  for (const [pts, turn] of [[p.side, SIDE_TURN], [p.top, TOP_TURN]]) {
    if (!Array.isArray(pts) || pts.length < 3) continue;
    const loop = roundCorners(pts, p.corner, p.cornerSegs, true);
    const prism = new THREE.ExtrudeGeometry(new THREE.Shape(loop.map(([a, b]) => new THREE.Vector2(a, b))), { depth: 2 * reach, bevelEnabled: false, curveSegments: 1 });
    prism.translate(0, 0, -reach).applyMatrix4(turn);
    prism.deleteAttribute('uv'); prism.clearGroups();
    const cut = new Brush(prism); cut.updateMatrixWorld();
    const next = carveEval.evaluate(brush, cut, INTERSECTION);
    prism.dispose();
    if (!next.geometry.attributes.position?.count) { next.geometry.dispose(); continue; }   // no overlap: leave the part whole
    if (brush.geometry !== g) brush.geometry.dispose();
    brush = next;
  }
  if (brush.geometry !== g) g.dispose();
  return brush.geometry;
}

function flipWinding(g) {
  for (const name of ['position', 'normal']) {
    const a = g.attributes[name].array;
    for (let i = 0; i < a.length; i += 9)
      for (let k = 0; k < 3; k++) { const t = a[i + 3 + k]; a[i + 3 + k] = a[i + 6 + k]; a[i + 6 + k] = t; }
  }
}

const MIRROR = new THREE.Matrix4().makeScale(-1, 1, 1);
function worldGeometries(p) {
  const base = buildLocalGeometry(p);
  p.proxy.updateMatrixWorld();
  const mats = [];
  for (let k = 0; k < Math.max(1, p.arrayCount); k++) {
    const m = new THREE.Matrix4().makeTranslation(p.arrayStep[0] * k, p.arrayStep[1] * k, p.arrayStep[2] * k).multiply(p.proxy.matrixWorld);
    mats.push(m);
    if (p.mirror) mats.push(MIRROR.clone().multiply(m));
  }
  return mats.map(m => {
    const g = base.clone().applyMatrix4(m);
    if (m.determinant() < 0) flipWinding(g);
    g.computeBoundingBox();
    return g;
  });
}

// ---------- the solid shapes: every part in place, the cutting parts taken out of the parts listed above them ----------
const evaluator = Object.assign(new Evaluator(), { attributes: ['position', 'normal'], useGroups: false });
const resultGroup = new THREE.Group();   // one mesh for every copy of every solid part (userData.partId)
let cutters = [];
function rebuild() {
  for (const o of [...resultGroup.children]) { o.geometry?.dispose(); resultGroup.remove(o); }
  for (const b of cutters) b.geometry.dispose();
  cutters = [];
  // a cutting part only cuts the parts listed above it, so later parts (eyes in a recess) survive
  for (const p of parts.filter(p => p.op === 'sub' && !p.blockout)) for (const g of worldGeometries(p)) {
    const b = new Brush(g); b.updateMatrixWorld();
    b.userData.order = parts.indexOf(p); cutters.push(b);
  }
  for (const p of parts.filter(p => p.op === 'add' && !p.blockout)) for (const g of worldGeometries(p)) {
    let geo = g;
    if (p.kind !== 'mesh') {   // (an imported mesh is never cut)
      let brush = new Brush(g); brush.updateMatrixWorld();
      for (const sb of cutters) {
        if (sb.userData.order < parts.indexOf(p)) continue;
        if (!g.boundingBox.intersectsBox(sb.geometry.boundingBox)) continue;
        const next = evaluator.evaluate(brush, sb, SUBTRACTION);
        if (brush.geometry !== g) brush.geometry.dispose();
        brush = next;
      }
      if (brush.geometry !== g) g.dispose();
      geo = brush.geometry;
    }
    const mesh = new THREE.Mesh(geo);
    mesh.userData.partId = p.id;
    resultGroup.add(mesh);
  }
}

// ---------- connectivity check ----------
// Two parts are connected when their surfaces intersect or come within TOUCH of each other.
// Everything reachable from the largest cluster is the body; anything else is floating.
const TOUCH = 0.004;
function checkConnections() {
  rebuild();
  return connectivity(resultGroup.children.filter(o => o.isMesh && !isLight(getPart(o.userData.partId))).map(m => ({ m, g: m.geometry, id: m.userData.partId })));   // lights hang in the air
}
// items: [{ g: world geometry, id: part id, ... }] -> { total, floating: [{ members, gap, near }] }
function connectivity(list) {
  const I = new THREE.Matrix4(), v = new THREE.Vector3(), hit = { point: new THREE.Vector3() };
  const items = list.map(it => {
    const g = it.g;
    g.computeBoundingBox();
    const cx = (g.boundingBox.min.x + g.boundingBox.max.x) / 2;
    return { ...it, bvh: new MeshBVH(g), side: cx > 0.02 ? '右' : cx < -0.02 ? '左' : '' };
  });
  const vertDist = (a, b) => {
    const pos = a.g.attributes.position, step = Math.max(1, Math.floor(pos.count / 400));
    let best = Infinity;
    for (let i = 0; i < pos.count; i += step) {
      v.fromBufferAttribute(pos, i);
      if (b.g.boundingBox.distanceToPoint(v) > best) continue;
      const r = b.bvh.closestPointToPoint(v, hit, 0, best);
      if (r && r.distance < best) { best = r.distance; if (best <= TOUCH) break; }
    }
    return best;
  };
  const gap = (a, b) => a.bvh.intersectsGeometry(b.g, I) ? 0 : Math.min(vertDist(a, b), vertDist(b, a));
  const n = items.length, adj = items.map(() => []), gaps = [];
  for (let a = 0; a < n; a++) {
    const near = items[a].g.boundingBox.clone().expandByScalar(0.05);
    for (let b = a + 1; b < n; b++) {
      if (!near.intersectsBox(items[b].g.boundingBox)) continue;
      const d = gap(items[a], items[b]);
      if (d <= TOUCH) { adj[a].push(b); adj[b].push(a); } else gaps.push([a, b, d]);
    }
  }
  const comp = new Array(n).fill(-1);
  let count = 0;
  for (let s = 0; s < n; s++) {
    if (comp[s] >= 0) continue;
    const stack = [s]; comp[s] = count;
    while (stack.length) { const u = stack.pop(); for (const w of adj[u]) if (comp[w] < 0) { comp[w] = count; stack.push(w); } }
    count++;
  }
  const groups = [];
  comp.forEach((c, k) => (groups[c] ||= []).push(k));
  groups.sort((x, y) => y.length - x.length);
  const body = new Set(groups[0] || []);
  const floating = groups.slice(1).map(g => {
    let best = null;
    for (const [a, b, d] of gaps) {
      const inA = g.includes(a), inB = g.includes(b);
      if ((inA && body.has(b)) || (inB && body.has(a))) if (!best || d < best.d) best = { d, near: items[inA ? b : a] };
    }
    return { members: g.map(k => items[k]), gap: best?.d, near: best?.near };
  });
  return { total: n, floating };
}

// ---------- export for the game (docs/models.md) ----------
// One skeleton with the bones the game drives; every part is bound rigidly (weight 1) to one bone.
// Geometry is merged per material class so LOD0 stays within the draw-call budget, and LOD1/LOD2 are
// generated by simplifying and then boxing the parts. The parts face +Z; the game faces -Z with the
// sole at y = 0, so everything is turned 180° about Y and dropped onto the ground.
const GAME_LIMITS = { tris: [30000, 5000, 800], drawCalls: 5 };
const BONE_CHOICES = { auto: '自動（部品名から）', head: '頭', torso: '胴', hips: '腰', arm: '腕（肩〜ひじ）', elbow: 'ひじの節（2 重関節）', fore: '前腕・手', leg: '太もも', knee: 'ひざの節（2 重関節）', shin: 'すね', foot: '足（足首から下）', cannon: '大砲の砲身' , wing: '翼（背中・ゲームが開く）', skirt: 'スカート（腰の蝶番・脚に押されて開く）' };
// first match wins; the order keeps e.g. 「ウイングの腕」 on the torso and 「肩の付け根」 on the chest
const BONE_RULES = [
  ['hips', /キャタピラ|履帯|車体|転輪|起動輪|誘導輪/],
  ['torso', /ウイング|付け根|バックパック|フィン|ロッド|背中|レーダー|ミサイル|ブースター/],
  ['head', /頭|^首|目|バイザー|トサカ|顔|ヘルメット|ほほ|耳|カメラ|アンテナ|額/],   // ^首: not 足首 / 手首
  ['shin', /すね|ふくらはぎ|ひざ|足首/],          // 足首（アーマー・カバー）: on the shin, the foot turns under it
  ['foot', /足|つま先|かかと|靴底/],
  ['leg', /太もも|股関節/],
  ['fore', /前腕|手|指|ライフル|銃|マガジン|マズル|パイル|杭|シールド|バズーカ/],
  ['arm', /肩|腕|ひじ/],
  ['hips', /腰|股|スカート/],
];
const GLOW_RE = /目|センサー|バイザー|アイ/;
// hand weapons go to the `gun` node, which the game hides during saber and knife cuts, throws and the bazooka
const GUN_RE = /ライフル|銃|マガジン|マズル/;
const isGun = p => p.gun ?? GUN_RE.test(p.name);
// the bazooka goes to the `bazooka` node, which the game shows only while a bazooka is selected (the gun is hidden then)
const BAZOOKA_RE = /バズーカ/;
const isBazooka = p => BAZOOKA_RE.test(p.name);
const isHeld = p => isGun(p) || isBazooka(p);   // hand weapons the game hides for melee and throws
const JOINT_PARENT = { arm: 'torso', fore: 'arm', leg: 'hips', shin: 'leg', foot: 'shin', head: 'torso', torso: 'hips', cannon: 'torso', wing: 'torso', skirt: 'hips' };
// Tracked XS (artillery, docs/models.md「キャタピラの XS」): a part named キャタピラ makes the model tracked. It has no
// leg bones (leg and shin parts go on the hips with the chassis), its belts are exported as track_l / track_r with a
// tread texture the game scrolls along U. On any XS (tracked or on legs) the barrels of 大砲 / キャノン / 砲身 turn on a
// `cannon` node the game raises about x (the mortar) and shoves along the barrels (recoil, the barrel ram).
const TRACK_RE = /キャタピラ|履帯/;
const isBelt = p => TRACK_RE.test(p.name) && !/輪|ローラー|フェンダー|カバー|枠|フレーム|スカート/.test(p.name);
const isTracked = () => parts.some(p => p.op === 'add' && !p.blockout && TRACK_RE.test(p.name));
const CANNON_RE = /大砲|キャノン|砲身/;
const boneGroupOf = p => {
  let g = 'torso';
  const pv = typeof pivotOf === 'function' ? pivotOf(p) : null;   // a joint stays on the side that doesn't turn
  if (p.bone && p.bone !== 'auto') g = p.bone;
  else if (pv) g = JOINT_PARENT[pv];
  else if (CANNON_RE.test(p.name) && !GUN_RE.test(p.name)) g = 'cannon';   // a rifle's barrel stays with the gun
  else for (const [k, re] of BONE_RULES) if (re.test(p.name)) { g = k; break; }
  return isTracked() && (g === 'leg' || g === 'knee' || g === 'shin' || g === 'foot') ? 'hips' : g;
};
const isGlow = p => p.glow ?? GLOW_RE.test(p.name);
// a light (the body generator's effects): glows, takes no hits, is not joined to the body
const isLight = p => !!p && !!p.noHit && p.glow === true;
// editor +X is the XS's left (it faces +Z), so after the 180° turn it lands on the game's -X = left
// a skirt plate goes on skirt_front_* in front of the hips (+Z) and skirt_back_* behind them
const sided = (group, cx, cz = 0) => group === 'skirt' ? `skirt_${cz >= 0 ? 'front' : 'back'}_${cx >= 0 ? 'l' : 'r'}`
  : ['arm', 'elbow', 'leg', 'knee', 'shin', 'foot', 'fore', 'wing'].includes(group) ? `${group === 'fore' ? 'forearm' : group}_${cx >= 0 ? 'l' : 'r'}` : group;
const GAME_BONES = [['hips', null], ['torso', 'hips'], ['head', 'torso'], ['arm_l', 'torso'], ['arm_r', 'torso'],
  ['leg_l', 'hips'], ['knee_l', 'leg_l'], ['shin_l', 'leg_l'], ['leg_r', 'hips'], ['knee_r', 'leg_r'], ['shin_r', 'leg_r'],   // knee_*: the link of a double knee (below)
  ['foot_l', 'shin_l'], ['foot_r', 'shin_r'],         // ankles: the game keeps the soles level with the ground (only exported when a part is on them)
  ['elbow_l', 'arm_l'], ['elbow_r', 'arm_r'],       // the link of a double elbow (only exported when a part is on it)
  ['forearm_l', 'arm_l'], ['forearm_r', 'arm_r'],   // elbows: extra bones the spec allows
  ['cannon', 'torso'],                                // tracked XS: the cannon mount (only exported when it carries barrels)
  ['wing_l', 'torso'], ['wing_r', 'torso'],           // wings the game opens with the thrust (only exported when used)
  ['skirt_front_l', 'hips'], ['skirt_front_r', 'hips'], ['skirt_back_l', 'hips'], ['skirt_back_r', 'hips']];   // skirts the legs push open (docs/models.md「スカート」)
const SKIRT_BONES = ['skirt_front_l', 'skirt_front_r', 'skirt_back_l', 'skirt_back_r'];
const OPTIONAL_BONES = new Set(['foot_l', 'foot_r', 'elbow_l', 'elbow_r', 'knee_l', 'knee_r', 'cannon', 'wing_l', 'wing_r', ...SKIRT_BONES]);
// Double joints (doublejoint.js, docs/models.md「2 重関節」): a link (elbow_* / knee_*) between the upper and the lower
// part. The link turns about its own bone (the upper axis), the lower part (forearm_* / shin_*) about its bone (the
// lower axis). The game turns the lower bone as ever; up to `first` only the lower axis bends, past it the link turns
// by the rest and carries the lower bone with it. [lower bone group]: [link, first (rad), the side it folds to]
const LINKS = { forearm: ['elbow', ELBOW_AXES[2], BEND.elbow], shin: ['knee', KNEE_AXES[2], BEND.knee] };

function materialClass(p) {
  if (p.kind === 'mesh') return 'skin:' + (MESHES.get(p.mesh)?.texId ?? '');
  if (p.team) return 'team';
  if (isGlow(p)) return 'glow';
  if (p.metal >= 0.7) return 'metal';
  return 'body';
}

// meshes of one LOD: [{ geo (world, non-indexed), part, bone }]
function lodPieces(level) {
  const out = [];
  const addParts = (geos, p) => {
    for (const g of geos) {
      g.computeBoundingBox();
      const cx = (g.boundingBox.min.x + g.boundingBox.max.x) / 2, cz = (g.boundingBox.min.z + g.boundingBox.max.z) / 2;
      const geo = g.index ? g.toNonIndexed() : g;   // imported meshes are indexed
      geo.computeBoundingBox();
      out.push({ geo, part: p, bone: sided(boneGroupOf(p), cx, cz), orb: p.orb ? 'orb_' + p.orb.i : null });
    }
  };
  const solid = parts.filter(p => p.op === 'add' && !p.blockout);
  if (level === 0) {
    rebuild();
    for (const m of resultGroup.children) if (m.isMesh) {
      const p = getPart(m.userData.partId);
      addParts([restGeometry(m, true)], p);
    }
    return out;
  }
  // LOD1: no cuts, no bevels, coarse lathes; drop the smallest parts until it fits
  const simple = p => ({ ...p, bevel: 0, bevelSegs: 1, cornerSegs: 1, corner: Math.min(p.corner, 0.01), segments: Math.min(p.segments, 8), _geo: null, _geoKey: null, _lod: 1 });
  const all = solid.flatMap(p => worldGeometries(simple(p)).map(g => ({ g, p })));
  const diag = g => { g.computeBoundingBox(); return g.boundingBox.getSize(new THREE.Vector3()).length(); };
  all.sort((a, b) => diag(b.g) - diag(a.g));
  if (level === 1) {
    let tris = 0;
    for (const { g, p } of all) {
      const t = (g.index ? g.index.count : g.attributes.position.count) / 3;   // an imported mesh is indexed
      if (tris + t > GAME_LIMITS.tris[1] * 0.95) continue;
      tris += t; addParts([g], p);
    }
    return out;
  }
  // LOD2: the largest parts as boxes (12 triangles each)
  const maxBoxes = Math.floor(GAME_LIMITS.tris[2] * 0.95 / 12);
  for (const { g, p } of all.slice(0, maxBoxes)) {
    const b = g.boundingBox, s = b.getSize(new THREE.Vector3()), c = b.getCenter(new THREE.Vector3());
    const box = new THREE.BoxGeometry(Math.max(s.x, 0.01), Math.max(s.y, 0.01), Math.max(s.z, 0.01)).translate(c.x, c.y, c.z).toNonIndexed();
    box.deleteAttribute('uv');
    addParts([box], p);
  }
  return out;
}

// joint positions (editor space) from the bounding boxes of what each bone carries
function jointPositions(pieces) {
  const boxes = {};
  for (const pc of pieces) (boxes[pc.bone] ||= new THREE.Box3()).union(pc.geo.boundingBox);
  const B = n => boxes[n] || null;
  const whole = new THREE.Box3(); Object.values(boxes).forEach(b => whole.union(b));
  // parts marked 全高に数えない (the body generator's wings and back gear) may rise above the head without making the body
  // smaller in the game: the XS's height is that of the rest (the export writes it into the model; client/src/models.ts scales by it)
  whole.userData = { top: whole.max.y };
  const counted = new THREE.Box3(); for (const pc of pieces) if (!pc.part.noHeight) counted.union(pc.geo.boundingBox);
  if (!counted.isEmpty() && counted.max.y < whole.max.y) whole.max.y = counted.max.y;
  const H = whole.max.y - whole.min.y;
  const at = {};
  const legTop = Math.max(B('leg_l')?.max.y ?? -Infinity, B('leg_r')?.max.y ?? -Infinity);
  at.hips = new THREE.Vector3(0, isFinite(legTop) ? legTop - 0.03 * H : B('hips')?.getCenter(new THREE.Vector3()).y ?? whole.min.y + 0.5 * H, B('hips')?.getCenter(new THREE.Vector3()).z ?? 0);
  at.torso = new THREE.Vector3(0, B('torso')?.min.y ?? at.hips.y + 0.05 * H, B('torso')?.getCenter(new THREE.Vector3()).z ?? 0);
  at.head = new THREE.Vector3(0, B('head')?.min.y ?? whole.max.y - 0.1 * H, B('head')?.getCenter(new THREE.Vector3()).z ?? 0);
  for (const s of ['l', 'r']) {
    const sign = s === 'l' ? 1 : -1;
    const a = B('arm_' + s), l = B('leg_' + s), k = B('shin_' + s);
    at['arm_' + s] = a ? new THREE.Vector3(sign * (Math.min(Math.abs(a.min.x), Math.abs(a.max.x)) + 0.15 * (a.max.x - a.min.x)), a.max.y - 0.18 * (a.max.y - a.min.y), a.getCenter(new THREE.Vector3()).z)
      : new THREE.Vector3(sign * 0.25 * H, at.head.y - 0.1 * H, 0);
    at['leg_' + s] = l ? new THREE.Vector3(l.getCenter(new THREE.Vector3()).x, l.max.y - 0.05 * (l.max.y - l.min.y), l.getCenter(new THREE.Vector3()).z)
      : new THREE.Vector3(sign * 0.08 * H, at.hips.y, 0);
    at['shin_' + s] = k ? new THREE.Vector3(k.getCenter(new THREE.Vector3()).x, k.max.y - 0.08 * (k.max.y - k.min.y), k.getCenter(new THREE.Vector3()).z)
      : new THREE.Vector3(at['leg_' + s].x, at['leg_' + s].y - 0.25 * H, 0);
    // the ankle: on top of the foot, a third of its length from the heel (unless a part named 足首 says where)
    const ft = B('foot_' + s);
    at['foot_' + s] = ft ? new THREE.Vector3(ft.getCenter(new THREE.Vector3()).x, ft.max.y, ft.min.z + 0.35 * (ft.max.z - ft.min.z))
      : new THREE.Vector3(at['shin_' + s].x, whole.min.y + 0.035 * H, at['shin_' + s].z);
    const f = B('forearm_' + s);
    at['forearm_' + s] = f ? new THREE.Vector3(f.getCenter(new THREE.Vector3()).x, f.max.y, f.getCenter(new THREE.Vector3()).z)
      : at['arm_' + s].clone().add(new THREE.Vector3(0, -0.18 * H, 0));
  }
  // the cannon turns about the back end of its barrels (unless a mount part says where)
  const cb = B('cannon');
  at.cannon = cb ? new THREE.Vector3(0, cb.getCenter(new THREE.Vector3()).y, cb.min.z) : at.torso.clone();
  // a wing turns at its root: the inner, upper, front corner of what it carries
  for (const s of ['l', 'r']) {
    const w = B('wing_' + s), sign = s === 'l' ? 1 : -1;
    at['wing_' + s] = w ? new THREE.Vector3(sign * Math.min(Math.abs(w.min.x), Math.abs(w.max.x)), w.max.y - 0.15 * (w.max.y - w.min.y), w.max.z) : at.torso.clone();
  }
  // a skirt turns at its top edge on the body's side (unless a hinge part says where)
  for (const n of SKIRT_BONES) {
    const b = B(n);
    at[n] = b ? new THREE.Vector3(b.getCenter(new THREE.Vector3()).x, b.max.y, n.includes('front') ? b.min.z : b.max.z) : at.hips.clone();
  }
  // joint parts win: their centre is the pivot
  const found = {}, tracked = isTracked();
  for (const pc of pieces) {
    const g = pivotOf(pc.part);
    if (!g || (tracked && (g === 'leg' || g === 'shin' || g === 'foot'))) continue;
    const c = pc.geo.boundingBox.getCenter(new THREE.Vector3());
    const name = sided(g, c.x, c.z);
    (found[name] ||= []).push(c);
  }
  for (const [name, list] of Object.entries(found)) at[name] = list.reduce((a, b) => a.add(b), new THREE.Vector3()).multiplyScalar(1 / list.length);
  if (found.leg_l && found.leg_r) at.hips = new THREE.Vector3(0, (at.leg_l.y + at.leg_r.y) / 2, (at.leg_l.z + at.leg_r.z) / 2);
  // imported meshes carry the pivot they were cut at (moved with the part), so the bones bend where the cuts are
  const cut = {};
  for (const pc of pieces) {
    const p = pc.part;
    if (!Array.isArray(p.joint) || p.mirror || cut[pc.bone]) continue;
    p.proxy.updateMatrixWorld();
    at[pc.bone] = cut[pc.bone] = new THREE.Vector3(...p.joint).applyMatrix4(p.proxy.matrixWorld);
  }
  if (cut.leg_l && cut.leg_r) at.hips = new THREE.Vector3(0, (cut.leg_l.y + cut.leg_r.y) / 2, (cut.leg_l.z + cut.leg_r.z) / 2);
  // a link (double joint) without a point of its own: a little above its lower bone
  for (const s of ['l', 'r']) for (const [link, low, d] of [['elbow', 'forearm', 0.1], ['knee', 'shin', 0.2]])
    if (boxes[`${link}_${s}`] && !cut[`${link}_${s}`]) at[`${link}_${s}`] = at[`${low}_${s}`].clone().add(new THREE.Vector3(0, d * H / 3, 0));
  // a skinned import: its rig says where every bone turns
  const rigged = pieces.find(pc => pc.part.rig && !pc.part.mirror)?.part;
  if (rigged) {
    rigged.proxy.updateMatrixWorld();
    for (const [name, p] of Object.entries(rigged.rig)) at[name] = new THREE.Vector3(...p).applyMatrix4(rigged.proxy.matrixWorld);
  }
  return { at, whole };
}

// attachment points (editor space) found from part names; each rides on the bone of the part it comes from
function attachPoints(pieces) {
  const find = (re, bone, pick) => {
    const cand = pieces.filter(pc => re.test(pc.part.name) && (!bone || pc.bone === bone));
    if (!cand.length) return null;
    const pc = pick ? cand.sort(pick)[0] : cand[0];
    const box = new THREE.Box3();
    cand.filter(c => c.part === pc.part && c.bone === pc.bone).forEach(c => box.union(c.geo.boundingBox));
    return { pos: box.getCenter(new THREE.Vector3()), bone: pc.bone };
  };
  const out = {};
  out.hand_r = find(/^手$|^手の甲$/, 'forearm_r') || find(/手/, 'forearm_r');
  // a skinned import: its right hand is in its rig
  const rigged = pieces.find(pc => pc.part.rig?.hand_r)?.part;
  if (!out.hand_r && rigged) { rigged.proxy.updateMatrixWorld(); out.hand_r = { pos: new THREE.Vector3(...rigged.rig.hand_r).applyMatrix4(rigged.proxy.matrixWorld), bone: 'forearm_r' }; }
  out.muzzle = find(/マズル|銃口/, null);
  // (the body generator's nozzles are hulls named 噴射口)
  const nozzle = p => (/スラスター|ブースター|バーニア/.test(p.name) && p.kind === 'lathe') || (p.kind === 'hull' && /噴射口/.test(p.name) && !/噴射口の(台|奥)/.test(p.name));
  const thr = s => pieces.filter(pc => nozzle(pc.part) && pc.bone === 'torso'
    && (s === 'l' ? pc.geo.boundingBox.max.x > 0.02 : pc.geo.boundingBox.min.x < -0.02))
    .sort((a, b) => Math.abs(a.geo.boundingBox.getCenter(new THREE.Vector3()).x) - Math.abs(b.geo.boundingBox.getCenter(new THREE.Vector3()).x))[0];
  for (const s of ['l', 'r']) { const t = thr(s); if (t) out['thruster_' + s] = { pos: t.geo.boundingBox.getCenter(new THREE.Vector3()), bone: 'torso' }; }
  return out;
}

// ---------- joints: pivots, game poses and the range check ----------
// Game poses (client/src/models.ts, client/src/saberpose.ts, the standing upper-body twist), as game-space Euler
// rotations (YXZ) of each bone, plus the hips' drop in game metres. They include the ends of every joint's range.
const POSES = {
  待機: {},
  構え: { arm_r: { x: 1.45 }, arm_l: { x: 1.3, z: 0.45 } },
  歩き: { leg_l: { x: 0.5 }, leg_r: { x: -0.5 }, shin_r: { x: -0.6 }, arm_r: { x: 0.4 }, arm_l: { x: -0.3 } },
  ダッシュ: { torso: { x: -0.3 }, leg_l: { x: 0.55 }, shin_l: { x: -1.1 }, leg_r: { x: -0.15 }, shin_r: { x: -0.6 }, arm_l: { x: 0.2, z: -0.45 }, arm_r: { x: -0.3 } },
  投げ: { arm_r: { x: 3.8, z: 0.15 }, torso: { x: 0.2 } },
  しゃがみ: { leg_l: { x: 0.9 }, leg_r: { x: 0.9 }, shin_l: { x: -1.5 }, shin_r: { x: -1.5 }, torso: { x: -0.2 }, hips: { dy: -1.8 } },
  ひねり左: { torso: { y: 1.5 } },
  ひねり右: { torso: { y: -1.5 } },
  脚の端: { leg_l: { x: 1.12 }, shin_l: { x: -2.04 }, leg_r: { x: -0.55 } },
  腕の後ろ: { arm_r: { x: -0.8 }, arm_l: { x: -0.5, z: -0.25 } },
  ひじ曲げ: { forearm_r: { x: 1.85 }, forearm_l: { x: 0.31 } },
  // tracked XS: the upper body turns right round on the chassis; for a mortar volley the cannons rise to about 80°
  // and kick 1.4 m back along the barrels with each shot (client/src/models.ts shoveCannon)
  旋回左: { torso: { y: 1.57 } },
  旋回右: { torso: { y: -1.57 } },
  旋回後ろ: { torso: { y: 3.14 } },
  迫撃: { cannon: { x: 1.4 } },
  迫撃の反動: { cannon: { x: 1.4, fwd: -1.4 } },
  迫撃で旋回: { torso: { y: 1.57 }, cannon: { x: 1.4, fwd: -1.4 } },
};
const TRACK_POSES = ['旋回左', '旋回右', '旋回後ろ', '迫撃', '迫撃の反動', '迫撃で旋回'];
// The game's real motion, sampled frame by frame (xs-editor/poses.json, written by tools/genposes.ts):
// { moves: { name: [ { hips: { dy, x, y, z }, torso: { x, y, z }, ... } x 16 ] }, xs: { a_raid: { name, melee, tracked, ... } } }
let MOVES = {}, XS_INFO = {};
const posesReady = fetch(new URL('./poses.json', import.meta.url)).then(r => (r.ok ? r.json() : null)).then(j => { if (j && j.moves) { MOVES = j.moves; XS_INFO = j.xs || {}; } }).catch(() => {});
// 用途: what the XS is for (its role in the game). It decides which moves the joint check plays (that role's melee, the
// legged artillery's mortar kneel, no kneeling on tracks). '' = not decided: every move is checked.
const ROLES = { raid: '強襲', heavy: '重撃', support: '支援', sniper: '狙撃', artillery: '砲撃（キャタピラ）', artillery_leg: '砲撃（脚）' };
const roleId = (role = sceneRole) => (ROLES[role] ? `a_${role}` : '');
// the moves an XS makes: the melee moves (saber_ / knife_ / ram_) of its melee weapon, the mortar kneel (kneel_) for
// the artillery on legs, the emergency-return sit (sit_) for every XS on legs
const MELEE_NAMES = { saber: 'サーベル', knife: 'ナイフ', ram: '砲身打撃' };
const movePlayed = (name, id) => {
  const x = XS_INFO[id];
  if (!x) return true;
  const m = /^(saber|knife|ram)_/.exec(name);
  if (m) return x.melee === m[1];
  if (/^kneel_/.test(name)) return !!x.kneel;
  if (/^sit_/.test(name)) return !x.tracked;
  return true;
};
const poseOf = (name, frame) => POSES[name] || MOVES[name]?.[frame] || {};

// parts that are the rotation centre of a bone (the child side of the joint), by name unless set per part
const PIVOT_CHOICES = { auto: '自動（部品名から）', none: 'なし', head: '頭', torso: '胴', arm: '腕（肩）', fore: '前腕（ひじ）', leg: '太もも（股関節）', shin: 'すね（ひざ）', cannon: '大砲（付け根）', skirt: 'スカート（蝶番）' };
const PIVOT_RULES = [['arm', /肩関節/], ['fore', /^ひじ$|ひじ関節/], ['leg', /股関節/], ['shin', /ひざ関節|^ひざ$/], ['foot', /^足首$|足首関節|足首の関節/], ['head', /^首$/], ['torso', /^腹$|腹のフレーム|旋回/],
  ['cannon', /(大砲|キャノン|砲).*(付け根|台座|基部)|砲架/], ['skirt', /スカートの蝶番/]];
const pivotOf = p => {
  if (p.pivot && p.pivot !== 'auto') return p.pivot === 'none' ? null : p.pivot;
  for (const [g, re] of PIVOT_RULES) if (re.test(p.name)) return g;
  return null;
};

// Skirts (docs/models.md「スカート」): each plate on a skirt bone turns about its hinge just far enough that its leg
// (thigh and shin, seen from the side) doesn't cut into it, as the game does it (client/src/skirts.ts). Adds the
// skirt bones' angles to a pose (game space: + x opens a front plate forward, − x a back plate backward).
function skirtOutlines(pieces, at) {
  const sets = {};
  for (const pc of pieces) {
    if (!SKIRT_BONES.includes(pc.bone) && !/^(leg|knee|shin)_/.test(pc.bone) || pc.part.noHit) continue;   // (the feet do not reach the skirts)
    const e = (sets[pc.bone.replace(/^knee_/, 'leg_')] ||= { yz: [], tris: [], x: [Infinity, -Infinity] }), pos = pc.geo.attributes.position;   // geo は三角形ごとの頂点の並び
    for (let i = 0; i < pos.count; i++) { e.yz.push([pos.getY(i), pos.getZ(i)]); e.tris.push(pos.getX(i), pos.getY(i), pos.getZ(i)); e.x[0] = Math.min(e.x[0], pos.getX(i)); e.x[1] = Math.max(e.x[1], pos.getX(i)); }
  }
  const yz = v => [v.y, v.z];
  // tris：脚ごとにその脚の幅にかかる所だけで押し開きを調べる（脚の幅の外で後ろへ曲がった所はその脚に押されない）
  const plates = SKIRT_BONES.filter(n => sets[n]).map(n => ({ name: n, poly: hull2(sets[n].yz), tris: sets[n].tris, hinge: yz(at[n]), dir: n.includes('front') ? 1 : -1, x: sets[n].x }));
  const legs = s => ['leg_' + s, 'shin_' + s].filter(n => sets[n]).map(n => ({ bone: n, side: s, poly: hull2(sets[n].yz), x: sets[n].x, pivot: yz(at['leg_' + s]), knee: n.startsWith('shin') ? yz(at['shin_' + s]) : null }));
  return { plates, legs: [...legs('l'), ...legs('r')] };
}
function withSkirts(pose, outlines, H) {
  if (!outlines?.plates.length) return pose;
  const legs = outlines.legs.map(l => ({ ...l, angle: pose['leg_' + l.side]?.x || 0, kneeAngle: l.knee ? pose['shin_' + l.side]?.x || 0 : 0 }));
  const out = { ...pose };
  for (const p of outlines.plates) out[p.name] = { x: p.dir * pushAngle(p, legs, { margin: 0.05 * H / 18 }) };
  return out;
}

const _flip = new THREE.Matrix4().makeRotationY(Math.PI);
// Ankles (docs/models.md「足首」): the foot's parts turn on foot_l / foot_r at the ankle; the game keeps the soles level
// with the ground. How far an ankle turns [toes down, toes up] (rad): the game's default, less where the shin's
// armour is in the foot's way (safeAnkle, written into the model as the foot bones' `ankle`).
const ANKLE_RANGE = [0.8, 0.45];
let ankleNow = null;   // this model's range, from the last joint check or export (null: the default)
const CUT_DEPTH = 0.01;   // cutting-in deeper than this (per 3 units of height, ~6 cm on an 18 m XS) is reported
// bone matrices (editor space) for a pose: rotate each bone about its pivot, children follow their parents
function poseMatrices(at, pose, height) {
  const M = {};
  for (const [name, parent] of GAME_BONES) {
    let r = pose[name] || {};
    const p = at[name];
    if (!p) continue;   // a link this model does not have
    // the ankle: as the game turned it (poses.json), or by the game's rule (the sole level with the ground:
    // client/src/legs.ts ankleAngle), within what this model's ankle can turn (safeAnkle)
    if (name.startsWith('foot_')) {
      const s = name.slice(-1), range = ankleNow ?? ANKLE_RANGE;
      const x = pose[name] ? (r.x || 0) : -((pose['leg_' + s]?.x || 0) + (pose['shin_' + s]?.x || 0));
      r = { x: Math.max(-range[0], Math.min(range[1], x)) };
    }
    const game = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(r.x || 0, r.y || 0, r.z || 0, 'YXZ'));
    const rot = _flip.clone().multiply(game).multiply(_flip);             // game faces -Z, the editor +Z
    // hips.dy drops the hips; cannon.fwd shoves the cannons along the barrels as they point now (game metres; the
    // editor's front is +Z)
    const shove = new THREE.Vector3(0, 0, (r.fwd || 0) * height / 18).applyMatrix4(rot);
    // a double joint: the link turns about its bone by what is past `first`, and carries the lower bone's pivot
    let o = p;
    const lk = LINKS[name.slice(0, -2)], P1 = lk && at[lk[0] + name.slice(-2)];
    if (P1) {
      const dj = doubleJoint(new THREE.Quaternion().setFromRotationMatrix(rot), p, [P1.y - p.y, 0, lk[1]], lk[2]);
      M[lk[0] + name.slice(-2)] = M[parent].clone().multiply(new THREE.Matrix4().makeTranslation(P1.x, P1.y, P1.z))
        .multiply(new THREE.Matrix4().makeRotationFromQuaternion(dj.link)).multiply(new THREE.Matrix4().makeTranslation(-P1.x, -P1.y, -P1.z));
      o = new THREE.Vector3(P1.x, P1.y, P1.z).add(new THREE.Vector3(0, p.y - P1.y, 0).applyQuaternion(dj.link));
    }
    const local = new THREE.Matrix4().makeTranslation(o.x + shove.x, o.y + (r.dy || 0) * height / 18 + shove.y, o.z + shove.z)
      .multiply(rot).multiply(new THREE.Matrix4().makeTranslation(-p.x, -p.y, -p.z));
    M[name] = parent ? M[parent].clone().multiply(local) : local;
  }
  return M;
}

/**
 * How far this model's ankles can turn before the feet cut into the shins: [toes down, toes up] in rad, each up to
 * the game's default (ANKLE_RANGE), in steps of 0.05. null without feet on their own bones. Contacts that are there
 * at rest (the ankle joint in the foot) do not count; a cut counts once it is CUT_DEPTH deeper than at rest.
 */
function safeAnkle(pieces, at, H) {
  if (!pieces.some(pc => /^foot_/.test(pc.bone))) return null;
  const I = new THREE.Matrix4(), v = new THREE.Vector3(), hit = { point: new THREE.Vector3() };
  const tri = new THREE.Triangle(), nrm = new THREE.Vector3(), d = new THREE.Vector3(), lim = CUT_DEPTH * H / 3;
  for (const pc of pieces) if (/^(shin|foot)_/.test(pc.bone)) pc.bvh ||= new MeshBVH(pc.geo);
  const depthIn = (a, g) => {
    const pos = g.attributes.position, idx = a.geo.index, ap = a.geo.attributes.position;
    let deep = 0;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      if (!a.geo.boundingBox.containsPoint(v)) continue;
      const r = a.bvh.closestPointToPoint(v, hit);
      if (!r) continue;
      const f = r.faceIndex * 3, ix = k => (idx ? idx.getX(f + k) : f + k);
      tri.set(new THREE.Vector3().fromBufferAttribute(ap, ix(0)), new THREE.Vector3().fromBufferAttribute(ap, ix(1)), new THREE.Vector3().fromBufferAttribute(ap, ix(2)));
      tri.getNormal(nrm);
      if (d.subVectors(v, r.point).dot(nrm) < 0) deep = Math.max(deep, r.distance);
    }
    return deep;
  };
  // pairs (foot piece, shin piece) that touch at rest are left out, as in the joint check (the ankle joint sits in the foot)
  const near = (a, g) => {
    if (a.bvh.intersectsGeometry(g, I)) return true;
    const pos = g.attributes.position, step = Math.max(1, Math.floor(pos.count / 300));
    for (let i = 0; i < pos.count; i += step) {
      v.fromBufferAttribute(pos, i);
      if (a.geo.boundingBox.distanceToPoint(v) > TOUCH) continue;
      const r = a.bvh.closestPointToPoint(v, hit, 0, TOUCH);
      if (r && r.distance <= TOUCH) return true;
    }
    return false;
  };
  const pairs = [];
  for (const s of ['l', 'r']) {
    const p = at['foot_' + s];
    if (!p) continue;
    for (const b of pieces.filter(pc => pc.bone === 'foot_' + s)) for (const a of pieces.filter(pc => pc.bone === 'shin_' + s)) {
      if (near(a, b.geo) || near(b, a.geo)) continue;
      pairs.push({ a, b, p });
    }
  }
  // the deepest cut between a foot and its shin with the ankle turned f (game angle: + = toes up)
  const worst = f => {
    let deep = 0;
    const done = new Map();
    for (const { a, b, p } of pairs) {
      const m = new THREE.Matrix4().makeTranslation(p.x, p.y, p.z).multiply(_flip).multiply(new THREE.Matrix4().makeRotationX(f)).multiply(_flip).multiply(new THREE.Matrix4().makeTranslation(-p.x, -p.y, -p.z));
      let g = done.get(b);
      if (!g) { g = b.geo.clone().applyMatrix4(m); g.computeBoundingBox(); done.set(b, g); }
      if (!a.geo.boundingBox.intersectsBox(g.boundingBox) || !a.bvh.intersectsGeometry(g, I)) continue;
      deep = Math.max(deep, depthIn(a, g), depthIn(b, a.geo.clone().applyMatrix4(m.clone().invert())));
    }
    return deep;
  };
  const range = [0, 0];
  [-1, 1].forEach((sign, i) => {
    for (let f = 0.05; f <= ANKLE_RANGE[i] + 1e-6; f += 0.05) {
      if (worst(sign * f) > lim) break;
      range[i] = Math.round(f * 100) / 100;
    }
  });
  return range;
}

// A viewport mesh's shape at rest. A skinned mesh shown in a pose has its corners moved in place (skinPose), so what
// is exported, checked or measured while a pose is shown takes its rest shape (a copy), the same as in 待機.
function restGeometry(m, copy) {
  if (!m.userData.restPos) return copy ? m.geometry.clone() : m.geometry;
  const g = m.geometry.clone();
  g.attributes.position.array.set(m.userData.restPos); g.attributes.position.needsUpdate = true;
  g.attributes.normal.array.set(m.userData.restNor); g.attributes.normal.needsUpdate = true;
  return g;
}
// pieces of the current model (editor space, rest pose) straight from the viewport meshes
function currentPieces() {
  const out = [];
  for (const m of resultGroup.children) if (m.isMesh) {
    const p = getPart(m.userData.partId), g = restGeometry(m, false);
    g.computeBoundingBox();
    const cx = (g.boundingBox.min.x + g.boundingBox.max.x) / 2, cz = (g.boundingBox.min.z + g.boundingBox.max.z) / 2;
    out.push({ geo: g, part: p, bone: sided(boneGroupOf(p), cx, cz), mesh: m });
  }
  return out;
}

// The game fits the one-knee kneel (the mortar kneel_ and the return sit_) to each model when it loads it
// (client/src/models.ts calibrateKneel): of these leg angles it keeps the one that brings the hips lowest with nothing
// under the ground in either kneel. The recorded frames carry the placeholder's angles; here they are swapped for this
// model's, scaled along the move by how far the forward thigh has come.
const KNEEL_TRY = { legL: [1.45, 1.6], legR: [-0.2, -0.5, -0.8, -1.1], shinW: [-0.9, -1.2, -1.5] };
function fitKneel(moves, pieces, at, H) {
  const kneels = Object.entries(moves).filter(([k, f]) => /^(kneel|sit)_/.test(k) && f.length);
  if (!kneels.length || !pieces.some(pc => /^(leg|shin)_/.test(pc.bone))) return moves;
  const withLegs = (pose, L, p) => ({ ...pose, leg_l: { ...pose.leg_l, x: L.legL * p }, shin_l: { ...pose.shin_l, x: -L.legL * p },
    leg_r: { ...pose.leg_r, x: L.legR * p }, shin_r: { ...pose.shin_r, x: (L.shinW - L.legR) * p } });
  const v = new THREE.Vector3();
  let best = null, bestH = Infinity;
  for (const legL of KNEEL_TRY.legL) for (const legR of KNEEL_TRY.legR) for (const shinW of KNEEL_TRY.shinW) {
    const L = { legL, legR, shinW };
    let low = Infinity, hips = 0;
    for (const [, frames] of kneels) {
      const M = poseMatrices(at, withLegs(frames[frames.length - 1], L, 1), H);
      for (const pc of pieces) {
        const pos = pc.geo.attributes.position;
        for (let i = 0; i < pos.count; i += 4) low = Math.min(low, v.fromBufferAttribute(pos, i).applyMatrix4(M[pc.bone]).y);
      }
      hips = at.hips.clone().applyMatrix4(M.hips).y;
    }
    if (hips - low < bestH) { bestH = hips - low; best = L; }
  }
  const out = { ...moves };
  for (const [k, frames] of kneels) {
    const end = frames[frames.length - 1].leg_l?.x || 1;
    out[k] = frames.map(f => withLegs(f, best, Math.max(0, Math.min(1, (f.leg_l?.x || 0) / end))));
  }
  return out;
}

// ---- range check: every pose, parts coming off the body and parts newly cutting into others
const pieceLabel = pc => pc.part.name + (pc.bone.endsWith('_l') ? '（左）' : pc.bone.endsWith('_r') ? '（右）' : '');
function jointCheck(id = roleId()) {
  rebuild();
  const pieces = currentPieces();
  const { at, whole } = jointPositions(pieces);
  const H = whole.max.y - whole.min.y;
  const I = new THREE.Matrix4(), v = new THREE.Vector3(), hit = { point: new THREE.Vector3() };
  for (const pc of pieces) pc.bvh = new MeshBVH(pc.geo);
  ankleNow = safeAnkle(pieces, at, H);   // the feet turn as far as this model's ankles can (the game reads the same from the model)
  // b moved into a's rest frame; three-mesh-bvh's intersectsGeometry(geometry, matrix) reports false hits,
  // so the other shape is really moved and tested with an identity matrix
  const into = (a, ma, b, mb) => ma === mb || ma.equals(mb) ? b.geo : b.geo.clone().applyMatrix4(ma.clone().invert().multiply(mb));
  // b (moved by mb) within `limit` of a (moved by ma)?
  const gapUnder = (a, ma, b, mb, limit) => {
    const g = into(a, ma, b, mb);
    if (a.bvh.intersectsGeometry(g, I)) return true;
    const pos = g.attributes.position, step = Math.max(1, Math.floor(pos.count / 300));
    for (let i = 0; i < pos.count; i += step) {
      v.fromBufferAttribute(pos, i);
      if (a.geo.boundingBox.distanceToPoint(v) > limit) continue;
      const r = a.bvh.closestPointToPoint(v, hit, 0, limit);
      if (r && r.distance <= limit) return true;
    }
    return false;
  };
  // contacts in the rest pose
  const n = pieces.length, touch = [], inside = new Set();
  for (let a = 0; a < n; a++) {
    const near = pieces[a].geo.boundingBox.clone().expandByScalar(0.05);
    for (let b = a + 1; b < n; b++) {
      if (!near.intersectsBox(pieces[b].geo.boundingBox)) continue;
      if (pieces[a].bvh.intersectsGeometry(pieces[b].geo, I)) { touch.push([a, b]); inside.add(a + ',' + b); }
      else if (gapUnder(pieces[a], I, pieces[b], I, TOUCH) || gapUnder(pieces[b], I, pieces[a], I, TOUCH)) touch.push([a, b]);
    }
  }
  const restPair = new Set(touch.map(([a, b]) => a + ',' + b));
  const depths = new Map();   // deepest cut per pair, in game metres (18 m tall)
  // how deep g's vertices sit inside a (0 if none): distance to a's surface for vertices behind it
  const tri = new THREE.Triangle(), nrm = new THREE.Vector3(), d = new THREE.Vector3();
  const depthIn = (a, g) => {
    const pos = g.attributes.position, idx = a.geo.index, ap = a.geo.attributes.position;
    let deep = 0;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      if (!a.geo.boundingBox.containsPoint(v)) continue;
      const r = a.bvh.closestPointToPoint(v, hit);
      if (!r) continue;
      const f = r.faceIndex * 3;
      tri.set(new THREE.Vector3().fromBufferAttribute(ap, idx.getX(f)), new THREE.Vector3().fromBufferAttribute(ap, idx.getX(f + 1)), new THREE.Vector3().fromBufferAttribute(ap, idx.getX(f + 2)));
      tri.getNormal(nrm);
      if (d.subVectors(v, r.point).dot(nrm) < 0) deep = Math.max(deep, r.distance);
    }
    return deep;
  };
  const report = {};
  // with the game's real frames loaded, those plus the basic poses; the hand-made extremes are for preview only
  const tracked = isTracked();
  const basic = Object.keys(MOVES).length ? ['構え', '歩き', 'ダッシュ', ...(tracked ? TRACK_POSES : [])]
    : Object.keys(POSES).filter(k => k !== '待機' && (tracked || !TRACK_POSES.includes(k)));
  const checks = basic.map(k => [k, POSES[k], null]);
  for (const [k, frames] of Object.entries(fitKneel(MOVES, pieces, at, H))) if (movePlayed(k, id)) frames.forEach((pose, i) => { if (i % 2 === 1) checks.push([k, pose, i]); });
  const skirts = skirtOutlines(pieces, at);
  for (const [name, pose, frame] of checks) {
    const M = poseMatrices(at, withSkirts(pose, skirts, H), H);
    const moved = pc => M[pc.bone];
    const hidden = /^saber|^knife|^throw/.test(name) ? pc => isHeld(pc.part) : () => false;   // the game hides the gun then
    const same = (a, b) => moved(a).equals(moved(b));
    // the saber's two-handed grip brings both hands to the one hilt: the left forearm and hand against the right are not counted
    const twoHands = /^saber/.test(name) ? (a, b) => /^forearm_/.test(a.bone) && /^forearm_/.test(b.bone) && a.bone !== b.bone : () => false;
    // 1) off the body: keep the rest contacts that still hold in this pose, then look for islands
    const adj = pieces.map(() => []);
    for (const [a, b] of touch) {
      const pa = pieces[a], pb = pieces[b];
      if (same(pa, pb) || gapUnder(pa, moved(pa), pb, moved(pb), TOUCH * 2) || gapUnder(pb, moved(pb), pa, moved(pa), TOUCH * 2)) { adj[a].push(b); adj[b].push(a); }
    }
    const comp = new Array(n).fill(-1); let c = 0;
    for (let s = 0; s < n; s++) {
      if (comp[s] >= 0) continue;
      const st = [s]; comp[s] = c;
      while (st.length) { const u = st.pop(); for (const w of adj[u]) if (comp[w] < 0) { comp[w] = c; st.push(w); } }
      c++;
    }
    const sizes = new Array(c).fill(0); comp.forEach(k => sizes[k]++);
    const body = sizes.indexOf(Math.max(...sizes));
    const off = [...new Set(pieces.filter((pc, k) => comp[k] !== body && !hidden(pc) && !isLight(pc.part)).map(pieceLabel))];
    // 2) cutting in: pairs moving differently that intersect now but were apart at rest (parts marked 当たり判定なし, like power pipes, are skipped)
    const cut = new Set();
    const boxes = pieces.map(pc => pc.geo.boundingBox.clone().applyMatrix4(moved(pc)));
    for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
      const pa = pieces[a], pb = pieces[b];
      if (same(pa, pb) || hidden(pa) || hidden(pb) || twoHands(pa, pb) || pa.part.noHit || pb.part.noHit || restPair.has(a + ',' + b) || !boxes[a].intersectsBox(boxes[b])) continue;
      const gb = into(pa, moved(pa), pb, moved(pb));
      if (!pa.bvh.intersectsGeometry(gb, I)) continue;
      // grazing contact at a joint's rim is fine; only real cutting-in counts
      const deep = Math.max(depthIn(pa, gb), depthIn(pb, into(pb, moved(pb), pa, moved(pa))));
      if (deep > CUT_DEPTH * H / 3) { const key = `${pieceLabel(pa)} ↔ ${pieceLabel(pb)}`; cut.add(key); depths.set(key, Math.max(depths.get(key) || 0, deep * 18 / H)); }
    }
    const r = (report[name] ||= { off: new Set(), cut: new Set(), frames: [] });
    off.forEach(x => r.off.add(x)); cut.forEach(x => r.cut.add(x));
    if ((off.length || cut.size) && frame !== null) r.frames.push(frame);
  }
  for (const r of Object.values(report)) { r.off = [...r.off]; r.cut = [...r.cut]; }
  report.__depths = Object.fromEntries(depths);
  const skipped = Object.keys(MOVES).filter(k => !movePlayed(k, id));
  report.__skipped = skipped.length;
  report.__skippedKinds = [...new Set(skipped.map(k => (/^kneel_/.test(k) ? '迫撃のひざつき' : /^sit_/.test(k) ? '緊急帰投の片膝' : 'ほかの格闘')))].join('・');
  return report;
}

const toGame = (v, floor) => new THREE.Vector3(-v.x, v.y - floor, -v.z);   // turn 180° about Y, sole on y = 0

// ---- tracked XS: the tread belts
const TREAD_REPEAT = 0.9;   // game metres per tread plate (client/src/mech.ts); the game scrolls U by speed / this
// one tread plate across the texture's width (U = along the belt), shaded from the belt part's colour
function treadTexture(hex) {
  const c = document.createElement('canvas'); c.width = 64; c.height = 32;
  const g = c.getContext('2d'), base = new THREE.Color(hex);
  const shade = k => '#' + base.clone().multiplyScalar(k).getHexString();
  g.fillStyle = shade(0.45); g.fillRect(0, 0, 64, 32);
  g.fillStyle = shade(1); g.fillRect(4, 2, 44, 28);          // plate
  g.fillStyle = shade(1.35); g.fillRect(10, 2, 14, 28);      // cleat across the belt
  g.fillStyle = shade(0.6); g.fillRect(28, 13, 12, 6);       // guide lug
  g.fillStyle = shade(1.6); g.fillRect(50, 4, 8, 3); g.fillRect(50, 25, 8, 3);   // pins
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
// Belt pieces of one side as game-space triangles with U running round the belt: seen from the side (z, y), the
// outline is walked like the game's own belts — the top run front (-z) to back, down the rear, the bottom back to
// front — and the perimeter holds a whole number of plates so the seam doesn't show.
function beltGeometry(list, floor, H) {
  const P = [], N = [];
  for (const pc of list) {
    const pos = pc.geo.attributes.position, nor = pc.geo.attributes.normal;
    for (let i = 0; i < pos.count; i++) {
      P.push(-pos.getX(i), pos.getY(i) - floor, -pos.getZ(i));
      N.push(nor ? -nor.getX(i) : 0, nor ? nor.getY(i) : 1, nor ? -nor.getZ(i) : 0);
    }
  }
  const pts = [];
  for (let i = 0; i < P.length; i += 3) pts.push([P[i + 2], P[i + 1]]);
  // convex hull (monotone chain, counter-clockwise), then reversed: clockwise in (z, y) = the top run toward +z
  const sorted = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = list => { const h = []; for (const p of list) { while (h.length >= 2 && cross(h[h.length - 2], h[h.length - 1], p) <= 0) h.pop(); h.push(p); } h.pop(); return h; };
  const hull = [...half(sorted), ...half([...sorted].reverse())].reverse();
  // start at the front end of the top run
  const top = Math.max(...hull.map(p => p[1]));
  let start = hull.findIndex(p => p[1] > top - 1e-3 * H);
  hull.forEach((p, i) => { if (p[1] > top - 1e-3 * H && p[0] < hull[start][0]) start = i; });
  const ring = [...hull.slice(start), ...hull.slice(0, start)];
  const acc = [0];
  for (let i = 0; i < ring.length; i++) { const a = ring[i], b = ring[(i + 1) % ring.length]; acc.push(acc[i] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
  const perim = acc[ring.length] || 1;
  const plates = Math.max(1, Math.round(perim * 18 / H / TREAD_REPEAT));
  const along = (z, y) => {   // arc length of the nearest outline point
    let best = Infinity, s = 0;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length], dz = b[0] - a[0], dy = b[1] - a[1], l2 = dz * dz + dy * dy || 1;
      const t = Math.min(1, Math.max(0, ((z - a[0]) * dz + (y - a[1]) * dy) / l2));
      const d = Math.hypot(a[0] + dz * t - z, a[1] + dy * t - y);
      if (d < best) { best = d; s = acc[i] + t * Math.sqrt(l2); }
    }
    return s;
  };
  let x0 = Infinity, x1 = -Infinity;
  for (let i = 0; i < P.length; i += 3) { x0 = Math.min(x0, P[i]); x1 = Math.max(x1, P[i]); }
  const UV = [];
  for (let i = 0; i < P.length; i += 3) UV.push(along(P[i + 2], P[i + 1]) / perim * plates, (P[i] - x0) / (x1 - x0 || 1));
  // the belt's flat sides (facing ±x) take one plain colour (the texture's dark edge); a triangle across the seam
  // gets its low end moved up a turn
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  for (let t = 0; t < UV.length; t += 6) {
    const k = t / 2 * 3;
    e1.set(P[k + 3] - P[k], P[k + 4] - P[k + 1], P[k + 5] - P[k + 2]);
    e2.set(P[k + 6] - P[k], P[k + 7] - P[k + 1], P[k + 8] - P[k + 2]);
    if (Math.abs(e1.cross(e2).normalize().x) > 0.7) { UV.fill(0, t, t + 6); continue; }
    const us = [UV[t], UV[t + 2], UV[t + 4]];
    if (Math.max(...us) - Math.min(...us) > plates / 2) for (let k = 0; k < 3; k++) if (us[k] < plates / 2) UV[t + k * 2] += plates;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
  return g;
}

function buildGameModel() {
  const lods = [0, 1, 2].map(lodPieces);
  const { at, whole } = jointPositions(lods[0]);
  const floor = whole.min.y, H = whole.max.y - whole.min.y;
  const tracked = isTracked();
  const root = new THREE.Group(); root.name = 'xs';
  if (whole.userData.top > whole.max.y + 1e-6) root.userData.height = Math.round(H * 1e4) / 1e4;   // wings above the head: the body's height
  // skeleton: a tracked XS has no leg bones; the cannon mount only when barrels ride on it
  const gameBones = GAME_BONES.filter(([n]) => !(tracked && /^(leg|shin|foot)_/.test(n)) && (!OPTIONAL_BONES.has(n) || lods[0].some(pc => pc.bone === n || pc.part.rig?.[n])));
  const bones = {};
  for (const [name, parent] of gameBones) {
    const b = new THREE.Bone(); b.name = name;
    const w = toGame(at[name], floor);
    if (parent) { b.position.copy(w.sub(toGame(at[parent], floor))); bones[parent].add(b); } else { b.position.copy(w); root.add(b); }
    bones[name] = b;
  }
  const attach = attachPoints(lods[0]);
  for (const [name, a] of Object.entries(attach)) if (a) {
    const n = new THREE.Bone(); n.name = name;
    n.position.copy(toGame(a.pos, floor).sub(toGame(at[a.bone], floor)));
    bones[a.bone].add(n);
  }
  // ankles: how far they can turn goes into the model (the foot bones' extras; client/src/models.ts reads it)
  const ankle = bones.foot_l || bones.foot_r ? safeAnkle(lods[0], at, H) : null;
  ankleNow = ankle;
  if (ankle) for (const n of ['foot_l', 'foot_r']) if (bones[n]) bones[n].userData.ankle = ankle;
  // double joints: how far the lower axis bends before the link turns (the link bones' extras; client/src/doublejoint.ts reads it)
  for (const [link, first] of [['elbow', ELBOW_AXES[2]], ['knee', KNEE_AXES[2]]]) for (const s of ['l', 'r']) if (bones[`${link}_${s}`]) bones[`${link}_${s}`].userData.first = Math.round(first * 1e4) / 1e4;
  // orbs (ORB, the body generator's): each orb's parts ride on a bone of its own, orb_<n> (a child of the torso, at the orb's
  // dock, turned so that its -Y runs along the barrel and its +Z is the dock's face), so the game can hide one orb (scale
  // 0) and send its own flying one out; orb_dock_<n> is the same place as a plain node, which the game does not scale.
  // The bones' extras: size ('s' | 'm' | 'l') and len (the barrel's length in the editor's units)
  const orbNames = [];
  {
    const seen = new Map();
    for (const pc of lods[0]) if (pc.orb && !seen.has(pc.orb)) seen.set(pc.orb, pc.part);
    const flipQ = new THREE.Quaternion(0, 1, 0, 0);
    for (const [name, p] of [...seen].sort((a, b) => a[1].orb.i - b[1].orb.i)) {
      p.proxy.updateMatrixWorld();
      const w = toGame(new THREE.Vector3(...p.orb.dock).applyMatrix4(p.proxy.matrixWorld), floor).sub(toGame(at.torso, floor));
      const q = flipQ.clone().multiply(p.proxy.getWorldQuaternion(new THREE.Quaternion())).multiply(flipQ.clone().invert());
      for (const nm of [name, name.replace('orb_', 'orb_dock_')]) {
        const b = new THREE.Bone(); b.name = nm; b.position.copy(w); b.quaternion.copy(q);
        b.userData = { size: p.orb.size, len: p.orb.len };
        bones.torso.add(b);
        if (nm === name) { bones[name] = b; orbNames.push(name); }
      }
    }
  }
  root.updateMatrixWorld(true);
  const boneNames = [...gameBones.map(([n]) => n), ...orbNames];
  const boneList = boneNames.map(n => bones[n]);
  const skeleton = new THREE.Skeleton(boneList);
  const boneIndex = Object.fromEntries(boneNames.map((n, i) => [n, i]));
  const report = { tris: [], calls: [], materials: [], bones: boneNames, tracked, belts: [], ankle };

  lods.forEach((pieces, level) => {
    // LOD0 of a tracked XS: the belts are their own meshes (track_l / track_r) so the game can scroll their texture
    const beltSides = { l: [], r: [] };
    if (level === 0 && tracked) {
      pieces = pieces.filter(pc => {
        if (!isBelt(pc.part)) return true;
        const b = pc.geo.boundingBox;
        beltSides[(b.min.x + b.max.x) / 2 >= 0 ? 'l' : 'r'].push(pc);   // editor +X is the XS's left
        return false;
      });
    }
    let tris = 0, beltCalls = 0;
    for (const [s, list] of Object.entries(beltSides)) {
      if (!list.length) continue;
      const g = beltGeometry(list, floor, H);
      const n = g.attributes.position.count;
      g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Array(n).fill(0).flatMap(() => [boneIndex.hips, 0, 0, 0]), 4));
      g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(new Array(n).fill(0).flatMap(() => [1, 0, 0, 0]), 4));
      const p0 = list[0].part;
      const mat = new THREE.MeshStandardMaterial({ name: 'track_' + s, map: treadTexture(p0.color), metalness: p0.metal, roughness: p0.rough });
      const mesh = new THREE.SkinnedMesh(g, mat);
      mesh.name = 'track_' + s;
      mesh.userData.xsParts = []; let first = 0;
      for (const pc of list) { const t = pc.geo.attributes.position.count / 3; mesh.userData.xsParts.push([pieceLabel(pc), pc.bone, first, t, 0]); first += t; }
      root.add(mesh);
      mesh.bind(skeleton, new THREE.Matrix4());
      tris += n / 3; beltCalls++;
      report.materials.push(mesh.name); report.belts.push(mesh.name);
    }
    // group by material class; glow keeps its own colour per material (emissive can't take vertex colours)
    const groups = new Map();
    for (const pc of pieces) {
      let cls = isBazooka(pc.part) ? 'bazooka' : isGun(pc.part) ? 'gun' : materialClass(pc.part);
      if (cls.startsWith('skin') && !pc.geo.attributes.uv) cls = 'body';
      const key = cls === 'glow' && level === 0 ? 'glow:' + pc.part.color : cls;
      (groups.get(key) || groups.set(key, []).get(key)).push(pc);
    }
    // stay within the draw-call budget (the belts come on top: a tracked XS may use 5 + 2, gltfrig.ts drawLimit):
    // fold extra glow colours into one, then metal into body
    const budget = GAME_LIMITS.drawCalls;
    if (level === 0 && groups.size > budget) {
      const glowKeys = [...groups.keys()].filter(k => k.startsWith('glow:'));
      const keep = glowKeys.shift();
      for (const k of glowKeys) { groups.get(keep).push(...groups.get(k)); groups.delete(k); }
    }
    if (level === 0 && groups.size > budget && groups.has('metal')) {
      (groups.get('body') || groups.set('body', []).get('body')).push(...groups.get('metal'));
      groups.delete('metal');
    }
    for (const [key, list] of groups) {
      const cls = key.split(':')[0];
      const P = [], N = [], C = [], SI = [], SW = [], UV = [];
      const skinTex = cls === 'skin' ? MESHES.get(list[0].part.mesh)?.tex : null;
      let metal = 0, rough = 0, n = 0;
      const partRanges = [];   // LOD0: which triangles belong to which part, for checks outside the editor (tools/jointcheck.ts)
      for (const pc of list) {
        if (level === 0) partRanges.push([pieceLabel(pc), pc.bone, P.length / 9, pc.geo.attributes.position.count / 3, (isHeld(pc.part) ? 1 : 0) | (pc.part.noHit ? 2 : 0) | (isLight(pc.part) ? 4 : 0)]);
        const pos = pc.geo.attributes.position, nor = pc.geo.attributes.normal;
        const col = cls === 'skin' ? new THREE.Color(0xffffff) : new THREE.Color(pc.part.color), bi = boneIndex[pc.orb] ?? boneIndex[pc.bone];
        const uv = cls === 'skin' ? pc.geo.attributes.uv : null;
        const si = pc.part.rig ? pc.geo.attributes.skinIndex : null, sw = si ? pc.geo.attributes.skinWeight : null;
        const map = si ? IMPORT_BONES.map(n => boneIndex[n] ?? boneIndex.torso) : null;
        for (let i = 0; i < pos.count; i++) {
          if (uv) UV.push(uv.getX(i), uv.getY(i));
          P.push(-pos.getX(i), pos.getY(i) - floor, -pos.getZ(i));
          if (nor) N.push(-nor.getX(i), nor.getY(i), -nor.getZ(i));
          C.push(col.r, col.g, col.b);
          if (si) for (let k = 0; k < 4; k++) { SI.push(map[si.getComponent(i, k)]); SW.push(sw.getComponent(i, k)); }
          else { SI.push(bi, 0, 0, 0); SW.push(1, 0, 0, 0); }
        }
        metal += pc.part.metal * pos.count; rough += pc.part.rough * pos.count; n += pos.count;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
      if (N.length === P.length) g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); else g.computeVertexNormals();
      g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
      if (UV.length) g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
      g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(SI, 4));
      g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(SW, 4));
      const merged = mergeVertices(g, 1e-5);   // share identical corners: same look, far smaller file
      const glowColor = cls === 'glow' ? new THREE.Color(list[0].part.color) : null;
      const mat = new THREE.MeshStandardMaterial({
        name: cls === 'team' ? 'team_color' : cls === 'glow' ? `glow_${[...groups.keys()].indexOf(key)}` : cls,
        vertexColors: !skinTex, map: skinTex ?? null, metalness: n ? metal / n : 0.3, roughness: n ? rough / n : 0.5,
        emissive: glowColor || 0x000000, emissiveIntensity: glowColor ? 1 : 0,
      });
      const mesh = new THREE.SkinnedMesh(merged, mat);
      mesh.name = `xs_${mat.name}${level ? '_lod' + level : ''}`;
      if (level === 0) mesh.userData.xsParts = partRanges;   // glTF extras: [label, bone, first triangle, triangles, flags: 1 hand weapon, 2 takes no hits, 4 a light]
      if (cls === 'gun' || cls === 'bazooka') {   // gun / bazooka nodes the game shows and hides
        let held = root.getObjectByName(cls);
        if (!held) { held = new THREE.Group(); held.name = cls; root.add(held); }
        held.add(mesh);
      } else root.add(mesh);
      mesh.bind(skeleton, new THREE.Matrix4());
      tris += P.length / 9;
      if (level === 0) report.materials.push(mat.name);
    }
    report.tris[level] = Math.round(tris);
    report.calls[level] = groups.size + beltCalls;
  });
  report.attach = Object.keys(attach).filter(k => attach[k]);
  report.height = whole.max.y - whole.min.y;
  return { root, report };
}

// ---------- a body or a whole unit from 機体エディタ Ver2 / the body tools replaces the loaded model's body ----------
// What stays: the head (and neck), the hand weapons (gun / bazooka), blockouts. The head is set on the new neck and the
// weapons follow the right hand. The new parts are hulls with their bone and the point it turns at (joint).
function applyBody(list, anchors, opt = {}) {
  rebuild();
  const boxOf = (ps, pick = () => true) => { const b = new THREE.Box3(); for (const p of ps) for (const g of worldGeometries(p)) if (pick(g)) b.union(g.boundingBox); return b; };
  const solid = parts.filter(p => p.op === 'add' && !p.blockout);
  const stays = p => p.blockout || (!opt.replaceHead && boneGroupOf(p) === 'head') || isHeld(p);   // (replaceHead: the new parts bring their own head)
  const oldHand = opt.weaponHand ? new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(...opt.weaponHand), new THREE.Vector3(1e-4, 1e-4, 1e-4)) : boxOf(solid.filter(p => !isHeld(p) && boneGroupOf(p) === 'fore' && /手/.test(p.name) && !/手首/.test(p.name)), g => g.boundingBox.min.x + g.boundingBox.max.x < 0);
  const head = boxOf(solid.filter(p => boneGroupOf(p) === 'head' && !/^首/.test(p.name)));
  const gone = new Set(parts.filter(p => !stays(p)).map(p => p.id));
  for (const p of parts) if (gone.has(p.id)) p._geo?.dispose();
  parts = parts.filter(p => !gone.has(p.id));
  const shift = (p, d) => { p.proxy.position.x += p.mirror ? 0 : d.x; p.proxy.position.y += d.y; p.proxy.position.z += d.z; };
  if (anchors?.hand_r && !oldHand.isEmpty()) { const d = new THREE.Vector3(...anchors.hand_r).sub(oldHand.getCenter(new THREE.Vector3())); for (const p of parts) if (!p.blockout && isHeld(p)) shift(p, d); }
  const added = list.map(d => makePart({ metal: d.glow ? 0 : 0.45, rough: 0.5, ...d }));
  parts.push(...added);
  // the head: with a neck (parts named 首…), the head sits just over the neck's root and the neck goes down into the collar;
  // without one, it is set down onto what the new chest has under it (2 cm into it, so that it is joined)
  if (anchors?.neck && !head.isEmpty() && !opt.replaceHead) {
    const heads = parts.filter(p => !p.blockout && boneGroupOf(p) === 'head' && !isHeld(p));
    let y = anchors.neck[1] + 0.02;
    if (!heads.some(p => /^首/.test(p.name))) {
      const c = head.getCenter(new THREE.Vector3()), col = new THREE.Box3(new THREE.Vector3(c.x - 0.05, -Infinity, c.z - 0.05), new THREE.Vector3(c.x + 0.05, Infinity, c.z + 0.05));
      const under = boxOf(added.filter(p => boneGroupOf(p) === 'torso' && !isLight(p)), g => g.boundingBox.intersectsBox(col));
      if (!under.isEmpty()) y = under.max.y - 0.02;
    }
    const d = new THREE.Vector3(0, y - head.min.y, 0);
    for (const p of heads) shift(p, d);
  }
  for (const p of parts) p.pos = p.proxy.position.toArray();   // (the parts' own numbers follow what was moved)
  rebuild();
  return { added: list.length, removed: gone.size, head: !head.isEmpty() || !!opt.replaceHead, weapons: parts.some(p => !p.blockout && isHeld(p)) };
}

// ---------- what the screens and the tools call ----------
const findings = (joints, most) => Object.entries(joints).filter(([k, r]) => !k.startsWith('__') && (r.off.length || r.cut.length))
  .map(([name, r]) => `${name}: ${[...r.off.map(x => x + ' が外れる'), ...r.cut.slice(0, most).map(x => x + ' がめり込む')].join('、')}`);
export const XS = {
  /** resolves when the game's moves (poses.json) are in: the joint check needs them */
  ready: async () => { await posesReady; if (!Object.keys(MOVES).length) throw new Error('ゲームの動きのデータ（poses.json）を読めませんでした'); return true; },
  /** load a document { parts, ai, role } (tools/xs-models/*.json; parts: [] = nothing yet) */
  load: doc => {
    for (const p of parts) p._geo?.dispose();
    parts = structuredClone(doc.parts ?? []).map(makePart);
    sceneAi = String(doc.ai ?? '').slice(0, 40);
    sceneRole = String(doc.role ?? '');
    ensureMeshes(parts.filter(p => p.kind === 'mesh').map(p => p.mesh));
    for (const p of parts) if (p.kind === 'mesh' && p.joints && MESHES.has(p.mesh)) applyJoints(p);   // (a shape already loaded: cut it as this document says)
  },
  /** the loaded document as it is now */
  doc: () => ({ ai: sceneAi, role: sceneRole, parts: parts.map(serialize) }),
  /** put a body from the body tools (the items of a 組み立て JSON) on the loaded model: its head and hand weapons stay */
  applyBody: (items, adj = {}) => {
    const { parts: list, anchors } = bodyParts(register(items).filter(it => byId[it.part]), adj);
    return applyBody(list, anchors);
  },
  /** put a whole unit of 機体エディタ Ver2 (its 機体の JSON: head, body, lengths, paint, its own parts) on the loaded model: only
   *  the hand weapons stay. opt.weaponHand: where the right hand was when those weapons were placed (a weapon set from samples/) */
  applyUnit: async (doc, opt = {}) => {
    registerUnit(doc);
    const u = unitParts(doc);
    const done = applyBody(u.parts, u.anchors, { replaceHead: u.head, ...opt });
    // imported meshes (kind 'mesh'): load them and cut them at their joints before anything is checked or exported
    const ids = [...new Set(parts.filter(p => p.kind === 'mesh' && p.mesh).map(p => p.mesh))];
    if (ids.length) {
      ensureMeshes(ids);
      for (let i = 0; i < 300 && !ids.every(id => MESHES.has(id)); i++) await new Promise(r => setTimeout(r, 100));
      for (const p of parts) if (p.kind === 'mesh' && p.joints && MESHES.has(p.mesh)) applyJoints(p);
      rebuild();
    }
    return done;
  },
  /** the loaded model's hand weapons and where its right hand is (to make a weapon set for samples/) */
  weapons: () => {
    rebuild();
    const b = new THREE.Box3();
    for (const p of parts) if (p.op === 'add' && !p.blockout && !isHeld(p) && boneGroupOf(p) === 'fore' && /手/.test(p.name) && !/手首/.test(p.name))
      for (const g of worldGeometries(p)) if (g.boundingBox.min.x + g.boundingBox.max.x < 0) b.union(g.boundingBox);
    return { hand_r: b.isEmpty() ? null : b.getCenter(new THREE.Vector3()).toArray(), parts: parts.filter(p => !p.blockout && isHeld(p)).map(serialize) };
  },
  /** both checks on the loaded model: floating groups and the joint check's findings (id: a_raid ...; the moves of that XS) */
  check: id => {
    const label = it => getPart(it.id)?.name ?? '?';
    const floating = checkConnections().floating.map(f => [...new Set(f.members.map(label))].slice(0, 4).join('、') + (f.gap === undefined ? '' : `（本体まで ${f.gap.toFixed(3)}）`));
    const joints = jointCheck(XS_INFO[id] ? id : '');
    return { floating, loose: findings(joints, 4), depths: joints.__depths };
  },
  /** the loaded model for the game → { glb (base64), report, loose } */
  exportNow: (id, skipCheck = false) => new Promise((resolve, reject) => {
    const { root, report } = buildGameModel();
    const loose = skipCheck ? [] : findings(jointCheck(XS_INFO[id] ? id : ''), 3);
    new GLTFExporter().parse(root, data => {
      const b = new Uint8Array(data); let bin = '';
      for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
      resolve({ glb: btoa(bin), report, loose });
    }, reject, { binary: true });
  }),
  /** a document { parts, ai, role } → the game's model (tools/exportxs.ts) */
  exportGame: (doc, id) => { XS.load({ ...doc, role: doc.role ?? id.replace(/^[ab]_/, '') }); return XS.exportNow(id); },
};
