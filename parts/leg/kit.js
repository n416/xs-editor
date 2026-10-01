// 脚の部品の共通の作り。原点はひざの中心 K（置くと +x 側の脚で x 0.2275・y 1.14・z 0）。股関節の軸は y +0.46、足首は y −0.87、足の裏は y −1.14。
// ひざの中は 2 重関節（xs-editor/doublejoint.js）：上の軸 P1（y +0.04）と下の軸 P2（y −0.16）を節（骨 knee）がつなぐ。先に下の軸が曲がり
// （すねだけが回る）、82° で曲がり切ったら、上の軸で節とすねが一緒に回る。外からは関節を見せない：
//   ・節（|x| < 0.056）は、すねの部品に入っている（parts/leg/shin.js）
//   ・横：すねの壁が、ひざの横（y 0.07）まで上がった横の装甲（|x| 0.074 より外、骨 shin）で関節を覆う。その内の層（|x| 0.058〜0.072）に、
//         太ももの下の板（骨 leg。上の軸から 0.098 以内）が下がる
//   ・前：ひざ当て（独立した部品。すねか太ももに付く。parts/leg/knee.js）。z 0.105 より前・|x| 0.072 まで
//   ・後ろ：節の後ろの板と、すねから上がる後ろの板。太ももの下の後ろ半分は細いフレーム（|x| 0.068）で、深く曲げると、すねの横の装甲がその左右に入る
//   ・太ももの中身は y 0.1 より上、すねの中身は y −0.24 より下
import { hull, cylX, widen, loft, octo2, seg } from '../limb/kit.js';
import { DARK, BLACK, MAIN } from '../../xsasm-lib.js';

export const Y1 = 0.04, Y2 = -0.16, YM = (Y1 + Y2) / 2;
/** 脚の部品は、下の寸法（x）を KX 倍に太らせ、外へ DX ずらして置く（ひざは横の軸で曲がるので、横に太らせても・ずらしても当たりは変わらない）。
 *  下の寸法は左右対称で ±XO（0.11）。置いたあとは 内 −0.085 〜 外 0.19（幅 0.275）：
 *    ・内側は股関節の軸から 0.085 まで（骨格図の脚の柱 legBand。その内は腰の真ん中の部品＝前掛け・後ろ腰の板の場所で、脚を振ると通る）
 *    ・外側は 0.19 まで（腰の横スカートの内の面が 0.197〜0.24 にあり、長いものはひざの下まで下がる）
 *  ひざの中心（下の寸法の x 0）は股関節の軸より DX（0.0525）外。
 *  太ももの上の端（y 0.25 より上）だけは股関節の軸の ±0.085 の中（その外に脚の台がある）：下の寸法で −XO 〜 TOP_XO（0.026） */
export const KX = 1.25, XO = 0.11, DX = KX * XO - 0.085;
export const wide = pc => widen(pc, KX, 1, DX);
export const TOP_XO = (0.085 - DX) / KX;
export const HIP_Y = 0.46, SOLE = -1.14;
export const LEG = { bone: 'leg', pivot: 'none' }, KNEE = { bone: 'knee', pivot: 'none' }, SHIN = { bone: 'shin', pivot: 'none' }, FOOT = { bone: 'foot', pivot: 'none' };
/** 足首の軸の高さ（足はこの横の軸のまわりに回る。xs-editor/doublejoint.js の ankleAngle） */
export const ANKLE_Y = -0.87;

/** 節：芯（回転の中心 = ひざの中心 K）、2 本の軸、後ろの板 */
export const link = (o = {}) => [
  { ...hull('ひざの節', [-0.045, 0.045].flatMap(x => [Y1, Y2].flatMap(y => [-0.035, 0.035].map(z => [x, y, z]))), { color: BLACK, ...KNEE, pivot: 'shin' }), center: [0, 0, 0] },
  cylX('ひざの上の軸', Y1, 0, 0.055, -0.055, 0.055, 16, { color: DARK, ...KNEE }), cylX('ひざの下の軸', Y2, 0, 0.055, -0.055, 0.055, 16, { color: DARK, ...KNEE }),
  hull('ひざの裏の板', [[-0.055, Y1 + 0.012, -0.04], [0.055, Y1 + 0.012, -0.04], [-0.055, Y2 - 0.012, -0.04], [0.055, Y2 - 0.012, -0.04],
    [-0.052, Y1 + 0.008, -0.059], [0.052, Y1 + 0.008, -0.059], [-0.052, Y2 - 0.008, -0.059], [0.052, Y2 - 0.008, -0.059]], { color: MAIN, ...KNEE, ...o })];

/** 横から見た形（[y, z] の並び）を x0〜x1 に押し出した板。外の面（x1 の側）は縁を落とし、真ん中を盛り上げる */
export function plate(name, yz, x0, x1, o = {}, c = 0.006) {
  const cy = yz.reduce((a, p) => a + p[0], 0) / yz.length, cz = yz.reduce((a, p) => a + p[1], 0) / yz.length, s = Math.sign(x1 - x0);
  // 外の面は平らにしない：縁から真ん中へ向かって少しずつ盛り上がる（真ん中がいちばん外）
  return hull(name, [...yz.flatMap(([y, z]) => [[x0, y, z], [x1 - s * c, y, z]]), ...yz.map(([y, z]) => [x1, y + (cy - y) * 0.25, z + (cz - z) * 0.25]), [x1 + s * c * 0.8, cy, cz]], o);
}
/** 太ももの横の装甲板（外の層、左右）。yz は横から見た形（上は太ももの中身に重ね、下は y −0.18 まで） */
export const thighPlates = (yz, o = {}, [xa, xb, xc] = [0.074, 0.106, 0.092]) => [plate('太もものひざの板（外）', yz, xa, xb, { ...LEG, ...o }, 0.012), plate('太もものひざの板（内）', yz, -xa, -xc, { ...LEG, ...o })];
/** 太ももの横の板の決まった形：上は y top、前 zf・後ろ zb、下は丸く y −0.18 まで */
export const thighPlateShape = (top = 0.16, zf = 0.1, zb = -0.085) => [[top, zb], [top, zf], [-0.06, zf * 0.95], [-0.13, zf * 0.62], [-0.175, 0.02], [-0.175, -0.02], [-0.13, zb * 0.7], [-0.06, zb]];
/** 太ももの下の板（内の層 |x| 0.058〜0.072、左右）：太ももの下の端から、上の軸の横へ下がる角ばった板。上の軸から 0.098 以内
 *  （ひざ当ての盾は軸から 0.105 より外を回るので当たらない）。その外を、すねの横の装甲が上がって覆う */
const TAB = [[0.17, 0.06], [0.17, -0.055], [0.03, 0.097], [0.03, -0.097], [-0.03, 0.062], [-0.03, -0.062], [-0.056, 0.02], [-0.056, -0.02]];
export const thighTabs = (o = {}) => [1, -1].map(s => plate(`太ももの下の板（${s > 0 ? '外' : '内'}）`, TAB, s * 0.058, s * 0.072, { ...LEG, ...o }, 0.003));
/** すねの横の装甲（外の層、左右）：ひざの横まで上がって関節を覆う。yz は横から見た形。曲げるとすねと一緒に回り、太ももの中身（y 0.1 より上）には届かない */
export const shinFins = (yz, o = {}, [xa, xb, xc] = [0.074, 0.098, 0.0835]) => [plate('すねの横の装甲（外）', yz, xa, xb, { ...SHIN, ...o }, 0.012), plate('すねの横の装甲（内）', yz, -xa, -xc, { ...SHIN, ...o }, 0.008)];
/** すねの横の板（内の層、左右）と、後ろの立ち上がり。上は上の軸の高さの少し下（y 0）まで */
export const shinPlates = (o = {}) => [
  // 下の軸のまわりの半径 0.098 の丸と、すねの中身へ下りる所。ひざ当ての盾（下の軸から 0.105 より外を、前から上・後ろへ回る）に当たらない
  ...[1, -1].map(s => plate(`すねのひざの板（${s > 0 ? '外' : '内'}）`, [...Array.from({ length: 11 }, (_, k) => (k - 5) * 18 * Math.PI / 180).map(a => [Y2 + 0.098 * Math.cos(a), 0.098 * Math.sin(a)]), [-0.25, 0.05], [-0.25, -0.05]], s * 0.058, s * 0.072, { ...SHIN, ...o }, 0.003)),
  hull('すねの後ろの立ち上がり', [[-0.072, -0.28, -0.062], [0.072, -0.28, -0.062], [-0.072, Y2 + 0.035, -0.062], [0.072, Y2 + 0.035, -0.062],
    [-0.066, -0.28, -0.084], [0.066, -0.28, -0.084], [-0.06, Y2 + 0.025, -0.08], [0.06, Y2 + 0.025, -0.08]], { ...SHIN, ...o })];
/**
 * ひざ当て：ひざの前の盾。節（関節そのもの）には付けず、すね（att 'shin'）か太もも（att 'leg'）に付ける。付いている側と一緒に動き、
 * ひざを曲げると関節の前が開く。yz は横から見た形（[y, z]、z 0.105 より前の点が盾になる）。真ん中（x 0）は前へ tip だけとがる。
 * 盾は、すねの横の装甲（|x| 0.074 より外）の間・軸から 0.105 より外にあるので、太ももの下の板にも節にも当たらない。
 * 盾と、付け根（盾の裏から、すねの前の面へ下がる／太ももの前の面へ上がる暗い柱）の 2 個を返す
 */
export const kneecap = (name, yz, tip = 0.012, o = {}, W = 0.072, att = 'shin') => {
  const ZS = 0.105, front = yz.filter(p => p[1] > ZS), B = att === 'leg' ? LEG : SHIN;
  const fy0 = Math.min(...front.map(p => p[0])), fy1 = Math.max(...front.map(p => p[0])), sw = Math.min(W * 0.8, 0.05);
  const shield = hull(name, [[-W, fy1 + 0.012, ZS], [W, fy1 + 0.012, ZS], [-W, fy0 - 0.012, ZS], [W, fy0 - 0.012, ZS],
    ...front.flatMap(([y, z]) => [[-W * 0.93, y, ZS + (z - ZS) * 0.75], [W * 0.93, y, ZS + (z - ZS) * 0.75], [0, y, z + tip]])], { ...B, ...o });
  const lr = pts => pts.flatMap(([y, z]) => [[-sw, y, z], [sw, y, z]]);
  const stem = att === 'leg'
    ? hull(`${name}の付け根`, lr([[fy1 - 0.02, ZS - 0.004], [fy1 - 0.02, ZS + 0.018], [0.17, 0.096], [0.16, 0.116]]), { ...B, color: DARK })
    : hull(`${name}の付け根`, lr([[fy0 + 0.02, ZS - 0.004], [fy0 + 0.02, ZS + 0.018], [-0.3, 0.1], [-0.29, 0.124]]), { ...B, color: DARK });
  return [shield, stem];
};

// ---- 形を作る道具（太もも・すね・足で共通） ----
/** 丸みのある箱の輪（超楕円）：外 xo・内 xi、前 zf・後ろ zb の四角に内接する。p 2 で楕円、大きいほど箱に近い。sl：前後に傾ける（z 1 につき y が sl 上がる） */
export const sq = (y, xi, xo, zb, zf, p = 3.2, n = 16, sl = 0) => Array.from({ length: n }, (_, k) => {
  const t = (k + 0.5) * 2 * Math.PI / n, c = Math.cos(t), s = Math.sin(t), e = 2 / p;
  const z = (zf + zb) / 2 + (zf - zb) / 2 * Math.sign(s) * Math.abs(s) ** e;
  return [(xo + xi) / 2 + (xo - xi) / 2 * Math.sign(c) * Math.abs(c) ** e, y + sl * z, z];
});
/** 角を落とした輪（外 xo・内 xi、前 zf・後ろ zb、角の落とし c）。sl：前後に傾ける */
export const oc = (y, xi, xo, zb, zf, c = 0.03, sl = 0) => octo2(y, xi, xo, zb, zf, c).map(([x, v, z]) => [x, v + sl * z, z]);
/** 輪を上から順に並べて、となりどうしを 1 個ずつの凸の部品にする（くびれ・ふくらみが作れる） */
export const stack = (name, rings, o = {}) => rings.slice(1).map((r, i) => loft(rings.length > 2 ? `${name} ${i + 1}` : name, [rings[i], r], o));
/** 前だけ（後ろだけ）を包む装甲の輪：内 xi〜外 xo、面 zf（前なら正、後ろなら負）、切り口 zs。角は c 落とす */
export const half = (y, xi, xo, zf, zs, c = 0.03) => { const s = Math.sign(zf - zs); return [[xi, y, zs], [xi, y, zf - s * c], [xi + c, y, zf], [xo - c, y, zf], [xo, y, zf - s * c], [xo, y, zs]]; };
/** 噴射口：c から向き dir へ長さ len、根元の半径 r0・口の半径 r1 の筒と、口の黒い底。置くとき横に太らせる分、横は先に細くしてある（置いて丸になる） */
export function nozzle(name, c, dir, r0, r1, len, o = {}) {
  const l = Math.hypot(...dir), d = dir.map(v => v / l), a = Math.abs(d[0]) > 0.9 ? [0, 1, 0] : [1, 0, 0];
  let u = [d[1] * a[2] - d[2] * a[1], d[2] * a[0] - d[0] * a[2], d[0] * a[1] - d[1] * a[0]]; const lu = Math.hypot(...u); u = u.map(v => v / lu);
  const w = [d[1] * u[2] - d[2] * u[1], d[2] * u[0] - d[0] * u[2], d[0] * u[1] - d[1] * u[0]];
  const at = (t, r, n = 10) => Array.from({ length: n }, (_, k) => { const th = (k + 0.5) * 2 * Math.PI / n, cs = Math.cos(th) * r, sn = Math.sin(th) * r;
    return [c[0] + (d[0] * t + u[0] * cs + w[0] * sn) / KX, c[1] + d[1] * t + u[1] * cs + w[1] * sn, c[2] + d[2] * t + u[2] * cs + w[2] * sn]; });
  return [hull(name, [...at(0, r0), ...at(len, r1)], { color: DARK, ...o }), hull(`${name}の口`, [...at(len - 0.006, r1 * 0.8), ...at(len + 0.004, r1 * 0.74)], { color: BLACK })];
}
/** 外の面の黒い溝：n 本。a0→b0（[y, z]）の 1 本目から step（[y, z]）ずつずらす。x は面の位置 */
export const slits = (name, n, a0, b0, step, x = 0.099, w = 0.014) => Array.from({ length: n }, (_, k) =>
  seg(`${name} ${k + 1}`, [x, a0[0] + step[0] * k, a0[1] + step[1] * k], [x, b0[0] + step[0] * k, b0[1] + step[1] * k], w, 0.014, [0, 1, 0], { color: BLACK }));

/** すねの横の装甲（左右対称）：横から見た形 yz を、内の面 ±xa から外へ。外の面の出は高さで変える（xo(y)、上と下で薄く・ふくらはぎで厚く）。
 *  外の面は縁を落とし、真ん中を盛り上げる（平らにしない）。ひざの横まで上がって関節を覆う */
export const shells = (name, yz, xo, o = {}, xa = 0.074, c = 0.008) => {
  const cy = yz.reduce((a, p) => a + p[0], 0) / yz.length, cz = yz.reduce((a, p) => a + p[1], 0) / yz.length;
  return [1, -1].map(s => hull(`${name}（${s > 0 ? '外' : '内'}）`, [...yz.flatMap(([y, z]) => [[s * xa, y, z], [s * (xo(y) - c), y, z]]),
    ...yz.map(([y, z]) => { const y2 = y + (cy - y) * 0.22, z2 = z + (cz - z) * 0.22; return [s * xo(y2), y2, z2]; }), [s * (xo(cy) + c * 0.6), cy, cz]], { ...SHIN, ...o }));
};
/** 高さ y ごとの値の表 [[y, v], ...]（上から下へ）を、間を直線でつないだ関数にする */
export const curve = rows => y => {
  if (y >= rows[0][0]) return rows[0][1];
  for (let i = 1; i < rows.length; i++) if (y >= rows[i][0]) { const t = (y - rows[i][0]) / (rows[i - 1][0] - rows[i][0]); return rows[i][1] + (rows[i - 1][1] - rows[i][1]) * t; }
  return rows[rows.length - 1][1];
};
/** 左右対称の輪：半幅 x、後ろ zb・前 zf、角の落とし c（f は oc か sq） */
export const g = (y, x, zb, zf, c = 0.035, sl = 0) => oc(y, -x, x, zb, zf, c, sl);
export const gr = (y, x, zb, zf, p = 2.4, sl = 0) => sq(y, -x, x, zb, zf, p, 16, sl);
