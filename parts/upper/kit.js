// 胴（胸・背中・腹・脇腹）の部品を作る道具と、標準の寸法。原点は胸の下端の中心（骨格図の chest.yBot、y 2.1）。x 右・y 上・z 前。
// 胴は 4 つの部品に分ける：胸（前の上）・背中（後ろの上）・腹（下の輪）・脇腹（左右の横と肩の台）。どれも自分の暗い芯と装甲を持ち、
// となりの部品と 1〜3 cm 重なってつながる。寸法は標準の胴（下の STD）に合わせてある。
// 上半身は腹の中心（原点の 0.1 下）のまわりに回る。肩のまわり（x 0.26 より外で y 0.34 より上）は、腕を振ると肩アーマーの内の端が通るので空ける。
import { P, planesFromPoints, piece, mir } from '../../xsasm-lib.js';
import { crown, steps } from '../lower/shape.js';

/** 標準の胴：wb・wt 下と上の横の半分の幅、top 上の端、zf 前（上）、zb 後ろ（上）、bz 胸の装甲の前 */
export const STD = { wb: 0.21, wt: 0.31, top: 0.555, zf: 0.2, zb: 0.18, bz: 0.27 };
export const sideX = (y, s = STD) => s.wb + (s.wt - s.wb) * Math.min(1, y / 0.45);   // 横の面（下ほど細い）
export const frontZ = (y, s = STD) => 0.15 + (s.zf - 0.15) * Math.min(1, y / 0.3);    // 前の面（下ほど奥）
export const backZ = (y, s = STD) => -(0.14 + (s.zb - 0.14) * Math.min(1, y / 0.3));  // 後ろの面

export const hull = (name, pts, o = {}) => piece(name, planesFromPoints(pts), o);
export const mirP = pts => pts.map(p => [-p[0], p[1], p[2]]);
/** 左右の対（+x の点から、−x は鏡像） */
export const pairOf = (name, pts, o = {}) => [hull(`${name}（+x）`, pts, o), hull(`${name}（−x）`, mirP(pts), o)];
/** 面で作った +x 側の部品と、その鏡像 */
export const pairPl = (name, planes, o = {}) => [piece(`${name}（+x）`, planes, o), piece(`${name}（−x）`, planes.map(mir), o)];

const AX = { x: [0, 1, 2], y: [1, 0, 2], z: [2, 0, 1] };   // 面の軸と、面の上の 2 軸 (u, v)
/**
 * 盛り上がった板：面 p[axis] = sign · f(u, v)（u, v は axis 以外の 2 軸、crown と同じ）を、u が a0〜a1・v が b0〜b1 の範囲で切り、
 * 4 辺を 45° に bev だけ落とす。裏は面の中央から depth 奥の平面（芯に差し込む）。extra は足す面
 */
export function slab(axis, sign, f, [a0, a1], [b0, b1], { bev = 0.012, depth = 0.05, na = 4, nb = 3, extra = [] } = {}) {
  const [ia, iu, iv] = AX[axis], uc = (a0 + a1) / 2, vc = (b0 + b1) / 2;
  const at = (u, v, w) => { const p = [0, 0, 0]; p[ia] = sign * w; p[iu] = u; p[iv] = v; return p; };
  const n = (du, dv, dw) => { const q = [0, 0, 0]; q[ia] = sign * dw; q[iu] = du; q[iv] = dv; return q; };
  return [...crown(axis, sign, f, steps(a0, a1, na), steps(b0, b1, nb)),
    P(n(0, 0, -1), at(uc, vc, f(uc, vc) - depth)),
    P(n(1, 0, 0), at(a1, vc, 0)), P(n(-1, 0, 0), at(a0, vc, 0)), P(n(0, 1, 0), at(uc, b1, 0)), P(n(0, -1, 0), at(uc, b0, 0)),
    P(n(1, 0, 1), at(a1 - bev, vc, f(a1 - bev, vc))), P(n(-1, 0, 1), at(a0 + bev, vc, f(a0 + bev, vc))),
    P(n(0, 1, 1), at(uc, b1 - bev, f(uc, b1 - bev))), P(n(0, -1, 1), at(uc, b0 + bev, f(uc, b0 + bev))), ...extra];
}

// ---- 面の上に置く道具 ----
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const unit = v => { const l = Math.hypot(...v); return v.map(x => x / l); };
/** 面の上の箱：中心 o、幅の向き u、高さの向き v、外向き n（単位ベクトル）で、a0〜a1 × b0〜b1 × c0〜c1（c は外へ） */
export function boxOn(name, o, u, v, n, [a0, a1], [b0, b1], [c0, c1], opt = {}) {
  const pts = [];
  for (const a of [a0, a1]) for (const b of [b0, b1]) for (const c of [c0, c1]) pts.push([0, 1, 2].map(i => o[i] + a * u[i] + b * v[i] + c * n[i]));
  return hull(name, pts, opt);
}
/**
 * 通気口：面の上に 4 辺の枠（外へ dep 出る）、枠の中の底に黒い板、前が下がった斜めの羽根板 slats 枚。本当にくぼんで見える。
 * o は面の上の中心、u 幅の向き、v 上の向き、n 外向き（u × v、面に垂直）。w × h の大きさ
 */
export function grille(name, o, u, v, w, h, { dep = 0.028, slats = 3, fw = 0.012 } = {}) {
  u = unit(u); v = unit(v); const n = unit(cross(u, v)), hw = w / 2, hh = h / 2, out = [];
  out.push(boxOn(`${name}の枠（上）`, o, u, v, n, [-hw, hw], [hh - fw, hh], [-0.015, dep]));
  out.push(boxOn(`${name}の枠（下）`, o, u, v, n, [-hw, hw], [-hh, -hh + fw], [-0.015, dep]));
  out.push(boxOn(`${name}の枠（左）`, o, u, v, n, [-hw, -hw + fw], [-hh, hh], [-0.015, dep]));
  out.push(boxOn(`${name}の枠（右）`, o, u, v, n, [hw - fw, hw], [-hh, hh], [-0.015, dep]));
  out.push(boxOn(`${name}の奥`, o, u, v, n, [-hw + 0.004, hw - 0.004], [-hh + 0.004, hh - 0.004], [-0.012, 0.004], { color: '#23262c' }));
  const s = (2 * hh - 2 * fw) / slats;
  for (let k = 0; k < slats; k++) {
    const b = -hh + fw + k * s, pts = [];
    for (const a of [-hw + fw - 0.002, hw - fw + 0.002]) for (const [db, c] of [[0.75, dep - 0.006], [0.4, dep - 0.006], [0.55, 0.004], [0.9, 0.004]])
      pts.push([0, 1, 2].map(i => o[i] + a * u[i] + (b + db * s) * v[i] + c * n[i]));
    out.push(hull(`${name}の羽根 ${k + 1}`, pts, { color: '#6b727d' }));
  }
  return out;
}
/** +x 側に作った部品の並びを、x で鏡像にした並び（名前の「+x」を「−x」に） */
export const mirrorPieces = list => list.map(pc => ({ ...pc, name: pc.name.replace('+x', '−x'), planes: pc.planes.map(mir) }));
