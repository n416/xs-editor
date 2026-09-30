// 襟（胴の骨 torso）：首の付け根を囲む輪。原点は胸の下端の中心（y 2.1）。首（頭の組み立ての部品、y 2.7・半径 0.06）は通す。
// 輪は首のまわりに短い板を扇形に並べた多面体（板どうしは少し重なる）。後ろほど高く、上ほど外へ開く。胸の上の面（y 0.555）に下を差し込む。
// 種類：立ち襟（前が開いた U 字）・低い輪（一周）・大きな襟（肩のほうへ広がる、前が開く）
import { planesFromPoints, piece, DARK } from '../../xsasm-lib.js';

const D = Math.PI / 180;
/** 扇形の輪。a0〜a1（度、0 が前、時計回りに後ろへ 180）を n 枚に。ri・ro 下の内と外の半径、flare 上での外への開き、y0 下、h(a) 上の高さ */
function ring(name, { a0, a1, n, ri, ro, flare, y0, h, cz = -0.01, color }) {
  const out = [], step = (a1 - a0) / n;
  for (let k = 0; k < n; k++) {
    const pts = [];
    for (const a of [a0 + k * step - 0.6, a0 + (k + 1) * step + 0.6]) {
      const t = a * D, sx = Math.sin(t), cz0 = Math.cos(t), top = h(a);
      for (const [r, y] of [[ri, y0], [ro, y0], [ri + flare, top], [ro + flare, top - 0.012]]) pts.push([r * sx, y, cz + r * cz0]);
    }
    out.push(piece(`${name} ${k + 1}`, planesFromPoints(pts), color ? { color } : {}));
  }
  return out;
}
const back = (lo, hi) => a => lo + (hi - lo) * (1 - Math.cos(a * D)) / 2;   // 前 lo・後ろ hi
export default [
  { id: 'collar', name: '襟（立ち襟）', cat: '襟', size: [0.34, 0.14, 0.34],
    pieces: ring('襟', { a0: 50, a1: 310, n: 16, ri: 0.085, ro: 0.118, flare: 0.03, y0: 0.53, h: back(0.62, 0.68) }) },
  { id: 'collarlow', name: '襟（低い輪）', cat: '襟', size: [0.32, 0.08, 0.32],
    pieces: ring('襟', { a0: 0, a1: 360, n: 20, ri: 0.08, ro: 0.115, flare: 0.008, y0: 0.53, h: () => 0.6, color: DARK }) },
  { id: 'collarwide', name: '襟（大きな襟）', cat: '襟', size: [0.46, 0.16, 0.42],
    pieces: [...ring('大きな襟', { a0: 60, a1: 300, n: 14, ri: 0.09, ro: 0.15, flare: 0.045, y0: 0.53, h: back(0.6, 0.69) }),
      ...ring('襟の内', { a0: 40, a1: 320, n: 14, ri: 0.075, ro: 0.1, flare: 0.005, y0: 0.52, h: () => 0.6, color: DARK })] },
];
