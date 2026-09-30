// 下半身の部品を作る道具：盛り上がった装甲の面。
// 面 p[axis] = sign · f(u, v)（f は上に凸：中ほどが盛り上がる）を、格子の点の接平面で並べる。接平面の内側の重なりが、
// 多面体で近づけた曲面になる（頭の殻の楕円体と同じ作り方）。u, v は axis 以外の 2 軸（x→(y,z)、y→(x,z)、z→(x,y)）
import { P } from '../../xsasm-lib.js';

const OTHER = { x: [1, 2], y: [0, 2], z: [0, 1] }, IDX = { x: 0, y: 1, z: 2 };
/** 盛り上がった面。axis 'x' | 'y' | 'z'、sign +1 / −1（外向き）、f(u, v)、us・vs は接平面を置く格子 */
export function crown(axis, sign, f, us, vs, h = 1e-4) {
  const a = IDX[axis], [iu, iv] = OTHER[axis];
  const out = [];
  for (const u of us) for (const v of vs) {
    const w = f(u, v), fu = (f(u + h, v) - f(u - h, v)) / (2 * h), fv = (f(u, v + h) - f(u, v - h)) / (2 * h);
    const n = [0, 0, 0], p = [0, 0, 0];
    n[a] = sign; n[iu] = -fu; n[iv] = -fv;
    p[a] = sign * w; p[iu] = u; p[iv] = v;
    out.push(P(n, p));
  }
  return out;
}
/** a から b まで n 等分の点（両端を含む） */
export const steps = (a, b, n) => Array.from({ length: n + 1 }, (_, i) => a + (b - a) * i / n);
