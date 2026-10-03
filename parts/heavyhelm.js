// 重装の頭：低く幅の広いドーム。額に厚いひさしが前から横へ回り、その下に横長のバイザーの溝（奥に暗い壁と光る帯）。
// 横と後ろは、ドームの縁の下から外へ広がって下りる 2 段の重ね板（錣）が首を守る。下の段は上の段の裾の裏へ、同じ傾きで入る。
// 顔は太いあご：中央の稜と左右の頬の塊、その間に奥まった通気口。広い面はどれも傾けてある（垂直・水平の面を作らない）。
// 頭の中心が原点付近、前が +z。headshell より幅が広く（±0.11）、高さが低い（頂 0.104）
import { P, XH, XL, YH, YL, ZH, ZL, both, ellipsoid, planesFromPoints, BLACK, DARK, GLOW, piece, pair } from '../xsasm-lib.js';

const C = [0, 0.026, -0.012];                                               // ドームの中心
const R = [0.104, 0.07, 0.136];                                              // ドームの半径（幅・高さ・奥行き）
const ME = [0, 32, 66, 100, 140, 180, 220, 260, 294, 328];                       // 経線（度、0 が前。正面に面）
const BROW_T = 0.046, BROW_B = 0.022, VT = 0.022, VB = 0.002;               // ひさしの上端・下端、溝の上端・下端
const TAN = th => [Math.sin(th * Math.PI / 180), Math.cos(th * Math.PI / 180)];
/** 角度 th（度、0 が前）の、半径の倍率 k の水平の楕円の上の点（高さ y） */
const ring = (th, k, y) => { const [s, c] = TAN(th); return [R[0] * k * s, y, R[2] * k * c + C[2]]; };
/** 厚みのある板：外側の 4 隅（上の 2 点・下の 2 点）と、内へ t だけ入った 4 隅を包む凸の塊 */
function plate(a, b, c, d, t) {
  const pts = [a, b, c, d];
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
  let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const m = [(a[0] + c[0]) / 2, 0, (a[2] + c[2]) / 2 - C[2]];
  if (n[0] * m[0] + n[2] * m[2] < 0) n = n.map(x => -x);                     // 外向きにそろえる
  const l = Math.hypot(...n); n = n.map(x => x / l);
  return planesFromPoints([...pts, ...pts.map(p => [p[0] - n[0] * t, p[1] - n[1] * t, p[2] - n[2] * t])]);
}
// 錣：右側の板を、角度の区切りごとに 1 枚ずつ（左は鏡像）。後ろの 180° の板は中心をまたぐので 1 枚
const CUTS = [72, 104, 134, 160];
const tier = (top, bot, kt, kb, t) => {
  const out = [];
  for (let i = 0; i + 1 < CUTS.length; i++) {
    const [t0, t1] = [CUTS[i], CUTS[i + 1]];
    out.push(plate(ring(t0, kt, top), ring(t1, kt, top), ring(t1, kb, bot), ring(t0, kb, bot), t));
  }
  return out;
};
const backPlate = (top, bot, kt, kb, t) => plate(ring(160, kt, top), ring(200, kt, top), ring(200, kb, bot), ring(160, kb, bot), t);
const UPPER = [0.032, -0.012, 0.98, 1.2], LOWER = [0.002, -0.044, 1.1, 1.32];   // 上の段・下の段：[上端の高さ, 裾の高さ, 上端の半径の倍率, 裾の倍率]
const inset = d => [R[0] - d, R[1], R[2] - d];
const GROOVE = [-95, -60, -30, 0, 30, 60, 95];                              // 溝は前から横まで回り込む

// あご：中央の稜・頬の塊・通気口（頬と稜の間で奥まる）
const jawCenter = planesFromPoints([[-0.024, VB, 0.122], [0.024, VB, 0.122], [-0.02, -0.062, 0.118], [0.02, -0.062, 0.118],
  [-0.024, VB, 0.05], [0.024, VB, 0.05], [-0.016, -0.066, 0.05], [0.016, -0.066, 0.05], [0, -0.03, 0.136]]);
const cheek = planesFromPoints([[0.036, VB, 0.116], [0.08, VB, 0.09], [0.034, -0.058, 0.104], [0.07, -0.05, 0.078],
  [0.036, VB, 0.02], [0.092, VB, 0.02], [0.034, -0.06, 0.02], [0.076, -0.05, 0.02]]);
const vent = planesFromPoints([[0.02, -0.004, 0.11], [0.038, -0.004, 0.106], [0.02, -0.058, 0.1], [0.036, -0.056, 0.096],
  [0.02, -0.004, 0.04], [0.038, -0.004, 0.04], [0.02, -0.058, 0.04], [0.036, -0.056, 0.04]]);

// 頂の稜：額から後ろへ、ドームの上を通る低い稜（頂の点に面が集まる形を崩す）。中心線の上の点を、ドームの面より少し上に並べて包む
const ridgePts = [];
for (const z of [0.1, 0.06, 0.02, -0.02, -0.06, -0.1, -0.13]) {
  const y = C[1] + R[1] * Math.sqrt(Math.max(0, 1 - ((z - C[2]) / R[2]) ** 2));
  ridgePts.push([-0.016, y + 0.004, z], [0.016, y + 0.004, z], [-0.008, y + 0.016, z], [0.008, y + 0.016, z], [-0.02, y - 0.03, z], [0.02, y - 0.03, z]);
}
const ridge = planesFromPoints(ridgePts, 1e-5);

const heavyhelm = {
  id: 'heavyhelm', name: '重装の頭（低いドームと錣）', cat: '頭蓋', size: [0.26, 0.18, 0.3],
  face: { eye: [0.012, 0.118], mouth: [-0.034, 0.12, 15], under: [-0.05, 0], brow: [0.048, 0.138], lift: 0.02 },   // 目は溝の奥の壁、口もとはあごの稜の前面
  pieces: [
    piece('ドーム', [...ellipsoid(R, C, 9, [14, 40, 64], 0, ME), YL(BROW_T - 0.004)]),                          // ひさしより上
    piece('頂の稜', ridge, { color: DARK }),
    piece('ひさし', planesFromPoints([[-0.098, BROW_T, 0.04], [0.098, BROW_T, 0.04], [-0.06, BROW_T - 0.006, 0.142], [0.06, BROW_T - 0.006, 0.142],
      [0, BROW_T - 0.002, 0.15], [-0.104, BROW_B, 0.03], [0.104, BROW_B, 0.03], [-0.062, BROW_B + 0.004, 0.13], [0.062, BROW_B + 0.004, 0.13],
      [-0.104, BROW_T - 0.004, -0.02], [0.104, BROW_T - 0.004, -0.02], [-0.104, BROW_B, -0.02], [0.104, BROW_B, -0.02]]), { color: DARK }),   // 前へ張り出す庇：上面は前へ下がり、上から見て台形
    piece('後頭', [...ellipsoid(R, C, 9, [-30, 0], 0, [70, 110, 150, 180, 210, 250, 290]), YH(BROW_T - 0.002), YL(-0.05), ZH(0.03)]),   // 溝の後ろ：首へ下りる
    piece('溝の奥', [...ellipsoid(inset(0.024), C, 9, [0], 0, GROOVE), YH(VT + 0.002), YL(VB - 0.002), ZL(-0.03)], { color: BLACK }),
    piece('目の帯', [...ellipsoid(inset(0.015), C, 9, [0], 0, GROOVE), YH(0.015), YL(0.008), ZL(-0.02)],
      { color: GLOW, glow: true, metal: 0, rough: 0.3 }),
    piece('あごの稜', jawCenter),
    ...pair('頬', cheek),
    ...pair('通気口', vent, { color: BLACK }),
    ...tier(...UPPER, 0.012).flatMap((pl, i) => pair(`錣・上の段 ${i + 1}`, pl)),
    piece('錣・上の段 後ろ', backPlate(...UPPER, 0.012)),
    ...tier(...LOWER, 0.011).flatMap((pl, i) => pair(`錣・下の段 ${i + 1}`, pl, { color: DARK })),
    piece('錣・下の段 後ろ', backPlate(...LOWER, 0.011), { color: DARK }),
  ],
};

// 重装の頭（目なし）：溝の奥の光る帯を外したもの。目は別の部品を入れる
const heavyhelmplain = { ...heavyhelm, id: 'heavyhelmplain', name: '重装の頭（低いドームと錣・目なし）', face: { ...heavyhelm.face, eye: [0.012, 0.11] },
  pieces: heavyhelm.pieces.filter(pc => pc.name !== '目の帯') };

export default [heavyhelm, heavyhelmplain];
