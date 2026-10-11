// 頭の動力パイプ（飾り）：腰の動力パイプと同じ蛇腹の管（parts/pipe.js）を頭の大きさで。+x 側の 1 本で、反対側は鏡像で置く。
// 座標は x 右・y 上・z 前。原点は管の道筋のまん中あたり（頬のパイプ）か、口の前（口から首へ）。両端の受けは頭の中へ伸ばしてつなぐ。
//   頬：頬の前から、頭の横を外へ少しふくらみながら後ろへ、少し下がりつつ回る（細い・太い）
//   口から首へ：口の前のまん中から、外へ出て下がりながら首の横の後ろへ
// 太さ：前は半径 0.022（太い方で 0.032）で、体に載せると 1 cm（1.4 cm）しかなく、腰の動力パイプの「細い」（1.6 cm）より細かった
// （依頼主：「顔の動力パイプが細すぎて使い物にならない」）。腰の動力パイプの段に合わせる（体に載せたときの半径。頭は体に載せると約 0.44 倍）：
//   頬 0.048 → 約 2.1 cm（腰の「細い」と標準の間）、頬・太い 0.064 → 約 2.8 cm（腰の標準）、口から首へ 0.044 → 約 2.1 cm。[独自]
// 太くしても置く倍率が変わらないよう、部品の size は道筋の長さで決める（太さを入れない）
// 両端：前は四角い箱の受けを付けていて、太くすると頬の前に箱が飛び出した。箱はやめ、管そのものを頭の中へ曲げて入れ、入る所に少し太い輪（口金）を 1 つ付ける
import { bellows, tube } from './pipe.js';
import { piece, DARK, BLACK } from '../xsasm-lib.js';

/** 管の端の口金：道筋の端の 1 区間の、端から 55% までを覆う少し太い輪 */
const collar = (a, b, name, rr) => piece(name, tube(a, a.map((v, k) => v + (b[k] - v) * 0.55), rr * 1.14, 10), { color: DARK, noHit: true });

/** 頬のパイプの道筋：前（z +0.2）から後ろ（z −0.2）へ、外へ out ふくらみ、0.06 下がる。両端は頭の中（x −DIVE）から出て、すぐ外へ回る */
const DIVE = 0.07;
const cheekPath = (n, out) => Array.from({ length: n + 1 }, (_, i) => { const t = i / n; return [(out + DIVE) * Math.sin(Math.PI * t) ** 0.6 - DIVE, -0.06 * t, 0.2 - 0.4 * t]; });
/** 口から首への道筋（2 次のベジェ）：口の奥 (0, 0, 0.06) → 外の角 (0.11, −0.02, 0.14) → 首の中 (0.04, −0.13, −0.1)。両端は口の中・首の中に入る */
const mouthPath = n => Array.from({ length: n + 1 }, (_, i) => {
  const t = i / n, a = (1 - t) ** 2, b = 2 * t * (1 - t), c = t * t;
  return [0 * a + 0.11 * b + 0.04 * c, 0 * a - 0.02 * b - 0.13 * c, 0.06 * a + 0.14 * b - 0.1 * c];
});
const cheek = (id, name, rr, rc, n) => {
  // ends・endIn：置くとき、両端の点が殻の横の面から endIn だけ中に入るように、向きと左右の位置を決める（xsasm-random.js）
  const p = cheekPath(n, 0.04 + rr);   // 太い管ほど外へふくらむ（まん中で、管の内側が頭の横の面に沿う）
  return { id, name, cat: '飾り', size: [0.104, 0.104, 0.444], ends: [p[0], p[n]], endIn: rr, pieces: [...bellows(p, '動力パイプ', rr, rc), collar(p[0], p[1], '動力パイプの口金（前）', rr), collar(p[n], p[n - 1], '動力パイプの口金（後ろ）', rr)] };
};
/**
 * 頭を回る動力パイプ（依頼主 2026-10-11：口から首へ下がるパイプは「方向が気持ち悪い。妙に小さくて、1色で」）。
 * 参考の写真（この系統の頭の大きな模型）の上で測った：パイプは口の箱の横から外へ出て、頭の下の縁の外を後ろへ回り、後ろの斜めで頭に入る。
 * 太さは頭の幅の 0.18、左右のパイプの外から外までが頭の幅の 1.45 倍、片側に太い輪が 8 つほど。色は頭と別（暗い輪）。
 * 座標は頭の座標そのまま（標準の置き方の殻：mov [0, 0, −0.125]・scal [3, 3.1, 2.2] の丸い頭の幅 0.636 に合わせてある）。倍率 1 で置く。+x 側の 1 本
 */
const rimPath = (() => {
  const key = [[0.15, -0.112, 0.092], [0.275, -0.108, 0.1], [0.372, -0.102, 0.06], [0.43, -0.094, -0.1], [0.408, -0.086, -0.27], [0.312, -0.08, -0.41], [0.19, -0.076, -0.375]];
  // 点の間をなめらかにつなぎ（Catmull-Rom）、同じ長さの 9 区間に切り直す
  const fine = [];
  for (let i = 0; i + 1 < key.length; i++) for (let j = 0; j < 12; j++) {
    const t = j / 12, p0 = key[Math.max(0, i - 1)], p1 = key[i], p2 = key[i + 1], p3 = key[Math.min(key.length - 1, i + 2)];
    fine.push([0, 1, 2].map(k => 0.5 * (2 * p1[k] + (p2[k] - p0[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t * t + (3 * p1[k] - p0[k] - 3 * p2[k] + p3[k]) * t * t * t)));
  }
  fine.push(key[key.length - 1]);
  const len = [0]; for (let i = 1; i < fine.length; i++) len.push(len[i - 1] + Math.hypot(...fine[i].map((v, k) => v - fine[i - 1][k])));
  const n = 9, out = [];
  for (let s = 0, i = 1; s <= n; s++) { const d = len[len.length - 1] * s / n; while (i < fine.length - 1 && len[i] < d) i++; const u = (d - len[i - 1]) / (len[i] - len[i - 1] || 1); out.push(fine[i - 1].map((v, k) => v + (fine[i][k] - v) * u)); }
  return out;
})();
const rim = (() => {
  const rr = 0.057, p = rimPath, n = p.length - 1;
  // 輪は黒（骨組みの色）、芯は暗い色：頭の色を塗り替えても、頭と同じ色にならない
  const pieces = bellows(p, '動力パイプ', rr, 0.044).map(pc => ({ ...pc, color: /の輪/.test(pc.name) ? BLACK : DARK }));
  return { id: 'headpiperim', name: '動力パイプ（頭を回る）', cat: '飾り', size: [0.49, 0.16, 0.56], rim: true,
    pieces: [...pieces, { ...collar(p[0], p[1], '動力パイプの口金（口）', rr), color: BLACK }, { ...collar(p[n], p[n - 1], '動力パイプの口金（後ろ）', rr), color: BLACK }] };
})();
export default [
  cheek('headpipecheek', '動力パイプ（頬）', 0.048, 0.037, 9),
  cheek('headpipecheekthick', '動力パイプ（頬・太い）', 0.064, 0.05, 8),
  (() => {
    const n = 6, p = mouthPath(n), rr = 0.044;
    return { id: 'headpipemouth', name: '動力パイプ（口から首へ）', cat: '飾り', size: [0.14, 0.16, 0.24], pieces: [...bellows(p, '動力パイプ', rr, 0.034), collar(p[0], p[1], '動力パイプの口金（口）', rr), collar(p[n], p[n - 1], '動力パイプの口金（首）', rr)] };
  })(),
  rim,
];
