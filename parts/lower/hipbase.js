// 脚の台：股関節を外から包む、卵を縦に割った形の受け（暗い色）。原点は股関節の中心（+x 側）。太ももの柱の外（x ≥ 0.095、領域 B）だけで、
// 上は腰の帯の下に入る。外に軸受の 12 角の蓋（縁を斜めに落とす）と小さな軸の端
import { P, XH, XL, prismX, ellipsoid, piece, DARK } from '../../xsasm-lib.js';

const D = Math.PI / 180;
/** 横の 12 角の蓋の外の縁を落とす面：x = x1 の所で半径 a から、外へ向かって 45° に細る */
const capEdge = (a, x1, n = 12, th0 = 15) => Array.from({ length: n }, (_, k) => { const t = (th0 + k * 360 / n) * D; return P([1, Math.sin(t), Math.cos(t)], [x1 - 0.012, a * Math.sin(t), a * Math.cos(t)]); });

export default {
  id: 'hipbase', name: '脚の台', cat: '脚の台', size: [0.12, 0.34, 0.32],
  pieces: [
    piece('台', [...ellipsoid([0.09, 0.17, 0.16], [0.1, 0.03, 0], 12, [-60, -30, 0, 30, 60]), XL(0.095)], { color: DARK }),
    piece('軸受', [...prismX(0.07, 12, 15), XL(0.17), XH(0.2), ...capEdge(0.07, 0.2)], { color: DARK }),
    piece('軸の端', [...prismX(0.035, 8, 22.5), XL(0.19), XH(0.212)], { color: DARK }),
  ],
};
