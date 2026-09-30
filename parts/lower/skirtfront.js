// 前スカート：腰の帯の前面の下の角に蝶番で付き、太ももの前に下がる台形の装甲（腰の骨の子のスカートの骨）。原点は股関節の中心（+x 側）。
// 脚を前へ上げると太ももに押されて、蝶番のまわりに前へ開く（hinge：蝶番の軸は横、y 0.17・z 0.2、dir +1 で裾が前へ上がる）。
// 蝶番は帯の前面の下の角にあり、板は帯の外から下がるので、ひざ立ちで水平まで押し上げられても帯に入らない
// （板の上の端は蝶番より前へほとんど出さない）。付け根以外の厚さ・長さは自由（押されて開くので脚に縛られない）。
// 下ほど広く、下ほど厚い。横に反り（中央が盛り上がる）、一段高いパネル。下の縁は中央が低い V。
// frontSkirt() で寸法・形を変えた種類を作る（標準・短い・幅広・尖った裾・2 枚重ね・短冊・差し色の縁・長く大きい）
import { P, XH, XL, YH, YL, prismX, piece, DARK, ACCENT } from '../../xsasm-lib.js';
import { crown, steps } from './shape.js';

const HINGE = { y: 0.17, z: 0.2, dir: 1 };
const H = { hinge: HINGE, bone: 'skirt' };   // 骨はスカート（ゲームでは skirt_front_* / skirt_back_*）
const TOP = 0.155;                                                  // 板の上の端

/**
 * bottom 下の縁（中央）の y、x0・x1 上の端の左右（下では spread だけ広がる）、lean 前の面の傾き（下へ 1 で前へ lean）、
 * crownX 横の反り、panels 一段高いパネル [[上の y, 下の y], ...]、rim 裾の厚い縁の高さ（0 で無し）、rimColor その色、
 * veeK 下の縁の V の深さ（大きいほど尖る）、layer 重ねる上の板の下の縁の y（0 で無し）、strips 縦の短冊に割る数（1 で割らない）
 */
export function frontSkirt({ id, name, bottom = -0.26, x0 = -0.06, x1 = 0.12, spread = 0.015, lean = 0.2, crownX = 2, panels = [[0.1, -0.2]], rim = 0, rimColor = DARK,
  veeK = 0.3, layer = 0, strips = 1 }) {
  const C = (x0 + x1) / 2, len = TOP - bottom, k = spread / len;
  const face = lift => (x, y) => 0.21 + (TOP - y) * lean - crownX * (x - C) ** 2 + lift;
  const back = z0 => P([0, 0.02, -1], [0, TOP, z0]);               // 裏の面：ほぼ縦（下ほど少し前）
  const sides = (a, b, y) => [P([1, k, 0], [b, y, 0]), P([-1, k, 0], [a, y, 0])];   // 下ほど広い台形
  const vee = y => [P([veeK, -1, 0], [C, y, 0]), P([-veeK, -1, 0], [C, y, 0])];   // 下の縁は中央が低い V
  const X = steps(x0 - spread, x1 + spread, 4), Y = steps(bottom - 0.04 - veeK * 0.15, TOP, Math.max(6, Math.round(len / 0.07)));
  const plate = [...crown('z', 1, face(0), X, Y), back(0.185), YH(TOP), P([0, 1, 1.5], [0, TOP, 0.205]), ...sides(x0, x1, TOP), ...vee(bottom)];
  // 短冊：板を縦に strips 本へ割る（間に細い隙間）。割った板は下の縁で広がる台形の幅を等分する
  const cut = i => { const a = x0 + (x1 - x0) * i / strips, b = x0 + (x1 - x0) * (i + 1) / strips, g = i ? 0.004 : 0, h = i < strips - 1 ? 0.004 : 0;
    const ka = -spread + 2 * spread * i / strips, kb = -spread + 2 * spread * (i + 1) / strips;   // 下の縁での広がり
    return [P([1, kb / len, 0], [b - h, TOP, 0]), P([-1, -ka / len, 0], [a + g, TOP, 0])]; };
  const pieces = [
    ...(strips > 1 ? Array.from({ length: strips }, (_, i) => piece(`前スカート ${i + 1}`, [...plate, ...cut(i)], H)) : [piece('前スカート', plate, H)]),
    ...panels.map(([y0, y1], i) => {
      const w = (x1 - x0) * 0.33;
      return piece(`前スカートのパネル${panels.length > 1 ? ' ' + (i + 1) : ''}`, [...crown('z', 1, face(0.01), steps(C - w, C + w, 2), steps(y1 - 0.02 - veeK * 0.05, y0, 4)),
        back(0.21), YH(y0), ...sides(C - w, C + w, y0), ...vee(y1)], H);
    }),
    piece('前スカートの蝶番', [...prismX(0.02, 8, 22.5, HINGE.y, HINGE.z), XL(x0 + 0.01), XH(x1 - 0.01)], { ...H, pivot: 'skirt', color: DARK }),
  ];
  // 重ねた上の板：付け根から layer まで、少し前に出た短い板（裾はまっすぐ、角を落とす）
  if (layer) pieces.push(piece('前スカートの上の板', [...crown('z', 1, face(0.03), X, steps(layer - 0.02, TOP, 4)), back(0.2), YH(TOP), P([0, 1, 1.5], [0, TOP, 0.215]),
    ...sides(x0 - 0.006, x1 + 0.006, TOP), YL(layer), P([0, -1, 1.2], [0, layer, face(0.03)(C, layer) - 0.01])], H));
  // 裾の厚い縁：下の縁に沿って前へ少し出た帯。V の左右で 1 個ずつ（縁の上の線も V にそろえる）
  if (rim) for (const s of [-1, 1]) pieces.push(piece(`前スカートの裾（${s < 0 ? '内' : '外'}）`, [
    ...crown('z', 1, face(0.014), steps(s < 0 ? x0 - spread : C, s < 0 ? C : x1 + spread, 2), steps(bottom - 0.04 - veeK * 0.15, bottom + rim + 0.04, 2)),
    back(0.2), ...sides(x0, x1, TOP), P([veeK * s, -1, 0], [C, bottom, 0]), P([-veeK * s, 1, 0], [C, bottom + rim, 0]), s < 0 ? XH(C) : XL(C)], { ...H, color: rimColor }));
  const wide = x1 - x0 + 2 * spread;
  return { id, name, cat: '前スカート', size: [wide, TOP - bottom + 0.04, 0.21 + len * lean - 0.185], pieces };
}

export default [
  frontSkirt({ id: 'skirtfront', name: '前スカート' }),
  frontSkirt({ id: 'skirtfrontshort', name: '前スカート（短い）', bottom: -0.1, lean: 0.28, panels: [[0.11, -0.04]], veeK: 0.15 }),
  frontSkirt({ id: 'skirtfrontwide', name: '前スカート（幅広）', bottom: -0.3, x0: -0.085, x1: 0.165, spread: 0.03, crownX: 1.4, panels: [[0.1, -0.22]], veeK: 0.2 }),
  frontSkirt({ id: 'skirtfrontpoint', name: '前スカート（尖った裾）', bottom: -0.42, spread: 0, lean: 0.16, panels: [[0.1, -0.2]], veeK: 1.1 }),
  frontSkirt({ id: 'skirtfrontlayer', name: '前スカート（2 枚重ね）', bottom: -0.42, spread: 0.02, lean: 0.18, panels: [[-0.17, -0.34]], layer: -0.12, rim: 0.035 }),
  frontSkirt({ id: 'skirtfrontstrips', name: '前スカート（短冊）', bottom: -0.36, spread: 0.03, lean: 0.18, crownX: 1.5, panels: [], strips: 3, veeK: 0.12, rim: 0.035 }),
  frontSkirt({ id: 'skirtfrontaccent', name: '前スカート（差し色の縁）', bottom: -0.3, spread: 0.02, panels: [[0.1, -0.16]], rim: 0.045, rimColor: ACCENT }),
  frontSkirt({ id: 'skirtfrontlong', name: '前スカート（長く大きい）', bottom: -0.62, x0: -0.075, x1: 0.145, spread: 0.035, lean: 0.17, crownX: 1.6,
    panels: [[0.11, -0.16], [-0.21, -0.5]], rim: 0.05 }),
];
