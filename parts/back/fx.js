// エフェクト（光だけの部品。胴の骨 torso）。発生する機械（翼のひれ・エンジン・発生器の翼）とは別の部品で、バックパックにも翼にも足せる。
// 色は 2 色のグラデーションで、オレンジ系・緑系・青系の 3 つ。どれも光り、透け、当たり判定なし（noHit）。
//   光の輪（slot 'center'：背中の真ん中の後ろ）：中が大きく抜けた幅広の帯に、細い同心の線。内の色から外の色へ。少し皿形（外ほど後ろ）
//   光の帯（slot 'root'：左右の対）：後ろへ流れる細い帯 3 本。根元の色から先の色へ
//   光の刃（slot 'light'：発生器の翼の後ろの縁。左右の対）：細く鋭い刃 5 本。芯が内の色、外が外の色
import { hull, strip, unit, cross, add3, mul3, mix } from './kit.js';
import { LIGHT_EMITTER } from './wings.js';

const R = Math.PI / 180;
export const FX_CAT = 'エフェクト（光）';
/** 色の組：[名前, 内（根元・芯）の色, 外（先）の色] */
export const FX_COLORS = { orange: ['オレンジ', '#ffd21f', '#ff3a1a'], green: ['緑', '#e4ff4a', '#14c95c'], blue: ['青', '#8af4ff', '#1b55ff'] };
const F = (id, name, slot, size, pieces, extra = {}) => ({ id, name, cat: FX_CAT, slot, size, pieces, ...extra });
const LIGHT = { glow: true, noHit: true };

/** 光の輪：半径 0.93〜1.6（写真の上で測った比。体の高さほどの大きさ）の帯を 12 本の細い輪に分け、1 本おきに前後へずらして線に見せる */
function ring(key) {
  const [label, c0, c1] = FX_COLORS[key], bands = 12, r0 = 0.93, r1 = 1.6, N = 32, out = [];
  const on = (r, a, z) => [r * Math.sin(a * R), r * Math.cos(a * R), z];
  for (let k = 0; k < bands; k++) {
    const t = k / (bands - 1), ra = r0 + (r1 - r0) * k / bands - 0.003, rb = r0 + (r1 - r0) * (k + 1) / bands + 0.003;
    const z = z0 => z0 + (k % 2 ? 0.009 : 0), dish = r => -0.2 * (r - r0), tk = k % 2 ? 0.005 : 0.009, col = mix(c0, c1, t);
    for (let j = 0; j < N; j++) {
      const pts = [];
      for (const a of [(j - 0.03) * 360 / N, (j + 1.03) * 360 / N]) for (const r of [ra, rb]) for (const dz of [-tk, tk]) pts.push(on(r, a, z(dish(r)) + dz));
      out.push(hull(`光の輪 ${k + 1}（${j + 1}）`, pts, { ...LIGHT, color: col, opacity: k % 2 ? 0.55 : 0.75 }));
    }
  }
  return F(`fxring_${key}`, `光の輪（${label}）`, 'center', [3.2, 3.2, 0.3], out);
}
/** 光の帯：後ろへ流れる細い帯 3 本（先は細く消える） */
function ribbon(key) {
  const [label, c0, c1] = FX_COLORS[key], out = [];
  const defs = [{ L: 2.4, out: 0.5, drop: -0.2, amp: 0.045, ph: 0, w: 0.12, at: [0.03, 0.02, -0.04] }, { L: 2.1, out: 0.2, drop: -0.6, amp: 0.035, ph: 1.7, w: 0.11, at: [0, -0.03, -0.04] }, { L: 1.8, out: 0.8, drop: 0.2, amp: 0.03, ph: 3.2, w: 0.095, at: [0.05, -0.01, -0.04] }];
  defs.forEach((f, i) => {
    const N = 20, pt = s => [f.at[0] + f.out * s ** 0.8 + f.amp * 0.6 * Math.sin(s * 7 + f.ph) * s, f.at[1] + f.drop * s * s + f.amp * Math.sin(s * 9 + f.ph) * s, f.at[2] - f.L * s];
    const sts = Array.from({ length: N + 1 }, (_, j) => {
      const s = j / N, c = pt(s), tw = (25 + 50 * s + i * 40) * R, wd = [Math.cos(tw), Math.sin(tw), 0], w = f.w * Math.min(1, 0.4 + 6 * s) * (1 - s) + 0.004;
      return { a: add3(c, mul3(wd, w / 2)), b: add3(c, mul3(wd, -w / 2)), t: 0.01, k: 0.5, color: mix(c0, c1, s) };
    });
    out.push(...strip(`光の帯 ${i + 1}`, sts, { ...LIGHT, opacity: 0.7 }));
  });
  return F(`fxribbon_${key}`, `光の帯（${label}・後ろへ流れる 3 本）`, 'root', [1.0, 1.2, 2.6], out);
}
/** 光の刃：発生器の翼（wings.js の winglight）の後ろの縁から、下と外へ扇に伸びる刃 5 本（外ほど長い）。原点は翼の付け根 */
function blades(key) {
  const [label, c0, c1] = FX_COLORS[key], { A, d0, n, ch } = LIGHT_EMITTER, out = [];
  for (let j = 0; j < 5; j++) {
    const o = add3(add3(A, mul3(d0, 0.12 + 0.11 * j)), mul3(ch, -0.13 + 0.008 * j)), d = unit([0.3 + 0.13 * j, -1 + 0.14 * j, -0.38]), l = 1.1 + 0.22 * j, q = unit(cross(n, d));
    const blade = (name, w, tk, len, o2) => { const st = (r, f) => { const c = add3(o, mul3(d, r * len)); return { a: add3(c, mul3(q, w * f / 2)), b: add3(c, mul3(q, -w * f / 2)), t: tk, k: 0.5 }; }; return strip(name, [st(0, 0.45), st(0.06, 1), st(0.5, 0.7), st(1, 0.02)], o2); };
    out.push(...blade(`光の刃 ${j + 1}`, 0.17, 0.012, l, { ...LIGHT, color: c1, opacity: 0.5 }), ...blade(`光の刃 ${j + 1}の芯`, 0.06, 0.022, l * 0.8, { ...LIGHT, color: mix(c0, '#ffffff', 0.45), opacity: 0.9 }));
  }
  return F(`fxblade_${key}`, `光の刃（${label}・5 本）`, 'light', [1.9, 1.9, 0.8], out, { forKind: ['light'] });
}

export default Object.keys(FX_COLORS).flatMap(k => [ring(k), ribbon(k), blades(k)]);
