// 首：八角柱の柱が中心。上端に頭を受ける小さな段（細い八角の突起）、下端に外へ広がる八角形の襟（縦の縁と、斜めに広がる皿）。
// 柱の前後に細い縦の筋（少し出た細い板）。y 0 が襟の底、上へ +y。x 右・y 上・z 前。八角は前後左右が平らな面
import { P, YH, YL, box, piece, MAIN, DARK } from '../xsasm-lib.js';

const D = Math.PI / 180;
/** 八角の向き：k = 0 が前（+z）、45 度ずつ回る */
const DIRS = Array.from({ length: 8 }, (_, k) => [Math.sin(k * 45 * D), Math.cos(k * 45 * D)]);
/** 縦に立つ八角の側面 8 枚（a は中心から面までの距離） */
const oct = a => DIRS.map(([sx, sz]) => P([sx, 0, sz], [a * sx, 0, a * sz]));
/** 斜めの八角の側面 8 枚：外側の低い縁 (a1, y1) から 内側の高い縁 (a0, y0) へ上がる（皿の上面） */
const octSlope = (a0, y0, a1, y1) => DIRS.map(([sx, sz]) => P([sx * (y0 - y1), a1 - a0, sz * (y0 - y1)], [a0 * sx, y0, a0 * sz]));

// 大きさ：襟の前後左右の面が ±0.06（幅 0.12）、全高 0.15
const A_COLLAR = 0.06;     // 襟：中心から面までの距離
const A_COL = 0.036;       // 柱
const A_STEP = 0.027;      // 上の段
const Y_RIM = 0.016;       // 襟の縦の縁の高さ
const Y_DISH = 0.036;      // 皿の上端（柱に接する所）。斜面はおよそ 45 度
const Y_COL_TOP = 0.132;   // 柱の上端
const Y_TOP = 0.15;        // 段の上端

export default {
  id: 'neck', name: '首', cat: '首', size: [0.12, 0.15, 0.12],
  pieces: [
    piece('襟の縁', [...oct(A_COLLAR), YL(0), YH(Y_RIM)]),                                     // 下端の縦の縁：八角の低い輪
    piece('襟の皿', [...octSlope(A_COL + 0.005, Y_DISH, A_COLLAR, Y_RIM), YL(Y_RIM), YH(Y_DISH)]),   // 縁の上の角から柱へ斜めに上がる皿（縁と接する）。上端は柱の周りに細い平らな輪
    piece('柱', [...oct(A_COL), YL(Y_DISH - 0.012), YH(Y_COL_TOP)], { color: DARK }),         // 中心の八角柱（皿の中まで下ろして重ねる）
    piece('段', [...oct(A_STEP), YL(Y_COL_TOP - 0.004), YH(Y_TOP)], { color: DARK }),         // 上端：頭を受ける小さな八角の段
    piece('筋（前）', box(-0.006, 0.006, Y_DISH - 0.006, Y_COL_TOP - 0.004, A_COL - 0.008, A_COL + 0.008)),     // 柱の前面から少し出た細い縦の板
    piece('筋（後）', box(-0.006, 0.006, Y_DISH - 0.006, Y_COL_TOP - 0.004, -(A_COL + 0.008), -(A_COL - 0.008))),   // 柱の後面の同じ板
  ],
};
