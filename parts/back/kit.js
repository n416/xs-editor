// 背中（バックパック・その装備・翼・翼の装備）の部品を作る道具。部品は凸の塊（hull）の寄せ集め。
// 形は自分の向き（軸は +y）で作り、xf() で回して置く。回転は組み立てと同じ順（度。先に z、次に x、最後に y）。
import { P, planesFromPoints, piece, DARK, BLACK } from '../../xsasm-lib.js';

const R = Math.PI / 180;
export const hull = (name, pts, o = {}) => piece(name, planesFromPoints(pts), o);

// ---- 置く：回す・拡大する・動かす ----
const mul = (A, B) => A.map(r => [0, 1, 2].map(j => r[0] * B[0][j] + r[1] * B[1][j] + r[2] * B[2][j]));
const app = (M, v) => M.map(r => r[0] * v[0] + r[1] * v[1] + r[2] * v[2]);
/** 回転の行列（度）：Ry · Rx · Rz */
export function rotM([rx = 0, ry = 0, rz = 0] = []) {
  const [cx, sx, cy, sy, cz, sz] = [rx, ry, rz].flatMap(a => [Math.cos(a * R), Math.sin(a * R)]);
  return mul(mul([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]], [[1, 0, 0], [0, cx, -sx], [0, sx, cx]]), [[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]]);
}
const scl3 = s => (Array.isArray(s) ? s : [s ?? 1, s ?? 1, s ?? 1]);
/** 点を置く：p' = R · (S p) + mov */
export function xfPt(p, { rot, mov = [0, 0, 0], scale } = {}) {
  const s = scl3(scale), q = app(rotM(rot), [p[0] * s[0], p[1] * s[1], p[2] * s[2]]);
  return [q[0] + mov[0], q[1] + mov[1], q[2] + mov[2]];
}
export const xfPts = (pts, t) => pts.map(p => xfPt(p, t));
/** 面を置く（点と同じ置き方） */
export function xfPlanes(planes, { rot, mov = [0, 0, 0], scale } = {}) {
  const s = scl3(scale), M = rotM(rot);
  return planes.map(pl => {
    const n = app(M, [pl[0] / s[0], pl[1] / s[1], pl[2] / s[2]]), l = Math.hypot(...n), u = n.map(v => v / l);
    return [u[0], u[1], u[2], pl[3] / l + u[0] * mov[0] + u[1] * mov[1] + u[2] * mov[2]];
  });
}
/** 部品（piece）の並びを置く。o は足す値（色など） */
export const xf = (pieces, t, o = {}) => pieces.map(pc => ({ ...pc, ...o, planes: xfPlanes(pc.planes, t) }));
/** +x 側の部品の並びと、その x の鏡像（名前の「+x」を「−x」に。無ければ「（−x）」を足す） */
export const mirrorX = pieces => pieces.map(pc => ({ ...pc, name: pc.name.includes('+x') ? pc.name.replace('+x', '−x') : `${pc.name}（−x）`, planes: pc.planes.map(p => [-p[0], p[1], p[2], p[3]]) }));
export const bothX = pieces => [...pieces, ...mirrorX(pieces)];
/** 名前の頭に付ける */
export const named = (prefix, pieces) => pieces.map(pc => ({ ...pc, name: `${prefix}${pc.name}` }));

// ---- 回転体（軸は +y、n 角。r は面までの距離） ----
/** 外へふくらんだ（凸の）輪郭 [[y, r], …] の回転体の面。下から上へ */
export function lathePlanes(prof, n = 12, th0 = 0) {
  const out = [P([0, -1, 0], [0, prof[0][0], 0]), P([0, 1, 0], [0, prof[prof.length - 1][0], 0])];
  for (let i = 0; i + 1 < prof.length; i++) {
    const [y0, r0] = prof[i], [y1, r1] = prof[i + 1], dy = y1 - y0, dr = r1 - r0;
    if (Math.abs(dy) < 1e-9) continue;
    for (let k = 0; k < n; k++) { const t = (th0 + k * 360 / n) * R, e = [Math.sin(t), 0, Math.cos(t)]; out.push(P([e[0] * dy, -dr, e[2] * dy], [e[0] * r0, y0, e[2] * r0])); }
  }
  return out;
}
/**
 * 回転体：輪郭 [[y, r, 色?], …] を、凸の所ごとに分けて部品にする（くびれ・段・帯があってよい）。
 * 色は「その点から上の区間」の色（無ければ o.color）
 */
export function lathe(name, prof, { n = 12, th0 = 0, ...o } = {}) {
  const runs = [];
  let run = [prof[0]], slope = Infinity;
  for (let i = 0; i + 1 < prof.length; i++) {
    const [y0, r0, c0] = prof[i], [y1, r1] = prof[i + 1];
    if (Math.abs(y1 - y0) < 1e-9) { if (run.length > 1) runs.push(run); run = [prof[i + 1]]; slope = Infinity; continue; }   // 段：そこで切る
    const s = (r1 - r0) / (y1 - y0), col = c0 ?? null;
    if (run.length > 1 && (s > slope + 1e-9 || col !== (run.col ?? null))) { runs.push(run); run = [prof[i]]; }
    run.col = col; run.push(prof[i + 1]); slope = s;
  }
  if (run.length > 1) runs.push(run);
  return runs.map((r, i) => piece(runs.length > 1 ? `${name} ${i + 1}` : name, lathePlanes(r, n, th0), { ...o, ...(r.col ? { color: r.col } : {}) }));
}
/**
 * 中が空いた噴射口（鐘形）。口は −y を向く：付け根 y 0（外の半径 r0）から、口 y −len（r1）へ広がる。途中 mid（0〜1）で rm。
 * n 枚の殻、奥の黒いのど、のどの光（glow の色があれば）、付け根の輪
 */
export function bell(name, { len = 0.09, r0 = 0.045, r1 = 0.066, rm = null, mid = 0.45, t = 0.012, n = 12, glow = null, collar = true } = {}) {
  const out = [], m = rm ?? r0 + (r1 - r0) * 0.72;
  const rings = [[0, r0], [-len * mid, m], [-len, r1]];
  for (let k = 0; k < n; k++) {
    const pts = [];
    for (const a of [(k - 0.08) * 360 / n, (k + 1.08) * 360 / n]) { const s = Math.sin(a * R), c = Math.cos(a * R); for (const [y, r] of rings) pts.push([r * s, y, r * c], [(r - t) * s, y, (r - t) * c]); }
    out.push(hull(`${name}の殻 ${k + 1}`, pts, { color: DARK }));
  }
  out.push(piece(`${name}ののど`, lathePlanes([[-len * 0.3, r0 - t + 0.003], [0.004, r0 - t + 0.003]], n), { color: BLACK }));
  if (glow) out.push(piece(`${name}の光`, lathePlanes([[-len * 0.42, 0], [-len * 0.3 - 0.002, (r0 - t) * 0.8], [-len * 0.3 + 0.004, (r0 - t) * 0.8]], n), { color: glow, glow: true }));
  if (collar) out.push(piece(`${name}の付け根`, lathePlanes([[-0.006, r0 + 0.006], [0.012, r0 + 0.01], [0.03, r0 + 0.004]], n), { color: DARK }));
  return out;
}

// ---- 帯：前の縁と後ろの縁を持つ板を、断面（station）ごとにつないで作る（翼・羽・ひれ・膜・リボン） ----
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], mulS = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const unit = v => { const l = Math.hypot(...v) || 1; return v.map(x => x / l); };
export const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
/**
 * 帯：断面の並び [{ a: 前の縁の点, b: 後ろの縁の点, t: いちばん厚い所の厚み, k: 厚い所の位置（a から b へ 0〜1、既定 0.35）, color? }]。
 * 断面はひし形（縁は薄く、稜が厚い）なので、広い面がどれも板の面から傾く。隣の断面どうしを 1 つの凸の部品にする。
 * 色は断面ごとに変えられる（その断面から次の断面までの色）。
 */
export function strip(name, sts, o = {}) {
  const mid = s => lerp3(s.a, s.b, s.k ?? 0.35);
  const nrm = i => {
    const p = sts[Math.max(0, i - 1)], q = sts[Math.min(sts.length - 1, i + 1)];
    return sts[i].n ? unit(sts[i].n) : unit(cross(sub(sts[i].b, sts[i].a), sub(mid(q), mid(p))));
  };
  const ring = i => { const s = sts[i], m = mid(s), h = mulS(nrm(i), (s.t ?? 0.02) / 2); return [s.a, s.b, add(m, h), sub(m, h)]; };
  const out = [];
  for (let i = 0; i + 1 < sts.length; i++) out.push(hull(sts.length > 2 ? `${name} ${i + 1}` : name, [...ring(i), ...ring(i + 1)], { ...o, ...(sts[i].color ? { color: sts[i].color } : {}) }));
  return out;
}
/** 2 点 a → b を軸にした n 角の筒・円錐台（半径 ra → rb）。点を並べて凸包にする */
export function rod(a, b, ra, rb = ra, n = 8) {
  const u = unit(sub(b, a)), ref = Math.abs(u[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0], v1 = unit(cross(u, ref)), v2 = cross(u, v1), pts = [];
  for (const [c, r] of [[a, ra], [b, rb]]) for (let k = 0; k < n; k++) { const t = (k + 0.5) * 2 * Math.PI / n; pts.push([0, 1, 2].map(i => c[i] + r * (Math.cos(t) * v1[i] + Math.sin(t) * v2[i]))); }
  return planesFromPoints(pts);
}
/** 点の列に沿った管（節ごとに 1 個、少し重ねる） */
export const pipe = (name, path, r, o = {}, n = 8) => path.slice(0, -1).map((a, i) => { const b = path[i + 1], e = mulS(unit(sub(b, a)), r * 0.5); return piece(`${name} ${i + 1}`, rod(sub(a, e), add(b, e), r, r, n), o); });
/** 2 次のベジエ曲線の点（n 等分） */
export const bez = (a, b, c, n) => Array.from({ length: n + 1 }, (_, i) => { const t = i / n; return [0, 1, 2].map(k => (1 - t) ** 2 * a[k] + 2 * t * (1 - t) * b[k] + t * t * c[k]); });

/**
 * 角を落とした箱（上と下で大きさを変えられる：広い面が傾く）。中心 c、下の半分の幅 [wx, wz]、上の半分の幅 [ux, uz]、高さ y0〜y1、
 * 角の落とし bev。sh は上の面の中心のずれ [dx, dz]
 */
export function cbox(name, [cx, cz], [wx, wz], [ux, uz], y0, y1, { bev = 0.015, sh = [0, 0], ...o } = {}) {
  const pts = [], h = y1 - y0, at = y => { const t = (y - y0) / h; return [wx + (ux - wx) * t, wz + (uz - wz) * t, cx + sh[0] * t, cz + sh[1] * t]; };
  for (const [y, inset] of [[y0, bev], [y0 + bev, 0], [y1 - bev, 0], [y1, bev]]) {
    const [hx, hz, ox, oz] = at(y);
    for (const sx of [1, -1]) for (const sz of [1, -1]) {
      if (inset) pts.push([ox + sx * (hx - inset), y, oz + sz * (hz - inset)]);
      else pts.push([ox + sx * (hx - bev), y, oz + sz * hz], [ox + sx * hx, y, oz + sz * (hz - bev)]);
    }
  }
  return hull(name, pts, o);
}
/** 虹色（h は 0〜1：赤 → 橙 → 黄 → 緑 → 青 → 紫） */
export function rainbow(h, light = 0.6) {
  const f = n => { const k = (n + h * 300 / 30) % 12, a = Math.min(light, 1 - light); return light - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  return '#' + [f(0), f(8), f(4)].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
}
/** +y を向き v へ向ける回転（度。xf の rot に渡す） */
export const aim = v => { const u = unit(v); return [Math.acos(Math.max(-1, Math.min(1, u[1]))) / R, Math.atan2(u[0], u[2]) / R, 0]; };
export const add3 = add, sub3 = sub, mul3 = mulS;
/** 四角柱：a → b。断面は w（横：up × 軸の向き）× h（up の向き）。先の断面は w1 × h1 */
export function prism(a, b, [w, h], up, { w1 = w, h1 = h } = {}) {
  const d = unit(sub(b, a)), s = unit(cross(up, d)), u = cross(d, s), pts = [];
  for (const [c, ww, hh] of [[a, w, h], [b, w1, h1]]) for (const sx of [-1, 1]) for (const sy of [-1, 1]) pts.push([0, 1, 2].map(i => c[i] + s[i] * sx * ww / 2 + u[i] * sy * hh / 2));
  return planesFromPoints(pts);
}
/** 2 つの色（#rrggbb）を混ぜる（t = 0 で a、1 で b） */
export function mix(a, b, t) {
  const h = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16)), [p, q] = [h(a), h(b)];
  return '#' + p.map((v, i) => Math.round(v + (q[i] - v) * t).toString(16).padStart(2, '0')).join('');
}
