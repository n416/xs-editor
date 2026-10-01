// 翼（胴の骨 torso）。左右の対で、+x 側の 1 枚を作る（反対側は鏡像で置く）。バックパックとは同時に付けない。
// 原点は翼の付け根（背中の板の上、胸の下端の中心から x 0.11・y 0.4・z −0.19）。x は外、y は上、z は前（翼は後ろ −z へ伸びる）。
// 付け根の台は体の真ん中（x −0.11）まで伸び、左右の台が真ん中で合わさる。置いた翼は、付け根を軸に回転で開き方を変えられる。
// 部品ごとに、装備を付ける所（mounts）を持つ：hang 吊り下げる所（機械の翼の一部）・root 付け根・light 光の刃を出す所（ORB 収納ラック）。kind：mech 機械・organic 生き物の形・rack ORB 収納ラック
//   機械：刃の翼（刃 6 枚を扇に）・大きなバインダー・戦闘機の翼（翼の下にエンジン）・ひれの翼（長いひれ 3 枚）
//   生き物の形（作りは機械）：羽根の翼（装甲の腕と刃の羽）・骨組みの翼（関節の骨組みと放熱の膜）・透ける板の羽（4 枚）
//   光を出す：放射の翼（開くひれ 6 枚。光の輪の出どころ）。光そのものは別の部品（fx.js）
//   遠隔砲台を収める：ORB 収納ラック 5 種類（一列・扇／一列・平行／2・2・1／上向き 3・下向き 2／上下 2 段）。オーブは 1 基ずつ収納口（docks）へ入る
import { piece, MAIN, DARK, BLACK, ACCENT } from '../../xsasm-lib.js';
import { hull, xf, named, lathe, lathePlanes, bell, strip, rod, prism, lerp3, unit, cross, aim, add3, sub3, mul3 } from './kit.js';

const FLAME = '#ffb347', STEEL = '#4a4f57', R = Math.PI / 180;
const W = (id, name, kind, size, mounts, pieces) => ({ id, name, cat: '翼', kind, size, mounts: { root: [0.03, -0.06, -0.07], ...mounts }, pieces });
const along = (p, d, s) => add3(p, mul3(d, s));

/** 付け根の台（機械）：背中に差す台（真ん中 x −0.11 まで）と、翼の腕を受ける軸 */
const rootMech = () => [
  hull('翼の台', [[-0.11, -0.13, 0.04], [0.07, -0.11, 0.04], [-0.11, 0.1, 0.04], [0.08, 0.09, 0.04], [-0.11, -0.1, -0.075], [0.04, -0.085, -0.07], [-0.11, 0.07, -0.085], [0.05, 0.06, -0.08], [0.095, -0.02, -0.01]], { color: DARK }),
  hull('翼の台の覆い', [[-0.11, -0.05, -0.06], [0.03, -0.045, -0.06], [-0.11, 0.05, -0.07], [0.035, 0.045, -0.065], [-0.11, -0.03, -0.1], [0.0, -0.025, -0.095], [-0.11, 0.03, -0.105], [0.0, 0.025, -0.1]]),
];
/**
 * 骨組み（翼の腕・骨）：1 本の棒にしない。四角柱を組み合わせて作る。a → b、up は骨組みの面の中で軸に直角な向き、s は主桁の太さ。
 *   主桁（途中で折れる四角柱 2 本）・細い副桁（主桁から離れて並ぶ）・斜めの筋交い 3 本・主桁に斜めに載る装甲の覆い 2 枚・
 *   斜めに渡るシリンダー・先の関節を挟む 2 枚の板
 */
function frame(name, a, b, up, s) {
  const d = unit(sub3(b, a)), f = unit(cross(d, up)), at = (t, off = 0, fw = 0) => along(along(lerp3(a, b, t), up, off * s), f, fw * s);
  const subAt = t => at(t, -1.2 + 0.45 * t), mainAt = t => at(t, t < 0.55 ? 0.45 * t : 0.25 * (1 - t) / 0.45);
  const P_ = (n, p0, p1, size, o = {}, tp = {}) => piece(`${name}の${n}`, prism(p0, p1, size.map(v => v * s), up, Object.fromEntries(Object.entries(tp).map(([k, v]) => [k, v * s]))), o);
  return [
    P_('主桁（根）', at(-0.03), mainAt(0.57), [1, 0.85], { color: DARK }),
    P_('主桁（先）', mainAt(0.52), at(1.02), [0.85, 0.7], { color: DARK }, { w1: 0.65, h1: 0.55 }),
    P_('副桁', subAt(0.1), subAt(0.9), [0.42, 0.42], { color: DARK }),
    P_('筋交い 1', subAt(0.14), mainAt(0.34), [0.3, 0.3], { color: STEEL }),
    P_('筋交い 2', mainAt(0.34), subAt(0.6), [0.3, 0.3], { color: STEEL }),
    P_('筋交い 3', subAt(0.6), mainAt(0.86), [0.28, 0.28], { color: STEEL }),
    P_('装甲の覆い（根）', at(0.06, 0.55, 0.3), at(0.6, 1.05, 0.45), [1.5, 0.5]),
    P_('装甲の覆い（先）', at(0.56, 0.95, -0.35), at(0.97, 0.45, -0.2), [1.25, 0.42], {}, { w1: 0.9, h1: 0.3 }),
    P_('シリンダー', at(0.2, -0.5, 0.75), at(0.78, -0.1, 0.7), [0.3, 0.3], { color: STEEL }),
    P_('シリンダーの軸', at(0.72, -0.14, 0.7), at(0.95, 0.0, 0.62), [0.16, 0.16], { color: BLACK }),
    P_('関節を挟む板（前）', at(0.86, -0.1, 0.62), at(1.1, 0.0, 0.62), [0.22, 1.1]),
    P_('関節を挟む板（後ろ）', at(0.86, -0.1, -0.62), at(1.1, 0.0, -0.62), [0.22, 1.1]),
  ];
}
/** 細い骨（指の骨組み）：a → b → c。太い四角柱と細い四角柱、節の横向きの塊、節をまたぐ細い筋交い */
function strut(name, a, b, c, up) {
  const d1 = unit(sub3(b, a)), side = unit(cross(d1, up));
  return [
    piece(`${name}（根）`, prism(a, b, [0.05, 0.042], up, { w1: 0.036, h1: 0.032 })),
    piece(`${name}（先）`, prism(lerp3(a, b, 0.96), c, [0.03, 0.028], up, { w1: 0.01, h1: 0.01 })),
    piece(`${name}の節`, prism(along(b, side, -0.045), along(b, side, 0.045), [0.06, 0.052], up), { color: DARK }),
    piece(`${name}の筋交い`, prism(along(lerp3(a, b, 0.6), up, -0.04), along(lerp3(b, c, 0.3), up, -0.012), [0.016, 0.016], up), { color: STEEL }),
    piece(`${name}の覆い`, prism(along(lerp3(a, b, 0.1), up, 0.028), along(lerp3(a, b, 0.75), up, 0.03), [0.07, 0.022], up, { w1: 0.045, h1: 0.016 })),
  ];
}
const PLANE_N = [0.2, 0.1, 1];
/** 骨組みを、翼の面（前向きの PLANE_N）の中に置く */
const frameIn = (name, a, b, s, nrm = PLANE_N) => frame(name, a, b, unit(cross(nrm, sub3(b, a))), s);

// ---- 刃の翼：軸から 6 枚の刃を扇に開く。刃は鎧戸のように少しずつねじって重ねる ----
function blades() {
  const H = [0.15, 0.04, -0.14], e1 = unit([1, 0, -0.45]), e2 = unit([0, 1, -0.15]), n = unit(cross(e1, e2));   // 扇の面（n は前）
  const th = [64, 41, 18, -6, -30, -54], L = [1.1, 1.3, 1.28, 1.12, 0.95, 0.78];
  const out = [...rootMech(), ...frameIn('翼の腕', [0.02, 0, -0.03], H, 0.055),
    ...xf(lathe('翼の軸', [[-0.05, 0.05], [-0.04, 0.07], [0.03, 0.075], [0.05, 0.06], [0.065, 0.03]], { n: 12 }), { rot: aim(n), mov: H }),
    ...xf([piece('翼の軸のふた', lathePlanes([[0.06, 0.034], [0.075, 0.03], [0.082, 0.012]], 12), { color: ACCENT })], { rot: aim(n), mov: H })];
  th.forEach((t, i) => {
    const d = add3(mul3(e1, Math.cos(t * R)), mul3(e2, Math.sin(t * R))), p0 = add3(mul3(e1, -Math.sin(t * R)), mul3(e2, Math.cos(t * R)));
    const p = unit(add3(mul3(p0, Math.cos(22 * R)), mul3(n, Math.sin(22 * R))));   // 刃の幅の向き（扇の面から 22° ねじる）
    const o = along(H, n, -0.012 * i);                                               // 下の刃ほど後ろへ
    const st = (r, w, tk, back, color) => { const c = along(along(o, d, r), n, -back); return { a: along(c, p, w * 0.42), b: along(c, p, -w * 0.58), t: tk, ...(color ? { color } : {}) }; };
    const l = L[i];
    out.push(...strip(`刃 ${i + 1}の根`, [st(0.04, 0.07, 0.05, 0), st(0.2, 0.12, 0.055, 0.005)], { color: DARK }),
      ...strip(`刃 ${i + 1}`, [st(0.17, 0.13, 0.04, 0.004), st(0.45 * l, 0.19, 0.034, 0.03), st(0.8 * l, 0.12, 0.02, 0.09, i < 2 ? ACCENT : undefined), st(l, 0.012, 0.005, 0.15)]));
  });
  return W('wingblade', '刃の翼（刃 6 枚）', 'mech', [1.4, 1.9, 0.8], { hang: [0.2, -0.06, -0.2] }, out);
}

// ---- 大きなバインダー：腕の先に下がる、長くて厚い装甲の板。内側の下に噴射口 ----
function binder() {
  const J = [0.2, 0.12, -0.17], T = [0.3, 0.5, -0.22], Bm = [0.66, -1.05, -0.5], ax = unit(sub3(Bm, T)), len = Math.hypot(...sub3(Bm, T));
  const ch = unit([0.3, 0.06, -1]);                       // 板の幅の向き（前から後ろへ、後ろほど外）
  let n = unit(cross(ch, ax)); if (n[0] < 0) n = mul3(n, -1);   // 板の外の面の向き
  const at = (t, off = 0) => along(along(T, ax, t * len), n, off);
  const st = (t, w, tk, { off = 0, k = 0.4, color } = {}) => { const c = at(t, off); return { a: along(c, ch, -w * 0.45), b: along(c, ch, w * 0.55), t: tk, k, n, ...(color ? { color } : {}) }; };
  const up = unit(sub3(T, Bm));
  return W('wingbinder', '大きなバインダー（噴射口付き）', 'mech', [0.8, 1.7, 0.7], {}, [
    ...rootMech(), ...frameIn('翼の腕', [0.02, 0.0, -0.03], J, 0.055),
    ...xf(lathe('バインダーの関節', [[-0.06, 0.04], [-0.045, 0.062], [0.045, 0.062], [0.06, 0.04]], { n: 12, color: DARK }), { rot: aim(ch), mov: J }),
    ...frameIn('バインダーの腕', J, at(0.3, -0.03), 0.045, ch),
    ...strip('バインダー', [st(0, 0.14, 0.04), st(0.1, 0.36, 0.1), st(0.42, 0.44, 0.12), st(0.82, 0.34, 0.085), st(1, 0.1, 0.025)]),
    ...strip('バインダーの外の板', [st(0.14, 0.16, 0.03, { off: 0.045, k: 0.5 }), st(0.42, 0.24, 0.04, { off: 0.058, k: 0.5 }), st(0.74, 0.17, 0.03, { off: 0.045, k: 0.5 })], { color: ACCENT }),
    ...strip('バインダーの縁', [st(0.8, 0.36, 0.1, { color: DARK }), st(1.01, 0.11, 0.035)], { color: DARK }),
    ...[0.62, 0.8].flatMap((t, i) => named(`${i + 1} `, xf(bell('バインダーの噴射口', { len: 0.1, r0: 0.04, r1: 0.066, glow: FLAME, n: 10 }), { rot: aim(add3(up, mul3(n, 0.5))), mov: at(t, -0.07 + i * 0.012) }))),
  ]);
}

// ---- 戦闘機の翼：上へ反った後退翼、翼の下にエンジン、翼端に小さな立った翼 ----
function jet() {
  const S = [{ a: [0.04, 0.0, 0.02], b: [0.04, -0.02, -0.5], t: 0.075 }, { a: [0.42, 0.1, -0.16], b: [0.42, 0.075, -0.56], t: 0.058 }, { a: [0.95, 0.27, -0.46], b: [0.95, 0.25, -0.68], t: 0.03 }, { a: [1.36, 0.42, -0.7], b: [1.36, 0.41, -0.8], t: 0.012 }];
  const flap = (s, k0, k1, t) => ({ a: lerp3(s.a, s.b, k0), b: lerp3(s.a, s.b, k1), t, k: 0.25 });
  const E = { rot: [84, 0, 0], mov: [0.4, 0.0, -0.5] };   // エンジンの軸（+y を前へ。口は後ろ）
  return W('wingjet', '戦闘機の翼（翼の下にエンジン）', 'mech', [1.45, 0.6, 0.9], { hang: [0.8, 0.2, -0.5] }, [
    ...rootMech(),
    ...strip('主翼', S),
    ...strip('主翼の動く縁（内）', [flap(S[0], 0.76, 1.03, 0.03), flap(S[1], 0.76, 1.03, 0.026)], { color: DARK }),
    ...strip('主翼の動く縁（外）', [flap(S[1], 0.72, 1.04, 0.024), flap(S[2], 0.72, 1.04, 0.016)], { color: DARK }),
    ...strip('翼端の立った翼', [{ a: [1.33, 0.4, -0.67], b: [1.34, 0.4, -0.81], t: 0.02 }, { a: [1.42, 0.62, -0.78], b: [1.42, 0.62, -0.88], t: 0.012, color: ACCENT }, { a: [1.44, 0.68, -0.84], b: [1.44, 0.68, -0.89], t: 0.005 }]),
    ...xf([...lathe('エンジン', [[-0.26, 0.06, DARK], [-0.23, 0.08], [-0.1, 0.092], [0.14, 0.09], [0.22, 0.078], [0.25, 0.066]], { n: 12 }),
      piece('エンジンの吸気口', lathePlanes([[0.23, 0.058], [0.262, 0.058]], 12), { color: BLACK }),
      piece('エンジンの吸気口の縁', lathePlanes([[0.24, 0.072], [0.255, 0.076], [0.27, 0.07]], 12), { color: ACCENT }),
      ...xf(bell('エンジンの噴射口', { len: 0.12, r0: 0.055, r1: 0.085, glow: FLAME }), { mov: [0, -0.26, 0] })], E),
    hull('エンジンの吊り柱', [[0.38, 0.09, -0.3], [0.42, 0.095, -0.3], [0.38, 0.07, -0.56], [0.42, 0.075, -0.56], [0.38, 0.04, -0.36], [0.42, 0.04, -0.36], [0.38, 0.03, -0.6], [0.42, 0.03, -0.6]], { color: DARK }),
  ]);
}

// ---- ひれの翼：斜め上へ出た腕から、長いひれを 3 枚下げる（外のひれほど外へ開く） ----
function plates() {
  const R0 = [0.14, 0.08, -0.13], R1 = [0.5, 0.36, -0.33], out = [...rootMech(), ...frameIn('翼の腕', [0.02, 0, -0.03], R0, 0.055), ...frameIn('ひれを下げる腕', R0, R1, 0.05)];
  for (let j = 0; j < 3; j++) {
    const o = lerp3(R0, R1, (j + 0.6) / 3.2), d = unit([0.2 + 0.2 * j, -1, -0.28 - 0.1 * j]), ch = unit([0.35, 0.1, -1]), l = 1.25 + 0.1 * j;
    const st = (r, w, tk, color) => { const c = along(o, d, r); return { a: along(c, ch, -w * 0.4), b: along(c, ch, w * 0.6), t: tk, k: 0.45, ...(color ? { color } : {}) }; };
    out.push(
      ...xf(lathe(`ひれ ${j + 1}の軸`, [[-0.045, 0.03], [-0.035, 0.045], [0.035, 0.045], [0.045, 0.03]], { n: 10, color: DARK }), { rot: aim(ch), mov: along(o, d, 0.01) }),
      ...strip(`ひれ ${j + 1}`, [st(0.0, 0.1, 0.05), st(0.12, 0.2, 0.06), st(0.3 * l, 0.24, 0.055, ACCENT), st(0.36 * l, 0.24, 0.052), st(0.85 * l, 0.17, 0.035), st(l, 0.03, 0.01)]));
  }
  return W('wingplate', 'ひれの翼（長いひれ 3 枚）', 'mech', [1.2, 1.7, 0.9], { hang: lerp3(R0, R1, 1.02) }, out);
}

/** 装甲の梁：a → b。断面はひし形（幅 w・厚み t）、幅の向きは p */
const beam = (name, a, b, p, [w0, w1], [t0, t1], o = {}) => strip(name, [{ a: along(a, p, w0 / 2), b: along(a, p, -w0 / 2), t: t0, k: 0.5 }, { a: along(b, p, w1 / 2), b: along(b, p, -w1 / 2), t: t1, k: 0.5 }], o);
/** 関節の太鼓（中心 c、軸 v、半径 r、半分の長さ h） */
const drum = (name, c, v, r, h, o = {}) => xf(lathe(name, [[-h, r * 0.7], [-h * 0.7, r], [h * 0.7, r], [h, r * 0.7]], { n: 12, color: DARK, ...o }), { rot: aim(v), mov: c });

// ---- 羽根の翼：装甲の腕（肩 → ひじ → 手首 → 先。四角柱を組んだ骨組み・関節の太鼓・噴射口）に、まっすぐな刃の形の羽を 3 列と、付け根を覆う装甲の板を重ねる ----
function feathers() {
  const S = [0.05, 0.0, -0.05], E = [0.38, 0.56, -0.54], Wr = [0.82, 0.9, -0.68], Tp = [1.18, 0.84, -0.8];
  const n = unit([0.22, 0.12, 1]);   // 翼の面の向き（前）
  const perp = (a, b) => unit(cross(n, sub3(b, a)));
  const out = [...rootMech(),
    ...frame('翼の腕（肩）', S, E, perp(S, E), 0.085), ...frame('翼の腕（前腕）', E, Wr, perp(E, Wr), 0.07), ...frame('翼の腕（先）', Wr, Tp, perp(Wr, Tp), 0.045),
    ...drum('翼のひじの関節', E, n, 0.095, 0.075), ...drum('翼の手首の関節', Wr, n, 0.075, 0.06),
    ...xf(bell('翼の噴射口', { len: 0.1, r0: 0.045, r1: 0.072, glow: FLAME, n: 10 }), { rot: aim([0, 1, 0.7]), mov: along(E, n, -0.1) })];
  /** 羽 1 枚：根元 o、向き d、長さ l、幅 w。まっすぐな板で、先は斜めに切る。翼の面から少しねじって隣の羽と重ねる。根元に暗い受け */
  const feather = (name, o, d, l, w, { twist = 14, color = MAIN, lift = 0, tk = 0.03, base = true } = {}) => {
    const side = unit(cross(n, d)), p = unit(add3(mul3(side, Math.cos(twist * R)), mul3(n, Math.sin(twist * R))));
    const st = (r, f0, f1, t) => { const c = along(along(o, d, r * l), n, lift); return { a: along(c, p, w * f0), b: along(c, p, w * f1), t, k: 0.5 }; };
    return [...strip(name, [st(0, 0.3, -0.3, tk), st(0.08, 0.5, -0.5, tk * 1.1), st(0.8, 0.5, -0.5, tk * 0.7), st(1, 0.5, 0.38, 0.004)], { color }),
      ...(base ? strip(`${name}の受け`, [st(-0.02, 0.34, -0.34, tk * 1.6), st(0.09, 0.53, -0.53, tk * 1.6)], { color: DARK }) : [])];
  };
  const dirAt = deg => unit(add3(mul3([1, 0, -0.18], Math.cos(deg * R)), mul3([0, 1, -0.1], Math.sin(deg * R))));
  for (let j = 0; j < 7; j++) out.push(...feather(`先の羽 ${j + 1}`, lerp3(Wr, Tp, j / 6), dirAt(-82 + j * 7), 1.45 - 0.04 * j, 0.2, { lift: -0.006 * j }));
  for (let j = 0; j < 6; j++) out.push(...feather(`中の羽 ${j + 1}`, lerp3(E, Wr, j / 6), dirAt(-92 + j * 1.5), 1.0 + 0.07 * j, 0.21, { lift: 0.006 * (6 - j) }));
  for (let j = 0; j < 3; j++) out.push(...feather(`肩の羽 ${j + 1}`, lerp3(S, E, (j + 1.5) / 4.5), dirAt(-97 + j * 2), 0.5 + 0.15 * j, 0.2, { lift: 0.03 + 0.008 * (3 - j) }));
  // 付け根を覆う装甲の板を 2 段（腕のすぐ下）
  for (let j = 0; j < 5; j++) out.push(...feather(`覆う板（下）${j + 1}`, lerp3(E, Tp, j / 4.6), dirAt(-88 + j * 6), 0.5, 0.27, { lift: 0.06, tk: 0.04, twist: 10, base: false }));
  for (let j = 0; j < 4; j++) out.push(...feather(`覆う板（上）${j + 1}`, lerp3(E, Tp, (j + 0.3) / 4), dirAt(-88 + j * 6), 0.26, 0.3, { lift: 0.09, tk: 0.03, twist: 8, base: false, color: DARK }));
  return W('wingfeather', '羽根の翼（装甲の腕と刃の羽）', 'organic', [1.5, 2.0, 0.7], {}, out);
}

// ---- 骨組みの翼：装甲の腕と、関節で折れる 4 本の骨組み、その間に張った暗い放熱の膜（縁は骨の間で切れ込む） ----
function bat() {
  const S = [0.05, 0.0, -0.05], E = [0.4, 0.46, -0.38], Wr = [0.76, 0.64, -0.48], FILM = '#33404f', n = unit([0.2, 0.1, 1]);
  const perp = (a, b) => unit(cross(n, sub3(b, a)));
  // 骨組み（手首から。途中の関節、先）と、ひじから下がる骨組み、体の側の縁
  const fingers = [[Wr, [1.2, 0.86, -0.52], [1.5, 0.66, -0.62]], [Wr, [1.25, 0.5, -0.6], [1.52, 0.02, -0.7]], [Wr, [1.05, 0.25, -0.6], [1.15, -0.5, -0.68]], [Wr, [0.78, 0.15, -0.55], [0.72, -0.66, -0.6]],
    [E, [0.36, 0.05, -0.4], [0.34, -0.4, -0.42]], [S, [0.04, -0.14, -0.06], [0.03, -0.3, -0.08]]];
  const N = 4, curves = fingers.map(([a, b, c]) => [a, lerp3(a, b, 0.5), b, lerp3(b, c, 0.5), c]);
  const out = [...rootMech(), ...frame('翼の腕（肩）', S, E, perp(S, E), 0.075), ...frame('翼の腕（前腕）', E, Wr, perp(E, Wr), 0.065),
    ...drum('翼のひじの関節', E, n, 0.08, 0.065), ...drum('翼の手首の関節', Wr, n, 0.08, 0.07),
    ...xf(bell('翼の噴射口', { len: 0.09, r0: 0.04, r1: 0.064, glow: FLAME, n: 10 }), { rot: aim([-0.2, -0.7, 0.7]), mov: along(Wr, n, -0.1) })];
  fingers.slice(0, 5).forEach(([a, b, c], f) => {
    const nm = f < 4 ? `骨組み ${f + 1}` : 'ひじの骨組み';
    out.push(...strut(nm, a, b, c, unit(cross(n, sub3(b, a)))));
  });
  // 膜：隣り合う骨組みの間。真ん中の線は縁で手前へ引き、縁を切れ込ませる
  for (let f = 0; f + 1 < curves.length; f++) {
    const A = curves[f], Bc = curves[f + 1], root = lerp3(A[0], Bc[0], 0.5);
    const M = A.map((p, i) => { const m = lerp3(p, Bc[i], 0.5); return lerp3(m, root, 0.22 * (i / N) ** 2); });
    out.push(...strip(`放熱の膜 ${f + 1}（上）`, A.map((p, i) => ({ a: p, b: M[i], t: 0.012, k: 0.5 })), { color: FILM }),
      ...strip(`放熱の膜 ${f + 1}（下）`, M.map((p, i) => ({ a: p, b: Bc[i], t: 0.012, k: 0.5 })), { color: FILM }));
  }
  return W('wingbat', '骨組みの翼（関節の骨組みと放熱の膜）', 'organic', [1.55, 1.6, 0.6], {}, out);
}

// ---- 透ける板の羽：まっすぐな桁に、直線の縁の透ける板を張った羽を上下に 2 枚。桟と後ろの縁の枠 ----
function insect() {
  const GLASS = '#27c8ff', n = unit([0.25, 0.1, 1]);
  const wing = (name, A0, A1, widths, ch) => {
    const ts = [0, 0.1, 0.3, 0.5, 0.7, 0.88, 1];
    const sts = ts.map((t, i) => { const o = lerp3(A0, A1, t); return { a: along(o, ch, -0.02), b: along(o, ch, widths[i]), t: 0.014, k: 0.2 }; });
    return [...strip(name, sts, { color: GLASS, opacity: 0.42 }), ...frame(`${name}の桁`, A0, lerp3(A0, A1, 0.4), mul3(ch, -1), 0.036), piece(`${name}の桁（先）`, prism(lerp3(A0, A1, 0.38), A1, [0.03, 0.03], ch, { w1: 0.01, h1: 0.01 }), { color: DARK }),
      ...sts.slice(1, -1).map((s, i) => piece(`${name}の桟 ${i + 1}`, rod(s.a, s.b, 0.009, 0.006, 4), { color: DARK })),
      piece(`${name}の後ろの枠`, rod(sts[1].b, sts[5].b, 0.008, 0.008, 4), { color: DARK }),
      ...drum(`${name}の軸`, A0, n, 0.05, 0.045)];
  };
  return W('winginsect', '透ける板の羽（4 枚）', 'organic', [1.55, 1.3, 0.6], {}, [
    ...rootMech(),
    ...wing('上の羽', [0.07, 0.04, -0.09], [1.5, 0.72, -0.56], [0.05, 0.27, 0.3, 0.3, 0.28, 0.25, 0.03], unit([0.3, -1, -0.25])),
    ...wing('下の羽', [0.07, -0.05, -0.1], [1.25, -0.12, -0.56], [0.05, 0.22, 0.25, 0.25, 0.23, 0.2, 0.03], unit([-0.05, -1, -0.3]))]);
}

// ---- ORB 収納ラック：斜め上へ出た装甲の梁の後ろの縁に、オーブ（ORB：長い砲身の遠隔砲台。wingear.js）の収納口を並べた翼。
//      部品は docks（収納口の位置 at・砲身の向き d・面の向き n）を持ち、オーブは 1 基ずつそこへ入る。形は 5 種類：
//        一列・扇（外の砲身ほど外へ開く）／一列・平行／2・2・1（2 基・2 基・1 基に分けて間をあける）／
//        上向き 3・下向き 2（1 本の梁の上の縁に上向き 3 基、下の縁に下向き 2 基）／上下 2 段（上の梁に 3 基、下の後ろの梁に 2 基）
//      一列・扇の後ろの縁からは、光の刃（エフェクト fx.js）も出せる ----
/** 一列・扇のラックの梁の位置と向き（光の刃のエフェクトが同じ値を使う）：A 根元、d0 伸びる向き、n 翼の面の向き、ch 幅の向き */
export const LIGHT_EMITTER = (() => { const A = [0.1, 0.04, -0.1], d0 = unit(sub3([0.62, 0.5, -0.36], A)), n = unit([0.25, 0.1, 1]); return { A, d0, n, ch: unit(cross(n, d0)) }; })();
const ORB_DIR = [0.56, -0.72, -0.38], ORB_UP = [0.5, 0.7, -0.62], FAN_DIR = j => [0.3 + 0.13 * j, -1 + 0.14 * j, -0.38];
/** ラックの梁：P0 から d0 の向きへ長さ len。装甲の覆い・下の枠・溝と、ss（P0 からの距離）の位置の収納口（受け・左右の仕切り板）。pieces と docks を返す。
 *  ss の値を [距離, 1] と書くと、梁の上の縁の収納口（上向きに挿す）。dirOf(j, side)：j 番目の収納口の砲身の向き（side は下の縁 −1・上の縁 +1） */
function rackBeam(name, P0, len, ss, dirOf) {
  const { d0, n, ch } = LIGHT_EMITTER, k = len / 0.74;
  const g = (r, w, tk, off = 0) => { const c = along(along(P0, d0, r * k), ch, off); return { a: along(c, ch, w / 2), b: along(c, ch, -w / 2), t: tk, k: 0.4 }; };
  const pieces = [
    ...strip(name, [g(-0.04, 0.12, 0.09), g(0.12, 0.2, 0.115), g(0.5, 0.17, 0.095), g(0.7, 0.1, 0.06), g(0.76, 0.03, 0.025)]),
    ...strip(`${name}の下の枠`, [g(0.0, 0.07, 0.1, -0.09), g(0.12, 0.08, 0.125, -0.115), g(0.62, 0.07, 0.1, -0.105), g(0.73, 0.03, 0.04, -0.06)], { color: DARK }),
    ...strip(`${name}の差し色の筋`, [g(0.14, 0.03, 0.122, 0.03), g(0.48, 0.026, 0.1, 0.025)], { color: ACCENT })];
  const docks = ss.map((e, j) => {
    const [s, side] = Array.isArray(e) ? e : [e, -1];
    const c = along(P0, d0, s), o = along(c, ch, side * 0.15), d = unit(dirOf(j, side)), q = unit(cross(n, d));
    pieces.push(piece(`${name}の収納口 ${j + 1}`, prism(along(c, ch, side * 0.04), along(o, d, 0.01), [0.07, 0.075], n, { w1: 0.135, h1: 0.065 }), { color: DARK }),
      ...(side > 0 ? [] : [-1, 1]).map(sg => piece(`${name}の仕切り板 ${j + 1}（${sg > 0 ? '外' : '内'}）`, prism(along(along(o, q, sg * 0.062), d, -0.05), along(along(o, q, sg * 0.062), d, 0.06), [0.012, 0.1], n, { w1: 0.008, h1: 0.07 }))));
    return { at: o, d, n };
  });
  return { pieces, docks };
}
function rackWing(id, name, size, beams, extra = () => []) {
  const { A, n } = LIGHT_EMITTER, built = beams.map(b => rackBeam(b.name, b.P0, b.len, b.ss, b.dir));
  const w = W(id, name, 'rack', size, { light: [0, 0, 0] }, [...rootMech(), ...frameIn('翼の腕', [0.02, 0, -0.03], A, 0.05), ...drum('ラックの関節', A, n, 0.075, 0.07),
    ...built.flatMap(b => b.pieces), ...extra()]);
  return { ...w, docks: built.flatMap(b => b.docks) };
}
function racks() {
  const { A, d0, n } = LIGHT_EMITTER, row = [0.1, 0.235, 0.37, 0.505, 0.64];
  const lowP0 = along(add3(A, [0.03, -0.34, 0]), n, -0.36);
  return [
    rackWing('wingrackfan', 'ORB 収納ラック（一列・扇）', [0.8, 0.7, 0.5], [{ name: 'ラックの梁', P0: A, len: 0.8, ss: row, dir: FAN_DIR }]),
    rackWing('wingrackrow', 'ORB 収納ラック（一列・平行）', [0.8, 0.7, 0.5], [{ name: 'ラックの梁', P0: A, len: 0.8, ss: row, dir: () => ORB_DIR }]),
    rackWing('wingrack221', 'ORB 収納ラック（2・2・1）', [1.0, 0.8, 0.6], [{ name: 'ラックの梁', P0: A, len: 1.0, ss: [0.1, 0.24, 0.45, 0.59, 0.8], dir: () => ORB_DIR }]),
    rackWing('wingrackud', 'ORB 収納ラック（上向き 3・下向き 2）', [0.8, 0.9, 0.5], [{ name: 'ラックの梁', P0: A, len: 0.8, ss: [[0.32, 1], [0.48, 1], [0.64, 1], 0.2, 0.4], dir: (j, side) => (side > 0 ? ORB_UP : ORB_DIR) }]),
    rackWing('wingracktwo', 'ORB 収納ラック（上下 2 段）', [0.7, 1.0, 0.7], [
      { name: 'ラックの上の梁', P0: A, len: 0.6, ss: [0.1, 0.25, 0.4], dir: () => ORB_DIR },
      { name: 'ラックの下の梁', P0: lowP0, len: 0.46, ss: [0.1, 0.25], dir: () => ORB_DIR }],
    () => [
      ...frameIn('下の段の腕', [0.0, -0.04, -0.06], lowP0, 0.045),
      piece('段をつなぐ柱（内）', prism(along(A, d0, 0.06), along(lowP0, d0, 0.06), [0.05, 0.045], d0), { color: DARK }),
      piece('段をつなぐ柱（外）', prism(along(A, d0, 0.5), along(lowP0, d0, 0.38), [0.045, 0.04], d0), { color: DARK }),
      piece('段をつなぐ筋交い', prism(along(A, d0, 0.1), along(lowP0, d0, 0.34), [0.028, 0.028], d0), { color: STEEL })]),
  ];
}

// ---- 放射の翼：背中の後ろへ出した軸の台から、細長いひれ 3 枚（左右で 6 枚）を放射状に開く。上と下の白いひれは体の高さほどの長さ、真ん中の差し色のひれは短い。
//      光の輪（エフェクト）の出どころ：ひれが輪を貫いて、その外まで伸びる ----
function radial() {
  const Hc = [-0.02, 0.0, -0.39], e1 = unit([1, 0, -0.12]), e2 = unit([0, 1, -0.06]), n = unit(cross(e1, e2));   // 開く面（n は前）
  const out = [...rootMech(), ...frame('ひれの台の腕', [0.0, 0, -0.04], Hc, [0, 1, 0], 0.06),
    ...drum('ひれの台', Hc, n, 0.1, 0.06), piece('ひれの台の覆い', prism(along(Hc, n, -0.07), along(Hc, n, -0.1), [0.16, 0.14], [0, 1, 0], { w1: 0.1, h1: 0.09 }))];
  // 寸法は、見せてもらった写真の上で測った比（頭から足までを 3 として）：白いひれの長さ 2.7・2.4、差し色のひれ 1.9。
  // 根元の 3 割は細い柱（幅 0.08）、その先が幅 0.22 の細長い刃。向きは水平から +60°・+3°・−45°
  [[60, 2.7, 1, MAIN, ACCENT], [3, 1.9, 0.72, ACCENT, MAIN], [-45, 2.4, 1, MAIN, ACCENT]].forEach(([deg, L, ws, col, line], i) => {
    const d = unit(add3(mul3(e1, Math.cos(deg * R)), mul3(e2, Math.sin(deg * R)))), p0 = unit(cross(n, d));
    const p = unit(add3(mul3(p0, Math.cos(12 * R)), mul3(n, Math.sin(12 * R)))), o = along(Hc, n, -0.02 * i), nm = `ひれ ${i + 1}`;
    const at = (r, off = 0) => along(along(o, d, r * L), p0, off);
    const st = (r, w, tk, sh = 0) => { const c = along(at(r), p, sh * ws); return { a: along(c, p, w * ws / 2), b: along(c, p, -w * ws / 2), t: tk, k: 0.5 }; };
    out.push(
      // 根元の骨組み（長さの 3 割）：途中で折れる主の柱 2 本、細い副の柱、斜めの筋交い 2 本、覆い、軸
      piece(`${nm}の根の柱（根）`, prism(at(0.01), at(0.19, 0.012), [0.075, 0.09], p0, { w1: 0.065, h1: 0.08 }), { color: DARK }),
      piece(`${nm}の根の柱（先）`, prism(at(0.18, 0.012), at(0.35), [0.065, 0.08], p0, { w1: 0.05, h1: 0.065 }), { color: DARK }),
      piece(`${nm}の根の副の柱`, prism(at(0.03, -0.085), at(0.33, -0.05), [0.028, 0.028], p0), { color: STEEL }),
      piece(`${nm}の根の筋交い 1`, prism(at(0.05, -0.08), at(0.12, 0.0), [0.022, 0.022], p0), { color: STEEL }),
      piece(`${nm}の根の筋交い 2`, prism(at(0.12, 0.0), at(0.2, -0.065), [0.022, 0.022], p0), { color: STEEL }),
      piece(`${nm}の根の覆い`, prism(at(0.04, 0.05), at(0.3, 0.06), [0.095, 0.035], p0, { w1: 0.07, h1: 0.028 }), { color: col }),
      ...drum(`${nm}の軸`, at(0.02), n, 0.06, 0.05),
      // ひれ：肩の段で広がる細長い刃。先の手前で一段細くなって、斜めに尖る
      ...strip(nm, [st(0.3, 0.09, 0.05), st(0.36, 0.22, 0.06), st(0.78, 0.2, 0.045), st(0.8, 0.145, 0.04, -0.02), st(0.94, 0.12, 0.024, -0.02), st(1, 0.01, 0.006, 0.04)], { color: col }),
      ...strip(`${nm}の筋`, [st(0.4, 0.05, 0.072), st(0.74, 0.04, 0.056)], { color: line }),
      ...strip(`${nm}の先の筋`, [st(0.83, 0.03, 0.046, -0.02), st(0.92, 0.024, 0.034, -0.02)], { color: line }));
  });
  return W('wingradial', '放射の翼（開く長いひれ 6 枚）', 'mech', [2.0, 4.2, 0.8], {}, out);
}

export default [blades(), radial(), binder(), jet(), plates(), feathers(), bat(), insect(), ...racks()];
