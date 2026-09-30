// 脚の台：股関節を外から受ける部品（暗い色）。原点は股関節の中心（+x 側）。太ももの柱の外（x ≥ 0.095、領域 B）だけにあり、
// 上は腰の帯の下に入る。外に軸受の 12 角の蓋（縁を斜めに落とす）と小さな軸の端。
// 種類：卵を縦に割った形・角を落とした箱（外の面が反る）・大きな円盤（上の支えで帯につながる）
import { P, XH, XL, YH, YL, ZH, ZL, prismX, ellipsoid, piece, DARK, MAIN } from '../../xsasm-lib.js';
import { crown, steps } from './shape.js';

const D = Math.PI / 180;
/** 横の n 角の蓋の外の縁を落とす面：x = x1 の所で半径 a から、外へ向かって 45° に細る */
const capEdge = (a, x1, n = 12, th0 = 15) => Array.from({ length: n }, (_, k) => { const t = (th0 + k * 360 / n) * D; return P([1, Math.sin(t), Math.cos(t)], [x1 - 0.012, a * Math.sin(t), a * Math.cos(t)]); });
const cap = (x0, r = 0.07) => [
  piece('軸受', [...prismX(r, 12, 15), XL(x0), XH(x0 + 0.03), ...capEdge(r, x0 + 0.03)], { color: DARK }),
  piece('軸の端', [...prismX(r / 2, 8, 22.5), XL(x0 + 0.02), XH(x0 + 0.042)], { color: DARK }),
];
export default [
  { id: 'hipbase', name: '脚の台', cat: '脚の台', size: [0.12, 0.34, 0.32],
    pieces: [piece('台', [...ellipsoid([0.09, 0.17, 0.16], [0.1, 0.03, 0], 12, [-60, -30, 0, 30, 60]), XL(0.095)], { color: DARK }), ...cap(0.17)] },
  { id: 'hipbasebox', name: '脚の台（箱）', cat: '脚の台', size: [0.12, 0.34, 0.28],
    pieces: [piece('台', [...crown('x', 1, (y, z) => 0.2 - 1.2 * z * z - 0.6 * (y - 0.04) ** 2, steps(-0.13, 0.2, 3), steps(-0.13, 0.13, 3)),
      XL(0.095), YL(-0.13), YH(0.2), ZL(-0.13), ZH(0.13), P([1, 0, 1], [0.185, 0, 0.1]), P([1, 0, -1], [0.185, 0, -0.1]), P([1, -1, 0], [0.18, -0.1, 0]), P([0, -1, 0.6], [0, -0.13, 0.1]), P([0, -1, -0.6], [0, -0.13, -0.1])], { color: MAIN }),
      ...cap(0.19, 0.06)] },
  { id: 'hipbasedisc', name: '脚の台（円盤）', cat: '脚の台', size: [0.12, 0.34, 0.3],
    pieces: [piece('台の支え', [XL(0.095), XH(0.15), YL(0.08), YH(0.2), ZL(-0.06), ZH(0.06), P([1, -1, 0], [0.14, 0.09, 0])], { color: DARK }),
      piece('円盤', [...prismX(0.14, 16, 11.25), XL(0.095), XH(0.14), ...capEdge(0.14, 0.15, 16, 11.25)]),
      piece('円盤の縁', [...prismX(0.15, 16, 11.25), XL(0.1), XH(0.12)], { color: DARK }), ...cap(0.135, 0.075)] },
];
