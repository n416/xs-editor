// ロッドアンテナ：細い八角の棒が根元の筒から立ち、先へ向かって細って尖る。少し後ろへ倒れる。y 0 が筒の底、前が +z
import { P, XH, XL, YH, YL, ZH, ZL, box, piece, rotXAt, MAIN, DARK } from '../xsasm-lib.js';

const oct = (r, y0, y1) => { const out = [YL(y0), YH(y1)]; for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; out.push(P([Math.cos(a), 0, Math.sin(a)], [r * Math.cos(a), 0, r * Math.sin(a)])); } return out; };
/** 先へ細る八角の棒：半径 r0（y0）→ r1（y1） */
const cone = (r0, r1, y0, y1) => { const out = [YL(y0), YH(y1)]; const k = (r0 - r1) / (y1 - y0); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; out.push(P([Math.cos(a), k, Math.sin(a)], [r0 * Math.cos(a), y0, r0 * Math.sin(a)])); } return out; };
export default {
  id: 'antenna', name: 'ロッドアンテナ', cat: 'トサカ', size: [0.03, 0.3, 0.03],
  pieces: [
    piece('筒', oct(0.011, 0, 0.03), { color: DARK }),
    piece('段', oct(0.008, 0.028, 0.05)),
    piece('棒', rotXAt(cone(0.0055, 0.0012, 0.045, 0.3), 8, 0.045, 0)),
  ],
};
