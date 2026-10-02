// ツインアイ（八の字）：顔の前に付ける目の台。上から見下ろすと、正面を上にして 八 の字になる（中央が最も前で、左右の半分が
// それぞれ外へ向かって後ろへ折れる）。半分ずつ作り、右半分を縦軸まわりに θ 度回し、左はその鏡像。折れる角度ごとに 1 部品
// （15・18・21・24 度）。各半分は 上の縁（ひさし）・下の縁・外の柱 で囲った窓、窓の奥の暗い壁、その手前の光る目。
// 中心が原点、前が +z。中央の折れ目に細い鼻筋の柱
// 目は五角形。依頼主の写真（緑の目の頭）の上で角の位置を測って作った。目の幅を 1 として、内の下の角を (0, 0) とすると：
//   内の上 (0.07, 0.17)、外の上 (0.87, 0.33)、外の端 (1, 0.20)、下の角 (0.58, -0.03)
//   ＝ 鼻の側の端は短い縦の辺。上の辺は長く、鼻の側の端が低くて耳の側の端が高い（傾き約 11 度）。耳の側の上の角は小さく切ってある。
//      下の辺は、鼻の側から幅の 6 割まではほぼ水平で、そこで折れて、耳の側の端まで斜めに上がる（傾き約 29 度）。幅：高さ ＝ 2.8：1
//   （写真は頭が約 20 度傾いて写っているので、顔の中心線を縦として測り直した。左右の目で同じ形になるのを確かめた）
// 前は四角形で、上の辺の向きが逆だった（鼻の側の端が高く、耳の側の端が低い＝タレ目。「目が困り顔みたいになってる」）。
// 上の縁（ひさし）の下の辺は、目の上の辺と平行にする：ひさしは顔の中心でいちばん厚く、耳の側ほど薄い V 字（写真の目の上の黒い帯）
import { P, XH, XL, YH, YL, ZH, ZL, mir, piece, rotYAt, BLACK, GLOW } from '../xsasm-lib.js';

const ZF = 0.03;                                        // 中央の前面の位置（折れ目の軸はここを通る縦線）
const TILT = [0, 0.2, 1];                               // 前面は少し上を向く
const FRONT = d => P(TILT, [0, -0.025, ZF - d]);       // d = 前面からの引っ込み
const REAR = d => P(TILT.map(v => -v), [0, -0.025, ZF - d]);
const BACK = ZL(-0.03);
const SEAT = 0.006;                                     // 溝の奥の壁に当てる z（xsasm-random.js）：窓の奥の暗い壁の少し後ろ。枠・目だけ・枠なしのどれも同じ（重ねて置くと同じ位置に来る）
const CORNER_R = P([1, 0.2, 1], [0.074, -0.025, ZF]);   // 外の前の縦の角を細く落とす
// 目 1 つ（右半分の中。正面から見た輪郭）。幅 0.056（x 0.012 〜 0.068）、高さ 0.020
const EYE_PTS = [[0.012, -0.011], [0.0159, -0.0015], [0.0607, 0.0075], [0.068, 0.0002], [0.0445, -0.0127]];   // 鼻の側の下 → 鼻の側の上 → 耳の側の上 → 耳の側の端 → 下の角（右回り）
const EYE_SHAPE = EYE_PTS.map((a, i) => { const b = EYE_PTS[(i + 1) % EYE_PTS.length]; return P([-(b[1] - a[1]), b[0] - a[0], 0], [a[0], a[1], 0]); });   // 各辺の外向きの面（右回りに並べた辺の、左側が外）
const EYE_R = [...EYE_SHAPE, FRONT(0.002), REAR(0.016)];
const BROW = P([0.009, -0.0448, 0], [0.0159, 0.0035, 0]);   // ひさしの下の辺：目の上の辺と平行で、0.005 上（顔の中心で低く、耳の側で高い＝ひさしは中心が厚い）
// 右半分（回す前）：x 0 〜 0.08
const HALF_R = [
  ['上の縁', [XL(0), XH(0.08), BROW, YH(0.025), BACK, FRONT(0), CORNER_R], {}],
  ['下の縁', [XL(0), XH(0.08), YL(-0.025), YH(-0.017), BACK, FRONT(0), CORNER_R], {}],
  ['柱', [XL(0.071), XH(0.08), YL(-0.017), YH(0.022), BACK, FRONT(0), CORNER_R], {}],
  ['底板', [XL(0), XH(0.07), YL(-0.018), YH(0.018), BACK, ZH(-0.005)], {}],
  ['奥の壁', [XL(0), XH(0.07), YL(-0.018), YH(0.018), ZL(-0.01), FRONT(0.012)], { color: BLACK }],
  ['目', EYE_R, { color: GLOW, glow: true, metal: 0, rough: 0.3 }],
];

export function twinEyes(deg) {
  const pieces = [];
  for (const [name, planes, o] of HALF_R) {
    const r = rotYAt(planes, deg, 0, ZF);               // 右半分：外の端が後ろへ
    pieces.push(piece(name + '（右）', r, o), piece(name + '（左）', r.map(mir), o));
  }
  // 中央の鼻筋：折れ目を覆う細い柱。前は小さな稜
  pieces.push(piece('鼻筋', [XL(-0.012), XH(0.012), YL(-0.025), YH(0.025), BACK, P([0.6, 0.2, 1], [0.008, -0.025, ZF + 0.004]), P([-0.6, 0.2, 1], [-0.008, -0.025, ZF + 0.004])]));
  return { id: 'twineyes' + deg, name: `ツインアイ（八の字 ${deg}°）`, cat: '顔', size: [0.16, 0.05, 0.06 + 0.08 * Math.sin(deg * Math.PI / 180)], seatZ: SEAT, pieces };
}


/** 枠なし：光る目 2 つだけを八の字に置く（頭の溝や顔の板に埋めて使う）。目は少し厚みのある板で、前面が少し上を向く */
export function bareEyes(deg) {
  const eye = [...EYE_SHAPE, FRONT(0.0), REAR(0.016)];
  const r = rotYAt(eye, deg, 0, ZF);
  const o = { color: GLOW, glow: true, metal: 0, rough: 0.3 };
  return { id: 'twineyesbare' + deg, name: `ツインアイ（目だけ ${deg}°）`, cat: '顔', size: [0.13, 0.022, 0.02 + 0.064 * Math.sin(deg * Math.PI / 180)], seatZ: SEAT, fitAs: 'twineyes' + deg,
    pieces: [piece('目（右）', r, o), piece('目（左）', r.map(mir), o)] };   // fitAs：枠ありと同じ倍率で置く（枠だけの部品の窓に、そのまま入る）
}

/** 枠だけ：目を入れない枠（上下の縁・外の柱・底板・奥の暗い壁・鼻筋）を八の字に。目は別の部品（枠なしのツインアイなど）を入れる */
export function eyeFrame(deg) {
  const full = twinEyes(deg);
  return { id: 'twineyesframe' + deg, name: `ツインアイの枠（八の字 ${deg}°）`, cat: '顔', size: full.size, seatZ: SEAT, pieces: full.pieces.filter(pc => !pc.name.startsWith('目')) };
}

/** 枠を付けない：明るい縁（上下の縁・外の柱）を外し、暗い板と光る目だけを八の字に。板は縁があった所まで広い */
export function noRimEyes(deg) {
  const plate = [XL(0), XH(0.08), YL(-0.025), YH(0.025), BACK, FRONT(0.008)];
  const eye = EYE_R;
  const pr = rotYAt(plate, deg, 0, ZF), er = rotYAt(eye, deg, 0, ZF);
  const o = { color: GLOW, glow: true, metal: 0, rough: 0.3 };
  return { id: 'twineyesnorim' + deg, name: `ツインアイ（枠なし ${deg}°）`, cat: '顔', size: [0.16, 0.05, 0.06 + 0.08 * Math.sin(deg * Math.PI / 180)], seatZ: SEAT,
    pieces: [piece('板（右）', pr, { color: BLACK }), piece('板（左）', pr.map(mir), { color: BLACK }), piece('目（右）', er, o), piece('目（左）', er.map(mir), o)] };
}

export default [
  ...[15, 18, 21, 24].map(twinEyes),     // 枠あり
  ...[15, 18, 21, 24].map(noRimEyes),    // 枠なし（暗い板と目）
  ...[15, 18, 21, 24].map(bareEyes),     // 目だけ
  ...[15, 18, 21, 24].map(eyeFrame),     // 枠だけ
];

