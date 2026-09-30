// 下半身（腰の骨）の部品の目次。1 部品 1 ファイル。前・後ろのスカートは蝶番（hinge）で腰に付き、脚に押されて開く
import waist from './waist.js';
import belly from './belly.js';
import hipjoint from './hipjoint.js';
import hipbase from './hipbase.js';
import skirtfront from './skirtfront.js';
import skirtside from './skirtside.js';
import skirtrear from './skirtrear.js';
import skirtback from './skirtback.js';
import maekake from './maekake.js';
export const LOWER = [waist, belly, hipjoint, hipbase, skirtfront, skirtside, skirtrear, skirtback, maekake].flat();
export const lowerById = Object.fromEntries(LOWER.map(p => [p.id, p]));

/** 部品を置く決まった場所（骨格図の標準の寸法）。pair は左右の対（+x 側に置き、反対側は x の拡大 −1 で置く） */
const HIP = [0.175, 1.6, 0];
const AT_CAT = { 腰: [0, 1.77, 0], 後ろ腰: [0, 1.77, 0], 前掛け: [0, 1.77, 0], 腹: [0, 2.0, 0] };
export function placementOf(def) {
  return AT_CAT[def.cat] ? { mov: AT_CAT[def.cat].slice(), pair: false } : { mov: HIP.slice(), pair: true };
}

/** 見本の組み立て：骨格図の標準の寸法（xsbody.js の makeSheet()）の置き場所に置く。左右の対は +x 側を置き、反対側は x の拡大 −1。
 *  skirts: [前, 横, 後ろ] のスカートの部品 id */
const sample = (skirts = ['skirtfront', 'skirtside', 'skirtback']) => [
  { part: 'waist', mov: [0, 1.77, 0] },
  { part: 'belly', mov: [0, 2.0, 0] },
  { part: 'skirtrear', mov: [0, 1.77, 0] },
  { part: 'maekake', mov: [0, 1.77, 0] },
  ...[1, -1].flatMap(s => ['hipjoint', 'hipbase', ...skirts].map(part => ({ part, mov: [s * HIP[0], HIP[1], HIP[2]], scal: [s, 1, 1] }))),
];
export const SAMPLES = {
  '標準のスカート': sample(),
  '長く大きいスカート': sample(['skirtfrontlong', 'skirtsidelong', 'skirtbacklong']),
};
export const SAMPLE = SAMPLES['標準のスカート'];
