// 頭の中心線に沿って、額の上から後頭部まで続くトサカ 3 種と、額の上に立つ「台形モニタのセンサー」。
// 写真（依頼主が見せた頭：中央の上の塊の前面に台形の光るモニタ、塊は頭の後ろへ続く）から。寸法は写真の上で、頭の幅を 1 として目で測った比：
//   塊の幅 0.22、モニタの幅 0.13（上の辺）・高さ 0.16・下の辺は上の辺の 0.83、塊が頭頂より上へ出る高さ 0.2（頭の高さ比）。
//   モニタのまわりは暗い板で、下は額の真ん中へ向かって槍の先のようにすぼまる
// 座標は頭の殻の決まり（幅 ±0.094、頭頂 0.146、前 +z）。attach [0, 0, 0]：殻と同じ倍率で、殻の中心線の上に置く。
// どの殻にも沿うように、底は 3 つの殻（頭の殻・バイザーの頭・ひさしの頭）のいちばん低い上面より 0.02 下まで沈め、上の縁はいちばん高い上面から測る。
// 殻の上面の高さは tools/headgen/profile.mjs で測った値（中心線の上）
import { piece, planesFromPoints, MAIN, DARK, GLOW } from '../xsasm-lib.js';

const hull = (name, pts, o = {}) => piece(name, planesFromPoints(pts), o);
//            額の上                       頭頂                          後頭部
const Z    = [0.135, 0.12,  0.10,  0.06,  0.02,  -0.02, -0.06, -0.10, -0.125];
const LOW  = [0.077, 0.095, 0.112, 0.131, 0.137, 0.137, 0.129, 0.108, 0.060];   // いちばん低い殻の上面
const HIGH = [0.109, 0.120, 0.130, 0.137, 0.145, 0.144, 0.135, 0.121, 0.100];   // いちばん高い殻の上面
const SINK = 0.02;
/** 位置 i の断面（左右対称の六角形）：底の半幅 wb、肩（上面から hs の高さ）の半幅 ws、上の縁（上面から h の高さ）の半幅 wt。横の面は内へ倒れる */
const sec = (i, { wb, ws, wt, h, hs }) => { const yb = LOW[i] - SINK, ys = HIGH[i] + hs, yt = HIGH[i] + h; return [[-wb, yb], [wb, yb], [ws, ys], [wt, yt], [-wt, yt], [-ws, ys]].map(([x, y]) => [x, y, Z[i]]); };
/** 位置 i0 〜 i1 を、となり合う断面どうしを包む凸の形でつなぐ */
const run = (name, spec, i0, i1, o = {}) => Array.from({ length: i1 - i0 }, (_, k) => hull(`${name} ${k + 1}`, [...sec(i0 + k, spec(i0 + k)), ...sec(i0 + k + 1, spec(i0 + k + 1))], o));

// 1) 背びれ（低い稜線）：額の上から後頭部まで続く、低く鋭い稜線
const KEEL_H = [0.004, 0.012, 0.016, 0.018, 0.018, 0.016, 0.013, 0.009, 0.004];
const keel = { id: 'spinekeel', name: '背びれ（低い稜線・後ろまで）', cat: 'トサカ', size: [0.022, 0.1, 0.26], attach: [0, 0, 0],
  pieces: run('稜線', i => ({ wb: 0.011, ws: 0.007, wt: 0.0015, h: KEEL_H[i], hs: KEEL_H[i] * 0.4 }), 0, 8) };

// 2) 背の装甲（太い）：写真の塊の、後ろへ続く部分。前が高く、後ろへ向かって低くなる。肩に段、上は細い帯
const ARMOR_H = [0.004, 0.016, 0.030, 0.038, 0.034, 0.028, 0.022, 0.014, 0.005];
const armor = { id: 'spinearmor', name: '背の装甲（太い・後ろまで）', cat: 'トサカ', size: [0.042, 0.12, 0.26], attach: [0, 0, 0],
  pieces: run('装甲', i => ({ wb: 0.021, ws: 0.014, wt: 0.006, h: ARMOR_H[i], hs: Math.max(0.002, ARMOR_H[i] - 0.008) }), 0, 8) };

// 3) 背の板（後ろへ高くなる）：頭に沿う薄い板。後ろへ向かって高くなり、後頭部の先で後ろへ流れる
const BLADE_H = [0.003, 0.010, 0.018, 0.028, 0.038, 0.048, 0.054, 0.050, 0.030];
const bladeSpec = i => ({ wb: 0.008, ws: 0.005, wt: 0.0012, h: BLADE_H[i], hs: BLADE_H[i] * 0.5 });
const blade = { id: 'spineblade', name: '背の板（後ろへ高くなる・後ろまで）', cat: 'トサカ', size: [0.016, 0.16, 0.31], attach: [0, 0, 0],
  pieces: [...run('板', bladeSpec, 0, 8), hull('板の先', [...sec(8, bladeSpec(8)), [0, 0.165, -0.175], [0, 0.138, -0.168]])] };

// 4) 台形モニタのセンサー：額の上に立つ塊。前面は上ほど後ろへ倒れ、暗い板の中に、一段くぼんだ台形の光るモニタ。暗い板の下は額へ向かってすぼまる。
//    後ろは頭頂へ斜めに下りる（背の装甲と重ねると、写真の形になる）
const zF = y => 0.105 + (0.188 - y) * 0.36;                                   // 前面：上ほど後ろへ（y 0.188 で z 0.105、y 0.06 で z 0.151）
const NF = (() => { const l = Math.hypot(0.36, 1); return [0, 0.36 / l, 1 / l]; })();   // 前面の外向きの向き
/** 前面の上の点 (x, y) を、面から d だけ外へ */
const onF = (x, y, d = 0) => [x, y + NF[1] * d, zF(y) + NF[2] * d];
/** 前面の上の輪郭（(x, y) の並び）を、面の −0.002 〜 top まで厚みを付けた板 */
const plate = (name, outline, top, o) => hull(name, outline.flatMap(([x, y]) => [onF(x, y, -0.002), onF(x, y, top)]), o);
const both = pts => [...pts, ...pts.map(([x, y]) => [-x, y])];
const BODY = { wb: 0.022, ws: 0.014, wt: 0.008 };
const MON = { y0: 0.140, y1: 0.170, w0: 0.010, w1: 0.012 };                    // モニタ：下の辺の半幅 w0、上の辺の半幅 w1
const PANEL_W = 0.0145;
const sensor = { id: 'trapmonitor', name: '台形モニタのセンサー（額の上）', cat: '頭の上の装備', size: [0.044, 0.13, 0.15], attach: [0, 0, 0],
  pieces: [
    hull('後ろの斜面', [...sec(4, { wb: 0.016, ws: 0.01, wt: 0.005, h: 0.004, hs: 0.002 }), ...sec(3, { ...BODY, h: 0.040, hs: 0.030 })]),
    hull('胴', [...sec(3, { ...BODY, h: 0.040, hs: 0.030 }), ...sec(2, { ...BODY, h: 0.056, hs: 0.046 })]),
    hull('前の塊', [...sec(2, { ...BODY, h: 0.056, hs: 0.046 }), ...both([[0.012, 0.188], [0.018, 0.176], [0.0205, 0.120], [0.004, 0.060]]).map(([x, y]) => onF(x, y))]),
    plate('暗い板・上', both([[0.009, 0.182], [PANEL_W, 0.174], [PANEL_W, MON.y1]]), 0.004, { color: DARK }),
    plate('暗い板・右', [[MON.w1, MON.y1], [PANEL_W, MON.y1], [PANEL_W, MON.y0], [MON.w0, MON.y0]], 0.004, { color: DARK }),
    plate('暗い板・左', [[-MON.w1, MON.y1], [-PANEL_W, MON.y1], [-PANEL_W, MON.y0], [-MON.w0, MON.y0]], 0.004, { color: DARK }),
    plate('暗い板・下', [...both([[PANEL_W, MON.y0], [PANEL_W, 0.125]]), [0, 0.068]], 0.004, { color: DARK }),
    plate('モニタ', both([[MON.w1, MON.y1], [MON.w0, MON.y0]]), 0.002, { color: GLOW, glow: true, metal: 0, rough: 0.3 }),
  ] };

export default [sensor, keel, armor, blade];
