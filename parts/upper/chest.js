// 胸（胴の骨 torso）。原点は胸の下端の中心（骨格図の chest.yBot、y 2.1）。x 右・y 上・z 前。
// 形：前から見て下（腹）が細く上（肩）が広い逆三角形。暗い芯（内側の骨組み）の上に、装甲の板を重ねる。
//   胸の装甲：幅いっぱいの大きな板（左右 2 枚・1 枚・丸い・中ほどに横の稜）。その上に重ねる板と、真ん中を縦に通る稜
//   腹の板：胸の装甲の下から腰の上まで、段に分けた板（中央の枠で左右に分ける・幅いっぱい・下向きの V 字）
//   横の装甲（上下 2 枚と重ねる板）、上の板、背中（上下の板・中央の稜・重ねる板）、肩の塊（肩関節の軸受けが差さる所）
// 板はどれも 4 辺を 45° に落とし、板どうしの間（1〜2 cm）から暗い芯が見える（溝は本当のくぼみ）
// 上半身は腹の中心（原点の 0.1 下）のまわりに、ひねり ±70°・前 17°・後ろ 25°・横 ±0.22 rad 回る。下端は腰の帯（y −0.15）より
// 十分上で、下ほど細いので、どこへ傾いても帯に届かない。肩の塊の上は低くして、腕を上げたり振ったりした肩アーマーが当たらないようにする。
// 種類：標準・丸い（1 枚の丸い装甲に横の帯、腹は幅いっぱいの板）・角ばった（中ほどに横の稜、腹は V 字）・細い・差し色（1 枚の装甲、稜と重ねた板が差し色）
import { P, XL, YL, YH, both, mir, planesFromPoints, piece, DARK, ACCENT } from '../../xsasm-lib.js';
import { crown, steps } from '../lower/shape.js';

const hull = (name, pts, o = {}) => piece(name, planesFromPoints(pts), o);
const mirP = pts => pts.map(p => [-p[0], p[1], p[2]]);
/** 左右の対（+x の点から、−x は鏡像） */
const pairOf = (name, pts, o = {}) => [hull(`${name}（+x）`, pts, o), hull(`${name}（−x）`, mirP(pts), o)];
/** 面で作った +x 側の部品と、その鏡像 */
const pairPl = (name, planes, o = {}) => [piece(`${name}（+x）`, planes, o), piece(`${name}（−x）`, planes.map(mir), o)];

const AX = { x: [0, 1, 2], y: [1, 0, 2], z: [2, 0, 1] };   // 面の軸と、面の上の 2 軸 (u, v)
/**
 * 盛り上がった板：面 p[axis] = sign · f(u, v)（u, v は axis 以外の 2 軸、crown と同じ）を、u が a0〜a1・v が b0〜b1 の範囲で切り、
 * 4 辺を 45° に bev だけ落とす。裏は面の中央から depth 奥の平面（芯に差し込む）。extra は足す面
 */
export function slab(axis, sign, f, [a0, a1], [b0, b1], { bev = 0.012, depth = 0.05, na = 4, nb = 3, extra = [] } = {}) {
  const [ia, iu, iv] = AX[axis], uc = (a0 + a1) / 2, vc = (b0 + b1) / 2;
  const at = (u, v, w) => { const p = [0, 0, 0]; p[ia] = sign * w; p[iu] = u; p[iv] = v; return p; };
  const n = (du, dv, dw) => { const q = [0, 0, 0]; q[ia] = sign * dw; q[iu] = du; q[iv] = dv; return q; };
  return [...crown(axis, sign, f, steps(a0, a1, na), steps(b0, b1, nb)),
    P(n(0, 0, -1), at(uc, vc, f(uc, vc) - depth)),
    P(n(1, 0, 0), at(a1, vc, 0)), P(n(-1, 0, 0), at(a0, vc, 0)), P(n(0, 1, 0), at(uc, b1, 0)), P(n(0, -1, 0), at(uc, b0, 0)),
    P(n(1, 0, 1), at(a1 - bev, vc, f(a1 - bev, vc))), P(n(-1, 0, 1), at(a0 + bev, vc, f(a0 + bev, vc))),
    P(n(0, 1, 1), at(uc, b1 - bev, f(uc, b1 - bev))), P(n(0, -1, 1), at(uc, b0 + bev, f(uc, b0 + bev))), ...extra];
}

/**
 * wb・wt 下と上の横の半分の幅、top 上の端、zf 芯の前（上）、zb 芯の後ろ（上）、bz 胸の装甲の前の高さ、
 * br 胸の装甲の形（'split' 中央の稜で左右 2 枚、'single' 1 枚、'round' 丸い 1 枚、'wedge' 中ほどに横の稜が立つ）、
 * keel 中央の縦の稜、panels 胸の装甲の上に重ねる板（'pair' 左右、'band' 横に 1 本）、
 * abs 腹の板の段の数、absStyle 腹の板の並び（'split' 中央の枠で左右に分ける、'band' 幅いっぱい、'chevron' 下向きの V 字）、
 * accent 差し色（'br' 胸の装甲、'trim' 中央の稜と重ねた板）
 */
function chest({ id, name, wb = 0.21, wt = 0.31, top = 0.555, zf = 0.2, zb = 0.18, br = 'split', bz = 0.27, keel = true, panels = 'pair',
  abs = 2, absStyle = 'split', accent = null }) {
  const sideX = y => wb + (wt - wb) * Math.min(1, y / 0.45);          // 芯の横の面（下ほど細い）
  const frontZ = y => 0.15 + (zf - 0.15) * Math.min(1, y / 0.3);      // 芯の前の面（下ほど奥）
  const acc = k => (accent === k ? { color: ACCENT } : {});
  const out = [];
  // 芯
  out.push(hull('胸の芯', [
    ...[1, -1].flatMap(s => [[s * wb, 0, 0.15], [s * wb, 0, -0.14], [s * sideX(0.3), 0.3, zf], [s * sideX(0.3), 0.3, -zb],
      [s * wt, 0.47, zf - 0.01], [s * wt, 0.47, -zb + 0.01], [s * 0.13, top, zf - 0.07], [s * 0.13, top, -zb + 0.06]])], { color: DARK }));

  // 胸の装甲（上）：幅いっぱいの大きな板。前は横にも縦にも丸く、上の縁の少し下がいちばん前。下の縁は中央が少し下がる。
  // 外の角は上から見て後ろへ落とす（「八」の字）
  const fb = (x, y) => (br === 'wedge' ? bz - 0.35 * Math.abs(y - 0.42) : bz - 1.1 * (y - 0.44) ** 2) - (br === 'round' ? 0.6 : 0.4) * x * x - 0.1 * Math.sqrt(x * x + 0.002);
  const bib = (x0, x1) => [...crown('z', 1, fb, steps(x0, x1, 5), steps(0.28, 0.55, br === 'wedge' ? 2 : 4)), ...(br === 'wedge' ? crown('z', 1, fb, steps(x0, x1, 5), [0.4, 0.44]) : []),
    P([0, 0.25, -1], [0, 0.4, 0.12]), YH(top - 0.003), P([0, 1, 0.9], [0, top - 0.035, bz - 0.06]),
    ...both(P([0.14, -1, 0], [0, 0.255, 0])), ...both(P([1, 0, 0.75], [wt - 0.045, 0, bz - 0.07])), ...both(P([1, 0.3, 0], [wt + 0.005, 0.45, 0])), ...both(P([1, 0.9, 0], [wt - 0.03, 0.5, 0]))];
  if (br === 'split') out.push(...pairPl('胸の装甲', [...bib(0.03, wt), XL(0.03)], acc('br')));
  else out.push(piece('胸の装甲', bib(-wt, wt), acc('br')));
  // 胸の装甲の下の縁の暗い段
  out.push(piece('胸の装甲の下の段', [...crown('z', 1, (x, y) => bz - 0.035 - 0.4 * x * x, steps(-wt + 0.03, wt - 0.03, 5), [0.28]),
    P([0, 0.25, -1], [0, 0.4, 0.12]), ...both(P([0.14, -1, 0], [0, 0.232, 0])), P([0, 1, 0], [0, 0.3, 0]), ...both(P([1, 0, 0.75], [wt - 0.06, 0, bz - 0.09]))], { color: DARK }));
  // 中央の縦の稜：胸の装甲の真ん中を上から下まで通り、腹の上まで下りる。前へ 1.4 cm 出て、横は 45° に落とす
  if (keel) out.push(piece('胸の中央の稜', slab('z', 1, (x, y) => (y > 0.3 ? fb(0, y) : Math.min(fb(0, 0.3), frontZ(y) + 0.06)) + 0.014 - 3 * x * x,
    [-0.036, 0.036], [0.2, top - 0.02], { bev: 0.011, depth: 0.09, na: 2, nb: 6, extra: [P([0, 1, 0.9], [0, top - 0.035, fb(0, top - 0.035) + 0.01])] }), acc('trim')));
  // 胸の装甲に重ねる板：左右に 1 枚ずつ（外の辺は上ほど外）か、横に 1 本
  if (panels === 'pair') {
    const y0 = br === 'wedge' ? 0.43 : 0.35, x0 = keel ? 0.075 : 0.06;
    out.push(...pairPl('胸の装甲の板', slab('z', 1, (x, y) => fb(x, y) + 0.012, [x0, wt - 0.07], [y0, 0.505], { bev: 0.012, depth: 0.04, extra: [P([1, -0.35, 0], [wt - 0.07, y0, 0])] }), acc('trim')));
  } else if (panels === 'band') {
    out.push(piece('胸の装甲の帯', slab('z', 1, (x, y) => fb(x, y) + 0.012, [-(wt - 0.1), wt - 0.1], [0.405, 0.465], { bev: 0.01, depth: 0.04, na: 6, nb: 2 }), acc('trim')));
  }

  // 腹の板
  const y1s = 0.245, h = (y1s - 0.02) / abs, slope = (wt - wb) / 0.45;
  for (let k = 0; k < abs; k++) {
    const y0 = 0.02 + k * h, y1 = y0 + h - 0.01, w = sideX(y0) - 0.012;
    if (absStyle === 'split') {        // 中央の暗い枠で左右に分け、外ほど後ろへ回る
      const f = (x, y) => frontZ(y) + 0.024 - 0.35 * (x - 0.1) ** 2 - 0.05 * x;
      out.push(...pairPl(`腹の板 ${k + 1}`, slab('z', 1, f, [0.04, w], [y0, y1], { bev: 0.012, depth: 0.06, extra: [P([1, -slope, 0], [w, y0, 0])] })));
    } else if (absStyle === 'chevron') {   // 下向きの V 字：左右の半分（平行四辺形）を中央で合わせる。外ほど上がる
      const f = (x, y) => frontZ(y) + 0.022 - 0.3 * x * x, t = 0.3, yy = y => Math.min(y, y1s + 0.02);
      out.push(...pairPl(`腹の板 ${k + 1}`, [...crown('z', 1, f, steps(0.006, w, 4), steps(y0, yy(y1 + t * w), 3)),
        P([0, 0.18, -1], [0, 0, -0.13]), P([t, -1, 0], [0, y0, 0]), P([-t, 1, 0], [0, y1, 0]), XL(0.006), P([1, -slope, 0], [w, y0, 0]),
        P([1, 0, 1], [w - 0.016, 0, f(w, y0)]), P([t, -1, 1.2], [0, y0 + 0.008, f(0, y0)]), P([-t, 1, 1.2], [0, y1 - 0.008, f(0, y1)])]));
    } else {
      const f = (x, y) => frontZ(y) + 0.022 - 0.3 * x * x;
      out.push(piece(`腹の板 ${k + 1}`, [...crown('z', 1, f, steps(-w, w, 6), steps(y0, y1, 2)),
        P([0, 0.18, -1], [0, 0, -0.13]), YL(y0), YH(y1), ...both(P([1, -slope, 0], [w, y0, 0])), ...both(P([1, 0, 1], [w - 0.016, 0, f(w, y0)])),
        P([0, 1, 1], [0, y1 - 0.011, f(0, y1)]), P([0, -1, 1], [0, y0 + 0.008, f(0, y0)])]));
    }
  }
  if (absStyle === 'split') out.push(piece('腹の中央の枠', slab('z', 1, (x, y) => frontZ(y) + 0.03 - 3 * x * x, [-0.034, 0.034], [0.04, 0.27], { bev: 0.008, depth: 0.04, na: 2, nb: 2 }), { color: DARK }));

  // 横の装甲（左右）：上下 2 枚。横の面に沿って下ほど内、前後は丸く回る。上の板にはもう 1 枚小さな板を重ねる
  const sideF = lift => (y, z) => sideX(y) + 0.028 + lift - 0.7 * (z + 0.01) ** 2;
  out.push(...pairPl('横の装甲（上）', slab('x', 1, sideF(0), [0.2, 0.34], [-zb + 0.035, frontZ(0.3) - 0.04], { bev: 0.014, depth: 0.06 })));
  out.push(...pairPl('横の装甲（下）', slab('x', 1, sideF(-0.004), [0.035, 0.185], [-0.115, frontZ(0.1) - 0.035], { bev: 0.012, depth: 0.06 })));
  out.push(...pairPl('横の装甲の板', slab('x', 1, sideF(0.011), [0.235, 0.31], [-0.09, 0.07], { bev: 0.009, depth: 0.03, na: 2, nb: 2 })));

  // 上の板：胸の装甲の上の縁から背中の上の縁まで、上の面を覆う（真ん中に襟と首が通る）。前後・左右へ少し下がる
  out.push(piece('胸の上の板', [...crown('y', 1, (x, z) => top + 0.012 - 0.25 * x * x - 0.5 * (z + 0.02) ** 2, steps(-wt + 0.05, wt - 0.05, 5), steps(-zb + 0.03, bz - 0.08, 3)),
    YL(top - 0.03), ...both(P([1, 0.8, 0], [wt - 0.03, top - 0.02, 0])), P([0, 0.6, 1], [0, top, bz - 0.07]), P([0, 0.6, -1], [0, top, -zb + 0.03])]));

  // 背中：上の板と下の板（間から芯が見える）、中央の縦の稜、上の板に重ねる左右の板
  const fk = (x, y) => zb + 0.025 - 0.35 * x * x - 0.5 * (y - 0.33) ** 2;
  const backSide = both(P([1, -0.25, -0.4], [sideX(0.3) - 0.01, 0.3, -zb]));
  out.push(piece('背中の上の板', slab('z', -1, fk, [-(wt - 0.035), wt - 0.035], [0.225, 0.5], { bev: 0.016, depth: 0.06, na: 6, extra: [...backSide, P([0, 1, -0.6], [0, 0.49, -zb])] })));
  out.push(piece('背中の下の板', slab('z', -1, (x, y) => fk(x, y) - 0.004, [-(sideX(0.1) - 0.02), sideX(0.1) - 0.02], [0.05, 0.212], { bev: 0.014, depth: 0.06, na: 6, extra: backSide })));
  out.push(piece('背中の中央の稜', slab('z', -1, (x, y) => fk(0, y) + 0.016 - 3 * x * x, [-0.045, 0.045], [0.06, 0.49], { bev: 0.011, depth: 0.05, na: 2, nb: 5 }), acc('trim')));
  out.push(...pairPl('背中の板', slab('z', -1, (x, y) => fk(x, y) + 0.011, [0.09, wt - 0.085], [0.29, 0.455], { bev: 0.011, depth: 0.03, extra: [P([1, 0.3, 0], [wt - 0.085, 0.455, 0])] })));

  // 肩の塊（左右）：肩関節の軸受けが外から差さる。上は低く（外ほど下がる）
  out.push(...pairOf('肩の塊', [[0.19, 0.4, 0.1], [0.19, 0.4, -0.11], [0.27, 0.375, 0.09], [0.27, 0.375, -0.1], [0.32, 0.35, 0.1], [0.32, 0.35, -0.11],
    [0.34, 0.3, 0.1], [0.34, 0.3, -0.11], [0.2, 0.27, 0.13], [0.2, 0.27, -0.14], [0.3, 0.26, 0.12], [0.3, 0.26, -0.13]]));
  return { id, name, cat: '胸', size: [2 * wt + 0.08, top + 0.02, bz + zb + 0.04], pieces: out };
}

export default [
  chest({ id: 'chest', name: '胸' }),
  chest({ id: 'chestbarrel', name: '胸（丸い）', br: 'round', bz: 0.285, zf: 0.21, keel: false, panels: 'band', abs: 3, absStyle: 'band' }),
  chest({ id: 'chestangular', name: '胸（角ばった）', br: 'wedge', bz: 0.285, wb: 0.2, wt: 0.31, abs: 2, absStyle: 'chevron' }),
  chest({ id: 'chestslim', name: '胸（細い）', wb: 0.17, wt: 0.28, zf: 0.18, zb: 0.16, bz: 0.245, abs: 3 }),
  chest({ id: 'chestaccent', name: '胸（差し色）', br: 'single', accent: 'trim', abs: 2 }),
];
