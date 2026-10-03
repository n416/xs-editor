// つばの頭（支援用）：丸いドームのまわりに、目の溝のすぐ上でぐるりと張り出す厚いつば（丸いレーダーの縁。外へ向かって少し下がる）。
// つばの下に、前から横へ回り込む溝（奥に暗い壁）と正面の光る一つ目。溝の下は丸いあごで、左右に丸い通信機の覆い。頭頂に低い八角の台。
// 広い面はどれも傾けてある。頭の中心が原点付近、前が +z
import { YH, YL, ZH, ZL, XH, XL, ellipsoid, planesFromPoints, prismX, BLACK, DARK, GLOW, piece, pair } from '../xsasm-lib.js';

const C = [0, 0.034, -0.004];
const R = [0.094, 0.092, 0.114];
const ME = Array.from({ length: 12 }, (_, i) => i * 30);
const VT = 0.036, VB = 0.01, TOP = C[1] + R[1];
const GROOVE = [-105, -75, -45, -15, 15, 45, 75, 105];
const ring = (th, k, y) => { const a = th * Math.PI / 180; return [R[0] * k * Math.sin(a), y, R[2] * k * Math.cos(a) + C[2]]; };
// つば：30° ごとの 12 枚の塊（内の縁はドームの中、外の縁は 1.42 倍の輪で少し下がる。厚み 0.018〜0.008）
const brim = Array.from({ length: 12 }, (_, i) => { const a0 = i * 30 - 15.5, a1 = i * 30 + 15.5; return planesFromPoints([a0, a1].flatMap(a => [ring(a, 0.9, VT + 0.02), ring(a, 0.9, VT), ring(a, 1.42, VT + 0.004), ring(a, 1.42, VT - 0.006)])); });
const octY = (cx, cz, y0, r0, y1, r1, extra = []) => { const pts = []; for (let i = 0; i < 8; i++) { const t = (22.5 + i * 45) * Math.PI / 180; pts.push([cx + r0 * Math.sin(t), y0, cz + r0 * Math.cos(t)], [cx + r1 * Math.sin(t), y1, cz + r1 * Math.cos(t)]); } return planesFromPoints([...pts, ...extra], 1e-5); };
const tubeZ = (cx, cy, r, z0, z1) => { const pts = []; for (let i = 0; i < 8; i++) { const t = (22.5 + i * 45) * Math.PI / 180; pts.push([cx + r * Math.cos(t), cy + r * Math.sin(t), z0], [cx + r * Math.cos(t), cy + r * Math.sin(t), z1]); } return planesFromPoints(pts, 1e-5); };

const brimhelm = {
  id: 'brimhelm', name: 'つばの頭（丸いつばと一つ目）', cat: '頭蓋', size: [0.28, 0.2, 0.34],
  face: { eye: [0.022, 0.092], mouth: [-0.03, 0.1, 20], under: [-0.05, 0], brow: [0.064, 0.1], lift: 0.02 },
  pieces: [
    piece('ドーム', [...ellipsoid(R, C, 12, [8, 28, 48, 68, 84], 0, ME), YL(VT)]),
    ...brim.map((pl, i) => piece(`つば ${i + 1}`, pl, { color: DARK })),
    piece('頭頂の台', octY(0, -0.01, TOP - 0.02, 0.04, TOP + 0.01, 0.028, [[0, TOP + 0.016, -0.01]]), { color: DARK }),
    piece('溝の奥', [...ellipsoid([R[0] - 0.02, R[1], R[2] - 0.02], C, 12, [0], 0, GROOVE), YH(VT + 0.002), YL(VB - 0.002), ZL(-0.04)], { color: BLACK }),
    piece('目', tubeZ(0, 0.022, 0.012, 0.07, 0.101), { color: GLOW, glow: true, metal: 0, rough: 0.3 }),
    piece('あご', [...ellipsoid(R, C, 12, [-12, -36], 0, [-90, -60, -30, 0, 30, 60, 90]), YH(VB), YL(-0.058), ZL(-0.02)]),
    piece('後頭', [...ellipsoid(R, C, 12, [-12, -36], 0, [90, 120, 150, 180, 210, 240, 270]), YH(VT + 0.002), YL(-0.05), ZH(0.0)]),
    ...pair('通信機の覆い', [...prismX(0.036, 10, 18, -0.012, -0.01), XL(0.08), XH(0.104)], { color: DARK }),
  ],
};
const brimhelmplain = { ...brimhelm, id: 'brimhelmplain', name: 'つばの頭（丸いつばと一つ目・目なし）', pieces: brimhelm.pieces.filter(pc => pc.name !== '目') };
export default [brimhelm, brimhelmplain];
