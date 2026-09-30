// 後ろ腰：腰の帯の後ろの装甲と、中央のお尻の板（どちらも動かない）。原点は腰の帯の下端の中心（y 1.77）。
// 後ろ腰の装甲は帯の高さ（領域 C）で幅いっぱい、後ろへ盛り上がる。お尻の板は左右の後ろスカート（skirtback）の間、
// 太ももの柱の内側 |x| ≤ 0.08（領域 A）だけを下へ伸ばす。
// 左右対称の暗い穴を 2 つ並べると、後ろから見て顔に見えるので置かない（スラスターは中央に 1 本だけ）。
// 種類：パネルと溝・張り出し（深い装甲に縦の背骨）・中央のスラスター（お尻の下へ向く大きな 1 本）
import { P, XH, XL, YH, YL, ZH, ZL, both, piece, DARK } from '../../xsasm-lib.js';
import { crown, steps } from './shape.js';

const armor = depth => (x, y) => depth - 0.8 * x * x - 1.2 * (y - 0.08) ** 2 - 0.2 * (y - 0.08);
const armorPiece = back => piece('後ろ腰の装甲', [...crown('z', -1, back, steps(-0.26, 0.26, 6), steps(0.002, 0.16, 3)),
  ZH(-0.16), YL(0.002), YH(0.16), ...both(P([1, 0, -0.4], [0.27, 0, -0.2]))]);
const butt = (bottom = -0.2) => piece('お尻の板', [...crown('z', -1, (x, y) => 0.215 - 3 * x * x + 0.1 * y - 0.3 * (y + 0.1) ** 2, steps(-0.075, 0.075, 4), steps(bottom, 0.03, 4)),
  ZH(-0.1), YH(0.03), YL(bottom), ...both(P([1, -0.12, 0], [0.08, 0.03, 0])), P([0, -1, -0.6], [0, bottom, -0.17])]);
const R = (id, name, pieces) => ({ id, name, cat: '後ろ腰', size: [0.56, 0.38, 0.14], pieces });

const back0 = armor(0.265), back1 = armor(0.31);
/** 下を向いたスラスター：中心 (cx, cz) の縦の 8 角の筒を y0〜y1 に。口（下）ほど広がる（上の半径 r） */
const nozzle = (cx, cz, y0, y1, r) => [YL(y0), YH(y1), ...Array.from({ length: 8 }, (_, k) => {
  const t = (22.5 + k * 45) * Math.PI / 180, sx = Math.sin(t), sz = Math.cos(t);
  return P([sx, 0.3, sz], [cx + r * sx, y1, cz + r * sz]);
})];
export default [
  R('skirtrear', '後ろ腰', [armorPiece(back0),
    piece('後ろ腰のパネル', [...crown('z', -1, (x, y) => back0(x, y) + 0.012, steps(-0.12, 0.12, 4), steps(0.03, 0.14, 2)),
      ZH(-0.2), YL(0.03), YH(0.14), ...both(P([1, 0, -0.6], [0.12, 0, -0.24]))]),
    piece('後ろ腰の溝', [...crown('z', -1, (x, y) => back0(x, y) + 0.004, steps(-0.24, 0.24, 6), [0.012]), ZH(-0.2), YL(0.006), YH(0.018), ...both(XH(0.24))], { color: DARK }),
    butt()]),
  R('skirtrearbulge', '後ろ腰（張り出し）', [armorPiece(back1),
    piece('後ろ腰の背骨', [...crown('z', -1, (x, y) => back1(x, y) + 0.02, steps(-0.03, 0.03, 2), steps(0.01, 0.16, 3)),
      ZH(-0.22), YL(0.01), YH(0.16), ...both(P([1, 0, -0.7], [0.03, 0, -0.3]))], { color: DARK }),
    ...[1, -1].map(s => piece(`後ろ腰の段（${s > 0 ? '+x' : '−x'}）`, [...crown('z', -1, (x, y) => back1(x, y) + 0.01, steps(s * 0.06, s * 0.2, 2), steps(0.04, 0.13, 2)),
      ZH(-0.22), YL(0.04), YH(0.13), s > 0 ? XL(0.06) : XH(-0.06), ...both(P([1, 0, -0.6], [0.2, 0, -0.27]))])),
    butt(-0.24)]),
  R('skirtrearthruster', '後ろ腰（中央のスラスター）', [armorPiece(back0),
    piece('後ろ腰の溝', [...crown('z', -1, (x, y) => back0(x, y) + 0.004, steps(-0.24, 0.24, 6), [0.012]), ZH(-0.2), YL(0.006), YH(0.018), ...both(XH(0.24))], { color: DARK }),
    butt(-0.1),
    piece('スラスターの台', [XL(-0.07), XH(0.07), YL(-0.12), YH(0.02), ZL(-0.26), ZH(-0.12), P([0, -1, -0.8], [0, -0.12, -0.22])], { color: DARK }),
    piece('スラスター', nozzle(0, -0.2, -0.21, -0.1, 0.045), { color: DARK })]),
];
