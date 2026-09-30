// 面で作る部品（kind: 'hull'）：平面の集まりで囲った凸多面体。
// 装甲の部品は「この面はこの向きに、ここまで」という平面の集まりで決まる（模型の面取りと同じ考え方）。
// 押し出し＋3 面図では作れない斜めの面（頬のすぼまり、額の前傾、卵型のクラウン）が作れ、辺の面取りは面ごとに幅を変えられる。
//
// データ：planes = [[nx, ny, nz, d, b?], ...]。n·p ≤ d の側を残す（n は外向き）。b はその面の辺の面取り幅（省略時は部品の bevel）。
// 辺の面取りは、隣り合う 2 面の面取り幅の小さい方で、bevelSegs 段（1 = 斜めに落とす、2 以上 = 丸める）。
// 依存なし（three.js を使わない）。Node でもブラウザでも動く。

const EPS = 1e-7;
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = a => Math.hypot(a[0], a[1], a[2]);
const norm = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/** 平面：点 p を通り、外向き法線 n（正規化される）。b は面取り幅（任意） */
export function planeAt(n, p, b) { const u = norm(n); const out = [u[0], u[1], u[2], dot(u, p)]; if (b !== undefined) out.push(b); return out; }
/** 原点中心の箱（w × h × d）の 6 面 */
export function boxPlanes(w, h, d) {
  return [[1, 0, 0, w / 2], [-1, 0, 0, w / 2], [0, 1, 0, h / 2], [0, -1, 0, h / 2], [0, 0, 1, d / 2], [0, 0, -1, d / 2]];
}

/** 凸多面体を平面で切る。faces: [{ n, pts: [[x,y,z],...] }]。n·p ≤ d を残す */
/** 続けて同じ位置の点を 1 つにする（面の稜線をちょうど通る切り口で、点が重なって潰れた面ができるのを防ぐ） */
function dedupe(pts) {
  const out = [];
  for (const p of pts) { const q = out[out.length - 1]; if (!q || Math.abs(p[0] - q[0]) > 1e-7 || Math.abs(p[1] - q[1]) > 1e-7 || Math.abs(p[2] - q[2]) > 1e-7) out.push(p); }
  if (out.length > 1) { const a = out[0], b = out[out.length - 1]; if (Math.abs(a[0] - b[0]) <= 1e-7 && Math.abs(a[1] - b[1]) <= 1e-7 && Math.abs(a[2] - b[2]) <= 1e-7) out.pop(); }
  return out;
}
function clip(faces, n, d) {
  const out = [], capPts = [];
  for (const f of faces) {
    const P = f.pts, m = P.length, kept = [];
    let anyIn = false, anyOut = false;
    const s = P.map(p => dot(n, p) - d);
    for (let i = 0; i < m; i++) { if (s[i] <= EPS) anyIn = true; if (s[i] > EPS) anyOut = true; }
    if (!anyOut) { out.push(f); continue; }
    if (!anyIn) continue;
    for (let i = 0; i < m; i++) {
      const a = P[i], b = P[(i + 1) % m], sa = s[i], sb = s[(i + 1) % m];
      if (sa <= EPS) kept.push(a);
      if ((sa <= EPS) !== (sb <= EPS)) {
        const t = sa / (sa - sb);
        const q = add(a, mul(sub(b, a), t));
        kept.push(q); capPts.push(q);
      }
    }
    const kd = dedupe(kept); if (kd.length >= 3) out.push({ n: f.n, pts: kd, b: f.b });
  }
  if (capPts.length >= 3) {
    // 切り口の面：重複を除き、面の中で角度順に並べる
    const c = capPts.reduce((a, p) => add(a, p), [0, 0, 0]).map(v => v / capPts.length);
    const u = norm(cross(n, Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0])), v = cross(n, u);
    const uniq = [];
    for (const p of capPts) if (!uniq.some(q => len(sub(p, q)) < 1e-6)) uniq.push(p);
    uniq.sort((p, q) => Math.atan2(dot(sub(p, c), v), dot(sub(p, c), u)) - Math.atan2(dot(sub(q, c), v), dot(sub(q, c), u)));
    if (uniq.length >= 3) out.push({ n: n.slice(), pts: uniq, cap: true });
  }
  return out;
}

/**
 * 平面の一覧から凸多面体を作る。戻り値は { faces: [{ n, pts }], positions: Float32Array（三角形の頂点）, normals }。
 * bevel: 既定の面取り幅、bevelSegs: 面取りの段数、reach: 最初に切り出す箱の半径（部品の大きさより大きければよい）
 */
export function buildHull(planes, { bevel = 0, bevelSegs = 1, reach = 4 } = {}) {
  const R = reach;
  let faces = [
    { n: [1, 0, 0], pts: [[R, -R, -R], [R, R, -R], [R, R, R], [R, -R, R]] }, { n: [-1, 0, 0], pts: [[-R, -R, R], [-R, R, R], [-R, R, -R], [-R, -R, -R]] },
    { n: [0, 1, 0], pts: [[-R, R, -R], [-R, R, R], [R, R, R], [R, R, -R]] }, { n: [0, -1, 0], pts: [[-R, -R, R], [-R, -R, -R], [R, -R, -R], [R, -R, R]] },
    { n: [0, 0, 1], pts: [[-R, -R, R], [R, -R, R], [R, R, R], [-R, R, R]] }, { n: [0, 0, -1], pts: [[R, -R, -R], [-R, -R, -R], [-R, R, -R], [R, R, -R]] },
  ];
  const own = [];   // the planes given, in order, with their bevel width
  for (const pl of planes) {
    const l = len(pl.slice(0, 3)) || 1, n = [pl[0] / l, pl[1] / l, pl[2] / l], dd = pl[3] / l;
    faces = clip(faces, n, dd);
    own.push({ n, d: dd, b: pl.length > 4 ? pl[4] : bevel });
  }
  // the box's faces that no plane replaced count as sharp planes (bevel none) — a box(w, h, d) is given as planes anyway
  faces = faces.map(f => { const o = own.find(p => dot(p.n, f.n) > 0.9999 && Math.abs(p.d - dot(p.n, f.pts[0])) < 1e-6); return { ...f, b: o ? o.b : 0 }; });
  // 面取り：隣り合う 2 面の辺ごとに、間の向きの平面で角を落とす
  if (bevel > 0 || own.some(p => p.b > 0)) {
    const edgeKey = (a, b) => { const ka = a.map(v => Math.round(v * 1e5)).join(','), kb = b.map(v => Math.round(v * 1e5)).join(','); return ka < kb ? ka + '|' + kb : kb + '|' + ka; };
    const edges = new Map();
    faces.forEach((f, fi) => { const m = f.pts.length; for (let i = 0; i < m; i++) { const k = edgeKey(f.pts[i], f.pts[(i + 1) % m]); const e = edges.get(k); if (e) e.push(fi); else edges.set(k, [fi]); } });
    const cuts = [];
    for (const [k, fs] of edges) {
      if (fs.length !== 2) continue;
      const A = faces[fs[0]], B = faces[fs[1]];
      const bw = Math.min(A.b ?? 0, B.b ?? 0);
      if (bw <= 0) continue;
      const cosT = dot(A.n, B.n);
      if (cosT > Math.cos(18 * Math.PI / 180)) continue;   // nearly flat: no edge to bevel
      const [pa, pb] = k.split('|').map(s => s.split(',').map(v => v / 1e5));
      const e = norm(sub(pb, pa));
      // in-face directions away from the edge
      const tA = (() => { const t = norm(cross(A.n, e)); const c = A.pts.reduce((s, p) => add(s, p), [0, 0, 0]).map(v => v / A.pts.length); return dot(t, sub(c, pa)) > 0 ? t : mul(t, -1); })();
      const tB = (() => { const t = norm(cross(B.n, e)); const c = B.pts.reduce((s, p) => add(s, p), [0, 0, 0]).map(v => v / B.pts.length); return dot(t, sub(c, pa)) > 0 ? t : mul(t, -1); })();
      const segs = Math.max(1, bevelSegs | 0);
      // the cut planes go from A's side to B's: at segment k, the normal is between nA and nB; the plane passes through the
      // arc of a rounded edge of radius r, where r makes the chamfer's legs bw long
      const theta = Math.acos(Math.max(-1, Math.min(1, cosT)));   // angle between the normals = turn of the edge
      const r = bw / Math.tan(theta / 2);                           // radius of the rounded edge whose tangent points are bw from the edge
      const centre = add(pa, add(mul(tA, bw), mul(A.n, -r)));      // where the rounding circle is centred (inside)
      const nAt = t => norm(add(mul(A.n, Math.sin((1 - t) * theta)), mul(B.n, Math.sin(t * theta))));
      for (let s = 1; s <= segs; s++) {
        // one flat facet per segment: the chord between two points of the arc (its normal is the arc's middle normal)
        const nn = nAt((s - 0.5) / segs), q = add(centre, mul(nAt((s - 1) / segs), r));
        cuts.push([nn[0], nn[1], nn[2], dot(nn, q)]);
      }
    }
    for (const c of cuts) faces = clip(faces, [c[0], c[1], c[2]], c[3]);
  }
  // 三角形へ（面ごとに平らな法線）
  const pos = [], nor = [];
  for (const f of faces) {
    const P = f.pts;
    // a robust normal from the polygon itself (the plane's normal may drift after many clips)
    let n = [0, 0, 0];
    for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; n = add(n, cross(a, b)); }
    n = len(n) > 1e-12 ? norm(n) : f.n;
    for (let i = 1; i < P.length - 1; i++) { pos.push(...P[0], ...P[i], ...P[i + 1]); nor.push(...n, ...n, ...n); }
  }
  return { faces, positions: new Float32Array(pos), normals: new Float32Array(nor) };
}

/** 平面の一覧の範囲（大きさの目安）：各平面の距離の最大 */
export function hullReach(planes) { let r = 0.05; for (const p of planes) r = Math.max(r, Math.abs(p[3]) / (Math.hypot(p[0], p[1], p[2]) || 1)); return r * 8 + 0.1; }   // 面の距離の 8 倍まで（先の尖った部品は面の距離よりずっと遠くまで届く）

/** ミラー：x = 0 で反転した平面の一覧 */
export function mirrorPlanes(planes) { return planes.map(p => [-p[0], p[1], p[2], p[3], ...(p.length > 4 ? [p[4]] : [])]); }

/** 平面の一覧を平行移動（点 t だけ動かす）／回転（rotY: Y 軸まわり、ラジアン）した一覧 */
export function movePlanes(planes, t) { return planes.map(p => [p[0], p[1], p[2], p[3] + p[0] * t[0] + p[1] * t[1] + p[2] * t[2], ...(p.length > 4 ? [p[4]] : [])]); }
export function rotPlanesX(planes, a) { const c = Math.cos(a), s = Math.sin(a); return planes.map(p => [p[0], p[1] * c - p[2] * s, p[1] * s + p[2] * c, p[3], ...(p.length > 4 ? [p[4]] : [])]); }
export function rotPlanesY(planes, a) { const c = Math.cos(a), s = Math.sin(a); return planes.map(p => [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c, p[3], ...(p.length > 4 ? [p[4]] : [])]); }
export function rotPlanesZ(planes, a) { const c = Math.cos(a), s = Math.sin(a); return planes.map(p => [p[0] * c - p[1] * s, p[0] * s + p[1] * c, p[2], p[3], ...(p.length > 4 ? [p[4]] : [])]); }
