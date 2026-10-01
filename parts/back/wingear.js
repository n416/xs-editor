// 翼の装備（胴の骨 torso）。翼の「装備を付ける所」（wings.js の mounts）に置く。原点はその付ける所。
//   slot 'hang'  ：翼の吊り下げる所（機械の翼だけ。左右の対）。下 −y へ吊る
//   slot 'root'  ：翼の付け根（左右の対）
//   slot 'center'：背中の真ん中の後ろ（1 個）
// 光（オーラ・リボン）は、必ず光らない発生器の機械から出す：光だけを宙に置かない。光の部品は当たり判定なし（noHit）。
import { piece, DARK, ACCENT } from '../../xsasm-lib.js';
import { hull, xf, named, lathe, lathePlanes, strip, rod, unit, cross, add3, mul3, rainbow } from './kit.js';
import { tank } from './gear.js';

const G = (id, name, slot, size, pieces, forKind = null) => ({ id, name, cat: '翼の装備', slot, size, pieces, ...(forKind ? { forKind } : {}) });
const R = Math.PI / 180, BEAM = '#ff8ad8';
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

// ---- 虹色のオーラ：背中の後ろの発生器（光らない機械：円錐の胴、金属の輪の枠、6 本の腕と発射口）から、同心円の細い光の輪を 7 本重ねる。
//      外の輪ほど後ろ。外が赤、内が紫。輪は、発射口から出る 6 本の光の筋でつながる ----
const aura = (() => {
  const rings = [0.46, 0.6, 0.74, 0.88, 1.02, 1.16, 1.3], w = 0.032, out = [], on = (r, a, z) => [r * Math.sin(a * R), r * Math.cos(a * R), z];
  rings.forEach((rk, k) => {
    const N = 14 + 2 * k, z0 = -0.022 * k, col = rainbow(1 - (k + 0.5) / rings.length, 0.5);
    for (let j = 0; j < N; j++) {
      const pts = [];
      for (const a of [(j - 0.04) * 360 / N, (j + 1.04) * 360 / N]) for (const [r, z] of [[rk - w, z0 - 0.012], [rk + w, z0 - 0.023]]) for (const dz of [-0.007, 0.007]) pts.push(on(r, a, z + dz));
      out.push(hull(`光の輪 ${k + 1}（${j + 1}）`, pts, { color: col, glow: true, opacity: 0.6, noHit: true }));
    }
  });
  // 発生器（光らない）
  const HOOP = 0.31, gen = [
    ...xf([...lathe('オーラの発生器の胴', [[-0.3, 0.06, DARK], [-0.08, 0.09], [-0.04, 0.15], [0.02, 0.16], [0.05, 0.135]], { n: 12 }),
      piece('発生器の円錐', lathePlanes([[0.04, 0.125], [0.2, 0.05], [0.235, 0.014]], 12)),
      piece('発生器の円錐の帯', lathePlanes([[0.1, 0.1], [0.105, 0.106], [0.125, 0.097], [0.13, 0.086]], 12), { color: ACCENT })], { rot: [-90, 0, 0] }),
    ...Array.from({ length: 18 }, (_, j) => hull(`発生器の輪の枠 ${j + 1}`, [(j - 0.05) * 20, (j + 1.05) * 20].flatMap(a => [on(HOOP - 0.03, a, 0.016), on(HOOP - 0.03, a, -0.03), on(HOOP + 0.03, a, 0.004), on(HOOP + 0.03, a, -0.02), on(HOOP, a, 0.03), on(HOOP, a, -0.045)]))),
    ...Array.from({ length: 6 }, (_, k) => [
      piece(`発生器の腕 ${k + 1}`, rod(on(0.12, k * 60, 0.0), on(HOOP, k * 60, -0.005), 0.03, 0.024, 6), { color: DARK }),
      piece(`発射口 ${k + 1}`, rod(on(HOOP - 0.01, k * 60, -0.005), on(HOOP + 0.085, k * 60, -0.012), 0.042, 0.026, 6), { color: DARK })]).flat(),
  ];
  const rays = Array.from({ length: 6 }, (_, k) => piece(`光の筋 ${k + 1}`, rod(on(HOOP + 0.08, k * 60, -0.012), on(1.32, k * 60, -0.153), 0.011, 0.004, 5), { color: '#ffffff', glow: true, opacity: 0.6, noHit: true }));
  return G('wgaura', '虹色のオーラ（発生器と同心円の光の輪）', 'center', [2.6, 2.6, 0.3], [...gen, ...rays, ...out]);
})();

// ---- 虹色のリボン：付け根の発生器（光らない機械：装甲の箱と、3 本の噴き出し口）から、後ろへまっすぐ流れる細い光の帯 3 本（先は細く消える）。根元が赤、先が紫 ----
const ribbon = (() => {
  const defs = [{ L: 2.4, out: 0.5, drop: -0.2, amp: 0.045, ph: 0, w: 0.12, at: [0.045, 0.03, -0.2] }, { L: 2.1, out: 0.2, drop: -0.6, amp: 0.035, ph: 1.7, w: 0.11, at: [0.0, -0.045, -0.2] }, { L: 1.8, out: 0.8, drop: 0.2, amp: 0.03, ph: 3.2, w: 0.095, at: [0.075, -0.02, -0.19] }];
  const out = [
    hull('リボンの発生器', [[-0.05, -0.08, 0.03], [0.07, -0.07, 0.03], [-0.05, 0.07, 0.03], [0.08, 0.06, 0.03], [-0.04, -0.07, -0.1], [0.08, -0.06, -0.1], [-0.04, 0.055, -0.11], [0.09, 0.05, -0.105], [0.11, -0.005, -0.03]]),
    hull('発生器の後ろの枠', [[-0.035, -0.075, -0.09], [0.085, -0.065, -0.09], [-0.035, 0.06, -0.1], [0.095, 0.055, -0.095], [-0.02, -0.06, -0.14], [0.08, -0.05, -0.14], [-0.02, 0.045, -0.145], [0.085, 0.04, -0.14]], { color: DARK }),
    ...defs.map((f, i) => piece(`噴き出し口 ${i + 1}`, rod([f.at[0] * 0.8, f.at[1] * 0.8, -0.12], [f.at[0], f.at[1], f.at[2] - 0.015], 0.022, 0.03, 6), { color: DARK }))];
  defs.forEach((f, i) => {
    const N = 20, pt = s => [f.at[0] + f.out * s ** 0.8 + f.amp * 0.6 * Math.sin(s * 7 + f.ph) * s, f.at[1] + f.drop * s * s + f.amp * Math.sin(s * 9 + f.ph) * s, f.at[2] - f.L * s];
    const sts = Array.from({ length: N + 1 }, (_, j) => {
      const s = j / N, c = pt(s), tw = (25 + 50 * s + i * 40) * R, wd = [Math.cos(tw), Math.sin(tw), 0], w = f.w * Math.min(1, 0.4 + 6 * s) * (1 - s) + 0.004;
      return { a: add3(c, mul3(wd, w / 2)), b: add3(c, mul3(wd, -w / 2)), t: 0.01, k: 0.5, color: rainbow(s * 0.95 + 0.02, 0.5) };
    });
    out.push(...strip(`リボン ${i + 1}`, sts, { glow: true, opacity: 0.7, noHit: true }));
  });
  return G('wgribbon', '虹色のリボン（発生器と、後ろへ流れる光の帯 3 本）', 'root', [1.0, 1.2, 2.6], out);
})();

export default [wingTank, pods, finPods, aura, ribbon];
