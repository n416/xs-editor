// 腰の飾り：ベルト・腰の筒・動力パイプ（どれも腰の骨で動かない）。原点は腰の帯の下端の中心（y 1.77）。x 右・y 上・z 前。
// 帯の高さ（y ≥ 0、脚を上げても届かない）か、太ももの柱の外（|x| ≥ 0.27）だけに置く。寸法は標準の腰（2 段の帯：前 z 0.215・
// 後ろ z 0.2・横 x 0.355）に合わせ、帯に食い込ませてつなぐ（幅広の帯には「幅広の帯用」のベルト）。
//   ベルト：帯の形を外へ 1.3 cm ふくらませた輪（帯を包む 1 つの凸の形）と、前の留め金。細い・太い・2 本・ポーチ付き・幅広の帯用
//   腰の筒：左右の横に立てた筒（縦）・前後に寝かせた筒（横）・後ろに 2 本（縦、並べても顔に見えないよう細長く）。受けで帯につなぐ
//   動力パイプ：短い筒を少しずつ向きを変えて並べた蛇腹の管。腰の後ろから横を回って前へ（太さ 4 種類 × 長さ 3 種類と、2 本）。両端の受けで帯につなぐ
import { TAPER } from './waist.js';
import { P, XH, XL, YH, YL, ZH, ZL, both, planesFromPoints, prismX, prismY, piece, MAIN, DARK, BLACK, ACCENT } from '../../xsasm-lib.js';
import { crown, steps } from './shape.js';
import { tube, bellows, fitting } from '../pipe.js';   // 蛇腹の管の道具（頭の飾りと共通）

const XS = steps(-0.3, 0.3, 6);
/** 帯の段と同じ作りの輪（waist.js の tier と同じ面）：y0〜y1、前後の面 zf・zb、横 xw、角の落とし（cn・cd） */
const ring = (y0, y1, zf, zb, xw, cx = 0.5, cn = 0.9, cd = 0.09) => [YL(y0), YH(y1),
  ...crown('z', 1, (x) => zf - cx * x * x, XS, [y0, y1]), ...crown('z', -1, (x) => zb - cx * x * x, XS, [y0, y1]),
  ...both(XH(xw)), ...both(P([1, 0, cn], [xw - 0.005, 0, zf - cd])), ...both(P([1, 0, -cn], [xw - 0.005, 0, -(zb - cd)]))];
/** 前の留め金：外枠（差し色）と、中の暗い板 */
const buckle = (y0, y1, z, w = 0.05) => [
  piece('留め金', [...crown('z', 1, (x, y) => z + 0.02 - 3 * x * x - 2 * (y - (y0 + y1) / 2) ** 2, steps(-w, w, 2), steps(y0 - 0.01, y1 + 0.01, 2)),
    ZL(z - 0.02), YL(y0 - 0.008), YH(y1 + 0.008), ...both(P([1, 0, 0.4], [w, 0, z]))], { color: ACCENT }),
  piece('留め金の中', [...crown('z', 1, (x, y) => z + 0.027 - 3 * x * x - 2 * (y - (y0 + y1) / 2) ** 2, steps(-w * 0.55, w * 0.55, 2), steps(y0, y1, 2)),
    ZL(z), YL(y0), YH(y1), ...both(XH(w * 0.55))], { color: DARK }),
];
/** ベルトのポーチ：帯の横と後ろの角に付いた小さな箱（角を落とし、蓋の段） */
const pouch = (x, z, side, back) => {
  const n = [side, 0, back ? -1 : 1];                              // 外向き（斜め）
  const l = Math.hypot(n[0], n[2]);
  const o = [n[0] / l, n[2] / l], t = [-o[1], o[0]];                 // 外向きと、それに直角の横向き（xz）
  const at = (a, b) => [x + o[0] * a + t[0] * b, z + o[1] * a + t[1] * b];
  const pts = [];
  for (const [a, b] of [[-0.02, -0.045], [-0.02, 0.045], [0.035, -0.04], [0.035, 0.04]]) for (const y of [0.02, 0.1]) { const [px, pz] = at(a, b); pts.push([px, y - (a > 0 && y < 0.05 ? -0.008 : 0), pz]); }
  const lid = [];
  for (const [a, b] of [[-0.02, -0.048], [-0.02, 0.048], [0.041, -0.043], [0.041, 0.043]]) for (const y of [0.075, 0.108]) { const [px, pz] = at(a, b); lid.push([px, y, pz]); }
  return [piece('ポーチ', planesFromPoints(pts), { color: DARK }), piece('ポーチの蓋', planesFromPoints(lid))];
};

/** 腰のまわりの楕円の弧（上から見て）：θ は前 0°・横 90°・後ろ 180°、半径 rx・rz、高さ y。n 分割の点の列（+x 側） */
const arc = (th0, th1, rx, rz, y, n) => Array.from({ length: n + 1 }, (_, i) => { const t = (th0 + (th1 - th0) * i / n) * Math.PI / 180; return [rx * Math.sin(t), y, rz * Math.cos(t)]; });
const mirX = pts => pts.map(p => [-p[0], p[1], p[2]]);
/** 動力パイプ：左右に 1 本ずつ。rr 輪の半径（太さ）、rc 芯の半径、y 高さ、rx・rz 腰のまわりの楕円の半径、n 輪の数 */
const pipePair = (y, rr, rc, n, tag0 = '', rx = 0.39 + rr, rz = 0.275 + rr, th0 = 150, th1 = 35) => [1, -1].flatMap(s => {
  const path = arc(th0, th1, rx, rz, y, n), p = s > 0 ? path : mirX(path), tag = `${tag0}${s > 0 ? '（+x）' : '（−x）'}`;
  return [...bellows(p, '動力パイプ' + tag, rr, rc), fitting(p[0], '動力パイプの受け（後ろ）' + tag, rr * 0.85), fitting(p[p.length - 1], '動力パイプの受け（前）' + tag, rr * 0.85)];
});

// ベルトは、すぼめた帯の横の面に沿わせる（帯より 1.5 cm 外。幅広の帯用は帯がすぼまらないのでそのまま）
const D = (id, name, cat, pieces, size = [0.8, 0.2, 0.5]) => ({ id, name, cat, size,
  pieces: cat === 'ベルト' && id !== 'beltwide' ? pieces.map(pc => (/^ベルト/.test(pc.name) ? { ...pc, planes: [...pc.planes, ...TAPER(0.015)] } : pc)) : pieces });
export default [
  // ---- ベルト ----
  D('belt', 'ベルト', 'ベルト', [piece('ベルト', ring(0.035, 0.075, 0.228, 0.213, 0.382), { color: DARK }), ...buckle(0.03, 0.08, 0.235)]),
  D('beltthick', 'ベルト（太い）', 'ベルト', [piece('ベルト', ring(0.01, 0.085, 0.23, 0.215, 0.385), { color: DARK }),
    piece('ベルトの縁（上）', ring(0.078, 0.09, 0.236, 0.221, 0.39)), piece('ベルトの縁（下）', ring(0.005, 0.018, 0.236, 0.221, 0.39)), ...buckle(0.015, 0.08, 0.24, 0.06)]),
  D('belttwin', 'ベルト（2 本）', 'ベルト', [piece('ベルト（下）', ring(0.008, 0.034, 0.228, 0.213, 0.382), { color: DARK }),
    piece('ベルト（上）', ring(0.052, 0.078, 0.226, 0.212, 0.375), { color: DARK }), ...buckle(0.006, 0.036, 0.235, 0.04), ...buckle(0.05, 0.08, 0.233, 0.04).map(p => ({ ...p, name: p.name + '（上）' }))]),
  D('beltpouch', 'ベルト（ポーチ付き）', 'ベルト', [piece('ベルト', ring(0.035, 0.075, 0.228, 0.213, 0.382), { color: DARK }), ...buckle(0.03, 0.08, 0.235),
    ...[[1, 1], [-1, 1]].flatMap(([s]) => [...pouch(s * 0.35, 0.14, s, false), ...pouch(s * 0.33, -0.15, s, true)]).map((p, i) => ({ ...p, name: `${p.name} ${Math.floor(i / 2) + 1}` }))]),
  D('beltwide', 'ベルト（幅広の帯用）', 'ベルト', [piece('ベルト', ring(0.04, 0.085, 0.253, 0.308, 0.44, 0.35, 0.45, 0.07), { color: DARK }), ...buckle(0.035, 0.09, 0.26)]),
  // ---- 腰の筒 ----
  D('tubeside', '腰の筒（縦）', '腰の筒', [1, -1].flatMap(s => [
    piece(`筒（${s > 0 ? '+x' : '−x'}）`, [...prismY(0.042, 12, 15).map(p => [p[0], p[1], p[2], p[3] + p[0] * s * 0.42 + p[2] * -0.04]), YL(-0.1), YH(0.09)]),
    piece(`筒の蓋（上）（${s > 0 ? '+x' : '−x'}）`, [...prismY(0.047, 12, 15).map(p => [p[0], p[1], p[2], p[3] + p[0] * s * 0.42 + p[2] * -0.04]), YL(0.07), YH(0.105)], { color: DARK }),
    piece(`筒の蓋（下）（${s > 0 ? '+x' : '−x'}）`, [...prismY(0.047, 12, 15).map(p => [p[0], p[1], p[2], p[3] + p[0] * s * 0.42 + p[2] * -0.04]), YL(-0.115), YH(-0.08)], { color: DARK }),
    piece(`筒の受け（${s > 0 ? '+x' : '−x'}）`, [s > 0 ? XL(0.24) : XH(-0.24), s > 0 ? XH(0.4) : XL(-0.4), YL(0.05), YH(0.1), ZL(-0.065), ZH(-0.015)], { color: DARK })])),
  D('tubeflat', '腰の筒（横）', '腰の筒', [1, -1].flatMap(s => [
    piece(`筒（${s > 0 ? '+x' : '−x'}）`, tube([s * 0.405, 0.05, -0.14], [s * 0.405, 0.05, 0.1], 0.035, 12)),
    piece(`筒の蓋（前）（${s > 0 ? '+x' : '−x'}）`, tube([s * 0.405, 0.05, 0.09], [s * 0.405, 0.05, 0.12], 0.039, 12), { color: DARK }),
    piece(`筒の蓋（後ろ）（${s > 0 ? '+x' : '−x'}）`, tube([s * 0.405, 0.05, -0.16], [s * 0.405, 0.05, -0.13], 0.039, 12), { color: DARK }),
    piece(`筒の受け（${s > 0 ? '+x' : '−x'}）`, [s > 0 ? XL(0.25) : XH(-0.25), s > 0 ? XH(0.39) : XL(-0.39), YL(0.03), YH(0.07), ZL(-0.05), ZH(0.03)], { color: DARK })])),
  D('tubeback', '腰の筒（後ろ）', '腰の筒', [1, -1].flatMap(s => [
    piece(`筒（${s > 0 ? '+x' : '−x'}）`, [...prismY(0.03, 10, 18).map(p => [p[0], p[1], p[2], p[3] + p[0] * s * 0.2 + p[2] * -0.27]), YL(-0.08), YH(0.11)]),
    piece(`筒の蓋（${s > 0 ? '+x' : '−x'}）`, [...prismY(0.034, 10, 18).map(p => [p[0], p[1], p[2], p[3] + p[0] * s * 0.2 + p[2] * -0.27]), YL(0.095), YH(0.125)], { color: DARK }),
    piece(`筒の受け（${s > 0 ? '+x' : '−x'}）`, [s > 0 ? XL(0.17) : XH(-0.17), s > 0 ? XH(0.23) : XL(-0.23), YL(0.02), YH(0.08), ZL(-0.27), ZH(-0.18)], { color: DARK })])),
  // ---- 動力パイプ：太さ（細い・標準・太い・とても太い）× 長さ（短い：腰の横だけ・標準：後ろから横を回って前へ・長い：後ろの中央寄りから前の
  // 中央寄りまで）。太いほど帯から離し、輪を少なく大きく。輪の数は長さに合わせる ----
  ...[['thin', '細い', 0.05, 0.016, 0.012, 14], ['', '', 0.05, 0.026, 0.02, 10], ['thick', '太い', 0.05, 0.036, 0.028, 8], ['huge', 'とても太い', 0.048, 0.048, 0.038, 7]]
    .flatMap(([k, w, y, rr, rc, n]) => [['short', '短い', 125, 60, 0.55], ['', '', 150, 35, 1], ['long', '長い', 170, 15, 1.35]].map(([lk, lw, th0, th1, f]) => {
      const label = [w, lw].filter(Boolean).join('・');
      return D(`pipe${k}${lk}`, `動力パイプ${label ? `（${label}）` : ''}`, '動力パイプ', pipePair(y, rr, rc, Math.max(4, Math.round(n * f)), '', 0.39 + rr, 0.275 + rr, th0, th1));
    })),
  D('pipetwin', '動力パイプ（2 本）', '動力パイプ', [...pipePair(0.026, 0.022, 0.017, 10, '（下）', 0.412, 0.297), ...pipePair(0.066, 0.022, 0.017, 10, '（上）', 0.417, 0.297)]),
];
