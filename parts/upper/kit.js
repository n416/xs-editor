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
