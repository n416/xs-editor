// 機体エディタ Ver2 のパーツエディタ：パーツ 1 つを、ブロックを足す・削る・直すで作る画面。
// 開くと画面ぜんたいがパーツ用に切り替わる：左＝ブロックの一覧と足す形、右＝選んだブロックの設定、3D はそのパーツに寄り、ほかのパーツは薄く（か隠す）。
// パーツ = いくつかのブロックの集まり。ブロックの種類と設定は partgeo.js（機体エディタ index.html の部品と同じ 3 種類）：
//   面で囲った形（凸）：角を動かす・面を押す引く・角を足す消す・辺の面取り
//   押し出し          ：正面・側面・上面の断面を描く、厚み・テーパー・面取り・角の面取り・傾き・盛り上がり
//   回転体            ：断面（右半分）を描く、分割数・角の面取り
// どのブロックにも：足す／引く（上に並ぶブロックを削る）、左右ミラー、繰り返し、位置・大きさの数値、色の役、当たり判定なし。
// 元に戻す・やり直す（Ctrl+Z / Ctrl+Y）は、パーツエディタを開いてからの操作を 1 つずつ。
// 直すのはいつも「自分のパーツ」（id が u· で始まる。カタログのパーツを開くと、写しを作ってそれを直す。元は変わらない）。
// v2.js が ctx（3D の画面・つまみ・置いたパーツ・保存の出入り口）を渡す。
import * as THREE from 'three';
import { buildHull, hullReach, movePlanes } from './hull.js';
import { planesFromPoints } from './xsasm-lib.js';
import { ROLE_LABEL, roleOf } from './paint.js';
import { KIND_LABEL, BLOCK0, kindOf, isSub, soloGeo, boxOf, pointsOf, roundCorners, latheLoop, tfMatrix } from './partgeo.js';
import { BONE_CHOICES, PIVOT_CHOICES, groupOfPart, pivotOfPart, isGlowPart, isTrackedSet } from './freeparts.js';
import { profileEditor } from './v2-profile.js';

const ROLE_COLOR = { main: '#c3c9d2', sub: '#6b727d', frame: '#23262c', accent: '#b8483e', glow: '#ffd257' };
const r5 = v => Math.round(v * 1e5) / 1e5, r7 = v => Math.round(v * 1e7) / 1e7, r4 = v => Math.round(v * 1e4) / 1e4, r1 = v => Math.round(v * 10) / 10;
const fmt = v => String(+(+v).toFixed(4));
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const $ = s => document.querySelector(s);
const val = (pc, k) => pc[k] ?? BLOCK0[k];

/** 平面の集まり → 角（頂点）の並び [[x, y, z], ...]。近い点（0.0002 以内）は 1 つに：4 枚以上の面が集まる角は、面の数値を丸めた分だけ
 *  ごく小さな面に割れて、ほぼ同じ所に点がいくつも出る */
export function cornersOf(planes) {
  const h = buildHull(planes, { reach: hullReach(planes) }), out = [], T = 2e-4;
  for (let i = 0; i < h.positions.length; i += 3) {
    const x = h.positions[i], y = h.positions[i + 1], z = h.positions[i + 2];
    if (!out.some(q => Math.abs(q[0] - x) < T && Math.abs(q[1] - y) < T && Math.abs(q[2] - z) < T)) out.push([x, y, z]);
  }
  return out;
}
/** 角の並び → 平面の集まり。体積が無ければ（点が 1 つの面の上に並ぶ）null。
 *  直すたびに 面 → 角 → 面 と行き来するので、数値のわずかなずれで 1 枚の面が 2 枚に割れないよう、ほぼ同じ面（向きの差 0.1° 未満・位置の差 0.0002 未満）は
 *  外側の 1 枚にまとめる（割れると、辺の途中に要らない角が増えていく） */
export function planesOf(pts) {
  if (pts.length < 4) return null;
  const pl = [];
  for (const p of planesFromPoints(pts, 5e-5)) {
    const k = pl.findIndex(q => q[0] * p[0] + q[1] * p[1] + q[2] * p[2] > 1 - 2e-6 && Math.abs(q[3] - p[3]) < 2e-4);
    if (k < 0) pl.push(p); else if (p[3] > pl[k][3]) pl[k] = p;
  }
  for (let i = 0; i < pl.length; i++) pl[i] = pl[i].map(r7);
  if (pl.length < 4) return null;
  const h = buildHull(pl, { reach: hullReach(pl) });
  return h.positions.length >= 36 ? pl : null;
}
/** 面で囲った形の、足すときの形：中心 c・大きさ [w, h, d] の角の並び */
export const PRIMS = {
  箱: (c, [w, h, d]) => [-1, 1].flatMap(x => [-1, 1].flatMap(y => [-1, 1].map(z => [c[0] + x * w / 2, c[1] + y * h / 2, c[2] + z * d / 2]))),
  くさび: (c, [w, h, d]) => [...[-1, 1].flatMap(x => [-1, 1].map(z => [c[0] + x * w / 2, c[1] - h / 2, c[2] + z * d / 2])), ...[-1, 1].map(x => [c[0] + x * w / 2, c[1] + h / 2, c[2] - d / 2])],
  台形: (c, [w, h, d]) => [...[-1, 1].flatMap(x => [-1, 1].map(z => [c[0] + x * w / 2, c[1] - h / 2, c[2] + z * d / 2])), ...[-1, 1].flatMap(x => [-1, 1].map(z => [c[0] + x * w * 0.3, c[1] + h / 2, c[2] + z * d * 0.3]))],
  六角柱: (c, s) => prism(c, s, 6), 八角柱: (c, s) => prism(c, s, 8), 円柱: (c, s) => prism(c, s, 16),
};
function prism(c, [w, h, d], n) {
  return Array.from({ length: n }, (_, k) => { const t = (k + 0.5) / n * Math.PI * 2; return [-1, 1].map(y => [c[0] + Math.sin(t) * w / 2, c[1] + y * h / 2, c[2] + Math.cos(t) * d / 2]); }).flat();
}
/** 断面から作る形（機体エディタの「＋ 部品」と同じ顔ぶれ）。大きさは足すときにパーツに合わせて縮める。at：置き方（top = 選んだブロックの上、front = 前の面に埋める） */
const rect = (w, h) => [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]];
const SHAPES = {
  あたり箱: { kind: 'extrude', pts: rect(0.6, 0.6), depth: 0.6, bevel: 0, corner: 0, blockout: true },   // 下書き（書き出す形に入らない）。機体エディタの部品でできたパーツだけ
  面取り箱: { kind: 'extrude', pts: rect(0.8, 0.8), depth: 0.8, bevel: 0.05, bevelSegs: 1 },
  丸箱: { kind: 'extrude', pts: rect(0.8, 0.8), depth: 0.8, bevel: 0.1, bevelSegs: 4, corner: 0.15, cornerSegs: 4 },
  装甲板: { kind: 'extrude', pts: [[-0.8, -0.5], [0.5, -0.5], [0.8, -0.15], [0.8, 0.5], [-0.55, 0.5], [-0.8, 0.25]], depth: 0.2, bevel: 0.035, corner: 0.06 },
  先細り: { kind: 'extrude', pts: [[-0.6, -0.3], [0.6, -0.3], [0.3, 0.3], [-0.3, 0.3]], depth: 0.6, bevel: 0.04, corner: 0.05, taper: 0.6 },
  関節: { kind: 'lathe', pts: [[0.3, -0.2], [0.36, -0.13], [0.36, 0.13], [0.3, 0.2]], segments: 28 },
  スラスター: { kind: 'lathe', pts: [[0.12, 0.3], [0.15, 0.12], [0.28, -0.15], [0.33, -0.3]], segments: 24 },
  六角ナット: { kind: 'lathe', pts: [[0.12, -0.05], [0.12, 0.05]], segments: 6 },
  ピストン: { kind: 'lathe', pts: [[0.12, -0.6], [0.12, 0], [0.07, 0], [0.07, 0.6]], segments: 20 },
  自由な回転体: { kind: 'lathe', pts: [[0.4, -0.4], [0.4, 0.4]], segments: 32 },
  スリット: { kind: 'extrude', op: 'sub', pts: rect(0.5, 0.05), depth: 0.2, arrayCount: 4, arrayStep: [0, 0.1, 0], at: 'front', size: 0.35 },
  丸穴: { kind: 'lathe', op: 'sub', pts: [[0.1, -0.6], [0.1, 0.6]], segments: 20, at: 'front', size: 0.5, turn: [90, 0, 0] },
  パネルライン: { kind: 'extrude', op: 'sub', pts: rect(0.025, 0.8), depth: 0.06, at: 'front', size: 0.7 },
};
const GROUPS = [
  ['角と面を動かせる形（凸）', Object.keys(PRIMS), 'prim'],
  ['断面を描いて押し出す形', ['面取り箱', '丸箱', '装甲板', '先細り'], 'shape'],
  ['断面を回して作る形（回転体）', ['関節', 'スラスター', '六角ナット', 'ピストン', '自由な回転体'], 'shape'],
  ['削る形（引く）', ['スリット', '丸穴', 'パネルライン', '箱で削る'], 'shape'],
];

const CSS = `
body.pe .asm { display: none !important; }
body:not(.pe) .peonly { display: none !important; }
#peHead { flex: 1; display: flex; align-items: center; gap: 8px; }
#peHead b { color: var(--acc); white-space: nowrap; }
#peHead input { max-width: 240px; }
#peHead .hint { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#peLeft, #peRight { font-size: 12px; }
#peLeft { padding: 0 8px 12px; overflow: auto; flex: 1; }
.pelist { display: flex; flex-direction: column; gap: 1px; max-height: 38vh; overflow: auto; border: 1px solid var(--line); border-radius: 4px; padding: 2px; }
.pelist > div { display: flex; align-items: center; gap: 5px; padding: 2px 5px; border-radius: 3px; cursor: pointer; }
.pelist > div.sel { background: #2b4a6f; }
.pelist > div.flash { animation: flash .9s ease-in-out; }
.pelist > div span.nm { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pelist .bd { width: 14px; height: 14px; border-radius: 3px; font-size: 10px; line-height: 14px; text-align: center; font-weight: 700; flex: none; color: #111; background: #7fd18b; }
.pelist .bd.sub { background: #ff8b8b; }
.pelist .sw { width: 10px; height: 10px; border-radius: 2px; border: 1px solid #0006; flex: none; }
.pelist .mk { color: var(--dim); font-size: 10.5px; flex: none; }
.pebar { display: flex; flex-wrap: wrap; gap: 3px; margin: 4px 0; align-items: center; }
.pebar button, .pegrid button, #peTools button { padding: 2px 7px; font-size: 12px; }
.pegrid { display: flex; flex-wrap: wrap; gap: 3px; margin: 2px 0 6px; }
.pegrid button.subp { border-color: #7a4545; }
button.on { border-color: var(--acc); background: #2b4a6f; }
#peRight h2 { margin: 10px 0 4px; }
#peRight .row label { width: 62px; }
#peRight .row3 input[type=number] { width: 68px; }
#peRight .sl { display: grid; grid-template-columns: 78px 1fr 62px; gap: 6px; align-items: center; margin: 2px 0; }
#peRight .sl label { color: var(--dim); }
#peRight .sl input[type=number] { width: 62px; }
#peRight .seg { display: flex; gap: 3px; }
#peRight .seg button { flex: 1; }
#peProfile { width: 100%; aspect-ratio: 1; background: #0f1114; border: 1px solid var(--line); border-radius: 4px; display: block; touch-action: none; }
#peTools { position: absolute; left: 10px; top: 40px; display: flex; flex-wrap: wrap; gap: 4px 10px; align-items: center; max-width: calc(100% - 20px); }
#peTools .g { display: flex; gap: 3px; align-items: center; }
#peTools .g > span { color: var(--dim); font-size: 11px; }
`;

export function initPartEdit(ctx) {
  const { camera, orbit, gizmo, canvas } = ctx;
  const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
  const E = { head: $('#peHead'), left: $('#peLeft'), right: $('#peRight'), tools: $('#peTools') };
  let st = null;   // 開いている間の状態
  let prof = null; // 断面を描く画面
  const handleGeo = new THREE.SphereGeometry(1, 12, 8);
  const handleMat = new THREE.MeshBasicMaterial({ color: 0xffd257, depthTest: false }), handleSel = new THREE.MeshBasicMaterial({ color: 0xff5a4a, depthTest: false }), handleSym = new THREE.MeshBasicMaterial({ color: 0xff9a6a, depthTest: false });
  const outlineMat = new THREE.LineBasicMaterial({ color: 0x6fb3ff, depthTest: false });
  const ghostMat = new THREE.MeshBasicMaterial({ color: 0xff6b6b, transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide });
  const ghostSelMat = new THREE.MeshBasicMaterial({ color: 0xff6b6b, transparent: true, opacity: 0.26, depthWrite: false, side: THREE.DoubleSide });
  const ghostEdge = new THREE.LineBasicMaterial({ color: 0xff8b8b, transparent: true, opacity: 0.7 });
  const faintMat = new THREE.MeshStandardMaterial({ color: 0x8a94a3, metalness: 0, roughness: 0.9, transparent: true, opacity: 0.055, depthWrite: false, flatShading: true });
  const holder = new THREE.Group();   // つまみ・角の印・枠・引くブロックの影を入れる（直しているパーツの置いた 1 個と同じ置き方）
  const ray = new THREE.Raycaster();
  let outline = null;

  const block = () => (st && st.sel >= 0 ? st.def.pieces[st.sel] : null);
  /** 角・面を直せるブロックか：面で囲った形で、置き方（tf）を持たないもの。機体エディタ（1）から来た面の形は置き方を持つ（「置き方を形に焼き込む」で直せるようになる） */
  const hullEdit = pc => !!pc && kindOf(pc) === 'hull' && !pc.tf;
  /** 直しているパーツの、置いてある 1 個（+x の側を優先）とその Group */
  function instance() {
    const its = ctx.items(), ix = its.map((it, i) => i).filter(i => its[i].part === st.def.id);
    const i = ix.find(k => its[k].scal[0] > 0) ?? ix[0];
    return i == null ? null : { item: its[i], group: ctx.groups()[i], index: i };
  }
  /** holder を、置いた 1 個の置き方に合わせる（中の座標がパーツの座標になる） */
  function seat() {
    const ins = instance();
    if (!ins?.group) { holder.parent?.remove(holder); return false; }
    for (const h of ins.group.userData.hinges) h.sub.rotation.x = 0;   // スカートは閉じた姿勢で直す
    ins.group.parent.add(holder);
    holder.position.copy(ins.group.position); holder.quaternion.copy(ins.group.quaternion); holder.scale.copy(ins.group.scale);
    holder.updateMatrixWorld(true);
    return true;
  }
  const worldScale = () => { const s = holder.getWorldScale(new THREE.Vector3()); return (Math.abs(s.x) + Math.abs(s.y) + Math.abs(s.z)) / 3 || 1; };
  const posOf = pc => pc.pos ?? [0, 0, 0];

  // ---- ほかのパーツの見せ方・視点 ----
  /** 直しているパーツの置いた 1 個だけをふつうに描き、ほかは薄く（faint）・隠す（hide）・そのまま（show） */
  function dimOthers() {
    const ins = instance(), groups = ctx.groups();
    ctx.repaint();
    groups.forEach((g, i) => {
      const mine = ins && i === ins.index;
      for (const t of [g, ...g.userData.extra.values()]) {
        t.visible = mine || st.others !== 'hide';
        if (mine) t.traverse(o => { if (o.isMesh && o.userData.pc?.blockout) o.visible = st.showBlock; });   // あたり（下書き）を見せる・隠す
        if (!mine && st.others === 'faint') t.traverse(o => { if (o.isMesh) o.material = faintMat; });
      }
    });
  }
  /** パーツが画面いっぱいに入るよう、視点を寄せる（向きは今のまま） */
  function frame() {
    const ins = instance(); if (!ins?.group) return;
    const b = new THREE.Box3();
    for (const t of [ins.group, ...ins.group.userData.extra.values()]) { t.updateMatrixWorld(true); b.expandByObject(t); }
    if (b.isEmpty()) return;
    const c = b.getCenter(new THREE.Vector3()), r = Math.max(0.02, b.getSize(new THREE.Vector3()).length() / 2), dist = r / Math.tan(15 * Math.PI / 180) * 1.6;
    const dir = camera.position.clone().sub(orbit.target).normalize();
    orbit.target.copy(c); camera.position.copy(c).addScaledVector(dir, dist); orbit.update();
    ctx.setFocus({ c, dist });
  }

  // ---- 枠・影・つまみ ----
  function clearHelpers() {
    gizmo.detach();
    for (const o of [...holder.children]) { holder.remove(o); if (o.userData.own) o.geometry?.dispose(); }
    outline = null;
    if (st) { st.handles = []; st.helper = null; st.ghosts = new Map(); }
  }
  const moved = (g, p) => g.translate(p[0], p[1], p[2]);
  function drawOutline() {
    const pc = block();
    if (outline) { holder.remove(outline); outline.geometry.dispose(); outline = null; }
    if (!pc) return;
    const g = moved(soloGeo(pc), posOf(pc));
    outline = new THREE.LineSegments(new THREE.EdgesGeometry(g, 20), outlineMat); outline.renderOrder = 9; outline.userData.own = true;
    g.dispose(); holder.add(outline);
  }
  /** 引くブロックの影（赤く薄い形）。見せる設定のときと、選んでいるとき */
  function drawGhost(pc) {
    const old = st.ghosts.get(pc);
    if (old) for (const o of old) { holder.remove(o); o.geometry.dispose(); }
    st.ghosts.delete(pc);
    const sel = pc === block();
    if (!isSub(pc) || !(st.showSubs || sel)) return;
    const g = moved(soloGeo(pc), posOf(pc));
    const m = new THREE.Mesh(g, sel ? ghostSelMat : ghostMat); m.userData.pc = pc; m.userData.own = true;
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(g, 20), ghostEdge); e.userData.own = true;
    holder.add(m, e); st.ghosts.set(pc, [m, e]);
  }
  /** 選んだブロックの形が変わった（ドラッグ中・数値を打っている間）：形と枠だけ作り直す */
  function live() {
    ctx.regeo(st.def);
    drawOutline();
    const pc = block(); if (pc && isSub(pc)) drawGhost(pc);
  }
  /** いまの選び方に合わせて、画面（左右の欄・枠・影・つまみ・角の印）を作り直す */
  function refresh(panel = true) {
    if (!st) return;
    clearHelpers();
    { const pc = block(); if (pc && !hullEdit(pc)) st.mode = 'block'; st.pts = hullEdit(pc) ? cornersOf(pc.planes) : null; }   // 角の並び（右の欄の「角の位置」も使う）
    renderHead(); renderLeft(); renderTools();
    if (panel) renderRight();   // （数値を打ち終えたときは右の欄を作り直さない：次の欄へ移った入力が消えないように）
    if (!seat()) return;
    dimOthers();
    for (const pc of st.def.pieces) drawGhost(pc);
    drawOutline();
    const pc = block();
    if (!pc) return;
    gizmo.showX = gizmo.showY = gizmo.showZ = true; gizmo.setSpace('world');
    const hull = hullEdit(pc);
    if (st.mode === 'corner') {
      const twin = symOn() && st.corner >= 0 ? mirrorIndex(st.pts, st.corner) : -1;
      st.handles = st.pts.map((p, i) => { const m = new THREE.Mesh(handleGeo, i === st.corner ? handleSel : i === twin ? handleSym : handleMat); m.position.set(...p); m.renderOrder = 10; m.userData.corner = i; holder.add(m); return m; });
      st.twin = twin;
      if (st.corner >= 0 && st.handles[st.corner]) { gizmo.setMode('translate'); gizmo.attach(st.handles[st.corner]); }
      sizeHandles();
    } else if (st.mode === 'face') {
      if (st.face >= 0 && pc.planes[st.face]) {
        const f = faceInfo(pc, st.face);
        if (!f) { st.face = -1; if (panel) renderRight(); return; }   // 形に出ていない面は選べない
        const h = new THREE.Object3D(); h.position.copy(f.c); h.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), f.n); holder.add(h);
        st.helper = h; st.n = f.n; st.c0 = f.c.clone(); st.pts0 = f.all; st.onIx = f.on; st.faceMoved = false;
        // 左右対称：反対側の同じ面（法線の x が逆）の角も、一緒に動かす
        st.symOn = null;
        if (symOn() && Math.abs(f.n.x) > 1e-3) {
          const unit = q => { const l = Math.hypot(q[0], q[1], q[2]) || 1; return q.map(v => v / l); }, a = unit(pc.planes[st.face]);
          const k = pc.planes.findIndex(q => { const b = unit(q); return Math.abs(b[0] + a[0]) < 1e-3 && Math.abs(b[1] - a[1]) < 1e-3 && Math.abs(b[2] - a[2]) < 1e-3 && Math.abs(b[3] - a[3]) < 1e-3; });
          if (k >= 0) st.symOn = faceInfo(pc, k)?.on ?? null;
        }
        gizmo.setMode('translate'); gizmo.setSpace('local'); gizmo.showX = gizmo.showZ = false; gizmo.attach(h);
      }
    } else if (hull) {
      const pts = cornersOf(pc.planes), c = pts.reduce((a, p) => a.add(new THREE.Vector3(...p)), new THREE.Vector3()).multiplyScalar(1 / Math.max(1, pts.length));
      const h = new THREE.Object3D(); h.position.copy(c); holder.add(h);
      st.helper = h; st.pts0 = pts; st.c0 = c.clone();
      gizmo.attach(h);
    } else {
      // 押し出し・回転体：置き方（位置・回転・拡大）をそのままつまみで動かす
      const tf = pc.tf ?? { p: [0, 0, 0], r: [0, 0, 0], s: [1, 1, 1] }, D = Math.PI / 180;
      const h = new THREE.Object3D(); h.position.set(...tf.p); h.rotation.set(tf.r[0] * D, tf.r[1] * D, tf.r[2] * D, 'XYZ'); h.scale.set(...tf.s); holder.add(h);
      st.helper = h;
      if (gizmo.mode === 'scale') gizmo.setSpace('local');
      gizmo.attach(h);
    }
  }
  /** 面 k の情報：{ n: 法線, c: 面の真ん中, all: 角ぜんぶ, on: 面の上の角の番号 }。形に出ていなければ null */
  function faceInfo(pc, k) {
    const pl = pc.planes[k], n = new THREE.Vector3(pl[0], pl[1], pl[2]).normalize(), l = Math.hypot(pl[0], pl[1], pl[2]) || 1;
    const all = cornersOf(pc.planes), onIx = all.map((p, i) => i).filter(i => Math.abs((all[i][0] * pl[0] + all[i][1] * pl[1] + all[i][2] * pl[2] - pl[3]) / l) < 1e-3);
    if (onIx.length < 3) return null;
    const c = onIx.reduce((a, i) => a.add(new THREE.Vector3(...all[i])), new THREE.Vector3()).multiplyScalar(1 / onIx.length);
    return { n, c, all, on: new Set(onIx) };
  }
  /** 角 i の、x = 0 をはさんだ反対側の角の番号（自分が x = 0 の上なら自分。無ければ −1） */
  function mirrorIndex(pts, i) {
    const p = pts[i];
    if (Math.abs(p[0]) < 1e-4) return i;
    return pts.findIndex((q, k) => k !== i && Math.abs(q[0] + p[0]) < 1e-3 && Math.abs(q[1] - p[1]) < 1e-3 && Math.abs(q[2] - p[2]) < 1e-3);
  }
  /** 左右対称に直すか：「左右対称に」が入っていて、選んだブロックがパーツの真ん中（x = 0）で左右対称のとき（片側だけのブロックでは効かせない） */
  const symOn = () => !!(st.sym && st.pts?.length && st.pts.every((p, i) => mirrorIndex(st.pts, i) >= 0));
  /** 角の印は、どれだけ寄っても同じ大きさに見えるようにする */
  const _w = new THREE.Vector3();
  function sizeHandles() {
    if (!st?.handles?.length) return;
    const k = 1 / worldScale();
    for (const h of st.handles) h.scale.setScalar(Math.max(1e-4, camera.position.distanceTo(h.getWorldPosition(_w)) * 0.007 * k));
  }

  // ---- 元に戻す・やり直す ----
  const snapshot = () => JSON.stringify({ name: st.def.name, pieces: st.def.pieces });
  /** 操作が 1 つ終わった：元に戻すの 1 区切りにして、このブラウザにも保存する（閉じても、直したところまで残る） */
  function commit() {
    const s = snapshot();
    if (st.hist[st.hpos]?.s === s) { st.hist[st.hpos].sel = st.sel; return; }
    st.hist.length = st.hpos + 1; st.hist.push({ s, sel: st.sel });
    if (st.hist.length > 300) st.hist.shift();
    st.hpos = st.hist.length - 1;
    ctx.saveUserPart(st.def);
    renderHistory();
  }
  function restore(pos) {
    if (pos < 0 || pos >= st.hist.length) { ctx.note(pos < 0 ? 'これより前には戻せません（パーツエディタを開いたときの形）' : 'やり直す操作はありません'); return; }
    st.hpos = pos;
    const d = JSON.parse(st.hist[pos].s);
    st.def.name = d.name; st.def.pieces.length = 0; st.def.pieces.push(...d.pieces);
    st.sel = Math.min(st.hist[pos].sel, st.def.pieces.length - 1); st.corner = st.face = -1;
    ctx.saveUserPart(st.def);
    ctx.rebuild();
    ctx.note(`${pos + 1} / ${st.hist.length}`);
  }
  const undo = () => restore(st.hpos - 1), redo = () => restore(st.hpos + 1);
  function renderHistory() { ctx.undoButtons(st.hpos > 0, st.hpos < st.hist.length - 1); }

  // ---- 画面：上（名前・完了）・左（ブロックの一覧・足す）・3D の上（見せ方）・右（選んだブロック） ----
  function renderHead() {
    const d = st.def;
    if (E.head.dataset.id !== d.id) {
      E.head.dataset.id = d.id;
      E.head.innerHTML = `<b>パーツエディタ</b><input type="text" id="peName" title="パーツの名前"><span class="hint"></span>
        <button id="peDone" class="acc" title="このパーツを保存して、機体の組み立てに戻る（カタログの同じ部位に ★ 付きで残る）">完了して機体へ戻る</button>
        <button id="peCancel" title="パーツエディタを開く前の形に戻して、機体の組み立てに戻る">やめる（開く前に戻す）</button>`;
      $('#peName').oninput = e => { d.name = e.target.value || d.name; };
      $('#peName').onchange = () => commit();
      $('#peDone').onclick = () => finish(true);
      $('#peCancel').onclick = () => finish(false);
    }
    if (document.activeElement !== $('#peName')) $('#peName').value = d.name;
    E.head.querySelector('.hint').textContent = `部位：${d.cat}${d.base ? `（元：${ctx.byId[d.base]?.name ?? ctx.byId['h·' + d.base]?.name ?? d.base}）` : ''}`;
    renderHistory();
  }
  function renderLeft() {
    const d = st.def;
    E.left.innerHTML = `
      <h2>ブロック <i style="font-style:normal;font-weight:400">${d.pieces.length} 個</i></h2>
      <div class="pelist">${d.pieces.map((p, i) => `<div data-i="${i}" class="${i === st.sel ? 'sel' : ''}"><span class="bd ${isSub(p) ? 'sub' : ''}" ${p.blockout ? 'style="background:#7fbfff" title="あたり（下書き）"' : ''}>${p.blockout ? 'あ' : isSub(p) ? '−' : '+'}</span>${isSub(p) ? '' : `<span class="sw" style="background:${ctx.colorOf(p, d)}"></span>`}<span class="nm">${esc(p.name)}</span><span class="mk">${p.mirror ? '⇋' : ''}${val(p, 'arrayCount') > 1 ? ` ×${val(p, 'arrayCount')}` : ''}</span></div>`).join('')}</div>
      <div class="pebar"><button id="peUp" title="一覧の上へ">↑</button><button id="peDown" title="一覧の下へ">↓</button><button id="peDup" title="同じブロックをもう 1 つ（Ctrl+D）">複製</button><button id="peMir" title="左右（x）を反転した写しを足す">反転の複製</button><button id="peDel" title="選んだブロックを消す（Delete）">消す</button></div>
      <div class="hint">「−」は引くブロック：自分より上に並ぶブロックを削る</div>
      <h2>ブロックを足す</h2>
      ${GROUPS.map(([title, names, how]) => `<div class="hint">${title}</div><div class="pegrid">${(how === 'shape' && names[0] === '面取り箱' && st.def.free ? ['あたり箱', ...names] : names).map(k => `<button data-${how === 'prim' ? 'prim' : 'shape'}="${k}" class="${SHAPES[k]?.op === 'sub' || k === '箱で削る' ? 'subp' : ''}">${k}</button>`).join('')}</div>`).join('')}
      <div class="hint">足した形は、選んでいるブロックに合わせた大きさで出る。削る形は、選んでいるブロックの前の面に埋めて出る</div>`;
    for (const el of E.left.querySelectorAll('[data-i]')) el.onclick = () => selectBlock(+el.dataset.i);
    for (const el of E.left.querySelectorAll('[data-prim]')) el.onclick = () => addPrim(el.dataset.prim);
    for (const el of E.left.querySelectorAll('[data-shape]')) el.onclick = () => (el.dataset.shape === '箱で削る' ? addPrim('箱', true) : addShape(el.dataset.shape));
    $('#peUp').onclick = () => moveBlock(-1); $('#peDown').onclick = () => moveBlock(1);
    $('#peDup').onclick = () => copyBlock(false); $('#peMir').onclick = () => copyBlock(true); $('#peDel').onclick = removeBlock;
    E.left.querySelector('.pelist .sel')?.scrollIntoView({ block: 'nearest' });
  }
  function renderTools() {
    const pc = block(), hull = hullEdit(pc);
    const nBlk = st.def.pieces.filter(p => p.blockout).length;
    E.tools.innerHTML = `
      <div class="g"><button id="peFrame" title="パーツが画面いっぱいに入るよう視点を寄せる（F）">パーツに寄る</button></div>
      <div class="g"><span>ほかのパーツ</span>${[['faint', '薄く'], ['hide', '隠す'], ['show', 'そのまま']].map(([k, t]) => `<button data-others="${k}" class="${st.others === k ? 'on' : ''}">${t}</button>`).join('')}</div>
      <div class="g"><button id="peSubs" class="${st.showSubs ? 'on' : ''}" title="引くブロックを、赤く薄い形で見せる">引くブロックを見せる</button></div>
      ${nBlk ? `<div class="g"><button id="peBlk" class="${st.showBlock ? 'on' : ''}" title="あたり（下書きのブロック。書き出す形には入らない）を見せる">あたりを見せる</button><button id="peBlkDel" title="あたり（下書き）のブロックを、ぜんぶ消す（装甲を付け終わったら）">あたりを消す（${nBlk} 個）</button></div>` : ''}
      ${hull ? `<div class="g"><span>直し方</span>
        <button data-mode="block" class="${st.mode === 'block' ? 'on' : ''}" title="ブロックごと動かす・回す・拡大する（1）">ブロックごと</button>
        <button data-mode="corner" class="${st.mode === 'corner' ? 'on' : ''}" title="黄色の角を押してから、つまみで動かす（2）">角</button>
        <button data-mode="face" class="${st.mode === 'face' ? 'on' : ''}" title="面を押してから、矢印で出し入れする（3）">面</button>
        <button id="peSym" class="${st.sym ? 'on' : ''}" title="角・面を動かすとき、パーツの真ん中（x = 0）をはさんだ反対側も同じだけ動かす">左右対称に</button></div>` : ''}`;
    $('#peFrame').onclick = frame;
    for (const el of E.tools.querySelectorAll('[data-others]')) el.onclick = () => { st.others = el.dataset.others; refresh(); };
    $('#peSubs').onclick = () => { st.showSubs = !st.showSubs; refresh(); };
    if ($('#peBlk')) {
      $('#peBlk').onclick = () => { st.showBlock = !st.showBlock; refresh(); };
      $('#peBlkDel').onclick = () => {
        const keep = st.def.pieces.filter(p => !p.blockout);
        if (!keep.some(p => !isSub(p))) { ctx.note('あたりを消すと、足すブロックが 1 個も残りません。先に装甲のブロックを付けてください', true); return; }
        if (!confirm(`あたり（下書き）のブロック ${nBlk} 個を消します。よろしいですか？（↶ 戻すで戻せます）`)) return;
        const cur = block();
        st.def.pieces.splice(0, st.def.pieces.length, ...keep);
        st.sel = Math.max(0, keep.indexOf(cur)); st.corner = st.face = -1;
        changed(true);
      };
    }
    for (const el of E.tools.querySelectorAll('[data-mode]')) el.onclick = () => setEditMode(el.dataset.mode);
    if ($('#peSym')) $('#peSym').onclick = () => { st.sym = !st.sym; refresh(); };
  }
  function setEditMode(m) { if (!hullEdit(block())) return; st.mode = m; st.corner = st.face = -1; if (m === 'block') gizmo.setMode('translate'); refresh(); }

  // 右の欄の入力：id → { get, set }。打っている間は形だけ作り直し（live）、打ち終えたら元に戻すの 1 区切り（commit）
  let binds = {};
  const bind = (id, get, set) => { binds[id] = { get, set }; return id; };
  const num = (id, step, w = '') => `<input type="number" data-f="${id}" step="${step}" value="${fmt(binds[id].get())}" ${w}>`;
  const row3 = (label, ids, step) => `<div class="row row3"><label>${label}</label>${ids.map(id => num(id, step)).join('')}</div>`;
  const slider = (label, id, min, max, step) => `<div class="sl"><label>${label}</label><input type="range" data-f="${id}" min="${min}" max="${max}" step="${step}" value="${binds[id].get()}"><input type="number" data-f="${id}" step="${step}" value="${fmt(binds[id].get())}"></div>`;
  const check = (label, id, title = '') => `<label class="chk" title="${title}"><input type="checkbox" data-c="${id}" ${binds[id].get() ? 'checked' : ''}>${label}</label>`;
  /** 面で囲った形：角を中心 c のまわりに k 倍して、中心を to へ */
  function hullTo(pc, c, k, to) {
    const pl = planesOf(cornersOf(pc.planes).map(p => [0, 1, 2].map(a => to[a] + (p[a] - c[a]) * k[a])));
    if (pl) pc.planes = pl;
    return !!pl;
  }
  function renderRight() {
    prof?.dispose(); prof = null; binds = {};
    const d = st.def, pc = block();
    if (!pc) { E.right.innerHTML = '<h2>選んだブロック</h2><div class="hint">ブロックを 3D で押すか、左の一覧から選ぶ</div>'; return; }
    if (kindOf(pc) === 'mesh') {   // 取り込んだ形（GLB のスキン）
      const info = ctx.meshInfo(pc), tf = (pc.tf ??= { p: [0, 0, 0], r: [0, 0, 0], s: [1, 1, 1] });
      for (const k of ['p', 'r', 's']) [0, 1, 2].forEach(a => bind(k + a, () => tf[k][a], v => { if (k === 's' && Math.abs(v) < 1e-4) return; pc.tf[k][a] = v; }));
      E.right.innerHTML = `<h2>選んだブロック <i style="font-style:normal;font-weight:400">取り込んだ形</i></h2>
        <div class="row"><label>名前</label><input type="text" id="peBlockName" value="${esc(pc.name)}"></div>
        <div class="hint">外から取り込んだ形（スキン）${info ? `。三角形 ${Math.round(info.tris).toLocaleString()} 個・${info.cut ? '関節で切り分け済み（部品が 1 本の骨にまるごと付く）' : '付いてきた骨の付け方のまま'}・${info.tex ? 'テクスチャあり' : 'テクスチャなし'}` : '（読み込み中）'}。形そのものは描き直せない</div>
        <div class="pebar"><button id="peJoints" class="acc" title="関節の球を置いて、どこで曲がるか・どの部品がどの骨に付くかを決める">関節と切り分け（3 面図）</button></div>
        <div class="pebar"><button id="peToBlocks" title="骨ごとに形を塊に分け、塊ごとにブロック（押し出し）に置き換える。頭（首の球より上）は元の形のまま残る。形の細かい所とテクスチャの模様はなくなる（↶ で戻せる）">ブロックの部品に変換（試作）</button></div>
        <h2>位置と大きさ</h2>${row3('位置', ['p0', 'p1', 'p2'], 0.01)}${row3('回転', ['r0', 'r1', 'r2'], 5)}${row3('拡大', ['s0', 's1', 's2'], 0.05)}`;
      $('#peBlockName').oninput = e => { if (e.target.value) pc.name = uniqueName(e.target.value, pc); };
      $('#peBlockName').onchange = () => { commit(); renderLeft(); };
      for (const el of E.right.querySelectorAll('[data-f]')) { el.oninput = () => { const v = parseFloat(el.value); if (Number.isFinite(v)) { binds[el.dataset.f].set(v); live(); } }; el.onchange = () => { commit(); refresh(false); }; }
      $('#peJoints').onclick = () => ctx.openJoints(pc);
      $('#peToBlocks').onclick = async () => {
        if (!confirm('この取り込んだ形を、ブロックの部品（約 100 個）に置き換えます。頭（首の球より上）は元の形のまま残します。ほかは、形の細かい所やテクスチャの模様がなくなります（↶ 戻すで戻せます）。')) return;
        ctx.note('ブロックに変えています…');
        const made = await ctx.toBlocks(pc); if (!made?.length) { ctx.note('変えられませんでした', true); return; }
        const used = new Set(st.def.pieces.map(p => p.name));
        for (const b of made) { let n = b.name; for (let k = 2; used.has(n); k++) n = `${b.name} ${k}`; b.name = n; used.add(n); }
        st.def.pieces.splice(st.sel, 1, ...made); st.sel = Math.min(st.sel, st.def.pieces.length - 1);
        changed(true); ctx.note(`ブロックの部品 ${made.length} 個に置き換えました`);
      };
      return;
    }
    const free = !!d.free;
    const kind = kindOf(pc), sub = isSub(pc), b = boxOf(pc), size = b.getSize(new THREE.Vector3()), S = Math.max(size.x, size.y, size.z, 0.01), step = S > 0.5 ? 0.01 : 0.001;
    const html = [];
    html.push(`<h2>選んだブロック <i style="font-style:normal;font-weight:400">${KIND_LABEL[kind]}</i></h2>
      <div class="row"><label>名前</label><input type="text" id="peBlockName" value="${esc(pc.name)}"></div>
      <div class="row"><label>はたらき</label><div class="seg" style="flex:1"><button data-op="add" class="${sub ? '' : 'on'}" title="形を足す">＋ 足す</button><button data-op="sub" class="${sub ? 'on' : ''}" title="自分より上に並ぶブロックを、この形で削る">− 引く</button></div></div>
      ${sub ? '' : free ? `<div class="row"><label>色</label><input type="color" id="peColor" value="${/^#[0-9a-f]{6}$/i.test(pc.color ?? '') ? pc.color : '#c3c9d2'}" style="width:48px;height:24px;padding:0"><label class="chk" style="width:auto;flex:1"><input type="checkbox" id="peTeam" ${pc.team ? 'checked' : ''}>陣営色で塗る</label></div>`
        : `<div class="row"><label>色の役</label><select id="peRole">${Object.entries(ROLE_LABEL).map(([k, v]) => `<option value="${k}" ${roleOf(pc) === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>`}`);
    // 位置と大きさ
    html.push('<h2>位置と大きさ</h2>');
    if (hullEdit(pc)) {
      const c = b.getCenter(new THREE.Vector3()).toArray(), sz = size.toArray();
      [0, 1, 2].forEach(a => bind('c' + a, () => c[a], v => { const b2 = boxOf(pc), c2 = b2.getCenter(new THREE.Vector3()).toArray(), to = c2.slice(); to[a] = v; hullTo(pc, c2, [1, 1, 1], to); }));
      [0, 1, 2].forEach(a => bind('z' + a, () => sz[a], v => { if (!(v > 1e-4)) return; const b2 = boxOf(pc), c2 = b2.getCenter(new THREE.Vector3()).toArray(), s2 = b2.getSize(new THREE.Vector3()).toArray(), k = [1, 1, 1]; k[a] = v / Math.max(1e-6, s2[a]); hullTo(pc, c2, k, c2); }));
      html.push(row3('中心', ['c0', 'c1', 'c2'], step), row3('大きさ', ['z0', 'z1', 'z2'], step), '<div class="hint">3 つの欄は 左右・上下・前後（パーツの座標）。回すのは 3D のつまみ（E）で</div>');
    } else {
      const tf = (pc.tf ??= { p: [0, 0, 0], r: [0, 0, 0], s: [1, 1, 1] });
      for (const [k, n] of [['p', 'p'], ['r', 'r'], ['s', 's']]) [0, 1, 2].forEach(a => bind(n + a, () => tf[k][a], v => { if (k === 's' && Math.abs(v) < 1e-4) return; pc.tf[k][a] = v; }));
      html.push(row3('位置', ['p0', 'p1', 'p2'], step), row3('回転', ['r0', 'r1', 'r2'], 5), row3('拡大', ['s0', 's1', 's2'], 0.05), '<div class="hint">3 つの欄は 左右・上下・前後（パーツの座標）。回転は度</div>');
    }
    // 種類ごとの形
    if (kind === 'hull') {
      bind('bevel', () => val(pc, 'bevel'), v => { pc.bevel = Math.max(0, v); });
      bind('bevelSegs', () => val(pc, 'bevelSegs'), v => { pc.bevelSegs = Math.max(1, Math.round(v)); });
      if (!hullEdit(pc)) html.push('<h2>形を直す</h2><div class="hint">この面の形は、置き方（位置・回転・拡大）を別に持っています。つまみと上の数値で動かせます。角・面を直すには、置き方を形に焼き込みます（面取りの幅は、拡大した後の大きさで掛かり直す）</div><div class="pebar"><button id="peBake">置き方を形に焼き込む（角・面を直せるようにする）</button></div>');
      else html.push(`<h2>形を直す</h2><div class="seg">
          <button data-mode="block" class="${st.mode === 'block' ? 'on' : ''}">ブロックごと</button><button data-mode="corner" class="${st.mode === 'corner' ? 'on' : ''}">角を動かす</button><button data-mode="face" class="${st.mode === 'face' ? 'on' : ''}">面を押す・引く</button></div>
        <div class="hint">${st.mode === 'corner' ? (st.corner >= 0 ? '選んだ角（赤）をつまみで動かす。別の角は押して選ぶ' : '黄色の角を押して選ぶ') : st.mode === 'face' ? (st.face >= 0 ? '矢印で面を出し入れする。別の面は押して選ぶ' : 'ブロックの面を押して選ぶ') : 'つまみで動かす（W 移動・E 回転・R 拡大）'}。角は ${st.pts.length} 個・面は ${pc.planes.length} 枚${st.mode !== 'block' && st.sym ? (symOn() ? '。左右対称に直す（反対側も一緒に動く）' : '。このブロックは左右対称でないので、動かした側だけが変わる') : ''}</div>`);
      if (st.mode === 'corner' && st.corner >= 0 && st.pts?.[st.corner]) {
        [0, 1, 2].forEach(a => bind('k' + a, () => st.pts[st.corner][a], v => moveCorner(a, v)));
        html.push(row3('角の位置', ['k0', 'k1', 'k2'], step), '<div class="pebar"><button id="peCornerDel" title="この角をなくす（残りの角で形を作り直す）">この角を消す</button></div>');
      }
      if (st.mode === 'face' && st.face >= 0) html.push('<div class="pebar"><button id="peFaceCorner" title="この面の真ん中に角を 1 つ足す（引き出すと、とがった形・屋根の形になる）">面の真ん中に角を足す</button><button id="peFaceDel" title="この面をなくす（となりの面が伸びてふさぐ）">この面をなくす</button></div>');
      html.push('<h2>辺の面取り</h2>', slider('面取り幅', 'bevel', 0, +(S * 0.25).toFixed(4), +(S / 400).toPrecision(1)), slider('段数', 'bevelSegs', 1, 6, 1), '<div class="hint">段数 1 は斜めに落とす、2 以上は丸める</div>');
    } else {
      const ex = kind === 'extrude';
      if (ex) {
        bind('depth', () => val(pc, 'depth'), v => { pc.depth = Math.max(0.002, v); });
        bind('taper', () => val(pc, 'taper'), v => { pc.taper = Math.max(0.05, v); });
        bind('bevel', () => val(pc, 'bevel'), v => { pc.bevel = Math.max(0, v); });
        bind('bevelSegs', () => val(pc, 'bevelSegs'), v => { pc.bevelSegs = Math.max(1, Math.round(v)); });
        bind('tiltY', () => val(pc, 'tiltY'), v => { pc.tiltY = v; });
        bind('ridge', () => val(pc, 'ridge'), v => { pc.ridge = Math.max(0, v); });
      } else bind('segments', () => val(pc, 'segments'), v => { pc.segments = Math.max(3, Math.min(64, Math.round(v))); });
      bind('corner', () => val(pc, 'corner'), v => { pc.corner = Math.max(0, v); });
      bind('cornerSegs', () => val(pc, 'cornerSegs'), v => { pc.cornerSegs = Math.max(1, Math.round(v)); });
      const xs = pc.pts.map(q => Math.abs(q[0])), ys = pc.pts.map(q => Math.abs(q[1])), P = Math.max(...xs, ...ys, 0.01), st3 = +(P / 200).toPrecision(1);
      const face = ex ? st.face2d : 'front';
      html.push(`<h2>断面${ex ? '（押し出し）' : '（回転体：右半分を描く）'}</h2>
        ${ex ? `<div class="seg">${[['front', '正面'], ['side', '側面'], ['top', '上面']].map(([k, t]) => `<button data-face2d="${k}" class="${face === k ? 'on' : ''}">${t}${k !== 'front' && pc[k] ? ' ●' : ''}</button>`).join('')}</div>
        <div class="hint">${face === 'front' ? '正面から見た形を押し出す。「側面」「上面」も描くと、3 つの形が重なる所だけが残る' : face === 'side' ? `横から見た形（右が前、上が上）。${pc.side ? '' : '点を動かすと使い始める。'}点線はブロックの範囲` : `上から見た形（下が前）。${pc.top ? '' : '点を動かすと使い始める。'}点線はブロックの範囲`}</div>` : ''}
        <canvas id="peProfile"></canvas>
        <div class="hint">点をドラッグ ・ 辺を押して点を足す ・ 点をダブルクリックで消す ・ 何もない所をドラッグで動かす ・ ホイールで拡大縮小</div>
        <div class="pebar"><label class="chk" style="flex:1"><input type="checkbox" id="peSnap" ${st.snap ? 'checked' : ''}><span id="peSnapLabel">グリッドに合わせる</span></label>${ex && face !== 'front' && pc[face] ? '<button id="peFaceClear">この向きの形を消す</button>' : ''}<button id="peFit">全体を見る</button></div>`);
      if (ex) html.push('<h2>押し出し</h2>', slider('厚み', 'depth', 0.002, +(Math.max(P * 4, val(pc, 'depth') * 2)).toFixed(3), st3), slider('テーパー', 'taper', 0.2, 1.6, 0.01),
        '<h2>厚みの方向の面取り</h2>', slider('面取り幅', 'bevel', 0, +(P * 0.4).toFixed(4), st3), slider('段数', 'bevelSegs', 1, 8, 1));
      else html.push('<h2>回転体</h2>', slider('分割数', 'segments', 3, 64, 1), '<div class="hint">分割数 4・6・8 で角柱になる</div>');
      html.push('<h2>断面の角</h2>', slider('面取り幅', 'corner', 0, +(P * 0.6).toFixed(4), st3), slider('段数', 'cornerSegs', 1, 8, 1));
      if (ex) html.push('<h2>正面を斜めにする</h2>', slider('厚みの傾き', 'tiltY', +(-1.5 / P).toFixed(2), +(1.5 / P).toFixed(2), +(0.02 / P).toPrecision(1)), slider('中央の盛り上がり', 'ridge', 0, +(2 / P).toFixed(2), +(0.02 / P).toPrecision(1)));
      html.push('<div class="pebar"><button id="peToHull" title="この形の外側を、角と面を動かせる形（凸）に変える。へこみは埋まり、断面の設定は使えなくなる">角と面を動かせる形に変える</button></div>');
    }
    // ミラー・繰り返し
    bind('mirror', () => !!pc.mirror, v => { pc.mirror = v; });
    bind('n', () => val(pc, 'arrayCount'), v => { pc.arrayCount = Math.max(1, Math.min(16, Math.round(v))); if (!pc.arrayStep) pc.arrayStep = [0, +(S * 1.2).toFixed(3), 0]; });
    [0, 1, 2].forEach(a => bind('a' + a, () => val(pc, 'arrayStep')[a], v => { pc.arrayStep = val(pc, 'arrayStep').slice(); pc.arrayStep[a] = v; }));
    html.push('<h2>ミラー・繰り返し</h2>', check('左右ミラー（パーツの真ん中 x = 0 で反転した写しも作る）', 'mirror'), slider('個数', 'n', 1, 16, 1), row3('間隔', ['a0', 'a1', 'a2'], step));
    if (!sub && free) {
      // 自由な部品（機体エディタの形式）：付く骨・回転の中心・光る・当たり判定・全高
      const tracked = isTrackedSet(d.pieces), autoB = BONE_CHOICES[groupOfPart({ ...pc, bone: 'auto' }, tracked)], autoP = PIVOT_CHOICES[pivotOfPart({ ...pc, pivot: 'auto' }) ?? 'none'];
      bind('glow', () => !!isGlowPart(pc), v => { pc.glow = v; });
      bind('noHit', () => !!pc.noHit, v => { pc.noHit = v; });
      bind('noHeight', () => !!pc.noHeight, v => { pc.noHeight = v; });
      bind('blockout', () => !!pc.blockout, v => { pc.blockout = v; });
      html.push('<h2>ゲーム用</h2>',
        `<div class="row"><label>付く骨</label><select id="peBone">${Object.entries(BONE_CHOICES).map(([k, v]) => `<option value="${k}" ${(pc.bone ?? 'auto') === k ? 'selected' : ''}>${v}${k === 'auto' ? ' → ' + autoB : ''}</option>`).join('')}</select></div>`,
        `<div class="row"><label>回転の中心</label><select id="pePivot">${Object.entries(PIVOT_CHOICES).map(([k, v]) => `<option value="${k}" ${(pc.pivot ?? 'auto') === k ? 'selected' : ''}>${v}${k === 'auto' ? ' → ' + autoP : ''}</option>`).join('')}</select></div>`,
        check('発光する（目・センサーなど）', 'glow'), check('当たり判定なし（関節チェックでめり込みを見ない）', 'noHit'), check('全高に数えない（頭より高い翼・背中の装備）', 'noHeight'), check('あたり（下書き。書き出さない）', 'blockout'),
        '<div class="hint">左右のある骨（腕・脚など）は、形の真ん中が機体のどちら側にあるかで左右が決まる</div>');
    } else if (!sub) {
      bind('noHit', () => !!pc.noHit, v => { if (v) pc.noHit = true; else delete pc.noHit; });
      html.push('<h2>ゲーム用</h2>', check('当たり判定なし（関節チェックでめり込みを見ない。動力パイプ・光）', 'noHit'), `<div class="hint">付く骨：${pc.bone ?? '（部位の既定）'}${pc.hinge ? '・蝶番あり' : ''}。光らせるには、色の役を「発光」に</div>`);
    }
    E.right.innerHTML = html.join('');

    // ---- つなぐ ----
    $('#peBlockName').oninput = e => { if (e.target.value) pc.name = uniqueName(e.target.value, pc); };
    $('#peBlockName').onchange = () => { commit(); renderLeft(); };
    for (const el of E.right.querySelectorAll('[data-op]')) el.onclick = () => { if ((el.dataset.op === 'sub') === sub) return; if (el.dataset.op === 'sub') { if (d.pieces.filter(p => !isSub(p)).length <= 1) { ctx.note('足すブロックが 1 個も残らなくなります', true); return; } pc.op = 'sub'; } else delete pc.op; changed(true); };
    if ($('#peColor')) { $('#peColor').oninput = e => { pc.color = e.target.value; ctx.repaint(); dimOthers(); }; $('#peColor').onchange = () => { commit(); renderLeft(); }; $('#peTeam').onchange = e => { pc.team = e.target.checked; commit(); }; }
    if ($('#peBone')) { $('#peBone').onchange = e => { pc.bone = e.target.value; changed(true); }; $('#pePivot').onchange = e => { pc.pivot = e.target.value; changed(true); }; }
    if ($('#peBake')) $('#peBake').onclick = bakeTf;
    if ($('#peRole')) $('#peRole').onchange = e => { const r = e.target.value; pc.color = ROLE_COLOR[r]; if (r === 'glow') pc.glow = true; else delete pc.glow; ctx.repaint(); dimOthers(); commit(); renderLeft(); };
    for (const el of E.right.querySelectorAll('[data-f]')) {
      el.oninput = () => { const v = parseFloat(el.value); if (!Number.isFinite(v)) return; binds[el.dataset.f].set(v); for (const o of E.right.querySelectorAll(`[data-f="${el.dataset.f}"]`)) if (o !== el) o.value = el.type === 'range' ? fmt(v) : v; live(); prof?.draw(); };
      el.onchange = () => { if (st.keepCorner) { reselectCorner(st.keepCorner); st.keepCorner = null; } commit(); refresh(false); };
    }
    for (const el of E.right.querySelectorAll('[data-c]')) el.onchange = () => { binds[el.dataset.c].set(el.checked); if (['glow', 'blockout'].includes(el.dataset.c)) ctx.rebuild(); else { ctx.regeo(st.def); refresh(false); } commit(); };
    for (const el of E.right.querySelectorAll('[data-mode]')) el.onclick = () => setEditMode(el.dataset.mode);
    if ($('#peCornerDel')) $('#peCornerDel').onclick = removeCorner;
    if ($('#peFaceCorner')) $('#peFaceCorner').onclick = addCornerOnFace;
    if ($('#peFaceDel')) $('#peFaceDel').onclick = removeFace;
    if ($('#peToHull')) $('#peToHull').onclick = toHull;
    for (const el of E.right.querySelectorAll('[data-face2d]')) el.onclick = () => { st.face2d = el.dataset.face2d; renderRight(); };
    if ($('#peProfile')) setupProfile(pc, kind);
  }
  /** 断面を描く画面をつなぐ */
  function setupProfile(pc, kind) {
    const ex = kind === 'extrude', face = ex ? st.face2d : 'front', key = face === 'front' ? 'pts' : face;
    // ブロックの範囲（その向きから見た）：正面の断面と厚みから
    const faceBox = () => { const xs = pc.pts.map(q => q[0]), ys = pc.pts.map(q => q[1]), h = val(pc, 'depth') / 2, t = Math.max(val(pc, 'taper'), 1); return face === 'side' ? [-h, h, Math.min(...ys) * t, Math.max(...ys) * t] : [Math.min(...xs) * t, Math.max(...xs) * t, -h, h]; };
    let draft = null;
    if (face !== 'front' && !pc[key]) { const [x0, x1, y0, y1] = faceBox(), m = 0.02 * Math.max(x1 - x0, y1 - y0, 0.01); draft = [[x0 - m, y0 - m], [x1 + m, y0 - m], [x1 + m, y1 + m], [x0 - m, y1 + m]].map(q => q.map(r4)); }
    const pts = () => pc[key] ?? draft;
    let created = false;
    prof = profileEditor($('#peProfile'), {
      pts, closed: ex, flipY: face === 'top', sub: isSub(pc), dim: !!draft && !pc[key], snap: () => st.snap,
      outline: () => (ex ? roundCorners(pts(), val(pc, 'corner'), val(pc, 'cornerSegs'), true) : latheLoop(pc)),
      box: face === 'front' ? null : faceBox,
      marks: face === 'side' ? [['前 →', 'tr'], ['← 後', 'tl']] : face === 'top' ? [['↓ 前', 'bl'], ['↑ 後', 'tl']] : [],
      onChange: () => { if (!pc[key] && draft) { pc[key] = draft; created = true; } live(); },
      onCommit: () => { commit(); if (created) renderRight(); },
      onGrid: (snap, major) => { const el = $('#peSnapLabel'); if (el) el.textContent = `グリッドに合わせる（${snap}）・太線の間隔 ${major}`; },
    });
    $('#peSnap').onchange = e => { st.snap = e.target.checked; };
    $('#peFit').onclick = () => prof.fit();
    if ($('#peFaceClear')) $('#peFaceClear').onclick = () => { pc[key] = null; changed(false); };
  }

  /** 形か並びが変わった。structure：ブロックの並び・足す引くが変わった（置いたパーツを作り直す） */
  function changed(structure) {
    if (structure || st.def.free) ctx.rebuild(); else { ctx.regeo(st.def); refresh(); }
    commit();
  }
  function uniqueName(name, skip = null) {
    const used = new Set(st.def.pieces.filter(p => p !== skip).map(p => p.name));
    if (!used.has(name)) return name;
    for (let k = 2; ; k++) if (!used.has(`${name} ${k}`)) return `${name} ${k}`;
  }
  function selectBlock(i) { st.sel = i; st.corner = st.face = -1; refresh(); flashBlock(); }
  // ---- 選んだブロックを光らせて知らせる（機体の画面と同じ）：3D のそのブロックと、左の一覧の行が 2 回点滅する。引くブロックは赤い影が光る
  const flashMat = new THREE.MeshBasicMaterial({ color: 0x6fb3ff, transparent: true, opacity: 0, depthTest: false, depthWrite: false });
  let fl = null;
  function endFlash() { if (!fl) return; for (const m of fl.meshes) m.parent?.remove(m); fl = null; }
  function flashBlock() {
    endFlash();
    const pc = block(), ins = instance(); if (!pc || !ins?.group) return;
    const src = [];
    for (const t of [ins.group, ...ins.group.userData.extra.values()]) t.traverse(o => { if (o.isMesh && o.userData.pc === pc) src.push(o); });
    const ghost = st.ghosts.get(pc)?.[0]; if (ghost) src.push(ghost);
    fl = { t0: performance.now(), meshes: src.map(o => { const m = new THREE.Mesh(o.geometry, flashMat); m.renderOrder = 8; m.raycast = () => {}; o.add(m); return m; }) };
    E.left.querySelector(`.pelist [data-i="${st.sel}"]`)?.classList.add('flash');
  }
  function tick(now = performance.now()) {
    sizeHandles();
    if (!fl) return;
    const t = (now - fl.t0) / 900;
    if (t >= 1) endFlash(); else flashMat.opacity = 0.55 * Math.abs(Math.sin(t * Math.PI * 2));
  }

  // ---- ブロックを足す・複製・消す・並べ替え ----
  /** 足すブロックが引き継ぐもの：付く骨・蝶番・回転の中心（選んでいるブロックか、最初のブロックから） */
  function carry(ref) {
    const out = {};
    for (const k of ['bone', 'pivot', 'hinge', 'metal', 'rough']) if (ref?.[k] !== undefined) out[k] = structuredClone(ref[k]);
    return out;
  }
  /** 足す場所の目安：選んでいるブロック（無ければパーツぜんたい）の範囲 */
  function refBox() {
    const pc = block();
    if (pc) return boxOf(pc);
    const b = new THREE.Box3();
    for (const p of st.def.pieces) if (!isSub(p)) b.union(boxOf(p));
    return b;
  }
  function pushBlock(pc) {
    st.def.pieces.push(pc); st.sel = st.def.pieces.length - 1; st.mode = 'block'; st.corner = st.face = -1; gizmo.setMode('translate');
    changed(true); flashBlock();
  }
  /** 面で囲った形を足す：選んだブロックの上に、半分ほどの大きさで。cut：引くブロックとして、前の面に埋めて */
  function addPrim(kind, cut = false) {
    const ref = block() ?? st.def.pieces[0], b = refBox(), lo = b.min.toArray(), hi = b.max.toArray();
    const s = [0, 1, 2].map(k => Math.max(0.01, (hi[k] - lo[k]) * 0.5));
    const c = cut ? [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, hi[2]] : [(lo[0] + hi[0]) / 2, hi[1] + s[1] / 2, (lo[2] + hi[2]) / 2];
    pushBlock({ ...carry(ref), kind: 'hull', bevel: 0, bevelSegs: 1, color: ROLE_COLOR.main, name: uniqueName(cut ? '削る箱' : kind), planes: planesOf(PRIMS[kind](c, s)), pos: [0, 0, 0], ...(cut ? { op: 'sub' } : {}) });
  }
  /** 断面から作る形を足す：大きさをパーツに合わせて縮めて、選んだブロックの上（削る形は前の面）に置く */
  function addShape(name) {
    const { at, size, turn, ...src } = SHAPES[name], ref = block() ?? st.def.pieces[0], b = refBox(), lo = b.min.toArray(), hi = b.max.toArray();
    const R = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2], 0.02);
    const xs = src.pts.map(q => q[0]), ys = src.pts.map(q => q[1]);
    const w = src.kind === 'lathe' ? 2 * Math.max(...xs) : Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys), nat = Math.max(w, h, src.depth ?? 0, 0.01);
    const k = R * (size ?? 0.5) / nat, sc = v => r5(v * k);
    const pc = { ...carry(ref), ...structuredClone(src), color: ROLE_COLOR.main, name: uniqueName(name), pos: [0, 0, 0], pts: src.pts.map(q => q.map(sc)) };
    for (const f of ['depth', 'bevel', 'corner']) if (pc[f] != null) pc[f] = sc(pc[f]);
    if (pc.arrayStep) pc.arrayStep = pc.arrayStep.map(sc);
    const cx = (lo[0] + hi[0]) / 2, cz = (lo[2] + hi[2]) / 2;
    const p = at === 'front' ? [cx, (lo[1] + hi[1]) / 2 - (pc.arrayStep ? pc.arrayStep[1] * ((pc.arrayCount ?? 1) - 1) / 2 : 0), hi[2]] : [cx, hi[1] + h * k / 2, cz];
    pc.tf = { p: p.map(r5), r: turn ?? [0, 0, 0], s: [1, 1, 1] };
    pushBlock(pc);
  }
  function copyBlock(mirror) {
    const pc = block(); if (!pc) return;
    const c = structuredClone(pc), s = boxOf(pc).getSize(new THREE.Vector3()), off = [r5(Math.max(s.x, s.y) * 0.15), r5(Math.max(s.x, s.y) * 0.15), 0];
    c.name = uniqueName(pc.name + (mirror ? '（反転）' : '（写し）'));
    if (hullEdit(pc)) c.planes = mirror ? pc.planes.map(p => [-p[0], p[1], p[2], p[3]]) : movePlanes(pc.planes, off).map(p => p.map(r5));
    else if (mirror) c.tf = { p: [-pc.tf.p[0], pc.tf.p[1], pc.tf.p[2]], r: [pc.tf.r[0], -pc.tf.r[1], -pc.tf.r[2]], s: [-pc.tf.s[0], pc.tf.s[1], pc.tf.s[2]] };
    else c.tf.p = c.tf.p.map((v, i) => r5(v + off[i]));
    st.def.pieces.splice(st.sel + 1, 0, c); st.sel += 1; st.corner = st.face = -1;
    changed(true); flashBlock();
  }
  function removeBlock() {
    const pc = block(); if (!pc) return;
    if (!isSub(pc) && st.def.pieces.filter(p => !isSub(p)).length <= 1) { ctx.note('足すブロックの最後の 1 個は消せません（パーツごと消すときは、機体の画面で「この自分のパーツをカタログから消す」）', true); return; }
    st.def.pieces.splice(st.sel, 1); st.sel = Math.min(st.sel, st.def.pieces.length - 1); st.corner = st.face = -1;
    changed(true);
  }
  function moveBlock(dir) {
    const i = st.sel, j = i + dir, ps = st.def.pieces;
    if (i < 0 || j < 0 || j >= ps.length) return;
    [ps[i], ps[j]] = [ps[j], ps[i]]; st.sel = j;
    changed(true);
  }

  // ---- 面で囲った形の、角と面 ----
  function moveCorner(axis, v) {
    const pc = block(), pts = st.pts.map(p => p.slice());
    pts[st.corner][axis] = v;
    if (st.twin >= 0) pts[st.twin] = st.twin === st.corner ? [0, pts[st.corner][1], pts[st.corner][2]] : [-pts[st.corner][0], pts[st.corner][1], pts[st.corner][2]];
    const pl = planesOf(pts);
    if (pl) { pc.planes = pl; st.pts = pts; st.keepCorner = pts[st.corner]; }
  }
  /** 角の並びが作り直された後、動かした角（位置 at）を選び直す */
  function reselectCorner(at) {
    const pts = cornersOf(block().planes);
    let bi = -1, bd = 1e-3; pts.forEach((p, i) => { const d = Math.hypot(p[0] - at[0], p[1] - at[1], p[2] - at[2]); if (d < bd) { bd = d; bi = i; } });
    st.corner = bi;   // 動かした角が立体の内側に入って消えたら、選びなおし
  }
  function removeCorner() {
    const pc = block(), pts = cornersOf(pc.planes).filter((_, i) => i !== st.corner && i !== st.twin);
    const pl = planesOf(pts);
    if (!pl) { ctx.note('これ以上角を消すと、形がなくなります', true); return; }
    pc.planes = pl; st.corner = -1; changed(false);
  }
  function addCornerOnFace() {
    const pc = block(), f = faceInfo(pc, st.face); if (!f) return;
    const s = boxOf(pc).getSize(new THREE.Vector3()), out = Math.max(s.x, s.y, s.z) * 0.12, at = f.c.clone().addScaledVector(f.n, out).toArray().map(r5);
    const pts = [...f.all, at];
    if (symOn() && Math.abs(at[0]) > 1e-3) pts.push([-at[0], at[1], at[2]]);
    const pl = planesOf(pts); if (!pl) return;
    pc.planes = pl; st.mode = 'corner'; st.face = -1; reselectCorner(at); changed(false);
  }
  function removeFace() {
    const pc = block(), pl = pc.planes.filter((_, i) => i !== st.face), reach = hullReach(pc.planes);
    // 面をなくして形が開いてしまわないか（角が遠くへ飛ばないか）を確かめる
    const pts = pl.length >= 4 ? cornersOf(pl) : [];
    if (pts.length < 4 || pts.some(p => Math.max(Math.abs(p[0]), Math.abs(p[1]), Math.abs(p[2])) > reach * 0.9)) { ctx.note('この面をなくすと、形が閉じなくなります', true); return; }
    pc.planes = pl; st.face = -1; changed(false);
  }
  /** 面で囲った形の置き方（位置・回転・拡大）を、形に焼き込む（角・面を直せるようになる） */
  function bakeTf() {
    const pc = block(); if (!pc?.tf) return;
    const M = tfMatrix(pc.tf), pl = planesOf(cornersOf(pc.planes).map(p => new THREE.Vector3(...p).applyMatrix4(M).toArray()));
    if (!pl) { ctx.note('この形は焼き込めません', true); return; }
    pc.planes = pl; delete pc.tf;
    changed(false);
  }
  /** 押し出し・回転体を、面で囲った形（凸）に変える */
  function toHull() {
    const pc = block();
    let pts = pointsOf(pc);
    if (pts.length > 140) { ctx.note(`角が ${pts.length} 個あって多すぎます。分割数・面取りの段数を減らしてから変えてください`, true); return; }
    const pl = planesOf(pts);
    if (!pl) { ctx.note('この形は変えられません', true); return; }
    for (const k of ['pts', 'depth', 'corner', 'cornerSegs', 'taper', 'tiltY', 'ridge', 'segments', 'side', 'top', 'tf']) delete pc[k];
    pc.kind = 'hull'; pc.planes = pl; pc.bevel = 0; pc.bevelSegs = 1;
    changed(false);
  }

  // ---- 始める・終わる ----
  /** 置いてあるパーツ（items の i 番目）をパーツエディタで開く。カタログのパーツなら、写し（自分のパーツ）を作って置き換えてから */
  function start(i) {
    if (st) return;
    const it = ctx.items()[i], src = ctx.byId[it?.part];
    if (!src) return;
    if (src.gen || String(src.id).startsWith('pipegen')) { ctx.note('ランダムに作った動力パイプは、形を直せません（作り方から作り直す部品）', true); return; }
    let def = src, replaced = null;
    if (!src.user) { def = ctx.makeUserCopy(src); replaced = { from: src.id, to: def.id }; ctx.swapPart(src.id, def.id); }
    begin(def, replaced, false);
  }
  /** カタログの自分のパーツ def を開く。機体に置いていなければ、開いている間だけ仮に置く（終わると外す。機体は変えない） */
  function startDef(def) {
    if (st || !def?.user) return;
    const placed = ctx.items().some(it => it.part === def.id);
    if (!placed) ctx.placeDef(def);
    begin(def, null, false);
    st.tmp = !placed;
  }
  /** 新しいパーツを作る：部位 cat の最初のパーツをひな形（付く骨・置き場所）にして、箱 1 個から。機体は変えない（作っている間だけ仮に置く：ctx.placeDef） */
  function startNew(template) {
    if (st) return;
    const def = ctx.makeUserCopy(template, true);
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const pc of template.pieces) for (const p of cornersOf(movePlanes(pc.planes, pc.pos ?? [0, 0, 0]))) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); }
    const c = lo.map((v, k) => (v + hi[k]) / 2), s = lo.map((v, k) => Math.max(0.04, (hi[k] - v) * 0.6));
    def.pieces.length = 0;
    def.pieces.push({ ...carry(template.pieces[0]), kind: 'hull', bevel: 0, bevelSegs: 1, color: ROLE_COLOR.main, name: '箱', planes: planesOf(PRIMS.箱(c, s)), pos: [0, 0, 0] });
    ctx.placeDef(def);
    begin(def, null, true);
  }
  function begin(def, replaced, isNew) {
    ctx.restPose();
    // ブロックの置き場所（pos）を形に焼き込んで、パーツの座標だけで扱う。名前はパーツの中で 1 つに
    for (const pc of def.pieces) { if (pc.pos && pc.pos.some(v => v)) { if (kindOf(pc) === 'hull') pc.planes = movePlanes(pc.planes, pc.pos).map(p => p.map(r5)); else if (pc.tf) pc.tf.p = pc.tf.p.map((v, k) => r5(v + pc.pos[k])); } pc.pos = [0, 0, 0]; }
    const seen = new Set();
    for (const pc of def.pieces) { let n = pc.name; for (let k = 2; seen.has(n); k++) n = `${pc.name} ${k}`; pc.name = n; seen.add(n); }
    st = { def, replaced, isNew, sel: 0, mode: 'block', corner: -1, face: -1, handles: [], helper: null, ghosts: new Map(), others: 'faint', showSubs: true, showBlock: true, sym: true, snap: true, face2d: 'front',
      hist: [], hpos: -1, cam: { pos: camera.position.clone(), target: orbit.target.clone() } };
    st.backup = structuredClone({ name: def.name, pieces: def.pieces });
    st.hist.push({ s: snapshot(), sel: 0 }); st.hpos = 0;
    ctx.setMode(true);
    gizmo.setMode('translate');
    ctx.rebuild();
    // パーツに寄る：斜め前から
    camera.position.copy(orbit.target).add(new THREE.Vector3(0.75, 0.35, 1).normalize().multiplyScalar(5));
    frame();
    ctx.note('パーツエディタ：終わったら、上の「完了して機体へ戻る」');
  }
  function finish(keep) {
    if (!st) return;
    const s = st;
    endFlash(); clearHelpers(); holder.parent?.remove(holder);
    prof?.dispose(); prof = null;
    gizmo.showX = gizmo.showY = gizmo.showZ = true; gizmo.setSpace('world'); gizmo.setMode('translate');
    st = null; E.head.dataset.id = '';
    for (const g of ctx.groups()) for (const t of [g, ...g.userData.extra.values()]) t.visible = true;
    ctx.setMode(false); ctx.setFocus(null);
    camera.position.copy(s.cam.pos); orbit.target.copy(s.cam.target); orbit.update();
    if (s.isNew || s.tmp) ctx.dropTmp();   // 新しく作ったパーツ：位置合わせのために仮に置いたものを外す（機体は開く前と同じ）
    if (keep) { ctx.saveUserPart(s.def); ctx.note(s.isNew ? `「${s.def.name}」をカタログの「${s.def.cat}」に ★ 付きで入れました。機体は変えていません（付けるには、カタログで押す）` : `「${s.def.name}」を保存しました（カタログの「${s.def.cat}」に ★ 付きで入っています）`); }
    else {
      if (s.isNew || s.replaced) { if (s.replaced) ctx.swapPart(s.replaced.to, s.replaced.from); ctx.removeUserPart(s.def.id, !!s.isNew); }
      else { s.def.name = s.backup.name; s.def.pieces.length = 0; s.def.pieces.push(...s.backup.pieces); ctx.saveUserPart(s.def); }
      ctx.note('パーツエディタを開く前に戻しました');
    }
    ctx.repaint(); ctx.rebuild(); ctx.save(); ctx.refreshCatalog();
  }

  // ---- 3D の操作（v2.js から呼ばれる） ----
  /** クリック：角の印 → 角を選ぶ。面を選ぶ動きなら面。それ以外はブロックを選ぶ */
  function pick(ndc) {
    ray.setFromCamera(ndc, camera);
    if (st.mode === 'corner' && st.handles.length) {
      const h = ray.intersectObjects(st.handles, false)[0];
      if (h) { st.corner = h.object.userData.corner; refresh(); return; }
    }
    const ins = instance(); if (!ins?.group) return;
    const meshes = [];
    for (const t of [ins.group, ...ins.group.userData.extra.values()]) t.traverse(o => { if (o.isMesh && o.userData.pc) meshes.push(o); });
    for (const [m] of st.ghosts.values()) meshes.push(m);
    const hit = ray.intersectObjects(meshes, false)[0];
    if (!hit) return;
    const i = st.def.pieces.indexOf(hit.object.userData.pc);
    if (i < 0) return;
    if (st.mode === 'face' && i === st.sel) {
      // 当たった面：法線がいちばん近く、当たった点がその平面の上にある面
      const p = hit.object.worldToLocal(hit.point.clone()), n = hit.face.normal, pc = st.def.pieces[i];
      let best = -1, bd = 0.9;
      pc.planes.forEach((pl, k) => { const l = Math.hypot(pl[0], pl[1], pl[2]) || 1, dotn = (pl[0] * n.x + pl[1] * n.y + pl[2] * n.z) / l; if (dotn > bd && Math.abs((pl[0] * p.x + pl[1] * p.y + pl[2] * p.z - pl[3]) / l) < 2e-3) { bd = dotn; best = k; } });
      if (best >= 0) { st.face = best; refresh(); }
      return;
    }
    selectBlock(i);
  }
  /** つまみを動かしている間 */
  function onGizmoChange() {
    const pc = block(); if (!pc) return;
    if (st.mode === 'corner' && st.corner >= 0) {
      const h = st.handles[st.corner], at = h.position.toArray();
      const pts = st.pts.map((p, i) => (i === st.corner ? at : p));
      if (st.twin >= 0) { if (st.twin === st.corner) pts[st.corner] = [0, at[1], at[2]]; else pts[st.twin] = [-at[0], at[1], at[2]]; }
      const pl = planesOf(pts);
      if (pl) { pc.planes = pl; st.ptsNow = pts; live(); }
    } else if (st.mode === 'face' && st.helper) {
      // 面を押す・引く：その面の角を、面の向きに同じだけ動かして、凸の立体を作り直す（面の形は保たれ、となりの面が傾く）。
      // 平面だけを動かすと、丸めた形ではとなりの面にすぐ閉じられて、面が出てこない
      const delta = st.helper.position.clone().sub(st.c0).dot(st.n), n = st.n;
      const pl = planesOf(st.pts0.map((p, i) => { let q = p; if (st.onIx.has(i)) q = [q[0] + n.x * delta, q[1] + n.y * delta, q[2] + n.z * delta]; if (st.symOn?.has(i)) q = [q[0] - n.x * delta, q[1] + n.y * delta, q[2] + n.z * delta]; return q; }));
      if (pl) { pc.planes = pl; st.faceMoved = true; live(); }
    } else if (st.helper && hullEdit(pc)) {
      const h = st.helper; h.updateMatrix();
      const M = h.matrix.clone().multiply(new THREE.Matrix4().makeTranslation(-st.c0.x, -st.c0.y, -st.c0.z));
      const pl = planesOf(st.pts0.map(p => new THREE.Vector3(...p).applyMatrix4(M).toArray()));
      if (pl) { pc.planes = pl; live(); }
    } else if (st.helper) {
      const h = st.helper, D = 180 / Math.PI;
      pc.tf = { p: h.position.toArray().map(r5), r: [h.rotation.x * D, h.rotation.y * D, h.rotation.z * D].map(r1), s: h.scale.toArray().map(r4) };
      live();
    }
  }
  /** つまみを離した：印を作り直す（角・面は、動かしたものを選んだまま）。元に戻すの 1 区切り */
  function onDragEnd() {
    if (!st) return;
    if (st.mode === 'corner' && st.corner >= 0 && st.ptsNow) { const at = st.ptsNow[st.corner]; st.ptsNow = null; reselectCorner(at); }
    if (st.mode === 'face' && st.faceMoved) {
      // 動かした面を選んだままにする（面の並びは作り直されるので、向きと位置で探し直す）
      st.faceMoved = false;
      const delta = st.helper.position.clone().sub(st.c0).dot(st.n), at = st.c0.clone().addScaledVector(st.n, delta);
      let bi = -1, bd = 2e-3;
      block().planes.forEach((p, i) => { const l = Math.hypot(p[0], p[1], p[2]) || 1; if ((p[0] * st.n.x + p[1] * st.n.y + p[2] * st.n.z) / l > 0.999) { const dd = Math.abs((p[0] * at.x + p[1] * at.y + p[2] * at.z - p[3]) / l); if (dd < bd) { bd = dd; bi = i; } } });
      st.face = bi;
    }
    if (st.def.free) ctx.rebuild(); else refresh();
    commit();
  }
  function key(e) {
    const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
    if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return true; }
    if (mod && k === 'y') { e.preventDefault(); redo(); return true; }
    if (mod && k === 'd') { e.preventDefault(); copyBlock(false); return true; }
    if (mod) return false;
    if (k === 'delete') { removeBlock(); return true; }
    if (k === 'escape') { st.corner = st.face = -1; refresh(); return true; }
    if (k === 'f') { frame(); return true; }
    if (['1', '2', '3'].includes(k)) { setEditMode(['block', 'corner', 'face'][+k - 1]); return true; }
    if (['w', 'e', 'r'].includes(k)) { setGizmoMode({ w: 'translate', e: 'rotate', r: 'scale' }[k]); return true; }
    return false;
  }
  /** つまみの種類（移動・回転・拡大）。角・面を動かしている間は移動だけ */
  function setGizmoMode(m) {
    if (!st || st.mode !== 'block') return;
    gizmo.setMode(m);
    gizmo.setSpace(m === 'scale' && block() && !hullEdit(block()) ? 'local' : 'world');
  }
  return { active: () => !!st, editing: () => st?.def.id ?? null, touch: () => { if (st) { commit(); refresh(); } }, start, startDef, startNew, pick, onGizmoChange, onDragEnd, afterRebuild: refresh, key, undo, redo, setGizmoMode, tick,
    debug: () => st,
    state: () => st && { sel: st.sel, mode: st.mode, corner: st.corner, face: st.face, hist: st.hist.length, hpos: st.hpos, blocks: st.def.pieces.length } };
}
