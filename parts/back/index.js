// 背中（胴の骨 torso）の部品の目次：バックパックとその装備、翼とその装備、エフェクト（光）。翼とバックパックは同時に付けない。
// 置き場所：バックパックは胸の下端の中心、翼は背中の付け根（左右の対）。装備は、置いてあるバックパック・翼の「装備を付ける所」（mounts）。
// オーブ（ORB）は 1 基ずつ、ORB 収納ラック（翼）の空いている収納口（docks）へ入る。
// エフェクト（光だけの部品）は、バックパックにも翼にも足せる：光の輪は背中の真ん中の後ろ、光の帯は翼の付け根（無ければバックパックの横）、
// 光の刃は ORB 収納ラック（一列・扇）の後ろの縁。
import packs from './packs.js';
import gear from './gear.js';
import wings from './wings.js';
import wingear, { RACK_DROP } from './wingear.js';
import fx, { FX_CAT, FX_COLORS } from './fx.js';
import { rotOfFrame } from './kit.js';
import f1, { sample as f1sample } from './f1.js';   // 取り込んだ部品（組 f1。tools/partimport.mjs が書く）
export const BACK = [packs, gear, wings, wingear, fx, f1].flat();
export const backById = Object.fromEntries(BACK.map(p => [p.id, p]));
export { FX_CAT, FX_COLORS };

export const CHEST_AT = [0, 2.1, 0], WING_AT = [0.11, 2.5, -0.19], AURA_AT = [0, 2.5, -0.67], SPINE_AT = [0, 2.5, -0.27];
/** 同時に付けない 2 つの組：バックパックの組と、翼の組（エフェクトはどちらにも入らない） */
export const BACK_GROUP = { バックパック: 'pack', バックパックの装備: 'pack', 翼: 'wing', 翼の装備: 'wing' };
/** 左右の対で置く部品か */
export const isPairBack = def => def.cat === '翼' || ['side', 'top', 'hang', 'root', 'light', 'dock'].includes(def.slot);
const DEFAULT_PACK = 'backpack', DEFAULT_WING = 'wingblade';
/** オーブを置こうとして収納口のある翼が無いときに、先に置く翼 */
export const DEFAULT_RACK = 'wingrackrow';
const add = (a, b, s = [1, 1, 1]) => [a[0] + b[0] * s[0], a[1] + b[1] * s[1], a[2] + b[2] * s[2]];
const onPack = (pack, slot) => { const m = backById[pack.part].mounts ?? backById[DEFAULT_PACK].mounts; return add(pack.mov, m[slot] ?? m.back, pack.scal ?? [1, 1, 1]); };
const onWing = (wing, slot) => { const m = backById[wing.part].mounts; return add([Math.abs(wing.mov[0]), wing.mov[1], wing.mov[2]], m[slot] ?? m.root, (wing.scal ?? [1, 1, 1]).map(Math.abs)); };
/** 装備・エフェクトを付ける所（世界の座標、+x 側）：pack・wing は置いてあるバックパック・翼（無ければ null） */
function mountOf(def, pack, wing) {
  if (def.slot === 'center') return AURA_AT.slice();
  if (def.slot === 'spine') return SPINE_AT.slice();
  if (def.cat === 'バックパックの装備') return onPack(pack ?? { part: DEFAULT_PACK, mov: CHEST_AT }, def.slot);
  if (def.cat === FX_CAT && !wing && pack) return onPack(pack, 'side');
  return onWing(wing ?? { part: DEFAULT_WING, mov: WING_AT }, def.slot);
}
const r4 = v => Math.round(v * 1e4) / 1e4, r1 = v => Math.round(v * 10) / 10;
const findBase = (items, cat) => items.find(it => backById[it.part]?.cat === cat && (it.mov?.[0] ?? 0) >= 0) ?? null;
/** 収納口に入る部品か：オーブ（slot 'dock'）と、挿せるタンク（dockable） */
export const canDock = def => !!def && (def.slot === 'dock' || !!def.dockable);
const isOrb = it => canDock(backById[it.part]);
/** その部品を、今の翼の収納口へ入れるか：オーブはいつも、挿せるタンクは収納口のある翼（ORB 収納ラック）のとき */
export const usesDock = (def, items) => def.slot === 'dock' || (!!def.dockable && !!backById[findBase(items, '翼')?.part]?.docks?.length);
/**
 * 収納口 k 番にオーブ 1 基を入れた左右の対（置いた部品 2 個）。wing は置いてある +x 側の翼（位置と拡大だけ見る。回転は見ない）。
 * 砲身（部品の −y）を収納口の向きへ向ける。反対側は鏡像（位置の x と、回転の y・z の符号を返す）。lower は 4 cm ずつ下へずらす段数
 */
function dockPair(orbId, wing, k, lower = 0) {
  const docks = backById[wing.part].docks, dk = docks[k % docks.length], s = (wing.scal ?? [1, 1, 1]).map(Math.abs);
  const m = add([Math.abs(wing.mov[0]), wing.mov[1] - 0.04 * lower, wing.mov[2]], dk.at, s).map(r4), rot = rotOfFrame(dk.d, dk.n).map(r1);
  return [{ part: orbId, mov: m, rot, scal: [1, 1, 1] }, { part: orbId, mov: [-m[0], m[1], m[2]], rot: [rot[0], -rot[1], -rot[2]], scal: [-1, 1, 1] }];
}
/** 収納口が空いているか：その位置（1 cm 以内）にオーブが無い */
const freeDock = (items, wing, k) => { const p = dockPair('wgorb', wing, k)[0].mov; return !items.some(it => isOrb(it) && Math.hypot(it.mov[0] - p[0], it.mov[1] - p[1], it.mov[2] - p[2]) < 0.01); };
/**
 * オーブ 1 基（左右の対）を、置いてある ORB 収納ラックの次の空いている収納口へ入れる。置く部品の並びを返す。
 * 収納口のある翼が無ければ null。全部ふさがっていれば、最初の収納口から 4 cm ずつ下へずらして重ねる
 */
export function nextDockItems(items, orbId) {
  const wing = findBase(items, '翼'), docks = wing && backById[wing.part].docks;
  if (!docks?.length) return null;
  for (let k = 0; k < docks.length; k++) if (freeDock(items, wing, k)) return dockPair(orbId, wing, k);
  const n = items.filter(it => isOrb(it) && it.mov[0] >= 0).length;
  return dockPair(orbId, wing, n, Math.floor(n / docks.length));
}
/** 部品を置く決まった場所。items は今置いてある部品（装備・エフェクトは、その中のバックパック・翼に付ける）。based：置いてある部品の位置から決めたか */
export function placementOfBack(def, items = []) {
  if (def.cat === 'バックパック') return { mov: CHEST_AT.slice(), pair: false };
  if (def.cat === '翼') return { mov: WING_AT.slice(), pair: true };
  const pack = findBase(items, 'バックパック'), wing = findBase(items, '翼');
  if (usesDock(def, items)) { const it = nextDockItems(items, def.id); return { mov: it ? it[0].mov.slice() : WING_AT.slice(), pair: true, based: !!it }; }
  const mov = mountOf(def, pack, wing);
  // ラック（ひれ付きの吊り柱）を置いてあれば、吊り柱の無い装備はその下の端に付く
  if (def.bare && items.some(it => it.part === 'wgrack')) mov[1] -= RACK_DROP;
  return { mov, pair: isPairBack(def), ...(def.hangRot ? { rot: def.hangRot.slice() } : {}), based: !['center', 'spine'].includes(def.slot) && !!(def.cat === 'バックパックの装備' ? pack : def.cat === '翼の装備' ? wing : wing ?? pack) };
}
const one = (part, mov) => [{ part, mov: mov.map(r4) }];
const two = (part, mov) => { const r = backById[part]?.hangRot; return [1, -1].map(s => ({ part, mov: [r4(s * mov[0]), r4(mov[1]), r4(mov[2])], ...(r ? { rot: [r[0], s * r[1], s * r[2]] } : {}), scal: [s, 1, 1] })); };
const put = (id, pack, wing) => { const def = backById[id], m = mountOf(def, pack, wing); return isPairBack(def) ? two(id, m) : one(id, m); };
/** バックパックと装備の 1 式：side・top は左右の対（[左, 右] で別々にもできる。null は付けない）。fx はエフェクトの id の並び */
export function packSet(pack, { side = null, top = null, back = null, fx: fxIds = [] } = {}) {
  const base = { part: pack, mov: CHEST_AT, scal: [1, 1, 1] }, out = one(pack, CHEST_AT);
  for (const g of [side, top]) {
    if (!g) continue;
    const [l, r] = Array.isArray(g) ? g : [g, g];
    if (l) out.push(put(l, base, null)[0]);
    if (r) out.push(put(r, base, null)[1]);
  }
  if (back) out.push(...put(back, base, null));
  for (const f of fxIds) out.push(...put(f, base, null));
  return out;
}
/**
 * 翼と装備・エフェクトの 1 式。ids は装備・エフェクトの id の並び。オーブと挿せるタンクは、収納口のある翼なら空いている収納口へ順に入れる
 * （[id, 数] と書くとその数だけ。数を書かなければ残りぜんぶ）
 */
export function wingSet(wing, ids = []) {
  const base = { part: wing, mov: WING_AT, scal: [1, 1, 1] }, docks = backById[wing].docks ?? [];
  const racked = ids.includes('wgrack'), out = two(wing, WING_AT);
  let k = 0;   // 次に入れる収納口
  for (const e of ids) {
    const [g, n] = Array.isArray(e) ? e : [e, docks.length];
    if (docks.length && canDock(backById[g])) { for (let i = 0; i < n && k < docks.length; i++, k++) out.push(...dockPair(g, base, k)); continue; }
    if (backById[g].slot === 'dock') continue;
    out.push(...put(g, null, base).map(it => (racked && backById[g].bare ? { ...it, mov: [it.mov[0], r4(it.mov[1] - RACK_DROP), it.mov[2]] } : it)));
  }
  return out;
}
export const BACK_SAMPLES = {
  'タンク 2 本と円錐エンジン': packSet('backpack', { side: 'geartank', back: 'gearengine' }),
  'V 字の推進器と水平翼': packSet('backpackvee', { side: 'gearwing', top: 'gearfin' }),
  '炉とウィンチとコンテナ': packSet('backpackdrum', { side: ['gearcontainer', 'gearrack'], back: 'gearwinch' }),
  '大型と太いタンク': packSet('backpackheavy', { side: 'geartankfat', back: 'gearvernier3' }),
  '発生器のエンジンと光の輪（青）': packSet('backpackvee', { back: 'gearcore', fx: ['fxring_blue'] }),
  '放射の翼と光の輪（オレンジ）': wingSet('wingradial', ['wgcore', 'fxring_orange']),
  '放射の翼と光の輪（緑）': wingSet('wingradial', ['fxring_green']),
  '刃の翼と遠隔砲台': wingSet('wingblade', ['wgfinpod']),
  '戦闘機の翼とタンク': wingSet('wingjet', ['wgtank']),
  '戦闘機の翼とラックに吊ったタンク': wingSet('wingjet', ['wgrack', 'wgtank']),
  '戦闘機の翼と斜め下のタンク': wingSet('wingjet', ['wgtankdiag']),
  'ひれの翼と垂直のタンク': wingSet('wingplate', ['wgtankvert']),
  '大きなバインダー': wingSet('wingbinder'),
  '羽根の翼と光の帯（オレンジ）': wingSet('wingfeather', ['fxribbon_orange']),
  '骨組みの翼': wingSet('wingbat'),
  'ORB 収納ラック（一列・扇）とオーブ（中）': wingSet('wingrackfan', ['wgorb']),
  'ORB 収納ラック（一列・平行）とオーブ（大）': wingSet('wingrackrow', ['wgorbl']),
  'ORB 収納ラック（2・2・1）とオーブ（中）': wingSet('wingrack221', ['wgorb']),
  'ORB 収納ラック（2・2・1）にオーブ 4 基とタンク 1 本': wingSet('wingrack221', [['wgorb', 4], 'wgtankvert']),
  'ORB 収納ラック（上向き 3・下向き 2）とオーブ（中）': wingSet('wingrackud', ['wgorb']),
  'ORB 収納ラック（上下 2 段）とオーブ（小）': wingSet('wingracktwo', ['wgorbs']),
  'ORB 収納ラック（一列・扇）と光の刃（青）': wingSet('wingrackfan', ['fxblade_blue']),
  '透ける板の羽': wingSet('winginsect'),
  // F1 型：取り込んだ機体の、その部分の組み方そのまま（f1.js の sample。tools/partimport.mjs が書く）
  'F1 型': f1sample,
};
/**
 * ランダムに組む：半分はバックパック（横・上・後ろに装備。横はたいてい左右同じ、ときどき左右で違う・片側だけ）、半分は翼（装備とエフェクト）。
 * エフェクトの色は 1 式で 1 つ（オレンジ・緑・青のどれか）。光の輪は放射の翼か発生器のエンジンと一緒に出す。
 * ORB 収納ラックには、オーブ（大きさは 1 式で 1 つ）をたいてい全部の収納口に、ときどき途中まで入れる。一列・扇にはときどき代わりに光の刃。
 * which：'pack' か 'wing' を渡すとその組に決める
 */
export function randomBack(rnd = Math.random, which = null) {
  const of = cat => BACK.filter(p => p.cat === cat), pick = list => list[Math.floor(rnd() * list.length)];
  const col = pick(Object.keys(FX_COLORS));
  if ((which ?? (rnd() < 0.5 ? 'pack' : 'wing')) === 'pack') {
    const gears = of('バックパックの装備'), bySlot = s => gears.filter(g => g.slot === s).map(g => g.id);
    const a = pick(bySlot('side')), r = rnd();
    const side = rnd() < 0.85 ? (r < 0.65 ? a : r < 0.88 ? [a, pick(bySlot('side'))] : [a, null]) : null;
    const back = rnd() < 0.6 ? pick(bySlot('back')) : null;
    return packSet(pick(of('バックパック')).id, { side, top: rnd() < 0.4 ? pick(bySlot('top')) : null, back, fx: back === 'gearcore' && rnd() < 0.7 ? [`fxring_${col}`] : [] });
  }
  const wing = pick(of('翼')), ids = [];
  if (wing.mounts.hang && rnd() < 0.6) { const g = pick(of('翼の装備').filter(x => x.slot === 'hang' && x.id !== 'wgrack')); if (g.bare && rnd() < 0.5) ids.push('wgrack'); ids.push(g.id); }   // タンクは半分はラックに吊る
  if (wing.docks) {
    if (wing.id === 'wingrackfan' && rnd() < 0.2) ids.push(`fxblade_${col}`);
    else if (rnd() < 0.92) {
      // オーブ（大きさは 1 つ）を全部の収納口に。ときどき途中まで、ときどき残りにタンクを挿す
      const r = rnd(), n = r < 0.6 ? wing.docks.length : 1 + Math.floor(rnd() * wing.docks.length);
      ids.push([pick(of('翼の装備').filter(g => g.slot === 'dock')).id, n]);
      if (n < wing.docks.length && rnd() < 0.6) ids.push('wgtankvert');
    }
  }
  if (wing.id === 'wingradial' ? rnd() < 0.85 : rnd() < 0.2) { if (wing.id !== 'wingradial' || rnd() < 0.5) ids.push('wgcore'); ids.push(`fxring_${col}`); }
  if (rnd() < 0.25) ids.push(`fxribbon_${col}`);
  return wingSet(wing.id, ids);
}
