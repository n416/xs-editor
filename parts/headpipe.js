// 頭の動力パイプ（飾り）：腰の動力パイプと同じ蛇腹の管（parts/pipe.js）を頭の大きさで。+x 側の 1 本で、反対側は鏡像で置く。
// 座標は x 右・y 上・z 前。原点は管の道筋のまん中あたり（頬のパイプ）か、口の前（口から首へ）。両端の受けは頭の中へ伸ばしてつなぐ。
//   頬：頬の前から、頭の横を外へ少しふくらみながら後ろへ、少し下がりつつ回る（細い・太い）
//   口から首へ：口の前のまん中から、外へ出て下がりながら首の横の後ろへ
import { bellows, fitting } from './pipe.js';

/** 頬のパイプの道筋：前（z +0.2）から後ろ（z −0.2）へ、外へ 0.06 ふくらみ、0.06 下がる */
const cheekPath = n => Array.from({ length: n + 1 }, (_, i) => { const t = i / n; return [0.06 * Math.sin(Math.PI * t), -0.06 * t, 0.2 - 0.4 * t]; });
/** 口から首への道筋（2 次のベジェ）：口の前 (0, 0, 0.12) → 外の角 (0.09, −0.02, 0.1) → 首の横の後ろ (0.1, −0.12, −0.08) */
const mouthPath = n => Array.from({ length: n + 1 }, (_, i) => {
  const t = i / n, a = (1 - t) ** 2, b = 2 * t * (1 - t), c = t * t;
  return [0 * a + 0.09 * b + 0.1 * c, 0 * a - 0.02 * b - 0.12 * c, 0.12 * a + 0.1 * b - 0.08 * c];
});
const cheek = (id, name, rr, rc, n) => {
  const p = cheekPath(n);
  return { id, name, cat: '飾り', size: [0.06 + 2 * rr, 0.06 + 2 * rr, 0.4 + 2 * rr], pieces: [...bellows(p, '動力パイプ', rr, rc),
    fitting(p[0], '動力パイプの受け（前）', rr * 0.9, [p[0][0] - 0.08, p[0][1], p[0][2]], 1),          // 頭の中へ 8 cm
    fitting(p[n], '動力パイプの受け（後ろ）', rr * 0.9, [p[n][0] - 0.08, p[n][1], p[n][2]], 1)] };
};
export default [
  cheek('headpipecheek', '動力パイプ（頬）', 0.022, 0.017, 10),
  cheek('headpipecheekthick', '動力パイプ（頬・太い）', 0.032, 0.025, 8),
  (() => {
    const n = 8, p = mouthPath(n), rr = 0.02;
    return { id: 'headpipemouth', name: '動力パイプ（口から首へ）', cat: '飾り', size: [0.1 + 2 * rr, 0.12 + 2 * rr, 0.2 + 2 * rr], pieces: [...bellows(p, '動力パイプ', rr, 0.015),
      fitting(p[0], '動力パイプの受け（口）', rr * 0.9, [p[0][0], p[0][1], p[0][2] - 0.08], 1),     // 口の奥（頭の中）へ
      fitting(p[n], '動力パイプの受け（首）', rr * 0.9, [p[n][0] - 0.08, p[n][1], p[n][2]], 1)] };
  })(),
];
