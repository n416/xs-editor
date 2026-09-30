// 胸の飾り（胴の骨 torso）。原点は胸の下端の中心（y 2.1）。大きさは標準の胸（chest.js の「胸」）に合わせてある。ほかの胸では動かして合わせる。
//   通気口（左右）：胸の装甲の上の外寄りに付く枠。枠の中は本当にくぼみ、奥の黒い壁の前に斜めの羽根板が並ぶ
//   ハッチ：胸の装甲の V 字の下、腹の板の上の中央の台形の板
//   動力パイプ（左右）：胸の装甲の下の外の角から、脇の下を回って背中の板へ（腰の動力パイプと同じ蛇腹の管）
import { planesFromPoints, piece, DARK, BLACK, ACCENT } from '../../xsasm-lib.js';
import { bellows, fitting } from '../pipe.js';

const hull = (name, pts, o = {}) => piece(name, planesFromPoints(pts), o);
/** 通気口（+x 側）：外の枠の 4 辺、奥の黒い壁、羽根板 n 枚。枠の前の面は z0、胸の面へ奥行き dep。面は前へ少し下を向く（胸の装甲に沿う） */
function vent(side, x0, x1, y0, y1, z0, n) {
  const s = side, dep = 0.035, tilt = 0.25, Z = y => z0 - tilt * (y - (y0 + y1) / 2), fw = 0.014;
  const box = (name, a0, a1, b0, b1, front, back, o) => {
    const pts = [];
    for (const x of [a0, a1]) for (const y of [b0, b1]) for (const dz of [front, back]) pts.push([s * x, y, Z(y) - dz]);
    return hull(name, pts, o);
  };
  const t = s > 0 ? '+x' : '−x';
  const out = [box(`通気口の枠（上・${t}）`, x0, x1, y1 - fw, y1, 0, dep), box(`通気口の枠（下・${t}）`, x0, x1, y0, y0 + fw, 0, dep),
    box(`通気口の枠（内・${t}）`, x0, x0 + fw, y0, y1, 0, dep), box(`通気口の枠（外・${t}）`, x1 - fw, x1, y0, y1, 0, dep),
    box(`通気口の奥（${t}）`, x0 + 0.005, x1 - 0.005, y0 + 0.005, y1 - 0.005, dep - 0.008, dep, { color: BLACK })];
  const h = (y1 - y0 - 2 * fw) / n;
  for (let k = 0; k < n; k++) {
    const yb = y0 + fw + k * h;   // 羽根板：前が下がった斜めの板
    const pts = [];
    for (const x of [x0 + fw - 0.002, x1 - fw + 0.002]) pts.push([s * x, yb + h * 0.75, Z(yb) - 0.006], [s * x, yb + h * 0.4, Z(yb) - 0.006], [s * x, yb + h * 0.55, Z(yb) - dep + 0.008], [s * x, yb + h * 0.9, Z(yb) - dep + 0.008]);
    out.push(hull(`通気口の羽根 ${k + 1}（${t}）`, pts, { color: DARK }));
  }
  return out;
}
/** 胸の動力パイプ（+x 側）の道筋：前の下の外の角 → 横の外 → 背中 */
const pipePath = n => Array.from({ length: n + 1 }, (_, i) => {
  // 前（a 0）から後ろ（a ≈ π）へ、体の横を下へたわみながら回る。横でも x 0.34 より内（腕を前後に回すと肩アーマーの内の端が x 0.38 の外を通る）
  const t = i / n, a = Math.PI * 0.95 * t;
  return [0.2 + 0.105 * Math.sin(a), 0.265 - 0.07 * Math.sin(a), 0.21 * Math.cos(a) - 0.01];
});
const pipes = (rr, rc, n) => [1, -1].flatMap(s => {
  const p = pipePath(n).map(q => [s * q[0], q[1], q[2]]), t = s > 0 ? '+x' : '−x';
  return [...bellows(p, `胸の動力パイプ（${t}）`, rr, rc),
    fitting(p[0], `胸の動力パイプの受け（前・${t}）`, rr * 0.9, [s * 0.1, p[0][1], 0.1], 0.35),
    fitting(p[n], `胸の動力パイプの受け（後ろ・${t}）`, rr * 0.9, [s * 0.1, p[n][1], -0.1], 0.35)];
});
export default [
  { id: 'chestvent', name: '胸の通気口（左右）', cat: '胸の飾り', size: [0.5, 0.12, 0.1],
    pieces: [...vent(1, 0.13, 0.26, 0.4, 0.51, 0.245, 3), ...vent(-1, 0.13, 0.26, 0.4, 0.51, 0.245, 3)] },
  { id: 'chestventlong', name: '胸の通気口（細長い・左右）', cat: '胸の飾り', size: [0.5, 0.08, 0.1],
    pieces: [...vent(1, 0.07, 0.27, 0.45, 0.515, 0.25, 2), ...vent(-1, 0.07, 0.27, 0.45, 0.515, 0.25, 2)] },
  { id: 'chesthatch', name: '胸のハッチ', cat: '胸の飾り', size: [0.2, 0.12, 0.1],
    pieces: [hull('胸のハッチ', [...[1, -1].flatMap(s => [[s * 0.085, 0.265, 0.255], [s * 0.06, 0.17, 0.235], [s * 0.1, 0.27, 0.23], [s * 0.075, 0.16, 0.21], [s * 0.1, 0.27, 0.16], [s * 0.075, 0.16, 0.15]])]),
      hull('ハッチの取っ手', [...[1, -1].flatMap(s => [[s * 0.03, 0.225, 0.262], [s * 0.03, 0.205, 0.258], [s * 0.035, 0.228, 0.245], [s * 0.035, 0.202, 0.241]])], { color: ACCENT })] },
  { id: 'chestpipe', name: '胸の動力パイプ（左右）', cat: '胸の飾り', size: [0.76, 0.12, 0.44], pieces: pipes(0.024, 0.018, 9) },
  { id: 'chestpipethick', name: '胸の動力パイプ（太い・左右）', cat: '胸の飾り', size: [0.8, 0.14, 0.46], pieces: pipes(0.034, 0.026, 7) },
];
