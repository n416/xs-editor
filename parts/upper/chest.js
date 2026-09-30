// 胸（胴の前の上、胴の骨 torso）：胴を胸・背中・腹・脇腹に分けたうちの前の上。y 0.2〜0.555、z −0.03 より前。原点は胸の下端の中心（y 2.1）。
// 自分の暗い芯（前の上の塊）と、その前の装甲、上の面の前の半分（襟と首が通る）を持つ。背中・腹・脇腹と 1〜3 cm 重なってつながる。
// 装甲の外の角は上から見て後ろへ落とす（「八」の字）。腕を内へ振ると上腕と肩アーマーが胸の前の外の角に来るため。
// 種類：左右 2 枚と中央の稜・丸い 1 枚・中ほどに横の稜・大きな張り出し（左右の厚い塊）・横に重ねた板・差し色
import { P, XL, YL, YH, both, piece, DARK, ACCENT } from '../../xsasm-lib.js';
import { crown, steps } from '../lower/shape.js';
import { STD, sideX, frontZ, hull, pairPl, slab } from './kit.js';

const { wt, top, zf, bz } = STD;
/** 芯：前の上の塊（後ろは z −0.03 まで、背中の芯と重なる） */
const core = () => hull('胸の芯', [...[1, -1].flatMap(s => [[s * (sideX(0.2) - 0.005), 0.2, frontZ(0.2)], [s * (sideX(0.2) - 0.005), 0.2, -0.03],
  [s * sideX(0.3), 0.3, zf], [s * sideX(0.3), 0.3, -0.03], [s * wt, 0.47, zf - 0.01], [s * wt, 0.47, -0.03], [s * 0.13, top, zf - 0.07], [s * 0.13, top, -0.03]])], { color: DARK });
/** 上の面の前の半分 */
const topPlate = () => piece('胸の上の板', [...crown('y', 1, (x, z) => top + 0.012 - 0.25 * x * x - 0.5 * (z + 0.02) ** 2, steps(-wt + 0.05, wt - 0.05, 5), steps(-0.03, bz - 0.08, 2)),
  YL(top - 0.03), ...both(P([1, 0.8, 0], [wt - 0.03, top - 0.02, 0])), P([0, 0.6, 1], [0, top, bz - 0.07]), P([0, 0, -1], [0, 0, 0.03])]);
/** 胸の装甲の前の面：br 'round' は横に強く丸く、'wedge' は中ほど（y 0.42）に横の稜 */
const face = br => (x, y) => (br === 'wedge' ? bz - 0.35 * Math.abs(y - 0.42) : bz - 1.1 * (y - 0.44) ** 2) - (br === 'round' ? 0.6 : 0.4) * x * x - 0.1 * Math.sqrt(x * x + 0.002);
/** 胸の装甲：幅いっぱいの大きな板。下の縁は中央が少し下がる、外の角は後ろへ落とす */
const bib = (br, x0, x1) => { const fb = face(br); return [...crown('z', 1, fb, steps(x0, x1, 5), steps(0.28, 0.55, br === 'wedge' ? 2 : 4)), ...(br === 'wedge' ? crown('z', 1, fb, steps(x0, x1, 5), [0.4, 0.44]) : []),
  P([0, 0.25, -1], [0, 0.4, 0.12]), YH(top - 0.003), P([0, 1, 0.9], [0, top - 0.035, bz - 0.06]),
  ...both(P([0.14, -1, 0], [0, 0.255, 0])), ...both(P([1, 0, 0.75], [wt - 0.045, 0, bz - 0.07])), ...both(P([1, 0.3, 0], [wt + 0.005, 0.45, 0])), ...both(P([1, 0.9, 0], [wt - 0.03, 0.5, 0]))]; };
/** 胸の装甲の下の縁の暗い段 */
const underStep = () => piece('胸の装甲の下の段', [...crown('z', 1, (x) => bz - 0.035 - 0.4 * x * x, steps(-wt + 0.03, wt - 0.03, 5), [0.28]),
  P([0, 0.25, -1], [0, 0.4, 0.12]), ...both(P([0.14, -1, 0], [0, 0.232, 0])), P([0, 1, 0], [0, 0.3, 0]), ...both(P([1, 0, 0.75], [wt - 0.06, 0, bz - 0.09]))], { color: DARK });
/** 中央の縦の稜 */
const keel = (br, o = {}) => { const fb = face(br); return piece('胸の中央の稜', slab('z', 1, (x, y) => (y > 0.3 ? fb(0, y) : Math.min(fb(0, 0.3), frontZ(y) + 0.06)) + 0.014 - 3 * x * x,
  [-0.036, 0.036], [0.22, top - 0.02], { bev: 0.011, depth: 0.09, na: 2, nb: 6, extra: [P([0, 1, 0.9], [0, top - 0.035, fb(0, top - 0.035) + 0.01])] }), o); };
/** 胸の装甲に重ねる左右の板 */
const panels = (br, y0, x0, o = {}) => pairPl('胸の装甲の板', slab('z', 1, (x, y) => face(br)(x, y) + 0.012, [x0, wt - 0.07], [y0, 0.505], { bev: 0.012, depth: 0.04, extra: [P([1, -0.35, 0], [wt - 0.07, y0, 0])] }), o);

const C = (id, name, pieces) => ({ id, name, cat: '胸', size: [2 * wt + 0.02, 0.36, bz + 0.05], pieces: [core(), topPlate(), ...pieces] });
const ACC = { color: ACCENT };
export default [
  C('chest', '胸（左右 2 枚と稜）', [...pairPl('胸の装甲', [...bib('split', 0.03, wt), XL(0.03)]), underStep(), keel('split'), ...panels('split', 0.35, 0.075)]),
  C('chestround', '胸（丸い 1 枚）', [piece('胸の装甲', bib('round', -wt, wt)), underStep(),
    piece('胸の装甲の帯', slab('z', 1, (x, y) => face('round')(x, y) + 0.012, [-(wt - 0.1), wt - 0.1], [0.405, 0.465], { bev: 0.01, depth: 0.04, na: 6, nb: 2 }))]),
  C('chestwedge', '胸（横の稜）', [piece('胸の装甲', bib('wedge', -wt, wt)), underStep(), keel('wedge'), ...panels('wedge', 0.43, 0.075)]),
  // 大きな張り出し：左右の厚い丸い塊（前へ 3.5 cm 多く出る）。間は暗いくぼみ、塊の下の面は下を向いて奥へ入る
  C('chestbulge', '胸（大きな張り出し）', [
    ...pairPl('胸の張り出し', slab('z', 1, (x, y) => bz + 0.035 - 1.4 * (y - 0.42) ** 2 - 0.9 * (x - 0.17) ** 2, [0.045, wt - 0.01], [0.27, 0.54],
      { bev: 0.028, depth: 0.14, na: 4, nb: 4, extra: [P([1, 0.9, 0], [wt - 0.03, 0.5, 0]), P([1, 0, 0.75], [wt - 0.045, 0, bz - 0.06]), P([0, -1, 0.7], [0, 0.285, bz - 0.01])] })),
    piece('胸のくぼみ', slab('z', 1, (x, y) => bz - 0.025 - 2 * x * x, [-0.05, 0.05], [0.25, 0.53], { bev: 0.008, depth: 0.1, na: 2, nb: 3 }), { color: DARK }),
    underStep()]),
  // 横に重ねた板：幅いっぱいの板を 3 段。どの板も下の縁が前で、上の縁は上の板の裾の裏にもぐる（下の板ほど少し奥）
  C('chestlames', '胸（横に重ねた板）', [...[0, 1, 2].map(k => {
    const y0 = 0.46 - 0.085 * k, y1 = Math.min(top - 0.003, y0 + 0.095), f = (x, y) => bz - 0.018 * k - 0.4 * x * x - 0.1 * Math.sqrt(x * x + 0.002) + 0.25 * (y1 - y) - 0.02;
    return piece(`胸の段 ${k + 1}`, slab('z', 1, f, [-(wt - 0.015 * k), wt - 0.015 * k], [y0, y1], { bev: 0.012, depth: 0.1, na: 6, nb: 2,
      extra: [...both(P([1, 0, 0.75], [wt - 0.045 - 0.015 * k, 0, bz - 0.07 - 0.018 * k])), ...both(P([1, 0.9, 0], [wt - 0.03, 0.5, 0]))] }));
  }), underStep()]),
  C('chestaccent', '胸（差し色）', [piece('胸の装甲', bib('split', -wt, wt)), underStep(), keel('split', ACC), ...panels('split', 0.35, 0.075, ACC)]),
];
