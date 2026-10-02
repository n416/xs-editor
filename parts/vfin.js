// 額のアンテナ。刃・一本角・中央の部品を、別々の部品にしてある（依頼主：中央の部分とアンテナは別部品に分けた方がいい／左右を分けても良い）。
//   部位「アンテナ（額）」：刃（右の 1 枚を作ってあり、カタログから置くと左右の 2 つが別々に入る。片方を消せば片側だけ）と、一本角
//     刃（細い）            ：薄く長く鋭い板。約 30 度で外へ上がる（分ける前の V 字アンテナの刃）
//     刃（太い）            ：幅も厚みも 2 倍ほど
//     刃（寝てから立つ）    ：水平に近い角度で外へ出て、途中で折れて垂直に近く立つ
//     刃（45 度から垂直）   ：45 度で外へ出て、途中で折れて垂直に立つ
//     一本角（斜め前）      ：太めの角 1 本。額の中央から斜め前・上へ
//   部位「アンテナの中央（額）」：刃の根元を覆う塊。広い面が正面を向く。台形・六角形・五角形・ひし形の柱
// どれも同じ原点・同じ倍率（fitAs）・同じ額の点（brow）で置かれるので、中央の部品と刃は重ねて置くとそのまま合う。前が +z、原点は刃の根元の高さ
// 分ける前の一体の部品（id vfin）は、カタログには出さず、保存してある機体のために残す（vfinOld。xsasm-parts.js・unitparts.js）
import { P, XH, XL, YH, YL, ZH, ZL, both, box, piece, mir, rotXAt, movePl, planesFromPoints, MAIN, DARK, BLACK, GLOW } from '../xsasm-lib.js';

// 刃 1 枚（右）：x-y 面に立つ板。根元 x 0.018〜0.05、先 (0.28, 0.2)。厚み z ±0.004、上の縁と下の縁を研ぐ
const T = 0.004;
const BLADE_R = [
  ZH(T), ZL(-T),
  P([-1, 0.55, 0], [0.018, 0.0, 0]),                              // 根元の内側（上へ行くほど外へ）
  P([0.62, -1, 0], [0.05, 0.0, 0]),                               // 下の縁：外へ向かって上がる
  P([-0.55, 1, 0], [0.018, 0.028, 0]),                            // 上の縁：下の縁より緩く上がる（先で細る）
  P([1, 0.35, 0], [0.3, 0.21, 0]),                                 // 先
  P([-0.55, 1, 0.9], [0.018, 0.028, T]), P([-0.55, 1, -0.9], [0.018, 0.028, -T]),   // 上の縁を研ぐ（前後から）
  P([0.62, -1, 0.9], [0.05, 0.0, T]), P([0.62, -1, -0.9], [0.05, 0.0, -T]),         // 下の縁も研ぐ
];
const blade = rotXAt(BLADE_R, 18, 0, 0);                          // 後ろへ 18 度倒す（根元の軸で）
// 台座は、広い面（作ったときの上面）を正面に向けて立てる：作った向きのまま、横の軸で 90 度前へ起こす（底だった面が後ろ＝頭の側、上面だった面が前）。
// 形は変えない。前は寝かせたままで、広い面が上を向いていた
// 厚み：作ったときの高さ 0.016 が、起こすと前後の厚みになり、薄い板に見えた（幅 0.11・高さ 0.05 に対して 0.016）。厚みだけを THICK 倍にする（正面から見た形は変えない）。
// 厚くする分は、前と後ろへ半分ずつ
const THICK = 3, T0 = 0.016;
const thicken = planes => planes.map(([nx, ny, nz, d, ...r]) => { const l = Math.hypot(nx, ny / THICK, nz); return [nx / l, ny / THICK / l, nz / l, d / l, ...r]; });
const up = planes => movePl(rotXAt(thicken(planes), -90, 0, 0), [0, 0, -T0 * (THICK - 1) / 2]);
export const vfinOld = {
  id: 'vfin', name: 'V 字アンテナ', cat: 'トサカ', size: [0.56, 0.2, 0.08],
  brow: [0.005, -0.01],   // 額に当てる所（部品の座標 y・z）：台座の後ろの面の少し中。置くときに殻の額の点（face.brow）へ合わせる（xsasm-random.js）。頭頂ではなく額に付く
  pieces: [
    // 台座：低いくさび（以下の寸法は起こす前の向きで書いてある）。前面は上へ向かって後ろへ倒れ、両端は斜めに落ちる。上面は後ろへ下がる
    piece('台座', up([YL(0), YH(0.016), ZL(-0.03), P([0, 0.35, 1], [0, 0, 0.02]), ...both(P([1, 0.6, 0], [0.055, 0, 0])), P([0, 1, -0.3], [0, 0.016, 0])])),
    // 前面の光る溝：台座の前面を上下の唇に分けず、台座の前に薄い暗い帯を彫る代わりに、上唇・下唇の 2 piece で挟んだ奥に光る帯
    piece('上唇', up([YL(0.009), YH(0.016), ZL(-0.005), P([0, 0.35, 1], [0, 0, 0.02]), ...both(P([1, 0.6, 0], [0.055, 0, 0]))])),
    piece('下唇', up([YL(0), YH(0.005), ZL(-0.005), P([0, 0.35, 1], [0, 0, 0.02]), ...both(P([1, 0.6, 0], [0.055, 0, 0]))])),
    piece('溝の奥', up([YL(0.004), YH(0.01), ZL(-0.006), P([0, 0.35, 1], [0, 0, 0.013]), ...both(P([1, 0.6, 0], [0.05, 0, 0]))]), { color: BLACK }),
    piece('光る帯', up([YL(0.0055), YH(0.0085), ZL(0.0), P([0, 0.35, 1], [0, 0, 0.016]), ...both(XH(0.03))]), { color: GLOW, glow: true, metal: 0, rough: 0.3 }),
    piece('刃（右）', blade), piece('刃（左）', blade.map(mir)),
  ],
};

// ---- 分けた部品 ----
const D = Math.PI / 180;
const LEAN = 18;                                  // 刃は後ろへ 18 度倒れる（根元の軸で）
const BROW = [0.005, -0.01];                      // 額に当てる所（部品の座標 y・z）。どの部品も同じ
const SCALE_AS = 'vblade';                        // どの部品も「刃（細い）」と同じ倍率で置く
const base = { brow: BROW, fitAs: SCALE_AS };

/**
 * 折れ線の刃（右）。pts：中心線の点 [x, y, 半分の幅]（根元から先へ）。t：厚みの半分。edge：縁を研ぐ幅。
 * 節ごとに 1 つの凸の板にし、折れ目は両隣の縁の交わる点でつなぐ（すき間も段もできない）。縁は前後から研いで刃にする
 */
function bladeOf(pts, t, edge) {
  const n = pts.length, dirs = [], nrm = [];
  for (let i = 0; i < n - 1; i++) { const dx = pts[i + 1][0] - pts[i][0], dy = pts[i + 1][1] - pts[i][1], l = Math.hypot(dx, dy); dirs.push([dx / l, dy / l]); nrm.push([-dy / l, dx / l]); }   // nrm：進む向きの左（上の縁の側）
  /** 点 i での、中心線から k·(幅 − inset) だけ離れた縁の点（k = ±1）。折れ目では両隣の縁の線の交点 */
  const corner = (i, k, inset) => {
    const w = k * (pts[i][2] - inset);
    if (i === 0) return [pts[0][0] + nrm[0][0] * w, pts[0][1] + nrm[0][1] * w];
    if (i === n - 1) return [pts[i][0] + nrm[i - 1][0] * w, pts[i][1] + nrm[i - 1][1] * w];
    const a = nrm[i - 1], b = nrm[i], den = 1 + a[0] * b[0] + a[1] * b[1];
    return [pts[i][0] + (a[0] + b[0]) * w / den, pts[i][1] + (a[1] + b[1]) * w / den];
  };
  const out = [];
  for (let i = 0; i < n - 1; i++) {
    const p = [];
    for (const j of [i, i + 1]) for (const k of [1, -1]) {
      const e = corner(j, k, 0), m = corner(j, k, Math.min(edge, pts[j][2] * 0.8));
      p.push([e[0], e[1], 0], [m[0], m[1], t], [m[0], m[1], -t]);
    }
    out.push(rotXAt(planesFromPoints(p), LEAN, 0, 0));
  }
  return out;
}
const bladePart = (id, name, size, segs) => ({ id, name, cat: 'アンテナ（額）', size, pairs: true, ...base, pieces: segs.map((pl, i) => piece(segs.length > 1 ? `刃 ${i + 1}` : '刃', pl)) });

// 刃（細い）：分ける前の刃そのまま
const vblade = { id: 'vblade', name: '刃（細い）', cat: 'アンテナ（額）', size: [0.3, 0.2, 0.08], pairs: true, ...base, fitAs: undefined, pieces: [piece('刃', blade)] };
// 刃（太い）：同じ向きで、幅も厚みも 2 倍ほど。先は細い刃より短い
const vbladethick = bladePart('vbladethick', '刃（太い）', [0.28, 0.2, 0.09], bladeOf([[0.024, 0.006, 0.036], [0.15, 0.085, 0.03], [0.262, 0.172, 0.012]], 0.009, 0.016));
// 刃（寝てから立つ）：水平から 13 度で外へ出て、折れて、垂直から 12 度の向きで立つ
const vbladebend = bladePart('vbladebend', '刃（寝てから立つ）', [0.23, 0.22, 0.09], bladeOf([[0.024, 0.01, 0.022], [0.17, 0.044, 0.019], [0.204, 0.205, 0.006]], 0.005, 0.011));
// 刃（45 度から垂直）：45 度で外へ出て、折れて、まっすぐ上へ立つ
const vblade45 = bladePart('vblade45', '刃（45 度から垂直）', [0.16, 0.26, 0.1], bladeOf([[0.026, 0.008, 0.022], [0.125, 0.107, 0.019], [0.125, 0.25, 0.006]], 0.005, 0.011));

// 一本角（斜め前）：六角の断面で、根元が太く先へ細る。額の中央から、前へ 40 度倒れて上へ。左右の対ではない
const unihorn = (() => {
  const a = 40 * D, ax = [0, Math.cos(a), Math.sin(a)], up = [0, -Math.sin(a), Math.cos(a)];   // 軸（斜め前・上）と、軸に直角な「前下」の向き
  const ring = (t, rx, rz) => Array.from({ length: 6 }, (_, k) => { const th = (30 + 60 * k) * D, cx = rx * Math.cos(th), cu = rz * Math.sin(th); return [cx, ax[1] * t + up[1] * cu, ax[2] * t + up[2] * cu]; });
  return { id: 'unihorn', name: '一本角（斜め前）', cat: 'アンテナ（額）', size: [0.07, 0.2, 0.2], ...base,
    pieces: [
      piece('角の根元', planesFromPoints([...ring(-0.02, 0.034, 0.03), ...ring(0.05, 0.03, 0.026)])),
      piece('角', planesFromPoints([...ring(0.045, 0.03, 0.026), ...ring(0.2, 0.012, 0.01), [0, ax[1] * 0.235, ax[2] * 0.235]])),
    ] };
})();

// ---- 中央の部品：正面から見た形（x-y）の柱。後ろの面（z -0.016）から前の面（z 0.032）へ少しすぼまり、前の面は上が後ろへ少し倒れる ----
const Z0 = -0.016, Z1 = 0.032, TAPER = 0.86, FACE_LEAN = 0.16, CY = 0.005;
const prism = pts => planesFromPoints([...pts.map(([x, y]) => [x, y, Z0]), ...pts.map(([x, y]) => [x * TAPER, CY + (y - CY) * TAPER, Z1 - FACE_LEAN * (y - CY)])]);
const sym = pts => pts.flatMap(([x, y]) => (x === 0 ? [[0, y]] : [[x, y], [-x, y]]));
const corePart = (id, name, pts) => ({ id, name, cat: 'アンテナの中央（額）', size: [0.11, 0.06, 0.05], ...base, pieces: [piece('中央', prism(sym(pts)))] });
// 台形：分ける前の台座そのまま（外から見える本体だけ）
const vcore = { id: 'vcore', name: '中央（台形）', cat: 'アンテナの中央（額）', size: [0.11, 0.05, 0.05], ...base, pieces: [piece('中央', vfinOld.pieces[0].planes)] };
const vcorehex = corePart('vcorehex', '中央（六角形）', [[0.03, 0.033], [0.056, 0.005], [0.03, -0.023]]);
const vcorepenta = corePart('vcorepenta', '中央（五角形）', [[0.046, 0.032], [0.054, 0.004], [0, -0.028]]);
const vcorediamond = corePart('vcorediamond', '中央（ひし形）', [[0, 0.037], [0.058, 0.005], [0, -0.027]]);

export default [vblade, vbladethick, vbladebend, vblade45, unihorn, vcore, vcorehex, vcorepenta, vcorediamond];
