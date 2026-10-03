// 肩アーマー（腕の骨 arm：腕を上げると一緒に上がる）。原点は肩関節の球の中心（x ±0.45・y 2.5）、+x 側の 1 個（反対側は鏡像で置く）。
// 球（半径 0.1）にかぶさる殻で、内側（胸の側）は x −0.085 まで。内の下は斜めに開けて、腕を外へ上げても胸の肩の段に、
// 内へ振っても肩の軸受けに当たらない。殻の中に球と上腕の上の端が入る（球と重なってつながり、回っても離れない）。
// 殻は中空（内側と下が開いた厚み 2 cm の殻）で、肩関節の球の中心から殻の天井の裏へ伸びるシャフトでつながる。拡大しても（とても大きな
// 肩アーマー）シャフトごと肩関節の中心から大きくなり、殻の中に上腕の上の端が入る。
// 種類：丸い・箱形・盾（外に長い板が下がる）・とげ付き・重ね板（3 枚の板が下へ段々に重なる）・球形・大きな丸・段付きの丸・つばの広い椀・縦に長い卵
import { P, XL, XH, YL, YH, ZL, ZH, ellipsoid, planesFromPoints, piece, DARK, ACCENT } from '../../xsasm-lib.js';
import { buildHull, hullReach } from '../../hull.js';
import { tube } from '../pipe.js';
import { crown, steps } from '../lower/shape.js';

/** 凸の部品の頂点（hull を作って三角形の角を並べる） */
const verts = planes => { const a = buildHull(planes, { reach: hullReach(planes) }).positions, v = []; for (let i = 0; i < a.length; i += 3) v.push([a[i], a[i + 1], a[i + 2]]); return v; };
const support = (vs, m) => Math.max(...vs.map(p => p[0] * m[0] + p[1] * m[1] + p[2] * m[2]));
// 殻を中空にするときの内側の壁の向き（内 −x と下 −y は壁を作らず、開ける）
const HOLLOW_DIRS = [[1, 0, 0], [0, 1, 0], [0, 0, 1], [0, 0, -1], [1, 1, 0], [1, 0, 1], [1, 0, -1], [0, 1, 1], [0, 1, -1], [1, 1, 1], [1, 1, -1]]
  .map(m => { const l = Math.hypot(...m); return m.map(v => v / l); });
/**
 * 中空の殻：凸の塊 S から、内側の空洞（各向きに S の端から t だけ内の面で囲んだ所、内と下へは開いている）を除いた残り。
 * 残りは「S かつ、どれかの向き m で端から t 以内」なので、向きごとに 1 つの凸の部品（S に m の面を 1 枚足す）の集まりになる
 */
function hollow(pc, t = 0.02) {
  const vs = verts(pc.planes);
  if (!vs.length) return [pc];
  const { hollow: _, ...base } = pc;
  return HOLLOW_DIRS.map((m, i) => {
    const e = support(vs, m) - t;
    return { ...base, name: `${pc.name}（殻 ${i + 1}）`, planes: [...pc.planes, P(m.map(v => -v), m.map(v => v * e))] };
  }).filter(q => verts(q.planes).length >= 12);
}
/**
 * 丸い中空の殻（楕円体、半径 r・中心 c、厚み t）を、緯度と経度 30° ごとの小さな凸の板に分けて作る（板どうしは 1° ずつ重なる）。
 * 下の端 b より下と、clip の面（内側の開き）の外は無い。てっぺんの輪は 1 枚のふた。y0・y1 を渡すとその高さの帯だけ
 */
function roundShell(name, r, c, { b = -Infinity, t = 0.02, clip = [], y0 = -Infinity, y1 = Infinity, o = {} } = {}) {
  const D = Math.PI / 180, lat = y => Math.asin(Math.max(-1, Math.min(1, (y - c[1]) / r[1]))) / D;
  const la0 = Math.max(lat(b), lat(y0), -89), la1 = Math.min(lat(y1), 90);
  const n = Math.max(1, Math.ceil((la1 - la0) / 30)), E = (k, la, lo) => [c[0] + (r[0] - k) * Math.cos(la * D) * Math.cos(lo * D), c[1] + (r[1] - k) * Math.sin(la * D), c[2] + (r[2] - k) * Math.cos(la * D) * Math.sin(lo * D)];
  const out = [];
  for (let i = 0; i < n; i++) {
    const l0 = la0 + (la1 - la0) * i / n - (i ? 1 : 0), l1 = la0 + (la1 - la0) * (i + 1) / n + 1;
    const cap = l1 >= 89.5;
    for (let j = 0; j < (cap ? 1 : 12); j++) {
      const lons = cap ? Array.from({ length: 13 }, (_, k) => k * 30) : [j * 30 - 16, j * 30, j * 30 + 16];
      const pts = [];
      for (const la of cap ? [l0, 90] : [l0, (l0 + l1) / 2, Math.min(l1, 90)]) for (const lo of lons) pts.push(E(0, la, lo));
      for (const la of [l0, Math.min(l1, 90)]) for (const lo of cap ? lons : [lons[0], lons[2]]) pts.push(E(t, la, lo));
      const planes = [...planesFromPoints(pts), ...clip, ...(Number.isFinite(b) ? [YL(b)] : []), ...(Number.isFinite(y0) ? [YL(y0)] : []), ...(Number.isFinite(y1) ? [YH(y1)] : [])];
      if (verts(planes).length >= 12) out.push(piece(`${name}（殻 ${out.length + 1}）`, planes, { ...A, ...o }));
    }
  }
  return out;
}
/**
 * 外を馬蹄形に回り込む帯の板（楕円の筒の一部、厚み t）。中心 (cx, cz)、上の端 y0 で半径 r0 = [x, z]、下の端 y1 で r1（下ほど外へ開く）、
 * 角度 a0〜a1（度、0 が外 +x、正が前）。15° ごとの小さな凸の板に分ける
 */
function lame(name, [cx, cz], y0, r0, y1, r1, { t = 0.02, a0 = -115, a1 = 115, o = {} } = {}) {
  const D = Math.PI / 180, out = [], n = Math.ceil((a1 - a0) / 15);
  const E = (k, y, r, a) => [cx + (r[0] - k) * Math.cos(a * D), y, cz + (r[1] - k) * Math.sin(a * D)];
  for (let j = 0; j < n; j++) {
    const b0 = a0 + (a1 - a0) * j / n - 0.5, b1 = a0 + (a1 - a0) * (j + 1) / n + 0.5, pts = [];
    for (const a of [b0, (b0 + b1) / 2, b1]) pts.push(E(0, y0, r0, a), E(0, y1, r1, a));
    for (const a of [b0, b1]) pts.push(E(t, y0, r0, a), E(t, y1, r1, a));
    out.push(piece(`${name}（${j + 1}）`, planesFromPoints(pts), { ...A, ...o }));
  }
  return out;
}
/** 中空の殻とシャフト：hollow の付いた piece を中空に。最初の殻の天井の裏（x は殻の真ん中）から肩関節の中心へ暗いシャフトと受け */
function withShaft(def, t = 0.02) {
  // 殻（最初の中空の部品か、最初の丸い殻の板の仲間）の頂点から、天井の高さと真ん中の x
  // （部品に top と cx があればそれを使う）
  const first = def.pieces.find(pc => pc.hollow || /（殻 \d+）$/.test(pc.name)), base = first?.name.replace(/（殻 \d+）$/, '');
  const vs = first ? def.pieces.filter(pc => pc === first || (!first.hollow && pc.name.startsWith(base + '（殻'))).flatMap(pc => verts(pc.planes)) : [], top = def.top ?? support(vs, [0, 1, 0]) - t, cx = def.cx ?? (support(vs, [1, 0, 0]) - support(vs, [-1, 0, 0])) / 2;
  const shaft = [
    { name: '肩アーマーのシャフト', kind: 'hull', planes: tube([0, 0, 0], [cx, top - 0.01, 0], 0.028, 8), bevel: 0, bevelSegs: 1, color: DARK, pos: [0, 0, 0], bone: 'arm', pivot: 'none' },
    { name: 'シャフトの受け', kind: 'hull', planes: [XL(cx - 0.045), XH(cx + 0.045), YL(top - 0.035), YH(top + 0.008), ZL(-0.045), ZH(0.045)], bevel: 0, bevelSegs: 1, color: DARK, pos: [0, 0, 0], bone: 'arm', pivot: 'none' },
  ];
  const { top: _t, cx: _c, ...rest } = def;
  return { ...rest, pieces: [...def.pieces.flatMap(pc => (pc.hollow ? hollow(pc, t) : [pc])), ...shaft] };
}

const A = { bone: 'arm', pivot: 'none' };
const H = { hollow: true };
// 内側の端、内の下の斜めの開き、上から見て内の前後の角を丸く落とす（腕を横に振ると内の角が肩の軸のまわりを回り、胸の肩に届くので、
// 軸から遠い角を無くす）
const inner = [XL(-0.07), P([-1, -0.8, 0], [-0.05, 0, 0]), P([-1, 0, 1.1], [-0.07, 0, 0.09]), P([-1, 0, -1.1], [-0.07, 0, -0.09])];
/** 丸い箱の殻：上・外・前・後ろの面を少し丸め（crown）、角は楕円体で落とす。内側と下で切る。w 外の端、t 上の端、d 前後の半分、b 下の端 */
const shell = (name, { w = 0.25, t = 0.15, d = 0.18, b = -0.15 } = {}, o = {}) => {
  const cx = (w - 0.085) / 2, cy = (t + b) / 2;
  return piece(name, [
    ...crown('y', 1, (x, z) => t - 0.5 * (x - cx) ** 2 - 0.7 * z * z, steps(-0.06, w - 0.02, 3), steps(-d + 0.02, d - 0.02, 3)),
    ...crown('x', 1, (y, z) => w - 0.5 * (y - cy) ** 2 - 0.7 * z * z, steps(b, t - 0.02, 3), steps(-d + 0.02, d - 0.02, 3)),
    ...crown('z', 1, (x, y) => d - 0.4 * (x - cx) ** 2 - 0.5 * (y - cy) ** 2, steps(-0.06, w - 0.02, 3), steps(b, t - 0.02, 3)),
    ...crown('z', -1, (x, y) => d - 0.4 * (x - cx) ** 2 - 0.5 * (y - cy) ** 2, steps(-0.06, w - 0.02, 3), steps(b, t - 0.02, 3)),
    ...ellipsoid([(w + 0.085) * 0.62, (t - b) * 0.64, d * 1.2], [cx, cy, 0], 14, [-30, 0, 25, 50, 72]),
    ...innerRound, YL(b)], { ...A, ...H, ...o });
};
const dome = (name, _r, _c, bottom, o = {}) => shell(name, { b: bottom }, o);
/** 殻の裾の暗い帯（殻より少し外へ出た段） */
const rim = (_r, _c, y0, y1) => piece('肩アーマーの裾', [...crown('x', 1, (y, z) => 0.258 - 0.7 * z * z, [y0, y1], steps(-0.17, 0.17, 3)),
  ...crown('z', 1, (x) => 0.188 - 0.4 * (x - 0.083) ** 2, steps(-0.06, 0.23, 3), [y0, y1]), ...crown('z', -1, (x) => 0.188 - 0.4 * (x - 0.083) ** 2, steps(-0.06, 0.23, 3), [y0, y1]),
  ...inner, YL(y0), YH(y1)], { ...A, ...H, color: DARK });
/** 外の面に盛り上がったパネル */
const panel = (x, y0, y1, zw, o = {}) => piece('肩アーマーのパネル', [...crown('x', 1, (y, z) => x - 0.5 * (y - (y0 + y1) / 2) ** 2 - 0.9 * z * z, steps(y0, y1, 2), steps(-zw, zw, 2)),
  XL(x - 0.05), YL(y0), YH(y1), ZL(-zw), ZH(zw), P([0.6, 1, 0], [x - 0.01, y1, 0]), P([0.6, -1, 0], [x - 0.01, y0, 0])], { ...A, ...o });
/**
 * とげ：殻の面から立つ段付きの円錐。根元 b（殻の面の上）、向き n、大きさ s。
 *   台座（暗い 8 角の低い円柱、殻に埋まる）→ 胴（太い短い円錐台）→ 段 → 先（細い円錐台、先は小さく平ら）
 */
function spike(name, b, n, s = 1) {
  const u = n.map(v => v / Math.hypot(...n)), ref = Math.abs(u[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const cr = (p, q) => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];
  let v1 = cr(u, ref); const l = Math.hypot(...v1); v1 = v1.map(v => v / l); const v2 = cr(u, v1);
  /** 軸の上 h0〜h1 で半径 r0〜r1 の 8 角の円錐台 */
  const frustum = (h0, r0, h1, r1) => {
    const pts = [];
    for (const [h, r] of [[h0, r0], [h1, r1]]) for (let k = 0; k < 8; k++) {
      const t = (k + 0.5) * Math.PI / 4;
      pts.push([0, 1, 2].map(i => b[i] + u[i] * h * s + r * s * (Math.cos(t) * v1[i] + Math.sin(t) * v2[i])));
    }
    return planesFromPoints(pts);
  };
  return [piece(`${name}の台座`, frustum(-0.03, 0.052, 0.018, 0.05), { ...A, color: DARK }),
    piece(`${name}の胴`, frustum(0.012, 0.04, 0.05, 0.034), { ...A }),
    piece(`${name}の先`, frustum(0.045, 0.028, 0.125, 0.007), { ...A })];
}

const R0 = [0.165, 0.16, 0.175], C0 = [0.045, -0.005, 0];
/** 丸い殻（楕円体、面を細かく）：半径 r、中心 c、下の端 b。内側は同じく切る */
// 丸い殻も内の下は斜めに開ける（開けないと、腕を内へ振ったとき殻の内の下が胸の肩と装甲に 10〜40 cm 入る）
const innerRound = [XL(-0.02), P([-1, -0.8, 0], [0.0, 0, 0]), P([-1, 0, 1.1], [-0.02, 0, 0.09]), P([-1, 0, -1.1], [-0.02, 0, -0.09])];
const ball = (name, r, c, b, o = {}) => roundShell(name, r, c, { b, clip: innerRound, o });
/** 丸い殻に沿う帯（楕円体を少し外へ広げ、y0〜y1 の高さだけ。殻より厚い） */
const band = (name, r, c, y0, y1, grow = 0.01, o = {}) => roundShell(name, [r[0] + grow, r[1] + grow, r[2] + grow], c, { y0, y1, t: 0.02 + grow, clip: innerRound, o: { color: DARK, ...o } });
const ARMORS = [
  { id: 'shoulderarmor', name: '肩アーマー（丸い）', cat: '肩アーマー', size: [0.3, 0.3, 0.36],
    pieces: [dome('肩アーマー', R0, C0, -0.13), rim(R0, C0, -0.15, -0.1), panel(0.262, -0.09, 0.07, 0.1)] },
  { id: 'shoulderarmorbox', name: '肩アーマー（箱形）', cat: '肩アーマー', size: [0.3, 0.3, 0.36],
    pieces: [
      piece('肩アーマー', [...innerRound, XH(0.2), YL(-0.14), P([-0.35, 1, 0], [0.05, 0.14, 0]), ZH(0.17), ZL(-0.17),
        P([0, 1, 1], [0, 0.1, 0.14]), P([0, 1, -1], [0, 0.1, -0.14]), P([1, 0, 1], [0.17, 0, 0.14]), P([1, 0, -1], [0.17, 0, -0.14]),
        P([1, 1, 0], [0.2, 0.08, 0]), P([1, -1, 0], [0.2, -0.11, 0])], { ...A, ...H }),
      piece('肩アーマーの溝', [...innerRound, XH(0.195), YL(-0.155), YH(-0.12), ZH(0.165), ZL(-0.165), P([1, 0, 1], [0.165, 0, 0.14]), P([1, 0, -1], [0.165, 0, -0.14]), P([1, -1, 0], [0.195, -0.13, 0])], { ...A, ...H, color: DARK }),
      piece('肩アーマーの前の板', [...crown('z', 1, (x, y) => 0.182 - 0.4 * (x - 0.06) ** 2 - 0.5 * y * y, steps(-0.03, 0.15, 2), steps(-0.09, 0.07, 2)),
        ZL(0.15), XL(-0.03), XH(0.15), YL(-0.09), YH(0.07), P([1, 0, 1], [0.15, 0, 0.165]), P([0, 1, 1], [0, 0.07, 0.165])], { ...A, color: ACCENT })] },
  // 簡素な箱：飾りの無い 1 つの塊。上の面は外へ下がり、外の面は下へ向かって内へ入る（溝も差し色の板も付けない）。箱形より少し大きく、下へ長い。
  // 面の傾きは小さく（3〜6°）：中空にする処理（hollow）は真上・真横・45° の向きから厚み 0.02 の板を残すので、それより大きく傾けると板が届かず穴があく
  { id: 'shoulderarmorplain', name: '肩アーマー（簡素な箱）', cat: '肩アーマー', size: [0.32, 0.38, 0.38], top: 0.16,   // （上の面が傾いているので、受けの高さは軸の真上の天井から）
    pieces: [
      piece('肩アーマー', [...innerRound, YL(-0.19), P([0.1, 1, 0], [0.05, 0.19, 0]), P([1, -0.045, 0], [0.212, 0, 0]),
        P([0, 0.045, 1], [0, 0, 0.178]), P([0, 0.045, -1], [0, 0, -0.178]),
        P([0, 1, 0.8], [0, 0.16, 0.15]), P([0, 1, -0.8], [0, 0.16, -0.15]), P([1, 0, 0.8], [0.19, 0, 0.15]), P([1, 0, -0.8], [0.19, 0, -0.15]),
        P([1, 1, 0], [0.205, 0.125, 0]), P([1, -1.4, 0], [0.2, -0.17, 0])], { ...A, ...H })] },
  { id: 'shoulderarmorshield', name: '肩アーマー（盾）', cat: '肩アーマー', size: [0.3, 0.66, 0.44],
    pieces: [dome('肩アーマー', R0, C0, -0.12), rim(R0, C0, -0.14, -0.09),
      piece('肩の盾', [...crown('x', 1, (y, z) => 0.245 - 0.12 * (y + 0.17) ** 2 - 0.9 * z * z, steps(-0.52, 0.12, 4), steps(-0.2, 0.2, 3)),
        XL(0.19), YH(0.12), YL(-0.5), ZL(-0.21), ZH(0.21), P([0, -1, 0.9], [0, -0.44, 0.17]), P([0, -1, -0.9], [0, -0.44, -0.17]), P([0.4, 1, 0], [0.24, 0.1, 0])], { ...A }),
      piece('盾の縁', [...crown('x', 1, (y, z) => 0.252 - 0.12 * (y + 0.17) ** 2 - 0.9 * z * z, steps(-0.52, -0.4, 1), steps(-0.2, 0.2, 3)),
        XL(0.2), YH(-0.4), YL(-0.52), ZL(-0.2), ZH(0.2), P([0, -1, 0.9], [0, -0.45, 0.165]), P([0, -1, -0.9], [0, -0.45, -0.165])], { ...A, color: DARK })] },
  { id: 'shoulderarmorspike', name: '肩アーマー（とげ付き）', cat: '肩アーマー', size: [0.36, 0.38, 0.36],
    pieces: [dome('肩アーマー', R0, C0, -0.13), rim(R0, C0, -0.15, -0.1),
      // 上の面に前から後ろへ 3 本（外へ少し傾ける）、外の面に 2 本
      ...spike('とげ（上・前）', [0.09, 0.142, 0.1], [0.3, 1, 0.14], 0.85), ...spike('とげ（上）', [0.09, 0.15, 0], [0.3, 1, 0]),
      ...spike('とげ（上・後ろ）', [0.09, 0.142, -0.1], [0.3, 1, -0.14], 0.85),
      ...spike('とげ（外・前）', [0.244, 0.0, 0.08], [1, 0.25, 0.11], 0.8), ...spike('とげ（外・後ろ）', [0.244, 0.0, -0.08], [1, 0.25, -0.11], 0.8)] },
  // もっと丸い肩：球に近い殻・大きな丸い殻・段の付いた丸い殻・つばの広いお椀・縦に長い卵
  { id: 'shoulderarmorsphere', name: '肩アーマー（球形）', cat: '肩アーマー', size: [0.34, 0.34, 0.36],
    pieces: [...ball('肩アーマー', [0.17, 0.17, 0.175], [0.06, 0.0, 0], -0.12), ...band('肩アーマーの帯', [0.17, 0.17, 0.175], [0.06, 0.0, 0], -0.02, 0.02)] },
  { id: 'shoulderarmorbig', name: '肩アーマー（大きな丸）', cat: '肩アーマー', size: [0.42, 0.4, 0.42],
    pieces: [...ball('肩アーマー', [0.215, 0.2, 0.2], [0.075, -0.02, 0], -0.2), ...band('肩アーマーの裾', [0.215, 0.2, 0.2], [0.075, -0.02, 0], -0.2, -0.16, 0.012)] },
  { id: 'shoulderarmorstep', name: '肩アーマー（段付きの丸）', cat: '肩アーマー', size: [0.36, 0.34, 0.38],
    pieces: [...ball('肩アーマー（下の段）', [0.18, 0.16, 0.18], [0.06, -0.02, 0], -0.15), ...ball('肩アーマー（上の段）', [0.14, 0.18, 0.15], [0.06, 0.0, 0], 0.03),
      ...band('段の間', [0.14, 0.18, 0.15], [0.06, 0.0, 0], 0.025, 0.045, 0.004)] },
  { id: 'shoulderarmorbowl', name: '肩アーマー（つばの広い椀）', cat: '肩アーマー', size: [0.42, 0.32, 0.42],
    pieces: [...ball('肩アーマー', [0.16, 0.17, 0.165], [0.06, -0.02, 0], -0.08),
      ...roundShell('肩アーマーのつば', [0.215, 0.2, 0.215], [0.06, -0.02, 0], { y0: -0.13, y1: -0.08, t: 0.075, clip: innerRound }),
      ...band('つばの縁', [0.215, 0.2, 0.215], [0.06, -0.02, 0], -0.14, -0.125, 0.004)] },
  { id: 'shoulderarmoregg', name: '肩アーマー（縦に長い卵）', cat: '肩アーマー', size: [0.34, 0.5, 0.34],
    pieces: [...ball('肩アーマー', [0.16, 0.27, 0.165], [0.07, -0.1, 0], -0.33), ...band('肩アーマーの帯', [0.16, 0.27, 0.165], [0.07, -0.1, 0], -0.12, -0.085)] },
  // 重ね板（武者の袖のような作り）：上は平らな冠板（縁に暗い縁取り）。その下、肩の外側だけに、少し反った横長の板を 3 枚。
  // 上の板の裾が下の板の上の端の外にかぶさり、下ほど外へ開く。どの板も下の縁と前後の縁に暗い縁取り、縦に 2 本の紐（縅）が通る。
  // シャフトは冠板の裏へ
  { id: 'shoulderarmorlayer', name: '肩アーマー（重ね板）', cat: '肩アーマー', size: [0.34, 0.4, 0.46], top: 0.068, cx: 0.09,
    pieces: [
      piece('冠板', [...crown('y', 1, (x, z) => 0.097 - 0.08 * (x - 0.09) ** 2 - 0.1 * z * z, steps(-0.05, 0.24, 3), steps(-0.21, 0.21, 3)),
        YL(0.072), XL(-0.02), XH(0.242), ZL(-0.212), ZH(0.212), P([1, 1, 0], [0.228, 0.09, 0]), P([-1, 1, 0], [-0.008, 0.09, 0]), P([0, 1, 1], [0, 0.09, 0.2]), P([0, 1, -1], [0, 0.09, -0.2])], { ...A }),
      piece('冠板の縁', [YL(0.06), YH(0.08), XL(-0.03), XH(0.254), ZL(-0.224), ZH(0.224), P([1, 1, 0], [0.244, 0.075, 0]), P([0, 1, 1], [0, 0.075, 0.214]), P([0, 1, -1], [0, 0.075, -0.214])], { ...A, color: DARK }),
      ...[0, 1, 2].flatMap(i => {
        // 板の反りは、中心を内（x −0.1）に置いた大きな円の筒。外の真ん中で x ≈ 0.215 + 1.6 cm ずつ外、前後は ±38°（z ±0.2）まで
        const y0 = 0.07 - 0.09 * i, y1 = y0 - 0.115, R = 0.315 + 0.016 * i, C = [-0.1, 0], a = 38;
        const r = (k, d = 0) => [R + k * 0.03 + d, R + k * 0.03 + d];   // k = 0 上の端、1 下の端
        const at = y => (y0 - y) / (y0 - y1);                          // 上の端からの割合
        const trimY = y1 + 0.022;
        return [
          ...lame(`重ね板 ${i + 1}`, C, y0, r(0), y1, r(1), { a0: -a, a1: a }),
          ...lame(`重ね板 ${i + 1}の下の縁`, C, trimY, r(at(trimY), 0.008), y1 - 0.002, r(1, 0.008), { a0: -a - 1, a1: a + 1, t: 0.03, o: { color: DARK } }),
          ...[-1, 1].flatMap(sgn => lame(`重ね板 ${i + 1}の${sgn > 0 ? '前' : '後ろ'}の縁`, C, y0 - 0.004, r(0.04, 0.007), trimY, r(at(trimY), 0.007),
            { a0: sgn > 0 ? a - 4 : -a - 1, a1: sgn > 0 ? a + 1 : -a + 4, t: 0.028, o: { color: DARK } })),
          ...[-15, 15].flatMap(c => lame(`重ね板 ${i + 1}の紐（${c > 0 ? '前' : '後ろ'}）`, C, y0 - 0.004, r(0.04, 0.005), trimY, r(at(trimY), 0.005),
            { a0: c - 1.5, a1: c + 1.5, t: 0.026, o: { color: DARK } })),
        ];
      })] },
];
export default ARMORS.map(d => withShaft(d));
