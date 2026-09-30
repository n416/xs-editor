// 股関節：横（x）の 12 角柱。脚はこの軸（骨格図の hip、x ±0.175・y 1.6）のまわりに回る（回転の中心）。原点はその中心、+x 側の 1 個。
// 反対側は鏡像で置く。内側へ細い軸が伸び、股の芯に刺さる（左右の軸は中央で出会う）
import { XH, XL, prismX, piece, DARK } from '../../xsasm-lib.js';

export default {
  id: 'hipjoint', name: '股関節', cat: '股関節', size: [0.35, 0.2, 0.2],
  pieces: [
    piece('股関節', [...prismX(0.1, 12, 15), XL(-0.1), XH(0.1)], { color: DARK, bone: 'hips', pivot: 'leg' }),
    piece('股の軸', [...prismX(0.05, 8, 22.5), XL(-0.175), XH(-0.09)], { color: DARK, bone: 'hips', pivot: 'none' }),
  ],
};
