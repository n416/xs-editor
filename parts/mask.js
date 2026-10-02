// マスク（口もとの装甲）。目の下からあごまで、顔の前に付ける。部位「マスク」は 1 つだけ（あごとは別の部位：マスクとあごは一緒に付く）。
// どれも「頭の殻」の口もとの面に合わせて作ってある（面は上が前へ 24 度倒れ、中心の稜から左右へ後ろに流れる）。ほかの殻へは、
// 置くときに殻の口もとの面へ合わせて回す（部品の mouth と殻の face.mouth。xsasm-random.js）。
//   マスク（見本 A）      ：鼻筋のある口の面（parts/maska.js。資料の正面の絵を写したもの）
//   マスク（への字の通気口）：中心の稜から左右へ流れる盾形の板。左右に、への字に下がる通気口 3 本ずつ（本当のくぼみ、奥は暗い壁）
//   マスク（口先）        ：前下へ突き出す八角の筒。先は開いていて、奥に暗い底と縦の桟。筒の左右に、動力パイプを受ける短い口
//   マスク（船首）        ：中心が鋭く前へ出る大きな面当て。あごの下まで覆い、への字の継ぎ目で上下に分かれる
// 座標：頭の殻の座標から C を引いたもの（x 右・y 上・z 前）
import { P, XH, XL, both, piece, pair, planesFromPoints, movePl, MAIN, DARK, BLACK } from '../xsasm-lib.js';

const D = Math.PI / 180;
const C = [0, -0.03, 0.07];                                  // 部品の原点（殻の座標）：口もとの高さ、顔の面の少し奥
const MOUTH = [-0.03 - C[1], 0.0868 - C[2], 24];             // 殻の口もとの点（部品の座標）と、面の倒れ
/** 「頭の殻」の顔の面：(x, y) での前面の z（殻の座標）。口もと・あごの前・頬の 3 面のうち、いちばん奥 */
const zf = (x, y) => { x = Math.abs(x); return Math.min((0.088065 + 0.39 * y - 0.29 * x) / 0.88, (0.08505 + 0.27 * y - 0.29 * x) / 0.92, (0.07329 - 0.72 * x + 0.44 * y) / 0.53); };
/** 顔の面から d だけ前（負なら殻の中）の点。殻の座標 (x, y) → 部品の座標 */
const on = (x, y, d) => [x, y - C[1], zf(x, y) + d - C[2]];
/** 殻の座標の点 → 部品の座標 */
const at = (x, y, z) => [x, y - C[1], z - C[2]];
const sym = pts => pts.flatMap(p => (p[0] === 0 ? [p] : [p, [-p[0], p[1], p[2]]]));
const hullPl = pts => planesFromPoints(sym(pts));
// への字の線（右半分）：y = y0 − SL·x（殻の座標の y0）。above はその上、below はその下
const SL = 0.45;
const above = y0 => P([-SL, -1, 0], [0, y0 - C[1], 0]);
const below = y0 => P([SL, 1, 0], [0, y0 - C[1], 0]);

// ---- への字の通気口 ----
const maskslit = (() => {
  const outline = [[0, 0.010, 0.012], [0, -0.030, 0.018], [0, -0.064, 0.014],                       // 中心の稜（顔の面からいちばん前へ出る）
    [0.018, 0.011, 0.007], [0.040, -0.006, 0.007], [0.039, -0.030, 0.007], [0.024, -0.058, 0.008], [0.009, -0.069, 0.010]];   // 外の縁
  const H = hullPl([...outline.map(([x, y, d]) => on(x, y, d)), ...outline.map(([x, y]) => on(x, y, -0.012))]);
  const SLITS = [[-0.012, -0.018], [-0.025, -0.031], [-0.038, -0.044]];   // 通気口 3 本（中心線での上端・下端。外へ行くほど下がる）
  const X0 = 0.007, X1 = 0.031, DEPTH = 0.006;                           // 通気口の内の端・外の端・深さ
  const SIDE = [...H, XL(X0)];
  return {
    id: 'maskslit', name: 'マスク（への字の通気口）', cat: 'マスク', size: [0.08, 0.08, 0.05], mouth: MOUTH,
    pieces: [
      piece('鼻筋', [...H, ...both(XH(X0))]),
      ...pair('上の板', [...SIDE, above(SLITS[0][0])]),
      ...pair('桟 1', [...SIDE, below(SLITS[0][1]), above(SLITS[1][0])]),
      ...pair('桟 2', [...SIDE, below(SLITS[1][1]), above(SLITS[2][0])]),
      ...pair('下の板', [...SIDE, below(SLITS[2][1])]),
      ...pair('通気口の脇', [...H, XL(X1), below(SLITS[0][0]), above(SLITS[2][1])]),
      ...pair('通気口の奥', [...movePl(H, [0, 0, -DEPTH]), XL(X0), XH(X1), below(SLITS[0][0]), above(SLITS[2][1])], { color: BLACK }),
    ],
  };
})();

// ---- 口先 ----
const masksnout = (() => {
  const TILT = 18 * D, L = 0.044;                                             // 筒は前下へ 18 度。長さ
  const y0 = -0.036, base = at(0, y0, zf(0, y0) - 0.012);                     // 筒の軸の根元（殻の中）
  const U = [1, 0, 0], V = [0, Math.cos(TILT), Math.sin(TILT)], AX = [0, -Math.sin(TILT), Math.cos(TILT)];
  const pt = (lx, ly, t) => [0, 1, 2].map(i => base[i] + lx * U[i] + ly * V[i] + t * AX[i]);
  const rx = t => 0.029 - 0.009 * t / L, ry = t => 0.025 - 0.008 * t / L;     // 根元は太く、先へ細る
  const ring = (t, k = 1, kx = k) => Array.from({ length: 8 }, (_, i) => { const th = (22.5 + 45 * i) * D; return pt(rx(t) * kx * Math.cos(th), ry(t) * k * Math.sin(th), t); });
  const T1 = L - 0.013;                                                        // ここから先は筒（中が抜ける）
  const pieces = [
    // 口当ての台：顔の面に沿う小さな盾。筒はこの上に立つ
    piece('口当ての台', hullPl([[0.014, 0.009], [0.037, -0.008], [0.036, -0.034], [0.022, -0.060], [0, -0.067], [0, 0.006]].flatMap(([x, y]) => [on(x, y, 0.005), on(x, y, -0.012)]))),
    piece('口先の筒', planesFromPoints([...ring(0), ...ring(T1)])),
    piece('口先の底', planesFromPoints([...ring(T1 - 0.003, 0.74), ...ring(T1 + 0.0015, 0.74)]), { color: BLACK }),   // 開いた口の奥の暗い底
  ];
  // 筒の先：8 枚の壁（先の縁は少し外へ開く）
  const o0 = ring(T1), o1 = ring(L, 1.07), i0 = ring(T1, 0.74), i1 = ring(L, 0.8);
  for (let i = 0; i < 8; i++) { const j = (i + 1) % 8; pieces.push(piece(`口先の壁 ${i + 1}`, planesFromPoints([o0[i], o0[j], o1[i], o1[j], i0[i], i0[j], i1[i], i1[j]]))); }
  // 口の中の縦の桟 3 本（底から、縁の少し手前まで）
  for (const [k, x] of [[1, -0.0075], [2, 0], [3, 0.0075]]) {
    const h = t => ry(t) * 0.74 * Math.sqrt(Math.max(0.05, 1 - (x / (rx(t) * 0.74)) ** 2)) * 0.98;
    pieces.push(piece(`口の桟 ${k}`, planesFromPoints([T1 - 0.002, L - 0.004].flatMap(t => [[x - 0.0017, h(t)], [x + 0.0017, h(t)], [x - 0.0017, -h(t)], [x + 0.0017, -h(t)]].map(([lx, ly]) => pt(lx, ly, t))))));
  }
  // 鼻筋：目の下から筒の上へ下りる稜
  pieces.push(piece('鼻筋', planesFromPoints([on(0.009, 0.010, -0.01), on(-0.009, 0.010, -0.01), on(0.008, 0.010, 0.004), on(-0.008, 0.010, 0.004), on(0, 0.008, 0.011),
    pt(0.011, ry(0.006) * 0.8, 0.006), pt(-0.011, ry(0.006) * 0.8, 0.006), pt(0.009, ry(0.022) * 0.92, 0.022), pt(-0.009, ry(0.022) * 0.92, 0.022), pt(0, ry(0.02) * 1.22, 0.02)])));
  // 動力パイプを受ける口（左右）：筒の横から、外・下・後ろへ斜めに向く短い筒（正面から見て、横一文字の棒にしない）
  for (const s of [1, -1]) {
    const a = pt(s * rx(0.018) * 0.7, -0.006, 0.018), b = pt(s * (rx(0.004) + 0.011), -0.022, 0.004);
    const d = [0, 1, 2].map(i => b[i] - a[i]), l = Math.hypot(...d), u = d.map(v => v / l);
    let w = [u[1] * 0 - u[2] * 1, u[2] * 0 - u[0] * 0, u[0] * 1 - u[1] * 0]; const lw = Math.hypot(...w); w = w.map(v => v / lw);   // u × y
    const v = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    const oct = (c, r) => Array.from({ length: 8 }, (_, i) => { const th = (22.5 + 45 * i) * D; return [0, 1, 2].map(k => c[k] + r * (Math.cos(th) * w[k] + Math.sin(th) * v[k])); });
    pieces.push(piece(`パイプの口（${s > 0 ? '右' : '左'}）`, planesFromPoints([...oct(a, 0.0095), ...oct(b, 0.0085)]), { color: DARK }));
  }
  return { id: 'masksnout', name: 'マスク（口先）', cat: 'マスク', size: [0.08, 0.08, 0.07], mouth: MOUTH, pieces };
})();

// ---- 船首 ----
// 面は 4 枚だけ：上の左右（中心の稜から 42 度で後ろへ流れる）と、下の左右（あごの下の先へすぼまる）。上と下の境が、への字の折れ目
const maskprow = (() => {
  const K0 = [0, 0.010, zf(0, 0.010) + 0.006], K1 = [0, -0.026, zf(0, -0.026) + 0.026], K2 = [0, -0.088, 0.066];   // 中心の稜：目の下 → いちばん前 → あごの下の先（殻の座標）
  const S1 = [0.044, -0.010, zf(0.044, -0.010) + 0.003];                                                             // 外の上の角（頬の面の少し前）
  /** 3 点を通る面の上の、(x, y) での z */
  const planeZ = (a, b, c) => { const u = [0, 1, 2].map(i => b[i] - a[i]), v = [0, 1, 2].map(i => c[i] - a[i]); const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]; return (x, y) => a[2] - (n[0] * (x - a[0]) + n[1] * (y - a[1])) / n[2]; };
  const upZ = planeZ(K0, K1, S1), S2 = [0.040, -0.036, upZ(0.040, -0.036)];                                           // 折れ目の外の端（上の面の上）
  const lowZ = planeZ(K1, K2, S2);
  const front = [K0, K1, K2, S1, S2, [0.030, 0.009, upZ(0.030, 0.009)], [0.020, -0.072, lowZ(0.020, -0.072)], [0.006, -0.088, lowZ(0.006, -0.088)]].map(p => at(...p));
  const back = [on(0, 0.010, -0.012), on(0.030, 0.009, -0.016), on(0.044, -0.010, -0.012), on(0.040, -0.036, -0.012), at(0.018, -0.070, 0.040), at(0, -0.086, 0.044)];
  const H = hullPl([...front, ...back]);
  const SLP = (K1[1] - S2[1]) / S2[0];                                                                              // 折れ目の傾き（外へ行くほど下がる）
  const abv = y0 => P([-SLP, -1, 0], [0, y0 - C[1], 0]), blw = y0 => P([SLP, 1, 0], [0, y0 - C[1], 0]);
  const Y_SEAM = K1[1], GAP = 0.003, Y_TIP = -0.078;                                                                // 継ぎ目は折れ目のすぐ下。あご先は色が変わる
  return {
    id: 'maskprow', name: 'マスク（船首）', cat: 'マスク', size: [0.09, 0.1, 0.07], mouth: MOUTH,
    pieces: [
      // （への字の線より上は凸でないので、左右に分ける。線より下は 1 つの凸）
      ...pair('口当て', [...H, XL(0), abv(Y_SEAM)]),
      ...pair('継ぎ目', [...movePl(H, [0, 0, -0.004]), XL(0), blw(Y_SEAM), abv(Y_SEAM - GAP)], { color: BLACK }),
      piece('あごの覆い', [...H, ...both(blw(Y_SEAM - GAP)), P([0, -1, 0], [0, Y_TIP - C[1], 0])]),
      piece('あご先', [...H, P([0, 1, 0], [0, Y_TIP - C[1], 0])], { color: DARK }),
    ],
  };
})();

export default [maskslit, masksnout, maskprow];
