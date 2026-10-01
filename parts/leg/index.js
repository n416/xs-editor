// 脚（太もも・ひざ当て・すね・足）の部品の目次。1 部位 1 ファイル。ひざの中は 2 重関節（xs-editor/doublejoint.js）だが、太ももとすねの装甲の中に
// 隠して外からは見せない（parts/leg/kit.js）。太もも（骨 leg）・節とひざ当て（骨 knee）・すねと足（骨 shin）。
// どれも左右の対で、+x 側に置き、反対側は x の拡大 −1 で置く。置き場所はひざの中心 K（骨格図の股関節 x 0.175・y 1.6 から 0.46 下）
import thigh from './thigh.js';
import knee from './knee.js';
import shin from './shin.js';
import shindeco from './shindeco.js';
import foot from './foot.js';
export const LEG = [thigh, knee, shin, shindeco, foot].flat();
export const legById = Object.fromEntries(LEG.map(p => [p.id, p]));
export const LEG_AT = [0.175, 1.14, 0];
export const LEG_CAT = new Set(['太もも', 'ひざ', 'すね', 'すねの飾り', '足']);
export const placementOfLeg = () => ({ mov: LEG_AT.slice(), pair: true });

const sample = ids => [1, -1].flatMap(s => ids.filter(Boolean).map(part => ({ part, mov: [s * LEG_AT[0], LEG_AT[1], LEG_AT[2]], scal: [s, 1, 1] })));
export const LEG_SAMPLES = {
  '細身（縦長のひざ当て・とがったふくらはぎ）': sample(['thigh', 'knee', 'shin', 'foot']),
  '卵形の太ももと釣鐘の裾': sample(['thighegg', 'kneepad', 'shinbell', 'shinpipe', 'footsole']),
  '大きな釣鐘': sample(['thighround', 'kneesmall', 'shinbigbell', 'footwide']),
};
/** ランダムに組む：太もも・ひざ当て・すね・足を 1 つずつ */
export function randomLeg(rnd = Math.random) {
  const ids = cat => LEG.filter(p => p.cat === cat).map(p => p.id);
  const pick = list => list[Math.floor(rnd() * list.length)];
  return sample([pick(ids('太もも')), pick(ids('ひざ')), pick(ids('すね')), pick(ids('足'))]);
}
