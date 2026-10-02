// 首（頭を載せる柱）。4 種類。どれも y 0 が底（襟の中に入る所）、上へ +y、全高 0.15。x 右・y 上・z 前。
// 上端はどれも同じ「段」（細い八角の突起。頭の殻のあごの中へ入る）、下端は外へ広がる台（胴の襟の中に座る）。
//   首            ：八角の柱。下に八角の皿、前後に細い縦の筋
//   首（蛇腹）    ：そろばん玉の輪を 5 段重ねた、曲がる管。上下に装甲の受け
//   首（シリンダー）：細い芯のまわりに、斜めに立つ油圧シリンダー 4 本。上下の板で挟む
//   首（太い装甲）：下が太く上が細い八角の装甲。前に稜の板、左右に黒い溝、上に暗い関節の帯
// 首当て（襟）は別の部位（parts/collar.js）：首に足して付ける。首と入れ替えるものではない
import { P, YH, YL, box, piece, planesFromPoints, MAIN, DARK, BLACK } from '../xsasm-lib.js';

const D = Math.PI / 180;
/** 八角の向き：k = 0 が前（+z）、45 度ずつ回る */
const DIRS = Array.from({ length: 8 }, (_, k) => [Math.sin(k * 45 * D), Math.cos(k * 45 * D)]);
/** 縦に立つ八角の側面 8 枚（a は中心から面までの距離） */
const oct = a => DIRS.map(([sx, sz]) => P([sx, 0, sz], [a * sx, 0, a * sz]));
/** 斜めの八角の側面 8 枚：外側の低い縁 (a1, y1) から 内側の高い縁 (a0, y0) へ上がる（皿の上面） */
const octSlope = (a0, y0, a1, y1) => DIRS.map(([sx, sz]) => P([sx * (y0 - y1), a1 - a0, sz * (y0 - y1)], [a0 * sx, y0, a0 * sz]));
/** 点の集まりを包む凸の部品 */
const hull = (name, pts, o = {}) => piece(name, planesFromPoints(pts), o);
/** 高さ y の輪の n 点（半径 r、中心 cx・cz、th0 度から） */
const ring = (y, r, n = 12, cx = 0, cz = 0, th0 = 0) => Array.from({ length: n }, (_, k) => { const t = (th0 + k * 360 / n) * D; return [cx + r * Math.sin(t), y, cz + r * Math.cos(t)]; });
/** 2 点 a → b の間の筒（半径 r0 → r1、8 角） */
function rod(name, a, b, r0, r1, o = {}) {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], l = Math.hypot(...d), u = d.map(v => v / l);
  const s0 = Math.abs(u[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  let s = [u[1] * s0[2] - u[2] * s0[1], u[2] * s0[0] - u[0] * s0[2], u[0] * s0[1] - u[1] * s0[0]]; const ls = Math.hypot(...s); s = s.map(v => v / ls);
  const t = [u[1] * s[2] - u[2] * s[1], u[2] * s[0] - u[0] * s[2], u[0] * s[1] - u[1] * s[0]];
  const at = (c, r) => Array.from({ length: 8 }, (_, k) => { const th = (k + 0.5) * 45 * D; return [0, 1, 2].map(i => c[i] + r * (Math.cos(th) * s[i] + Math.sin(th) * t[i])); });
  return hull(name, [...at(a, r0), ...at(b, r1)], o);
}

// 大きさ：襟の前後左右の面が ±0.06（幅 0.12）、全高 0.15
const A_COLLAR = 0.06;     // 襟：中心から面までの距離
const A_COL = 0.036;       // 柱
const A_STEP = 0.027;      // 上の段
const Y_RIM = 0.016;       // 襟の縦の縁の高さ
const Y_DISH = 0.036;      // 皿の上端（柱に接する所）。斜面はおよそ 45 度
const Y_COL_TOP = 0.132;   // 柱の上端
const Y_TOP = 0.15;        // 段の上端
/** 上端の段：頭を受ける小さな八角の突起（どの首も同じ）。頭の回転の中心：首は胴に付いたままで、頭はこの段を中心に起きる（unitparts.js） */
const step = () => piece('段', [...oct(A_STEP), YL(Y_COL_TOP - 0.004), YH(Y_TOP)], { color: DARK, pivot: 'head' });

const neck = {
  id: 'neck', name: '首', cat: '首', size: [0.12, 0.15, 0.12],
  pieces: [
    piece('襟の縁', [...oct(A_COLLAR), YL(0), YH(Y_RIM)]),                                     // 下端の縦の縁：八角の低い輪
    piece('襟の皿', [...octSlope(A_COL + 0.005, Y_DISH, A_COLLAR, Y_RIM), YL(Y_RIM), YH(Y_DISH)]),   // 縁の上の角から柱へ斜めに上がる皿（縁と接する）。上端は柱の周りに細い平らな輪
    piece('柱', [...oct(A_COL), YL(Y_DISH - 0.012), YH(Y_COL_TOP)], { color: DARK }),         // 中心の八角柱（皿の中まで下ろして重ねる）
    step(),                                                                                    // 上端：頭を受ける小さな八角の段
    piece('筋（前）', box(-0.006, 0.006, Y_DISH - 0.006, Y_COL_TOP - 0.004, A_COL - 0.008, A_COL + 0.008)),     // 柱の前面から少し出た細い縦の板
    piece('筋（後）', box(-0.006, 0.006, Y_DISH - 0.006, Y_COL_TOP - 0.004, -(A_COL + 0.008), -(A_COL - 0.008))),   // 柱の後面の同じ板
  ],
};

// 蛇腹：下の受け（外へ広がる丸い台）、そろばん玉の輪 5 段（上下の端が細く、真ん中が太い）、上の受け（頭の下の丸い輪）、段
const neckbellows = (() => {
  const y0 = 0.03, y1 = 0.122, n = 5, h = (y1 - y0) / n, pieces = [];
  pieces.push(hull('蛇腹の下の受け', [...ring(0, 0.06, 12, 0, 0, 15), ...ring(0.014, 0.058, 12, 0, 0, 15), ...ring(0.034, 0.04, 12, 0, 0, 15)]));
  for (let i = 0; i < n; i++) {
    const a = y0 + h * i, b = a + h;   // （となりの輪と 2 mm ずつ重ねる）
    pieces.push(hull(`蛇腹 ${i + 1}`, [...ring(a - 0.002, 0.03, 12), ...ring((a + b) / 2, 0.047, 12), ...ring(b + 0.002, 0.03, 12)], { color: DARK }));
  }
  pieces.push(hull('蛇腹の上の受け', [...ring(0.118, 0.036, 12, 0, 0, 15), ...ring(0.128, 0.044, 12, 0, 0, 15), ...ring(0.136, 0.04, 12, 0, 0, 15)]));
  pieces.push(step());
  return { id: 'neckbellows', name: '首（蛇腹）', cat: '首', size: [0.12, 0.15, 0.12], pieces };
})();

// シリンダー：下の台（八角の皿）、細い芯、斜めに立つ油圧シリンダー 4 本（下は太い暗い筒・上は細い明るい棒。上ほど内へ寄る）、上の板、段
const neckpiston = (() => {
  const pieces = [
    piece('シリンダーの台の縁', [...oct(A_COLLAR), YL(0), YH(0.014)]),
    piece('シリンダーの台', [...octSlope(0.03, 0.034, A_COLLAR, 0.014), YL(0.014), YH(0.034)]),
    hull('芯', [...ring(0.024, 0.02, 8, 0, 0, 22.5), ...ring(0.126, 0.016, 8, 0, 0, 22.5)], { color: BLACK }),
  ];
  for (const [sx, sz, label] of [[1, 1, '右前'], [-1, 1, '左前'], [1, -1, '右後'], [-1, -1, '左後']]) {
    const a = [sx * 0.031, 0.024, sz * 0.031], b = [sx * 0.023, 0.124, sz * 0.023], m = a.map((v, i) => v + (b[i] - v) * 0.58);
    pieces.push(rod(`シリンダーの筒（${label}）`, a, m, 0.0125, 0.0115, { color: DARK }));
    pieces.push(rod(`シリンダーの棒（${label}）`, m.map((v, i) => v - (b[i] - a[i]) * 0.04), b, 0.0065, 0.0065, { color: '#d9dde3' }));
  }
  pieces.push(hull('シリンダーの上の板', [...ring(0.112, 0.034, 8, 0, 0, 22.5), ...ring(0.122, 0.047, 8, 0, 0, 22.5), ...ring(0.134, 0.036, 8, 0, 0, 22.5)]));
  pieces.push(step());
  return { id: 'neckpiston', name: '首（シリンダー）', cat: '首', size: [0.12, 0.15, 0.12], pieces };
})();

// 太い装甲：下が太く上が細い八角の装甲（面はどれも内へ倒れる）。前に稜の板、左右に黒い溝 2 本ずつ、上に暗い関節の帯、段
const neckarmor = (() => {
  const A0 = 0.075, A1 = 0.045, Y0 = 0.018, Y1 = 0.106;   // 装甲の下と上（中心から面まで）
  const at = y => A0 + (A1 - A0) * (y - Y0) / (Y1 - Y0);   // 高さ y での面までの距離
  const pieces = [
    piece('装甲の裾', [...oct(A0 + 0.004), YL(0), YH(Y0 + 0.004), ...octSlope(A0 - 0.004, Y0 + 0.008, A0 + 0.004, Y0 - 0.004)]),
    piece('首の装甲', [...octSlope(A1, Y1, A0, Y0), YL(Y0), YH(Y1)]),
    piece('関節の帯', [...oct(0.036), YL(Y1 - 0.006), YH(0.134)], { color: DARK }),
    step(),
    // 前の稜：装甲の前の面に載る、真ん中がとがった縦の板（下が広く上が細い）
    hull('前の稜', [[-0.022, 0.03, at(0.03) - 0.004], [0.022, 0.03, at(0.03) - 0.004], [0, 0.026, at(0.026) + 0.012],
      [-0.013, 0.1, at(0.1) - 0.004], [0.013, 0.1, at(0.1) - 0.004], [0, 0.104, at(0.104) + 0.008]]),
  ];
  for (const s of [1, -1]) for (const [k, y] of [[1, 0.05], [2, 0.074]]) {
    // 横の面に沿って傾いた、黒い溝（面から 2 mm 出る細い板）
    const x0 = at(y - 0.007), x1 = at(y + 0.007);
    pieces.push(hull(`横の溝（${s > 0 ? '右' : '左'}）${k}`, [[s * (x0 - 0.006), y - 0.007, -0.02], [s * (x0 - 0.006), y - 0.007, 0.02], [s * (x0 + 0.002), y - 0.007, -0.018], [s * (x0 + 0.002), y - 0.007, 0.018],
      [s * (x1 - 0.006), y + 0.007, -0.02], [s * (x1 - 0.006), y + 0.007, 0.02], [s * (x1 + 0.002), y + 0.007, -0.018], [s * (x1 + 0.002), y + 0.007, 0.018]], { color: BLACK }));
  }
  return { id: 'neckarmor', name: '首（太い装甲）', cat: '首', size: [0.158, 0.15, 0.158], pieces };
})();

export default [neck, neckbellows, neckpiston, neckarmor];
