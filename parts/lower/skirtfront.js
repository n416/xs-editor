// 前スカート：腰の帯の前の下に下がる台形の装甲（腰の骨の子のスカートの骨）。原点は股関節の中心（+x 側）。
// 板は回転の軸に載る：軸（横、帯の下の縁から 2.5 cm 下）は板の厚みの真ん中、上の端から 1.2 cm 下にあり、板の左右の端の外で
// 腰から下りた小さな受けと、板に差さる短い軸（ピン）で支える（外から見えるのは板だけ）。脚を前へ上げると太ももに押されて軸の
// まわりに前へ開き（hinge：dir +1 で裾が前へ上がる）、軸より上の部分は後ろへ回り込むが、その動く範囲（軸から半径 1.7 cm）は
// 帯の下に収まるので、帯に穴は要らない。付け根以外の厚さ・長さは自由（押されて開くので脚に縛られない）。
// 下ほど広く、下ほど厚い。横に反り（中央が盛り上がる）、一段高いパネル。下の縁は中央が低い V。
// frontSkirt() で寸法・形を変えた種類を作る（標準・短い・幅広・尖った裾・2 枚重ね・短冊・差し色の縁・左右が合わさる・長く大きい）
import { P, XH, XL, YH, YL, ZH, ZL, prismX, piece, DARK, ACCENT } from '../../xsasm-lib.js';
import { crown, steps } from './shape.js';

const TOP = 0.157;                                                  // 板の上の端（帯の下の縁 0.17 の 1.3 cm 下）
const HY = 0.145;                                                   // 回転の軸の高さ（上の端から 1.2 cm 下、帯の下の縁から 2.5 cm 下）
// 片膝で太ももが水平近くまで上がると、その上面（股関節の中心から 0.11〜0.12 上）と帯の下の縁の間は 5〜6 cm しかなく、開いた板は
// そこに水平に入る。軸がこの高さなら、板の裏（軸より 1.25 cm 下）は太ももの上に、軸より上の端が回り込む範囲（半径 1.7 cm）は帯の下に収まる

/**
 * bottom 下の縁（中央）の y、x0・x1 上の端の左右（下では spread だけ広がる）、lean 前の面の傾き（下へ 1 で前へ lean）、
 * crownX 横の反り、panels 一段高いパネル [[上の y, 下の y], ...]、rim 裾の厚い縁の高さ（0 で無し）、rimColor その色、
 * veeK 下の縁の V の深さ（大きいほど尖る）、layer 重ねる上の板の下の縁の y（0 で無し）、strips 縦の短冊に割る数（1 で割らない）、
 * hingeZ 回転の軸の前後の位置（板の厚みの真ん中）、spreadIn 内側の縁の下での広がり（無ければ spread）、center 反りと V の中心の x（無ければ板の中央）、
 * panelC パネルの中心の x（無ければ center）、faceLift 表の面だけを前へ出す量（裏は平らなまま、表の丸みの分の厚み）、
 * bendFrom・bendK x が bendFrom より外は bendK (x − bendFrom)² だけ後ろへ曲げる（太ももの前は平らなまま、その外で体に沿って回り込む）、segs 反りに沿わせて縦に割る数（反りの中心が板の外にあると 1 枚の平らな裏では
 * 外ほど前の面が裏より後ろへ回って板が消えるので、割った各本の裏の面をその位置の前の面に平行にする。継ぎ目は重ねる）
 */
/**
 * 板の関節：板の内側（体の中心寄り）の端の外に、腰（帯の下）から下りた小さな受けと、受けから板の中へ深く差さる短い軸（ピン）。
 * どちらも腰に固定。内側の端は前掛けやお尻の板の裏に隠れるので、外からは見えない（外側の端には付けない）。軸は板の厚みの真ん中を
 * 通るので、板は軸のまわりに回っても受けにも軸にも当たらない。sign：前 +1・後ろ −1
 */
export function joint(label, x0, x1, hz, sign) {
  const xe = x0, xa = xe - 0.015;                                   // 受けの中心（板の内側の端から 1.5 cm 内）
  const zin = hz - sign * 0.0135;                                    // 板の裏（体の側）の面より 1 mm 内側
  return [
    piece(`${label}の受け`, [XL(xa - 0.011), XH(xa + 0.011), YL(HY - 0.014), YH(0.2),
      sign > 0 ? ZH(zin) : ZL(zin), sign > 0 ? ZL(zin - 0.1) : ZH(zin + 0.1), P([0, -1, sign], [0, HY - 0.014, zin])], { color: DARK }),   // 体の側へ 10 cm（帯・後ろ腰に届く）
    piece(`${label}の軸`, [...prismX(0.011, 8, 22.5, HY, hz), XL(xa), XH(xe + Math.min(0.08, (x1 - x0) * 0.5))], { pivot: 'skirt', color: DARK }),
  ];
}

export function frontSkirt({ id, name, bottom = -0.26, x0 = -0.06, x1 = 0.12, spread = 0.015, lean = 0.2, crownX = 2, panels = [[0.1, -0.2]], rim = 0, rimColor = DARK,
  veeK = 0.3, layer = 0, strips = 1, hingeZ = 0.195, spreadIn = spread, center, panelC, segs = 1, faceLift = 0, bendFrom = Infinity, bendK = 0 }) {
  const C = center ?? (x0 + x1) / 2, PC = panelC ?? C, len = TOP - bottom, k = spread / len, kIn = spreadIn / len, zf0 = hingeZ + 0.0125;   // zf0：付け根の前の面（軸より 1.25 cm 前、裏は 1.25 cm 後ろ）
  const HINGE = { y: HY, z: hingeZ, dir: 1 };
  const H = { hinge: HINGE, bone: 'skirt' };   // 骨はスカート（ゲームでは skirt_front_* / skirt_back_*）
  const bend = x => bendK * Math.max(0, x - bendFrom) ** 2;
  const face = lift => (x, y) => zf0 + faceLift + (TOP - y) * lean - crownX * (x - C) ** 2 - bend(x) + lift;
  // 裏の面：下へ行くほど表の 7 割だけ前へ（開いて水平になったとき板の先が軸より下へ沈まない）。back(0.185) が板の裏（付け根の厚さ 2.5 cm）
  const back = z0 => P([0, -0.7 * lean, -1], [0, TOP, zf0 - 0.025 + (z0 - 0.185)]);
  const sides = (a, b, y) => [P([1, k, 0], [b, y, 0]), P([-1, kIn, 0], [a, y, 0])];   // 下ほど広い台形
  const vee = y => [P([veeK, -1, 0], [C, y, 0]), P([-veeK, -1, 0], [C, y, 0])];   // 下の縁は中央が低い V
  const X = steps(x0 - spreadIn, x1 + spread, 4), Y = steps(bottom - 0.04 - veeK * 0.15, TOP, Math.max(6, Math.round(len / 0.07)));
  const plate = [...crown('z', 1, face(0), X, Y), back(0.185), YH(TOP), P([0, 1, 1.5], [0, TOP, zf0 - 0.005]), ...sides(x0, x1, TOP), ...vee(bottom)];
  // 短冊：板を縦に strips 本へ割る（間に細い隙間）。割った板は下の縁で広がる台形の幅を等分する
  const cut = (i, n = strips, gap = 0.004) => { const a = x0 + (x1 - x0) * i / n, b = x0 + (x1 - x0) * (i + 1) / n, g = i ? gap : 0, h = i < n - 1 ? gap : 0;
    const ka = -spreadIn + (spread + spreadIn) * i / n, kb = -spreadIn + (spread + spreadIn) * (i + 1) / n;   // 下の縁での広がり
    return [P([1, kb / len, 0], [b - h, TOP, 0]), P([-1, -ka / len, 0], [a + g, TOP, 0])]; };
  // 反りに沿う裏の面：x = m で前の面から t 奥に、その位置の反りの傾きで
  const faceTop = x => face(0)(x, TOP);
  const slope = m => -2 * crownX * (m - C) - 2 * bendK * Math.max(0, m - bendFrom);
  const backAt = (m, t) => P([slope(m), -0.7 * lean, -1], [m, TOP, faceTop(m) - t]);
  const segMid = i => x0 + (x1 - x0) * (i + 0.5) / segs;
  const segPlate = i => { const m = segMid(i), o = 0.006;   // 継ぎ目は少し重ねる
    return [...crown('z', 1, face(0), X, Y), backAt(m, 0.028), YH(TOP),
      ...sides(x0, x1, TOP), ...vee(bottom), ...cut(i, segs, -o)]; };
  const pieces = [
    ...(segs > 1 ? Array.from({ length: segs }, (_, i) => piece(`前スカート ${i + 1}`, segPlate(i), H))
      : strips > 1 ? Array.from({ length: strips }, (_, i) => piece(`前スカート ${i + 1}`, [...plate, ...cut(i)], H)) : [piece('前スカート', plate, H)]),
    ...panels.map(([y0, y1], i) => {
      const w = (x1 - x0) * 0.33;
      return piece(`前スカートのパネル${panels.length > 1 ? ' ' + (i + 1) : ''}`, [...crown('z', 1, face(0.01), steps(PC - w, PC + w, 2), steps(y1 - 0.02 - veeK * 0.05, y0, 4)),
        segs > 1 ? backAt(PC, 0.012) : back(0.21), YH(y0), ...sides(PC - w, PC + w, y0), ...vee(y1 - veeK * Math.abs(PC - C))], H);
    }),
    ...joint('前スカート', x0, x1, hingeZ, 1),
  ];
  // 重ねた上の板：付け根から layer まで、少し前に出た短い板（裾はまっすぐ、角を落とす）
  if (layer) pieces.push(piece('前スカートの上の板', [...crown('z', 1, face(0.03), X, steps(layer - 0.02, TOP, 4)), back(0.2), YH(TOP), P([0, 1, 1.5], [0, TOP, zf0 + 0.025]),
    ...sides(x0 - 0.006, x1 + 0.006, TOP), YL(layer), P([0, -1, 1.2], [0, layer, face(0.03)(C, layer) - 0.01])], H));
  // 裾の厚い縁：下の縁に沿って前へ少し出た帯。V の左右で 1 個ずつ（縁の上の線も V にそろえる。V の中心が板の端なら片側だけ）
  // 反りに沿わせて割った板の縁：各本ごとに（V の中心は板の外にある前提で、V は片側の斜めだけ）
  if (rim && segs > 1) for (let i = 0; i < segs; i++) { const m = segMid(i), sg = Math.sign(m - C) || 1;
    pieces.push(piece(`前スカートの裾 ${i + 1}`, [...crown('z', 1, face(0.014), X, steps(bottom - 0.04 - veeK * 0.3, bottom + rim + 0.04, 2)), backAt(m, 0.012),
      ...sides(x0, x1, TOP), ...cut(i, segs, -0.006), P([veeK * sg, -1, 0], [C, bottom, 0]), P([-veeK * sg, 1, 0], [C, bottom + rim, 0])], { ...H, color: rimColor })); }
  else if (rim) for (const s of [-1, 1]) if (s > 0 ? C < x1 + spread : C > x0 - spreadIn) pieces.push(piece(`前スカートの裾（${s < 0 ? '内' : '外'}）`, [
    ...crown('z', 1, face(0.014), steps(s < 0 ? x0 - spreadIn : C, s < 0 ? C : x1 + spread, 2), steps(bottom - 0.04 - veeK * 0.15, bottom + rim + 0.04, 2)),
    back(0.2), ...sides(x0, x1, TOP), P([veeK * s, -1, 0], [C, bottom, 0]), P([-veeK * s, 1, 0], [C, bottom + rim, 0]), s < 0 ? XH(C) : XL(C)], { ...H, color: rimColor }));
  const wide = x1 - x0 + spread + spreadIn;
  return { id, name, cat: '前スカート', size: [wide, TOP - bottom + 0.04, 0.025 + len * lean], pieces };
}

export default [
  frontSkirt({ id: 'skirtfront', name: '前スカート' }),
  frontSkirt({ id: 'skirtfrontshort', name: '前スカート（短い）', bottom: -0.1, lean: 0.28, panels: [[0.11, -0.04]], veeK: 0.15 }),
  frontSkirt({ id: 'skirtfrontwide', name: '前スカート（幅広）', bottom: -0.3, x0: -0.085, x1: 0.165, spread: 0.03, crownX: 1.4, panels: [[0.1, -0.22]], veeK: 0.2 }),
  frontSkirt({ id: 'skirtfrontpoint', name: '前スカート（尖った裾）', bottom: -0.42, spread: 0, lean: 0.16, panels: [[0.1, -0.2]], veeK: 1.1 }),
  frontSkirt({ id: 'skirtfrontlayer', name: '前スカート（2 枚重ね）', bottom: -0.42, spread: 0.02, lean: 0.18, panels: [[-0.17, -0.34]], layer: -0.12, rim: 0.035 }),
  frontSkirt({ id: 'skirtfrontstrips', name: '前スカート（短冊）', bottom: -0.36, spread: 0.03, lean: 0.18, crownX: 1.5, panels: [], strips: 3, veeK: 0.12, rim: 0.035 }),
  frontSkirt({ id: 'skirtfrontaccent', name: '前スカート（差し色の縁）', bottom: -0.3, spread: 0.02, panels: [[0.1, -0.16]], rim: 0.045, rimColor: ACCENT }),
  // 左右が合わさる：真ん中の動かない前掛け（前掛け（真ん中の板））の両脇から下がる。前掛けは板より前に出た厚い板で、板の内側の縁は
  // その脇（体の中心から x 0.09）で止まるので、脚に押されて開いても前掛けに当たらず、開いた所は前掛けの側面で埋まる。閉じると前掛けと
  // 左右の板で 1 枚の盾に見えるよう、反りの中心は体の中心。下の縁はほぼ横（浅い V）。外の縁は前後とつながる横スカートの前の端より外まで
  // 出して重ねる。横スカートは下ほど外へ開くので、外の縁も下ほど広げる（spread）。横スカートは板の裏にあるので、押されて前へ開いても当たらない
  frontSkirt({ id: 'skirtfrontjoined', name: '前スカート（左右が合わさる）', x0: -0.085, x1: 0.2, spread: 0.085, spreadIn: 0, center: -0.175, panelC: 0.06,
    bottom: -0.36, lean: 0.12, crownX: 0, bendFrom: 0.085, bendK: 2.5, segs: 5, veeK: 0.1, hingeZ: 0.22, panels: [[0.08, -0.25]], panelC: 0.0, rim: 0.04 }),
  // 太ももの前（体の中心から x 0.26 まで）は平らで、その外で後ろへ曲がって横スカートの前の端に外から重なる（下から見て楕円に近い輪）。
  // 曲がった所は開くとき軸より下へ沈むが、太ももの幅の外なので当たらない（押し開きは脚ごとにその幅にかかる所で調べる）
  frontSkirt({ id: 'skirtfrontlong', name: '前スカート（長く大きい）', bottom: -0.62, x0: -0.075, x1: 0.145, spread: 0.035, lean: 0.17, crownX: 1.6,
    panels: [[0.11, -0.16], [-0.21, -0.5]], rim: 0.05 }),
];
