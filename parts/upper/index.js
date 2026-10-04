// 上半身（胴の骨 torso）の部品の目次。1 部品 1 ファイル。胴は胸・背中・腹・脇腹の 4 つに分け、部位ごとに差し替える。
// 肩アーマーは腕の骨（arm）に付き、腕と一緒に回る。バックパックと翼は背中の部品（parts/back）。
// 置き場所は骨格図の標準の寸法（xsbody.js の makeSheet()）：胸の下端の中心 (0, 2.1, 0)、肩関節の中心 (±0.45, 2.5, 0)
import chest from './chest.js';
import back from './back.js';
import abdomen from './abdomen.js';
import flank from './flank.js';
import shoulder from './shoulder.js';
import shoulderarmor from './shoulderarmor.js';
import collar from './collar.js';
import chestdeco from './chestdeco.js';
import powerpipe from './powerpipe.js';
import vw from './vw.js';
import f1, { sample as f1sample } from './f1.js';   // 取り込んだ部品（組 f1。tools/partimport.mjs が書く）
export const UPPER = [chest, back, abdomen, flank, shoulder, shoulderarmor, collar, chestdeco, powerpipe, vw, f1].flat();
export const upperById = Object.fromEntries(UPPER.map(p => [p.id, p]));

export const CHEST_AT = [0, 2.1, 0], SHOULDER_AT = [0.45, 2.5, 0];
const PAIR_CAT = new Set(['肩関節', '肩アーマー', '肩の動力パイプ']);
/** 部品を置く決まった場所。pair は左右の対（+x 側に置き、反対側は x の拡大 −1 で置く） */
export function placementOfUpper(def) {
  return PAIR_CAT.has(def.cat) ? { mov: SHOULDER_AT.slice(), pair: true } : { mov: CHEST_AT.slice(), pair: false };
}
/** 見本：中央の部品と、左右の対の部品の id。肩アーマーは armorScale 倍（肩関節の中心から大きくなる。殻は中空でシャフトごと大きくなる） */
const sample = (mid, sides, armorScale = 1) => [
  ...mid.filter(Boolean).map(part => ({ part, mov: CHEST_AT.slice() })),
  ...[1, -1].flatMap(s => sides.filter(Boolean).map(part => {
    // 大きくするときは殻の内の端（x −0.07）が同じ所に残るよう、外へ 0.07 (k − 1) ずらす（シャフトの根元は球の中のまま、2 倍でも 7 cm）
    const k = upperById[part].cat === '肩アーマー' ? armorScale : 1;
    return { part, mov: [s * (SHOULDER_AT[0] + 0.07 * (k - 1)), SHOULDER_AT[1], SHOULDER_AT[2]], scal: [s * k, k, k] };
  })),
];
/** 胴の 4 つ（胸・背中・腹・脇腹）の id */
const torso = (c = 'chest', b = 'back', a = 'abdomen', f = 'flank') => [c, b, a, f];
export const UPPER_SAMPLES = {
  標準: sample([...torso(), 'collar'], ['shoulderjoint', 'shoulderarmor']),
  '丸い胸と盾': sample([...torso('chestbarrel', 'backhump', 'abdomenband', 'flankbulge'), 'collarlow', 'chestpipe'], ['shoulderjointdrum', 'shoulderarmorshield']),
  '横の稜と箱形': sample([...torso('chestvee', 'back', 'abdomenvee', 'flankslats'), 'collarwide', 'chestventlong'], ['shoulderjoint', 'shoulderarmorbox']),
  '重ねた板と重ね板': sample([...torso('chestframe', 'backspine', 'abdomenbellows', 'flank'), 'collar'], ['shoulderjoint', 'shoulderarmorlayer']),
  '大きな張り出しととげ': sample([...torso('chestpigeon', 'backfins', 'abdomenplate', 'flankbig'), 'collarlow', 'chestpipethick'], ['shoulderjointdrum', 'shoulderarmorspike']),
  '差し色と大きな丸い肩': sample([...torso('chestcockpit', 'backhump', 'abdomen', 'flankbulge'), 'collarlow'], ['shoulderjoint', 'shoulderarmorbig']),
  '段付きの丸い肩': sample([...torso('chest', 'backblades', 'abdomenband', 'flankbig'), 'collar', 'chestpipe'], ['shoulderjointdrum', 'shoulderarmorstep']),
  'とても大きな丸い肩': sample([...torso(), 'collar'], ['shoulderjointdrum', 'shoulderarmorsphere'], 1.8),
  'とても大きな盾': sample([...torso('chestvee', 'backhump', 'abdomenvee', 'flankslats'), 'collarwide'], ['shoulderjoint', 'shoulderarmorshield'], 1.5),
  '角の排気口ととげ': sample([...torso('chestexhaust', 'backhump', 'abdomenbellows', 'flank'), 'collarlow', 'pipechestheadthick'], ['shoulderjoint', 'shoulderarmorspike', 'pipearmthick']),
  '通気口とハッチ': sample([...torso(), 'collar', 'chestvent', 'chesthatch'], ['shoulderjoint', 'shoulderarmorbox']),
  // 可変翼型：機体エディタ 1 の形式の機体から分けた部品（parts/upper/vw.js）。腹だけは標準の輪
  '可変翼型（コクピットとセンサーの肩）': sample([...torso('chestvw', 'backvw', 'abdomen', 'flankvw'), 'collarvw'], ['shoulderjoint', 'shoulderarmorvw']),
  // F1 型：取り込んだ機体の、その部分の組み方そのまま（parts/*/f1.js の sample。tools/partimport.mjs が書く）
  'F1 型': f1sample,
};
/** ランダムに組む：部位ごとに 1 つ（胴の 4 つは必ず、襟はたいてい付け、胸の飾りは 0〜2 個。肩アーマーはときどきとても大きく） */
export function randomUpper(rnd = Math.random) {
  const ids = cat => UPPER.filter(p => p.cat === cat).map(p => p.id);
  const pick = list => list[Math.floor(rnd() * list.length)];
  const deco = ids('胸の飾り').filter(() => rnd() < 0.3);
  // 動力パイプはランダムでは付けない（画面の「動力パイプをランダムに」で足す）
  if (deco.includes('chestvent') && deco.includes('chestventlong')) deco.splice(deco.indexOf('chestvent'), 1);
  // 4 回に 1 回くらいは、とても大きな肩アーマー（1.35〜2 倍）
  const big = rnd() < 0.25 ? 1.35 + 0.65 * rnd() : 1;
  return sample([pick(ids('胸')), pick(ids('背中')), pick(ids('腹')), pick(ids('脇腹')), rnd() < 0.85 ? pick(ids('襟')) : null, ...deco], [pick(ids('肩関節')), pick(ids('肩アーマー'))], Math.round(big * 100) / 100);
}
