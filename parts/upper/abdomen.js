// 腹（胴の下の輪、胴の骨 torso）：胴を胸・背中・腹・脇腹に分けたうちの下。y 0〜0.27 の前後左右の輪。原点は胸の下端の中心（y 2.1）。
// 下の腰の関節（下半身の部品、縦の柱）はこの輪の中へ入る。下ほど細く、胸を前後・横に傾けても腰の帯に届かない。
// 前の板と、後ろの下の板を持つ（蛇腹は輪を重ねるだけ）。
// 種類：左右に分けた板・幅いっぱいの板・下向きの V 字・蛇腹（細い芯に輪を重ねる）・1 枚の大きな板
import { P, YL, YH, both, prismY, piece, DARK, BLACK } from '../../xsasm-lib.js';
import { crown, steps } from '../lower/shape.js';
import { STD, sideX, frontZ, backZ, hull, pairPl, slab } from './kit.js';

const { wb, wt } = STD;
const Y1 = 0.27, slope = (wt - wb) / 0.45;
const core = () => hull('腹の芯', [...[1, -1].flatMap(s => [[s * wb, 0, 0.15], [s * wb, 0, -0.14], [s * sideX(Y1), Y1, frontZ(Y1)], [s * sideX(Y1), Y1, backZ(Y1)]])], { color: DARK });
/** 後ろの下の板 */
const fk = (x, y) => STD.zb + 0.025 - 0.35 * x * x - 0.5 * (y - 0.33) ** 2;
const backPlate = () => piece('腹の後ろの板', slab('z', -1, (x, y) => fk(x, y) - 0.004, [-(sideX(0.1) - 0.02), sideX(0.1) - 0.02], [0.05, 0.212],
  { bev: 0.014, depth: 0.06, na: 6, extra: both(P([1, -0.25, -0.4], [sideX(0.3) - 0.01, 0.3, -STD.zb])) }));
/** 前の板を rows 段に分ける（y 0.02〜0.245） */
const rowsOf = rows => { const h = (0.245 - 0.02) / rows; return Array.from({ length: rows }, (_, k) => [0.02 + k * h, 0.02 + (k + 1) * h - 0.01]); };
const A = (id, name, pieces, withCore = true) => ({ id, name, cat: '腹', size: [2 * sideX(Y1) + 0.04, Y1, 0.4], pieces: [...(withCore ? [core()] : []), ...pieces] });
export default [
  A('abdomen', '腹（左右に分けた板）', [...rowsOf(2).flatMap(([y0, y1], k) => {
    const w = sideX(y0) - 0.012, f = (x, y) => frontZ(y) + 0.024 - 0.35 * (x - 0.1) ** 2 - 0.05 * x;
    return pairPl(`腹の板 ${k + 1}`, slab('z', 1, f, [0.04, w], [y0, y1], { bev: 0.012, depth: 0.06, extra: [P([1, -slope, 0], [w, y0, 0])] }));
  }), piece('腹の中央の枠', slab('z', 1, (x, y) => frontZ(y) + 0.03 - 3 * x * x, [-0.034, 0.034], [0.04, 0.27], { bev: 0.008, depth: 0.04, na: 2, nb: 2 }), { color: DARK }), backPlate()]),
  A('abdomenband', '腹（幅いっぱいの板）', [...rowsOf(3).map(([y0, y1], k) => {
    const w = sideX(y0) - 0.012, f = (x, y) => frontZ(y) + 0.022 - 0.3 * x * x;
    return piece(`腹の板 ${k + 1}`, [...crown('z', 1, f, steps(-w, w, 6), steps(y0, y1, 2)), P([0, 0.18, -1], [0, 0, -0.13]), YL(y0), YH(y1),
      ...both(P([1, -slope, 0], [w, y0, 0])), ...both(P([1, 0, 1], [w - 0.016, 0, f(w, y0)])), P([0, 1, 1], [0, y1 - 0.011, f(0, y1)]), P([0, -1, 1], [0, y0 + 0.008, f(0, y0)])]);
  }), backPlate()]),
  // 下向きの V 字：左右の半分（平行四辺形）を中央で合わせる。外ほど上がる
  A('abdomenvee', '腹（V 字の板）', [...rowsOf(2).flatMap(([y0, y1], k) => {
    const w = sideX(y0) - 0.012, t = 0.3, f = (x, y) => frontZ(y) + 0.022 - 0.3 * x * x;
    return pairPl(`腹の板 ${k + 1}`, [...crown('z', 1, f, steps(0.006, w, 4), steps(y0, Math.min(y1 + t * w, 0.265), 3)),
      P([0, 0.18, -1], [0, 0, -0.13]), P([t, -1, 0], [0, y0, 0]), P([-t, 1, 0], [0, y1, 0]), P([-1, 0, 0], [0.006, 0, 0]), P([1, -slope, 0], [w, y0, 0]),
      P([1, 0, 1], [w - 0.016, 0, f(w, y0)]), P([t, -1, 1.2], [0, y0 + 0.008, f(0, y0)]), P([-t, 1, 1.2], [0, y1 - 0.008, f(0, y1)])]);
  }), backPlate()]),
  // 蛇腹：細い芯（黒）に、楕円の輪を 5 本重ねる。輪は暗い色と明るい色を交互に。輪は中が空いた本当の輪（12 枚の板）で、
  // 内の縁は芯に少し入る。下の腹の関節の柱（半径 0.14 まで）は芯の中に入り、胸を傾けても輪には届かない
  A('abdomenbellows', '腹（蛇腹）', [
    piece('腹の芯', [...prismY(0.155, 12, 15).map(p => [p[0], p[1], p[2] * 1.1, p[3] * 1.0]), YL(0), YH(Y1)], { color: BLACK }),
    ...[0, 1, 2, 3, 4].flatMap(k => {
      const y0 = 0.012 + k * 0.052, rx = sideX(y0) - 0.01, rz = 0.15 + 0.012 * k, ri = 0.145;
      return Array.from({ length: 12 }, (_, j) => {
        const pts = [];
        for (const a of [(j - 0.1) * Math.PI / 6, (j + 1.1) * Math.PI / 6]) for (const y of [y0, y0 + 0.034]) {
          pts.push([rx * Math.cos(a), y, rz * Math.sin(a)], [ri * Math.cos(a), y, ri * 1.1 * Math.sin(a)]);
        }
        return hull(`蛇腹の輪 ${k + 1}（${j + 1}）`, pts, k % 2 ? { color: DARK } : {});
      });
    })], false),
  // 1 枚の大きな板：前いっぱいの板に、中央に縦長の重ねた板
  A('abdomenplate', '腹（1 枚の大きな板）', [
    piece('腹の板', slab('z', 1, (x, y) => frontZ(y) + 0.026 - 0.3 * x * x, [-(sideX(0.03) - 0.012), sideX(0.03) - 0.012], [0.025, 0.25],
      { bev: 0.018, depth: 0.07, na: 6, nb: 3, extra: both(P([1, -slope, 0], [sideX(0.03) - 0.012, 0.03, 0])) })),
    piece('腹の中央の板', slab('z', 1, (x, y) => frontZ(y) + 0.038 - 0.3 * x * x, [-0.07, 0.07], [0.05, 0.225], { bev: 0.012, depth: 0.04, na: 3, nb: 3 })),
    backPlate()]),
];
