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
/*  brow：額（目の溝のすぐ上の面）の、中心線の上の 1 点 [高さ y, 前後 z]。額に付くトサカ（部品に brow がある。V 字アンテナ）は、部品の brow の点をここへ合わせる */
const FACE0 = { eye: [0.023, 0.098], mouth: [-0.03, 0.0868, 24], under: [-0.0423, -0.5286], brow: [0.053, 0.1445] };
export const faceOf = shellId => ({ ...FACE0, ...(byId[shellId]?.face ?? {}) });
const D = Math.PI / 180;
// ---- 置いた部品を殻に当てる ----
// トサカ・飾りは「頭の殻」の寸法で置き場所を決めているので、形の違う殻（バイザーの頭は頭頂が低く、前が細い）では殻に届かず浮いた。
// 置いたあと、決まった向き（トサカは下、後ろの飾りは前、横の飾りは内）へ、殻に EMBED だけ入る所まで寄せる。もう入っているものは動かさない。
const EMBED = 0.012;
const VERTS = new WeakMap();
/** 面で囲った形（内側は n·x ≤ d）の頂点と、辺の上の点（辺を 6 つに割る：細い板が平らな面をまたぐときは、頂点どうしでは当たりが分からない） */
function vertsOf(pc) {
  let out = VERTS.get(pc); if (out) return out;
  const pl = pc.planes, n = pl.length; out = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) for (let k = j + 1; k < n; k++) {
    const a = pl[i], b = pl[j], c = pl[k];
    const cx = b[1] * c[2] - b[2] * c[1], cy = b[2] * c[0] - b[0] * c[2], cz = b[0] * c[1] - b[1] * c[0], det = a[0] * cx + a[1] * cy + a[2] * cz;
    if (Math.abs(det) < 1e-9) continue;
    const x = (a[3] * cx + b[3] * (c[1] * a[2] - c[2] * a[1]) + c[3] * (a[1] * b[2] - a[2] * b[1])) / det;
    const y = (a[3] * cy + b[3] * (c[2] * a[0] - c[0] * a[2]) + c[3] * (a[2] * b[0] - a[0] * b[2])) / det;
    const z = (a[3] * cz + b[3] * (c[0] * a[1] - c[1] * a[0]) + c[3] * (a[0] * b[1] - a[1] * b[0])) / det;
    if (pl.every(q => q[0] * x + q[1] * y + q[2] * z <= q[3] + 1e-6) && !out.some(v => Math.abs(v[0] - x) + Math.abs(v[1] - y) + Math.abs(v[2] - z) < 1e-6)) out.push([x, y, z]);
  }
  const on = out.map(v => pl.map((q, i) => (Math.abs(q[0] * v[0] + q[1] * v[1] + q[2] * v[2] - q[3]) < 1e-6 ? i : -1)).filter(i => i >= 0)), nv = out.length;
  for (let i = 0; i < nv; i++) for (let j = i + 1; j < nv; j++) {
    if (on[i].filter(k => on[j].includes(k)).length < 2) continue;   // 2 つの面を共にする頂点の組が辺
    for (let t = 1; t < 6; t++) out.push([0, 1, 2].map(k => out[i][k] + (out[j][k] - out[i][k]) * t / 6));
  }
  VERTS.set(pc, out);
  return out;
}
const solid = def => (def?.pieces ?? []).filter(pc => pc.planes && pc.op !== 'sub' && !pc.blockout);
/** 置いた部品の向き（xsasm.js の rotMatrix と同じ：Y → X → Z の順に掛ける）。行ごとの 3×3 */
function rotOf(rot = [0, 0, 0]) {
  const [x, y, z] = rot.map(v => v * D), cx = Math.cos(x), sx = Math.sin(x), cy = Math.cos(y), sy = Math.sin(y), cz = Math.cos(z), sz = Math.sin(z);
  return [[cy * cz + sy * sx * sz, -cy * sz + sy * sx * cz, sy * cx], [cx * sz, cx * cz, -sx], [-sy * cz + cy * sx * sz, sy * sz + cy * sx * cz, cy * cx]];
}
const toWorld = (it, R, pc, v) => { const s = [0, 1, 2].map(i => (v[i] + pc.pos[i]) * it.scal[i]); return [0, 1, 2].map(i => it.mov[i] + R[i][0] * s[0] + R[i][1] * s[1] + R[i][2] * s[2]); };
/** 体の座標の点 o から向き d へ進むとき、置いた部品 it のブロック pc に入る t（当たらなければ null） */
function enterAt(it, R, pc, o, d) {
  const loc = (v, pt) => { const w = pt ? [0, 1, 2].map(i => v[i] - it.mov[i]) : v; return [0, 1, 2].map(i => (R[0][i] * w[0] + R[1][i] * w[1] + R[2][i] * w[2]) / it.scal[i] - (pt ? pc.pos[i] : 0)); };
  const lo = loc(o, true), ld = loc(d, false);
  let t0 = -Infinity, t1 = Infinity;
  for (const q of pc.planes) {
    const den = q[0] * ld[0] + q[1] * ld[1] + q[2] * ld[2], num = q[3] - (q[0] * lo[0] + q[1] * lo[1] + q[2] * lo[2]);
    if (Math.abs(den) < 1e-12) { if (num < 0) return null; continue; }
    if (den > 0) t1 = Math.min(t1, num / den); else t0 = Math.max(t0, num / den);
    if (t0 > t1) return null;
  }
  return t0;
}
/** 置いた部品 it を、向き d へ、殻に EMBED だけ入る所まで寄せる（殻に届かない向きなら、そのまま） */
function seat(it, shellItem, d) {
  const pd = solid(byId[it.part]), sd = solid(byId[shellItem.part]);
  if (!pd.length || !sd.length) return it;
  const Rp = rotOf(it.rot), Rs = rotOf(shellItem.rot), back = d.map(v => -v);
  let touch = Infinity;
  const take = t => { if (t !== null && t < touch) touch = t; };
  for (const pc of pd) for (const v of vertsOf(pc)) { const w = toWorld(it, Rp, pc, v); for (const sc of sd) take(enterAt(shellItem, Rs, sc, w, d)); }
  for (const sc of sd) for (const v of vertsOf(sc)) { const w = toWorld(shellItem, Rs, sc, v); for (const pc of pd) take(enterAt(it, Rp, pc, w, back)); }
  if (touch === Infinity || touch <= -EMBED) return it;
  return { ...it, mov: it.mov.map((v, i) => v + d[i] * (touch + EMBED)) };
}
/** 殻へ寄せる向き：トサカと頭頂の飾りは下、後ろの飾りは前、横の飾りは内。寄せないものは null */
function seatDir(def, it, shellItem) {
  if (def.brow) return [0, 0, -1];   // 額に付くトサカは後ろへ（額の面へ）
  if (def.cat === 'トサカ' || def.id === 'crest') return [0, -1, 0];
  if (def.cat !== '飾り' || def.id.startsWith('headpipe')) return null;
  if (def.id === 'backfin' || def.id === 'thruster') return [0, 0, 1];
  const side = Math.sign(it.mov[0] - shellItem.mov[0]);
  return side ? [-side, 0, 0] : null;
}

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
    // トサカ：頭頂に置く。額に付くもの（部品に brow がある）は、部品の brow の点を殻の額の点へ（向きは部品のまま。前は頭頂に寝かせて置いていた）
    トサカ: id => {
      const d = byId[id], s = fit(id);
      if (d.brow) return [{ part: id, mov: [mx, my + F.brow[0] * sh - d.brow[0] * s[1] + rnd(-0.01, 0.01), mz + F.brow[1] * sd - d.brow[1] * s[2]], rot: [rnd(-4, 4), 0, 0], scal: s }];
      return [{ part: id, mov: [0, H.top - rnd(0.01, 0.04), rnd(-0.02, 0.06)], rot: [rnd(-10, 25), 0, 0], scal: s }];
    },
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
  return (PLACERS[def.cat] ?? PLACERS['飾り'])(id).map(it => { const d = seatDir(def, it, shellItem); return d ? seat(it, shellItem, d) : it; });
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
