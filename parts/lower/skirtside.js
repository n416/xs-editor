// 横スカート：脚の台の外に下がる装甲（腰の骨）。原点は股関節の中心（+x 側）。太ももの柱の外（x ≥ 0.175、領域 B）だけなので、
// 脚を前後に振っても当たらず、動かない（押されて開く骨は要らない）。長さは自由。
// 外の面は前後に反って盛り上がり、下ほど外へ開く（上下はほぼまっすぐ）。裾は前が少し短い斜めで、外の下の角を落とす。一段高いパネル。
// 上端の付け根（暗い色）で腰の帯の下と脚の台につながる。
// sideSkirt() で寸法・形を変えた種類を作る（標準・短い・翼形・2 段・ミサイルポッド付き・長く大きい）。wrapSide() は前後とつながる弧の横スカート
import { P, XL, XH, YH, YL, ZH, ZL, prismX, piece, DARK, BLACK } from '../../xsasm-lib.js';
import { crown, steps } from './shape.js';

/**
 * bottom 下の縁（前の端）の y、zf・zb 前後の端、panels 一段高いパネル [[上の y, 下の y], ...]、rim 裾の厚い縁の高さ、
 * flare 下ほど外へ開く割合、stack 2 段にするとき下の段の上の端の y（0 で 1 枚）、pod ミサイルポッドを付ける
 */
// 5 cm 内へ寄せてある（依頼主：「腰が太すぎるんですよ」。上半身を下げて腕を短くすると、前腕が横スカートの真横に来て触れた：外の端が中心から 44 cm、前腕の内の端も 44〜46 cm）。
// 上の端は脚の台のすぐ外（内の面 x 0.125）。太ももは股関節の 21 cm 下から外へ太くなる（x 0.19 まで）ので、下ほど外へ開く割合は 0.2 以上にして、その外を通す
export function sideSkirt({ id, name, bottom = -0.26, zf = 0.15, zb = -0.14, panels = [[0.12, -0.06]], rim = 0, flare: flare0 = 0.2, stack = 0, pod = false }) {
  const flare = Math.max(flare0, 0.2);
  const zc = (zf + zb) / 2, hz = (zf - zb) / 2;
  const out = lift => (y, z) => 0.195 - 1.6 * (0.15 / hz) ** 2 * (z - zc) ** 2 - 0.08 * (y + 0.05) ** 2 - flare * y + lift;
  const inner = (x, dx = 0) => P([-1, -flare, 0], [x + dx, 0.15, 0]);   // 内の面：下ほど外へ
  const hem = y => P([0, -1, 0.35], [0, y, zb]);                   // 裾：前が少し短い
  const ends = [P([0.2, 0, 1], [0.15, 0, zf]), P([0.2, 0, -1], [0.15, 0, zb])];
  const len = 0.15 - bottom, Z = steps(zb, zf, 4);
  const yb = stack ? stack - 0.05 : bottom;                         // 上の段の下の縁（2 段なら下の段の上の端より少し下まで）
  const pieces = [
    piece('横スカート', [...crown('x', 1, out(0), steps(yb - 0.06, 0.15, Math.max(5, Math.round((0.15 - yb) / 0.08))), Z),
      inner(0.125), YH(0.15), hem(yb), P([0.5, -1, 0], [out(0)(yb, zc) - 0.017, yb + 0.01, 0]), ...ends]),   // 外の下の角を落とす
    ...panels.map(([y0, y1], i) => piece(`横スカートのパネル${panels.length > 1 ? ' ' + (i + 1) : ''}`, [
      ...crown('x', 1, out(0.012), steps(y1 - 0.03, y0, 3), steps(zc - hz * 0.65, zc + hz * 0.65, 3)),
      inner(0.15), YH(y0), hem(y1), ZL(zc - hz * 0.65), ZH(zc + hz * 0.65)])),
    piece('横スカートの付け根', [XL(0.095), XH(0.15), YL(0.12), YH(0.19), ZL(-0.06), ZH(0.06), P([1, -1, 0], [0.15, 0.12, 0])], { color: DARK }),
  ];
  // 2 段：下の段は上の段の裏から出る（上の端は上の段の裾と同じ斜めで、その 6 cm 上まで上の段の裏に入る）。外の面は上の段より 1.2 cm 内
  const topAt = y => P([0, 1, -0.35], [0, y, zb]);                 // 裾と平行な上の端
  if (stack) pieces.push(piece('横スカート（下の段）', [...crown('x', 1, out(-0.012), steps(bottom - 0.06, yb + 0.1, 4), Z),
    inner(0.135), topAt(yb + 0.06), hem(bottom), ...ends]));
  if (rim) pieces.push(piece('横スカートの裾', [...crown('x', 1, out(stack ? 0.002 : 0.014), steps(bottom - 0.06, bottom + rim + 0.06, 2), Z),
    inner(stack ? 0.135 : 0.15), hem(bottom), P([0, 1, -0.35], [0, bottom + rim, zb]), ...ends], { color: DARK }));
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

/**
 * 前後とつながる横スカート：腰の横を回り込む弧。左右が合わさる前・後ろスカートと組むと、腰のまわりがすき間なく埋まる。
 * 弧の中心は体の中心寄りの縦の線（原点から x −0.075）で、外の面の半径 ro・内の面の半径 ri、下ほど外へ開く（flare）。
 * 1 枚の曲がった板は凸にならないので、弧を segs 枚に分けて少し重ねる（継ぎ目が抜けない）。前の端（a1 度）は前スカートの裏へ、
 * 後ろの端（a0 度）は後ろスカートの裏へ入る。太ももの柱（x ≤ 0.26）には入らない（内の面の x ≥ 0.27）。動かない（腰の骨）
 */
export function wrapSide({ id, name, bottom = -0.34, a0 = -40, a1 = 30, ro = 0.32, ri = 0.275, flare = 0.14, segs = 3, rim = 0.04, panel = [0.1, -0.22] }) {
  const cx = -0.075, TOPY = 0.175, R = Math.PI / 180;
  const outer = (t, lift = 0) => P([Math.cos(t * R), flare, Math.sin(t * R)], [cx + (ro + lift) * Math.cos(t * R), TOPY, (ro + lift) * Math.sin(t * R)]);
  const innerAt = m => P([-Math.cos(m * R), -flare, -Math.sin(m * R)], [cx + ri * Math.cos(m * R), TOPY, ri * Math.sin(m * R)]);
  const from = a => P([Math.sin(a * R), 0, -Math.cos(a * R)], [cx, 0, 0]);    // 角 a より大きい側だけ
  const to = b => P([-Math.sin(b * R), 0, Math.cos(b * R)], [cx, 0, 0]);      // 角 b より小さい側だけ
  const hem = y => P([0, -1, 0.15], [0, y, 0]);                               // 裾：前が少し短い
  const pieces = [];
  const step = (a1 - a0) / segs;
  for (let i = 0; i < segs; i++) {
    const a = a0 + step * i - (i ? 1.5 : 0), b = a0 + step * (i + 1) + (i < segs - 1 ? 1.5 : 0), m = (a + b) / 2;
    const ts = [a, a + (b - a) / 3, a + 2 * (b - a) / 3, b];
    pieces.push(piece(`横スカート ${i + 1}`, [...ts.map(t => outer(t)), innerAt(m), from(a), to(b), YH(TOPY), hem(bottom),
      P([Math.cos(m * R), 1.4, Math.sin(m * R)], [cx + ro * Math.cos(m * R), TOPY, ro * Math.sin(m * R)])]));   // 上の外の角を落とす
    // 上の縁：帯の下へ入り込む薄い棚。帯の角を落とした所と前後のスカートの蝶番の間をふさぐ（前後の端は前後のスカートが開く所に入らない z ≤ 0.21）
    pieces.push(piece(`横スカートの上の縁 ${i + 1}`, [...ts.map(t => outer(t, -0.004)), P([-Math.cos(m * R), 0, -Math.sin(m * R)], [cx + 0.19 * Math.cos(m * R), 0, 0.19 * Math.sin(m * R)]),
      from(a), to(b), YH(TOPY + 0.02), YL(TOPY - 0.012), ZH(0.21), ZL(-0.25)], { color: DARK }));
    if (rim) pieces.push(piece(`横スカートの裾 ${i + 1}`, [...ts.map(t => outer(t, 0.013)), innerAt(m), from(a), to(b), hem(bottom), P([0, 1, -0.15], [0, bottom + rim, 0])], { color: DARK }));
  }
  if (panel) {   // まん中の板に一段高いパネル
    const pa = -14, pb = 14, ts = [pa, 0, pb];
    pieces.push(piece('横スカートのパネル', [...ts.map(t => outer(t, 0.012)), innerAt(0), from(pa), to(pb), YH(panel[0]), hem(panel[1])]));
  }
  pieces.push(piece('横スカートの付け根', [XL(0.125), XH(0.2), YL(0.12), YH(0.19), ZL(-0.06), ZH(0.06), P([1, -1, 0], [0.2, 0.12, 0])], { color: DARK }));
  return { id, name, cat: '横スカート', size: [ro - ri + 0.1, TOPY - bottom, 2 * ro * 0.8], pieces };
}

export default [
  sideSkirt({ id: 'skirtside', name: '横スカート' }),
  sideSkirt({ id: 'skirtsideshort', name: '横スカート（短い）', bottom: -0.08, panels: [[0.12, 0.0]] }),
  sideSkirt({ id: 'skirtsidewing', name: '横スカート（翼形）', bottom: -0.36, zf: 0.12, zb: -0.2, flare: 0.28, panels: [[0.12, -0.12]], rim: 0.04 }),
  sideSkirt({ id: 'skirtsidestack', name: '横スカート（2 段）', bottom: -0.4, stack: -0.12, panels: [[0.12, -0.06]], rim: 0.035 }),
  sideSkirt({ id: 'skirtsidepod', name: '横スカート（ミサイルポッド付き）', bottom: -0.3, panels: [] , pod: true }),
  wrapSide({ id: 'skirtsidewrap', name: '横スカート（前後とつながる）' }),
  sideSkirt({ id: 'skirtsidelong', name: '横スカート（長く大きい）', bottom: -0.6, zf: 0.19, zb: -0.18, panels: [[0.12, -0.14], [-0.2, -0.46]], rim: 0.05 }),
];
