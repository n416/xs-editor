// 機体エディタ Ver2 の「噴射口」の部品と「盾」の欄が置く物。
//
// 噴射口 jet（カタログの「背中」の部位「噴射口」、または「噴射口」の欄の「＋ 噴射口を足す」。テスター もちゅなさん 2026-11-15
// #要望用「スラスター噴射専用のパーツの実装と、噴射する方向を矢印で表示して欲しい」）：炎を出すための専用の部品。原点が口の真ん中、
// −z が噴き出す向き、口の半径 JET_R × 拡大。形は、付け根の台・奥へすぼまる釣鐘（12 枚の板の輪）・奥の暗い板（書き出す形）。
// 書き出しはこの部品の口に炎の点（骨 jet_<n>、xsengine.js の jet）を置き、ゲームはそこから口の向きへ炎を出す。
// 向きの矢印（editorOnly のブロック）はエディタの中だけ：部品と一緒に回る。書き出す形には入らない（unitparts.js があたりにする）。
// 部品の名前に「噴射口」の付いた物（ランドセルの口など）からの炎は今までどおり。この部品はそれに足される。
//
// 炎の点 jetpoint（「噴射口」の欄の「部品の噴射口も動かせるようにする」が置く）：形の無い炎の点。部品の噴射口の炎を、部品から離して
// 動かしたい時のため。1 つでもあると、部品の名前による炎は出ず、炎は噴射口の部品とこの点からだけ出る。エディタでは口の輪と矢印だけ。
//
// 盾の土台 shieldbase：盾の欄の「盾の土台を置く」で、左の前腕の外に置く板。付ける骨「盾」で置く（item.bone = 'shield'）。
// 原点が盾の真ん中、外の面が +x（機体の左＝外）、上が +y、幅が z。ゲームの盾（client/src/models.ts makeShield）と同じ組み方：
// 真ん中の稜から左右の半分を後ろへ反らせ、外の面は上下の真ん中を少し前へ膨らませる（広い面を垂直にしない）。
// 稜に沿う差し色の帯と、真ん中の暗い突起。大きさはゲームの盾の標準（高さ 8 m・幅 4.6 m・厚み 0.42 m、1 単位 = 6 m）[独自]。
// ゲームは、付ける骨が「盾」の部品をまとめて、その XS の盾の高さに合わせて縮める・広げる（見た目だけ。当たり判定・耐久は変わらない）。
import { hull } from '../limb/kit.js';
import { DARK, BLACK, MAIN, ACCENT, GLOW } from '../../xsasm-lib.js';

export const JET_R = 0.06;   // 噴射口の口の半径（拡大 1 のとき。背中のランドセルの大きい方の口と同じくらい）[独自]
const ring = (r, z, n = 10, a0 = 0.5) => Array.from({ length: n }, (_, k) => { const a = (k + a0) * 2 * Math.PI / n; return [r * Math.cos(a), r * Math.sin(a), z]; });
const P = { bone: 'torso', pivot: 'none' };
// 向きの矢印（口から噴き出す向き −z へ。軸の四角柱と、先の四角錐）：エディタの中だけ
const ARROW = [
  hull('向きの矢印の軸', [...ring(0.008, -0.01, 4, 0), ...ring(0.008, -0.2, 4, 0)], { ...P, color: '#ff7a2f', glow: true, opacity: 0.95, editorOnly: true }),
  hull('向きの矢印の先', [...ring(0.03, -0.2, 4, 0), [0, 0, -0.29]], { ...P, color: '#ff7a2f', glow: true, opacity: 0.95, editorOnly: true }),
];
// 釣鐘の板 1 枚（k 番目）：のど（z 0.06、半径 0.62）から口（z 0、半径 1）へ開く。外の面と内の面の間に厚み
const BELL_N = 12, TH = 0.12;
const bell = k => {
  const pts = [];
  for (const a of [(k - 0.08) / BELL_N, (k + 1.08) / BELL_N]) {
    const c = Math.cos(a * 2 * Math.PI), s = Math.sin(a * 2 * Math.PI);
    for (const [r, z] of [[1, 0], [0.62, 0.06]]) for (const t of [0, TH]) pts.push([JET_R * (r - t) * c, JET_R * (r - t) * s, z]);
  }
  return hull(`釣鐘の板 ${k + 1}`, pts, { ...P, color: DARK });
};
export const JET = {
  id: 'jet', name: '噴射口', cat: '噴射口', size: [0.14, 0.14, 0.14], jet: 'part',
  pieces: [
    ...Array.from({ length: BELL_N }, (_, k) => bell(k)),
    // のどの奥の暗い板と、その後ろの付け根の台（八角、後ろへ少しすぼまる）
    hull('奥の板', [...ring(JET_R * 0.6, 0.055, 12), ...ring(JET_R * 0.6, 0.065, 12)], { ...P, color: BLACK }),
    hull('付け根の台', [...ring(JET_R * 0.95, 0.06, 8, 0), ...ring(JET_R * 0.78, 0.11, 8, 0)], { ...P, color: MAIN }),
    ...ARROW,
  ],
};
export const JET_POINT = {
  id: 'jetpoint', name: '炎の点', cat: '噴射口', size: [0.12, 0.12, 0.3], jet: 'point',
  pieces: [
    hull('炎の点の口', [...ring(JET_R * 0.9, 0.006), ...ring(JET_R, 0)], { ...P, color: GLOW, glow: true, opacity: 0.8, editorOnly: true }),
    ...ARROW,
  ],
};

// 煙・火花の点 fxpoint（「煙・火花」の欄の「＋ 煙を足す」「＋ 火花を足す」が置く。issue 1024、モデレーター なおぴおさん 2026-11-20 #要望用
// 「煙や火花のエフェクトを発生させるアイテムを追加してほしい」「それらを作動させる条件付け(移動中、ブースト中、特定の形態中など)」）：形の無い点。
// 原点から −z の向きへ、煙か火花を出す。種類・量・大きさ・出す時は置いたパーツの item.fx（v2.js fxOf）。書き出しはここに骨 fx_<n> を置き
// （xsengine.js）、ゲームは自分のスキンでだけ、そこから出す（client/src/models.ts fxPts、world.ts）。エディタでは口の輪と矢印だけ（書き出さない）
const FX_ARROW = [
  hull('向きの矢印の軸', [...ring(0.008, -0.01, 4, 0), ...ring(0.008, -0.2, 4, 0)], { ...P, color: '#9fd4ff', glow: true, opacity: 0.95, editorOnly: true }),
  hull('向きの矢印の先', [...ring(0.03, -0.2, 4, 0), [0, 0, -0.29]], { ...P, color: '#9fd4ff', glow: true, opacity: 0.95, editorOnly: true }),
];
export const FX_POINT = {
  id: 'fxpoint', name: '煙・火花の点', cat: '噴射口', size: [0.12, 0.12, 0.3], fx: true,
  pieces: [
    hull('煙・火花の点の口', [...ring(JET_R * 0.9, 0.006), ...ring(JET_R, 0)], { ...P, color: '#9fd4ff', glow: true, opacity: 0.8, editorOnly: true }),
    ...FX_ARROW,
  ],
};

// 置いたパーツの item.fx = { k: 種類, w: 出す時, n: 量（1 秒に出す数）, s: 大きさ（倍） }。書いていない所は下の既定 [独自]
export const FX_KINDS = { smoke: '煙', spark: '火花' };
// 出す時（どれか 1 つでも当てはまる間に出す）：ずっと・移動中（地面でも空中でも、横へ 3 m/s より速い）・ブースト中（噴射の炎が出ている間：
// ダッシュ・上昇・回避）・形態 2 の間（自分のスキンの形態 2 になっている間：「ゲームで形態 2 になる時」のとおり）。境の値は client/src/world.ts FX_MOVE など
export const FX_WHEN = { always: 'ずっと', move: '移動中', boost: 'ブースト中', form2: '形態 2 の間' };
export const FX_N = [1, 20], FX_S = [0.3, 3];   // 量・大きさの幅
export function fxOf(it) {
  const f = it?.fx ?? {}, k = f.k in FX_KINDS ? f.k : 'smoke';
  const w = Array.isArray(f.w) ? f.w.filter(x => x in FX_WHEN) : [];
  const clamp = (v, [a, b], d) => (Number.isFinite(v) ? Math.min(b, Math.max(a, v)) : d);
  return { k, w: w.length ? w : ['always'], n: Math.round(clamp(f.n, FX_N, k === 'spark' ? 10 : 6)), s: Math.round(clamp(f.s, FX_S, 1) * 100) / 100 };
}

const H = 8 / 6, W = 4.6 / 6, T = 0.42 / 6;   // 高さ・幅・厚み（エディタの単位）
const KEEL = 0.16;                          // 左右の半分を後ろへ反らせる角度（rad。ゲームの盾の 1 つと同じ）
const BULGE = 0.018;                        // 外の面の上下の真ん中の膨らみ
const h2 = H / 2, w2 = W / 2, c = W * 0.18;
// 半分の輪郭（z：稜からの幅、y）：上の角を落とし、下は稜の側へすぼまる（ゲームの盾の形 0）
const OUTLINE = [[0, h2], [w2 - c, h2], [w2, h2 - c], [w2, -h2 + c * 2.2], [W * 0.16, -h2], [0, -h2]];
/** 半分の板（sg = 1 が +z の側）：輪郭の点を、裏（x 0）と表（x T。上下の真ん中は BULGE だけ前）に置き、稜（z 0）を軸に後ろへ反らせる */
const half = sg => {
  const pts = [];
  for (const [z, y] of OUTLINE) for (const x of [0, T + BULGE * (1 - (y / h2) ** 2)]) {
    const zz = sg * z;
    pts.push([x - Math.abs(zz) * Math.sin(KEEL), y, zz * Math.cos(KEEL)]);
  }
  return hull(sg > 0 ? '盾の板（右）' : '盾の板（左）', pts, { color: MAIN, pivot: 'none' });
};
export const SHIELD_BASE = {
  id: 'shieldbase', name: '盾の土台', cat: '盾', size: [T, H, W],
  pieces: [
    half(1), half(-1),
    // 稜に沿う差し色の帯（板の表より少し前へ出る。上下の端は板の中で止める）
    hull('盾の帯', [[T + BULGE - 0.01, h2 * 0.72, 0.045], [T + BULGE - 0.01, h2 * 0.72, -0.045], [T + BULGE - 0.01, -h2 * 0.76, 0.03], [T + BULGE - 0.01, -h2 * 0.76, -0.03],
      [T + BULGE + 0.022, h2 * 0.68, 0.03], [T + BULGE + 0.022, h2 * 0.68, -0.03], [T + BULGE + 0.022, -h2 * 0.72, 0.018], [T + BULGE + 0.022, -h2 * 0.72, -0.018]], { color: ACCENT, pivot: 'none' }),
    // 真ん中の上寄りの突起（暗い八角の台）
    hull('盾の突起', [...ring(0.085, 0, 8).map(([a, b]) => [T + BULGE - 0.01, h2 * 0.2 + a, b]), ...ring(0.06, 0, 8).map(([a, b]) => [T + BULGE + 0.045, h2 * 0.2 + a, b])], { color: DARK, pivot: 'none' }),
    // 裏の 2 本の帯（前腕が通る所。暗い骨組みの色）
    ...[h2 * 0.32, -h2 * 0.16].map((y, k) => hull(`盾の裏の帯 ${k + 1}`, [[0.01, y + 0.04, 0.12], [0.01, y - 0.04, 0.12], [0.01, y + 0.04, -0.12], [0.01, y - 0.04, -0.12],
      [-0.05, y + 0.035, 0.1], [-0.05, y - 0.035, 0.1], [-0.05, y + 0.035, -0.1], [-0.05, y - 0.035, -0.1]], { color: BLACK, pivot: 'none' })),
  ],
};
