// 翼の装備（胴の骨 torso）。翼の「装備を付ける所」（wings.js の mounts）に置く。原点はその付ける所。
//   slot 'hang'  ：翼の吊り下げる所（機械の翼だけ。左右の対）。下 −y へ吊る。ひれ付きのラック（吊り柱）は独立した部品で、
//                  ラックを置いてあれば、吊り柱の無い装備（bare：プロペラントタンク）はラックの下の端に付く
//   slot 'root'  ：翼の付け根（左右の対）
//   slot 'spine' ：背中の板の真ん中（1 個）
//   slot 'dock'  ：ORB 収納ラックの収納口（左右の対。1 基ずつ、空いている収納口へ入る）
// 光そのもの（輪・帯・刃）は、別の部品（fx.js のエフェクト）。
import { piece, MAIN, DARK, ACCENT } from '../../xsasm-lib.js';
import { xf, xfPt, named, lathePlanes, strip, rod, prism, unit, cross, add3, mul3 } from './kit.js';
import { tank, coreEngine } from './gear.js';

const G = (id, name, slot, size, pieces, forKind = null) => ({ id, name, cat: '翼の装備', slot, size, pieces, ...(forKind ? { forKind } : {}) });
const BEAM = '#ff8ad8';
/** ラックの下の端までの深さ（ラックに吊る装備は、この分だけ下に置く） */
export const RACK_DROP = 0.135;
/**
 * ひれ付きのラック（吊り柱）。原点は翼の吊り下げる所、下の端は y −drop。
 *   ひれ：前の縁が後ろへ寝た翼形の板（断面はひし形）。上は翼の中へ入り、後ろの縁に一段の切り欠き。差し色の筋と、暗い点検の板
 *   zs は前後のずれ（翼のタンクは腕に当たらないよう後ろ寄りに吊るので、ラックも後ろ寄り）
 *   下の桁：前が細くなる四角柱。吊り金具 2 つ、振れ止めの腕 4 本、後ろに小さな水平のひれ 2 枚
 */
const rack = (name, drop = RACK_DROP, zs = -0.15) => {
  const y1 = -drop + 0.035, STEEL = '#4a4f57';
  const sec = (y, z0, z1, t, extra = {}) => ({ a: [0, y, z0], b: [0, y, z1], t, k: 0.38, n: [1, 0, 0], ...extra });
  return xf([
    ...strip(`${name}のひれ`, [sec(0.05, 0.15, -0.2, 0.046), sec(-0.02, 0.115, -0.2, 0.044), sec(y1 + 0.03, 0.07, -0.19, 0.04), sec(y1, 0.05, -0.15, 0.036)]),
    ...strip(`${name}のひれの筋`, [sec(-0.005, 0.02, -0.03, 0.052, { k: 0.5 }), sec(y1 + 0.02, -0.01, -0.06, 0.046, { k: 0.5 })], { color: ACCENT }),
    ...strip(`${name}の点検の板`, [sec(0.0, -0.08, -0.15, 0.047, { k: 0.5 }), sec(y1 + 0.035, -0.09, -0.15, 0.043, { k: 0.5 })], { color: DARK }),
    piece(`${name}の桁`, prism([0, -drop + 0.018, 0.07], [0, -drop + 0.018, -0.21], [0.052, 0.04], [0, 1, 0]), { color: DARK }),
    piece(`${name}の桁の先`, prism([0, -drop + 0.018, 0.065], [0, -drop + 0.026, 0.135], [0.052, 0.04], [0, 1, 0], { w1: 0.02, h1: 0.016 }), { color: DARK }),
    ...[0.02, -0.14].flatMap((z, i) => [
      piece(`${name}の吊り金具 ${i + 1}`, prism([0, -drop + 0.004, z], [0, -drop - 0.004, z], [0.024, 0.04], [0, 0, 1]), { color: STEEL }),
      ...[-1, 1].map(s => piece(`${name}の振れ止め ${i + 1}（${s > 0 ? '+x' : '−x'}）`, prism([s * 0.02, -drop + 0.015, z - 0.03], [s * 0.05, -drop - 0.002, z - 0.03], [0.022, 0.016], [0, 0, 1]), { color: STEEL }))]),
    ...[-1, 1].flatMap(s => strip(`${name}の小さなひれ（${s > 0 ? '+x' : '−x'}）`, [{ a: [s * 0.02, -drop + 0.022, -0.13], b: [s * 0.02, -drop + 0.02, -0.215], t: 0.02 }, { a: [s * 0.085, -drop + 0.006, -0.185], b: [s * 0.085, -drop + 0.005, -0.225], t: 0.007 }], { color: MAIN })),
  ], { mov: [0, 0, zs] });
};
const rackPart = G('wgrack', 'ラック（ひれ付きの吊り柱）', 'hang', [0.2, 0.2, 0.4], rack('ラック'), ['mech']);

// ---- 翼のプロペラントタンク：後ろへ寝た細長いタンク。吊り柱は付けず、2 つの留め金で翼（かラック）に直に付く。ひれは付けない ----
const wingTank = (() => {
  const at = { rot: [-84, 0, 0], mov: [0, -0.078, -0.26] }, len = 0.74;
  const lug = (s, i) => { const p = xfPt([0, s * len, 0], at); return piece(`タンクの留め金 ${i + 1}`, prism([0, 0.03, p[2]], [0, p[1] + 0.03, p[2]], [0.05, 0.05], [0, 0, 1], { w1: 0.075, h1: 0.05 }), { color: DARK }); };
  return { ...G('wgtank', '翼のプロペラントタンク（横）', 'hang', [0.2, 0.2, 0.8], [lug(-0.12, 0), lug(0.2, 1),
    ...xf([...tank('タンク', len, 0.062, { n: 12, bands: [-0.12, 0.2], stripe: 0.3 })], at)], ['mech']), bare: true };
})();

/**
 * 縦のプロペラントタンク：原点から −y へ下がる。上に受けと首。翼の吊り下げる所に吊るほか、ORB 収納ラックの収納口にも挿せる（dockable：
 * 収納口のある翼では、オーブと同じく空いている収納口へ入り、収納口の向きを向く）。hangRot は、吊るときの傾き（度）
 */
const hangTank = (id, name, hangRot = null) => {
  const len = 0.74, r = 0.062;
  return { ...G(id, name, 'hang', [0.14, 0.85, 0.14], [
    piece('タンクの受け', prism([0, 0.045, 0], [0, -0.05, 0], [0.08, 0.075], [0, 0, 1]), { color: DARK }),
    piece('タンクの首', lathePlanes([[-0.085, 0.05], [-0.06, 0.036], [-0.035, 0.036]], 10), { color: DARK }),
    ...xf(tank('タンク', len, r, { n: 12, bands: [-0.2, 0.22], stripe: 0.32 }), { mov: [0, -0.07 - len / 2, 0] })]), bare: true, dockable: true, ...(hangRot ? { hangRot } : {}) };
};
const tankDiag = hangTank('wgtankdiag', '翼のプロペラントタンク（斜め下）', [0, 0, 30]);   // 下の端が外へ 30° 開く
const tankVert = hangTank('wgtankvert', '翼のプロペラントタンク（垂直）');

// ---- 遠隔砲台（漏斗形）3 基：吊り柱の下の棒に、口の細い円錐を 3 つ下げる ----
const conePod = () => [
  piece('砲台の胴', lathePlanes([[-0.25, 0.012], [-0.2, 0.03], [0.0, 0.072], [0.02, 0.068]], 10)),
  piece('砲台のふた', lathePlanes([[0.015, 0.062], [0.04, 0.052], [0.055, 0.022]], 10), { color: DARK }),
  piece('砲台の帯', lathePlanes([[-0.1, 0.05], [-0.094, 0.056], [-0.07, 0.061], [-0.064, 0.058]], 10), { color: ACCENT }),
  piece('砲口の光', lathePlanes([[-0.262, 0.004], [-0.248, 0.013], [-0.24, 0.013]], 8), { color: BEAM, glow: true }),
  ...[0, 1, 2].flatMap(k => xf(strip('砲台のひれ', [{ a: [0, 0.0, 0.06], b: [0, -0.12, 0.04], t: 0.016 }, { a: [0, 0.01, 0.12], b: [0, -0.05, 0.11], t: 0.005 }]), { rot: [0, k * 120, 0] }).map(pc => ({ ...pc, name: `砲台のひれ ${k + 1}` }))),
  piece('砲台の首', rod([0, 0.05, 0], [0, 0.1, 0], 0.016, 0.016, 6), { color: DARK }),
];
const pods = G('wgpod', '遠隔砲台（漏斗形 3 基）', 'hang', [0.2, 0.45, 0.6], [...rack('砲台のラック', 0.1, -0.06),
  piece('砲台を下げる棒', rod([0, -0.08, 0.14], [0, -0.1, -0.34], 0.022, 0.02, 6), { color: DARK }),
  ...[0.08, -0.1, -0.28].flatMap((z, i) => named(`${i + 1} `, xf(conePod(), { rot: [-24, 0, 0], mov: [0, -0.175, z - 0.04] })))], ['mech']);

// ---- 遠隔砲台（ひれ形）3 基：横の棒に、縦に長い板の砲台を 3 枚並べる ----
const finPods = (() => {
  const d = unit([0, -1, -0.32]), ch = unit(cross([1, 0, 0], d));
  const one = (x, i) => {
    const o = [x, -0.1, -0.02], st = (r, w, tk, extra = {}) => { const c = add3(o, mul3(d, r)); return { a: add3(c, mul3(ch, w * 0.5)), b: add3(c, mul3(ch, -w * 0.5)), t: tk, k: 0.5, n: [1, 0, 0], ...extra }; };
    return [...strip(`ひれ形の砲台 ${i + 1}`, [st(0, 0.07, 0.05), st(0.08, 0.13, 0.06), st(0.42, 0.12, 0.05, { color: ACCENT }), st(0.47, 0.115, 0.048), st(0.6, 0.04, 0.02)]),
      ...strip(`ひれ形の砲台 ${i + 1}の溝`, [st(0.1, 0.03, 0.068), st(0.4, 0.03, 0.058)], { color: DARK }),
      ...strip(`ひれ形の砲台 ${i + 1}の砲口`, [st(0.585, 0.03, 0.022), st(0.62, 0.012, 0.01)], { color: BEAM, glow: true })];
  };
  return G('wgfinpod', '遠隔砲台（ひれ形 3 基）', 'hang', [0.4, 0.75, 0.4], [...rack('砲台のラック', 0.1, 0.03),
    piece('砲台を下げる棒', rod([-0.14, -0.09, -0.02], [0.14, -0.09, -0.02], 0.024, 0.024, 6), { color: DARK }),
    ...[-0.105, 0, 0.105].flatMap(one)], ['mech']);
})();

// ---- オーブ（ORB：アウトレンジバレル。相手の射程の外から撃つ、射程がいちばん長い遠隔砲台）：長い砲身の砲台 1 基。先は尖らせず砲口で止める。
//      ORB 収納ラック（wings.js）の収納口に 1 基ずつ入る（slot 'dock'）。原点は収納口、砲身は −y へ伸び、幅は x、厚みは z。大きさは 小・中・大 の 3 つ
//      受け・機関部（横に動力の箱、小さな安定板 2 枚）・長い砲身（上に装甲の覆い、横に支えの桁と 2 つの留め具）・差し色の帯・砲口 ----
const orbUnit = (id, name, L, k) => {
  const STEEL = '#4a4f57', nm = 'オーブ';
  // r は長さに対する割合、dq は幅の向き（x）、dn は厚みの向き（z）へのずれ
  const at = (r, dq = 0, dn = 0) => [dq * k, -r * L, dn * k];
  const box = (part, r0, r1, size, o2 = {}, pos = [0, 0], tp = {}) => piece(`${nm}の${part}`, prism(at(r0, pos[0], pos[1]), at(r1, pos[0], pos[1]), size.map(v => v * k), [0, 0, 1], Object.fromEntries(Object.entries(tp).map(([a, v]) => [a, v * k]))), o2);
  return G(id, name, 'dock', [0.2 * k, L, 0.25 * k], [
    box('受け', -0.045 / L, 0.05, [0.08, 0.075], { color: DARK }),
    box('機関部', 0.03, 0.24, [0.13, 0.1], {}, [0, 0], { w1: 0.115, h1: 0.09 }),
    box('動力の箱', 0.06, 0.2, [0.07, 0.06], { color: DARK }, [-0.085, 0]),
    box('機関部の覆い', 0.07, 0.22, [0.08, 0.035], { color: ACCENT }, [0.01, 0.055], { w1: 0.065, h1: 0.028 }),
    box('砲身', 0.22, 0.9, [0.06, 0.06], { color: STEEL }),
    box('砲身の覆い', 0.24, 0.66, [0.085, 0.03], {}, [0.012, 0.038], { w1: 0.07, h1: 0.024 }),
    box('支えの桁', 0.2, 0.8, [0.024, 0.024], { color: DARK }, [-0.055, 0]),
    box('留め具 1', 0.44, 0.47, [0.1, 0.075], { color: DARK }, [-0.02, 0]),
    box('留め具 2', 0.76, 0.79, [0.1, 0.075], { color: DARK }, [-0.02, 0]),
    box('差し色の帯', 0.7, 0.725, [0.072, 0.072], { color: ACCENT }),
    box('砲口', 0.88, 1.0, [0.095, 0.085], { color: DARK }, [0, 0], { w1: 0.088, h1: 0.078 }),
    box('砲口の中', 0.985, 1.004, [0.045, 0.04], { color: BEAM, glow: true }),
    ...[-1, 1].flatMap(sg => strip(`${nm}の安定板（${sg > 0 ? '前' : '後ろ'}）`, [{ a: at(0.08, 0, sg * 0.04), b: at(0.2, 0, sg * 0.04), t: 0.016 * k, k: 0.4, n: [1, 0, 0] }, { a: at(0.14, 0, sg * 0.11), b: at(0.2, 0, sg * 0.1), t: 0.006 * k, k: 0.4, n: [1, 0, 0] }], { color: STEEL })),
  ], ['rack']);
};
const orbs = [orbUnit('wgorbs', 'オーブ（ORB・小）', 1.0, 0.8), orbUnit('wgorb', 'オーブ（ORB・中）', 1.5, 1), orbUnit('wgorbl', 'オーブ（ORB・大）', 2.0, 1.25)];

// ---- 発生器のエンジン（円錐）：背中の板の真ん中に直に付く（slot 'spine'）。首の円柱は無い ----
const core = G('wgcore', '発生器のエンジン（短い円錐）', 'spine', [0.32, 0.32, 0.32], coreEngine());

export default [rackPart, wingTank, tankDiag, tankVert, pods, finPods, ...orbs, core];
