// 蛇腹の動力パイプを作る道具（腰の飾り parts/lower/waistdeco.js と、頭の飾り parts/headpipe.js で使う）。
// 管は、道筋（点の列）に沿って短い筒を少しずつ向きを変えて並べる：暗い太い輪と、その間に見える黒い細い芯。両端に暗い受け。
import { planesFromPoints, piece, DARK, BLACK } from '../xsasm-lib.js';

/** 2 点 a → b を軸にした n 角の筒（半径 r）。点を並べて凸包にする */
export function tube(a, b, r, n = 8) {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L = Math.hypot(...d), u = d.map(v => v / L);
  const ref = Math.abs(u[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const cr = (p, q) => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];
  let v1 = cr(u, ref); const l1 = Math.hypot(...v1); v1 = v1.map(v => v / l1); const v2 = cr(u, v1);
  const pts = [];
  for (const c of [a, b]) for (let k = 0; k < n; k++) { const t = (k + 0.5) * 2 * Math.PI / n; pts.push([0, 1, 2].map(i => c[i] + r * (Math.cos(t) * v1[i] + Math.sin(t) * v2[i]))); }
  return planesFromPoints(pts);
}
/** 蛇腹の管：点の列（道筋）に沿って、短い筒（太い輪 rr と細い芯 rc）を交互に並べる */
export function bellows(path, name, rr = 0.026, rc = 0.02) {
  const out = [];
  for (let i = 0; i + 1 < path.length; i++) {
    const a = path[i], b = path[i + 1], m = a.map((v, k) => (v + b[k]) / 2);
    out.push(piece(`${name}の芯 ${i + 1}`, tube(a, b, rc), { color: BLACK }));
    const q = a.map((v, k) => v + (m[k] - v) * 0.25), w = a.map((v, k) => v + (m[k] - v) * 1.75);
    out.push(piece(`${name}の輪 ${i + 1}`, tube(q, w, rr), { color: DARK }));
  }
  return out;
}
/**
 * 管の端の受け：管の端 p を含み、そこから toward（付ける相手の側の点）へ k の割合だけ伸びた暗い小さな箱（半分の大きさ h）。
 * 左右どちらの側でも、管の端と相手の両方を含む向きに伸びる
 */
export function fitting(p, name, h = 0.022, toward = [0, p[1], 0], k = 0.3) {
  const q = p.map((v, i) => v + (toward[i] - v) * k);
  const span = i => [Math.min(p[i], q[i]) - h, Math.max(p[i], q[i]) + h];
  const [x0, x1] = span(0), [y0, y1] = span(1), [z0, z1] = span(2);
  const pts = []; for (const x of [x0, x1]) for (const y of [y0, y1]) for (const z of [z0, z1]) pts.push([x, y, z]);
  return piece(name, planesFromPoints(pts), { color: DARK });
}
