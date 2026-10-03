// すねの飾り（すねの骨 shin）。原点はひざの中心 K。
import { bellows, fitting } from '../pipe.js';
import { hull, cylX } from '../limb/kit.js';
import { wide } from './kit.js';
import { DARK } from '../../xsasm-lib.js';

const SH = { bone: 'shin', pivot: 'none' };
const bez = (a, b, c, n) => Array.from({ length: n + 1 }, (_, i) => { const t = i / n, p = (1 - t) ** 2, q = 2 * t * (1 - t), r = t * t; return [0, 1, 2].map(k => p * a[k] + q * b[k] + r * c[k]); });
/** ひざの裏から後ろへ大きく回って、すねの裾へ下がる動力パイプ（当たり判定なし） */
function calfPipe(rr, n, out) {
  const path = bez([0.02, -0.27, -0.07], [0.03, -0.42, -0.07 - out], [0.03, -0.66, -0.17], n);
  return [...bellows(path, 'すねの動力パイプ', rr, rr * 0.76), fitting(path[0], '動力パイプの受け（上）', rr * 0.9, [0.02, -0.3, 0], 0.4), fitting(path[n], '動力パイプの受け（下）', rr * 0.9, [0.03, -0.66, 0], 0.4)]
    .map(pc => ({ ...pc, ...SH }));
}
/** 足首の覆い：すねの裾（重装のすねの太い裾：幅 ±0.104、前 0.2、後ろ −0.255）の外を回る輪。前・後ろ・左右の 4 枚の板（下ほど外へ開く）と、
 *  左右の丸い軸の覆い。すねに付き、y −0.8 より上（足が足首で回っても当たらない約束）。細い裾のすねには届かない */
function ankleGuard() {
  const lr = pts => pts.flatMap(([x, y, z]) => [[-x, y, z], [x, y, z]]), Y0 = -0.735, Y1 = -0.8;
  const side = s => hull(`足首の覆い（${s > 0 ? '外' : '内'}）`, [[s * 0.1, Y0, -0.24], [s * 0.1, Y0, 0.19], [s * 0.1, Y1, -0.255], [s * 0.1, Y1, 0.205],
    [s * 0.115, Y0 - 0.004, -0.24], [s * 0.115, Y0 - 0.004, 0.19], [s * 0.121, Y1, -0.257], [s * 0.121, Y1, 0.207]], { color: DARK });
  return [
    hull('足首の覆い（前）', lr([[0.112, Y0, 0.178], [0.117, Y1, 0.198], [0.106, Y0 - 0.004, 0.212], [0.111, Y1, 0.234]]), { color: DARK }),
    hull('足首の覆い（後ろ）', lr([[0.112, Y0, -0.232], [0.117, Y1, -0.248], [0.106, Y0 - 0.004, -0.264], [0.111, Y1, -0.284]]), { color: DARK }),
    side(1), side(-1),
    cylX('足首の軸の覆い（外）', -0.768, -0.02, 0.04, 0.114, 0.134, 10, { color: DARK }), cylX('足首の軸の覆い（内）', -0.768, -0.02, 0.04, -0.134, -0.114, 10, { color: DARK }),
  ].map(pc => ({ ...wide(pc), ...SH }));
}
export default [
  { id: 'ankleguard', name: '足首の覆い（太い裾のすね用の輪）', cat: 'すねの飾り', size: [0.34, 0.08, 0.52], pieces: ankleGuard() },
  { id: 'shinpipe', name: 'すねの動力パイプ（ひざ裏から裾へ）', cat: 'すねの飾り', size: [0.08, 0.42, 0.3], pieces: calfPipe(0.028, 9, 0.3) },
  { id: 'shinpipethick', name: 'すねの動力パイプ（太い）', cat: 'すねの飾り', size: [0.1, 0.42, 0.34], pieces: calfPipe(0.036, 8, 0.34) },
];
