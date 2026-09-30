// 後ろスカート（片側）：後ろ腰の下に下がる台形の装甲（腰の骨の子のスカートの骨）。原点は股関節の中心（+x 側）。
// 板は回転の軸に載る（前スカートと同じ：軸は板の厚みの真ん中、上の端から 1.2 cm 下。左右の端の外の小さな受けと短い軸で支える）。
// 脚を後ろへ振ると太ももに押されて軸のまわりに後ろへ開く（hinge：dir −1 で裾が後ろへ上がる）。軸より上の部分が回り込む範囲は
// 後ろ腰の装甲の下に収まる。付け根以外の厚さ・長さは自由。下ほど広く、下ほど厚い。横に反り、一段高いパネル。
// 下の縁は内側（中央寄り）が長い斜め。backSkirt() で寸法・形を変えた種類を作る
import { P, XH, XL, YH, YL, ZH, ZL, prismX, piece, DARK, ACCENT } from '../../xsasm-lib.js';
import { crown, steps } from './shape.js';
import { joint } from './skirtfront.js';

const TOP = 0.157;   // 板の上の端（後ろ腰の装甲の下の縁の 1.3 cm 下）。回転の軸は 1.2 cm 下（y 0.145）
const SLANT = 0.35;                                                 // 下の縁の斜め（内側ほど長い）

/** bottom 下の縁（中心）の y、x0・x1 上の端の左右（下では spread だけ広がる）、lean 後ろの面の傾き、slant 下の縁の斜め（内側ほど長い）、
 *  panels・rim・rimColor・layer・strips・spreadIn・center・panelC・segs・faceLift は前スカートと同じ、hingeZ 蝶番の前後の位置 */
export function backSkirt({ id, name, bottom = -0.25, x0 = -0.07, x1 = 0.12, spread = 0.013, lean = 0.18, crownX = 2, panels = [[0.1, -0.19]], rim = 0, rimColor = DARK,
  slant = SLANT, layer = 0, strips = 1, hingeZ = -0.24, spreadIn = spread, center, panelC, segs = 1, faceLift = 0, bendFrom = Infinity, bendK = 0 }) {
  const C = center ?? (x0 + x1) / 2, PC = panelC ?? C, len = TOP - bottom, k = spread / len, kIn = spreadIn / len, d0 = -hingeZ + 0.0125;   // d0：付け根の後ろの面の深さ（軸より 1.25 cm 後ろ）   // dz：後ろへずらす分
  const HINGE = { y: 0.145, z: hingeZ, dir: -1 };
  const H = { hinge: HINGE, bone: 'skirt' };   // 骨はスカート（ゲームでは skirt_front_* / skirt_back_*）
  const bend = x => bendK * Math.max(0, x - bendFrom) ** 2;   // 太ももの幅の外で体の側へ曲げる（前スカートと同じ）
  const face = lift => (x, y) => d0 + faceLift + (TOP - y) * lean - crownX * (x - C) ** 2 - bend(x) + lift;   // 後ろの面の深さ   // 後ろの面の深さ（−z 向き）
  const front = z0 => P([0, -0.7 * lean, 1], [0, TOP, -(d0 - 0.025 + (z0 - 0.235))]);   // 下へ行くほど後ろの面の 7 割だけ後ろへ   // 表の面（体の側）。front(0.235) が板の表（付け根の厚さ 2.5 cm）       // 表の面（体の側）：ほぼ縦
  const sides = (a, b, y) => [P([1, k, 0], [b, y, 0]), P([-1, kIn, 0], [a, y, 0])];
  const hem = y => P([slant, -1, 0], [C, y, 0]);                   // 下の縁：内側が長い斜め
  const X = steps(x0 - spreadIn, x1 + spread, 4), Y = steps(bottom - 0.06 - slant * 0.1, TOP, Math.max(6, Math.round(len / 0.07)));
  const plate = [...crown('z', -1, face(0), X, Y), front(0.235), YH(TOP), P([0, 1, -1.5], [0, TOP, -(d0 - 0.005)]), ...sides(x0, x1, TOP), hem(bottom)];
  const cut = (i, n = strips, gap = 0.004) => { const a = x0 + (x1 - x0) * i / n, b = x0 + (x1 - x0) * (i + 1) / n, g = i ? gap : 0, h = i < n - 1 ? gap : 0;
    const ka = -spreadIn + (spread + spreadIn) * i / n, kb = -spreadIn + (spread + spreadIn) * (i + 1) / n;
    return [P([1, kb / len, 0], [b - h, TOP, 0]), P([-1, -ka / len, 0], [a + g, TOP, 0])]; };
  // 反りに沿う表の面（体の側）：x = m で後ろの面から t 手前に、その位置の反りの傾きで（前スカートの backAt と同じ考え）
  const faceTop = x => face(0)(x, TOP);
  const slope = m => -2 * crownX * (m - C) - 2 * bendK * Math.max(0, m - bendFrom);
  const frontAt = (m, t) => P([slope(m), -0.7 * lean, 1], [m, TOP, -(faceTop(m) - t)]);
  const segMid = i => x0 + (x1 - x0) * (i + 0.5) / segs;
  const segPlate = i => [...crown('z', -1, face(0), X, Y), frontAt(segMid(i), 0.028), YH(TOP), ...sides(x0, x1, TOP), hem(bottom), ...cut(i, segs, -0.006)];
  const pieces = [
    ...(segs > 1 ? Array.from({ length: segs }, (_, i) => piece(`後ろスカート ${i + 1}`, segPlate(i), H))
      : strips > 1 ? Array.from({ length: strips }, (_, i) => piece(`後ろスカート ${i + 1}`, [...plate, ...cut(i)], H)) : [piece('後ろスカート', plate, H)]),
    ...panels.map(([y0, y1], i) => {
      const w = (x1 - x0) * 0.3;
      return piece(`後ろスカートのパネル${panels.length > 1 ? ' ' + (i + 1) : ''}`, [...crown('z', -1, face(0.01), steps(PC - w, PC + w, 2), steps(y1 - 0.03 - slant * 0.05, y0, 4)),
        segs > 1 ? frontAt(PC, 0.012) : front(0.26), YH(y0), ...sides(PC - w, PC + w, y0), hem(y1 - slant * (PC - C))], H);
    }),
    ...joint('後ろスカート', x0, x1, hingeZ, -1),
  ];
  if (layer) pieces.push(piece('後ろスカートの上の板', [...crown('z', -1, face(0.03), X, steps(layer - 0.02, TOP, 4)), front(0.25), YH(TOP), P([0, 1, -1.5], [0, TOP, -(d0 + 0.025)]),
    ...sides(x0 - 0.006, x1 + 0.006, TOP), YL(layer), P([0, -1, -1.2], [0, layer, -(face(0.03)(C, layer) - 0.01)])], H));
  // 裾の厚い縁：下の縁に沿って後ろへ少し出た帯（上の線も同じ斜め）
  if (rim && segs > 1) for (let i = 0; i < segs; i++) pieces.push(piece(`後ろスカートの裾 ${i + 1}`, [...crown('z', -1, face(0.014), X, steps(bottom - 0.06 - slant * 0.3, bottom + rim + 0.06, 2)),
    frontAt(segMid(i), 0.012), ...sides(x0, x1, TOP), ...cut(i, segs, -0.006), hem(bottom), P([-slant, 1, 0], [C, bottom + rim, 0])], { ...H, color: rimColor }));
  else if (rim) pieces.push(piece('後ろスカートの裾', [...crown('z', -1, face(0.014), X, steps(bottom - 0.06 - slant * 0.1, bottom + rim + 0.06, 2)),
    front(0.25), ...sides(x0, x1, TOP), hem(bottom), P([-slant, 1, 0], [C, bottom + rim, 0])], { ...H, color: rimColor }));
  return { id, name, cat: '後ろスカート', size: [x1 - x0 + spread + spreadIn, TOP - bottom + 0.06, 0.025 + len * lean], pieces };
}

export default [
  backSkirt({ id: 'skirtback', name: '後ろスカート' }),
  backSkirt({ id: 'skirtbackshort', name: '後ろスカート（短い）', bottom: -0.08, lean: 0.3, panels: [[0.11, -0.03]], slant: 0.15 }),
  backSkirt({ id: 'skirtbackwide', name: '後ろスカート（幅広）', bottom: -0.3, x0: -0.09, x1: 0.17, spread: 0.03, crownX: 1.4, panels: [[0.1, -0.22]], slant: 0.2 }),
  backSkirt({ id: 'skirtbacklayer', name: '後ろスカート（2 枚重ね）', bottom: -0.4, spread: 0.02, lean: 0.16, panels: [[-0.16, -0.32]], layer: -0.11, rim: 0.035 }),
  backSkirt({ id: 'skirtbackstrips', name: '後ろスカート（短冊）', bottom: -0.34, spread: 0.03, lean: 0.16, crownX: 1.5, panels: [], strips: 3, slant: 0.1, rim: 0.035 }),
  backSkirt({ id: 'skirtbackaccent', name: '後ろスカート（差し色の縁）', bottom: -0.3, spread: 0.02, panels: [[0.1, -0.15]], rim: 0.045, rimColor: ACCENT }),
  // 左右が合わさる：真ん中の動かない板（後ろ腰（真ん中の板））の両脇から下がる（前スカートと同じ考え：真ん中の板は板より後ろへ出た厚い板で、
  // 板の内側の縁はその脇で止まる）。反りの中心と下の縁の斜めは体の中心から。蝶番は後ろ腰の装甲の中央の下の角より後ろ
  backSkirt({ id: 'skirtbackjoined', name: '後ろスカート（左右が合わさる）', x0: -0.085, x1: 0.2, spread: 0.075, spreadIn: 0, center: -0.175, panelC: 0.06,
    bottom: -0.34, lean: 0.1, crownX: 0, bendFrom: 0.085, bendK: 2.5, segs: 5, slant: 0.1, hingeZ: -0.28, panels: [[0.08, -0.23]], panelC: 0.0, rim: 0.04 }),   // 太ももの後ろは平らで、その外で曲がって横スカートの後ろの端に重なる（前スカートと同じ）
  backSkirt({ id: 'skirtbacklong', name: '後ろスカート（長く大きい）', bottom: -0.6, x0: -0.08, x1: 0.15, spread: 0.03, lean: 0.15, crownX: 1.6,
    panels: [[0.11, -0.15], [-0.2, -0.47]], rim: 0.05 }),
];
