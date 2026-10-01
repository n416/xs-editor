// 背中（胴の骨 torso）の部品の目次：バックパックとその装備、翼とその装備。翼とバックパックは同時に付けない。
// 置き場所：バックパックは胸の下端の中心、翼は背中の付け根（左右の対）。装備は、置いてあるバックパック・翼の「装備を付ける所」（mounts）。
import packs from './packs.js';
import gear from './gear.js';
import wings from './wings.js';
import wingear from './wingear.js';
export const BACK = [packs, gear, wings, wingear].flat();
export const backById = Object.fromEntries(BACK.map(p => [p.id, p]));

export const CHEST_AT = [0, 2.1, 0], WING_AT = [0.11, 2.5, -0.19], AURA_AT = [0, 2.52, -0.5];
/** 同時に付けない 2 つの組：バックパックの組と、翼の組 */
export const BACK_GROUP = { バックパック: 'pack', バックパックの装備: 'pack', 翼: 'wing', 翼の装備: 'wing' };
/** 左右の対で置く部品か */
export const isPairBack = def => def.cat === '翼' || ['side', 'top', 'hang', 'root'].includes(def.slot);
const DEFAULT_PACK = 'backpack', DEFAULT_WING = 'wingblade';
const add = (a, b, s = [1, 1, 1]) => [a[0] + b[0] * s[0], a[1] + b[1] * s[1], a[2] + b[2] * s[2]];
/** 装備を付ける所（世界の座標、+x 側）：base は置いてあるバックパック・翼（無ければ標準の位置の標準の部品） */
function mountOf(def, base) {
  if (def.cat === 'バックパックの装備') {
    const pack = base ?? { part: DEFAULT_PACK, mov: CHEST_AT, scal: [1, 1, 1] }, m = backById[pack.part].mounts ?? backById[DEFAULT_PACK].mounts;
    return add(pack.mov, m[def.slot] ?? m.back, pack.scal ?? [1, 1, 1]);
  }
  if (def.slot === 'center') return AURA_AT.slice();
  const wing = base ?? { part: DEFAULT_WING, mov: WING_AT, scal: [1, 1, 1] }, m = backById[wing.part].mounts, s = (wing.scal ?? [1, 1, 1]).map(Math.abs);
  return add([Math.abs(wing.mov[0]), wing.mov[1], wing.mov[2]], m[def.slot] ?? m.root, s);
}
/** 部品を置く決まった場所。items は今置いてある部品（装備は、その中のバックパック・翼に付ける） */
export function placementOfBack(def, items = []) {
  if (def.cat === 'バックパック') return { mov: CHEST_AT.slice(), pair: false };
  if (def.cat === '翼') return { mov: WING_AT.slice(), pair: true };
  const baseCat = def.cat === 'バックパックの装備' ? 'バックパック' : '翼';
  const base = items.find(it => backById[it.part]?.cat === baseCat && (it.mov?.[0] ?? 0) >= 0);
  return { mov: mountOf(def, base), pair: isPairBack(def), based: !!base };
}
const r4 = v => Math.round(v * 1e4) / 1e4;
const one = (part, mov) => [{ part, mov: mov.map(r4) }];
const two = (part, mov) => [1, -1].map(s => ({ part, mov: [r4(s * mov[0]), r4(mov[1]), r4(mov[2])], scal: [s, 1, 1] }));
/** バックパックと装備の 1 式：side・top は左右の対（[左, 右] で別々にもできる。null は付けない） */
export function packSet(pack, { side = null, top = null, back = null } = {}) {
  const base = { part: pack, mov: CHEST_AT, scal: [1, 1, 1] }, out = one(pack, CHEST_AT);
  for (const g of [side, top]) {
    if (!g) continue;
    const [l, r] = Array.isArray(g) ? g : [g, g];
    if (l) out.push(two(l, mountOf(backById[l], base))[0]);
    if (r) out.push(two(r, mountOf(backById[r], base))[1]);
  }
  if (back) out.push(...one(back, mountOf(backById[back], base)));
  return out;
}
/** 翼と装備の 1 式。gear は装備の id の並び */
export function wingSet(wing, gear = []) {
  const base = { part: wing, mov: WING_AT, scal: [1, 1, 1] }, out = two(wing, WING_AT);
  for (const g of gear) { const def = backById[g], m = mountOf(def, base); out.push(...(isPairBack(def) ? two(g, m) : one(g, m))); }
  return out;
}
export const BACK_SAMPLES = {
  'タンク 2 本と円錐エンジン': packSet('backpack', { side: 'geartank', back: 'gearengine' }),
  'V 字の推進器と水平翼': packSet('backpackvee', { side: 'gearwing', top: 'gearfin' }),
  '炉とウィンチとコンテナ': packSet('backpackdrum', { side: ['gearcontainer', 'gearrack'], back: 'gearwinch' }),
  '大型と太いタンク': packSet('backpackheavy', { side: 'geartankfat', back: 'gearvernier3' }),
  '刃の翼と遠隔砲台': wingSet('wingblade', ['wgfinpod']),
  '戦闘機の翼とタンク': wingSet('wingjet', ['wgtank']),
  '大きなバインダー': wingSet('wingbinder'),
  '羽根の翼とオーラ': wingSet('wingfeather', ['wgaura']),
  '骨組みの翼': wingSet('wingbat'),
  '光の翼とリボン': wingSet('winglight', ['wgribbon']),
  '透ける板の羽とオーラとリボン': wingSet('winginsect', ['wgaura', 'wgribbon']),
};
/** 装備が付けられる翼か（forKind のある装備は、その種類の翼だけ。吊り下げる装備は、吊り下げる所のある翼だけ） */
const fits = (g, wing) => (!g.forKind || g.forKind.includes(wing.kind)) && (g.slot !== 'hang' || !!wing.mounts.hang);
/**
 * ランダムに組む：半分はバックパック（横・上・後ろに装備。横はたいてい左右同じ、ときどき左右で違う・片側だけ）、半分は翼（装備 0〜2 個）。
 * which：'pack' か 'wing' を渡すとその組に決める
 */
export function randomBack(rnd = Math.random, which = null) {
  const of = cat => BACK.filter(p => p.cat === cat), pick = list => list[Math.floor(rnd() * list.length)];
  if ((which ?? (rnd() < 0.5 ? 'pack' : 'wing')) === 'pack') {
    const gears = of('バックパックの装備'), bySlot = s => gears.filter(g => g.slot === s).map(g => g.id);
    const a = pick(bySlot('side')), r = rnd();
    const side = rnd() < 0.85 ? (r < 0.65 ? a : r < 0.88 ? [a, pick(bySlot('side'))] : [a, null]) : null;
    return packSet(pick(of('バックパック')).id, { side, top: rnd() < 0.4 ? pick(bySlot('top')) : null, back: rnd() < 0.6 ? pick(bySlot('back')) : null });
  }
  const wing = pick(of('翼')), gears = of('翼の装備').filter(g => fits(g, wing)), chosen = [];
  for (const slot of ['hang', 'center', 'root']) { const list = gears.filter(g => g.slot === slot); if (list.length && rnd() < (slot === 'hang' ? 0.6 : 0.35)) chosen.push(pick(list).id); }
  return wingSet(wing.id, chosen);
}
