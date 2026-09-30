// 後ろスカート（片側）：後ろ腰の装甲の下の角に蝶番で付き、お尻と太ももの裏に下がる台形の装甲（腰の骨の子のスカートの骨）。原点は股関節の中心（+x 側）。
// 脚を後ろへ振ると太ももに押されて、蝶番のまわりに後ろへ開く（hinge：蝶番の軸は横、y 0.17・z −0.25、dir −1 で裾が後ろへ上がる）。
// 蝶番は後ろ腰の装甲の下の角にあり、板はその外から下がる（板の上の端は蝶番より後ろへほとんど出さない）。付け根以外の厚さ・長さは自由。
// 下ほど広く、下ほど厚い。横に反り、一段高いパネル。下の縁は内側（中央寄り）が長い斜め。
// backSkirt() で寸法を変えた種類を作る：標準（太ももの上半分）と、長く大きい（すねの半ばまで、2 段のパネルと裾の厚い縁）
import { P, XH, XL, YH, prismX, piece, DARK } from '../../xsasm-lib.js';
import { crown, steps } from './shape.js';

const HINGE = { y: 0.17, z: -0.25, dir: -1 };
const H = { hinge: HINGE, bone: 'skirt' };   // 骨はスカート（ゲームでは skirt_front_* / skirt_back_*）
const TOP = 0.155;
const SLANT = 0.35;                                                 // 下の縁の斜め（内側ほど長い）

/** bottom 下の縁（中心）の y、x0・x1 上の端の左右（下では spread だけ広がる）、lean 後ろの面の傾き、panels・rim は前スカートと同じ */
export function backSkirt({ id, name, bottom = -0.25, x0 = -0.07, x1 = 0.12, spread = 0.013, lean = 0.18, crownX = 2, panels = [[0.1, -0.19]], rim = 0 }) {
  const C = (x0 + x1) / 2, len = TOP - bottom, k = spread / len;
  const face = lift => (x, y) => 0.26 + (TOP - y) * lean - crownX * (x - C) ** 2 + lift;   // 後ろの面の深さ（−z 向き）
  const front = z0 => P([0, 0.02, 1], [0, TOP, -z0]);              // 表の面（体の側）：ほぼ縦
  const sides = (a, b, y) => [P([1, k, 0], [b, y, 0]), P([-1, k, 0], [a, y, 0])];
  const hem = y => P([SLANT, -1, 0], [C, y, 0]);                   // 下の縁：内側が長い斜め
  const pieces = [
    piece('後ろスカート', [...crown('z', -1, face(0), steps(x0 - spread, x1 + spread, 4), steps(bottom - 0.06, TOP, Math.max(6, Math.round(len / 0.07)))),
      front(0.235), YH(TOP), P([0, 1, -1.5], [0, TOP, -0.255]), ...sides(x0, x1, TOP), hem(bottom)], H),
    ...panels.map(([y0, y1], i) => {
      const w = (x1 - x0) * 0.3;
      return piece(`後ろスカートのパネル${panels.length > 1 ? ' ' + (i + 1) : ''}`, [...crown('z', -1, face(0.01), steps(C - w, C + w, 2), steps(y1 - 0.03, y0, 4)),
        front(0.26), YH(y0), ...sides(C - w, C + w, y0), hem(y1)], H);
    }),
    piece('後ろスカートの蝶番', [...prismX(0.02, 8, 22.5, HINGE.y, HINGE.z), XL(x0 + 0.01), XH(x1 - 0.01)], { ...H, pivot: 'skirt', color: DARK }),
  ];
  // 裾の厚い縁：下の縁に沿って後ろへ少し出た帯（上の線も同じ斜め）
  if (rim) pieces.push(piece('後ろスカートの裾', [...crown('z', -1, face(0.014), steps(x0 - spread, x1 + spread, 4), steps(bottom - 0.06, bottom + rim + 0.06, 2)),
    front(0.25), ...sides(x0, x1, TOP), hem(bottom), P([-SLANT, 1, 0], [C, bottom + rim, 0])], { ...H, color: DARK }));
  return { id, name, cat: '後ろスカート', size: [x1 - x0 + 2 * spread, TOP - bottom + 0.06, 0.26 + len * lean - 0.235], pieces };
}

export default [
  backSkirt({ id: 'skirtback', name: '後ろスカート' }),
  backSkirt({ id: 'skirtbacklong', name: '後ろスカート（長く大きい）', bottom: -0.6, x0: -0.08, x1: 0.15, spread: 0.03, lean: 0.15, crownX: 1.6,
    panels: [[0.11, -0.15], [-0.2, -0.47]], rim: 0.05 }),
];
