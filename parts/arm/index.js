// 腕（上腕・ひじ・前腕・手）の部品の目次。1 部位 1 ファイル。ひじは 2 重関節（xs-editor/doublejoint.js）：上腕（骨 arm）・
// 中間の節（骨 elbow）・前腕と手（骨 fore）。どれも左右の対で、+x 側に置き、反対側は x の拡大 −1 で置く。
// 置き場所はひじの中心 E（骨格図の肩 x 0.45・y 2.5 から、外へ 0.13・下へ 0.55）
import upperarm from './upperarm.js';
import elbow from './elbow.js';
import forearm from './forearm.js';
import foredeco from './foredeco.js';
import hand from './hand.js';
export const ARM = [upperarm, elbow, forearm, foredeco, hand].flat();
export const armById = Object.fromEntries(ARM.map(p => [p.id, p]));
export const ARM_AT = [0.58, 1.95, 0];
export const ARM_CAT = new Set(['上腕', 'ひじ', '前腕', '前腕の飾り', '手']);
export const placementOfArm = () => ({ mov: ARM_AT.slice(), pair: true });

/** 見本：左右の腕の部品の id（上腕・ひじ・前腕・手と飾り） */
const sample = ids => [1, -1].flatMap(s => ids.filter(Boolean).map(part => ({ part, mov: [s * ARM_AT[0], ARM_AT[1], ARM_AT[2]], scal: [s, 1, 1] })));
export const ARM_SAMPLES = {
  標準: sample(['upperarm', 'elbowguard', 'forearm', 'handfist']),
  '角ばった装甲と籠手': sample(['upperarmbox', 'elbowspike', 'forearmgauntlet', 'handfistarmor']),
  '細いフレーム': sample(['upperarmframe', 'elbowplates', 'forearmframe', 'handopen']),
  '太い樽と袖口': sample(['upperarmthick', 'elbowthick', 'forearmcuff', 'handfistmitten']),
  '段付きと盾の付け根': sample(['upperarmstep', 'elbowguard', 'forearmsplit', 'foreshieldmount', 'handfist']),
  '下に広がる腕と鉤爪': sample(['upperarmflare', 'elbowaccent', 'forearmhex', 'forespike', 'handclaw']),
  '差し色と噴射口': sample(['upperarmaccent', 'elbowdouble', 'forearmprow', 'forethruster', 'handopenflat']),
  'ピストンと甲のとげ': sample(['upperarmpiston', 'elbowplates', 'forearmpiston', 'handfistspike']),
  '蛇腹': sample(['upperarmbellows', 'elbowthick', 'forearmbellows', 'foreweaponrack', 'handfistarmor']),
};
/** ランダムに組む：上腕・ひじ・前腕・手を 1 つずつ（手は 7 割が握った手）、前腕の飾りは 4 割 */
export function randomArm(rnd = Math.random) {
  const ids = cat => ARM.filter(p => p.cat === cat).map(p => p.id);
  const pick = list => list[Math.floor(rnd() * list.length)];
  const hands = ids('手'), fists = hands.filter(id => id.startsWith('handfist'));
  return sample([pick(ids('上腕')), pick(ids('ひじ')), pick(ids('前腕')), rnd() < 0.4 ? pick(ids('前腕の飾り')) : null, rnd() < 0.7 ? pick(fists) : pick(hands.filter(id => !fists.includes(id)))]);
}
