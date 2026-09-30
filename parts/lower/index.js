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
import waistdeco from './waistdeco.js';
export const LOWER = [waist, belly, hipjoint, hipbase, skirtfront, skirtside, skirtrear, skirtback, maekake, waistdeco].flat();
export const lowerById = Object.fromEntries(LOWER.map(p => [p.id, p]));

/** 部品を置く決まった場所（骨格図の標準の寸法）。pair は左右の対（+x 側に置き、反対側は x の拡大 −1 で置く） */
const HIP = [0.175, 1.6, 0];
const AT_CAT = { 腰: [0, 1.77, 0], 後ろ腰: [0, 1.77, 0], 前掛け: [0, 1.77, 0], 腹: [0, 2.0, 0], ベルト: [0, 1.77, 0], 腰の筒: [0, 1.77, 0], 動力パイプ: [0, 1.77, 0] };
export function placementOf(def) {
  return AT_CAT[def.cat] ? { mov: AT_CAT[def.cat].slice(), pair: false } : { mov: HIP.slice(), pair: true };
}

/** 見本の組み立て：骨格図の標準の寸法（xsbody.js の makeSheet()）の置き場所に置く。左右の対は +x 側を置き、反対側は x の拡大 −1。
 *  中央の部品 [腰, 腹, 後ろ腰, 前掛け]（null で置かない）と、左右の部品 [股関節, 脚の台, 前, 横, 後ろのスカート] の id */
const sample = (mid = ['waist', 'belly', 'skirtrear', 'maekake'], sides = ['hipjoint', 'hipbase', 'skirtfront', 'skirtside', 'skirtback']) => [
  ...mid.filter(Boolean).map(part => ({ part, mov: placementOf(lowerById[part]).mov })),
  ...[1, -1].flatMap(s => sides.filter(Boolean).map(part => ({ part, mov: [s * HIP[0], HIP[1], HIP[2]], scal: [s, 1, 1] }))),
];
export const SAMPLES = {
  '標準のスカート': sample(),
  '長く大きいスカート': sample(undefined, ['hipjoint', 'hipbase', 'skirtfrontlong', 'skirtsidelong', 'skirtbacklong']),
  '重装（幅広・張り出し・ミサイルポッド）': sample(['waistbulge', 'bellyarmor', 'skirtrearbulge', 'maekakesquare'], ['hipjointdrum', 'hipbasebox', 'skirtfrontwide', 'skirtsidepod', 'skirtbackwide']),
  '軽快（短い・細い帯・尖った裾）': sample(['waistthin', 'bellybellows', 'skirtrearthruster', 'maekakeclasp'], ['hipjointball', 'hipbasedisc', 'skirtfrontpoint', 'skirtsideshort', 'skirtbackshort']),
  '短冊と 2 枚重ね': sample(['waistangular', 'belly', 'skirtrear', 'maekakelong'], ['hipjoint', 'hipbase', 'skirtfrontstrips', 'skirtsidestack', 'skirtbacklayer']),
  '差し色の縁と翼形': sample(['waistbuckle', 'belly', 'skirtrear', null], ['hipjoint', 'hipbase', 'skirtfrontaccent', 'skirtsidewing', 'skirtbackaccent']),
  'ベルトと動力パイプ': sample(['waist', 'belly', 'skirtrear', 'maekake', 'beltpouch', 'pipe'], ['hipjoint', 'hipbase', 'skirtfront', 'skirtside', 'skirtback']),
  '筒と太いベルト': sample(['waistangular', 'bellybellows', 'skirtrear', 'maekakesquare', 'beltthick', 'tubeside'], ['hipjoint', 'hipbasebox', 'skirtfrontwide', 'skirtsideshort', 'skirtbackwide']),
  '左右が合わさるスカート': sample(['waistwide', 'belly', 'skirtrearcenter', 'maekakecenter'], ['hipjoint', 'hipbase', 'skirtfrontjoined', 'skirtsidewrap', 'skirtbackjoined']),
};

/** ランダムに組む：部位ごとに 1 つ選ぶ。前スカートの系統（短い・長い・短冊など）を先に決め、後ろスカートも多くは同じ系統に、
 *  長いスカートなら横も長くしやすく。左右が合わさるスカートは、幅広の帯・真ん中の動かない板（前掛け・後ろ腰）・前後とつながる横スカートで組む
 *  （片方の脚で板が開いても穴があかない）。ほかは前掛けを 4 回に 1 回は置かない。真ん中の板はほかのスカートとは組まない */
export function randomLower(rnd = Math.random) {
  const pick = list => list[Math.floor(rnd() * list.length)];
  const ids = cat => LOWER.filter(p => p.cat === cat).map(p => p.id);
  const front = pick(ids('前スカート'));
  const fam = front.replace('skirtfront', '');
  const back = fam === 'joined' ? 'skirtbackjoined' : lowerById['skirtback' + fam] && rnd() < 0.8 ? 'skirtback' + fam : pick(ids('後ろスカート').filter(id => id !== 'skirtbackjoined'));
  // 左右が合わさるスカートは、前後とつながる横スカートでまわりを埋める（すき間が空かないように）
  const side = fam === 'joined' ? 'skirtsidewrap' : fam === 'long' && rnd() < 0.7 ? 'skirtsidelong' : pick(ids('横スカート').filter(id => id !== 'skirtsidewrap'));
  const maekake = fam === 'joined' ? 'maekakecenter' : rnd() < 0.25 ? null : pick(ids('前掛け').filter(id => id !== 'maekakecenter'));
  const rear = fam === 'joined' ? 'skirtrearcenter' : pick(ids('後ろ腰').filter(id => id !== 'skirtrearcenter'));
  const waist = fam === 'joined' ? 'waistwide' : pick(ids('腰').filter(id => id !== 'waistwide'));
  // 腰の飾り：ベルト（半分くらい、幅広の帯には幅広の帯用）・筒・動力パイプ（3 回に 1 回くらい）
  const belt = rnd() < 0.5 ? (waist === 'waistwide' ? 'beltwide' : pick(ids('ベルト').filter(id => id !== 'beltwide'))) : null;
  const deco = [belt, rnd() < 0.3 ? pick(ids('腰の筒')) : null, rnd() < 0.35 ? pick(ids('動力パイプ')) : null];
  return sample([waist, pick(ids('腹')), rear, maekake, ...deco], [pick(ids('股関節')), pick(ids('脚の台')), front, side, back]);
}
export const SAMPLE = SAMPLES['標準のスカート'];
