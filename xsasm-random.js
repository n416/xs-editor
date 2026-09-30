// ランダムに頭を組む：頭の殻を 1 つ置き、部位（cat）ごとに部品を選んで、置き場所の目安から少しずらす。
// 画面（xsasm-ui.js）と Node の道具（tools/headgen/asm.mjs）の両方から使う。rng は 0..1 を返す関数（省略時は Math.random）。
// 部品の倍率は「部品の size と、頭に対する狙いの大きさ」から決めるので、部品がどの大きさで作ってあっても頭に合う。
import { PARTS, byId } from './xsasm-parts.js';

// 頭の殻は部品の座標で 幅 ±0.094、高さ −0.074（あご）〜0.146（頂）、奥行き −0.142（後ろ）〜0.152（前）、目の高さ 0.023、まゆ 0.035
export const mirrorOf = it => ({ ...it, mov: [-it.mov[0], it.mov[1], it.mov[2]], rot: [it.rot[0], -it.rot[1], -it.rot[2]], scal: [-it.scal[0], it.scal[1], it.scal[2]], name: (it.name ?? byId[it.part]?.name ?? it.part) + '（鏡像）' });

/** 頭の殻の置き方（倍率）から頭の寸法。殻は部品の座標で 幅 ±0.094、高さ −0.074〜0.146、奥行き −0.142〜0.152、目の高さ 0.023、まゆ 0.035 */
export function headDims(shellItem) {
  const [sw, sh, sd] = (shellItem?.scal ?? [1, 1, 1]).map(Math.abs);
  const mz = shellItem?.mov?.[2] ?? 0, my = shellItem?.mov?.[1] ?? 0;
  return { sw, sh, sd, w: 0.188 * sw, h: 0.22 * sh, d: 0.294 * sd, top: 0.146 * sh + my, chin: -0.074 * sh + my, eye: 0.023 * sh + my, brow: 0.035 * sh + my, side: 0.094 * sw, front: 0.152 * sd + mz, chinFront: 0.068 * sd + mz, back: -0.142 * sd + mz };   // chinFront はあごの前面
}
/** 部品が頭に合う倍率：部位ごとに「頭のどの寸法の何割」かを決め、部品の size から割り出す。jit は軸ごとのばらつき（0 で一様） */
export function fitScale(id, H, rng = null, jit = 0) {
  const def = byId[id]; if (!def) return [1, 1, 1];
  const rnd = (a, b) => rng ? a + rng() * (b - a) : (a + b) / 2;
  if (def.attach) return [H.sw, H.sh, H.sd];
  const by = (axis, target) => { const s = def.size?.[axis] || 0.2; const k = target / s; return [k * rnd(1 - jit, 1 + jit), k * rnd(1 - jit, 1 + jit), k * rnd(1 - jit, 1 + jit)]; };
  switch (def.cat) {
    case 'トサカ': return by(1, H.h * rnd(0.3, 0.6));
    case '顔': return id === 'facemask' ? [rnd(0.8, 1.2), rnd(0.8, 1.2), rnd(0.8, 1.2)] : by(0, H.w * rnd(0.45, 0.62));
    case 'あご': return id === 'jawblock' ? [rnd(1.8, 2.4), rnd(1, 1.4), rnd(1.1, 1.5)] : by(0, H.w * rnd(0.3, 0.4));   // あご当ては頭の幅の 3 割ほど
    case '首': return by(1, H.h * rnd(0.3, 0.42));
    case '飾り':
      if (id === 'fin') return by(2, H.d * rnd(1.2, 1.7));
      if (id === 'crest') return by(2, H.d * rnd(0.7, 1.0));
      if (id === 'backfin') return by(1, H.h * rnd(0.35, 0.55));
      if (id === 'thruster') return by(1, H.h * rnd(0.2, 0.3));
      if (id.startsWith('headpipecheek')) return by(2, H.d * rnd(0.6, 0.75));   // 頬の動力パイプ：頭の奥行きの 6〜7 割の長さ
      if (id === 'headpipemouth') return by(2, H.d * rnd(0.35, 0.45));
      return by(1, H.h * rnd(0.3, 0.45));
    case '頭蓋': return [H.sw, H.sh, H.sd];
    default: return by(1, H.h * rnd(0.3, 0.45));
  }
}

/** 部品 id を、頭の殻 shellItem に合わせて置く（1 個か、左右の対なら 2 個）。rng を () => 0.5 にすると目安の真ん中に置く */
export function placementsFor(id, shellItem, rng = Math.random) {
  const rnd = (a, b) => a + rng() * (b - a);
  const H = headDims(shellItem);
  const [sw, sh, sd] = shellItem.scal.map(Math.abs);
  const fit = id => fitScale(id, H, rng, 0.15);
  const attachTo = id => { const a = byId[id].attach; return { part: id, mov: [shellItem.mov[0] + a[0] * sw, shellItem.mov[1] + a[1] * sh, shellItem.mov[2] + a[2] * sd], rot: [0, 0, 0], scal: [sw, sh, sd] }; };
  const def = byId[id];
  if (!def) return [{ part: id, mov: [0, 0, 0], rot: [0, 0, 0], scal: [1, 1, 1] }];
  if (def.attach) return [attachTo(id)];
  const PLACERS = {
    頭蓋: id => [{ part: id, mov: shellItem.mov.slice(), rot: [0, 0, 0], scal: [sw, sh, sd] }],
    トサカ: id => [{ part: id, mov: [0, H.top - rnd(0.01, 0.04), rnd(-0.02, 0.06)], rot: [rnd(-10, 25), 0, 0], scal: fit(id) }],
    顔: id => id === 'facemask'
      ? [{ part: id, mov: [0, rnd(-0.05, 0.05), rnd(-0.03, 0.03)], rot: [0, 0, 0], scal: [rnd(0.8, 1.2), rnd(0.8, 1.2), rnd(0.8, 1.2)] }]
      : [{ part: id, mov: [0, H.eye + rnd(-0.02, 0.02), H.front - rnd(0.1, 0.16)], rot: [0, 0, 0], scal: fit(id) }],   // 目は溝の中に沈める
    あご: id => id === 'jawblock'
      ? [{ part: id, mov: [0, rnd(-0.22, -0.15), rnd(-0.2, -0.1)], rot: [rnd(0, 15), rng() < 0.5 ? 180 : 0, 0], scal: [rnd(1.8, 2.4), rnd(1, 1.4), rnd(1.1, 1.5)] }]
      : [{ part: id, mov: [0, H.chin + rnd(0.02, 0.05), H.chinFront - rnd(0.0, 0.03)], rot: [rnd(-10, 10), 0, 0], scal: fit(id) }],   // あごの前面に付ける
    首: id => { const s = fit(id); const top = (byId[id]?.size?.[1] || 0.15) * s[1]; return [{ part: id, mov: [0, H.chin + 0.04 - top, rnd(-0.08, -0.02)], rot: [0, 0, 0], scal: s }]; },   // 首の上端をあごの少し中に
    飾り: id => {
      if (id === 'fin') { const it = { part: id, mov: [H.side + rnd(-0.05, 0.05), rnd(0.1, 0.25), rnd(-0.05, 0.05)], rot: [rnd(-40, 0), rnd(0, 20), rnd(-120, -90)], scal: fit(id) }; return [it, mirrorOf(it)]; }
      if (id === 'crest') return [{ part: id, mov: [0, H.top - rnd(0.05, 0.12), rnd(0, 0.05)], rot: [rnd(10, 30), 0, 0], scal: fit(id) }];
      if (id === 'backfin') return [{ part: id, mov: [0, H.top - rnd(0.08, 0.2), H.back + rnd(0.0, 0.05)], rot: [rnd(-10, 10), 0, 0], scal: fit(id) }];
      if (id === 'thruster') { const it = { part: id, mov: [H.side - rnd(0.05, 0.12), rnd(0.0, 0.15), H.back + rnd(0.0, 0.05)], rot: [0, rnd(-20, 20), 0], scal: fit(id) }; return [it, mirrorOf(it)]; }
      // 動力パイプ：頬は頭の横の下寄りに前後に沿わせ、口から首へは口の前から左右へ（どちらも左右の対）
      if (id.startsWith('headpipecheek')) { const it = { part: id, mov: [H.side - rnd(0.0, 0.03), H.chin + H.h * rnd(0.2, 0.32), (H.front + H.back) / 2 + rnd(0.0, 0.05)], rot: [rnd(-8, 8), 0, 0], scal: fit(id) }; return [it, mirrorOf(it)]; }
      if (id === 'headpipemouth') { const it = { part: id, mov: [0.02, H.chin + H.h * rnd(0.1, 0.18), H.chinFront - rnd(0.0, 0.04)], rot: [0, 0, 0], scal: fit(id) }; return [it, mirrorOf(it)]; }
      const it = { part: id, mov: [H.side - rnd(0.0, 0.04), H.eye + rnd(-0.08, 0.04), rnd(-0.06, 0.02)], rot: [0, rnd(-10, 10), rnd(-10, 10)], scal: fit(id) };   // 耳ブロック・頬当てなど、横に付くもの
      return [it, mirrorOf(it)];
    },
  };
  return (PLACERS[def.cat] ?? PLACERS['飾り'])(id);
}

export function randomHead(rng = Math.random, parts = PARTS) {
  const rnd = (a, b) => a + rng() * (b - a);
  const pick = arr => arr[Math.floor(rng() * arr.length)];
  const shells = parts.filter(p => p.cat === '頭蓋');
  const sw = rnd(2.6, 3.4), sh = rnd(2.8, 3.4), sd = rnd(2.0, 2.4);
  const shell = pick(shells);
  const shellItem = { part: shell.id, mov: [0, 0, -0.125], rot: [0, 0, 0], scal: [sw, sh, sd] };
  const SLOT_ODDS = { 顔: 0.85, あご: 0.7, トサカ: 0.75, 飾り: 0.85, 首: 0.9 };
  const out = [shellItem];
  for (const [cat, odds] of Object.entries(SLOT_ODDS)) {
    const cands = parts.filter(p => p.cat === cat);
    if (!cands.length || rng() > odds) continue;
    const n = cat === '飾り' && rng() < 0.4 ? 2 : 1;   // 飾りは 2 種類付くこともある
    const used = new Set();
    for (let k = 0; k < n; k++) { const d = pick(cands); if (used.has(d.id)) continue; used.add(d.id); out.push(...placementsFor(d.id, shellItem, rng)); }
  }
  return out;
}

/** 種から決まる乱数（mulberry32）：同じ種なら同じ頭 */
export function makeRng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
