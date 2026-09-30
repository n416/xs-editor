// 後ろへ回る頬当て（ヘッドホン型）：目の脇の厚い頬のブロックから、耳の高さで頭の横と後ろを回り込む帯。
// 上から見ると前が開いた U 字（頭の卵形に沿った楕円）で、板を扇形に並べた多面体の輪。上は少し内へ傾き（頭蓋に沿う）、
// 下の外の角を落とす。前の端は頬のブロック（前面は少し外へ向く、下前の角を落とす）。
// 座標は頭の中心が原点、y 0 が帯の中心の高さ、前が +z。attach は頭の殻の座標での置き場所（目の少し下）
import { P, XH, XL, YH, YL, ZH, ZL, piece, mir, MAIN } from '../xsasm-lib.js';

const D = Math.PI / 180;
/** 帯を作る：rx・rz 楕円の内側の半径、t 厚み、h 高さ（±h/2）、lean 上が内へ傾く角（度）、th0..th1 の範囲を n 枚 */
export function headband({ id = 'headband', name = '後ろへ回る頬当て（ヘッドホン型）', rx = 0.098, rz = 0.122, t = 0.02, h = 0.062, lean = 8, th0 = 72, th1 = 288, n = 7, cheek = true } = {}) {
  const pt = th => [rx * Math.sin(th * D), 0, rz * Math.cos(th * D)];
  const nrm = th => { const v = [Math.sin(th * D) / rx, 0, Math.cos(th * D) / rz]; const l = Math.hypot(v[0], v[2]); return [v[0] / l, 0, v[2] / l]; };
  const tl = Math.tan(lean * D);
  const pieces = [];
  for (let i = 0; i < n; i++) {
    const a = th0 + (th1 - th0) * i / n, b = th0 + (th1 - th0) * (i + 1) / n, c = (a + b) / 2;
    const d = nrm(c), p = pt(c), pa = pt(a), pb = pt(b);
    const nOut = [d[0], tl, d[2]], nIn = [-d[0], -tl, -d[2]];                    // 上が内へ傾く
    const cutA = [pa[2], 0, -pa[0]], cutB = [-pb[2], 0, pb[0]];                    // 扇の両端：中心と楕円上の点を通る縦の面
    const sA = cutA[0] * p[0] + cutA[2] * p[2] > 0 ? -1 : 1, sB = cutB[0] * p[0] + cutB[2] * p[2] > 0 ? -1 : 1;
    pieces.push(piece(`帯 ${i + 1}`, [
      P(nOut, [p[0] + d[0] * t, 0, p[2] + d[2] * t]), P(nIn, p),
      P(cutA.map(v => v * sA), [0, 0, 0]), P(cutB.map(v => v * sB), [0, 0, 0]),
      YH(h / 2), YL(-h / 2),
      P([d[0], -1.3, d[2]], [p[0] + d[0] * (t - 0.006), -h / 2 + 0.004, p[2] + d[2] * (t - 0.006)]),   // 下の外の角を落とす
    ]));
  }
  if (cheek) {
    // 頬のブロック（右）：目の脇。前面は外へ向かって少し後ろへ、外の前の角と下前の角、上の外の角を落とす。帯の前の端に重なる
    const R = [XL(0.056), XH(rx + t - 0.004), YL(-h / 2 - 0.004), YH(h / 2), ZL(0.0), ZH(0.095),
      P([0.3, 0, 1], [0.1, 0, 0.088]), P([1, 0, 0.45], [rx + t - 0.004, 0, 0.05]), P([0, -1, 1], [0, -h / 2 - 0.004, 0.075]), P([0.6, 1, 0], [rx + t - 0.004, h / 2, 0])];
    pieces.push(piece('頬（右）', R), piece('頬（左）', R.map(mir)));
  }
  return { id, name, cat: '飾り', size: [2 * (rx + t), h, rz + t + 0.095], attach: [0, 0.006, 0.0], pieces };
}

export default [
  headband(),
  headband({ id: 'headbandthin', name: '後ろへ回る帯（細い）', t: 0.014, h: 0.04, lean: 6, th0: 80, th1: 280, n: 6, cheek: false }),
];
