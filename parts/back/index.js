// 背中（胴の骨 torso）の部品の目次：バックパックとその装備、翼とその装備、エフェクト（光）。翼とバックパックは同時に付けない。
// 置き場所：バックパックは胸の下端の中心、翼は背中の付け根（左右の対）。装備は、置いてあるバックパック・翼の「装備を付ける所」（mounts）。
// エフェクト（光だけの部品）は、バックパックにも翼にも足せる：光の輪は背中の真ん中の後ろ、光の帯は翼の付け根（無ければバックパックの横）、
// 光の刃は発生器の翼。
import packs from './packs.js';
import gear from './gear.js';
import wings from './wings.js';
import wingear, { RACK_DROP } from './wingear.js';
import fx, { FX_CAT, FX_COLORS } from './fx.js';
export const BACK = [packs, gear, wings, wingear, fx].flat();
export const backById = Object.fromEntries(BACK.map(p => [p.id, p]));
export { FX_CAT, FX_COLORS };

export const CHEST_AT = [0, 2.1, 0], WING_AT = [0.11, 2.5, -0.19], AURA_AT = [0, 2.5, -0.67];
/** 同時に付けない 2 つの組：バックパックの組と、翼の組（エフェクトはどちらにも入らない） */
export const BACK_GROUP = { バックパック: 'pack', バックパックの装備: 'pack', 翼: 'wing', 翼の装備: 'wing' };
/** 左右の対で置く部品か */
export const isPairBack = def => def.cat === '翼' || ['side', 'top', 'hang', 'root', 'light'].includes(def.slot);
const DEFAULT_PACK = 'backpack', DEFAULT_WING = 'wingblade';
const add = (a, b, s = [1, 1, 1]) => [a[0] + b[0] * s[0], a[1] + b[1] * s[1], a[2] + b[2] * s[2]];
const onPack = (pack, slot) => { const m = backById[pack.part].mounts ?? backById[DEFAULT_PACK].mounts; return add(pack.mov, m[slot] ?? m.back, pack.scal ?? [1, 1, 1]); };
const onWing = (wing, slot) => { const m = backById[wing.part].mounts; return add([Math.abs(wing.mov[0]), wing.mov[1], wing.mov[2]], m[slot] ?? m.root, (wing.scal ?? [1, 1, 1]).map(Math.abs)); };
/** 装備・エフェクトを付ける所（世界の座標、+x 側）：pack・wing は置いてあるバックパック・翼（無ければ null） */
function mountOf(def, pack, wing) {
  if (def.slot === 'center') return AURA_AT.slice();
  if (def.cat === 'バックパックの装備') return onPack(pack ?? { part: DEFAULT_PACK, mov: CHEST_AT }, def.slot);
  if (def.cat === FX_CAT && !wing && pack) return onPack(pack, 'side');
  return onWing(wing ?? { part: DEFAULT_WING, mov: WING_AT }, def.slot);
}
/** 部品を置く決まった場所。items は今置いてある部品（装備・エフェクトは、その中のバックパック・翼に付ける）。based：置いてある部品の位置から決めたか */
export function placementOfBack(def, items = []) {
  if (def.cat === 'バックパック') return { mov: CHEST_AT.slice(), pair: false };
  if (def.cat === '翼') return { mov: WING_AT.slice(), pair: true };
  const find = cat => items.find(it => backById[it.part]?.cat === cat && (it.mov?.[0] ?? 0) >= 0) ?? null;
  const pack = find('バックパック'), wing = find('翼');
  const mov = mountOf(def, pack, wing);
  // ラック（ひれ付きの吊り柱）を置いてあれば、吊り柱の無い装備はその下の端に付く
  if (def.bare && items.some(it => it.part === 'wgrack')) mov[1] -= RACK_DROP;
  return { mov, pair: isPairBack(def), based: def.slot !== 'center' && !!(def.cat === 'バックパックの装備' ? pack : def.cat === '翼の装備' ? wing : wing ?? pack) };
}
const r4 = v => Math.round(v * 1e4) / 1e4;
const one = (part, mov) => [{ part, mov: mov.map(r4) }];
const two = (part, mov) => [1, -1].map(s => ({ part, mov: [r4(s * mov[0]), r4(mov[1]), r4(mov[2])], scal: [s, 1, 1] }));
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
/** 翼と装備・エフェクトの 1 式。ids は装備・エフェクトの id の並び */
export function wingSet(wing, ids = []) {
  const base = { part: wing, mov: WING_AT, scal: [1, 1, 1] };
  const racked = ids.includes('wgrack');
  return [...two(wing, WING_AT), ...ids.flatMap(g => put(g, null, base).map(it => (racked && backById[g].bare ? { ...it, mov: [it.mov[0], r4(it.mov[1] - RACK_DROP), it.mov[2]] } : it)))];
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
  '大きなバインダー': wingSet('wingbinder'),
  '羽根の翼と光の帯（オレンジ）': wingSet('wingfeather', ['fxribbon_orange']),
  '骨組みの翼': wingSet('wingbat'),
  '発生器の翼と光の刃（青）': wingSet('winglight', ['fxblade_blue']),
  '発生器の翼と光の刃・光の帯（緑）': wingSet('winglight', ['fxblade_green', 'fxribbon_green']),
  '発生器の翼とロングレンジバレル': wingSet('winglight', ['wglrb']),
  '透ける板の羽': wingSet('winginsect'),
};
/**
 * ランダムに組む：半分はバックパック（横・上・後ろに装備。横はたいてい左右同じ、ときどき左右で違う・片側だけ）、半分は翼（装備とエフェクト）。
 * エフェクトの色は 1 式で 1 つ（オレンジ・緑・青のどれか）。光には出どころを付ける：光の輪は放射の翼か発生器のエンジン、光の刃は発生器の翼。
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
  if (wing.kind === 'light' && rnd() < 0.9) ids.push(rnd() < 0.5 ? `fxblade_${col}` : 'wglrb');   // 光の刃か、同じ並びの遠隔砲台（長い砲身）
  if (wing.id === 'wingradial' ? rnd() < 0.85 : rnd() < 0.2) { if (wing.id !== 'wingradial' || rnd() < 0.5) ids.push('wgcore'); ids.push(`fxring_${col}`); }
  if (rnd() < 0.25) ids.push(`fxribbon_${col}`);
  return wingSet(wing.id, ids);
}
