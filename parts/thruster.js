// 噴射口：小さな噴射口の箱。縦の 4 辺と後ろの縁を面取りした箱で、前面（+z、z 0）が取り付け面。
// 後ろ面（−z）に八角形のノズル（本当のくぼみ）：ノズルの縁は 8 枚の台形の piece の輪（正八角形で後ろへ少し開き、後ろの縁は面取り、
// 内側の壁は奥へすぼまる）。箱の角は輪の外に見える。輪の奥に暗い八角形の板、その中心に光る小さな八角形
import { P, ZH, ZL, piece, MAIN, DARK, BLACK, GLOW } from '../xsasm-lib.js';

const W = 0.05;                        // 箱の半幅（x・y）
const CH = 0.015;                      // 箱の縦の辺の面取り幅
const RIM = 0.008;                     // 箱の後ろの縁の面取り幅
const BACK = -0.12, FLOOR = -0.085;    // ノズルの後ろ端の z、くぼみの底（= 箱の後ろ面）の z
const OUT0 = 0.038, OUT1 = 0.047;      // 輪の外側の面までの距離：箱側 と 後ろ端（後ろへ開く釣鐘形）
const LIP = 0.005;                     // 輪の後ろの縁の面取り幅
const MOUTH = 0.032, BOTTOM = 0.026;   // 穴の壁までの距離：口 と 底（奥へすぼまる）
const KF = (OUT1 - OUT0) / (FLOOR - BACK);   // 外側の開きの傾き
const KI = (MOUTH - BOTTOM) / (BACK - FLOOR); // 穴の壁の傾き
const DIRS = [0, 1, 2, 3, 4, 5, 6, 7];
const ang = k => k * Math.PI / 4;
const dir = k => [Math.cos(ang(k)), Math.sin(ang(k))];
const APO = k => (k % 2 === 0 ? W : (2 * W - CH) / Math.SQRT2);   // 箱の輪郭の、向き k の面までの距離（斜めは縦の辺の面取り面）
/** 正八角柱：面までの距離 a、z0..z1 */
const oct = (a, z0, z1) => [...DIRS.map(k => { const [c, s] = dir(k); return P([c, s, 0], [a * c, a * s, 0]); }), ZL(z0), ZH(z1)];
const NAMES = ['右', '右上', '上', '左上', '左', '左下', '下', '右下'];

/** ノズルの縁 1 枚（向き k）：外側は後ろへ開く面と縁の面取り、内側は穴の壁、両脇は中心を通る面で 45 度ずつに切った扇形 */
const rim = k => {
  const [c, s] = dir(k);
  const a0 = ang(k) - Math.PI / 8, a1 = ang(k) + Math.PI / 8;
  return piece('縁・' + NAMES[k], [
    P([c, s, KF], [OUT1 * c, OUT1 * s, BACK]),                                                   // 外側：後ろへ少し開く
    P([c, s, -1], [(OUT1 - LIP) * c, (OUT1 - LIP) * s, BACK]),                                   // 後ろの縁の面取り
    ZL(BACK), ZH(FLOOR),
    P([-Math.sin(a1), Math.cos(a1), 0], [0, 0, 0]), P([Math.sin(a0), -Math.cos(a0), 0], [0, 0, 0]),   // 両脇（扇形に切る）
    P([-c, -s, KI], [MOUTH * c, MOUTH * s, BACK]),                                               // 穴の壁：口 0.032（z −0.12）→ 底 0.026（z −0.085）へすぼまる。法線は軸の側かつ後ろ向き（KI < 0）
  ], { color: DARK });
};

export default {
  id: 'thruster', name: '噴射口', cat: '飾り', size: [0.1, 0.1, 0.12],
  pieces: [
    // 箱の本体：取り付け面（z 0）から後ろの面取りの手前まで。縦の 4 辺を面取りした八角柱
    piece('本体', [...DIRS.map(k => { const [c, s] = dir(k), a = APO(k); return P([c, s, 0], [a * c, a * s, 0]); }), ZH(0), ZL(FLOOR + RIM)]),
    // 箱の後ろの縁：8 方向とも 45 度に落とした面取り（本体と同じ輪郭から後ろ面 z −0.085 へすぼまる）
    piece('後ろ縁', [...DIRS.map(k => { const [c, s] = dir(k), a = APO(k) - RIM; return P([c, s, -1], [a * c, a * s, FLOOR]); }), ZH(FLOOR + RIM), ZL(FLOOR)]),
    ...DIRS.map(rim),
    piece('奥板', oct(0.028, -0.09, -0.082), { color: BLACK }),                                   // くぼみの底の暗い八角形の板
    piece('光る芯', oct(0.011, -0.096, -0.086), { color: GLOW, glow: true, metal: 0, rough: 0.3 }),   // 板の中心の光る小さな八角形
  ],
};
