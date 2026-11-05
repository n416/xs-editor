// 機体エディタ Ver2 のパーツエディタ：パーツ 1 つを、ブロックを足す・削る・直すで作る画面。
// 開くと画面ぜんたいがパーツ用に切り替わる：左＝ブロックの一覧と足す形、右＝選んだブロックの設定、3D はそのパーツに寄り、ほかのパーツは薄く（か隠す）。
// パーツ = いくつかのブロックの集まり。ブロックの種類と設定は partgeo.js（機体エディタ index.html の部品と同じ 3 種類）：
//   面で囲った形（凸）：角を動かす・辺と面を選んで動かす回す大きさを変える（issue #239）・Ctrl・Shift で角・辺・面をいくつも選んでまとめて（issue #242）・角を足す消す・辺を角にまとめる・辺の面取り
//   押し出し          ：正面・側面・上面の断面を描く、厚み・テーパー・面取り・角の面取り・傾き・盛り上がり
//   回転体            ：断面（右半分）を描く、分割数・角の面取り
// どのブロックにも：足す／引く（上に並ぶブロックを削る）、左右ミラー、繰り返し、位置・大きさの数値、色の役、当たり判定なし。
// 元に戻す・やり直す（Ctrl+Z / Ctrl+Y）は、パーツエディタを開いてからの操作を 1 つずつ。
// 直すのはいつも「自分のパーツ」（id が u· で始まる。カタログのパーツを開くと、写しを作ってそれを直す。元は変わらない）。
// v2.js が ctx（3D の画面・つまみ・置いたパーツ・保存の出入り口）を渡す。
import * as THREE from 'three';
import { buildHull, hullReach, movePlanes } from './hull.js';
import { planesFromPoints } from './xsasm-lib.js';
import { ROLE_LABEL, ROLE_COLOR, GLOW_ROLES, roleOf } from './paint.js';
import { KIND_LABEL, BLOCK0, kindOf, isSub, soloGeo, boxOf, pointsOf, roundCorners, latheLoop, tfMatrix, loftSecs } from './partgeo.js';
import { BONE_CHOICES, PIVOT_CHOICES, groupOfPart, pivotOfPart, isGlowPart, isTrackedSet } from './freeparts.js';
import { profileEditor } from './v2-profile.js';
import { FORM_MAX, formOf, setForm } from './v2-forms.js';

/** 「武器の口」（issue #144）：その武器の弾・ビームが、このブロックの真ん中から出る（ゲーム用に書き出した形で。xsengine.js MOUTH_NODE）。武器の種類と強さは機体の種別で決まる */
export const MOUTH_CHOICES = { '': 'なし（名前に「銃口」「ビームの口」があればそこ）', muzzle: '手に持つ武器の銃口', arm: '腕の武器の口（ビーム・腕の銃）', head: '頭の機関砲の口', chest: '胸の武器の口', belly: '腹の武器の口', shoulder: '肩の砲・ロケットの口', back: 'ミサイルの発射口（背中・肩当て）', shield: '盾の武器の口' };
const mouthRow = pc => `<div class="row"><label>武器の口</label><select id="peMouth">${Object.entries(MOUTH_CHOICES).map(([k, v]) => `<option value="${k}" ${(pc.mouth ?? '') === k ? 'selected' : ''}>${v}</option>`).join('')}</select><button id="peFire" class="small" title="選んだ口から、試しにビームを撃って見せる（このブロックの真ん中から機体の前へ）">試し撃ち</button></div>
  <div class="hint">その種類の武器を撃つと、弾やビームがこのブロックの真ん中から出る（ゲーム用に書き出した形で）。決まるのは出る場所だけで、武器の種類と強さは機体の種別で決まる。左右のある口（腕・頭・肩・ミサイル）は、ブロックが機体のどちら側にあるかで左右が決まる</div>`;
const r5 = v => Math.round(v * 1e5) / 1e5, r12 = v => Math.round(v * 1e12) / 1e12, r4 = v => Math.round(v * 1e4) / 1e4, r1 = v => Math.round(v * 10) / 10;
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
 *  直すたびに 面 → 角 → 面 と行き来する。角は 3D の形（float32）から読むので、同じ面の角も 1e-7 ほどずれる：0.000001 以内は同じ面の上とみなし、
 *  角がどれも 0.000001 以内に乗る 2 枚の面は外側の 1 枚にまとめる（割れると、辺の途中に要らない角が増えていく）。
 *  それより大きなずれは本当の折れ目として、面を分けたままにする。0.1° 未満の向きの差・0.0002 未満のずれまでまとめ、面の数値を 7 桁に丸めていた頃は、
 *  ほとんど平らな折れ目で面と面の交わりが遠くへずれ、元の角の無い所へ角が出て、角を動かすたびに角が増えていった（テスター 2026-11-04 「頂点が 4 桁」。
 *  tools/cornergrowtest.mjs） */
export function planesOf(pts) {
  if (pts.length < 4) return null;
  const T = 1e-6, dist = (q, p) => q[0] * p[0] + q[1] * p[1] + q[2] * p[2] - q[3];
  const on = q => pts.filter(p => Math.abs(dist(q, p)) < 2e-4);
  const pl = [];
  for (const p of planesFromPoints(pts, T)) {
    const k = pl.findIndex(q => q[0] * p[0] + q[1] * p[1] + q[2] * p[2] > 1 - 2e-6 && Math.abs(q[3] - p[3]) < 2e-4
      && [...on(q), ...on(p)].every(x => Math.abs(dist(q, x)) < T && Math.abs(dist(p, x)) < T));
    if (k < 0) pl.push(p); else if (p[3] > pl[k][3]) pl[k] = p;
  }
  for (let i = 0; i < pl.length; i++) pl[i] = pl[i].map(r12);
  if (pl.length < 4) return null;
  const h = buildHull(pl, { reach: hullReach(pl) });
  return h.positions.length >= 36 ? pl : null;
}
/** 平面の集まりと角の並び → 辺の並び [{ a, b, n }]（a, b：角の番号、n：となり合う 2 枚の面の向きの真ん中）。
 *  2 枚の面の両方に乗る角が 2 つ以上あれば、その 2 枚の境が辺（1 本の上に角が 3 つ以上並べば、となり合う 2 つずつ） */
export function edgesOf(planes, pts) {
  const unit = planes.map(q => { const l = Math.hypot(q[0], q[1], q[2]) || 1; return [q[0] / l, q[1] / l, q[2] / l, q[3] / l]; });
  const on = unit.map(q => pts.map((p, i) => i).filter(i => Math.abs(pts[i][0] * q[0] + pts[i][1] * q[1] + pts[i][2] * q[2] - q[3]) < 1e-3));
  const out = [], seen = new Set();
  for (let j = 0; j < unit.length; j++) for (let k = j + 1; k < unit.length; k++) {
    const both = on[j].filter(i => on[k].includes(i));
    if (both.length < 2) continue;
    const a = unit[j], b = unit[k], d = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    if (Math.hypot(...d) < 1e-6) continue;
    const t = i => pts[i][0] * d[0] + pts[i][1] * d[1] + pts[i][2] * d[2];
    both.sort((x, y) => t(x) - t(y));
    const n = [a[0] + b[0], a[1] + b[1], a[2] + b[2]], nl = Math.hypot(...n) || 1;
    for (let m = 0; m + 1 < both.length; m++) {
      const key = Math.min(both[m], both[m + 1]) + ':' + Math.max(both[m], both[m + 1]);
      if (seen.has(key)) continue;
      seen.add(key); out.push({ a: both[m], b: both[m + 1], n: n.map(v => v / nl) });
    }
  }
  return out;
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
/** 断面をつないで作る形（流線形・つなぎの面）。大きさ 1 で書き、足すときにパーツに合わせて縮める */
const LOFTS = {
  卵形: { secs: [{ y: -0.5, w: 0 }, { y: 0, w: 0.35 }, { y: 0.5, w: 0 }], segments: 24, steps: 6 },
  カプセル: { secs: [{ y: -0.5, w: 0 }, { y: -0.25, w: 0.25 }, { y: 0.25, w: 0.25 }, { y: 0.5, w: 0 }], segments: 24, steps: 4 },
  砲弾形: { secs: [{ y: -0.5, w: 0.2, hard: true }, { y: -0.4, w: 0.25 }, { y: 0.1, w: 0.25 }, { y: 0.5, w: 0 }], segments: 24, steps: 5 },
  しずく形: { secs: [{ y: -0.5, w: 0 }, { y: -0.2, w: 0.3, f: 0.34, b: 0.24 }, { y: 0.15, w: 0.2, f: 0.22, b: 0.16 }, { y: 0.5, w: 0.03, hard: true }], segments: 24, steps: 5 },
  丸い胴: { secs: [{ y: -0.5, w: 0.3, f: 0.24, b: 0.2, n: 3, hard: true }, { y: -0.2, w: 0.38, f: 0.32, b: 0.24, n: 3 }, { y: 0.2, w: 0.44, f: 0.34, b: 0.26, n: 2.6 }, { y: 0.5, w: 0.3, f: 0.2, b: 0.2, n: 2.4, hard: true }], segments: 28, steps: 4 },
  丸から四角へ: { secs: [{ y: -0.5, w: 0.3, n: 2, hard: true }, { y: 0, w: 0.32, n: 3 }, { y: 0.5, w: 0.3, n: 8, hard: true }], segments: 28, steps: 4 },
  すぼまる筒: { secs: [{ y: -0.5, w: 0.35, hard: true }, { y: 0, w: 0.27 }, { y: 0.5, w: 0.2, hard: true }], segments: 24, steps: 4 },
};
/** 蛇腹（輪を曲線に沿って積む）。大きさ 1 で書き、足すときにパーツに合わせて縮める */
const BELLOWS = {
  まっすぐな蛇腹: { rings: 10, rOut: 0.25, rIn: 0.2, len: 1, bend: 0, bendDir: 0, ringN: 2, capA: 0, capB: 0 },
  曲がった蛇腹: { rings: 14, rOut: 0.2, rIn: 0.16, len: 1.2, bend: 40, bendDir: 0, ringN: 2, capA: 0, capB: 0 },
  受け付きの蛇腹: { rings: 10, rOut: 0.22, rIn: 0.17, len: 1, bend: 0, bendDir: 0, ringN: 2, capA: 0.12, capB: 0.12, capR: 1.15 },
};
const GROUPS = [
  ['角と面を動かせる形（凸）', Object.keys(PRIMS), 'prim'],
  ['断面を描いて押し出す形', ['面取り箱', '丸箱', '装甲板', '先細り'], 'shape'],
  ['断面を回して作る形（回転体）', ['関節', 'スラスター', '六角ナット', 'ピストン', '自由な回転体'], 'shape'],
  ['断面をつないで作る形（流線形・つなぎの面）', Object.keys(LOFTS), 'loft'],
  ['輪を積む形（蛇腹）', Object.keys(BELLOWS), 'bellows'],
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
#peRight .pesec { display: grid; grid-template-columns: repeat(4, 1fr); gap: 2px 4px; margin: 2px 0; padding: 4px 0; border-top: 1px solid var(--line, #2a2f3a); }
#peRight .pesec label { display: flex; flex-direction: column; min-width: 0; }
#peRight .pesec label i { font-style: normal; color: var(--dim); font-size: 11px; }
#peRight .pesec input[type=number] { width: 100%; min-width: 0; }
#peRight .pesec > span { display: flex; align-items: end; gap: 3px; }
#peRight .pesec label.chk { flex-direction: row; align-items: center; gap: 2px; font-size: 11px; white-space: nowrap; }
#peRight .pesec button { padding: 0 6px; }
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
  const edgeMat = new THREE.LineBasicMaterial({ color: 0xffd257, depthTest: false }), edgeSel = new THREE.LineBasicMaterial({ color: 0xff5a4a, depthTest: false }), edgeSym = new THREE.LineBasicMaterial({ color: 0xff9a6a, depthTest: false });
  const MIRROR = new THREE.Matrix4().makeScale(-1, 1, 1), V = p => new THREE.Vector3(...p);
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
    if (st.mode === 'corner' && selOf().length < 2) {
      const twin = symOn() && st.corner >= 0 ? mirrorIndex(st.pts, st.corner) : -1;
      st.handles = st.pts.map((p, i) => { const m = new THREE.Mesh(handleGeo, i === st.corner ? handleSel : i === twin ? handleSym : handleMat); m.position.set(...p); m.renderOrder = 10; m.userData.corner = i; holder.add(m); return m; });
      st.twin = twin;
      if (st.corner >= 0 && st.handles[st.corner]) { gizmo.setMode('translate'); gizmo.attach(st.handles[st.corner]); }
      sizeHandles();
    } else if (st.mode === 'corner' || st.mode === 'face' || st.mode === 'edge') {
      // 辺・面（issue #239）：選んだ辺・面の角をまとめて、つまみで動かす（W）・回す（E）・大きさを変える（R）。つまみの向きは、面なら y が面の向き、
      // 辺なら x が辺の向き・y がとなり合う 2 枚の面の向きの真ん中。角を動かした後で凸の立体を作り直す（内側に入った角は消える）。
      // Ctrl・Shift を押しながら選んだ角・辺・面（issue #242）はまとめて：つまみは選んだ角の真ん中に、向きは左右・上下・前後
      st.edges = edgesOf(pc.planes, st.pts);
      const n0 = selOf().length, els = selElements(pc);
      if (panel && els.length !== n0) renderRight();   // 形に出ていない面・無い辺は選べない
      // 左右対称：反対側の角（選んだ中に無いもの）も、左右を返して一緒に動かす。左右の両方を選んでいれば、左（x < 0）の側は右の動きを左右に返して動く
      const sym = symOn(), on = new Set(), twin = new Set(), own = [];
      for (const g of els) {
        const m = sym ? mirrorSet(g.on) : null, key = s => [...s].sort((a, b) => a - b).join(',');
        const pair = m && key(m) !== key(g.on) && els.some(o => key(o.on) === key(m));
        if (pair && g.c.x < 0) { for (const i of g.on) twin.add(i); continue; }
        own.push(g); for (const i of g.on) on.add(i);
      }
      if (sym) for (const i of on) { const t = mirrorIndex(st.pts, i); if (t >= 0 && !on.has(t)) twin.add(t); }
      for (const i of on) twin.delete(i);
      drawParts(els.map(g => g.on), twin);
      if (own.length) {
        // つまみ：1 つだけ選べばその角・辺・面の向き（#239）。2 つ以上なら、選んだ角ぜんぶの真ん中に、左右・上下・前後の向きで（左右の両方を選べば x = 0 の上）
        const all = new Set(els.flatMap(g => [...g.on]));
        const c = els.length === 1 ? els[0].c : [...all].reduce((a, i) => a.add(V(st.pts[i])), new THREE.Vector3()).multiplyScalar(1 / all.size);
        const h = new THREE.Object3D(); h.position.copy(c); h.quaternion.copy(els.length === 1 ? els[0].q : new THREE.Quaternion()); holder.add(h); h.updateMatrix();
        st.helper = h; st.H0i = h.matrix.clone().invert(); st.pts0 = st.pts; st.selIx = on; st.twinIx = twin; st.keep0 = twin.size > 0;
        st.selAt = els.map(g => [...g.on]);
        gizmo.setSpace('local'); gizmo.attach(h);
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
  /** 辺・面のつまみの向き：y = n（面の向き）。along があれば x = along（辺の向き）で、y はそれに直角に直す。無ければ x はなるべく左右（x）に */
  function frameQ(n, along) {
    const Y = n.clone().normalize();
    let X;
    if (along) { X = along.clone().normalize(); Y.addScaledVector(X, -Y.dot(X)); if (Y.lengthSq() < 1e-8) Y.set(0, 1, 0).addScaledVector(X, -X.y); Y.normalize(); }
    else X = (Math.abs(Y.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1)).cross(Y).normalize();
    return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, X.clone().cross(Y)));
  }
  /** 辺・面を直すときの印：辺のときは辺ぜんぶ（黄）、選んだ辺・面は赤、左右対称で一緒に動く側はだいだい。選んだ角に丸。
   *  groups：選んだ角・辺・面ごとの角の番号の集まり。角を直すときは、ほかの角も黄色の丸で出して押して選び足せる */
  function drawParts(groups, twin) {
    const lines = { all: [], sel: [], sym: [] }, on = new Set(groups.flatMap(g => [...g]));
    for (const e of st.edges) {
      const k = groups.some(g => g.has(e.a) && g.has(e.b)) ? 'sel' : twin.has(e.a) && twin.has(e.b) ? 'sym' : st.mode === 'edge' ? 'all' : null;
      if (k) lines[k].push(...st.pts[e.a], ...st.pts[e.b]);
    }
    for (const [k, mat] of [['all', edgeMat], ['sym', edgeSym], ['sel', edgeSel]]) {
      if (!lines[k].length) continue;
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(lines[k], 3));
      const l = new THREE.LineSegments(g, mat); l.renderOrder = 10; l.userData.own = true; holder.add(l);
    }
    st.pts.forEach((p, i) => {
      const mat = on.has(i) ? handleSel : twin.has(i) ? handleSym : st.mode === 'corner' ? handleMat : null;
      if (!mat) return;
      const m = new THREE.Mesh(handleGeo, mat); m.position.set(...p); m.renderOrder = 10; m.userData.corner = i; holder.add(m); st.handles.push(m);
      if (st.mode !== 'corner') m.raycast = () => {};
    });
    sizeHandles();
  }
  /** 選んだ角・辺・面の番号の並び（Ctrl・Shift で選び足したもの、いちばん後に選んだもの の順。issue #242） */
  function selOf() {
    const cur = st.mode === 'corner' ? st.corner : st.mode === 'edge' ? st.edge : st.mode === 'face' ? st.face : -1;
    return [...new Set([...(st.more ?? []), cur])].filter(k => k >= 0);
  }
  function clearSel() { st.corner = st.face = st.edge = -1; st.more = []; }
  /** 押した角・辺・面 k を選ぶ。add（Ctrl・Shift）なら選び足す。もう選んでいれば、選ぶのをやめる */
  function choose(k, add) {
    const f = st.mode, list = selOf();
    if (!add) { st[f] = k; st.more = []; }
    else if (list.includes(k)) { const rest = list.filter(x => x !== k); st[f] = rest.length ? rest[rest.length - 1] : -1; st.more = rest.slice(0, -1); }
    else { st.more = list; st[f] = k; }
    refresh();
  }
  /** 選んだ角・辺・面それぞれの { on: 角の番号, c: つまみの真ん中, q: つまみの向き }。形に出ていない面・無い辺は選ぶのをやめる */
  function selElements(pc) {
    const out = [], keep = [];
    for (const k of selOf()) {
      let g = null;
      if (st.mode === 'corner' && st.pts[k]) g = { on: new Set([k]), c: V(st.pts[k]), q: new THREE.Quaternion() };
      else if (st.mode === 'edge' && st.edges[k]) {
        const e = st.edges[k], A = V(st.pts[e.a]), B = V(st.pts[e.b]);
        g = { on: new Set([e.a, e.b]), c: A.clone().add(B).multiplyScalar(0.5), q: frameQ(V(e.n), B.clone().sub(A)) };
      } else if (st.mode === 'face' && pc.planes[k]) { const f = faceInfo(pc, k); if (f) g = { on: f.on, c: f.c, q: frameQ(f.n, null) }; }
      if (g) { out.push(g); keep.push(k); }
    }
    st[st.mode] = keep.length ? keep[keep.length - 1] : -1; st.more = keep.slice(0, -1);
    return out;
  }
  /** 角の集まりの、x = 0 をはさんだ反対側（どれかに反対側が無ければ null） */
  function mirrorSet(on) {
    const m = new Set();
    for (const i of on) { const t = mirrorIndex(st.pts, i); if (t < 0) return null; m.add(t); }
    return m;
  }
  /** 画面の点 ndc にいちばん近い辺（画面で 10 px 以内。重なっていれば手前の辺）。無ければ −1 */
  function pickEdge(ndc) {
    const w = canvas.clientWidth / 2, h = canvas.clientHeight / 2, M = holder.matrixWorld, px = ndc.x * w, py = ndc.y * h, cand = [];
    (st.edges ?? []).forEach((e, k) => {
      const A = V(st.pts[e.a]).applyMatrix4(M).project(camera), B = V(st.pts[e.b]).applyMatrix4(M).project(camera);
      if (A.z > 1 || B.z > 1) return;
      const ax = A.x * w, ay = A.y * h, vx = B.x * w - ax, vy = B.y * h - ay, L = vx * vx + vy * vy;
      const t = L > 0 ? Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / L)) : 0, d = Math.hypot(ax + vx * t - px, ay + vy * t - py);
      if (d < 10) cand.push({ k, d, z: A.z + (B.z - A.z) * t });
    });
    if (!cand.length) return -1;
    cand.sort((a, b) => a.d - b.d);
    return cand.filter(c => c.d < cand[0].d + 3).sort((a, b) => a.z - b.z)[0].k;
  }
  /** 角・辺・面を動かした後、動いた角の位置から、選んでいた角・辺・面を選び直す（ats：選んだものごとの角の位置。内側に入って消えたら、選ばない） */
  function reselectParts(ats) {
    const pc = block(), pts = cornersOf(pc.planes), edges = edgesOf(pc.planes, pts), near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) < 1e-3;
    const one = at => {
      if (st.mode === 'corner') return pts.findIndex(p => near(p, at[0]));
      if (st.mode === 'edge') return edges.findIndex(e => (near(pts[e.a], at[0]) && near(pts[e.b], at[1])) || (near(pts[e.a], at[1]) && near(pts[e.b], at[0])));
      let bi = -1, bn = 2;
      pc.planes.forEach((q, k) => { const l = Math.hypot(q[0], q[1], q[2]) || 1, n = at.filter(p => Math.abs((p[0] * q[0] + p[1] * q[1] + p[2] * q[2] - q[3]) / l) < 1e-3).length; if (n > bn) { bn = n; bi = k; } });
      return bi;
    };
    const ks = [...new Set(ats.map(one))].filter(k => k >= 0);
    st[st.mode] = ks.length ? ks[ks.length - 1] : -1; st.more = ks.slice(0, -1);
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
    st.sel = Math.min(st.hist[pos].sel, st.def.pieces.length - 1); clearSel();
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
      ${GROUPS.map(([title, names, how]) => `<div class="hint">${title}</div><div class="pegrid">${(how === 'shape' && names[0] === '面取り箱' && st.def.free ? ['あたり箱', ...names] : names).map(k => `<button data-${how === 'prim' ? 'prim' : how === 'loft' ? 'loft' : how === 'bellows' ? 'bellows' : 'shape'}="${k}" class="${SHAPES[k]?.op === 'sub' || k === '箱で削る' ? 'subp' : ''}">${k}</button>`).join('')}</div>`).join('')}
      <div class="hint">足した形は、選んでいるブロックに合わせた大きさで出る。削る形は、選んでいるブロックの前の面に埋めて出る</div>`;
    for (const el of E.left.querySelectorAll('[data-i]')) el.onclick = () => selectBlock(+el.dataset.i);
    for (const el of E.left.querySelectorAll('[data-prim]')) el.onclick = () => addPrim(el.dataset.prim);
    for (const el of E.left.querySelectorAll('[data-loft]')) el.onclick = () => addLoft(el.dataset.loft);
    for (const el of E.left.querySelectorAll('[data-bellows]')) el.onclick = () => addBellows(el.dataset.bellows);
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
        <button data-mode="edge" class="${st.mode === 'edge' ? 'on' : ''}" title="黄色の辺を押してから、つまみで動かす・回す・大きさを変える（3。W 移動・E 回転・R 拡大）">辺</button>
        <button data-mode="face" class="${st.mode === 'face' ? 'on' : ''}" title="面を押してから、つまみで動かす・回す・大きさを変える（4。W 移動・E 回転・R 拡大。緑の矢印で出し入れ）">面</button>
        <button id="peSym" class="${st.sym ? 'on' : ''}" title="角・辺・面を動かすとき、パーツの真ん中（x = 0）をはさんだ反対側も同じだけ動かす">左右対称に</button></div>` : ''}`;
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
        st.sel = Math.max(0, keep.indexOf(cur)); clearSel();
        changed(true);
      };
    }
    for (const el of E.tools.querySelectorAll('[data-mode]')) el.onclick = () => setEditMode(el.dataset.mode);
    if ($('#peSym')) $('#peSym').onclick = () => { st.sym = !st.sym; refresh(); };
  }
  function setEditMode(m) { if (!hullEdit(block())) return; st.mode = m; clearSel(); if (m === 'block') gizmo.setMode('translate'); refresh(); }

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
      const nSel = hullEdit(pc) ? selOf().length : 0;
      if (!hullEdit(pc)) html.push('<h2>形を直す</h2><div class="hint">この面の形は、置き方（位置・回転・拡大）を別に持っています。つまみと上の数値で動かせます。角・面を直すには、置き方を形に焼き込みます（面取りの幅は、拡大した後の大きさで掛かり直す）</div><div class="pebar"><button id="peBake">置き方を形に焼き込む（角・面を直せるようにする）</button></div>');
      else html.push(`<h2>形を直す</h2><div class="seg">
          <button data-mode="block" class="${st.mode === 'block' ? 'on' : ''}">ブロックごと</button><button data-mode="corner" class="${st.mode === 'corner' ? 'on' : ''}">角</button><button data-mode="edge" class="${st.mode === 'edge' ? 'on' : ''}">辺</button><button data-mode="face" class="${st.mode === 'face' ? 'on' : ''}">面</button></div>
        <div class="hint">${nSel > 1 ? `${nSel} ${{ corner: '個の角', edge: '本の辺', face: '枚の面' }[st.mode]}を選んだ（赤）。まとめて、つまみで動かす（W）・回す（E）・大きさを変える（R）。つまみは選んだ角の真ん中、向きは左右・上下・前後。Ctrl か Shift を押しながら押すと、選び足す・外す`
          : st.mode === 'corner' ? (st.corner >= 0 ? '選んだ角（赤）をつまみで動かす。別の角は押して選ぶ' : '黄色の角を押して選ぶ')
          : st.mode === 'edge' ? (st.edge >= 0 ? '選んだ辺（赤）を、つまみで動かす（W）・回す（E）・大きさを変える（R）。赤の矢印は辺の向き、緑の矢印は辺を外へ出す向き。別の辺は押して選ぶ' : '黄色の辺を押して選ぶ')
          : st.mode === 'face' ? (st.face >= 0 ? '選んだ面（赤）を、つまみで動かす（W）・回す（E）・大きさを変える（R）。緑の矢印で出し入れする。別の面は押して選ぶ' : 'ブロックの面を押して選ぶ')
          : 'つまみで動かす（W 移動・E 回転・R 拡大）'}${nSel === 1 ? '。Ctrl か Shift を押しながら押すと、まとめて選べる' : ''}。角は ${st.pts.length} 個・面は ${pc.planes.length} 枚${st.mode !== 'block' && st.sym ? (symOn() ? '。左右対称に直す（反対側も一緒に動く）' : '。このブロックは左右対称でないので、動かした側だけが変わる') : ''}${st.mode === 'edge' || st.mode === 'face' ? '。形はいつも凸なので、へこませた角は内側に入って消える' : ''}</div>`);
      if (st.mode === 'corner' && nSel > 1) html.push('<div class="pebar"><button id="peCornerDel" title="選んだ角をなくす（残りの角で形を作り直す）">選んだ角を消す</button></div>');
      else if (st.mode === 'corner' && st.corner >= 0 && st.pts?.[st.corner]) {
        [0, 1, 2].forEach(a => bind('k' + a, () => st.pts[st.corner][a], v => moveCorner(a, v)));
        html.push(row3('角の位置', ['k0', 'k1', 'k2'], step), '<div class="pebar"><button id="peCornerDel" title="この角をなくす（残りの角で形を作り直す）">この角を消す</button></div>');
      }
      if (st.mode === 'edge' && st.edge >= 0 && nSel === 1) html.push('<div class="pebar"><button id="peEdgeJoin" title="この辺の両端の角を、辺の真ん中の 1 つの角にまとめる（とがった形・屋根の形になる）">辺を 1 つの角にまとめる</button></div>');
      if (st.mode === 'face' && st.face >= 0 && nSel === 1) html.push('<div class="pebar"><button id="peFaceCorner" title="この面の真ん中に角を 1 つ足す（引き出すと、とがった形・屋根の形になる）">面の真ん中に角を足す</button><button id="peFaceDel" title="この面をなくす（となりの面が伸びてふさぐ）">この面をなくす</button></div>');
      html.push('<h2>辺の面取り</h2>', slider('面取り幅', 'bevel', 0, +(S * 0.25).toFixed(4), +(S / 400).toPrecision(1)), slider('段数', 'bevelSegs', 1, 6, 1), '<div class="hint">段数 1 は斜めに落とす、2 以上は丸める</div>');
    } else if (kind === 'bellows') {
      const F = [['rings', '輪の数', 1, 60, 1], ['rOut', '外の半径（山）', 0, S, step], ['rIn', '内の半径（谷）', 0, S, step], ['len', '長さ', 0, S * 2, step], ['bend', '曲がり（度）', -180, 180, 1],
        ['bendDir', '曲がる向き（度）', -180, 180, 5], ['ringN', '輪の断面の形', 0.6, 8, 0.1], ['ringSteps', '1 つの輪の分割', 2, 12, 1], ['segments', 'まわりの分割数', 6, 48, 1], ['capA', '根元の受けの長さ', 0, S, step], ['capB', '先の受けの長さ', 0, S, step], ['capR', '受けの太さ（山に掛ける）', 1, 1.6, 0.01]];
      const fix = { rings: v => Math.max(1, Math.min(60, Math.round(v))), segments: v => Math.max(6, Math.min(48, Math.round(v))), ringSteps: v => Math.max(2, Math.min(12, Math.round(v))), ringN: v => Math.max(0.6, Math.min(8, v)), capR: v => Math.max(1, v) };
      for (const [k] of F) bind(k, () => val(pc, k), v => { if (!Number.isFinite(v)) return; if (['rOut', 'rIn', 'len', 'capA', 'capB'].includes(k) && v < 0) return; pc[k] = fix[k] ? fix[k](v) : v; });
      const L = val(pc, 'len') - val(pc, 'capA') - val(pc, 'capB'), n = Math.max(1, Math.round(val(pc, 'rings')));
      const BL = { '': 'なし（ブロックの骨 1 本に付く）', fore: '前腕（ひじをまたぐ）', shin: 'すね（ひざをまたぐ）', foot: '足（足首をまたぐ）' };
      html.push('<h2>蛇腹</h2>', ...F.map(([k, t, a, b, s2]) => slider(t, k, +(+a).toFixed(4), +(+b).toFixed(4), s2)),
        `<div class="row"><label>曲がる（先の骨）</label><select id="peBlend">${Object.entries(BL).map(([k, v]) => `<option value="${k}" ${(pc.blendTo ?? '') === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>`,
        '<div class="hint">曲がる蛇腹は、根元がブロックの骨、先がこの骨に付き、根元から先へ頂点ごとに割合を移す（書き出し）。その骨は蛇腹の真ん中で回る。三角形はおよそ 輪の数 × 1 つの輪の分割 × まわりの分割数 × 2（機体ぜんぶで近距離 30,000 まで）</div>',
        `<div class="hint">輪はどれも同じ形・同じ間隔（${fmt(L / n)}）。山と谷の差 ${fmt(val(pc, 'rOut') - val(pc, 'rIn'))}。根元は原点で、+y（上）へ伸びる。曲がる向き 0 は先が前（+z）、90 は +x。輪の断面の形：1 で山形、2 で丸、大きいほど角ばる。受けは端の谷を包む筒（0 で無し）。向きを変えるには上の「回転」で</div>`);
    } else if (kind === 'loft') {
      bind('segments', () => val(pc, 'segments'), v => { pc.segments = Math.max(3, Math.min(64, Math.round(v))); });
      bind('steps', () => val(pc, 'steps'), v => { pc.steps = Math.max(1, Math.min(12, Math.round(v))); });
      const shown = loftSecs(pc), SK = [['y', '高さ'], ['w', '横'], ['f', '前'], ['b', '後ろ'], ['n', '角ばり'], ['x', '左右'], ['z', '前後']];
      pc.secs.forEach((sec, i) => SK.forEach(([k]) => bind(`q${i}${k}`, () => sec[k] ?? (k === 'f' ? sec.w : k === 'b' ? sec.f ?? sec.w : k === 'n' ? 2 : 0), v => { sec[k] = k === 'n' ? Math.max(0.5, Math.min(20, v)) : k === 'w' || k === 'f' || k === 'b' ? Math.max(0, v) : v; })));
      html.push(`<h2>断面（下から上へつなぐ）</h2>
        <div class="hint">横 = 半分の幅、前・後ろ = 中心からの奥行き。角ばり 2 で楕円、大きいほど四角、1 でひし形。横・前・後ろを 0 にした端は丸く閉じる。「折る」を入れた断面は、そこで面が折れる</div>
        <div class="pesecs">
        ${pc.secs.map((sec, i) => `<div class="pesec">${SK.map(([k, t]) => `<label><i>${t}</i>${num(`q${i}${k}`, k === 'n' ? 0.1 : step)}</label>`).join('')}<span><label class="chk" title="この断面で面を折る"><input type="checkbox" data-sechard="${i}" ${sec.hard ? 'checked' : ''}>折る</label><button data-secadd="${i}" title="この断面と次の断面の間に、1 つ足す">＋</button><button data-secdel="${i}" title="この断面を消す" ${pc.secs.length <= 2 ? 'disabled' : ''}>×</button></span></div>`).join('')}</div>`,
        '<h2>分割</h2>', slider('まわり', 'segments', 3, 64, 1), slider('断面の間', 'steps', 1, 12, 1),
        `<div class="hint">高さの範囲 ${fmt(shown[0]?.y ?? 0)} 〜 ${fmt(shown[shown.length - 1]?.y ?? 0)}。向きを変えるには上の「回転」で</div>`,
        '<div class="pebar"><button id="peToHull" title="この形の外側を、角と面を動かせる形（凸）に変える。へこみは埋まり、断面の設定は使えなくなる">角と面を動かせる形に変える</button></div>');
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
      // 質感（機体エディタの部品だけ。カタログ型のパーツは色の役で決まる）
      bind('metal', () => pc.metal ?? 0.55, v => { pc.metal = Math.max(0, Math.min(1, v)); });
      bind('rough', () => pc.rough ?? 0.38, v => { pc.rough = Math.max(0.02, Math.min(1, v)); });
      html.push('<h2>質感</h2>', slider('金属感', 'metal', 0, 1, 0.01), slider('粗さ', 'rough', 0.02, 1, 0.01));
      html.push('<h2>ゲーム用</h2>',
        `<div class="row"><label>付く骨</label><select id="peBone">${Object.entries(BONE_CHOICES).map(([k, v]) => `<option value="${k}" ${(pc.bone ?? 'auto') === k ? 'selected' : ''}>${v}${k === 'auto' ? ' → ' + autoB : ''}</option>`).join('')}</select></div>`,
        `<div class="row"><label>回転の中心</label><select id="pePivot">${Object.entries(PIVOT_CHOICES).map(([k, v]) => `<option value="${k}" ${(pc.pivot ?? 'auto') === k ? 'selected' : ''}>${v}${k === 'auto' ? ' → ' + autoP : ''}</option>`).join('')}</select></div>`,
        check('発光する（目・センサーなど）', 'glow'), check('当たり判定なし（関節チェックでめり込みを見ない）', 'noHit'), check('全高に数えない（頭より高い翼・背中の装備）', 'noHeight'), check('あたり（下書き。書き出さない）', 'blockout'), mouthRow(pc),
        '<div class="hint">左右のある骨（腕・脚など）は、形の真ん中が機体のどちら側にあるかで左右が決まる</div>');
    } else if (!sub) {
      bind('noHit', () => !!pc.noHit, v => { if (v) pc.noHit = true; else delete pc.noHit; });
      html.push('<h2>ゲーム用</h2>', check('当たり判定なし（関節チェックでめり込みを見ない。動力パイプ・光）', 'noHit'), mouthRow(pc), `<div class="hint">付く骨：${pc.bone ?? '（部位の既定）'}${pc.hinge ? '・蝶番あり' : ''}。光らせるには、色の役を「発光」に</div>`);
    }
    // 形態（変形の見た目、v2-forms.js）：形態 2 からの、このブロックの見た目
    const fN = ctx.form(), fAll = ctx.forms(), fv = formOf(pc, fN) ?? {};
    if (!sub) {
      html.push('<h2>形態（変形の見た目）</h2>', `<div class="seg">${Array.from({ length: fAll }, (_, i) => `<button data-form="${i + 1}" class="${i + 1 === fN ? 'on' : ''}">形態 ${i + 1}</button>`).join('')}${fAll < FORM_MAX ? '<button id="peFormAdd" title="形態を 1 つ足す">＋</button>' : ''}</div>`);
      if (fN === 1) html.push('<div class="hint">形態 1 はいつもの形（ゲーム用に書き出す形）。形態 2 からを選ぶと、その形態でのこのブロックの見た目（出す・消す、色、位置と向き）を決められる。エディタとみんなの機体の中だけで、戦場では変形しない</div>');
      else {
        const p = fv.p ?? [0, 0, 0], r = fv.r ?? [0, 0, 0];
        html.push(`<label class="chk"><input type="checkbox" id="peFHide" ${fv.hide ? 'checked' : ''}>形態 ${fN} では出さない</label>`,
          `<div class="row"><label class="chk" style="flex:1"><input type="checkbox" id="peFColorOn" ${fv.color ? 'checked' : ''}>色を変える</label><input type="color" id="peFColor" value="${esc(fv.color ?? ctx.colorOf(pc, d))}" style="width:48px"></div>`,
          `<div class="row"><label>ずらす</label>${[0, 1, 2].map(a => `<input type="number" step="0.01" data-fp="${a}" value="${p[a]}">`).join('')}</div>`,
          `<div class="row"><label>回す（度）</label>${[0, 1, 2].map(a => `<input type="number" step="5" data-fr="${a}" value="${r[a]}">`).join('')}</div>`,
          '<div class="hint">ずらす：左右・上下・前後（パーツの向きで。左右ミラーの写しは逆へ）。回す：ブロックの真ん中で、x・y・z の軸の回り。枠線と角のつまみは形態 1 の所に出る</div>',
          '<div class="pebar"><button id="peFReset">形態 1 と同じに戻す</button></div>');
      }
    }
    E.right.innerHTML = html.join('');

    // ---- つなぐ ----
    $('#peBlockName').oninput = e => { if (e.target.value) pc.name = uniqueName(e.target.value, pc); };
    $('#peBlockName').onchange = () => { commit(); renderLeft(); };
    for (const el of E.right.querySelectorAll('[data-op]')) el.onclick = () => { if ((el.dataset.op === 'sub') === sub) return; if (el.dataset.op === 'sub') { if (d.pieces.filter(p => !isSub(p)).length <= 1) { ctx.note('足すブロックが 1 個も残らなくなります', true); return; } pc.op = 'sub'; } else delete pc.op; changed(true); };
    if ($('#peColor')) { $('#peColor').oninput = e => { pc.color = e.target.value; ctx.repaint(); dimOthers(); }; $('#peColor').onchange = () => { commit(); renderLeft(); }; $('#peTeam').onchange = e => { pc.team = e.target.checked; commit(); }; }
    if ($('#peBone')) { $('#peBone').onchange = e => { pc.bone = e.target.value; changed(true); }; $('#pePivot').onchange = e => { pc.pivot = e.target.value; changed(true); }; }
    if ($('#peMouth')) { $('#peMouth').onchange = e => { if (e.target.value) pc.mouth = e.target.value; else delete pc.mouth; commit(); }; $('#peFire').onclick = () => ctx.testFire(pc); }
    if ($('#peBake')) $('#peBake').onclick = bakeTf;
    // 形態：カタログ型のパーツは、形態を持ったブロックだけ写しを 1 つずつのメッシュにするので、持つ・持たないが変わったら作り直す
    const formSet = change => { const had = !!pc.forms; if (change) setForm(pc, ctx.form(), change); else { const all = { ...(pc.forms ?? {}) }; delete all[ctx.form()]; if (Object.keys(all).length) pc.forms = all; else delete pc.forms; } if (had !== !!pc.forms && !d.free) ctx.rebuild(); else ctx.showForms(); };
    for (const el of E.right.querySelectorAll('[data-form]')) el.onclick = () => { ctx.setForm(+el.dataset.form); renderRight(); };
    if ($('#peFormAdd')) $('#peFormAdd').onclick = () => { ctx.addForm(); renderRight(); };
    if ($('#peFHide')) {
      $('#peFHide').onchange = e => { formSet({ hide: e.target.checked || null }); commit(); };
      $('#peFColorOn').onchange = e => { formSet({ color: e.target.checked ? $('#peFColor').value : null }); commit(); };
      $('#peFColor').oninput = e => { if ($('#peFColorOn').checked) formSet({ color: e.target.value }); };
      $('#peFColor').onchange = () => commit();
      const vec = k => [0, 1, 2].map(a => +E.right.querySelector(`[data-${k}="${a}"]`).value || 0);
      for (const el of E.right.querySelectorAll('[data-fp],[data-fr]')) { el.oninput = () => formSet({ p: vec('fp'), r: vec('fr') }); el.onchange = () => commit(); }
      $('#peFReset').onclick = () => { formSet(null); commit(); renderRight(); };
    }
    if ($('#peBlend')) $('#peBlend').onchange = e => { if (e.target.value) pc.blendTo = e.target.value; else delete pc.blendTo; commit(); };
    if ($('#peRole')) $('#peRole').onchange = e => { const r = e.target.value; pc.color = ROLE_COLOR[r]; if (GLOW_ROLES.has(r)) pc.glow = true; else delete pc.glow; ctx.repaint(); dimOthers(); commit(); renderLeft(); };
    for (const el of E.right.querySelectorAll('[data-f]')) {
      el.oninput = () => { const v = parseFloat(el.value); if (!Number.isFinite(v)) return; binds[el.dataset.f].set(v); for (const o of E.right.querySelectorAll(`[data-f="${el.dataset.f}"]`)) if (o !== el) o.value = el.type === 'range' ? fmt(v) : v; live(); prof?.draw(); };
      el.onchange = () => { if (st.keepCorner) { reselectCorner(st.keepCorner); st.keepCorner = null; } commit(); refresh(false); };
    }
    for (const el of E.right.querySelectorAll('[data-c]')) el.onchange = () => { binds[el.dataset.c].set(el.checked); if (['glow', 'blockout'].includes(el.dataset.c)) ctx.rebuild(); else { ctx.regeo(st.def); refresh(false); } commit(); };
    for (const el of E.right.querySelectorAll('[data-mode]')) el.onclick = () => setEditMode(el.dataset.mode);
    if ($('#peCornerDel')) $('#peCornerDel').onclick = removeCorner;
    if ($('#peEdgeJoin')) $('#peEdgeJoin').onclick = joinEdge;
    if ($('#peFaceCorner')) $('#peFaceCorner').onclick = addCornerOnFace;
    if ($('#peFaceDel')) $('#peFaceDel').onclick = removeFace;
    if ($('#peToHull')) $('#peToHull').onclick = toHull;
    for (const el of E.right.querySelectorAll('[data-sechard]')) el.onchange = () => { const sec = pc.secs[+el.dataset.sechard]; if (el.checked) sec.hard = true; else delete sec.hard; changed(false); };
    for (const el of E.right.querySelectorAll('[data-secadd]')) el.onclick = () => {
      const order = pc.secs.slice().sort((a, b) => a.y - b.y), a = pc.secs[+el.dataset.secadd], b = order[order.indexOf(a) + 1], full = s => loftSecs({ secs: [s] })[0];
      const A = full(a), B = b ? full(b) : { ...A, y: A.y + Math.max(0.02, A.y - (order[order.length - 2] ? full(order[order.length - 2]).y : A.y - 0.1)) };
      pc.secs.splice(+el.dataset.secadd + 1, 0, Object.fromEntries(['y', 'w', 'f', 'b', 'n', 'x', 'z'].map(k => [k, r5((A[k] + B[k]) / 2)])));
      changed(false);
    };
    for (const el of E.right.querySelectorAll('[data-secdel]')) el.onclick = () => { if (pc.secs.length > 2) { pc.secs.splice(+el.dataset.secdel, 1); changed(false); } };
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
  function selectBlock(i) { st.sel = i; clearSel(); refresh(); flashBlock(); }
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
    st.def.pieces.push(pc); st.sel = st.def.pieces.length - 1; st.mode = 'block'; clearSel(); gizmo.setMode('translate');
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
  /** 断面をつなぐ形を足す：大きさをパーツに合わせて縮めて、選んだブロックの上に置く */
  function addLoft(name) {
    const src = structuredClone(LOFTS[name]), ref = block() ?? st.def.pieces[0], b = refBox(), lo = b.min.toArray(), hi = b.max.toArray();
    const k = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2], 0.02) * 0.5;
    for (const sec of src.secs) for (const f of ['y', 'w', 'f', 'b', 'x', 'z']) if (sec[f] != null) sec[f] = r5(sec[f] * k);
    pushBlock({ ...carry(ref), kind: 'loft', ...src, color: ROLE_COLOR.main, name: uniqueName(name), pos: [0, 0, 0],
      tf: { p: [(lo[0] + hi[0]) / 2, hi[1] + k / 2, (lo[2] + hi[2]) / 2].map(r5), r: [0, 0, 0], s: [1, 1, 1] } });
  }
  /** 蛇腹を足す：大きさをパーツに合わせて縮めて、選んだブロックの上に置く */
  function addBellows(name) {
    const src = structuredClone(BELLOWS[name]), ref = block() ?? st.def.pieces[0], b = refBox(), lo = b.min.toArray(), hi = b.max.toArray();
    const k = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2], 0.02) * 0.5;
    for (const f of ['rOut', 'rIn', 'len', 'capA', 'capB']) if (src[f] != null) src[f] = r5(src[f] * k);
    pushBlock({ ...carry(ref), kind: 'bellows', segments: 12, ringSteps: 3, ...src, color: ROLE_COLOR.sub, name: uniqueName(name), pos: [0, 0, 0],
      tf: { p: [(lo[0] + hi[0]) / 2, hi[1], (lo[2] + hi[2]) / 2].map(r5), r: [0, 0, 0], s: [1, 1, 1] } });
  }
  function copyBlock(mirror) {
    const pc = block(); if (!pc) return;
    const c = structuredClone(pc), s = boxOf(pc).getSize(new THREE.Vector3()), off = [r5(Math.max(s.x, s.y) * 0.15), r5(Math.max(s.x, s.y) * 0.15), 0];
    c.name = uniqueName(pc.name + (mirror ? '（反転）' : '（写し）'));
    if (hullEdit(pc)) c.planes = mirror ? pc.planes.map(p => [-p[0], p[1], p[2], p[3]]) : movePlanes(pc.planes, off).map(p => p.map(r5));
    else if (mirror) c.tf = { p: [-pc.tf.p[0], pc.tf.p[1], pc.tf.p[2]], r: [pc.tf.r[0], -pc.tf.r[1], -pc.tf.r[2]], s: [-pc.tf.s[0], pc.tf.s[1], pc.tf.s[2]] };
    else c.tf.p = c.tf.p.map((v, i) => r5(v + off[i]));
    st.def.pieces.splice(st.sel + 1, 0, c); st.sel += 1; clearSel();
    changed(true); flashBlock();
  }
  function removeBlock() {
    const pc = block(); if (!pc) return;
    if (!isSub(pc) && st.def.pieces.filter(p => !isSub(p)).length <= 1) { ctx.note('足すブロックの最後の 1 個は消せません（パーツごと消すときは、機体の画面で「この自分のパーツをカタログから消す」）', true); return; }
    st.def.pieces.splice(st.sel, 1); st.sel = Math.min(st.sel, st.def.pieces.length - 1); clearSel();
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
    st.corner = bi; st.more = [];   // 動かした角が立体の内側に入って消えたら、選びなおし
  }
  function removeCorner() {
    // 選んだ角ぜんぶ（左右対称なら反対側の角も）
    const pc = block(), all = cornersOf(pc.planes), drop = new Set(selOf());
    if (symOn()) for (const i of [...drop]) { const t = mirrorIndex(all, i); if (t >= 0) drop.add(t); }
    const pts = all.filter((_, i) => !drop.has(i));
    const pl = planesOf(pts);
    if (!pl) { ctx.note('これ以上角を消すと、形がなくなります', true); return; }
    pc.planes = pl; clearSel(); changed(false);
  }
  function addCornerOnFace() {
    const pc = block(), f = faceInfo(pc, st.face); if (!f) return;
    const s = boxOf(pc).getSize(new THREE.Vector3()), out = Math.max(s.x, s.y, s.z) * 0.12, at = f.c.clone().addScaledVector(f.n, out).toArray().map(r5);
    const pts = [...f.all, at];
    if (symOn() && Math.abs(at[0]) > 1e-3) pts.push([-at[0], at[1], at[2]]);
    const pl = planesOf(pts); if (!pl) return;
    pc.planes = pl; st.mode = 'corner'; st.face = -1; reselectCorner(at); changed(false);
  }
  /** 選んだ辺の両端の角を、辺の真ん中の 1 つの角にまとめる（左右対称なら反対側の辺も） */
  function joinEdge() {
    const pc = block(), e = edgesOf(pc.planes, st.pts)[st.edge]; if (!e) return;
    const pts = st.pts, mid = a => pts[a.a].map((v, k) => r5((v + pts[a.b][k]) / 2)), m = mid(e), drop = new Set([e.a, e.b]), add = [m];
    if (symOn()) { const ta = mirrorIndex(pts, e.a), tb = mirrorIndex(pts, e.b); if (ta >= 0 && tb >= 0 && !drop.has(ta)) { drop.add(ta); drop.add(tb); add.push([-m[0], m[1], m[2]]); } }
    const pl = planesOf([...pts.filter((_, i) => !drop.has(i)), ...add]);
    if (!pl) { ctx.note('この辺をまとめると、形がなくなります', true); return; }
    pc.planes = pl; st.mode = 'corner'; st.edge = -1; reselectCorner(m); changed(false);
  }
  function removeFace() {
    const pc = block(), pl = pc.planes.filter((_, i) => i !== st.face), reach = hullReach(pc.planes);
    // 面をなくして形が開いてしまわないか（角が遠くへ飛ばないか）を確かめる
    const pts = pl.length >= 4 ? cornersOf(pl) : [];
    if (pts.length < 4 || pts.some(p => Math.max(Math.abs(p[0]), Math.abs(p[1]), Math.abs(p[2])) > reach * 0.9)) { ctx.note('この面をなくすと、形が閉じなくなります', true); return; }
    pc.planes = pl; clearSel(); changed(false);
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
    for (const k of ['pts', 'depth', 'corner', 'cornerSegs', 'taper', 'tiltY', 'ridge', 'segments', 'secs', 'steps', 'side', 'top', 'tf']) delete pc[k];
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
    st = { def, replaced, isNew, sel: 0, mode: 'block', corner: -1, edge: -1, face: -1, more: [], handles: [], helper: null, ghosts: new Map(), others: 'faint', showSubs: true, showBlock: true, sym: true, snap: true, face2d: 'front',
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
  /** クリック：角の印 → 角を選ぶ。面を選ぶ動きなら面。それ以外はブロックを選ぶ。add（Ctrl・Shift を押しながら）：角・辺・面を選び足す・外す（issue #242） */
  function pick(ndc, add = false) {
    ray.setFromCamera(ndc, camera);
    holder.updateMatrixWorld(true);   // （作り直したばかりの角の丸は、描くまで大きさが位置の行列に入っていない：続けて押すと、ほかの丸に当たる）
    if (st.mode === 'corner' && st.handles.length) {
      const h = ray.intersectObjects(st.handles, false)[0];
      if (h) { choose(h.object.userData.corner, add); return; }
    }
    if (st.mode === 'edge') {
      const k = pickEdge(ndc);
      if (k >= 0) { choose(k, add); return; }
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
      if (best >= 0) choose(best, add);
      return;
    }
    selectBlock(i);
  }
  /** つまみを動かしている間 */
  function onGizmoChange() {
    const pc = block(); if (!pc) return;
    if (st.mode === 'corner' && st.corner >= 0 && !st.helper) {
      const h = st.handles[st.corner], at = h.position.toArray();
      const pts = st.pts.map((p, i) => (i === st.corner ? at : p));
      if (st.twin >= 0) { if (st.twin === st.corner) pts[st.corner] = [0, at[1], at[2]]; else pts[st.twin] = [-at[0], at[1], at[2]]; }
      const pl = planesOf(pts);
      if (pl) { pc.planes = pl; st.ptsNow = pts; live(); }
    } else if (st.mode !== 'block' && st.helper) {
      // 辺・面：つまみの動き（つかんだ時からの移動・回転・拡大）を、その辺・面の角にだけ掛けて、凸の立体を作り直す（となりの面が傾く）。
      // 平面だけを動かすと、丸めた形ではとなりの面にすぐ閉じられて、面が出てこない。反対側の角には左右を返した動きを掛ける。
      // 片側だけを選んで左右対称に直すとき、x = 0 の上の角は x = 0 に残す
      const h = st.helper; h.updateMatrix();
      const M = h.matrix.clone().multiply(st.H0i), Ms = MIRROR.clone().multiply(M).multiply(MIRROR), keep0 = st.keep0;
      const pts = st.pts0.map((p, i) => {
        if (st.selIx.has(i)) { const q = V(p).applyMatrix4(M).toArray(); if (keep0 && Math.abs(p[0]) < 1e-4) q[0] = 0; return q; }
        return st.twinIx.has(i) ? V(p).applyMatrix4(Ms).toArray() : p;
      });
      const pl = planesOf(pts);
      if (pl) { pc.planes = pl; st.ptsNow = pts; live(); }
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
    if (st.mode === 'corner' && st.corner >= 0 && !st.helper && st.ptsNow) { const at = st.ptsNow[st.corner]; st.ptsNow = null; reselectCorner(at); }
    // 動かした角・辺・面を選んだままにする（角・面・辺の並びは作り直されるので、動いた角の位置で探し直す）
    if (st.mode !== 'block' && st.helper && st.selAt && st.ptsNow) { const ats = st.selAt.map(g => g.map(i => st.ptsNow[i])); st.ptsNow = null; reselectParts(ats); }
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
    if (k === 'escape') { clearSel(); refresh(); return true; }
    if (k === 'f') { frame(); return true; }
    if (['1', '2', '3', '4'].includes(k)) { setEditMode(['block', 'corner', 'edge', 'face'][+k - 1]); return true; }
    if (['w', 'e', 'r'].includes(k)) { setGizmoMode({ w: 'translate', e: 'rotate', r: 'scale' }[k]); return true; }
    return false;
  }
  /** つまみの種類（移動・回転・拡大）。角を動かしている間は移動だけ。辺・面はその辺・面の向きのつまみ */
  function setGizmoMode(m) {
    if (!st || (st.mode === 'corner' && selOf().length < 2)) return;
    gizmo.setMode(m);
    gizmo.setSpace(st.mode !== 'block' || (m === 'scale' && block() && !hullEdit(block())) ? 'local' : 'world');
  }
  return { active: () => !!st, editing: () => st?.def.id ?? null, touch: () => { if (st) { commit(); refresh(); } }, start, startDef, startNew, pick, onGizmoChange, onDragEnd, afterRebuild: refresh, key, undo, redo, setGizmoMode, tick,
    debug: () => st,
    state: () => st && { sel: st.sel, mode: st.mode, corner: st.corner, edge: st.edge, face: st.face, hist: st.hist.length, hpos: st.hpos, blocks: st.def.pieces.length } };
}
