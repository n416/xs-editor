// 腕・脚の部品を作る道具。腕の部品の原点はひじの中心 E（+x 側の腕で x 0.58・y 1.95・z 0）、脚の部品の原点はひざの中心 K
// （+x 側の脚で x 0.175・y 1.16・z −0.03）。x 外・y 上・z 前。反対側は x の拡大 −1 で置く。
// 2 重関節（xs-editor/doublejoint.js）：中間の節は P1（中心の上）と P2（中心の下）の 2 本の横の軸で曲がる。ひじは ±0.05、ひざは +0.04 と −0.16。
// 節の真ん中の部品は回転の中心を center（部品の座標の点）で持つ（その骨の回転の中心になる）。
//   上の部品（上腕・太もも）の下の端は P1 から軸の太さだけ上。下の部品（前腕・すね）の上の端は P2 を中心にした球のお椀か、軸の両端を挟む板。
// 広い面は垂直にも水平にもしない（傾けるか丸める）。
import { P, XL, XH, YL, YH, planesFromPoints, piece, prismX } from '../../xsasm-lib.js';
import { ELBOW_AXES, KNEE_AXES } from '../../doublejoint.js';
export { ELBOW_AXES, KNEE_AXES };

export const hull = (name, pts, o = {}) => piece(name, planesFromPoints(pts), o);
const D2R = Math.PI / 180;

/** 高さ y の楕円（半径 rx・rz、中心 cx・cz）の上の n 点。th0（度）から等間隔、0 が外（+x） */
export const ring = (y, rx, rz, n = 12, { cx = 0, cz = 0, th0 = 0 } = {}) =>
  Array.from({ length: n }, (_, k) => { const t = (th0 + k * 360 / n) * D2R; return [cx + rx * Math.cos(t), y, cz + rz * Math.sin(t)]; });
/** 輪の並びを包む凸の部品（筒・樽・円錐台） */
export const loft = (name, rings, o = {}) => hull(name, rings.flat(), o);
/** 角を落とした楕円の輪：上から見て、横 rx・前後 rz の四角の角を c だけ落とした 8 点（箱らしい断面） */
export const octo = (y, rx, rz, c, { cx = 0, cz = 0 } = {}) => [[rx, rz - c], [rx - c, rz], [-rx + c, rz], [-rx, rz - c], [-rx, -rz + c], [-rx + c, -rz], [rx - c, -rz], [rx, -rz + c]]
  .map(([x, z]) => [cx + x, y, cz + z]);
/** 前後で別の出のある角を落とした輪：外 xo・内 xi、前 zf・後ろ zb、角の落とし c */
export const octo2 = (y, xi, xo, zb, zf, c) => [[xo, zf - c], [xo - c, zf], [xi + c, zf], [xi, zf - c], [xi, zb + c], [xi + c, zb], [xo - c, zb], [xo, zb + c]].map(([x, z]) => [x, y, z]);

/** 横（x）の円柱：中心の線 (*, cy, cz)、半径 r、x0〜x1、n 角 */
export const cylX = (name, cy, cz, r, x0, x1, n = 12, o = {}) => piece(name, [...prismX(r, n, 180 / n, cy, cz), XL(x0), XH(x1)], o);
/** 縦（y）の円柱：中心 (cx, *, cz)、半径 r、y0〜y1 */
export const cylY = (name, cx, cz, r, y0, y1, n = 12, o = {}) => loft(name, [ring(y0, r, r, n, { cx, cz, th0: 180 / n }), ring(y1, r, r, n, { cx, cz, th0: 180 / n })], o);

/**
 * 球のお椀（中心 c、外の半径 R）：緯度 la1（度、−90 が下）より下の、中の詰まった球の欠片（1 つの凸の部品）。
 * 下の部品の上の端に使う：2 重関節の節の下の軸（P2 から半径 R より内）は、どう回ってもこの中に一部が入ったまま（離れない）
 */
export function cup(name, c, R, la1 = -25, o = {}) {
  const E = (la, lo) => [c[0] + R * Math.cos(la * D2R) * Math.cos(lo * D2R), c[1] + R * Math.sin(la * D2R), c[2] + R * Math.cos(la * D2R) * Math.sin(lo * D2R)];
  const pts = [[c[0], c[1] - R, c[2]]];
  for (const la of [la1, (la1 - 90) / 2 + 0, -75]) for (let k = 0; k < 16; k++) pts.push(E(la, k * 22.5 + (la === la1 ? 0 : 11.25)));
  return [hull(name, pts, o)];
}

/**
 * 2 点 a → b の間の、角を落とした角柱（指・棒・フレーム）。w 幅（向き side）、h 厚み（side と a→b に直角）、両端の大きさは k0・k1 倍
 */
export function seg(name, a, b, w, h, side = [0, 0, 1], o = {}, k0 = 1, k1 = 1) {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L = Math.hypot(...d), u = d.map(v => v / L);
  const dot = side[0] * u[0] + side[1] * u[1] + side[2] * u[2];
  let s = [side[0] - dot * u[0], side[1] - dot * u[1], side[2] - dot * u[2]]; const ls = Math.hypot(...s); s = s.map(v => v / ls);
  const n = [u[1] * s[2] - u[2] * s[1], u[2] * s[0] - u[0] * s[2], u[0] * s[1] - u[1] * s[0]];
  const pts = [];
  for (const [c, k] of [[a, k0], [b, k1]]) {
    const hw = w / 2 * k, hh = h / 2 * k, ch = Math.min(hw, hh) * 0.4;
    for (const [x, y] of [[hw, hh - ch], [hw - ch, hh], [-hw + ch, hh], [-hw, hh - ch], [-hw, -hh + ch], [-hw + ch, -hh], [hw - ch, -hh], [hw, -hh + ch]])
      pts.push([0, 1, 2].map(i => c[i] + x * s[i] + y * n[i]));
  }
  return hull(name, pts, o);
}

/** 箱の 6 面と、12 本の辺を 45° に b だけ落とす面 */
export function chBox(x0, x1, y0, y1, z0, z1, b) {
  const c = [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], h = [(x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2];
  const out = [XL(x0), XH(x1), YL(y0), YH(y1), P([0, 0, -1], [0, 0, z0]), P([0, 0, 1], [0, 0, z1])];
  for (const [i, j] of [[0, 1], [0, 2], [1, 2]]) for (const si of [-1, 1]) for (const sj of [-1, 1]) {
    const n = [0, 0, 0]; n[i] = si; n[j] = sj;
    const p = c.slice(); p[i] += si * (h[i] - b); p[j] += sj * h[j];
    out.push(P(n, p));
  }
  return out;
}
export { P, XL, XH, YL, YH, piece };

/** 部品を縦の軸（x 0・z 0）のまわりに、横 kx・前後 kz 倍に太らせ、外へ dx ずらす（軸の部品や継ぎ目は太らせない所で使う） */
export const widen = (pc, kx, kz = kx, dx = 0) => ({ ...pc, planes: pc.planes.map(p => { const n = [p[0] / kx, p[1], p[2] / kz], l = Math.hypot(...n); return [n[0] / l, n[1] / l, n[2] / l, p[3] / l + n[0] / l * dx, ...(p.length > 4 ? [p[4]] : [])]; }) });

/** 蛇腹：縦の軸（cx, cz）のまわりに、y0〜y1 を n 個の輪（真ん中が太い r1、上下の端が細い r0 のそろばん玉）で埋める */
export const bellowsY = (name, y0, y1, n, r0, r1, o = {}, { cx = 0, cz = 0, k = 14 } = {}) => Array.from({ length: n }, (_, i) => {
  const a = y0 + (y1 - y0) * i / n, b = y0 + (y1 - y0) * (i + 1) / n;
  return loft(`${name} ${i + 1}`, [ring(a, r0, r0, k, { cx, cz }), ring((a + b) / 2, r1, r1, k, { cx, cz }), ring(b, r0, r0, k, { cx, cz })], o);
});
/** 2 点の間の 8 角の筒（半径 r） */
export const rod = (name, a, b, r, o = {}) => seg(name, a, b, 2 * r, 2 * r, Math.abs(b[1] - a[1]) > Math.abs(b[0] - a[0]) ? [1, 0, 0] : [0, 1, 0], o);
/** ピストン：a（根元）から b（先）へ。根元の側の半分が太い暗い筒（半径 r）、先の側が細い明るい棒、両端に小さな受け */
export const piston = (name, a, b, r = 0.016, o = {}) => {
  const m = a.map((v, i) => v + (b[i] - v) * 0.55);
  return [rod(`${name}の筒`, a, m, r, { color: '#6b727d', ...o }), rod(`${name}の棒`, m, b, r * 0.55, { color: '#d9dde3', ...o }),
    rod(`${name}の受け（根元）`, a.map((v, i) => v - (b[i] - a[i]) * 0.04), a.map((v, i) => v + (b[i] - a[i]) * 0.04), r * 1.25, { color: '#23262c', ...o }),
    rod(`${name}の受け（先）`, b.map((v, i) => v - (b[i] - a[i]) * 0.04), b.map((v, i) => v + (b[i] - a[i]) * 0.04), r * 1.1, { color: '#23262c', ...o })];
};
