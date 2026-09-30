// 頭ジェネレーター（部品エディタ用）v2：頭蓋＋芯＋積み上げ
// 13 のスロット（トサカ／頭蓋（クラウン）／装飾 右・左・後ろ・前／ベース形状・カメラ・マスク・マスク飾り・頬当て／首前・首後ろ）を
// 「スロット → 種類 → 数値」の仕様（spec）で表し、エディタの普通の部品の並びに組み立てる。
//
// 作りの要点（tools/ref の描き方の要点に合わせた）
//  - ヘルメット（顔に穴を開けた殻）は作らない。上に頭蓋（卵型か面構成のクラウン）が載り、その下に暗い芯があり、
//    まゆの棚・頬当て・鼻筋・マスク・あごが芯の上に積み上がって凸と凹を作る。目はまゆの影のくぼみに入る。
//  - 装甲の部品は「面で作る部品」（kind: 'hull'、平面の集まりで囲った凸多面体、hull.js）。押し出し＋3 面図では作れない
//    斜めの面（頬のすぼまり、額の前傾、卵型）が作れ、辺の面取りは面ごとに幅を変える（部品の厚みを一様にしない）。
//  - 縦線を平行にしない：頬当ての内側と外側の縁はあごへ向かってすぼまり、こめかみで頭蓋より外へ張り出す。
//  - 直線構成と曲線構成：頭蓋の種類と「丸み」で、面取りの段数（1 = 折る、2 以上 = 丸める）と面の数を変える。
//  - スリット・ダクト・目のくぼみは本当に彫る（削り部品）。
//  - 座標：頭の中心を原点、+Z が正面、+X が機体の左、単位はエディタの単位（1 = 6 m）。最後に place を掛ける。
//  - 乱数は種から決まり、組み立て中には使わない（同じ spec からは必ず同じ部品）。
// 依存：hull.js（平面の計算だけ）。three.js も DOM も要らない。

import { planeAt } from './hull.js';

export const VERSION = 2;
const D = Math.PI / 180;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const clamp01 = v => clamp(+v || 0, 0, 1);
const lerp = (a, b, t) => a + (b - a) * t;
const r4 = v => Math.round(v * 1e4) / 1e4;
const r4v = a => a.map(r4);

// ---------------- 乱数（mulberry32） ----------------
export function makeRng(seed) {
  let s = (seed >>> 0) || 0x9e3779b9;
  const next = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const rng = next;
  rng.range = (a, b) => a + (b - a) * next();
  rng.pick = arr => arr[Math.floor(next() * arr.length)];
  rng.chance = p => next() < p;
  rng.weighted = pairs => { let sum = 0; for (const [, w] of pairs) sum += w; let x = next() * sum; for (const [v, w] of pairs) { x -= w; if (x <= 0) return v; } return pairs[pairs.length - 1][0]; };
  rng.int = (a, b) => a + Math.floor(next() * (b - a + 1));
  return rng;
}
export const seedFromText = text => { let h = 2166136261; for (const ch of String(text)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };

// ---------------- 2D / 3D の道具 ----------------
export const rect = (w, h, cx = 0, cy = 0) => [[cx - w / 2, cy - h / 2], [cx + w / 2, cy - h / 2], [cx + w / 2, cy + h / 2], [cx - w / 2, cy + h / 2]];
/** 筒（片側が開いた穴）：外径 r・内径 ri・長さ l・底の厚み t。+h 側が開く。本物のくぼみになる */
export const cup = (r, ri, l, t) => [[ri, -l / 2 + t], [ri, l / 2], [r, l / 2], [r, -l / 2]];
// 平面：n·p ≤ d を残す（n は外向き）。b は面取り幅（省略時は部品の bevel）
const P = planeAt;
const bv = b => b !== undefined ? [b] : [];
const XH = (x, b) => [1, 0, 0, x, ...bv(b)], XL = (x, b) => [-1, 0, 0, -x, ...bv(b)];   // x ≤ / x ≥
const YH = (y, b) => [0, 1, 0, y, ...bv(b)], YL = (y, b) => [0, -1, 0, -y, ...bv(b)];
const ZH = (z, b) => [0, 0, 1, z, ...bv(b)], ZL = (z, b) => [0, 0, -1, -z, ...bv(b)];
/** 平面を法線の向きに delta だけ動かす */
const shift = (pl, delta) => [pl[0], pl[1], pl[2], pl[3] + delta, ...(pl.length > 4 ? [pl[4]] : [])];
/** 左右対称の平面（x の符号を反転）*/
const mirrorPl = pl => [-pl[0], pl[1], pl[2], pl[3], ...(pl.length > 4 ? [pl[4]] : [])];
/** 平面とその鏡像の両方 */
const both = (...pls) => pls.flatMap(pl => [pl, mirrorPl(pl)]);

// ---------------- 部品の型 ----------------
// 値はエディタの既定値と同じ意味。glow は名前からの自動判定に任せず、必ず明示する。
const BASE = { kind: 'extrude', op: 'add', mirror: false, bevel: 0.004, bevelSegs: 1, corner: 0, cornerSegs: 1, taper: 1, tiltY: 0, ridge: 0,
  segments: 24, arrayCount: 1, arrayStep: [0, 0.15, 0], metal: 0.35, rough: 0.5, bone: 'head', team: false, glow: false, pivot: 'auto', pos: [0, 0, 0], rot: [0, 0, 0], scl: [1, 1, 1], side: null, top: null, planes: null, blockout: false };
/** 面で作る部品（hull）。planes は頭の座標で書く（pos は 0） */
const H = (name, planes, o = {}) => ({ ...BASE, name, kind: 'hull', planes, pts: [[0, 0], [1, 0], [1, 1]], depth: 0.1, ...o });
/** 正面から押し出し：pts は [x, y]、厚みは z */
const F = (name, pts, depth, pos, o = {}) => ({ ...BASE, name, pts, depth, pos, ...o });
/** 回転体：pts は右半分 [半径, 高さ]、軸はローカル Y */
const L = (name, pts, pos, o = {}) => ({ ...BASE, name, kind: 'lathe', pts, pos, segments: 20, ...o });
const CUT = { op: 'sub', bevel: 0, corner: 0, glow: false };
const AXIS_Z = [90 * D, 0, 0];      // 回転体の軸を前（+Z）へ（+h が前）
const AXIS_ZB = [-90 * D, 0, 0];    // 回転体の軸を後ろ（-Z）へ（+h が後ろ）
const MAT = { armor: { metal: 0.35, rough: 0.5 }, frame: { metal: 0.45, rough: 0.55 }, glow: { metal: 0, rough: 0.25 }, lens: { metal: 0.9, rough: 0.15 } };

// ---------------- 配色 ----------------
export const PALETTES = [
  { key: 'white-red', label: '白×赤', main: '#d6dae1', sub: '#2f4f8f', frame: '#3a3f47', accent: '#d8323a', glow: '#3cff8a' },
  { key: 'gray-orange', label: '灰×橙', main: '#8b929c', sub: '#5b626c', frame: '#33373d', accent: '#ea7a1f', glow: '#ff3b30' },
  { key: 'navy-yellow', label: '紺×黄', main: '#2d3e6b', sub: '#c9ced6', frame: '#2b2f36', accent: '#f0c419', glow: '#ff9f2a' },
  { key: 'olive-tan', label: '緑×茶', main: '#6b7a4e', sub: '#a59a7a', frame: '#35392f', accent: '#c2452e', glow: '#ffd23f' },
  { key: 'black-cyan', label: '黒×水', main: '#3b3f48', sub: '#6d7480', frame: '#22252b', accent: '#39c5e6', glow: '#39e6d2' },
  { key: 'white-blue', label: '白×青', main: '#e2e6ec', sub: '#7f8794', frame: '#3a3f47', accent: '#2f6fd0', glow: '#4cff6a' },
  { key: 'crimson', label: '深紅', main: '#8a2a34', sub: '#4a2a2e', frame: '#2e2a2c', accent: '#e8d9a0', glow: '#ffd23f' },
  { key: 'sand', label: '砂', main: '#c9b48a', sub: '#7d6d4f', frame: '#3d3830', accent: '#3d6b8f', glow: '#ff5a3c' },
];
const GLOWS = ['#3cff8a', '#ff3b30', '#ff2fa0', '#39e6d2', '#ffd23f', '#7fb2ff'];

// ---------------- スロットの定義 ----------------
const P01 = (key, label, def = 0.5) => ({ key, label, def });
const CH = (key, label, choices, def) => ({ key, label, choices, def: def ?? choices[0][0] });
const NONE = { key: 'none', label: 'なし' };
const COLOR_CH = (def = 'accent') => CH('color', '色', [['accent', '差し色'], ['main', '主装甲'], ['sub', '副装甲'], ['frame', 'フレーム']], def);

export const SLOTS = [
  { key: 'crest', label: 'トサカ', order: 1,
    types: [NONE, { key: 'vfin', label: 'V字アンテナ' }, { key: 'blade', label: '一枚刃' }, { key: 'mohawk', label: 'とさか（前後の稜）' }, { key: 'horn', label: '一本角' }, { key: 'twin', label: '2本アンテナ' }],
    params: [P01('len', '長さ'), P01('ang', '角度・開き'), P01('th', '太さ'), COLOR_CH('accent')] },
  { key: 'helmet', label: '頭蓋（クラウンとまゆ）', order: 0,
    types: [{ key: 'egg', label: '卵型（曲線構成）' }, { key: 'wedge', label: '峰のある面構成（直線構成）' }, { key: 'box', label: '角（平らな頭頂）' }, { key: 'low', label: '低い丸' }],
    params: [P01('w', '幅'), P01('h', '高さ'), P01('d', '奥行'), P01('rake', '額の前傾'), P01('openW', '顔の幅'), P01('openH', 'まゆの高さ'), P01('recess', '目元の奥行'),
      P01('brow', 'まゆの棚の張り出し'), P01('step', '頭頂の峰・段'), P01('sharp', '角の鋭さ'), CH('browShape', 'まゆの形', [['vee', 'V 字（中央が前）'], ['flat', 'まっすぐ'], ['arch', '弧（両端が下がる）']], 'vee')] },
  { key: 'decoR', label: '装飾右（こめかみ）', order: 3,
    types: [NONE, { key: 'ear', label: '耳センサー' }, { key: 'fin', label: '側面フィン' }, { key: 'rod', label: 'ロッドアンテナ' }, { key: 'pod', label: '側面ポッド' }, { key: 'horn', label: '横角' }, { key: 'vent', label: '側面ベント' }],
    params: [P01('size', '大きさ'), P01('ang', '角度'), P01('y', '高さ')] },
  { key: 'decoL', label: '装飾左（こめかみ）', order: 3,
    types: [NONE, { key: 'ear', label: '耳センサー' }, { key: 'fin', label: '側面フィン' }, { key: 'rod', label: 'ロッドアンテナ' }, { key: 'pod', label: '側面ポッド' }, { key: 'horn', label: '横角' }, { key: 'vent', label: '側面ベント' }],
    params: [P01('size', '大きさ'), P01('ang', '角度'), P01('y', '高さ')] },
  { key: 'decoB', label: '装飾後ろ（後頭・うなじ）', order: 4,
    types: [NONE, { key: 'duct', label: '後頭ダクト' }, { key: 'fin', label: '後頭フィン' }, { key: 'pod', label: '後頭センサー' }, { key: 'cables', label: 'ケーブル' }, { key: 'plate', label: '後頭プレート' }],
    params: [P01('size', '大きさ'), P01('y', '高さ')] },
  { key: 'decoF', label: '装飾前（額）', order: 2,
    types: [NONE, { key: 'vplate', label: '額の V' }, { key: 'plate', label: '額プレート' }, { key: 'gem', label: '額センサー（くぼみ）' }, { key: 'ridge', label: '中央の稜線' }, { key: 'peak', label: 'ひさし（まゆの上にもう一段）' }],
    params: [P01('size', '大きさ'), COLOR_CH('accent')] },
  { key: 'base', label: '芯（ベース形状）', order: 5,
    types: [{ key: 'flat', label: '平面' }, { key: 'wedge', label: '中央が尖る' }, { key: 'trap', label: 'あごがすぼまる' }, { key: 'round', label: '丸みのある面' }],
    params: [P01('depth', '目元の奥まり'), P01('bridge', '鼻筋の高さ')] },
  { key: 'camera', label: 'カメラ（目）', order: 6,
    types: [{ key: 'twin', label: 'ツインアイ（切れ込み）' }, { key: 'mono', label: 'モノアイ' }, { key: 'visor', label: 'バイザー' }, { key: 'goggle', label: 'ゴーグル' }, { key: 'cross', label: 'T 字バイザー' }, { key: 'triple', label: '3 眼' }],
    params: [P01('size', '大きさ'), P01('slant', 'つり上がり／位置'), P01('y', '高さ'), P01('cavity', 'くぼみの深さ'), CH('glow', '光の色', GLOWS.map((c, i) => [c, ['緑', '赤', '桃', '水', '黄', '青'][i]]))] },
  { key: 'mask', label: 'マスク（口元）', order: 7,
    types: [NONE, { key: 'prow', label: '船首形（凸）' }, { key: 'chin', label: '船首形＋あご（凸）' }, { key: 'split', label: '割れた口当て' }, { key: 'jaw', label: '角張ったあご' }, { key: 'grille', label: '格子面' }],
    params: [P01('w', '幅'), P01('h', '高さ'), P01('fwd', '前への出'), COLOR_CH('main')] },
  { key: 'maskDeco', label: 'マスク飾り', order: 8,
    types: [NONE, { key: 'hslit', label: '横スリット（頬側）' }, { key: 'vslit', label: '縦スリット' }, { key: 'rib', label: '中央の筋' }, { key: 'ducts', label: '小ダクト 2 つ' }, { key: 'gem', label: 'あごの宝石' }, { key: 'groove', label: '割り溝' }],
    params: [P01('n', '数'), P01('size', '大きさ')] },
  { key: 'maskL', label: '頬当て（左。右にも）', order: 9,
    types: [{ key: 'plate', label: '頬当て板（2 面）' }, { key: 'guard', label: '頬当て＋前に張り出す刃' }, { key: 'duct', label: '頬当て＋ダクト' }, { key: 'vent', label: '頬当て＋ベント' }, { key: 'sensor', label: '頬当て＋センサー' }, NONE],
    params: [P01('size', '張り出し'), P01('ang', '開き角'), CH('both', '右にも', [['yes', '右にも同じものを付ける'], ['no', '左だけ']], 'yes')] },
  { key: 'neckF', label: '首前', order: 10,
    types: [{ key: 'throat', label: 'のど当て' }, { key: 'collar', label: 'あご下の襟' }, { key: 'pipe', label: 'じゃばら' }, { key: 'plain', label: '芯だけ' }],
    params: [P01('size', '大きさ')] },
  { key: 'neckB', label: '首後ろ', order: 11,
    types: [{ key: 'guard', label: 'うなじガード' }, { key: 'block', label: '後ろの台' }, { key: 'cables', label: 'ケーブル 2 本' }, { key: 'plain', label: '芯だけ' }],
    params: [P01('size', '大きさ')] },
];
export const SLOT_BY_KEY = Object.fromEntries(SLOTS.map(s => [s.key, s]));

export const STYLE_AXES = [
  { key: 'sharp', label: '鋭さ', hint: '角を立て、面を前に傾け、刃を細くする' },
  { key: 'round', label: '丸み', hint: '角を丸め、輪郭を弧にする（曲線構成）' },
  { key: 'bulk', label: '重さ', hint: '頭蓋を大きく厚く、飾りを太くする' },
  { key: 'detail', label: '密度', hint: '溝・スリット・小部品を増やす' },
];

// ---------------- 仕様（spec）を乱数で作る ----------------
export function randomSpec(seed, opts = {}) {
  const rng = makeRng(seed);
  const st = { sharp: rng.range(0.35, 1), round: rng.range(0, 0.7), bulk: rng.range(0.2, 0.8), detail: rng.range(0.2, 0.9), ...(opts.style ?? {}) };
  const palette = opts.palette ?? rng.pick(PALETTES).key;
  const pal = PALETTES.find(p => p.key === palette) ?? PALETTES[0];
  const glow = opts.glow ?? (rng.chance(0.6) ? pal.glow : rng.pick(GLOWS));
  const spec = { format: 'xs-head-spec', version: VERSION, seed: seed >>> 0, style: st, palette, team: opts.team ?? rng.weighted([['accent', 5], ['main', 2], ['none', 2]]), slots: {} };
  const keep = opts.keep ?? {};
  for (const slot of SLOTS) {
    if (keep[slot.key]) { spec.slots[slot.key] = structuredClone(keep[slot.key]); continue; }
    spec.slots[slot.key] = randomSlot(slot, rng, st, glow);
  }
  if (!keep.decoL && !keep.decoR && rng.chance(0.7)) spec.slots.decoL = structuredClone(spec.slots.decoR);
  return spec;
}
export function randomSlot(slot, rng, st = { sharp: 0.7, round: 0.2, bulk: 0.5, detail: 0.5 }, glow = '#3cff8a') {
  const w = TYPE_WEIGHTS[slot.key] ?? (() => 1);
  const type = rng.weighted(slot.types.map(t => [t.key, Math.max(0.01, w(t.key, st))]));
  const p = {};
  for (const def of slot.params) {
    if (def.choices) p[def.key] = def.key === 'glow' ? glow : rng.weighted(def.choices.map(([k]) => [k, CHOICE_WEIGHTS[slot.key + '.' + def.key]?.(k, st) ?? 1]));
    else p[def.key] = r4(clamp01(PARAM_BIAS[slot.key + '.' + def.key]?.(rng, st) ?? rng.range(0.15, 0.85)));
  }
  return { type, p };
}
const TYPE_WEIGHTS = {
  helmet: (k, st) => ({ egg: 1 + 2 * st.round, wedge: 0.8 + 2.5 * st.sharp, box: 0.5 + st.bulk, low: 0.3 + st.round })[k],
  crest: (k, st) => ({ none: 0.7 + st.round, vfin: 1 + 3 * st.sharp, blade: 0.8 + st.sharp, mohawk: 0.5 + st.bulk, horn: 0.5 + st.sharp * 0.5, twin: 0.5 + st.detail })[k],
  decoR: (k, st) => ({ none: 0.8, ear: 1.2, fin: 0.6 + st.sharp, rod: 0.4 + st.detail, pod: 0.5 + st.bulk, horn: 0.3 + st.sharp * 0.6, vent: 0.5 + st.detail })[k],
  decoL: (k, st) => TYPE_WEIGHTS.decoR(k, st),
  decoB: (k, st) => ({ none: 1, duct: 0.8 + st.detail, fin: 0.5 + st.sharp, pod: 0.6, cables: 0.4 + st.detail, plate: 0.8 })[k],
  decoF: (k, st) => ({ none: 0.6, vplate: 1.2 + st.sharp, plate: 0.7, gem: 0.7 + st.detail, ridge: 0.6 + st.sharp, peak: 0.6 })[k],
  base: (k, st) => ({ flat: 1, wedge: 0.6 + 2 * st.sharp, trap: 1 + st.sharp, round: 0.3 + 2 * st.round })[k],
  camera: (k, st) => ({ twin: 1.2 + 2 * st.sharp, mono: 0.7 + st.round, visor: 0.9, goggle: 0.3 + st.round, cross: 0.4 + st.sharp * 0.5, triple: 0.3 + st.detail * 0.5 })[k],
  mask: (k, st) => ({ none: 0.15, prow: 1.2, chin: 1 + st.sharp, split: 0.6 + st.detail, jaw: 0.5 + st.bulk, grille: 0.4 + st.detail })[k],
  maskDeco: (k, st) => ({ none: 0.6, hslit: 1.3 + st.detail, vslit: 1 + st.sharp, rib: 0.7, ducts: 0.5 + st.detail, gem: 0.3, groove: 0.6 })[k],
  maskL: (k, st) => ({ plate: 2, guard: 0.8 + 1.5 * st.sharp, duct: 0.6 + st.detail, vent: 0.5 + st.detail, sensor: 0.4, none: 0.15 })[k],
  neckF: (k, st) => ({ throat: 1, collar: 0.8 + st.bulk, pipe: 0.5 + st.detail, plain: 0.5 })[k],
  neckB: (k, st) => ({ guard: 1, block: 0.8, cables: 0.5 + st.detail, plain: 0.5 })[k],
};
const CHOICE_WEIGHTS = {
  'helmet.browShape': (k, st) => ({ vee: 1 + 2 * st.sharp, flat: 0.8, arch: 0.5 + 1.5 * st.round })[k],
  'maskL.both': k => k === 'yes' ? 6 : 1,
  'mask.color': k => ({ accent: 1.5, main: 3, sub: 1, frame: 0.15 })[k],   // フレーム色は芯と溶けて口元が消えるので、ほとんど選ばない
  'crest.color': k => ({ accent: 3, main: 1.5, sub: 1, frame: 0.5 })[k],
  'decoF.color': k => ({ accent: 3, main: 1, sub: 1, frame: 0.5 })[k],
};
const PARAM_BIAS = {
  'helmet.rake': (rng, st) => rng.range(0.2, 0.5) + st.sharp * 0.5,
  'helmet.sharp': (rng, st) => rng.range(0, 0.3) + st.sharp * 0.7,
  'helmet.w': (rng, st) => rng.range(0.2, 0.6) + st.bulk * 0.3,
  'helmet.h': (rng, st) => rng.range(0.3, 0.7),
  'helmet.brow': (rng, st) => rng.range(0.3, 0.7) + st.sharp * 0.3,
  'helmet.step': (rng, st) => rng.range(0.2, 0.9),
  'camera.slant': (rng, st) => rng.range(0.3, 0.6) + st.sharp * 0.4,
  'camera.cavity': rng => rng.range(0.3, 0.8),
  'maskDeco.n': rng => rng.range(0.2, 0.9),
  'crest.th': (rng, st) => rng.range(0.15, 0.6) - st.sharp * 0.15 + st.bulk * 0.2,
  'maskL.size': (rng, st) => rng.range(0.2, 0.7) + st.sharp * 0.3,
  'mask.fwd': (rng, st) => rng.range(0.3, 0.8),
};

/** 欠けた値を埋めて、範囲に収める（人が編集した spec・古い版の spec を受け取るとき） */
export function normalizeSpec(spec) {
  const out = { format: 'xs-head-spec', version: VERSION, seed: (spec?.seed >>> 0) || 1, style: {}, palette: spec?.palette ?? 'white-red', team: spec?.team ?? 'accent', slots: {} };
  for (const ax of STYLE_AXES) out.style[ax.key] = clamp01(spec?.style?.[ax.key] ?? 0.5);
  if (!PALETTES.some(p => p.key === out.palette)) out.palette = 'white-red';
  if (!['accent', 'main', 'none'].includes(out.team)) out.team = 'accent';
  for (const slot of SLOTS) {
    const src = spec?.slots?.[slot.key] ?? {};
    const type = slot.types.some(t => t.key === src.type) ? src.type : slot.types[0].key;
    const p = {};
    for (const def of slot.params) {
      const v = src.p?.[def.key];
      if (def.choices) p[def.key] = (def.key === 'glow' ? /^#[0-9a-f]{6}$/i.test(v) : def.choices.some(([k]) => k === v)) ? v : def.def;
      else p[def.key] = typeof v === 'number' ? r4(clamp01(v)) : def.def;
    }
    out.slots[slot.key] = { type, p };
  }
  return out;
}

/** 決まった頭：参考図（tools/ref の参考例）に寄せた設定 */
export const PRESETS = {
  ref: { format: 'xs-head-spec', version: VERSION, seed: 1, style: { sharp: 0.6, round: 0.55, bulk: 0.4, detail: 0.5 }, palette: 'white-red', team: 'accent', slots: {
    helmet: { type: 'egg', p: { w: 0.5, h: 0.6, d: 0.5, rake: 0.4, openW: 0.5, openH: 0.5, recess: 0.5, brow: 0.5, step: 0.3, sharp: 0.5, browShape: 'vee' } },
    crest: { type: 'none', p: { len: 0.5, ang: 0.5, th: 0.4, color: 'accent' } },
    decoR: { type: 'none', p: { size: 0.4, ang: 0.5, y: 0.5 } }, decoL: { type: 'none', p: { size: 0.4, ang: 0.5, y: 0.5 } },
    decoB: { type: 'none', p: { size: 0.5, y: 0.5 } }, decoF: { type: 'vplate', p: { size: 0.45, color: 'accent' } },
    base: { type: 'flat', p: { depth: 0.5, bridge: 0.6 } },
    camera: { type: 'twin', p: { size: 0.5, slant: 0.55, y: 0.5, cavity: 0.5, glow: '#3cff8a' } },
    mask: { type: 'chin', p: { w: 0.55, h: 0.6, fwd: 0.6, color: 'main' } },
    maskDeco: { type: 'hslit', p: { n: 0.55, size: 0.5 } },
    maskL: { type: 'plate', p: { size: 0.5, ang: 0.5, both: 'yes' } },
    neckF: { type: 'throat', p: { size: 0.4 } }, neckB: { type: 'plain', p: { size: 0.5 } },
  } },
};

// ---------------- 組み立て ----------------
/**
 * spec から部品の一覧を作る。place: { pos: [x, y, z]（頭の中心を置く場所）, scale }。既定は標準体型の頭。
 * 戻り値: { parts, sheet, notes, spec }
 */
export function buildHead(specIn, place = {}) {
  const spec = normalizeSpec(specIn);
  const pal = PALETTES.find(p => p.key === spec.palette) ?? PALETTES[0];
  const C = { main: pal.main, sub: pal.sub, frame: pal.frame, accent: pal.accent, glow: spec.slots.camera.p.glow || pal.glow };
  const ctx = { spec, st: spec.style, C, team: spec.team, notes: [] };
  const A = ctx.A = makeSheet(ctx, spec.slots.helmet);
  const groups = [];   // 並び順 = 削りの効く順（削りは自分より前の部品だけを削る）
  groups.push({ slot: 'base', parts: buildCore(ctx, spec.slots.base) });          // 芯（暗い土台）とうなじ
  groups.push({ slot: 'helmet', parts: buildCranium(ctx, spec.slots.helmet) });   // 頭蓋、まゆの棚
  groups.push({ slot: 'camera', parts: buildCamera(ctx, spec.slots.camera) });    // 目のくぼみ（削り）と目
  groups.push({ slot: 'base', parts: buildNose(ctx, spec.slots.base) });          // 鼻筋
  groups.push({ slot: 'maskL', parts: buildCheeks(ctx, spec.slots.maskL) });      // 頬当て
  groups.push({ slot: 'mask', parts: buildMask(ctx, spec.slots.mask) });          // マスク、あご
  groups.push({ slot: 'maskDeco', parts: buildMaskDeco(ctx, spec.slots.maskDeco) });
  groups.push({ slot: 'decoF', parts: buildDecoF(ctx, spec.slots.decoF) });
  groups.push({ slot: 'crest', parts: buildCrest(ctx, spec.slots.crest) });
  groups.push({ slot: 'decoR', parts: buildDecoSide(ctx, spec.slots.decoR, -1) });
  groups.push({ slot: 'decoL', parts: buildDecoSide(ctx, spec.slots.decoL, +1) });
  groups.push({ slot: 'decoB', parts: buildDecoB(ctx, spec.slots.decoB) });
  groups.push({ slot: 'neckB', parts: buildNeckB(ctx, spec.slots.neckB) });
  groups.push({ slot: 'neckF', parts: buildNeckF(ctx, spec.slots.neckF) });
  const pos0 = place.pos ?? [0, 2.87, 0.01], s = place.scale ?? 1;
  const parts = [];
  for (const g of groups) for (const p of g.parts) {
    const q = { ...p };
    q.pos = r4v([pos0[0] + p.pos[0] * s, pos0[1] + p.pos[1] * s, pos0[2] + p.pos[2] * s]);
    q.scl = r4v([(p.scl?.[0] ?? 1) * s, (p.scl?.[1] ?? 1) * s, (p.scl?.[2] ?? 1) * s]);
    q.rot = r4v(p.rot ?? [0, 0, 0]);
    q.pts = p.pts.map(r4v);
    if (q.planes) q.planes = q.planes.map(pl => pl.map(v => Math.round(v * 1e5) / 1e5));
    if (q.side) q.side = q.side.map(r4v);
    if (q.top) q.top = q.top.map(r4v);
    if (q.arrayCount > 1) q.arrayStep = r4v(q.arrayStep.map(v => v * s));
    q.depth = r4(q.depth);
    if (!q.name.startsWith('頭・') && !q.name.startsWith('首')) q.name = '頭・' + q.name;
    q.gen = g.slot;
    parts.push(q);
  }
  return { parts, sheet: A, notes: ctx.notes, spec };
}
const colorOf = (ctx, key) => ctx.C[key] ?? ctx.C.accent;
const teamOf = (ctx, key) => ctx.team === key;

// ---- 設計図（sheet）：参考図（tools/ref 02a の参考例、全高 0.32）から読んだ比率を基準に、数値で少し動かす ----
function makeSheet(ctx, slot) {
  const { st } = ctx, p = slot.p, t = slot.type;
  const sharp = clamp01(0.5 * p.sharp + 0.5 * st.sharp);
  const round = (t === 'egg' || t === 'low') ? clamp01(0.5 + 0.5 * st.round) : clamp01(st.round * 0.6);
  const H = lerp(0.29, 0.34, p.h) * (1 + 0.04 * st.bulk);           // 全高（頭頂〜あごの先）
  const k = H / 0.32;                                                // 参考例からの倍率
  const wk = lerp(0.9, 1.12, p.w) * (1 + 0.06 * st.bulk);            // 幅の倍率
  const yTop = 0.53 * H, yChin = -0.47 * H;
  // 参考例（全高 0.32、頭頂 0.17）の実測：帯 0.018〜0.037、目の中心 0.002（高さ 0.019）、マスク -0.022〜-0.092、あごの先 -0.15、
  // 頭蓋の最大半幅 0.115、頬当ての張り出し 0.138、頬当ての角 (0.08, 0.016)(0.042, -0.131)(0.138, 0.036)(0.115, -0.112)。つまみは 0.5 でこの値
  const yBrow = k * lerp(0.008, 0.028, p.openH);                     // まゆの帯の下面（目の上）
  const bandH = k * lerp(0.014, 0.024, p.brow);                      // 帯の高さ
  const bandJut = k * lerp(0.003, 0.009, p.brow);                    // 帯が額の面より前へ出る分（段）
  const yEye = yBrow - k * lerp(0.011, 0.021, 1 - ctx.spec.slots.camera.p.y);
  const eyeH = k * lerp(0.014, 0.024, ctx.spec.slots.camera.p.size);
  const yMaskTop = yEye - k * 0.024, yMaskBot = k * -0.092, yJaw = k * -0.112, yJawIn = k * -0.131;
  const xCrown = k * 0.115 * wk;
  const xFlare = k * lerp(0.128, 0.148, 0.5 * p.sharp + 0.5 * st.bulk) * wk;   // 頬当ての上の外側（頭の最大幅）
  const hd = k * lerp(0.12, 0.135, p.d) * (1 + 0.06 * st.bulk);
  const lean = lerp(4, 16, p.rake) * D * (1 + 0.4 * sharp);          // 顔の面の前傾（上ほど前）
  const zBrow = k * 0.135, zChin = zBrow - Math.tan(lean) * (yBrow - yChin);
  const zFace = y => zChin + (zBrow - zChin) * clamp((y - yChin) / (yBrow - yChin), -0.3, 1.3);
  const faceN = [0, -Math.sin(lean), Math.cos(lean)];                 // 顔の面の外向き法線（前・やや下）
  const xInTop = k * 0.08 * lerp(0.9, 1.1, p.openW) * wk;             // 頬当ての内側の縁（帯のすぐ下、y = yBrow）
  const xInJaw = k * 0.042 * lerp(0.85, 1.15, p.openW) * wk;          // 同（下端の内側の角、y = yJawIn）
  const conv = (xInTop - xInJaw) / (yBrow - yJawIn);
  const xIn = y => Math.max(0.015, xInTop - conv * (yBrow - y));
  const xOutJaw = k * 0.115 * wk;                                     // 頬当ての下端の外側の角
  const convOut = (xFlare - xOutJaw) / ((yBrow + k * 0.018) - yJaw);  // 外側の縁：ほぼ垂直（0.155）
  const recess = k * lerp(0.024, 0.036, p.recess);                   // 芯の前面：顔の面から奥へ
  return { t, sharp, round, H, k, yTop, yChin, yBrow, bandH, bandJut, yEye, eyeH, yMaskTop, yMaskBot, yJaw, yJawIn, xCrown, xFlare, hd, zBrow, zChin, zBack: -hd * 0.93, lean, zFace, faceN,
    xInTop, xInJaw, conv, xIn, xOutJaw, convOut, recess, hw: xCrown, browH: bandH, browJut: bandJut,
    onFace: (y, s = 0) => [0, y + faceN[1] * s, zFace(y) + faceN[2] * s],   // 顔の面上（高さ y）から法線の向きに s
    neck: { y: yChin, z: -hd * 0.08, r: k * lerp(0.045, 0.055, st.bulk) },
    temple: { x: xCrown, y: yBrow + 0.02, z: 0 },
    crown: { y: yTop, zFront: zBrow * 0.3, zBack: -hd * 0.5 } };
}

// ---- 芯（暗いフレーム）とうなじ：顔の部品が載る土台 ----
function buildCore(ctx, slot) {
  const { A } = ctx, p = slot.p, t = slot.type;
  const parts = [];
  const zCore = -A.recess - lerp(0, 0.01, p.depth) * A.k;   // 芯の前面（顔の面からの奥まり）
  const xC = A.xInTop + 0.012;
  const planes = [XH(xC), XL(-xC), YH(A.yBrow + 0.012), YL(A.yChin + 0.008), ZL(-A.hd * 0.7), P(A.faceN, A.onFace(A.yEye, zCore)),
    ...both(P([1, -0.3, 0], [xC, A.yBrow - 0.07, 0])), P([0, -1, 0.5], [0, A.yChin + 0.008, A.zFace(A.yChin) * 0.3])];
  if (t === 'wedge') planes.push(...both(P([0.5, 0, 1], A.onFace(A.yEye, zCore + 0.004))));
  if (t === 'trap') planes.push(...both(P([1, -0.6, 0], [xC, A.yBrow - 0.05, 0])));
  parts.push(H('頭・芯', planes, { color: ctx.C.frame, ...MAT.frame, bevel: t === 'round' ? 0.008 : 0.001, bevelSegs: t === 'round' ? 2 : 1 }));
  parts.push(H('頭・うなじ', [XH(A.xCrown * 0.85), XL(-A.xCrown * 0.85), YH(0.0), YL(A.yChin + 0.02), ZL(A.zBack * 0.9), ZH(-A.hd * 0.15),
    P([0, -1, -0.6], [0, A.yChin + 0.02, A.zBack * 0.5]), ...both(P([1, 0, -1], [A.xCrown * 0.85, 0, A.zBack * 0.7]))], { color: ctx.C.frame, ...MAT.frame, bevel: 0.003 }));
  ctx.A.zCore = zCore;
  return parts;
}

// ---- 頭蓋（クラウン）とまゆの帯 ----
function buildCranium(ctx, slot) {
  const { A, st } = ctx, p = slot.p, t = slot.type;
  const parts = [];
  const { hd, yTop, yBrow, zBrow, zBack, sharp, round, bandH, bandJut } = A;
  const W = A.xCrown;
  const MAINM = { color: ctx.C.main, team: teamOf(ctx, 'main'), ...MAT.armor };
  const bR = round > 0.5 ? 0.012 + 0.014 * round : 0.006;
  const segs = round > 0.5 ? 2 : 1;
  const yBandTop = yBrow + bandH;
  const leanC = t === 'wedge' ? 0.4 + 0.2 * sharp : 0.28;   // 額の前傾（法線の上向き成分）
  const planes = [XH(W, bR), XL(-W, bR), ZL(zBack, bR), YL(-0.41 * yTop, 0.006),
    P([0, leanC, 1], [0, yBandTop, zBrow + 0.002], 0.01),                 // 額（上ほど前）
    P([0, -1, 0.55], [0, yBandTop, zBrow], 0.002),                        // 下面：帯の上端から後ろへ下がる（帯との境は硬い縁）
    P([0, -0.7, -1], [0, -0.35 * yTop, zBack * 0.9], 0.01),               // うなじのえぐり
    ...both(P([0.8, 0, 1], [0.84 * W, 0, 0.85 * hd], 0.02)), ...both(P([0.8, 0, -1], [0.84 * W, 0, zBack * 0.8], 0.02))];
  if (t === 'egg' || t === 'low') {
    const yt = t === 'low' ? yTop * 0.92 : yTop;
    planes.push(YH(yt, bR * 1.5),
      P([0, 1, 0.9], [0, yt * 0.894, hd * 0.58], bR * 1.5), P([0, 1, 0.45], [0, yt * 0.98, hd * 0.23], bR * 1.5),
      P([0, 1, -0.45], [0, yt * 0.98, zBack * 0.25], bR * 1.5), P([0, 1, -0.9], [0, yt * 0.894, zBack * 0.6], bR * 1.5),
      ...both(P([0.35, 1, 0], [0.36 * W, yt * 0.99, 0], bR * 1.5)), ...both(P([0.7, 1, 0], [0.67 * W, yt * 0.865, 0], bR * 1.5)),
      ...both(P([1, 0.7, 0], [0.9 * W, yt * 0.62, 0], bR * 1.5)), ...both(P([1, 0.25, 0], [W, yt * 0.35, 0], bR * 1.5)));
  } else if (t === 'wedge') {
    const peak = yTop * (1 + 0.03 * sharp);
    planes.push(...both(P([lerp(0.25, 0.45, p.step), 1, 0], [0, peak, 0], 0.006)),
      P([0, 1, 0.6], [0, peak * 0.9, hd * 0.6], 0.008), P([0, 1, -0.7], [0, peak * 0.9, zBack * 0.7], 0.008),
      ...both(P([1, 0.55, 0], [W, yTop * 0.4, 0], 0.008)), ...both(P([0.75, 1, 0.35], [0.8 * W, yTop * 0.82, hd * 0.5], 0.008)));
  } else {
    planes.push(YH(yTop * 0.97, 0.01), P([0, 1, 1], [0, yTop * 0.97, hd * 0.5], 0.01), P([0, 1, -1], [0, yTop * 0.97, zBack * 0.55], 0.01),
      ...both(P([1, 1, 0], [W, yTop * 0.75, 0], 0.01)), ...both(P([1, 0.35, 0], [W, yTop * 0.4, 0], 0.01)));
  }
  parts.push(H('頭・頭蓋', planes, { ...MAINM, bevel: bR, bevelSegs: segs }));
  if ((t === 'wedge' || t === 'box') && p.step > 0.55) {
    const cw = W * lerp(0.3, 0.45, sharp), raise = lerp(0.008, 0.02, p.step);
    parts.push(H('頭・頭頂の帯', [XH(cw, 0.004), XL(-cw, 0.004), YL(yTop * 0.6), YH(yTop + raise, 0.004), ZL(zBack * 0.7, 0.004), ZH(hd * 0.5, 0.004),
      P([0, 1, 0.9], [0, yTop + raise * 0.6, hd * 0.55], 0.004), P([0, 1, -0.8], [0, yTop + raise * 0.6, zBack * 0.7], 0.004), ...both(P([0.5, 1, 0], [cw * 0.7, yTop + raise, 0], 0.004))], { ...MAINM, color: ctx.C.sub, team: false, bevel: 0.004 }));
  }
  // まゆの帯：頭蓋の下端の水平な帯。前面は少し前傾して額より前（段）、下面はまゆの影（奥へ上がる）、両端は段になって後ろへ流れる
  {
    const shape = p.browShape, xB = W - 0.002, zF = zBrow + bandJut;
    const bl = [XH(xB, 0.004), XL(-xB, 0.004), YH(yBandTop), YL(yBrow - 0.008), ZL(hd * 0.15),
      P([0, -1, 0.3], [0, yBrow, zBrow - 0.005], 0.004),                   // 下面：奥へ上がる
      ...both(P([1, 0, 0.6], [xB, yBrow, hd * 0.7], 0.004))];              // 端は後ろへ
    if (shape === 'vee') bl.push(...both(P([0.25, 0.25, 1], [0, yBrow + bandH * 0.3, zF], 0.006)));
    else bl.push(P([0, 0.25, 1], [0, yBrow + bandH * 0.3, zF], 0.006));
    if (shape === 'arch') bl.push(...both(P([0.35, -1, 0.1], [0.8 * xB, yBrow - 0.006, hd * 0.7], 0.004)));   // 両端が下がる
    else bl.push(...both(P([0.5, -1, 0], [0.84 * xB, yBrow, 0], 0.004)));                                        // 両端の下は上がる（段）
    parts.push(H('頭・まゆの帯', bl.map(pl => pl.slice(0, 4)), { ...MAINM, bevel: 0.0015 }));   // 帯の辺は硬く
    ctx.A.brow = { zF, yT: yBandTop, xB };
  }
  return parts;
}

// ---- 目：帯の下のくぼみ（削り）に、光る目を置く（顔の面に沿って傾ける） ----
function buildCamera(ctx, slot) {
  const { A } = ctx, p = slot.p, t = slot.type;
  const glow = p.glow || ctx.C.glow;
  const parts = [];
  const yEye = A.yEye, eh = A.eyeH, w2 = A.xIn(yEye) + 0.004;   // くぼみは頬当ての内側の縁まで
  const cavD = lerp(0.006, 0.014, p.cavity);
  const rot = [A.lean, 0, 0];
  const zC = A.zCore;
  const yCavBot = yEye - eh / 2 - 0.006 * A.k, yCavTop = A.yBrow + 0.002;
  parts.push(F('頭・目のくぼみ', [[-w2 - 0.004, yCavBot - yEye], [w2 + 0.004, yCavBot - yEye], [w2, yCavTop - yEye], [-w2, yCavTop - yEye]], cavD * 2 + 0.03, A.onFace(yEye, zC + 0.015), { ...CUT, rot }));
  const zE = zC - cavD;
  const G = { color: glow, glow: true, ...MAT.glow, bevel: 0.002, rot };
  const zOn = zE + (cavD + 0.008) / 2 - 0.003;   // 目の前面がくぼみの口とそろう
  if (t === 'twin' || t === 'triple') {
    // 矢じり形の切れ込み：内側は細く、外側の先が尖る。つり上がりで外側の先が上がる（参考例の形）
    const gap = A.xIn(yEye) * 0.2, outer = A.xIn(yEye) - 0.006 * A.k, sl = lerp(-0.2, 1.0, p.slant) * eh * 0.5, w = outer - gap;
    const eye = [[gap, eh * 0.05], [gap + w * 0.28, -eh * 0.5 - sl * 0.2], [gap + w * 0.8, -eh * 0.4 + sl * 0.2], [outer, eh * 0.2 + sl], [gap + w * 0.95, eh * 0.5 + sl * 0.8], [gap + w * 0.36, eh * 0.45 + sl * 0.2]];
    parts.push(F('頭・目', eye, cavD + 0.008, A.onFace(yEye, zOn), { ...G, mirror: true, bevel: 0.001 }));
    if (t === 'triple') parts.push(F('頭・第三の目', rect(gap * 1.4, eh * 0.5, 0, eh * 0.2), cavD + 0.006, A.onFace(yEye, zOn - 0.001), G));
  } else if (t === 'mono') {
    const r = (eh + 0.008) * lerp(0.7, 0.95, p.size), x = lerp(-0.3, 0.3, p.slant) * w2;
    parts.push(F('頭・モノアイのレール', rect(w2 * 2, eh * 0.5), cavD * 0.5, A.onFace(yEye, zE + cavD * 0.25 - 0.002), { color: '#16181c', ...MAT.frame, bevel: 0.002, rot }));
    parts.push(L('頭・モノアイの縁', [[r * 1.18, 0], [r * 1.18, cavD * 0.7]], add3(A.onFace(yEye, zE - 0.002), [x, 0, 0]), { color: ctx.C.frame, ...MAT.lens, segments: 24, rot: [90 * D + A.lean, 0, 0] }));
    parts.push(L('頭・モノアイ', [[r, 0], [r, cavD + 0.004]], add3(A.onFace(yEye, zE), [x, 0, 0]), { ...G, segments: 24, rot: [90 * D + A.lean, 0, 0] }));
  } else if (t === 'visor') {
    const vh = eh * lerp(1.0, 1.3, p.size), sl = lerp(0, 0.4, p.slant) * vh;
    const vis = [[-w2 + 0.004, -vh / 2], [w2 - 0.004, -vh / 2], [w2 - 0.004, vh / 2 - sl], [0, vh / 2], [-w2 + 0.004, vh / 2 - sl]];
    parts.push(F('頭・バイザー', vis, cavD + 0.006, A.onFace(yEye, zOn), { ...G, ridge: 0.8, corner: 0.003 }));
  } else if (t === 'goggle') {
    const r = eh * lerp(0.6, 0.75, p.size), x = w2 * 0.55;
    parts.push(L('頭・ゴーグルの縁', [[r * 1.3, 0], [r * 1.3, cavD + 0.004]], add3(A.onFace(yEye, zE - 0.002), [x, 0, 0]), { color: ctx.C.frame, ...MAT.frame, segments: 20, mirror: true, rot: [90 * D + A.lean, 0, 0] }));
    parts.push(L('頭・ゴーグルの目', [[r, 0], [r, cavD + 0.008]], add3(A.onFace(yEye, zE), [x, 0, 0]), { ...G, segments: 20, mirror: true, rot: [90 * D + A.lean, 0, 0] }));
  } else if (t === 'cross') {
    const vh = eh * lerp(0.5, 0.7, p.size);
    parts.push(F('頭・T字バイザーの横', rect(w2 * 2 - 0.008, vh, 0, eh * 0.15), cavD + 0.006, A.onFace(yEye, zOn), G));
    parts.push(F('頭・T字バイザーの縦', rect(vh * 0.8, eh * 2.2, 0, -eh * 0.8), cavD + 0.006, A.onFace(yEye, zOn), G));
  }
  ctx.A.cavBot = yCavBot;
  return parts;
}
const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

// ---- 鼻筋：目の間から口元へ下りる細い稜（2 面） ----
function buildNose(ctx, slot) {
  const { A } = ctx, p = slot.p;
  if (p.bridge < 0.3) return [];
  const w = A.k * lerp(0.008, 0.013, p.bridge), yT = A.yEye + A.eyeH * 0.3, yB = A.yMaskTop - 0.004;
  const zN = A.zCore + A.k * lerp(0.012, 0.02, p.bridge);   // 芯の前面より前へ
  const back = P([-A.faceN[0], -A.faceN[1], -A.faceN[2]], A.onFace(A.yEye, A.zCore - 0.03), 0);
  return [H('頭・鼻筋', [XH(w), XL(-w), YH(yT), YL(yB), back, ...both(P([0.75, 0, 1], A.onFace(A.yEye, zN))), ...both(P([1, 0.4, 0], [w, yB, 0]))], { color: ctx.C.sub, ...MAT.armor, bevel: 0.0015 })];
}

// ---- 頬当て（右を作ってミラー）：頭の最大幅を作る大きな板。内側と外側の縁はあごへすぼまり、下端は水平。前面は上の面と、あごへ向かって奥へ入る下の面 ----
function buildCheeks(ctx, slot) {
  const { A } = ctx, p = slot.p, t = slot.type;
  if (t === 'none') return [];
  const mirror = p.both === 'yes';
  const parts = [];
  const M = { color: ctx.C.main, team: teamOf(ctx, 'main'), ...MAT.armor };
  // 頬は 2 段：目の脇の厚いブロック（帯より前へ張り出す＝凸）と、その下の板（あごへ向かって内へ寄り、奥へ傾く）。辺は硬く
  const k = A.k, yT = A.yBrow + k * 0.016, yB = A.yJaw;
  const jut = k * lerp(0.006, 0.02, p.size);                    // 上のブロックが帯の前面より前へ出る分（凸）
  const zTop = A.zFace(A.yEye) + jut;
  const fN = A.faceN;
  const outAng = lerp(10, 22, p.ang) * D;                       // 上のブロックの前面が外へ向かう角
  const yStep = A.yEye - k * 0.034;                             // 上のブロックと下の板の段
  const xUp = A.xInTop + k * 0.002;                             // 上のブロックの内側（目のすぐ脇）
  const frontUp = P([Math.sin(outAng), fN[1] * Math.cos(outAng) + 0.1, fN[2] * Math.cos(outAng)], [xUp, A.yEye, zTop], 0.003);
  parts.push(H('頭・頬の上ブロック', [
    XL(xUp), XH(A.xFlare), YH(yT), YL(yStep), ZL(A.zBack * 0.25),
    P([0.6, 1, 0], [A.xFlare * 0.88, yT, 0]),                        // 上の外側の角
    frontUp,
    P([1, 0, 0.45], [A.xFlare - 0.002, 0, A.hd * 0.54]),             // 外側の面：後ろへ流れる
    P([0.2, -1, 0.5], [xUp + 0.008, yStep, zTop - k * 0.024]),       // 下面：奥へ下がる（下の板への段）
    P([1, 0, -1], [A.xFlare * 0.83, 0, A.zBack * 0.4])], { ...M, mirror, bevel: 0.002 }));
  const yLoTop = yStep + k * 0.012, xLoIn = A.xIn(yLoTop) - k * 0.004, xLoOut = A.xFlare - k * 0.012;
  const convLo = (xLoIn - A.xInJaw) / (yLoTop - A.yJawIn);
  const bd = [A.xInJaw - A.xOutJaw, A.yJawIn - A.yJaw];         // 下端：外側の角から内側の角へ少し下がる
  const frontLo = P([0.28, -0.4 - fN[1] * 0.5, 1], [xLoIn, yLoTop - k * 0.01, zTop - k * 0.016], 0.003);   // 前面：あごへ向かって奥へ傾く
  parts.push(H('頭・頬の下の板', [
    P([-1, convLo, 0], [xLoIn, yLoTop, 0]),                          // 内側の縁（下で中心へ寄る）
    P([1, -0.1, 0], [xLoOut, yLoTop, 0]),                            // 外側の縁（ほぼ垂直）
    YH(yLoTop), ZL(A.zBack * 0.25),
    P([-bd[1], bd[0], 0], [A.xOutJaw, yB, 0]),                       // 下端（法線は下向き）
    P([0.7, -1, 0], [xLoOut - k * 0.006, yB, 0]),                    // 下の外側の角の面取り
    frontLo,
    P([1, 0, 0.45], [xLoOut - 0.002, 0, A.hd * 0.54]),               // 外側の面
    P([0, -1, -0.35], [0, yB + 0.006, -0.02]),
    P([1, 0, -1], [A.xFlare * 0.83, 0, A.zBack * 0.4])], { ...M, mirror, bevel: 0.002 }));
  const frontZ = (x, y) => (frontUp[3] - frontUp[0] * x - frontUp[1] * y) / frontUp[2];
  const cy = A.yEye - k * 0.03, xg = A.xIn(cy) + k * 0.02;
  const rotN = [90 * D + A.lean, outAng, 0];
  if (t === 'guard') {
    // 前へ張り出す刃：内側の縁に沿う薄い楔（先が下がる）
    const jt = k * lerp(0.012, 0.028, p.size), h = (A.cavBot - yB) * 0.5, xr = A.xIn(cy);
    parts.push(H('頭・頬の刃', [P([-1, A.conv, 0], [xr + 0.002, cy, 0], 0.003), XH(xr + 0.016, 0.003), YH(cy + h / 2, 0.003), YL(cy - h / 2, 0.003), ZL(zTop - 0.03),
      P([0.4, 0.2, 1], [xr, cy - h * 0.2, zTop + jt], 0.004), P([0.2, -1, 0.5], [0, cy - h / 2, zTop + jt * 0.6], 0.003)], { ...M, mirror, bevel: 0.003 }));
  } else if (t === 'duct') {
    const r = k * lerp(0.006, 0.01, p.size);
    parts.push(L('頭・頬のダクト', cup(r * 1.25, r * 0.85, 0.03, 0.005), [xg, cy, frontZ(xg, cy) - 0.008], { ...CUT, mirror, segments: 16, rot: rotN }));
  } else if (t === 'vent') {
    const n = 2 + Math.round(p.size * 2), sw = 0.016, sh = 0.0035;
    parts.push(F('頭・頬のベント', rect(sw, sh), 0.03, [xg, cy - (n - 1) * 0.0045, frontZ(xg, cy) - 0.008], { ...CUT, mirror, arrayCount: n, arrayStep: [0, 0.009, 0], rot: [A.lean, outAng, 0] }));
  } else if (t === 'sensor') {
    const r = k * lerp(0.005, 0.008, p.size), z0 = frontZ(xg, cy);
    parts.push(L('頭・頬センサーのくぼみ', [[r * 1.2, -0.008], [r * 1.2, 0.02]], [xg, cy, z0 - 0.002], { ...CUT, segments: 12, mirror, rot: rotN }));
    parts.push(L('頭・頬センサー', [[r, 0], [r, 0.016]], [xg, cy, z0 - 0.018], { color: ctx.C.glow, glow: true, ...MAT.glow, segments: 12, mirror, rot: rotN }));
  }
  ctx.A.cheek = { yT, yB, zIn: zTop, xIn0: A.xInTop, xOut0: A.xFlare, frontZ };
  return parts;
}

// ---- マスク（凸）とあご：頬当ての間を埋める船首形。中央の面は頬当てより少し奥、両側の面は後ろへ ----
function buildMask(ctx, slot) {
  const { A } = ctx, p = slot.p, t = slot.type;
  const parts = [];
  ctx.A.mask = null;
  if (t === 'none') return parts;
  const color = colorOf(ctx, p.color), team = teamOf(ctx, p.color);
  const M = { color, team, ...MAT.armor };
  const k = A.k;
  const yTop = A.yMaskTop + k * lerp(-0.008, 0.006, p.h), yBot = (t === 'chin' || t === 'jaw') ? A.yMaskBot : A.yJaw + k * 0.01;
  const yMid = (yTop + yBot) / 2;
  // 六角形の盾：上半分は側面が垂直、下半分で内へ折れてすぼまる（参考例：上 0.045、下 0.028）。辺は硬く
  const wTop = A.xIn(yTop) * lerp(0.56, 0.74, p.w), wBot = wTop * (t === 'jaw' ? 0.74 : 0.62);
  const yFold = yTop - (yTop - yBot) * 0.4;
  const convM = (wTop - wBot) / (yFold - yBot);
  const zF = A.zFace(yMid) + k * lerp(-0.018, -0.004, p.fwd);   // 中央の面（頬の上ブロックより奥：凹）
  const sweep = lerp(0.45, 0.7, ctx.st.sharp);
  const fN = A.faceN;
  const front = P(fN, A.onFace(yMid, zF - A.zFace(yMid)));
  const flat = t === 'grille' ? 0.6 : 0.32;
  const sides = both(P([Math.sin(Math.atan(sweep)) * fN[2], fN[1] * 0.6, Math.cos(Math.atan(sweep)) * fN[2]], [wTop * flat, yMid, zF]));
  const planes = [front, ...sides, ...both(XH(wTop)), ...both(P([1, -convM, 0], [wTop, yFold, 0])),
    P([0, 1, 0.4], [0, yTop, zF - k * 0.013]),   // 上面：鼻の下へ引っ込む
    P([0, -1, 0.5], [0, yBot, zF - k * 0.008]),  // 下面：あごへ
    YL(yBot - 0.006), ZL(A.hd * 0.38)];
  parts.push(H('頭・マスク', planes, { ...M, bevel: 0.0015 }));
  if (t === 'split') parts.push(F('頭・マスクの割れ', rect(0.005, yTop - yBot + 0.02, 0, 0), 0.04, A.onFace(yMid, zF - A.zFace(yMid) + 0.008), { ...CUT, rot: [A.lean, 0, 0] }));
  if (t === 'chin' || t === 'jaw') {
    // あご（凸）：マスクの下で前下へ突き出す。前面は頬当てより少し前、先は後ろへ戻る
    // 六角形の塊：上はマスクより少し広い段（半幅 0.034）、少し下で最大幅、先（0.01）へすぼまる。前面は平らで頬より前（凸）
    const yC = yBot, yCB = A.yChin, wC = wTop * (t === 'jaw' ? 0.9 : 0.76);
    const zC = A.zFace(yC) + k * lerp(0.002, 0.01, p.fwd);
    parts.push(H('頭・あご', [YH(yC + 0.012), YL(yCB), ZL(A.hd * 0.38), ...both(XH(wC)), ...both(P([1, -0.25, 0], [wC, yC - k * 0.013, 0])),
      ...both(P([0.6, 0, 1], [wC * 0.35, yC - 0.02, zC + 0.002])), P([0, -0.1, 1], [0, yC - 0.01, zC + 0.003]),
      P([0, -1, 0.5], [0, yCB, zC - 0.04])], { ...M, bevel: 0.0015 }));
  }
  ctx.A.mask = { yTop, yBot, yMid, wTop, zF, sweep, type: t, color };
  return parts;
}


// ---- マスク飾り ----
function buildMaskDeco(ctx, slot) {
  const { A } = ctx, p = slot.p, t = slot.type;
  const m = A.mask;
  if (t === 'none' || !m) return [];
  const parts = [];
  const n = Math.max(1, Math.round(lerp(1, 4, p.n))), d = lerp(0.004, 0.008, p.size);
  const rot = [A.lean, 0, 0];
  const onFront = (y, s) => A.onFace(y, m.zF - A.zFace(m.yMid) + s);
  if (t === 'hslit') {
    // 頬側の面（船首の斜め面）に彫る横スリット：面の向きに合わせて回す
    const sw = m.wTop * 0.45, sh = 0.0035, step = 0.009, yaw = Math.atan(m.sweep);
    const x = m.wTop * 0.62, y0 = m.yMid - (n - 1) * step / 2;
    parts.push(F('頭・マスクの横スリット', rect(sw, sh), 0.03, add3(onFront(m.yMid, 0.015 - d), [x, 0, -x * m.sweep]), { ...CUT, mirror: true, arrayCount: n, arrayStep: [0, step, 0], rot: [A.lean, yaw, 0], pos: undefined }));
    parts[parts.length - 1].pos = add3(onFront(y0, 0.015 - d), [x, 0, -x * m.sweep * 0.9]);
  } else if (t === 'vslit') {
    const sw = lerp(0.003, 0.005, p.size), sh = (m.yTop - m.yBot) * 0.5, step = (m.wTop * 0.5) / (n + 1) * 2;
    parts.push(F('頭・マスクの縦スリット', rect(sw, sh), 0.03, add3(onFront(m.yMid, 0.015 - d), [-(n - 1) / 2 * step, 0, 0]), { ...CUT, arrayCount: n, arrayStep: [step, 0, 0], rot }));
  } else if (t === 'rib') {
    const rw = lerp(0.006, 0.012, p.size);
    parts.push(H('頭・マスクの筋', [XH(rw / 2), XL(-rw / 2), YH(m.yTop - 0.004), YL(m.yBot + 0.004), P([-A.faceN[0], -A.faceN[1], -A.faceN[2]], onFront(m.yMid, -0.02), 0), ...both(P([0.8, 0, 1], onFront(m.yMid, 0.008)))], { color: ctx.C.sub, ...MAT.armor, bevel: 0.0015 }));
  } else if (t === 'ducts') {
    const r = lerp(0.006, 0.01, p.size), x = m.wTop * 0.55, y0 = m.yMid - (m.yTop - m.yBot) * 0.1;
    parts.push(L('頭・マスクのダクト', cup(r * 1.3, r * 0.85, 0.024, 0.005), add3(onFront(y0, -0.004 - x * m.sweep * 0.8), [x, 0, 0]), { ...CUT, segments: 16, mirror: true, rot: [90 * D + A.lean, 0, 0] }));
  } else if (t === 'gem') {
    const r = lerp(0.005, 0.009, p.size), y0 = m.yBot + (m.yTop - m.yBot) * 0.3;
    parts.push(L('頭・あごのくぼみ', [[r * 1.1, -0.01], [r * 1.1, 0.012]], onFront(y0, 0.004), { ...CUT, segments: 12, rot: [90 * D + A.lean, 0, 0] }));
    parts.push(L('頭・あごの宝石', [[r, 0], [r, 0.012]], onFront(y0, -0.007), { color: ctx.C.accent, glow: true, ...MAT.glow, segments: 12, rot: [90 * D + A.lean, 0, 0] }));
  } else if (t === 'groove') {
    const gw = lerp(0.003, 0.005, p.size);
    parts.push(F('頭・マスクの割り溝', rect(m.wTop * 1.6, gw), 0.03, onFront(m.yMid + (m.yTop - m.yBot) * 0.2, 0.015 - d), { ...CUT, rot }));
    if (m.type !== 'split') parts.push(F('頭・マスクの割り溝・縦', rect(gw, (m.yTop - m.yBot) * 0.45), 0.03, onFront(m.yMid - (m.yTop - m.yBot) * 0.1, 0.015 - d), { ...CUT, rot }));
  }
  return parts;
}

// ---- 装飾前（額）：まゆの棚の上、額の面に載る ----
function buildDecoF(ctx, slot) {
  const { A } = ctx, p = slot.p, t = slot.type;
  if (t === 'none') return [];
  const parts = [];
  const color = colorOf(ctx, p.color), team = teamOf(ctx, p.color);
  const M = { color, team, ...MAT.armor };
  const b = A.brow;
  if (t === 'vplate') {
    // 額の V：まゆの棚の中央に載る楔（参考例の額の三角）
    // 参考例の額の三角：下が尖り、上へ広がる薄い板（まゆの棚の前面から 3〜4 mm 相当だけ浮く）
    // 帯のすぐ上、額の面に浮く（参考例の額の三角は帯の上にある）
    const w = A.k * lerp(0.02, 0.036, p.size), yL = b.yT + 0.003, yT = yL + A.k * lerp(0.022, 0.03, p.size);
    parts.push(H('頭・額の V', [XH(w), XL(-w), YH(yT), YL(yL), ZL(A.zBrow - 0.05), ...both(P([0.3, 0.4, 1], [0, yL + (yT - yL) * 0.5, A.zBrow + 0.004])),
      ...both(P([1, -0.9, 0], [w, yT, 0])), P([0, -1, 0.7], [0, yL, A.zBrow - 0.006])], { ...M, bevel: 0.0015 }));
  } else if (t === 'plate') {
    const w = A.hw * lerp(0.4, 0.7, p.size), yL = b.yT + 0.004, yT = yL + lerp(0.025, 0.045, p.size);
    parts.push(H('頭・額プレート', [XH(w), XL(-w), YH(yT), YL(yL), ZL(A.zBrow - 0.05), P([0, Math.sin(A.lean) * 1.2, Math.cos(A.lean)], [0, yL, A.zBrow + 0.006]), ...both(P([1, 0.4, 0], [w, yL, 0])), P([0, 1, 0.6], [0, yT, A.zBrow - 0.01])], { ...M, bevel: 0.003 }));
  } else if (t === 'gem') {
    const r = lerp(0.006, 0.011, p.size), y = b.yT + 0.018, z = A.zBrow + 0.004;
    parts.push(H('頭・額センサーの台', [XH(r * 1.8), XL(-r * 1.8), YH(y + r * 1.8), YL(y - r * 1.8), ZL(z - 0.04), P([0, Math.sin(A.lean) * 1.2, Math.cos(A.lean)], [0, y, z + 0.004])], { color: ctx.C.frame, ...MAT.frame, bevel: 0.002 }));
    parts.push(L('頭・額センサーのくぼみ', [[r * 1.15, -0.01], [r * 1.15, 0.012]], [0, y, z + 0.004], { ...CUT, segments: 14, rot: [90 * D + A.lean, 0, 0] }));
    parts.push(L('頭・額センサー', [[r, 0], [r, 0.012]], [0, y, z - 0.006], { color: ctx.C.glow, glow: true, ...MAT.glow, segments: 14, rot: [90 * D + A.lean, 0, 0] }));
  } else if (t === 'ridge') {
    // 中央の稜線：額の上から頭頂を越えて後ろへ、細い帯（面構成なので直線の帯を 2 つ）
    const w = lerp(0.006, 0.012, p.size), out = 0.006;
    parts.push(H('頭・中央の稜線・前', [XH(w), XL(-w), YL(b.yT), ZL(A.crown.zBack * 0.2), P([0, 0.9, 0.55], [0, A.yTop + out, A.crown.zFront * 0.5]), P([0, Math.sin(A.lean) * 1.2, Math.cos(A.lean)], [0, b.yT, A.zBrow + out]), P([0, 1, 0.2], [0, A.yTop + out, 0])], { ...M, bevel: 0.002 }));
  } else if (t === 'peak') {
    // ひさし：まゆの棚の上にもう一段の薄い山形の板
    const jut = lerp(0.008, 0.02, p.size), th = 0.006, xB = b.xB - 0.006, y = b.yT - 0.002;
    parts.push(H('頭・ひさし', [XH(xB, 0.003), XL(-xB, 0.003), YH(y + th), YL(y - 0.002), ZL(b.zF - 0.04), ...both(P([0.3, 0, 1], [0, y, b.zF + jut], 0.003)), P([0, -1, 0.25], [0, y, b.zF - 0.01], 0.003)], { ...M, bevel: 0.003 }));
  }
  return parts;
}

// ---- トサカ：額の上（まゆの棚の上）と頭頂 ----
function buildCrest(ctx, slot) {
  const { A } = ctx, p = slot.p, t = slot.type;
  if (t === 'none') return [];
  const parts = [];
  const color = colorOf(ctx, p.color), team = teamOf(ctx, p.color);
  const M = { color, team, ...MAT.armor };
  const yF = A.brow.yT + 0.01, zF = A.zBrow + 0.004;   // 額（まゆの棚の上）
  if (t === 'vfin') {
    const len = lerp(0.06, 0.14, p.len) * (1 + 0.15 * A.sharp), th = lerp(0.006, 0.012, p.th), open = lerp(25, 60, p.ang) * D;
    parts.push(H('頭・アンテナの台', [XH(0.024), XL(-0.024), YH(yF + 0.02), YL(yF - 0.012), ZL(zF - 0.05), P([0, Math.sin(A.lean) * 1.2, Math.cos(A.lean)], [0, yF, zF + 0.01]), ...both(P([1, 0.6, 0], [0.024, yF, 0]))], { color: ctx.C.frame, ...MAT.frame, bevel: 0.003 }));
    // 刃：根元を原点にした薄い楔（先へ細く）を、外へ open 開いて立てる
    const blade = H('頭・V字アンテナ', [XL(-0.004, 0.002), XH(len, 0.002), YL(-th / 2, 0.002), YH(th / 2, 0.002), ZL(-0.008, 0.002), ZH(0.014, 0.002),
      P([1, 0, 0.35], [len, 0, 0.004], 0.002), P([1, 0, -0.5], [len, 0, -0.002], 0.002), P([0.15, 0, 1], [len * 0.5, 0, 0.014], 0.002), P([0.12, 0, -1], [len * 0.5, 0, -0.008], 0.002)], { ...M, mirror: true, bevel: 0.002 });
    blade.pos = [0.01, yF + 0.012, zF - 0.002]; blade.rot = [-0.25 + A.lean * 0.5, 0, Math.PI / 2 - open];
    parts.push(blade);
    parts.push(H('頭・アンテナの中央', [XH(0.006), XL(-0.006), YH(yF + 0.03), YL(yF + 0.006), ZL(zF - 0.03), P([0, 0.3, 1], [0, yF + 0.02, zF + 0.012])], { color: ctx.C.accent === color ? ctx.C.main : ctx.C.accent, ...MAT.armor, bevel: 0.002 }));
  } else if (t === 'blade') {
    // 一枚刃：額から頭頂を越えて後ろへ流れる薄い刃（面構成：前縁は前傾、上縁は後ろ上がり、後端は落ちる）
    const th = lerp(0.008, 0.016, p.th), up = lerp(0.03, 0.07, p.len), back = A.crown.zBack * 0.9 - lerp(0.02, 0.08, p.ang);
    parts.push(H('頭・一枚刃', [XH(th / 2, 0.002), XL(-th / 2, 0.002), YL(A.yBrow + 0.02), ZL(back, 0.003), P([0, 0.35, 1], [0, yF, zF + 0.006], 0.003),
      P([0, 1, 0.5], [0, A.yTop + up, A.crown.zFront * 0.3], 0.003), P([0, 1, -0.25], [0, A.yTop + up, A.crown.zFront * 0.3], 0.003), P([0, -1, -1], [0, A.yTop * 0.6, back], 0.003)], { ...M, bevel: 0.002 }));
  } else if (t === 'mohawk') {
    const w = lerp(0.014, 0.03, p.th), up = lerp(0.012, 0.03, p.len);
    parts.push(H('頭・とさか', [XH(w / 2, 0.004), XL(-w / 2, 0.004), YL(A.yTop * 0.55), ZL(A.crown.zBack * 1.2, 0.004), ZH(zF - 0.01, 0.004), P([0, 1, 0.9], [0, A.yTop * 0.9 + up, A.crown.zFront * 1.2], 0.004),
      P([0, 1, 0], [0, A.yTop + up, 0], 0.004), P([0, 1, -0.9], [0, A.yTop * 0.9 + up, A.crown.zBack * 1.2], 0.004), ...both(P([1, 0.5, 0], [w / 2, A.yTop + up * 0.6, 0], 0.004))], { ...M, bevel: 0.003, bevelSegs: A.round > 0.5 ? 2 : 1 }));
  } else if (t === 'horn') {
    const len = lerp(0.05, 0.13, p.len), r = lerp(0.006, 0.014, p.th), tilt = lerp(10, 50, p.ang) * D;
    parts.push(L('頭・角の台', [[r * 1.6, -0.03], [r * 1.6, 0.012], [r * 1.2, 0.018]], [0, yF + 0.006, zF - 0.02], { color: ctx.C.frame, ...MAT.frame, segments: 12, rot: [-tilt, 0, 0] }));
    parts.push(L('頭・一本角', [[r, 0], [r * 0.85, len * 0.6], [r * 0.15, len], [0, len]], [0, yF + 0.006, zF - 0.02], { ...M, segments: 12, rot: [-tilt, 0, 0] }));
  } else if (t === 'twin') {
    const len = lerp(0.05, 0.12, p.len), r = lerp(0.004, 0.008, p.th), open = lerp(5, 30, p.ang) * D, x = A.hw * 0.45;
    const y0 = A.yTop * 0.88, z0 = A.crown.zFront * 0.3;
    parts.push(L('頭・アンテナの根', [[r * 2, -0.02], [r * 2, 0.008]], [x, y0, z0], { color: ctx.C.frame, ...MAT.frame, segments: 10, mirror: true }));
    parts.push(L('頭・2本アンテナ', [[r, 0], [r * 0.8, len * 0.7], [r * 0.2, len]], [x, y0 + 0.004, z0], { ...M, segments: 10, mirror: true, rot: [-open * 0.4, 0, -open] }));
  }
  return parts;
}

// ---- 装飾 右・左（こめかみ：頭蓋の側面、頬当ての上の外側） ----
function buildDecoSide(ctx, slot, sideSign) {
  const { A } = ctx, p = slot.p, t = slot.type;
  if (t === 'none') return [];
  const parts = [];
  const M = { color: ctx.C.sub, ...MAT.armor };
  const y = A.temple.y + lerp(-0.01, 0.035, p.y), x = sideSign * A.hw, z = lerp(-0.02, 0.02, 0.5);
  const tag = sideSign > 0 ? '左' : '右';
  const yaw = sideSign > 0 ? -90 * D : 90 * D;
  // 側面に載る台（hull）：頭蓋の面から out だけ外へ。片側だけを作る（ミラーしない）
  const pad = (name, w, h, out, o = {}) => H(name, [sideSign > 0 ? XL(x - 0.01) : XH(x + 0.01), sideSign > 0 ? XH(x + out, 0.004) : XL(x - out, 0.004), YH(y + h / 2, 0.004), YL(y - h / 2, 0.004), ZH(z + w / 2, 0.004), ZL(z - w / 2, 0.004),
    P([sideSign, 0.6, 0], [x + sideSign * out * 0.9, y + h * 0.35, z], 0.004), P([sideSign, 0, 0.7], [x + sideSign * out * 0.9, y, z + w * 0.35], 0.004)], { ...M, bevel: 0.004, ...o });
  if (t === 'ear') {
    const s = lerp(0.028, 0.044, p.size), out = lerp(0.012, 0.02, p.size), r = s * 0.3;
    parts.push(pad(`頭・耳の台・${tag}`, s, s * 0.9, out));
    parts.push(L(`頭・耳のくぼみ・${tag}`, cup(r * 1.2, r * 0.9, 0.024, 0.005), [x + sideSign * (out - 0.006), y, z], { ...CUT, segments: 16, rot: [0, 0, -sideSign * 90 * D] }));
    parts.push(L(`頭・耳センサー・${tag}`, [[r * 0.8, 0], [r * 0.8, 0.014]], [x + sideSign * (out - 0.018), y, z], { color: ctx.C.frame, ...MAT.lens, segments: 16, rot: [0, 0, -sideSign * 90 * D] }));
  } else if (t === 'fin') {
    const len = lerp(0.05, 0.11, p.size), h = lerp(0.03, 0.06, p.size), th = 0.008, open = lerp(5, 25, p.ang) * D;
    parts.push(pad(`頭・フィンの根・${tag}`, 0.03, h * 0.7, 0.01, { color: ctx.C.frame }));
    const fin = H(`頭・側面フィン・${tag}`, [XH(th / 2, 0.002), XL(-th / 2, 0.002), ZH(0.015, 0.002), ZL(-len, 0.003), YL(-h / 2, 0.002), YH(h / 2 + h * 0.3, 0.002),
      P([0, 1, -0.5], [0, h / 2 + h * 0.3, -len * 0.5], 0.002), P([0, -1, -1], [0, -h / 2, -len * 0.6], 0.002), P([0, 0.4, -1], [0, 0, -len], 0.002)], { ...M, bevel: 0.002 });
    fin.pos = [x + sideSign * 0.006, y, z - 0.01]; fin.rot = [0, sideSign * open, 0];
    parts.push(fin);
  } else if (t === 'rod') {
    const len = lerp(0.05, 0.14, p.size), r = lerp(0.004, 0.007, p.size), tilt = lerp(0, 25, p.ang) * D;
    parts.push(pad(`頭・ロッドの台・${tag}`, 0.024, 0.024, 0.012, { color: ctx.C.frame }));
    parts.push(L(`頭・ロッドアンテナ・${tag}`, [[r, 0], [r, len * 0.75], [r * 0.4, len]], [x + sideSign * 0.008, y + 0.008, z], { ...M, color: ctx.C.frame, segments: 10, rot: [0, 0, -sideSign * tilt] }));
  } else if (t === 'pod') {
    const w = lerp(0.03, 0.05, p.size), h = lerp(0.035, 0.06, p.size), out = lerp(0.014, 0.026, p.size);
    parts.push(pad(`頭・側面ポッド・${tag}`, w, h, out));
    parts.push(F(`頭・ポッドの溝・${tag}`, rect(w * 0.6, 0.004), 0.012, [x + sideSign * out, y, z], { ...CUT, rot: [0, yaw, 0], arrayCount: 2, arrayStep: [0, 0.012, 0] }));
  } else if (t === 'horn') {
    const len = lerp(0.04, 0.1, p.size), r = lerp(0.008, 0.014, p.size), tilt = lerp(20, 60, p.ang) * D;
    parts.push(L(`頭・横角の台・${tag}`, [[r * 1.5, -0.012], [r * 1.5, 0.006]], [x, y, z], { ...M, color: ctx.C.frame, segments: 12, rot: [0, 0, -sideSign * (90 * D - tilt)] }));
    parts.push(L(`頭・横角・${tag}`, [[r, 0], [r * 0.8, len * 0.65], [r * 0.1, len]], [x, y, z], { ...M, segments: 12, rot: [0, 0, -sideSign * (90 * D - tilt)] }));
  } else if (t === 'vent') {
    const n = 2 + Math.round(p.size * 3), w = 0.03, sh = 0.0035;
    parts.push(pad(`頭・側面ベントの台・${tag}`, w + 0.012, n * 0.009 + 0.012, 0.01));
    parts.push(F(`頭・側面ベント・${tag}`, rect(w, sh), 0.012, [x + sideSign * 0.008, y - (n - 1) / 2 * 0.009, z], { ...CUT, rot: [0, yaw, 0], arrayCount: n, arrayStep: [0, 0.009, 0] }));
  }
  return parts;
}

// ---- 装飾後ろ（後頭・うなじ） ----
function buildDecoB(ctx, slot) {
  const { A } = ctx, p = slot.p, t = slot.type;
  if (t === 'none') return [];
  const parts = [];
  const M = { color: ctx.C.sub, ...MAT.armor };
  const y = lerp(A.yBrow - 0.02, A.yTop * 0.55, p.y), zB = A.zBack;
  if (t === 'duct') {
    const w = lerp(0.05, 0.09, p.size), h = lerp(0.035, 0.06, p.size), r = h * 0.28;
    parts.push(H('頭・後頭ダクトの台', [XH(w / 2, 0.004), XL(-w / 2, 0.004), YH(y + h / 2, 0.004), YL(y - h / 2, 0.004), ZH(zB + 0.03), ZL(zB - 0.02, 0.004), P([0, 1, -0.7], [0, y + h / 2, zB - 0.01], 0.004), ...both(P([1, 0, -0.8], [w / 2, y, zB - 0.01], 0.004))], { ...M, bevel: 0.004 }));
    parts.push(L('頭・後頭ダクト', cup(r * 1.2, r * 0.85, 0.03, 0.005), [w * 0.25, y, zB - 0.006], { ...CUT, segments: 16, mirror: true, rot: AXIS_ZB }));
  } else if (t === 'fin') {
    const len = lerp(0.04, 0.09, p.size), h = lerp(0.04, 0.08, p.size), th = lerp(0.01, 0.02, p.size);
    parts.push(H('頭・後頭フィン', [XH(th / 2, 0.002), XL(-th / 2, 0.002), ZH(zB + 0.03), ZL(zB - len, 0.003), YL(y - h / 2, 0.003), YH(A.yTop * 0.95, 0.003),
      P([0, 1, -0.6], [0, A.yTop * 0.95, zB - len * 0.4], 0.003), P([0, -1, -0.8], [0, y - h / 2, zB - len * 0.5], 0.003)], { ...M, bevel: 0.002 }));
  } else if (t === 'pod') {
    const w = lerp(0.04, 0.07, p.size), h = lerp(0.03, 0.045, p.size);
    parts.push(H('頭・後頭センサーの台', [XH(w / 2, 0.003), XL(-w / 2, 0.003), YH(y + h / 2, 0.003), YL(y - h / 2, 0.003), ZH(zB + 0.03), ZL(zB - 0.026, 0.003), ...both(P([1, 0.5, -0.5], [w / 2, y + h / 2, zB - 0.01], 0.003))], { color: ctx.C.frame, ...MAT.frame, bevel: 0.003 }));
    parts.push(F('頭・後頭センサーのくぼみ', rect(w * 0.6, h * 0.35), 0.012, [0, y, zB - 0.02], { ...CUT }));
    parts.push(F('頭・後頭センサー', rect(w * 0.56, h * 0.3), 0.01, [0, y, zB - 0.015], { color: ctx.C.glow, glow: true, ...MAT.glow, bevel: 0.002 }));
  } else if (t === 'cables') {
    const r = lerp(0.005, 0.009, p.size), x = A.hw * 0.3, yN = A.neck.y - 0.03;
    parts.push(L('頭・後頭ケーブル', [[r, 0], [r, (y - yN) + 0.03]], [x, yN, zB * 0.7 - r], { color: ctx.C.frame, ...MAT.frame, segments: 10, mirror: true, rot: [0.25, 0, 0] }));
    parts.push(H('頭・ケーブルの口', [XH(x + r * 2), XL(-x - r * 2), YH(y + r * 1.5), YL(y - r * 1.5), ZH(zB + 0.03), ZL(zB - 0.006)], { ...M, color: ctx.C.frame, bevel: 0.002 }));
  } else if (t === 'plate') {
    const w = A.hw * 2 * lerp(0.5, 0.75, p.size), h = A.yTop * lerp(0.5, 0.85, p.size), out = lerp(0.01, 0.022, p.size);
    parts.push(H('頭・後頭プレート', [XH(w / 2, 0.004), XL(-w / 2, 0.004), YH(y + h / 2, 0.004), YL(y - h / 2, 0.004), ZH(zB + 0.04), ZL(zB - out, 0.004),
      P([0, 1, -0.9], [0, y + h / 2, zB - out * 0.2], 0.004), ...both(P([1, 0, -0.6], [w / 2, y, zB - out * 0.3], 0.004)), ...both(P([1, -0.35, 0], [w / 2, y - h * 0.1, 0], 0.004))], { ...M, bevel: 0.004 }));
  }
  return parts;
}

// ---- 首後ろ（首の芯を含む） ----
function buildNeckB(ctx, slot) {
  const { A } = ctx, p = slot.p, t = slot.type;
  const parts = [];
  const n = A.neck, len = 0.09;
  parts.push(L('首', [[n.r, -len], [n.r, 0.035]], [0, n.y, n.z], { color: ctx.C.frame, ...MAT.frame, segments: 16 }));
  const M = { color: ctx.C.sub, ...MAT.armor };
  if (t === 'guard') {
    const w = lerp(0.07, 0.11, p.size), h = lerp(0.05, 0.08, p.size), zR = n.z - n.r - 0.004;
    parts.push(H('首・うなじガード', [XH(w / 2, 0.003), XL(-w / 2, 0.003), YH(n.y + 0.01), YL(n.y - h, 0.003), ZH(zR + 0.02), P([0, -0.3, -1], [0, n.y, zR - 0.012], 0.004), ...both(P([1, -0.3, 0], [w / 2, n.y - 0.01, 0], 0.003))], { ...M, bevel: 0.003 }));
  } else if (t === 'block') {
    const w = lerp(0.06, 0.1, p.size), h = lerp(0.04, 0.07, p.size);
    parts.push(H('首・後ろの台', [XH(w / 2, 0.004), XL(-w / 2, 0.004), YH(n.y + 0.005), YL(n.y - h, 0.004), ZH(n.z), ZL(n.z - n.r - 0.03, 0.004), ...both(P([1, -0.4, -0.5], [w / 2, n.y - 0.02, n.z - n.r], 0.004))], { ...M, color: ctx.C.frame, bevel: 0.004 }));
  } else if (t === 'cables') {
    const r = lerp(0.006, 0.01, p.size), x = n.r * 0.8;
    parts.push(L('首・ケーブル', [[r, -0.08], [r, 0.02]], [x, n.y - 0.01, n.z - n.r + r * 0.3], { color: ctx.C.frame, ...MAT.frame, segments: 10, mirror: true, rot: [0.2, 0, 0] }));
  }
  return parts;
}

// ---- 首前 ----
function buildNeckF(ctx, slot) {
  const { A } = ctx, p = slot.p, t = slot.type;
  const parts = [];
  const n = A.neck;
  const M = { color: ctx.C.frame, ...MAT.frame };
  const zChin = A.zFace(A.yChin);
  if (t === 'throat') {
    // のど当て：あごの下から首の芯へ下りる楔（上が前へ、下は芯へすぼまる）
    const w = lerp(0.04, 0.07, p.size), h = lerp(0.04, 0.06, p.size);
    parts.push(H('首・のど当て', [XH(w / 2, 0.003), XL(-w / 2, 0.003), YH(n.y + 0.012), YL(n.y - h, 0.003), ZL(n.z), P([0, 0.35, 1], [0, n.y - 0.01, zChin - 0.03], 0.003), P([0, -1, 0.5], [0, n.y - h, n.z + n.r + 0.01], 0.003), ...both(P([1, -0.5, 0], [w / 2, n.y - 0.01, 0], 0.003))], { ...M, bevel: 0.003 }));
  } else if (t === 'collar') {
    const w = lerp(0.1, 0.16, p.size), h = lerp(0.03, 0.05, p.size);
    parts.push(H('首・あご下の襟', [XH(w / 2, 0.004), XL(-w / 2, 0.004), YH(n.y - 0.01), YL(n.y - 0.01 - h, 0.004), ZL(n.z - 0.02), P([0, 0.5, 1], [0, n.y - 0.01, zChin - 0.02], 0.004), P([0, -1, 0.6], [0, n.y - 0.01 - h, n.z + n.r + 0.02], 0.004), ...both(P([1, -0.3, 0.3], [w / 2, n.y - 0.02, n.z], 0.004))], { color: ctx.C.sub, ...MAT.armor, bevel: 0.004 }));
  } else if (t === 'pipe') {
    const r = n.r * lerp(1.1, 1.35, p.size);
    parts.push(L('首・じゃばら', [[r, -0.09], [r * 0.85, -0.075], [r, -0.06], [r * 0.85, -0.045], [r, -0.03], [r * 0.85, -0.015], [r, 0]], [0, n.y, n.z], { ...M, segments: 16 }));
  }
  return parts;
}

/** 部品の一覧を、エディタの「AIで作る」が読む形の JSON にする */
export function toModelJson(parts, name = '生成した頭') {
  return { format: 'xs-editor-model', version: 1, name, ai: 'xs-editor 頭ジェネレーター', parts: parts.map(p => { const q = { ...p }; delete q.gen; return q; }) };
}
