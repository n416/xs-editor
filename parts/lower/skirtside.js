// 横スカート：脚の台の外に下がる装甲（腰の骨）。原点は股関節の中心（+x 側）。太ももの柱の外（x ≥ 0.175、領域 B）だけなので、
// 脚を前後に振っても当たらず、動かない（押されて開く骨は要らない）。長さは自由。
// 外の面は前後に反って盛り上がり、下ほど外へ開く（上下はほぼまっすぐ）。裾は前が少し短い斜めで、外の下の角を落とす。一段高いパネル。
// 上端の付け根（暗い色）で腰の帯の下と脚の台につながる。sideSkirt() で寸法を変えた種類を作る：標準と、長く大きい（すねの半ばまで）
import { P, XL, XH, YH, YL, ZH, ZL, piece, DARK } from '../../xsasm-lib.js';
import { crown, steps } from './shape.js';

/** bottom 下の縁（前の端）の y、zf・zb 前後の端、panels 一段高いパネル [[上の y, 下の y], ...]、rim 裾の厚い縁の高さ */
export function sideSkirt({ id, name, bottom = -0.26, zf = 0.15, zb = -0.14, panels = [[0.12, -0.06]], rim = 0 }) {
  const zc = (zf + zb) / 2, hz = (zf - zb) / 2;
  const out = (y, z) => 0.245 - 1.6 * (0.15 / hz) ** 2 * (z - zc) ** 2 - 0.08 * (y + 0.05) ** 2 - 0.1 * y;
  const inner = x => P([-1, -0.1, 0], [x, 0.15, 0]);               // 内の面：下ほど外へ
  const hem = y => P([0, -1, 0.35], [0, y, zb]);                   // 裾：前が少し短い
  const len = 0.15 - bottom;
  const pieces = [
    piece('横スカート', [...crown('x', 1, out, steps(bottom - 0.06, 0.15, Math.max(5, Math.round(len / 0.08))), steps(zb, zf, 4)),
      inner(0.175), YH(0.15), hem(bottom), P([0.5, -1, 0], [0.24 - 0.1 * (bottom + 0.26), bottom + 0.01, 0]),
      P([0.2, 0, 1], [0.2, 0, zf]), P([0.2, 0, -1], [0.2, 0, zb])]),
    ...panels.map(([y0, y1], i) => piece(`横スカートのパネル${panels.length > 1 ? ' ' + (i + 1) : ''}`, [
      ...crown('x', 1, (y, z) => out(y, z) + 0.012, steps(y1 - 0.03, y0, 3), steps(zc - hz * 0.65, zc + hz * 0.65, 3)),
      inner(0.2), YH(y0), hem(y1), ZL(zc - hz * 0.65), ZH(zc + hz * 0.65)])),
    piece('横スカートの付け根', [XL(0.125), XH(0.2), YL(0.12), YH(0.19), ZL(-0.06), ZH(0.06), P([1, -1, 0], [0.2, 0.12, 0])], { color: DARK }),
  ];
  if (rim) pieces.push(piece('横スカートの裾', [...crown('x', 1, (y, z) => out(y, z) + 0.014, steps(bottom - 0.06, bottom + rim + 0.06, 2), steps(zb, zf, 4)),
    inner(0.2), hem(bottom), P([0, 1, -0.35], [0, bottom + rim, zb]), P([0.2, 0, 1], [0.2, 0, zf]), P([0.2, 0, -1], [0.2, 0, zb])], { color: DARK }));
  return { id, name, cat: '横スカート', size: [0.1 + 0.1 * len, len + 0.04, zf - zb], pieces };
}

export default [
  sideSkirt({ id: 'skirtside', name: '横スカート' }),
  sideSkirt({ id: 'skirtsidelong', name: '横スカート（長く大きい）', bottom: -0.6, zf: 0.19, zb: -0.18, panels: [[0.12, -0.14], [-0.2, -0.46]], rim: 0.05 }),
];
