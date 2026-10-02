// XS の骨格図（胴のジェネレーターの共通の寸法）と、部品を作る道具
//
// 胴は「腹の関節」で上半身と下半身に割る。動く継ぎ目が腹だけ（poses.json を全動作で集計すると、腰に対する胴のひねりは
// ±68°、前後傾は −25°〜+17°、腰と頭は回らない）なので、そこで割ると片方ずつ骨が固定になる。
//   下半身 = hips 骨：腰・前後横のスカート・腹の関節（縦の円柱）・股関節の土台と関節（xslower.js）
//   上半身 = torso 骨：胸・背中・襟・バックパック・肩関節の土台（あとで）
//   腕と脚は別のジェネレーター（あとで）。下半身は股関節の円柱まで、上半身は肩関節の円柱までを担当する。
// 関節の部品は回らない側（親）に付く決まりなので、腹の関節と股関節は下半身が、肩関節は上半身が作る。
// 首の円柱は頭ジェネレーターが作る（部品名「首」）ので、上半身は襟までで止め、首の位置はこの図から受け取る。
//
// 骨格図（sheet）：上半身・下半身・腕・脚が同じ数値を読む。座標は標準体型（全高 3、足の裏が y = 0、+Z が正面、
// +X が機体の左）のまま。ジェネレーターは place で移動・拡大して置く。
//
// 各部の寸法は、ゲームの動きで部品どうしがぶつからないための約束を含む（値の根拠は下の「約束」）。
//   [独自] 寸法はすべてここで決めた値。出典のある数値ではない。
//
// 約束（脚の骨は hips の子で、股関節の軸 X のまわりに回る。回転は軸からの距離 ρ を変えない）
//   1) 太ももは x が legBand.xIn〜xOut の柱の中に収める。太ももの上端は股関節の中心から ρ = hip.swing 以内。
//   2) 腰（hips 骨）の部品は次のどれかの領域に置く：
//        A 中央の柱   |x| ≤ legBand.xIn（太ももと x が重ならない）
//        B 外側       |x| ≥ legBand.xOut + 0.005（同上）
//        C 上の帯     y ≥ waist.yBand（脚をいちばん上げても届かない高さ）
//   3) 前スカートなど脚の骨（leg）に付く前面の部品は、太ももの前の面から前へ hip.frontLimit までに収める。
//      脚を 83〜92° 上げると前面の部品は水平になり、高さ hip.y + (前への出) に来るので、それが waist.yBand より下に収まる。
//      それより下で前へ張り出す部分（裾の広がり）は、水平になったとき腰の前端より前へ出るので、ぶつからない。
//   4) 上半身は腹の中心 belly を中心に前後へ −25°〜+17°、左右へ ±0.2 rad、ひねり ±70° 回る。胸の下端は腹の円柱の上に
//      重ね（chest.yBot は円柱の上端より少し下）、腰の上面（waist.yTop）より chest.gap 以上上にする。

import { planeAt } from './hull.js';
import { makeRng, PALETTES, seedFromText } from './xshead.js';
export { makeRng, PALETTES, seedFromText };

export const SHEET_VERSION = 1;
export const D = Math.PI / 180;
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const clamp01 = v => clamp(+v || 0, 0, 1);
export const lerp = (a, b, t) => a + (b - a) * t;
export const r4 = v => Math.round(v * 1e4) / 1e4;
export const r4v = a => a.map(r4);

// ---------------- 骨格図 ----------------
export const STYLE_AXES = [
  { key: 'sharp', label: '鋭さ', hint: '角を立て、面を傾け、装甲を細くする' },
  { key: 'round', label: '丸み', hint: '角を丸め、断面を丸くする' },
  { key: 'bulk', label: '重さ', hint: '腰を太く厚く、装甲を大きくする' },
  { key: 'detail', label: '密度', hint: '溝・ダクト・小部品を増やす' },
];
/** 骨格図の比率つまみ（0〜1、0.5 が標準）。上半身・下半身の両方の見た目に効く */
export const SHEET_PARAMS = [
  { key: 'waist', label: '腰の幅', def: 0.5, hint: '腰の上の帯の幅（脚の柱の外側から 0.055〜0.12 広い）' },
  { key: 'waistD', label: '腰の奥行', def: 0.5, hint: '腰の上の帯の前後（±0.17〜±0.23）' },
  { key: 'hip', label: '股関節の間隔', def: 0.5, hint: '左右の脚の間隔（x = ±0.16〜±0.19）。脚の太さも変わる' },
  { key: 'belly', label: '腹の太さ', def: 0.5, hint: '腹の円柱の半径（0.11〜0.16）。太いほど上半身の傾きに強い' },
  { key: 'bellyY', label: '腹の高さ', def: 0.5, hint: '腹の関節の高さ（y = 1.95〜2.05）' },
  { key: 'chest', label: '胸の幅', def: 0.5, hint: '胸の下端の幅（±0.27〜±0.33）' },
  { key: 'shoulder', label: '肩幅', def: 0.5, hint: '肩の関節の x（0.42〜0.48）' },
];

/**
 * 骨格図を作る。opts: { style: { sharp, round, bulk, detail }, ratio: { waist, hip, ... }（0〜1） }
 * 戻り値の各値は標準体型の座標（エディタの単位）。
 */
export function makeSheet(opts = {}) {
  const st = {}; for (const ax of STYLE_AXES) st[ax.key] = clamp01(opts.style?.[ax.key] ?? 0.5);
  const rt = {}; for (const pr of SHEET_PARAMS) rt[pr.key] = clamp01(opts.ratio?.[pr.key] ?? pr.def);
  const by = r4(lerp(1.95, 2.05, rt.bellyY));                       // 腹の関節の高さ
  const belly = { x: 0, y: by, z: 0, r: r4(lerp(0.11, 0.16, rt.belly) * (1 + 0.05 * st.bulk)), hh: 0.14 };
  const hipX = r4(lerp(0.16, 0.19, rt.hip));
  const hipHalf = 0.1;                                                    // 股関節の円柱の半分の長さ（x）
  const hip = { x: hipX, y: 1.6, z: 0, r: 0.1, half: hipHalf,
    swing: 0.13,                       // 太ももの上端の ρ（回るとこの円の中を通る）
    frontLimit: 0.15,                  // 太ももの前の面から前へ：脚の骨の前面の部品が出てよい z の上限
    thighFront: 0.11, thighBack: -0.11 // 太ももの前後の面（z）
  };
  const legBand = { xIn: r4(hipX - hipHalf + 0.015), xOut: r4(hipX + hipHalf - 0.015) };   // 太ももが収まる x の柱
  const waist = { hw: r4((legBand.xOut + lerp(0.055, 0.12, rt.waist)) * (1 + 0.05 * st.bulk)), hd: r4(lerp(0.17, 0.23, rt.waistD) * (1 + 0.05 * st.bulk)),
    yTop: r4(by - 0.14), yBand: r4(hip.y + hip.frontLimit + 0.02) };
  const chest = { yBot: r4(by + 0.1), hw: r4(lerp(0.27, 0.33, rt.chest) * (1 + 0.04 * st.bulk)), hd: 0.22, hdLow: 0.15, gap: r4(by + 0.1 - (by - 0.14)) };
  const shoulder = { x: r4(lerp(0.42, 0.48, rt.shoulder)), y: 2.5, z: 0, r: 0.1, half: 0.09 };
  const neck = { x: 0, y: 2.7, z: 0, r: 0.06 };
  const sheet = { format: 'xs-body-sheet', version: SHEET_VERSION, style: st, ratio: rt, height: 3, belly, waist, chest, hip, legBand, shoulder, neck,
    range: { twist: 70 * D, pitchFwd: 17 * D, pitchBack: 25 * D, roll: 0.22, legFwd: 92 * D, legBack: 63 * D },
    notes: [] };
  sheet.notes = checkSheet(sheet);
  return sheet;
}

/** 骨格図の約束を確かめる。破れていれば文で返す（空なら大丈夫） */
export function checkSheet(S) {
  const out = [];
  // 前スカートが水平になる高さ（脚を上げたとき）より、腰の上の帯が高いこと
  if (S.waist.yBand < S.hip.y + S.hip.frontLimit + 0.005) out.push('腰の上の帯が低すぎます（脚を上げた前面の部品とぶつかる）');
  // 腹の円柱の中に、上半身が回る中心がある
  if (S.belly.y - S.belly.hh > S.waist.yTop + 0.03) out.push('腰の上面と腹の円柱の下端が離れています');
  if (S.waist.yTop >= S.chest.yBot - 0.04) out.push('腰の上面が胸の下端に近すぎます（胸が前後に傾くとめり込む）');
  // 前後傾で胸の下端の角が描く円
  const pf = S.range.pitchFwd, pb = S.range.pitchBack, dy = S.chest.yBot - S.belly.y, dz = S.chest.hd;
  const low = Math.min(S.belly.y + dy * Math.cos(pf) - dz * Math.sin(pf), S.belly.y + dy * Math.cos(pb) - dz * Math.sin(pb));
  if (low < S.waist.yTop + 0.01) out.push(`胸の下端の角が前後に傾くと腰の上面より下へ（${low.toFixed(3)} < ${S.waist.yTop}）。胸の下端を狭める（hdLow）か、胸を上げる`);
  if (S.legBand.xIn < 0.06) out.push('股関節の間隔が狭すぎます');
  if (S.waist.hw * 0.94 < S.legBand.xOut + 0.03) out.push('腰の幅が脚の柱より狭く、外側の台を置けません');
  return out;
}

// ---------------- 部品を作る道具（下半身・上半身の両方で使う） ----------------
export const P = planeAt;
const bv = b => b !== undefined ? [b] : [];
export const XH = (x, b) => [1, 0, 0, x, ...bv(b)], XL = (x, b) => [-1, 0, 0, -x, ...bv(b)];   // x ≤ / x ≥
export const YH = (y, b) => [0, 1, 0, y, ...bv(b)], YL = (y, b) => [0, -1, 0, -y, ...bv(b)];
export const ZH = (z, b) => [0, 0, 1, z, ...bv(b)], ZL = (z, b) => [0, 0, -1, -z, ...bv(b)];
const mirrorPl = pl => [-pl[0], pl[1], pl[2], pl[3], ...(pl.length > 4 ? [pl[4]] : [])];
/** 平面とその鏡像の両方 */
export const both = (...pls) => pls.flatMap(pl => [pl, mirrorPl(pl)]);
/** 箱の 6 面 */
export const boxPl = (x0, x1, y0, y1, z0, z1, b) => [XH(x1, b), XL(x0, b), YH(y1, b), YL(y0, b), ZH(z1, b), ZL(z0, b)];

const BASE = { kind: 'extrude', op: 'add', mirror: false, bevel: 0.004, bevelSegs: 1, corner: 0, cornerSegs: 1, taper: 1, tiltY: 0, ridge: 0,
  segments: 24, arrayCount: 1, arrayStep: [0, 0.15, 0], metal: 0.4, rough: 0.5, team: false, glow: false, pivot: 'auto',
  pos: [0, 0, 0], rot: [0, 0, 0], scl: [1, 1, 1], side: null, top: null, planes: null, blockout: false };
/** 部品の道具を、付く骨ごとに作る。H = 面で作る部品（planes は世界座標、pos は 0）、F = 押し出し、L = 回転体（軸はローカル Y） */
export function makeKit(bone) {
  const B = { ...BASE, bone };
  return {
    H: (name, planes, o = {}) => ({ ...B, name, kind: 'hull', planes, pts: [[0, 0], [1, 0], [1, 1]], depth: 0.1, ...o }),
    F: (name, pts, depth, pos, o = {}) => ({ ...B, name, pts, depth, pos, ...o }),
    L: (name, pts, pos, o = {}) => ({ ...B, name, kind: 'lathe', pts, pos, segments: 16, ...o }),
  };
}
export const rect = (w, h, cx = 0, cy = 0) => [[cx - w / 2, cy - h / 2], [cx + w / 2, cy - h / 2], [cx + w / 2, cy + h / 2], [cx - w / 2, cy + h / 2]];
export const CUT = { op: 'sub', bevel: 0, corner: 0, glow: false };
export const MAT = { armor: { metal: 0.35, rough: 0.5 }, frame: { metal: 0.45, rough: 0.55 }, glow: { metal: 0, rough: 0.25 }, dark: { metal: 0.6, rough: 0.4 } };
export const AXIS_X = [0, 0, -Math.PI / 2];     // 回転体の軸を +X へ（ローカルの +h が +X）
export const AXIS_Z = [Math.PI / 2, 0, 0];      // 同 +Z（前）へ
export const AXIS_ZB = [-Math.PI / 2, 0, 0];    // 同 -Z（後ろ）へ

/**
 * 配置：骨格図の腹の中心（既定の位置）を place.pos へ動かし、place.scale 倍する。部品の一覧を新しく返す。
 * 面で作る部品（hull）は平面を骨格図の座標のまま持ち、pos と scl で動かす（世界 = pos + scl × 平面の座標）。
 */
export function placeParts(parts, S, place = {}) {
  const c = [S.belly.x, S.belly.y, S.belly.z];
  const pos0 = place.pos ?? c, s = place.scale ?? 1;
  const out = [];
  for (const p of parts) {
    const q = { ...p };
    const at = p.pos ?? [0, 0, 0];
    q.pos = r4v(p.kind === 'hull'
      ? [pos0[0] - s * c[0] + s * at[0], pos0[1] - s * c[1] + s * at[1], pos0[2] - s * c[2] + s * at[2]]
      : [pos0[0] + (at[0] - c[0]) * s, pos0[1] + (at[1] - c[1]) * s, pos0[2] + (at[2] - c[2]) * s]);
    q.scl = r4v([(p.scl?.[0] ?? 1) * s, (p.scl?.[1] ?? 1) * s, (p.scl?.[2] ?? 1) * s]);
    q.rot = r4v(p.rot ?? [0, 0, 0]);
    q.pts = p.pts.map(r4v);
    if (q.planes) q.planes = q.planes.map(pl => pl.map(v => Math.round(v * 1e5) / 1e5));
    if (q.side) q.side = q.side.map(r4v);
    if (q.top) q.top = q.top.map(r4v);
    if (q.arrayCount > 1) q.arrayStep = r4v(q.arrayStep.map(v => v * s));
    q.depth = r4(q.depth);
    out.push(q);
  }
  return out;
}

/** 骨格図の比率つまみを乱数で決める（範囲は lo〜hi、既定は端近くまで） */
export function randomRatio(rng, lo = 0.05, hi = 0.95) {
  const out = {};
  for (const pr of SHEET_PARAMS) out[pr.key] = r4(rng.range(lo, hi));
  return out;
}
