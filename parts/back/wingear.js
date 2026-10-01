// 翼の装備（胴の骨 torso）。翼の「装備を付ける所」（wings.js の mounts）に置く。原点はその付ける所。
//   slot 'hang'  ：翼の吊り下げる所（機械の翼だけ。左右の対）。下 −y へ吊る
//   slot 'root'  ：翼の付け根（左右の対）
//   slot 'center'：背中の真ん中の後ろ（1 個）
//   slot 'light' ：発生器の翼の後ろの縁（左右の対。原点は翼の付け根）
// 光そのもの（輪・帯・刃）は、別の部品（fx.js のエフェクト）。
import { piece, DARK, ACCENT } from '../../xsasm-lib.js';
import { hull, xf, named, lathePlanes, strip, rod, prism, unit, cross, add3, mul3 } from './kit.js';
import { tank, coreEngine } from './gear.js';
import { LIGHT_EMITTER } from './wings.js';

const G = (id, name, slot, size, pieces, forKind = null) => ({ id, name, cat: '翼の装備', slot, size, pieces, ...(forKind ? { forKind } : {}) });
const BEAM = '#ff8ad8';
const pylon = (name, z = 0) => hull(name, [[-0.02, 0.05, 0.1], [0.02, 0.05, 0.1], [-0.02, 0.05, -0.14], [0.02, 0.05, -0.14], [-0.012, -0.09, 0.05 + z], [0.012, -0.09, 0.05 + z], [-0.012, -0.09, -0.12 + z], [0.012, -0.09, -0.12 + z]], { color: DARK });

// ---- 翼のプロペラントタンク：吊り柱の下に、後ろへ寝た細長いタンク。後ろに小さなひれ 3 枚 ----
const wingTank = (() => {
  const at = { rot: [-84, 0, 0], mov: [0, -0.15, -0.3] };
  const fin = k => xf(strip('タンクのひれ', [{ a: [0, 0.2, 0.05], b: [0, 0.34, 0.05], t: 0.02 }, { a: [0, 0.3, 0.13], b: [0, 0.37, 0.13], t: 0.006 }]), { rot: [0, k * 120 + 60, 0] }).map(pc => ({ ...pc, name: `タンクのひれ ${k + 1}` }));
  return G('wgtank', '翼のプロペラントタンク', 'hang', [0.2, 0.3, 0.8], [pylon('タンクの吊り柱', -0.14),
    ...xf([...tank('タンク', 0.74, 0.062, { n: 12, bands: [-0.12, 0.2], stripe: 0.3 }), ...[0, 1, 2].flatMap(fin)], at)], ['mech']);
})();

// ---- 遠隔砲台（漏斗形）3 基：吊り柱の下の棒に、口の細い円錐を 3 つ下げる ----
const funnel = () => [
  piece('砲台の胴', lathePlanes([[-0.25, 0.012], [-0.2, 0.03], [0.0, 0.072], [0.02, 0.068]], 10)),
  piece('砲台のふた', lathePlanes([[0.015, 0.062], [0.04, 0.052], [0.055, 0.022]], 10), { color: DARK }),
  piece('砲台の帯', lathePlanes([[-0.1, 0.05], [-0.094, 0.056], [-0.07, 0.061], [-0.064, 0.058]], 10), { color: ACCENT }),
  piece('砲口の光', lathePlanes([[-0.262, 0.004], [-0.248, 0.013], [-0.24, 0.013]], 8), { color: BEAM, glow: true }),
  ...[0, 1, 2].flatMap(k => xf(strip('砲台のひれ', [{ a: [0, 0.0, 0.06], b: [0, -0.12, 0.04], t: 0.016 }, { a: [0, 0.01, 0.12], b: [0, -0.05, 0.11], t: 0.005 }]), { rot: [0, k * 120, 0] }).map(pc => ({ ...pc, name: `砲台のひれ ${k + 1}` }))),
  piece('砲台の首', rod([0, 0.05, 0], [0, 0.1, 0], 0.016, 0.016, 6), { color: DARK }),
];
const pods = G('wgpod', '遠隔砲台（漏斗形 3 基）', 'hang', [0.2, 0.45, 0.6], [pylon('砲台の吊り柱'),
  piece('砲台を下げる棒', rod([0, -0.08, 0.14], [0, -0.1, -0.34], 0.022, 0.02, 6), { color: DARK }),
  ...[0.08, -0.1, -0.28].flatMap((z, i) => named(`${i + 1} `, xf(funnel(), { rot: [-24, 0, 0], mov: [0, -0.175, z - 0.04] })))], ['mech']);

// ---- 遠隔砲台（ひれ形）3 基：横の棒に、縦に長い板の砲台を 3 枚並べる ----
const finPods = (() => {
  const d = unit([0, -1, -0.32]), ch = unit(cross([1, 0, 0], d));
  const one = (x, i) => {
    const o = [x, -0.1, -0.02], st = (r, w, tk, extra = {}) => { const c = add3(o, mul3(d, r)); return { a: add3(c, mul3(ch, w * 0.5)), b: add3(c, mul3(ch, -w * 0.5)), t: tk, k: 0.5, n: [1, 0, 0], ...extra }; };
    return [...strip(`ひれ形の砲台 ${i + 1}`, [st(0, 0.07, 0.05), st(0.08, 0.13, 0.06), st(0.42, 0.12, 0.05, { color: ACCENT }), st(0.47, 0.115, 0.048), st(0.6, 0.04, 0.02)]),
      ...strip(`ひれ形の砲台 ${i + 1}の溝`, [st(0.1, 0.03, 0.068), st(0.4, 0.03, 0.058)], { color: DARK }),
      ...strip(`ひれ形の砲台 ${i + 1}の砲口`, [st(0.585, 0.03, 0.022), st(0.62, 0.012, 0.01)], { color: BEAM, glow: true })];
  };
  return G('wgfinpod', '遠隔砲台（ひれ形 3 基）', 'hang', [0.4, 0.75, 0.4], [pylon('砲台の吊り柱'),
    piece('砲台を下げる棒', rod([-0.14, -0.09, -0.02], [0.14, -0.09, -0.02], 0.024, 0.024, 6), { color: DARK }),
    ...[-0.105, 0, 0.105].flatMap(one)], ['mech']);
})();

// ---- 遠隔砲台（刃の形）5 基：発生器の翼の後ろの縁につながる、細長く鋭い装甲の刃。並びと大きさは光の刃（エフェクト）と同じで、こちらは光らない実体。
//      根元に暗い受けと小さな安定板 2 枚、背に溝、先の手前に差し色の帯と砲口 ----
const bladePods = (() => {
  const { A, d0, n, ch } = LIGHT_EMITTER, out = [], STEEL = '#4a4f57';
  for (let j = 0; j < 5; j++) {
    const o = add3(add3(A, mul3(d0, 0.12 + 0.11 * j)), mul3(ch, -0.13 + 0.008 * j)), d = unit([0.3 + 0.13 * j, -1 + 0.14 * j, -0.38]), l = 1.1 + 0.22 * j, q = unit(cross(n, d)), nm = `刃の砲台 ${j + 1}`;
    const at = (r, dn = 0) => add3(add3(o, mul3(d, r * l)), mul3(n, dn));
    const st = (r, w, tk, extra = {}) => { const c = at(r); return { a: add3(c, mul3(q, w / 2)), b: add3(c, mul3(q, -w / 2)), t: tk, k: 0.5, ...extra }; };
    out.push(
      piece(`${nm}の受け`, prism(at(-0.04), at(0.07), [0.075, 0.07], q, { w1: 0.06, h1: 0.055 }), { color: DARK }),
      ...strip(nm, [st(0.03, 0.07, 0.05), st(0.09, 0.16, 0.062), st(0.5, 0.115, 0.048), st(0.72, 0.085, 0.036, { color: ACCENT }), st(0.76, 0.08, 0.034), st(0.93, 0.035, 0.018), st(1, 0.004, 0.004)]),
      ...strip(`${nm}の溝`, [st(0.12, 0.035, 0.072), st(0.48, 0.028, 0.056)], { color: DARK }),
      ...strip(`${nm}の砲口`, [st(0.8, 0.022, 0.04), st(0.9, 0.014, 0.026)], { color: BEAM, glow: true }),
      ...[-1, 1].flatMap(sg => strip(`${nm}の安定板（${sg > 0 ? '前' : '後ろ'}）`, [{ a: at(0.1, sg * 0.02), b: at(0.24, sg * 0.02), t: 0.016, k: 0.4, n: q }, { a: at(0.16, sg * 0.085), b: at(0.24, sg * 0.075), t: 0.006, k: 0.4, n: q }], { color: STEEL })));
  }
  return G('wgbladepod', '遠隔砲台（刃の形 5 基）', 'light', [1.9, 1.9, 0.8], out, ['light']);
})();

// ---- 発生器のエンジン（円錐）：背中の真ん中の後ろに付く。光の輪（エフェクト）の真ん中に置ける ----
const core = G('wgcore', '発生器のエンジン（短い円錐）', 'center', [0.32, 0.32, 0.55], coreEngine(0.49));

export default [wingTank, pods, finPods, bladePods, core];
