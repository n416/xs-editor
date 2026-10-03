// 丸い重装の頭：幅の広い丸いドーム。目の高さに、前から横へ回り込む一つ目用の溝（奥に暗い壁、正面に光る目）。
// 溝の下はドームの続きの丸いあごで、中央に前へ出る口先の筒（八角）、その左右に動力パイプの受け。
// 横と後ろは、溝の下から外へふくらんで下りる 1 段の丸い首の守り（板を細かく割って丸く見せる）。頂に低い丸いこぶ（センサー）。
// 広い面はどれも傾けてある。頭の中心が原点付近、前が +z。重装の頭（heavyhelm）と同じくらいの幅で、背は少し高い
import { P, XH, XL, YH, YL, ZH, ZL, ellipsoid, planesFromPoints, prismX, BLACK, DARK, GLOW, piece, pair } from '../xsasm-lib.js';

const C = [0, 0.03, -0.006];                                                // ドームの中心
const R = [0.106, 0.092, 0.126];                                            // ドームの半径（幅・高さ・奥行き）
const ME = Array.from({ length: 12 }, (_, i) => i * 30);                    // 経線 12 本（0 が前。正面に面）
const VT = 0.034, VB = 0.008;                                               // 溝の上端・下端
const GROOVE = [-105, -75, -45, -15, 15, 45, 75, 105];                      // 溝は前から横の後ろ寄りまで回り込む
const inset = d => [R[0] - d, R[1], R[2] - d];
const TAN = th => [Math.sin(th * Math.PI / 180), Math.cos(th * Math.PI / 180)];
const ring = (th, k, y) => { const [s, c] = TAN(th); return [R[0] * k * s, y, R[2] * k * c + C[2]]; };
/** 厚みのある板：外側の 4 隅と、内へ t だけ入った 4 隅を包む凸の塊 */
function plate(a, b, c, d, t) {
  const pts = [a, b, c, d];
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
  let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const m = [(a[0] + c[0]) / 2, 0, (a[2] + c[2]) / 2 - C[2]];
  if (n[0] * m[0] + n[2] * m[2] < 0) n = n.map(x => -x);
  const l = Math.hypot(...n); n = n.map(x => x / l);
  return planesFromPoints([...pts, ...pts.map(p => [p[0] - n[0] * t, p[1] - n[1] * t, p[2] - n[2] * t])]);
}
// 首の守り：上の帯（外へふくらむ）と下の帯（内へ戻る）の 2 枚で、横から見て丸い断面。角度の区切りを細かく
const CUTS = [78, 100, 122, 144, 166];
const band = (y0, y1, k0, k1) => {
  const out = [];
  for (let i = 0; i + 1 < CUTS.length; i++) out.push(plate(ring(CUTS[i], k0, y0), ring(CUTS[i + 1], k0, y0), ring(CUTS[i + 1], k1, y1), ring(CUTS[i], k1, y1), 0.014));
  return out;
};
const bandBack = (y0, y1, k0, k1) => plate(ring(166, k0, y0), ring(194, k0, y0), ring(194, k1, y1), ring(166, k1, y1), 0.014);
const G1 = [0.012, -0.03, 1.0, 1.2], G2 = [-0.03, -0.064, 1.2, 1.12];       // [上端の高さ, 下端の高さ, 上端の半径の倍率, 下端の倍率]

// 口先：横向きではなく前向きの八角の筒（軸は前後）。中心 (0, -0.03)、前へ 0.142 まで
const snout = (() => {
  const out = [];
  for (let k = 0; k < 8; k++) { const t = (22.5 + k * 45) * Math.PI / 180; out.push(P([Math.cos(t), Math.sin(t), 0.12], [0.03 * Math.cos(t), -0.03 + 0.026 * Math.sin(t), 0.1])); }   // 前へ少しすぼまる
  return [...out, ZH(0.142), ZL(0.06)];
})();
const snoutHole = (() => {
  const out = [];
  for (let k = 0; k < 8; k++) { const t = (22.5 + k * 45) * Math.PI / 180; out.push(P([Math.cos(t), Math.sin(t), 0], [0.017 * Math.cos(t), -0.03 + 0.015 * Math.sin(t), 0])); }
  return [...out, ZH(0.1435), ZL(0.12)];
})();
// 動力パイプの受け：口先の左右、斜め前下を向く短い八角の筒
const socket = planesFromPoints((() => {
  const pts = [];
  for (let k = 0; k < 8; k++) { const t = k * 45 * Math.PI / 180, r = 0.016; pts.push([0.058 + r * Math.cos(t), -0.036 + r * Math.sin(t), 0.108], [0.05 + r * Math.cos(t), -0.03 + r * Math.sin(t), 0.06]); }
  return pts;
})(), 1e-5);
// 頂のこぶ：前後に長い低い稜（センサーの覆い）。丸い台にしたら鍋ぶたのつまみに見えた
const bump = planesFromPoints((() => {
  const pts = [], top = C[1] + R[1];
  for (let k = 0; k < 8; k++) { const t = (22.5 + k * 45) * Math.PI / 180; pts.push([0.03 * Math.sin(t), top - 0.022, -0.005 + 0.085 * Math.cos(t)], [0.014 * Math.sin(t), top + 0.005, -0.01 + 0.06 * Math.cos(t)]); }
  return [...pts, [0, top + 0.009, -0.02]];
})(), 1e-5);

const roundhelm = {
  id: 'roundhelm', name: '丸い重装の頭（一つ目の溝と口先）', cat: '頭蓋', size: [0.26, 0.2, 0.3],
  face: { eye: [0.021, 0.098], mouth: [-0.03, 0.142, 0], under: [-0.05, 0], brow: [0.05, 0.112], lift: 0.02 },   // 目は溝の奥の壁、口もとは口先の前面
  pieces: [
    piece('ドーム', [...ellipsoid(R, C, 12, [8, 28, 48, 68, 84], 0, ME), YL(VT)]),                                      // 溝より上
    piece('頂のこぶ', bump, { color: DARK }),
    piece('溝の奥', [...ellipsoid(inset(0.022), C, 12, [0], 0, GROOVE), YH(VT + 0.002), YL(VB - 0.002), ZL(-0.05)], { color: BLACK }),
    piece('目', [...ellipsoid(inset(0.012), C, 12, [0], 0, [-15, 15]), YH(0.03), YL(0.012), XH(0.014), XL(-0.014), ZL(0.05),
      P([1, 1, 0], [0.014, 0.024, 0]), P([-1, 1, 0], [-0.014, 0.024, 0]), P([1, -1, 0], [0.014, 0.018, 0]), P([-1, -1, 0], [-0.014, 0.018, 0])],
    { color: GLOW, glow: true, metal: 0, rough: 0.3 }),                                                                 // 正面の一つ目（八角）
    piece('あご', [...ellipsoid(R, C, 12, [-12, -38], 0, [-90, -60, -30, 0, 30, 60, 90]), YH(VB), YL(-0.062), ZL(-0.02)]),   // 溝の下：ドームの続きで丸くすぼまる
    piece('後頭', [...ellipsoid(R, C, 12, [-12, -38], 0, [90, 120, 150, 180, 210, 240, 270]), YH(VT + 0.002), YL(-0.05), ZH(0.0)]),
    piece('口先', snout, { color: DARK }),
    piece('口先の穴', snoutHole, { color: BLACK }),
    ...pair('パイプの受け', socket, { color: DARK }),
    ...band(...G1).flatMap((pl, i) => pair(`首の守り・上 ${i + 1}`, pl)),
    piece('首の守り・上 後ろ', bandBack(...G1)),
    ...band(...G2).flatMap((pl, i) => pair(`首の守り・下 ${i + 1}`, pl, { color: DARK })),
    piece('首の守り・下 後ろ', bandBack(...G2), { color: DARK }),
  ],
};

// 丸い重装の頭（目なし）：正面の光る目を外したもの（溝の奥の暗い壁は残る）。目は別の部品（モノアイなど）を入れる
const roundhelmplain = { ...roundhelm, id: 'roundhelmplain', name: '丸い重装の頭（一つ目の溝と口先・目なし）',
  pieces: roundhelm.pieces.filter(pc => pc.name !== '目') };

export default [roundhelm, roundhelmplain];
