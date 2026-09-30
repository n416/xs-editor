// 腰の飾り：ベルト・腰の筒・動力パイプ（どれも腰の骨で動かない）。原点は腰の帯の下端の中心（y 1.77）。x 右・y 上・z 前。
// 帯の高さ（y ≥ 0、脚を上げても届かない）か、太ももの柱の外（|x| ≥ 0.27）だけに置く。寸法は標準の腰（2 段の帯：前 z 0.215・
// 後ろ z 0.2・横 x 0.355）に合わせ、帯に食い込ませてつなぐ（幅広の帯には「幅広の帯用」のベルト）。
//   ベルト：帯の形を外へ 1.3 cm ふくらませた輪（帯を包む 1 つの凸の形）と、前の留め金。細い・太い・2 本・ポーチ付き・幅広の帯用
//   腰の筒：左右の横に立てた筒（縦）・前後に寝かせた筒（横）・後ろに 2 本（縦、並べても顔に見えないよう細長く）。受けで帯につなぐ
//   動力パイプ：短い筒を少しずつ向きを変えて並べた蛇腹の管。腰の後ろから横を回って前へ（1 本・2 本）。両端の受けで帯につなぐ
import { P, XH, XL, YH, YL, ZH, ZL, both, planesFromPoints, prismX, prismY, piece, MAIN, DARK, BLACK, ACCENT } from '../../xsasm-lib.js';
import { crown, steps } from './shape.js';

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

// ---- 筒・パイプの道具 ----
/** 2 点 a → b を軸にした n 角の筒（半径 r）。点を並べて凸包にする */
function tube(a, b, r, n = 8) {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L = Math.hypot(...d), u = d.map(v => v / L);
  const ref = Math.abs(u[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const cr = (p, q) => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];
  let v1 = cr(u, ref); const l1 = Math.hypot(...v1); v1 = v1.map(v => v / l1); const v2 = cr(u, v1);
  const pts = [];
  for (const c of [a, b]) for (let k = 0; k < n; k++) { const t = (k + 0.5) * 2 * Math.PI / n; pts.push([0, 1, 2].map(i => c[i] + r * (Math.cos(t) * v1[i] + Math.sin(t) * v2[i]))); }
  return planesFromPoints(pts);
}
/** 蛇腹の管：点の列（道筋）に沿って、短い筒（太い輪と細い芯）を交互に並べる */
function bellows(path, name, rr = 0.026, rc = 0.02) {
  const out = [];
  for (let i = 0; i + 1 < path.length; i++) {
    const a = path[i], b = path[i + 1], m = a.map((v, k) => (v + b[k]) / 2);
    out.push(piece(`${name}の芯 ${i + 1}`, tube(a, b, rc), { color: BLACK }));
    const q = a.map((v, k) => v + (m[k] - v) * 0.25), w = a.map((v, k) => v + (m[k] - v) * 1.75);
    out.push(piece(`${name}の輪 ${i + 1}`, tube(q, w, rr), { color: DARK }));
  }
  return out;
}
/** 腰のまわりの楕円の弧（上から見て）：θ は前 0°・横 90°・後ろ 180°、半径 rx・rz、高さ y。n 分割の点の列（+x 側） */
const arc = (th0, th1, rx, rz, y, n) => Array.from({ length: n + 1 }, (_, i) => { const t = (th0 + (th1 - th0) * i / n) * Math.PI / 180; return [rx * Math.sin(t), y, rz * Math.cos(t)]; });
const mirX = pts => pts.map(p => [-p[0], p[1], p[2]]);
/** 管の端の受け：管の端から帯へ届く暗い小さな箱 */
const fitting = (p, name) => piece(name, planesFromPoints([[-0.022, -0.022, -0.022], [0.022, -0.022, -0.022], [-0.022, 0.022, -0.022], [0.022, 0.022, -0.022], [-0.022, -0.022, 0.022], [0.022, -0.022, 0.022], [-0.022, 0.022, 0.022], [0.022, 0.022, 0.022]]
  .map(([a, b, c]) => [p[0] * (a > 0 ? 1 : 0.7) + a, p[1] + b, p[2] * (c > 0 ? 1 : 0.7) + c])), { color: DARK });   // 帯の側（原点寄り）へ 3 割伸ばす

const D = (id, name, cat, pieces, size = [0.8, 0.2, 0.5]) => ({ id, name, cat, size, pieces });
export default [
  // ---- ベルト ----
  D('belt', 'ベルト', 'ベルト', [piece('ベルト', ring(0.075, 0.115, 0.228, 0.213, 0.382), { color: DARK }), ...buckle(0.07, 0.12, 0.235)]),
  D('beltthick', 'ベルト（太い）', 'ベルト', [piece('ベルト', ring(0.035, 0.125, 0.23, 0.215, 0.385), { color: DARK }),
    piece('ベルトの縁（上）', ring(0.117, 0.13, 0.236, 0.221, 0.39)), piece('ベルトの縁（下）', ring(0.03, 0.043, 0.236, 0.221, 0.39)), ...buckle(0.045, 0.115, 0.24, 0.06)]),
  D('belttwin', 'ベルト（2 本）', 'ベルト', [piece('ベルト（下）', ring(0.03, 0.058, 0.228, 0.213, 0.382), { color: DARK }),
    piece('ベルト（上）', ring(0.098, 0.126, 0.226, 0.212, 0.375), { color: DARK }), ...buckle(0.028, 0.06, 0.235, 0.04), ...buckle(0.096, 0.128, 0.233, 0.04).map(p => ({ ...p, name: p.name + '（上）' }))]),
  D('beltpouch', 'ベルト（ポーチ付き）', 'ベルト', [piece('ベルト', ring(0.075, 0.115, 0.228, 0.213, 0.382), { color: DARK }), ...buckle(0.07, 0.12, 0.235),
    ...[[1, 1], [-1, 1]].flatMap(([s]) => [...pouch(s * 0.35, 0.14, s, false), ...pouch(s * 0.33, -0.15, s, true)]).map((p, i) => ({ ...p, name: `${p.name} ${Math.floor(i / 2) + 1}` }))]),
  D('beltwide', 'ベルト（幅広の帯用）', 'ベルト', [piece('ベルト', ring(0.075, 0.12, 0.253, 0.308, 0.44, 0.35, 0.45, 0.07), { color: DARK }), ...buckle(0.07, 0.125, 0.26)]),
  // ---- 腰の筒 ----
  D('tubeside', '腰の筒（縦）', '腰の筒', [1, -1].flatMap(s => [
    piece(`筒（${s > 0 ? '+x' : '−x'}）`, [...prismY(0.042, 12, 15).map(p => [p[0], p[1], p[2], p[3] + p[0] * s * 0.42 + p[2] * -0.04]), YL(-0.03), YH(0.16)]),
    piece(`筒の蓋（上）（${s > 0 ? '+x' : '−x'}）`, [...prismY(0.047, 12, 15).map(p => [p[0], p[1], p[2], p[3] + p[0] * s * 0.42 + p[2] * -0.04]), YL(0.14), YH(0.175)], { color: DARK }),
    piece(`筒の蓋（下）（${s > 0 ? '+x' : '−x'}）`, [...prismY(0.047, 12, 15).map(p => [p[0], p[1], p[2], p[3] + p[0] * s * 0.42 + p[2] * -0.04]), YL(-0.045), YH(-0.01)], { color: DARK }),
    piece(`筒の受け（${s > 0 ? '+x' : '−x'}）`, [s > 0 ? XL(0.32) : XH(-0.32), s > 0 ? XH(0.4) : XL(-0.4), YL(0.05), YH(0.1), ZL(-0.065), ZH(-0.015)], { color: DARK })])),
  D('tubeflat', '腰の筒（横）', '腰の筒', [1, -1].flatMap(s => [
    piece(`筒（${s > 0 ? '+x' : '−x'}）`, tube([s * 0.405, 0.05, -0.14], [s * 0.405, 0.05, 0.1], 0.035, 12)),
    piece(`筒の蓋（前）（${s > 0 ? '+x' : '−x'}）`, tube([s * 0.405, 0.05, 0.09], [s * 0.405, 0.05, 0.12], 0.039, 12), { color: DARK }),
    piece(`筒の蓋（後ろ）（${s > 0 ? '+x' : '−x'}）`, tube([s * 0.405, 0.05, -0.16], [s * 0.405, 0.05, -0.13], 0.039, 12), { color: DARK }),
    piece(`筒の受け（${s > 0 ? '+x' : '−x'}）`, [s > 0 ? XL(0.33) : XH(-0.33), s > 0 ? XH(0.39) : XL(-0.39), YL(0.03), YH(0.07), ZL(-0.05), ZH(0.03)], { color: DARK })])),
  D('tubeback', '腰の筒（後ろ）', '腰の筒', [1, -1].flatMap(s => [
    piece(`筒（${s > 0 ? '+x' : '−x'}）`, [...prismY(0.03, 10, 18).map(p => [p[0], p[1], p[2], p[3] + p[0] * s * 0.2 + p[2] * -0.27]), YL(0.0), YH(0.2)]),
    piece(`筒の蓋（${s > 0 ? '+x' : '−x'}）`, [...prismY(0.034, 10, 18).map(p => [p[0], p[1], p[2], p[3] + p[0] * s * 0.2 + p[2] * -0.27]), YL(0.185), YH(0.215)], { color: DARK }),
    piece(`筒の受け（${s > 0 ? '+x' : '−x'}）`, [s > 0 ? XL(0.17) : XH(-0.17), s > 0 ? XH(0.23) : XL(-0.23), YL(0.06), YH(0.14), ZL(-0.27), ZH(-0.18)], { color: DARK })])),
  // ---- 動力パイプ ----
  D('pipe', '動力パイプ', '動力パイプ', [1, -1].flatMap(s => {
    const path = arc(150, 35, 0.415, 0.3, 0.11, 10), p = s > 0 ? path : mirX(path), tag = s > 0 ? '（+x）' : '（−x）';
    return [...bellows(p, '動力パイプ' + tag), fitting(p[0], '動力パイプの受け（後ろ）' + tag), fitting(p[p.length - 1], '動力パイプの受け（前）' + tag)];
  })),
  D('pipetwin', '動力パイプ（2 本）', '動力パイプ', [1, -1].flatMap(s => [0.07, 0.14].flatMap((y, j) => {
    const path = arc(150, 40, 0.41 + j * 0.005, 0.295, y, 10), p = s > 0 ? path : mirX(path), tag = `（${j ? '上' : '下'}）${s > 0 ? '（+x）' : '（−x）'}`;
    return [...bellows(p, '動力パイプ' + tag, 0.022, 0.017), fitting(p[0], '動力パイプの受け（後ろ）' + tag), fitting(p[p.length - 1], '動力パイプの受け（前）' + tag)];
  }))),
];
