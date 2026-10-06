// ランダムに頭を組む：頭の殻を 1 つ置き、部位（cat）ごとに部品を選んで、置き場所の目安から少しずらす。
// 画面（xsasm-ui.js）と Node の道具（tools/headgen/asm.mjs）の両方から使う。rng は 0..1 を返す関数（省略時は Math.random）。
// 部品の倍率は「部品の size と、頭に対する狙いの大きさ」から決めるので、部品がどの大きさで作ってあっても頭に合う。
import { PARTS, byId } from './xsasm-parts.js';
import { f1HeadSample } from './parts/index.js';

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
// ---- 目の溝の広さ ----
// ツインアイは、殻の幅の決まった割合（45〜62%）で置いていた。溝の広さは殻ごとに違う（殻の幅の 46〜88%）ので、どの殻でも溝の半分ほどしか無く、
// 両脇に暗い溝が余った（依頼主：「ツインアイの横幅どう考えてもせまくって」）。殻の形から溝の広さを測り、それに合わせる。
// 幅：目の外の端（tip）を、溝の幅の決まった割合の所に置く。割合は、奥の壁が横へ回り込む殻と、平らな殻で違う。依頼主の 2 つの置き方から決めた：
//   F1 型の頭（parts/f1.js の見本）：溝は頭の横まで回り込む（半分の幅 0.084、壁は端で中央より 10 cm 奥）。目の外の端は 0.060 ＝ 溝の EYE_SPAN 倍
//   ひさしの頭（2026-10-07 に画面で合わせた倍率 2.1）：壁は平らで、目の外の端は窓の端の少し内（窓の半分の幅 0.050 の EYE_WIN 倍）
//   壁が回り込むかどうか：溝の中で、壁が中央より EYE_TURN 以上奥へ下がる所があるか
//   （最初は「溝の幅の 85%」にしたが、F1 型にしか合わず、ひさしの頭では前より小さくなった：「２倍にしてようやくこれですよ？」）
// 高さ：目の高さは溝の高さの 89%（F1 型の頭から）
const EYE_TURN = 0.03, EYE_SPAN = 0.72, EYE_WIN = 0.95, EYE_TALL = 0.89, EYE_IN = 0.003;   // （EYE_IN：殻の座標。[独自]）
const OPEN = new Map();
const darkPiece = pc => { if (pc.glow) return true; const n = parseInt(String(pc.color ?? '#888888').slice(1), 16); return ((n >> 16) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11) / 255 < 0.2; };
/** 殻の座標で、正面（+z の遠く）から点 (x, y) を見たとき最初に見えるブロックと、その面の z（無ければ null） */
function seenAt(def, x, y) {
  const it = { mov: [0, 0, 0], scal: [1, 1, 1] }, I = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  let best = null, tb = Infinity;
  for (const pc of solid(def)) { const t = enterAt(it, I, pc, [x, y, 1], [0, 0, -1]); if (t !== null && t < tb) { tb = t; best = pc; } }
  return best && { pc: best, z: 1 - tb };
}
/** 目の溝（正面から見て暗い所：溝の奥の壁・はめ込みの目。壁の横の、ずっと奥が見えているすき間も溝のうち）の広さ。殻の座標で { half: 中心からの幅, tip: 目の外の端を置く所, y0, y1: 幅の 1/4 の所での下の端・上の端,
 *  depth: 溝の深さ（幅の 1/4 の所で、溝のすぐ上・すぐ下の面のうち奥の方から、奥の壁まで。上下に面が無ければ 0） }。溝の無い殻は null */
export function eyeOpening(shellId) {
  if (OPEN.has(shellId)) return OPEN.get(shellId);
  const def = byId[shellId], y = faceOf(shellId).eye[0], dark = (x, yy) => { const s = seenAt(def, x, yy); return !!s && darkPiece(s.pc); };
  // 中心から外へ：暗い壁が続く間と、壁より 2 cm 以上奥が見えている間は溝。壁と同じ深さか手前に明るい面が出たら、そこが端
  const s0 = seenAt(def, 0, y); let half = 0, wallZ = s0 && darkPiece(s0.pc) ? s0.z : null, turn = null;
  while (wallZ !== null && half < 0.3) {
    const s = seenAt(def, half + 0.002, y); if (!s) break;
    if (darkPiece(s.pc)) { wallZ = s.z; if (turn === null && s0.z - s.z > EYE_TURN) turn = half; } else if (s.z > wallZ - 0.02) break;
    half += 0.002;
  }
  let out = null;
  if (half >= 0.02) { const q = Math.min(half, turn ?? half) / 2; let y0 = y, y1 = y; while (y - y0 < 0.08 && dark(q, y0 - 0.001)) y0 -= 0.001; while (y1 - y < 0.08 && dark(q, y1 + 0.001)) y1 += 0.001; const wall = seenAt(def, q, (y0 + y1) / 2), lips = [seenAt(def, q, y1 + 0.003), seenAt(def, q, y0 - 0.003)];
    out = { half, tip: (turn === null ? EYE_WIN : EYE_SPAN) * half, y0, y1, depth: wall && lips.every(Boolean) ? Math.max(0, Math.min(...lips.map(l => l.z)) - wall.z) : 0 }; }
  OPEN.set(shellId, out);
  return out;
}
// ---- 両端を殻に入れる（頬の動力パイプ） ----
// 頭は前へ行くほど細い。管を頭の横の決まった位置にまっすぐ置くと、前の端が頬の前で宙に浮いた。
// 殻の横の面を管の両端の所で測り、両端が同じだけ中に入る向き（縦軸まわり）と左右の位置にする。前の端が殻から外れる所では、当たる所まで後ろへずらす
/** 体の座標で、+x の遠くから点 (y, z) を見たとき、殻の面の x（当たらなければ null） */
function sideAt(shellItem, y, z) {
  const R = rotOf(shellItem.rot); let tb = Infinity;
  for (const pc of solid(byId[shellItem.part])) { const t = enterAt(shellItem, R, pc, [5, y, z], [-1, 0, 0]); if (t !== null && t < tb) tb = t; }
  return tb === Infinity ? null : 5 - tb;
}
function seatEnds(it0, shellItem) {
  // あごの高さで殻が細いくさび形の頭（頭の殻・F1 型）では、その高さに合わせると管がほとんど殻の中に隠れた。向きが 25° を超えるか、8 割より縮むなら、3 cm ずつ上の高さで置き直す（12 cm まで）
  let pick = null;
  for (let up = 0; up <= 0.121; up += 0.03) {
    const r = seatEndsAt({ ...it0, mov: [it0.mov[0], it0.mov[1] + up, it0.mov[2]] }, shellItem), bad = Math.abs(r.rot[1]) > 25 || Math.abs(r.scal[2]) < 0.8 * Math.abs(it0.scal[2]) || r.unseated;
    if (!bad) return r;
    if (!pick || Math.abs(r.rot[1]) < Math.abs(pick.rot[1])) pick = r;
  }
  return pick;
}
function seatEndsAt(it, shellItem) {
  const def = byId[it.part], pc0 = { pos: [0, 0, 0] };
  // 管の高さで殻のある前後の範囲を測り、管がそれより長ければ、収まる長さ（範囲の 92%）まで全体を縮めて、範囲のまん中へ（頭の殻は、あごの高さでは前後が短い：そのままだと両端とも殻から外れて、管が宙に浮いた）
  { const zs = []; for (let z = it.mov[2] + 0.5; z >= it.mov[2] - 0.5; z -= 0.01) if (sideAt(shellItem, it.mov[1], z) !== null) zs.push(z);
    if (zs.length > 4) { const len = Math.abs(def.ends[0][2] - def.ends[1][2]), span = zs[0] - zs[zs.length - 1], k = Math.min(Math.abs(it.scal[2]), 0.92 * span / len);
      it = { ...it, mov: [it.mov[0], it.mov[1], (zs[0] + zs[zs.length - 1]) / 2 - k * (def.ends[0][2] + def.ends[1][2]) / 2], scal: it.scal.map(v => Math.sign(v) * k) }; } }
  const gap = (z, yaw) => {   // 両端それぞれの「殻の面より外に出ている量」。どちらかが殻に当たらなければ null
    const t = { ...it, mov: [it.mov[0], it.mov[1], z], rot: [it.rot[0], yaw, it.rot[2]] }, R = rotOf(t.rot);
    const g = def.ends.map(e => { const w = toWorld(t, R, pc0, e), sx = sideAt(shellItem, w[1], w[2]); return sx === null ? null : w[0] - sx; });
    return g.includes(null) ? null : g;
  };
  // 後ろへ 2 cm ずつずらしながら、両端の入り方の差がいちばん小さい向きを探す。差が 1 cm より小さくなった所で決める（無ければ、差がいちばん小さかった所）
  let best = null;
  for (let back = 0; back <= 0.3 && !(best && best.d < 0.01); back += 0.02) {
    const z = it.mov[2] - back;
    for (let yaw = -45; yaw <= 45; yaw += 1) { const g = gap(z, yaw); if (g && (!best || Math.abs(g[0] - g[1]) < best.d)) best = { d: Math.abs(g[0] - g[1]), yaw, g, z }; }
  }
  if (!best) return { ...it, unseated: true };
  return { ...it, mov: [it.mov[0] - Math.max(best.g[0], best.g[1]) - def.endIn * Math.abs(it.scal[0]), it.mov[1], best.z], rot: [it.rot[0], best.yaw, it.rot[2]] };   // （外に出ている方の端を基準に：どちらの端も中に入る）
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
  if (def.attach || def.mouth || def.shellFit) return [H.sw, H.sh, H.sd];   // shellFit：殻に合わせて作ってある部品（殻と同じ倍率で置く）
  const ref = byId[def.fitAs] ?? def;   // fitAs：別の部品と同じ倍率にする（目だけの部品を、枠・帯の付いた部品と同じ大きさで置く）
  const by = (axis, target) => { const s = ref.size?.[axis] || 0.2; const k = target / s; return [k * rnd(1 - jit, 1 + jit), k * rnd(1 - jit, 1 + jit), k * rnd(1 - jit, 1 + jit)]; };
  switch (def.cat) {
    case 'トサカ': case 'アンテナ（額）': case 'アンテナの中央（額）': return by(1, H.h * rnd(0.3, 0.6));
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
  if (def.attach) { const it = attachTo(id); return def.pairs ? [it, mirrorOf(it)] : [it]; }   // pairs：左右の対（右を作ってあり、左は鏡像）
  const F = faceOf(shellItem.part), [mx, my, mz] = shellItem.mov;
  // 額に付く部品（アンテナの刃・一本角・中央の部品）：部品の brow の点を殻の額の点へ。倍率は軸ごとに変えない（刃と中央の部品を重ねて置くと合うように）。
  // pairs のある部品（刃）は右を作ってあり、左右の 2 つを別々に置く（片方を消せば片側だけ）
  const browAt = id => {
    const d = byId[id], k = fitScale(id, H, rng, 0)[1], s = [k, k, k];
    const it = { part: id, mov: [0, my + F.brow[0] * sh - d.brow[0] * k + rnd(-0.01, 0.01), mz + F.brow[1] * sd - d.brow[1] * k], rot: [rnd(-4, 4), 0, 0], scal: s };
    return d.pairs ? [it, mirrorOf(it)] : [it];
  };
  const PLACERS = {
    頭蓋: id => [{ part: id, mov: shellItem.mov.slice(), rot: [0, 0, 0], scal: [sw, sh, sd] }],
    // トサカ：頭頂に置く。額に付くもの（部品に brow がある）は額へ（前はどのトサカも頭頂に置いていて、V 字アンテナが頭の真ん中から生えていた）
    トサカ: id => (byId[id].brow ? browAt(id) : [{ part: id, mov: [0, H.top - rnd(0.01, 0.04), rnd(-0.02, 0.06)], rot: [rnd(-10, 25), 0, 0], scal: fit(id) }]),
    'アンテナ（額）': id => browAt(id),
    'アンテナの中央（額）': id => browAt(id),
    顔: id => id === 'facemask'
      ? [{ part: id, mov: [0, rnd(-0.05, 0.05), rnd(-0.03, 0.03)], rot: [0, 0, 0], scal: [rnd(0.8, 1.2), rnd(0.8, 1.2), rnd(0.8, 1.2)] }]
      : (() => {
        // 溝に合わせる目（部品に eyeH：目の高さ。ツインアイ）：幅は溝の幅から、高さは溝の高さから。前後は幅と同じ倍率（八の字の折れ角を変えない）。
        // 高さが溝で決まるときは溝の上下の真ん中へ、溝が目より十分高い殻（ひさしの頭の大きな窓）では殻の face.eye の高さへ。
        // 前後：奥の壁に当てると、大きくした分だけ枠の前の面が溝から出て、殻の面の上に枠が浮いて見えた。前の面が溝の縁より EYE_IN 奥に収まる所まで、奥へ入れる（溝に上下の面がある殻だけ）
        const O = (byId[def.fitAs] ?? def).eyeH ? eyeOpening(shellItem.part) : null;
        if (O) {
          const ref = byId[def.fitAs] ?? def, kx = O.tip * sw / ref.eyeTip, kt = EYE_TALL * (O.y1 - O.y0) * sh / ref.eyeH, ky = Math.min(kx, kt);
          return [{ part: id, mov: [mx, my + (kt < kx ? (O.y0 + O.y1) / 2 : F.eye[0]) * sh, mz + F.eye[1] * sd - (def.seatZ ?? 0) * kx - (O.depth ? Math.max(0, ((ref.frontZ ?? 0) - (def.seatZ ?? 0)) * kx - (O.depth - EYE_IN) * sd) : 0)], rot: [0, 0, 0], scal: [kx, ky, kx] }];
        }
        const s = fit(id); return [{ part: id, mov: [0, my + F.eye[0] * sh + rnd(-0.008, 0.008), mz + F.eye[1] * sd - (byId[id].seatZ ?? 0) * s[2] + rnd(0, 0.01)], rot: [0, 0, 0], scal: s }];   // 目は溝の奥の壁に当てる（部品の seatZ を壁へ）
      })(),
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
      if (id.startsWith('headpipecheek')) { const k = fitScale(id, H, rng, 0)[2], it = seatEnds({ part: id, mov: [H.side - rnd(0.0, 0.03), H.chin + H.h * rnd(0.2, 0.32), (H.front + H.back) / 2 + rnd(0.0, 0.05)], rot: [rnd(-8, 8), 0, 0], scal: [k, k, k] }, shellItem); return [it, mirrorOf(it)]; }   // （倍率は軸ごとに変えない：管の輪がつぶれない）
      if (id === 'headpipemouth') { const it = { part: id, mov: [0.02, H.chin + H.h * rnd(0.1, 0.18), H.chinFront - rnd(0.0, 0.04)], rot: [0, 0, 0], scal: fit(id) }; return [it, mirrorOf(it)]; }
      const it = { part: id, mov: [H.side - rnd(0.0, 0.04), H.eye + rnd(-0.08, 0.04), rnd(-0.06, 0.02)], rot: [0, rnd(-10, 10), rnd(-10, 10)], scal: fit(id) };   // 耳ブロック・頬当てなど、横に付くもの
      return [it, mirrorOf(it)];
    },
  };
  return (PLACERS[def.cat] ?? PLACERS['飾り'])(id).map(it => { const d = seatDir(def, it, shellItem); return d ? seat(it, shellItem, d) : it; });
}

// F1 型の殻の口もと：見本の F1 型の頭（依頼主が組んだ頭。parts/f1.js）と同じ組（マスク・あご・ほほガード 2 枚）を、見本と同じ所に付ける（依頼主：「F1型の殻には見本と同じ組を付けて」）。
// 殻の大きさが見本と違う分は、殻からの位置と倍率を軸ごとに合わせる
const F1_SHELL = 'headshellplainf1', F1_MOUTH = new Set(['maska', 'chinaf1', 'peakcheek']);
function f1Mouth(shellItem) {
  const s0 = f1HeadSample.find(it => it.part === F1_SHELL), k = [0, 1, 2].map(i => Math.abs(shellItem.scal[i]) / Math.abs(s0.scal[i]));
  return f1HeadSample.filter(it => F1_MOUTH.has(it.part)).map(it => ({ part: it.part, mov: it.mov.map((v, i) => shellItem.mov[i] + (v - s0.mov[i]) * k[i]), rot: (it.rot ?? [0, 0, 0]).slice(), scal: it.scal.map((v, i) => v * k[i]) }));
}
export function randomHead(rng = Math.random, parts = PARTS) {
  const rnd = (a, b) => a + rng() * (b - a);
  const pick = arr => arr[Math.floor(rng() * arr.length)];
  const shells = parts.filter(p => p.cat === '頭蓋' && !p.retired);
  const sw = rnd(2.6, 3.4), sh = rnd(2.8, 3.4), sd = rnd(2.0, 2.4);
  const shell = pick(shells);
  const shellItem = { part: shell.id, mov: [0, 0, -0.125], rot: [0, 0, 0], scal: [sw, sh, sd] };
  // 首は必ず付く（首の無い頭は作らない）。首当て（襟）は首に足して付けるもので、ときどき
  const SLOT_ODDS = { 顔: 0.85, マスク: 0.6, あご: 0.7, トサカ: 0.5, 'アンテナ（額）': 0.4, 頭の上の装備: 0.12, 飾り: 0.85, 首: 1, 首当て: 0.3 };
  const f1 = shell.id === F1_SHELL, out = [shellItem, ...(f1 ? f1Mouth(shellItem) : [])];
  for (const [cat, odds] of Object.entries(SLOT_ODDS)) {
    if (f1 && (cat === 'マスク' || cat === 'あご')) continue;   // （F1 型の殻：口もとはもう付けた）
    let cands = parts.filter(p => p.cat === cat && !p.retired && (!p.only || p.only.includes(shell.id)));
    // 目：目なしの殻には必ず目を 1 つ（前は 15% で付かず、顔当てが選ばれることもあって、目の無い頭ができた）。目の付いた殻には足さない（前は足していて、目が 2 組になった）
    const eyeless = /plain/.test(shell.id), isEye = p => /^(twineyes|monoeye)/.test(p.id) || p.id === 'peakvisor';
    if (cat === '顔') { if (!eyeless) continue; cands = cands.filter(isEye); }
    if (f1 && cat === '飾り') cands = cands.filter(p => !p.id.startsWith('headpipe'));   // （口もとにほほガードがあるので、顔の動力パイプは付けない）
    if (!cands.length || (rng() > odds && !(cat === '顔' && eyeless))) continue;
    const n = cat === '飾り' && rng() < 0.4 ? 2 : 1;   // 飾りは 2 種類付くこともある
    const used = new Set();
    for (let k = 0; k < n; k++) {
      const d = pick(cands); if (used.has(d.id)) continue; used.add(d.id);
      const placed = placementsFor(d.id, shellItem, rng); out.push(...placed);
      // 額のアンテナには、中央の部品を 1 つ、同じ位置・向き・倍率で付ける（刃の根元を覆う）
      const cores = cat === 'アンテナ（額）' ? parts.filter(p => p.cat === 'アンテナの中央（額）') : [];
      if (cores.length && placed[0]) { const b = placed[0]; out.push(seat({ part: pick(cores).id, mov: [0, b.mov[1], b.mov[2]], rot: b.rot.slice(), scal: b.scal.map(Math.abs) }, shellItem, [0, 0, -1])); }
    }
  }
  return out;
}

/** 種から決まる乱数（mulberry32）：同じ種なら同じ頭 */
export function makeRng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
