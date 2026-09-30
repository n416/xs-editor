// 横スカート：脚の台の外に下がる装甲（腰の骨）。原点は股関節の中心（+x 側）。太ももの柱の外（x ≥ 0.175、領域 B）だけなので、
// 脚を前後に振っても当たらず、動かない（押されて開く骨は要らない）。長さは自由。
// 外の面は前後に反って盛り上がり、下ほど外へ開く（上下はほぼまっすぐ）。裾は前が少し短い斜めで、外の下の角を落とす。一段高いパネル。
// 上端の付け根（暗い色）で腰の帯の下と脚の台につながる。
// sideSkirt() で寸法・形を変えた種類を作る（標準・短い・翼形・2 段・ミサイルポッド付き・長く大きい）
import { P, XL, XH, YH, YL, ZH, ZL, prismX, piece, DARK, BLACK } from '../../xsasm-lib.js';
import { crown, steps } from './shape.js';

/**
 * bottom 下の縁（前の端）の y、zf・zb 前後の端、panels 一段高いパネル [[上の y, 下の y], ...]、rim 裾の厚い縁の高さ、
 * flare 下ほど外へ開く割合、stack 2 段にするとき下の段の上の端の y（0 で 1 枚）、pod ミサイルポッドを付ける
 */
export function sideSkirt({ id, name, bottom = -0.26, zf = 0.15, zb = -0.14, panels = [[0.12, -0.06]], rim = 0, flare = 0.1, stack = 0, pod = false }) {
  const zc = (zf + zb) / 2, hz = (zf - zb) / 2;
  const out = lift => (y, z) => 0.245 - 1.6 * (0.15 / hz) ** 2 * (z - zc) ** 2 - 0.08 * (y + 0.05) ** 2 - flare * y + lift;
  const inner = (x, dx = 0) => P([-1, -flare, 0], [x + dx, 0.15, 0]);   // 内の面：下ほど外へ
  const hem = y => P([0, -1, 0.35], [0, y, zb]);                   // 裾：前が少し短い
  const ends = [P([0.2, 0, 1], [0.2, 0, zf]), P([0.2, 0, -1], [0.2, 0, zb])];
  const len = 0.15 - bottom, Z = steps(zb, zf, 4);
  const yb = stack ? stack - 0.05 : bottom;                         // 上の段の下の縁（2 段なら下の段の上の端より少し下まで）
  const pieces = [
    piece('横スカート', [...crown('x', 1, out(0), steps(yb - 0.06, 0.15, Math.max(5, Math.round((0.15 - yb) / 0.08))), Z),
      inner(0.175), YH(0.15), hem(yb), P([0.5, -1, 0], [out(0)(yb, zc) - 0.017, yb + 0.01, 0]), ...ends]),   // 外の下の角を落とす
    ...panels.map(([y0, y1], i) => piece(`横スカートのパネル${panels.length > 1 ? ' ' + (i + 1) : ''}`, [
      ...crown('x', 1, out(0.012), steps(y1 - 0.03, y0, 3), steps(zc - hz * 0.65, zc + hz * 0.65, 3)),
      inner(0.2), YH(y0), hem(y1), ZL(zc - hz * 0.65), ZH(zc + hz * 0.65)])),
    piece('横スカートの付け根', [XL(0.125), XH(0.2), YL(0.12), YH(0.19), ZL(-0.06), ZH(0.06), P([1, -1, 0], [0.2, 0.12, 0])], { color: DARK }),
  ];
  // 2 段：下の段は上の段の裏から出て、少し外に重なる
  if (stack) pieces.push(piece('横スカート（下の段）', [...crown('x', 1, out(0.03), steps(bottom - 0.06, stack, 4), Z),
    inner(0.2), YH(stack), hem(bottom), ...ends]));
  if (rim) pieces.push(piece('横スカートの裾', [...crown('x', 1, out(stack ? 0.044 : 0.014), steps(bottom - 0.06, bottom + rim + 0.06, 2), Z),
    inner(0.2), hem(bottom), P([0, 1, -0.35], [0, bottom + rim, zb]), ...ends], { color: DARK }));
  // ミサイルポッド：外の面に付いた箱（角を落とす）と、外を向いた 2 × 3 の発射口（暗い 8 角の穴に見える短い筒）
  if (pod) {
    const y0 = -0.13, y1 = 0.07, x0 = out(0)(-0.03, zc) - 0.02, x1 = x0 + 0.075, z0 = zc - hz * 0.7, z1 = zc + hz * 0.7;
    pieces.push(piece('ミサイルポッド', [XL(x0), XH(x1), YL(y0), YH(y1), ZL(z0), ZH(z1),
      P([1, 1, 0], [x1 - 0.012, y1, 0]), P([1, -1, 0], [x1 - 0.012, y0, 0]), P([1, 0, 1], [x1 - 0.012, 0, z1]), P([1, 0, -1], [x1 - 0.012, 0, z0])], { color: DARK }));
    for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) {
      const yc = y0 + (y1 - y0) * (r + 0.5) / 2, zz = z0 + (z1 - z0) * (c + 0.5) / 3;
      pieces.push(piece(`ミサイルの口 ${r * 3 + c + 1}`, [...prismX(0.022, 8, 22.5, yc, zz), XL(x1 - 0.01), XH(x1 + 0.004)], { color: BLACK }));
    }
  }
  return { id, name, cat: '横スカート', size: [0.1 + flare * len + (pod ? 0.08 : 0), len + 0.04, zf - zb], pieces };
}

export default [
  sideSkirt({ id: 'skirtside', name: '横スカート' }),
  sideSkirt({ id: 'skirtsideshort', name: '横スカート（短い）', bottom: -0.08, panels: [[0.12, 0.0]] }),
  sideSkirt({ id: 'skirtsidewing', name: '横スカート（翼形）', bottom: -0.36, zf: 0.12, zb: -0.2, flare: 0.28, panels: [[0.12, -0.12]], rim: 0.04 }),
  sideSkirt({ id: 'skirtsidestack', name: '横スカート（2 段）', bottom: -0.4, stack: -0.12, panels: [[0.12, -0.06]], rim: 0.035 }),
  sideSkirt({ id: 'skirtsidepod', name: '横スカート（ミサイルポッド付き）', bottom: -0.3, panels: [] , pod: true }),
  sideSkirt({ id: 'skirtsidelong', name: '横スカート（長く大きい）', bottom: -0.6, zf: 0.19, zb: -0.18, panels: [[0.12, -0.14], [-0.2, -0.46]], rim: 0.05 }),
];
