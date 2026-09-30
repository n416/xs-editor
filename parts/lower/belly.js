// 腹の関節：縦の 12 角柱。上半身はこの中心（骨格図の belly、y 2.0）のまわりに回る（回転の中心）。原点はその中心。
// 腰（hips 骨）の部品。下端は腰の帯に差し込み、上端は胸の下に入る。見えるのは帯と胸の間の短い所だけで、そこに輪が 1 本
import { YH, YL, prismY, piece, DARK } from '../../xsasm-lib.js';

export default {
  id: 'belly', name: '腹', cat: '腹', size: [0.28, 0.305, 0.28],
  pieces: [
    piece('腹', [...prismY(0.125, 12, 15), YL(-0.165), YH(0.14)], { color: DARK, bone: 'hips', pivot: 'torso' }),
    piece('腹の輪', [...prismY(0.138, 12, 0), YL(0.0), YH(0.03)], { color: DARK, bone: 'hips', pivot: 'none' }),
  ],
};
