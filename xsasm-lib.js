// 頭の組み立て用の部品を作る道具。部品は凸多面体（hull）の寄せ集めで作り、切り取り（sub）は使わない。
// 座標は部品ごとの中心で、x 右・y 上・z 前。大きさの単位はエディタと同じ（1 = 6 m）。面取りはしない。
// 部品 = { id, name, cat, size: [幅, 高さ, 奥行き], pieces: [piece(...)] }。piece は エディタの部品（kind hull）そのもので、
// pos は部品の中心からのずれ（回転は持たせない）。左右対称の対は pair()。

const norm = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
/** 法線 n（外向き）で点 p を通る面。b は面取り幅 */
export const P = (n, p, b) => { const u = norm(n); const o = [u[0], u[1], u[2], u[0] * p[0] + u[1] * p[1] + u[2] * p[2]]; if (b !== undefined) o.push(b); return o; };
export const XH = (v, b) => P([1, 0, 0], [v, 0, 0], b), XL = (v, b) => P([-1, 0, 0], [v, 0, 0], b);
export const YH = (v, b) => P([0, 1, 0], [0, v, 0], b), YL = (v, b) => P([0, -1, 0], [0, v, 0], b);
export const ZH = (v, b) => P([0, 0, 1], [0, 0, v], b), ZL = (v, b) => P([0, 0, -1], [0, 0, v], b);
export const mir = p => [-p[0], p[1], p[2], p[3], ...(p.length > 4 ? [p[4]] : [])];
/** 左右対称に：面とその x 鏡像 */
export const both = (...pl) => pl.flatMap(p => [p, mir(p)]);
export const box = (x0, x1, y0, y1, z0, z1, b) => [XL(x0, b), XH(x1, b), YL(y0, b), YH(y1, b), ZL(z0, b), ZH(z1, b)];
/** 点の集まりをすべて含む最小の凸多面体の面（外向き）。点が数十個までの部品用（3 点の組を総当たり）。eps は同じ面とみなす幅 */
export function planesFromPoints(pts, eps = 1e-6) {
  const out = [], seen = new Set();
  const n = pts.length;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) for (let k = j + 1; k < n; k++) {
    const a = pts[i], b = pts[j], c = pts[k];
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let nn = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const len = Math.hypot(nn[0], nn[1], nn[2]); if (len < 1e-12) continue;
    nn = [nn[0] / len, nn[1] / len, nn[2] / len];
    let d = nn[0] * a[0] + nn[1] * a[1] + nn[2] * a[2];
    let above = false, below = false;
    for (const p of pts) { const s = nn[0] * p[0] + nn[1] * p[1] + nn[2] * p[2] - d; if (s > eps) above = true; else if (s < -eps) below = true; if (above && below) break; }
    if (above && below) continue;
    if (above) { nn = [-nn[0], -nn[1], -nn[2]]; d = -d; }
    const key = nn.map(x => Math.round(x * 1e4)).join(',') + ':' + Math.round(d * 1e5);
    if (seen.has(key)) continue;
    seen.add(key); out.push([nn[0], nn[1], nn[2], d]);
  }
  return out;
}
/** 面の並びを平行移動 */
export const movePl = (planes, t) => planes.map(p => [p[0], p[1], p[2], p[3] + p[0] * t[0] + p[1] * t[1] + p[2] * t[2], ...(p.length > 4 ? [p[4]] : [])]);
/** 面の並びを横軸（x）まわりに deg 度回す。軸は点 (*, cy, cz) を通る横線。正の角で +y 側が後ろ（−z）へ倒れる */
export function rotXAt(planes, deg, cy = 0, cz = 0) {
  const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  const moved = movePl(planes, [0, -cy, -cz]);
  const rot = moved.map(p => [p[0], p[1] * c + p[2] * s, -p[1] * s + p[2] * c, p[3], ...(p.length > 4 ? [p[4]] : [])]);
  return movePl(rot, [0, cy, cz]);
}
/** 面の並びを縦軸（y）まわりに deg 度回す。軸は点 (cx, *, cz) を通る縦線。正の角で +x 側が後ろ（−z）へ回る */
export function rotYAt(planes, deg, cx = 0, cz = 0) {
  const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  const moved = movePl(planes, [-cx, 0, -cz]);
  const rot = moved.map(p => [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c, p[3], ...(p.length > 4 ? [p[4]] : [])]);
  return movePl(rot, [cx, 0, cz]);
}
/** 面取りした楕円体：緯度 lats（度）× 経線 n 本の接平面。r は半径 [x, y, z]、c は中心。経線は th0（度、0 が前）から等間隔。
 *  thetas を渡すとその経線（度）だけ */
export function ellipsoid(r, c, n, lats, th0 = 0, thetas = null) {
  const out = [];
  const ths = thetas ?? Array.from({ length: n }, (_, i) => th0 + i * 360 / n);
  for (const latDeg of lats) {
    const la = latDeg * Math.PI / 180;
    for (const thDeg of ths) {
      const th = thDeg * Math.PI / 180;
      const p = [r[0] * Math.cos(la) * Math.sin(th), r[1] * Math.sin(la), r[2] * Math.cos(la) * Math.cos(th)];
      out.push(P([p[0] / (r[0] * r[0]), p[1] / (r[1] * r[1]), p[2] / (r[2] * r[2])], [p[0] + c[0], p[1] + c[1], p[2] + c[2]]));
    }
  }
  return out;
}
export const MAIN = '#c3c9d2', DARK = '#6b727d', BLACK = '#23262c', GLOW = '#ffd257', ACCENT = '#b8483e';
export const piece = (name, planes, o = {}) => ({ name, kind: 'hull', planes, bevel: 0, bevelSegs: 1, color: MAIN, pos: [0, 0, 0], ...o });
/** 左右の対：面を x で鏡像にした 2 個 */
export const pair = (name, planes, o = {}) => [piece(name + '（右）', planes, o), piece(name + '（左）', planes.map(mir), o)];

/** 縦（y）の n 角柱の側面 n 枚：中心から面までの距離 a、th0（度、0 が前）から等間隔。上下の面は YL/YH で足す */
export const prismY = (a, n, th0 = 0) => Array.from({ length: n }, (_, k) => { const t = (th0 + k * 360 / n) * Math.PI / 180; return P([Math.sin(t), 0, Math.cos(t)], [a * Math.sin(t), 0, a * Math.cos(t)]); });
/** 横（x）の n 角柱の側面 n 枚：中心 (*, cy, cz) の横線から面までの距離 a、th0（度、0 が前）から等間隔。端の面は XL/XH で足す */
export const prismX = (a, n, th0 = 0, cy = 0, cz = 0) => Array.from({ length: n }, (_, k) => { const t = (th0 + k * 360 / n) * Math.PI / 180; return P([0, Math.sin(t), Math.cos(t)], [0, cy + a * Math.sin(t), cz + a * Math.cos(t)]); });
