// 上半身の動力パイプ（腰・頭と同じ蛇腹の管、parts/pipe.js）。両端は暗い受けで、付ける相手の中へ差し込む。
//   胸から頭へ（胴の骨 torso、左右 1 組で 1 部品）：胸の上の前の角から、外へふくらみながら上って、頭の下の左右へ。頭は胴に対して回らないので、
//     胴に付けても動きで外れない。頭の形は頭の組み立てで変わるので、位置は動かして合わせる。原点は胸の下端の中心（y 2.1）
//   肩から腕へ（腕の骨 arm、左右の対）：肩関節の球の下の前から、上腕の前の外へ下る。腕と一緒に動くので、腕を振っても胸に当たらない。
//     原点は肩関節の中心（x ±0.45・y 2.5）、+x 側の 1 本
import { bellows, fitting } from '../pipe.js';

/** 2 次のベジェの点の列 */
const bez = (a, b, c, n) => Array.from({ length: n + 1 }, (_, i) => { const t = i / n, p = (1 - t) ** 2, q = 2 * t * (1 - t), r = t * t; return [0, 1, 2].map(k => p * a[k] + q * b[k] + r * c[k]); });
const mx = p => [-p[0], p[1], p[2]];

/** 胸から頭へ（左右） */
function chestToHead(rr, rc, n) {
  return [1, -1].flatMap(s => {
    const S = p => (s > 0 ? p : mx(p)), t = s > 0 ? '+x' : '−x';
    const path = bez(S([0.2, 0.53, 0.14]), S([0.26, 0.67, 0.21]), S([0.1, 0.7, 0.13]), n);
    return [...bellows(path, `胸から頭への動力パイプ（${t}）`, rr, rc),
      fitting(path[0], `胸から頭への動力パイプの受け（胸・${t}）`, rr * 0.9, S([0.15, 0.45, 0.06]), 0.4),
      fitting(path[n], `胸から頭への動力パイプの受け（頭・${t}）`, rr * 0.9, S([0.03, 0.7, 0.05]), 0.4)];
  });
}
/** 肩から腕へ（+x 側の 1 本、腕の骨） */
function shoulderToArm(rr, rc, n) {
  // 根元は球の前下の外寄り（球の内側寄りだと、腕を内へ振ったとき肩の軸受けに当たる）
  const path = bez([0.035, -0.09, 0.065], [0.07, -0.2, 0.15], [0.125, -0.3, 0.085], n);
  return [...bellows(path, '肩から腕への動力パイプ', rr, rc), fitting(path[0], '肩から腕への動力パイプの受け（肩）', rr * 0.9, [0.03, -0.04, 0.02], 0.45),
    fitting(path[n], '肩から腕への動力パイプの受け（腕）', rr * 0.9, [0.13, -0.3, 0], 0.4)].map(pc => ({ ...pc, bone: 'arm', pivot: 'none' }));
}
export default [
  { id: 'pipechesthead', name: '動力パイプ（胸から頭へ）', cat: '動力パイプ', size: [0.56, 0.22, 0.2], pieces: chestToHead(0.024, 0.018, 8) },
  { id: 'pipechestheadthick', name: '動力パイプ（胸から頭へ・太い）', cat: '動力パイプ', size: [0.58, 0.24, 0.22], pieces: chestToHead(0.032, 0.025, 7) },
  { id: 'pipearm', name: '動力パイプ（肩から腕へ）', cat: '肩の動力パイプ', size: [0.2, 0.26, 0.14], pieces: shoulderToArm(0.024, 0.018, 7) },
  { id: 'pipearmthick', name: '動力パイプ（肩から腕へ・太い）', cat: '肩の動力パイプ', size: [0.22, 0.28, 0.16], pieces: shoulderToArm(0.032, 0.025, 6) },
];
