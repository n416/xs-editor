// 望遠の頭：小さめの丸いドーム（狙撃用）。目の高さに前から横へ回り込む溝、正面から頭頂を越えて後ろへ通る縦の溝（どちらも奥に暗い壁）。
// 溝の交わる正面に光る一つ目。頭の左（+x）に、前を向く太い望遠レンズの筒（八角。前の端に光るレンズ、後ろに細い尾筒）が、短い腕で付く。
// 溝の下は丸いあごで、左右に斜めの通気口。広い面はどれも傾けてある。頭の中心が原点付近、前が +z
import { P, XH, XL, YH, YL, ZH, ZL, ellipsoid, planesFromPoints, BLACK, DARK, GLOW, piece, pair } from '../xsasm-lib.js';

const C = [0, 0.034, -0.004];
const R = [0.09, 0.094, 0.112];
const ME = Array.from({ length: 12 }, (_, i) => i * 30);
const LATS = [8, 28, 48, 68, 84];
const VT = 0.036, VB = 0.01, SLOT = 0.013;                                  // 横の溝の上端・下端、縦の溝の半分の幅
const GROOVE = [-105, -75, -45, -15, 15, 45, 75, 105];
const inset = d => [R[0] - d, R[1] - d, R[2] - d];
/** 軸が前後（z）の八角の筒：中心 (cx, cy)、半径 r、z0〜z1。k は前の端の半径の倍率（1 でまっすぐ） */
const tubeZ = (cx, cy, r, z0, z1, k = 1) => { const pts = []; for (let i = 0; i < 8; i++) { const t = (22.5 + i * 45) * Math.PI / 180; pts.push([cx + r * Math.cos(t), cy + r * Math.sin(t), z0], [cx + r * k * Math.cos(t), cy + r * k * Math.sin(t), z1]); } return planesFromPoints(pts, 1e-5); };
const SX = 0.118, SY = 0.05;                                                // 望遠の筒の中心
const vent = planesFromPoints([[0.03, -0.006, 0.098], [0.056, -0.004, 0.086], [0.026, -0.036, 0.094], [0.048, -0.034, 0.082],
  [0.03, -0.006, 0.05], [0.056, -0.004, 0.05], [0.026, -0.036, 0.05], [0.048, -0.034, 0.05]]);

const scopehelm = {
  id: 'scopehelm', name: '望遠の頭（縦横の溝と横の望遠レンズ）', cat: '頭蓋', size: [0.3, 0.2, 0.26],
  face: { eye: [0.023, 0.09], mouth: [-0.03, 0.1, 20], under: [-0.05, 0], brow: [0.052, 0.1], lift: 0.02 },
  pieces: [
    ...pair('ドーム', [...ellipsoid(R, C, 12, LATS, 0, ME), YL(VT), XL(SLOT)]),                          // 縦の溝で左右に分かれる
    piece('縦の溝の奥', [...ellipsoid(inset(0.012), C, 12, LATS, 0, ME), YL(VT - 0.002), XH(SLOT + 0.002), XL(-SLOT - 0.002)], { color: BLACK }),
    piece('横の溝の奥', [...ellipsoid([R[0] - 0.02, R[1], R[2] - 0.02], C, 12, [0], 0, GROOVE), YH(VT + 0.002), YL(VB - 0.002), ZL(-0.04)], { color: BLACK }),
    piece('目', tubeZ(0, 0.023, 0.012, 0.07, 0.099), { color: GLOW, glow: true, metal: 0, rough: 0.3 }),
    piece('あご', [...ellipsoid(R, C, 12, [-12, -36], 0, [-90, -60, -30, 0, 30, 60, 90]), YH(VB), YL(-0.058), ZL(-0.02)]),
    piece('後頭', [...ellipsoid(R, C, 12, [-12, -36], 0, [90, 120, 150, 180, 210, 240, 270]), YH(VT + 0.002), YL(-0.05), ZH(0.0)]),
    ...pair('通気口', vent, { color: BLACK }),
    piece('望遠の腕', planesFromPoints([[0.07, SY + 0.016, 0.03], [0.07, SY - 0.02, 0.03], [0.07, SY + 0.016, -0.03], [0.07, SY - 0.02, -0.03],
      [SX - 0.01, SY + 0.012, 0.022], [SX - 0.01, SY - 0.014, 0.022], [SX - 0.01, SY + 0.012, -0.022], [SX - 0.01, SY - 0.014, -0.022]]), { color: DARK }),
    piece('望遠の筒', tubeZ(SX, SY, 0.03, -0.05, 0.1, 1.12), { color: DARK }),
    piece('望遠のレンズ', tubeZ(SX, SY, 0.025, 0.09, 0.103), { color: GLOW, glow: true, metal: 0, rough: 0.2 }),
    piece('望遠の尾筒', tubeZ(SX, SY, 0.018, -0.1, -0.045, 1.3)),
  ],
};
const scopehelmplain = { ...scopehelm, id: 'scopehelmplain', name: '望遠の頭（縦横の溝と横の望遠レンズ・目なし）', pieces: scopehelm.pieces.filter(pc => pc.name !== '目') };
export default [scopehelm, scopehelmplain];
