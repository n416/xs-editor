// すねの飾り（すねの骨 shin）。原点はひざの中心 K。
import { bellows, fitting } from '../pipe.js';

const SH = { bone: 'shin', pivot: 'none' };
const bez = (a, b, c, n) => Array.from({ length: n + 1 }, (_, i) => { const t = i / n, p = (1 - t) ** 2, q = 2 * t * (1 - t), r = t * t; return [0, 1, 2].map(k => p * a[k] + q * b[k] + r * c[k]); });
/** ひざの裏から後ろへ大きく回って、すねの裾へ下がる動力パイプ（当たり判定なし） */
function calfPipe(rr, n, out) {
  const path = bez([0.02, -0.27, -0.07], [0.03, -0.42, -0.07 - out], [0.03, -0.66, -0.17], n);
  return [...bellows(path, 'すねの動力パイプ', rr, rr * 0.76), fitting(path[0], '動力パイプの受け（上）', rr * 0.9, [0.02, -0.3, 0], 0.4), fitting(path[n], '動力パイプの受け（下）', rr * 0.9, [0.03, -0.66, 0], 0.4)]
    .map(pc => ({ ...pc, ...SH }));
}
export default [
  { id: 'shinpipe', name: 'すねの動力パイプ（ひざ裏から裾へ）', cat: 'すねの飾り', size: [0.08, 0.42, 0.3], pieces: calfPipe(0.028, 9, 0.3) },
  { id: 'shinpipethick', name: 'すねの動力パイプ（太い）', cat: 'すねの飾り', size: [0.1, 0.42, 0.34], pieces: calfPipe(0.036, 8, 0.34) },
];
