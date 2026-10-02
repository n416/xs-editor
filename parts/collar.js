// 首当て（襟）：首のまわりを後ろから包み、頭の後ろまで立ち上がる襟。上から見ると前が開いた U 字で、板を扇形に並べた
// 多面体の輪。後ろがいちばん高く、前の端へ向かって低くなる。上へ向かって外へ開く（漏斗のように）。上の縁の外側は少し落とす。
// 足元に薄いつば。座標は首の中心が原点、y 0 がつばの上面（襟の底）、前が +z。attach は頭の殻の座標での置き場所
import { P, YH, YL, piece, planesFromPoints, MAIN, DARK } from '../xsasm-lib.js';

const D = Math.PI / 180;
const dir = th => [Math.sin(th * D), 0, Math.cos(th * D)];          // 角 th（度、0 が前）の水平の向き
const tan = th => [Math.cos(th * D), 0, -Math.sin(th * D)];         // その接線（th が増える向き）
/** 襟を作る：r 内側の半径、t 板の厚み、flare 外へ開く角（度）、th0..th1 の範囲を n 枚、高さは h(th) */
export function collar({ id = 'collar', name = '首当て（襟）', r = 0.105, t = 0.012, flare = 12, th0 = 68, th1 = 292, n = 7, hBack = 0.13, hEnd = 0.045 } = {}) {
  const h = th => hEnd + (hBack - hEnd) * Math.pow((1 - Math.cos(th * D)) / 2, 1.3);
  const tf = Math.tan(flare * D);
  const pieces = [];
  for (let i = 0; i < n; i++) {
    const a = th0 + (th1 - th0) * i / n, b = th0 + (th1 - th0) * (i + 1) / n, c = (a + b) / 2;
    const d = dir(c), tc = tan(c);
    const nOut = [d[0], -tf, d[2]], nIn = [-d[0], tf, -d[2]];
    // 上の縁：中央の高さ h(c) で、接線の向きに h(b) − h(a) の傾き
    const s = (h(b) - h(a)) / (r * (b - a) * D);
    const along = [tc[0] + 0, s, tc[2]];                              // 上の縁の向き（接線 + 傾き）
    const radial = [d[0], tf, d[2]];                                  // 板に沿った外向き（開きの分だけ上へ）
    let nTop = [along[1] * radial[2] - along[2] * radial[1], along[2] * radial[0] - along[0] * radial[2], along[0] * radial[1] - along[1] * radial[0]];
    if (nTop[1] < 0) nTop = nTop.map(v => -v);
    const top = [r * d[0], h(c), r * d[2]];
    const ta = tan(a), tb = tan(b);
    const plate = [
      P(nOut, [(r + t) * d[0], 0, (r + t) * d[2]]),                     // 外の面（上へ向かって外へ）
      P(nIn, [r * d[0], 0, r * d[2]]),                                  // 内の面
      P([-ta[0], 0, -ta[2]], [0, 0, 0]), P([tb[0], 0, tb[2]], [0, 0, 0]),   // 扇の両端（中心を通る縦の面）
      YL(0), P(nTop, top),
      P([nOut[0] + nTop[0] * 1.2, nOut[1] + nTop[1] * 1.2, nOut[2] + nTop[2] * 1.2], [(r + t - 0.005) * d[0] + 0, h(c) - 0.004, (r + t - 0.005) * d[2]]),   // 上の外の角を落とす
    ];
    pieces.push(piece(`襟 ${i + 1}`, plate));
    // 足元のつば：薄い扇形
    pieces.push(piece(`つば ${i + 1}`, [P([d[0], 0, d[2]], [(r + t + 0.018) * d[0], 0, (r + t + 0.018) * d[2]]), P([-d[0], 0, -d[2]], [(r - 0.004) * d[0], 0, (r - 0.004) * d[2]]),
      P([-ta[0], 0, -ta[2]], [0, 0, 0]), P([tb[0], 0, tb[2]], [0, 0, 0]), YL(-0.01), YH(0.0), P([d[0], -1.2, d[2]], [(r + t + 0.018) * d[0], -0.004, (r + t + 0.018) * d[2]])], { color: DARK }));
  }
  // 広い襟は、頭の殻の後ろに届かない（1 cm 離れて、どこにもつながっていなかった）。後ろの真ん中に、襟の内の面（上ほど外へ開く）から頭の殻の中へ入る暗い付け根を足す
  if (r > 0.11) pieces.push(piece('襟の付け根', planesFromPoints([-1, 1].flatMap(sx => [[sx * 0.03, 0.08, -(r + 0.08 * tf + 0.005)], [sx * 0.03, 0.135, -(r + 0.135 * tf + 0.005)], [sx * 0.018, 0.088, -0.06], [sx * 0.018, 0.14, -0.06]])), { color: DARK }));
  return { id, name, cat: '首当て', size: [2 * (r + t + 0.018), hBack + 0.01, 2 * (r + t + 0.018)], attach: [0, -0.09, -0.02], pieces };
}

export default [
  collar(),
  collar({ id: 'collarlow', name: '首当て（低い襟）', hBack: 0.08, hEnd: 0.035, flare: 8, r: 0.1 }),
  collar({ id: 'collarwide', name: '首当て（広い襟）', r: 0.12, t: 0.014, flare: 18, th0: 80, th1: 280, n: 6, hBack: 0.15, hEnd: 0.05 }),
];
