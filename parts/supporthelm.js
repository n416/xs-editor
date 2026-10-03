// ゴーグルの頭（支援用）：中くらいの卵形のドーム。目の高さに、前へ張り出す暗いゴーグルの枠と、左右 2 つの四角い光るレンズ。
// 左右の耳に丸い円盤（通信機の覆い）、頭頂の後ろ寄りに、短い柱に載った低い円盤（レドーム。八角、上の面は縁へ下がる）。
// あごは前下へすぼまる塊、後頭に首すじへ下りる装甲。広い面はどれも傾けてある。頭の中心が原点付近、前が +z
import { YH, YL, ZH, ZL, XH, XL, ellipsoid, planesFromPoints, prismX, BLACK, DARK, GLOW, piece, pair } from '../xsasm-lib.js';

const C = [0, 0.036, -0.006];
const R = [0.09, 0.09, 0.13];
const ME = [0, 36, 72, 108, 144, 180, 216, 252, 288, 324];
const VT = 0.046, VB = 0.006, TOP = C[1] + R[1];
const lr = pts => pts.flatMap(([x, y, z]) => (x === 0 ? [[0, y, z]] : [[-x, y, z], [x, y, z]]));
/** 軸が上下（y）の八角の台：中心 (cx, cz)、下の端 y0 で半径 r0、上の端 y1 で半径 r1 */
const octY = (cx, cz, y0, r0, y1, r1, extra = []) => { const pts = []; for (let i = 0; i < 8; i++) { const t = (22.5 + i * 45) * Math.PI / 180; pts.push([cx + r0 * Math.sin(t), y0, cz + r0 * Math.cos(t)], [cx + r1 * Math.sin(t), y1, cz + r1 * Math.cos(t)]); } return planesFromPoints([...pts, ...extra], 1e-5); };

const goggle = planesFromPoints(lr([[0.074, VT, 0.07], [0.078, VB, 0.07], [0.066, VT - 0.002, 0.128], [0.068, VB + 0.004, 0.124], [0, VT + 0.004, 0.14], [0, VB + 0.002, 0.134]]));
const lens = planesFromPoints([[0.012, VT - 0.01, 0.139], [0.056, VT - 0.012, 0.131], [0.012, VB + 0.012, 0.136], [0.054, VB + 0.012, 0.128],
  [0.012, VT - 0.01, 0.12], [0.056, VT - 0.012, 0.12], [0.012, VB + 0.012, 0.12], [0.054, VB + 0.012, 0.12]]);
const jaw = planesFromPoints(lr([[0.06, VB, 0.112], [0.022, -0.066, 0.1], [0, VB - 0.01, 0.13], [0, -0.056, 0.118], [0.066, VB, 0.02], [0.034, -0.062, 0.02]]));
const nape = planesFromPoints(lr([[0.056, 0.06, -0.128], [0.064, -0.045, -0.136], [0.07, 0.05, -0.085], [0.074, -0.045, -0.09], [0, 0.01, -0.154]]));

const supporthelm = {
  id: 'supporthelm', name: 'ゴーグルの頭（耳の円盤と頭頂のレドーム）', cat: '頭蓋', size: [0.23, 0.26, 0.3],
  face: { eye: [0.026, 0.12], mouth: [-0.03, 0.116, 14], under: [-0.05, 0], brow: [0.06, 0.124], lift: 0.016 },
  pieces: [
    piece('頭蓋', [...ellipsoid(R, C, 10, [6, 30, 54, 76], 0, ME), YL(VT - 0.004)]),
    piece('ゴーグルの枠', goggle, { color: DARK }),
    ...pair('レンズ', lens, { color: GLOW, glow: true, metal: 0, rough: 0.3 }),
    piece('ほほ', [...ellipsoid(R, C, 10, [-10, -36], 0, [-108, -72, -36, 0, 36, 72, 108]), YH(VT), YL(-0.05), ZL(-0.03), ZH(0.1)]),
    piece('あご', jaw),
    piece('後頭', [...ellipsoid(R, C, 10, [-10, -36], 0, [72, 108, 144, 180, 216, 252, 288]), YH(VT), YL(-0.05), ZH(0.0)]),
    piece('後頭の装甲', nape, { color: DARK }),
    ...pair('耳の円盤', [...prismX(0.046, 10, 18, 0.03, -0.012), XL(0.078), XH(0.104)], { color: DARK }),
    ...pair('耳の円盤の芯', [...prismX(0.02, 8, 22.5, 0.03, -0.012), XL(0.1), XH(0.112)]),
    piece('レドームの柱', octY(0, -0.04, TOP - 0.03, 0.024, TOP + 0.016, 0.018), { color: DARK }),
    piece('レドーム', octY(0, -0.04, TOP + 0.012, 0.08, TOP + 0.03, 0.07, [[0, TOP + 0.04, -0.04], [0, TOP + 0.006, -0.04]])),
  ],
};
const supporthelmplain = { ...supporthelm, id: 'supporthelmplain', name: 'ゴーグルの頭（耳の円盤と頭頂のレドーム・目なし）', pieces: supporthelm.pieces.filter(pc => !pc.name.startsWith('レンズ')) };
export default [supporthelm, supporthelmplain];
