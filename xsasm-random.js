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
/** 頭の殻ごとの「顔の部品を付ける所」（殻の座標。殻の部品の face に書く。無ければ「頭の殻」の値）。
 *  eye：目の溝の奥の壁 [高さ y, 前後 z]。目の部品は、部品の seatZ（部品の座標で、壁に当てる z）をここへ合わせる。
 *  mouth：口もとの面の、中心線の上の 1 点 [高さ y, 前後 z, 面の倒れ（度。上が前へ出る向きが正）]。マスクは、部品の mouth（同じ 3 つを部品の座標で）をここへ合わせ、倒れの差だけ回す。
 *  前は殻が何であっても同じ場所へ置いていて、バイザーの頭では目もマスクも殻の中に埋まった */
/*  under：殻の下面（首の入る所）の高さ y = under[0] + under[1]·z（殻の座標）。首は、置く前後の位置での下面より少し中まで伸ばす
 *  lift：体に載せるとき、殻をこれだけ上へ置く（殻の座標。unitparts.js の headPlace）。底が「頭の殻」より低い殻が、立ち襟に沈まないように */
const FACE0 = { eye: [0.023, 0.098], mouth: [-0.03, 0.0868, 24], under: [-0.0423, -0.5286] };
export const faceOf = shellId => ({ ...FACE0, ...(byId[shellId]?.face ?? {}) });
const D = Math.PI / 180;
/** 部品が頭に合う倍率：部位ごとに「頭のどの寸法の何割」かを決め、部品の size から割り出す。jit は軸ごとのばらつき（0 で一様） */
export function fitScale(id, H, rng = null, jit = 0) {
  const def = byId[id]; if (!def) return [1, 1, 1];
  const rnd = (a, b) => rng ? a + rng() * (b - a) : (a + b) / 2;
  if (def.attach || def.mouth) return [H.sw, H.sh, H.sd];
  const ref = byId[def.fitAs] ?? def;   // fitAs：別の部品と同じ倍率にする（目だけの部品を、枠・帯の付いた部品と同じ大きさで置く）
  const by = (axis, target) => { const s = ref.size?.[axis] || 0.2; const k = target / s; return [k * rnd(1 - jit, 1 + jit), k * rnd(1 - jit, 1 + jit), k * rnd(1 - jit, 1 + jit)]; };
  switch (def.cat) {
    case 'トサカ': return by(1, H.h * rnd(0.3, 0.6));
    case '顔': return id === 'facemask' ? [rnd(0.8, 1.2), rnd(0.8, 1.2), rnd(0.8, 1.2)] : by(0, H.w * rnd(0.45, 0.62));
    case 'マスク': return by(0, H.w * rnd(0.36, 0.44));
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
  const F = faceOf(shellItem.part), [mx, my, mz] = shellItem.mov;
  const PLACERS = {
    頭蓋: id => [{ part: id, mov: shellItem.mov.slice(), rot: [0, 0, 0], scal: [sw, sh, sd] }],
    トサカ: id => [{ part: id, mov: [0, H.top - rnd(0.01, 0.04), rnd(-0.02, 0.06)], rot: [rnd(-10, 25), 0, 0], scal: fit(id) }],
    顔: id => id === 'facemask'
      ? [{ part: id, mov: [0, rnd(-0.05, 0.05), rnd(-0.03, 0.03)], rot: [0, 0, 0], scal: [rnd(0.8, 1.2), rnd(0.8, 1.2), rnd(0.8, 1.2)] }]
      : (() => { const s = fit(id); return [{ part: id, mov: [0, my + F.eye[0] * sh + rnd(-0.008, 0.008), mz + F.eye[1] * sd - (byId[id].seatZ ?? 0) * s[2] + rnd(0, 0.01)], rot: [0, 0, 0], scal: s }]; })(),   // 目は溝の奥の壁に当てる（部品の seatZ を壁へ）
    マスク: id => {
      const d = byId[id];
      if (!d.mouth) return [{ part: id, mov: [0, my + F.mouth[0] * sh + rnd(-0.01, 0.01), mz + F.mouth[1] * sd + rnd(0, 0.01)], rot: [(Math.atan(Math.tan(F.mouth[2] * D) * sd / sh)) / D, 0, 0], scal: fit(id) }];
      // 部品の mouth の点を殻の mouth の点へ。面の倒れの差だけ横軸まわりに回す（倒れは、縦横の倍率が違う分を直してから比べる）
      const lean = l => Math.atan(Math.tan(l * D) * sd / sh);
      const a = lean(F.mouth[2]) - lean(d.mouth[2]), c = Math.cos(a), s = Math.sin(a), y = d.mouth[0] * sh, z = d.mouth[1] * sd;
      return [{ part: id, mov: [mx, my + F.mouth[0] * sh - (y * c - z * s), mz + F.mouth[1] * sd - (y * s + z * c)], rot: [a / D, 0, 0], scal: [sw, sh, sd] }];
    },
    あご: id => id === 'jawblock'
      ? [{ part: id, mov: [0, rnd(-0.22, -0.15), rnd(-0.2, -0.1)], rot: [rnd(0, 15), rng() < 0.5 ? 180 : 0, 0], scal: [rnd(1.8, 2.4), rnd(1, 1.4), rnd(1.1, 1.5)] }]
      : [{ part: id, mov: [0, H.chin + rnd(0.02, 0.05), H.chinFront - rnd(0.0, 0.03)], rot: [rnd(-10, 10), 0, 0], scal: fit(id) }],   // あごの前面に付ける
    // 首：下端は「あごの少し上から、首の長さだけ下」。上端は、首の真上の殻の下面より少し中まで（下面は後ろほど高いので、届かなければ縦に伸ばす）。
    // 前後の位置は殻に合わせる（前は殻をどこへ動かしてあっても同じ場所に置いていて、首が殻の下面に届かず、頭が首から離れることがあった）
    首: id => {
      const s = fit(id), h = byId[id]?.size?.[1] || 0.15, z = mz + 0.125 + rnd(-0.08, -0.02);
      const bottom = H.chin + 0.04 - h * s[1] - (F.lift ?? 0) * sh, roof = my + (F.under[0] + F.under[1] * (z - mz) / sd + 0.008) * sh;   // （上へ置く殻は、その分だけ首を下へ伸ばす：首の付け根は胸の中のまま）
      const top = Math.max(H.chin + 0.04, roof);
      return [{ part: id, mov: [0, bottom, z], rot: [0, 0, 0], scal: [s[0], (top - bottom) / h, s[2]] }];
    },
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
  // 首は必ず付く（首の無い頭は作らない）。首当て（襟）は首に足して付けるもので、ときどき
  const SLOT_ODDS = { 顔: 0.85, マスク: 0.6, あご: 0.7, トサカ: 0.75, 飾り: 0.85, 首: 1, 首当て: 0.3 };
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
