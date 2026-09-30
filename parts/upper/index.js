// 上半身（胴の骨 torso）の部品の目次。1 部品 1 ファイル。肩アーマーは腕の骨（arm）に付き、腕と一緒に回る。
// 置き場所は骨格図の標準の寸法（xsbody.js の makeSheet()）：胸の下端の中心 (0, 2.1, 0)、肩関節の中心 (±0.45, 2.5, 0)
import chest from './chest.js';
import shoulder from './shoulder.js';
import shoulderarmor from './shoulderarmor.js';
import collar from './collar.js';
import backpack from './backpack.js';
import chestdeco from './chestdeco.js';
export const UPPER = [chest, shoulder, shoulderarmor, collar, backpack, chestdeco].flat();
export const upperById = Object.fromEntries(UPPER.map(p => [p.id, p]));

export const CHEST_AT = [0, 2.1, 0], SHOULDER_AT = [0.45, 2.5, 0];
const PAIR_CAT = new Set(['肩関節', '肩アーマー']);
/** 部品を置く決まった場所。pair は左右の対（+x 側に置き、反対側は x の拡大 −1 で置く） */
export function placementOfUpper(def) {
  return PAIR_CAT.has(def.cat) ? { mov: SHOULDER_AT.slice(), pair: true } : { mov: CHEST_AT.slice(), pair: false };
}
/** 見本：中央の部品と、左右の対の部品の id */
const sample = (mid, sides) => [
  ...mid.filter(Boolean).map(part => ({ part, mov: CHEST_AT.slice() })),
  ...[1, -1].flatMap(s => sides.filter(Boolean).map(part => ({ part, mov: [s * SHOULDER_AT[0], SHOULDER_AT[1], SHOULDER_AT[2]], scal: [s, 1, 1] }))),
];
export const UPPER_SAMPLES = {
  標準: sample(['chest', 'collar', 'backpack'], ['shoulderjoint', 'shoulderarmor']),
  '丸い胸と盾': sample(['chestbarrel', 'collarlow', 'backpackbooster', 'chestpipe'], ['shoulderjointdrum', 'shoulderarmorshield']),
  '角ばった胸と箱形': sample(['chestangular', 'collarwide', 'backpack', 'chestventlong'], ['shoulderjoint', 'shoulderarmorbox']),
  '細い胸と重ね板': sample(['chestslim', 'collar', 'backpackslim'], ['shoulderjoint', 'shoulderarmorlayer']),
  '差し色の胸ととげ': sample(['chestaccent', 'collarlow', 'backpackbooster', 'chestpipethick'], ['shoulderjointdrum', 'shoulderarmorspike']),
  '大きな丸い肩': sample(['chestbarrel', 'collarlow', 'backpack'], ['shoulderjoint', 'shoulderarmorbig']),
  '段付きの丸い肩': sample(['chest', 'collar', 'backpackslim', 'chestpipe'], ['shoulderjointdrum', 'shoulderarmorstep']),
  '通気口とハッチ': sample(['chest', 'collar', 'backpack', 'chestvent', 'chesthatch'], ['shoulderjoint', 'shoulderarmorbox']),
};
/** ランダムに組む：部位ごとに 1 つ（襟・背中はたいてい付け、胸の飾りは 0〜2 個） */
export function randomUpper(rnd = Math.random) {
  const ids = cat => UPPER.filter(p => p.cat === cat).map(p => p.id);
  const pick = list => list[Math.floor(rnd() * list.length)];
  const deco = ids('胸の飾り').filter(() => rnd() < 0.3);
  if (deco.includes('chestpipe') && deco.includes('chestpipethick')) deco.splice(deco.indexOf('chestpipe'), 1);
  if (deco.includes('chestvent') && deco.includes('chestventlong')) deco.splice(deco.indexOf('chestvent'), 1);
  return sample([pick(ids('胸')), rnd() < 0.85 ? pick(ids('襟')) : null, rnd() < 0.9 ? pick(ids('背中')) : null, ...deco], [pick(ids('肩関節')), pick(ids('肩アーマー'))]);
}
