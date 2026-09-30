// 股関節：脚はこの軸（骨格図の hip、x ±0.175・y 1.6）のまわりに回る（回転の中心）。原点はその中心、+x 側の 1 個。
// 反対側は鏡像で置く。内側へ細い軸が伸び、股の芯に刺さる（左右の軸は中央で出会う）。
// 種類：横の 12 角柱・球・太い円筒（両端につば）。どれも軸のまわりに回しても形が変わらない（太ももに当たらない）
import { XH, XL, prismX, ellipsoid, piece, DARK } from '../../xsasm-lib.js';

const J = { color: DARK, bone: 'hips' };
const axle = () => piece('股の軸', [...prismX(0.05, 8, 22.5), XL(-0.175), XH(-0.09)], { ...J, pivot: 'none' });
export default [
  { id: 'hipjoint', name: '股関節', cat: '股関節', size: [0.35, 0.2, 0.2],
    pieces: [piece('股関節', [...prismX(0.1, 12, 15), XL(-0.1), XH(0.1)], { ...J, pivot: 'leg' }), axle()] },
  { id: 'hipjointball', name: '股関節（球）', cat: '股関節', size: [0.35, 0.21, 0.21],
    pieces: [piece('股関節', ellipsoid([0.1, 0.104, 0.104], [0, 0, 0], 12, [-60, -30, 0, 30, 60, -85, 85]), { ...J, pivot: 'leg' }), axle()] },
  { id: 'hipjointdrum', name: '股関節（太い円筒）', cat: '股関節', size: [0.35, 0.25, 0.25],
    pieces: [piece('股関節', [...prismX(0.108, 16, 11.25), XL(-0.085), XH(0.085)], { ...J, pivot: 'leg' }),
      piece('股関節のつば（内）', [...prismX(0.122, 16, 11.25), XL(-0.1), XH(-0.08)], { ...J, pivot: 'none' }),
      piece('股関節のつば（外）', [...prismX(0.122, 16, 11.25), XL(0.08), XH(0.1)], { ...J, pivot: 'none' }), axle()] },
];
