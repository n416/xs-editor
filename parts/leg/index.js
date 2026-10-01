// 脚（太もも・ひざ・すね・足）の部品の目次。1 部位 1 ファイル。ひざは 2 重関節（xs-editor/doublejoint.js、正座で折りたためる長い節）：
// 太もも（骨 leg）・中間の節（骨 knee）・すねと足（骨 shin）。どれも左右の対で、+x 側に置き、反対側は x の拡大 −1 で置く。
// 置き場所はひざの中心 K（骨格図の股関節 x 0.175・y 1.6 から 0.44 下、z −0.03）
import thigh from './thigh.js';
import knee from './knee.js';
import shin from './shin.js';
import shindeco from './shindeco.js';
import thighdeco from './thighdeco.js';
import foot from './foot.js';
export const LEG = [thigh, thighdeco, knee, shin, shindeco, foot].flat();
export const legById = Object.fromEntries(LEG.map(p => [p.id, p]));
export const LEG_AT = [0.175, 1.16, -0.03];
export const LEG_CAT = new Set(['太もも', '太ももの飾り', 'ひざ', 'すね', 'すねの飾り', '足']);
export const placementOfLeg = () => ({ mov: LEG_AT.slice(), pair: true });

const sample = ids => [1, -1].flatMap(s => ids.filter(Boolean).map(part => ({ part, mov: [s * LEG_AT[0], LEG_AT[1], LEG_AT[2]], scal: [s, 1, 1] })));
export const LEG_SAMPLES = {
  標準: sample(['thigh', 'kneeguard', 'shin', 'foot']),
  '丸い脚と噴射口': sample(['thighround', 'knee', 'shinround', 'shinthruster', 'footround']),
  '重装（張り出しと裾）': sample(['thighbulge', 'kneethick', 'shinflare', 'shinsidearmor', 'footwide']),
  '細いフレーム': sample(['thighframe', 'kneeplates', 'shinframe', 'foottoes']),
  '角ばった塊ととがったひざ': sample(['thighblock', 'kneespike', 'shinprow', 'footlong']),
  '2 枚の板とミサイル': sample(['thighsplit', 'kneeguard', 'shincalf', 'shinpod', 'footheel']),
  '差し色と 6 角': sample(['thightaper', 'kneeaccent', 'shinhex', 'shinvent', 'foothover']),
  'ピストンと 3 本の爪': sample(['thighpiston', 'thighthruster', 'kneeplates', 'shinpiston', 'footclaw']),
  '蛇腹と車輪': sample(['thighbellows', 'thighholster', 'kneethick', 'shinbellows', 'footwheel']),
};
/** ランダムに組む：太もも・ひざ・すね・足を 1 つずつ、すねの飾りは 4 割、太ももの飾りは 3 割 */
export function randomLeg(rnd = Math.random) {
  const ids = cat => LEG.filter(p => p.cat === cat).map(p => p.id);
  const pick = list => list[Math.floor(rnd() * list.length)];
  return sample([pick(ids('太もも')), rnd() < 0.3 ? pick(ids('太ももの飾り')) : null, pick(ids('ひざ')), pick(ids('すね')), rnd() < 0.4 ? pick(ids('すねの飾り')) : null, pick(ids('足'))]);
}
