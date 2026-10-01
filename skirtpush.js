// スカートが脚に押されて開く角度を求める。スカートは腰（hips）に蝶番で付き、横（x）の軸のまわりに回る。
// 横から見た形（y, z の凸多角形）どうしで、脚の姿勢の太ももと重ならない最小の角度を探す（x の範囲が重なる脚だけ）。
// 角度 θ は、dir = +1（前スカート）なら裾が前へ上がる向き、dir = −1（後ろスカート）なら裾が後ろへ上がる向き。
// 座標はエディタの向き（前が +z）。ゲームの同じ探し方は client/src/skirts.ts（前が −z）。

/** 2D の点（[y, z]）の凸包（反時計回り） */
export function hull2(pts) {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], hi = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (hi.length >= 2 && cross(hi[hi.length - 2], hi[hi.length - 1], q) <= 0) hi.pop(); hi.push(q); }
  return lo.slice(0, -1).concat(hi.slice(0, -1));
}
/** 2 つの凸多角形が margin より近いか（分離軸） */
export function overlaps(a, b, margin = 0) {
  for (const poly of [a, b]) for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    const n = [q[1] - p[1], -(q[0] - p[0])], l = Math.hypot(n[0], n[1]) || 1;
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
    for (const v of a) { const d = (v[0] * n[0] + v[1] * n[1]) / l; a0 = Math.min(a0, d); a1 = Math.max(a1, d); }
    for (const v of b) { const d = (v[0] * n[0] + v[1] * n[1]) / l; b0 = Math.min(b0, d); b1 = Math.max(b1, d); }
    if (a1 + margin <= b0 || b1 + margin <= a0) return false;
  }
  return true;
}
/** 点の並びを中心 c のまわりに、横の軸で回す（three の rotation.x = r と同じ向き：+y が +z へ） */
export const rot2 = (poly, c, r) => { const cs = Math.cos(r), sn = Math.sin(r); return poly.map(([y, z]) => { const dy = y - c[0], dz = z - c[1]; return [c[0] + dy * cs - dz * sn, c[1] + dy * sn + dz * cs]; }); };

/**
 * スカートの形を脚ごとに：その脚の x の幅（と少しの余白）にかかる所の横から見た凸包（y, z）。tris は三角形を x, y, z で並べた数の列
 * （三角形 1 つで 9 個）。幅の中の角と、辺が幅の両端を横切る点を集めるので、頂点の少ない板が脚の幅をまたいでいても取りこぼさない。
 * 脚の幅の外で後ろへ曲がった所は、その脚では押されない（開くとき軸より下へ沈んでも、その脚には当たらない）
 */
export function outlineFor(tris, x0, x1, pad = 0.01) {
  const a = x0 - pad, b = x1 + pad, sel = [];
  for (let t = 0; t < tris.length; t += 9) for (let k = 0; k < 3; k++) {
    const i = t + k * 3, j = t + ((k + 1) % 3) * 3, px = tris[i], qx = tris[j];
    if (px >= a && px <= b) sel.push([tris[i + 1], tris[i + 2]]);
    for (const c of [a, b]) if ((px - c) * (qx - c) < 0) { const f = (c - px) / (qx - px); sel.push([tris[i + 1] + f * (tris[j + 1] - tris[i + 1]), tris[i + 2] + f * (tris[j + 2] - tris[i + 2])]); }
  }
  return sel.length >= 3 ? hull2(sel) : null;
}

/**
 * 凸の部品 1 個（tris は三角形を x, y, z で並べた数の列）を、x の幅 band ごとの帯に分けて、帯ごとの横から見た形にする。
 * 幅の広い太ももと、外で後ろへ曲がるスカートのように、x の場所で形が違うものどうしを、同じ x の所どうしで比べるため
 * （部品まるごとを 1 つの形にすると、外の端の低い所と真ん中の高い所を突き合わせて、当たらないのに当たると出る）
 */
export function bandedOutlines(tris, band = 0.05) {
  let x0 = Infinity, x1 = -Infinity;
  for (let i = 0; i < tris.length; i += 3) { x0 = Math.min(x0, tris[i]); x1 = Math.max(x1, tris[i]); }
  const n = Math.max(1, Math.ceil((x1 - x0) / band)), out = [];
  for (let k = 0; k < n; k++) {
    const a = x0 + (x1 - x0) * k / n, b = x0 + (x1 - x0) * (k + 1) / n, poly = outlineFor(tris, a, b, 0);
    if (poly) out.push({ poly, pivot: [0, 0], x: [a, b], angle: 0 });
  }
  return out;
}

/** スカートの、x の幅 x0〜x1 にかかる所の形。同じ幅は覚えておく（脚の部品の帯は姿勢が変わっても同じ幅なので、何度も同じ形を求めない） */
function plateFor(skirt, x0, x1, pad) {
  const memo = (skirt._plates ??= new Map()), key = `${Math.round(x0 * 1e4)},${Math.round(x1 * 1e4)},${pad}`;
  if (!memo.has(key)) memo.set(key, outlineFor(skirt.tris, x0, x1, pad));
  return memo.get(key);
}
/**
 * 押されて開く角度（ラジアン、0 以上）。skirt = { poly, hinge: [y, z], dir, x: [x0, x1], tris? }（tris があれば脚ごとに
 * その脚の幅にかかる所の形で調べる）、legs = [{ poly, pivot: [y, z], x: [x0, x1], angle, knee?: [y, z], kneeAngle? }]
 * （angle は脚を前へ上げる角、ラジアン。three では rotation.x = −angle。すねは knee と kneeAngle（ゲームの shin の x、
 * 曲げると負）を付けると、ひざで曲げてから股関節で回す）
 */
export function pushAngle(skirt, legs, { margin = 0.006, max = 1.9, step = 0.01, min = 0 } = {}) {
  const pairs = legs.filter(l => l.x[0] < skirt.x[1] && skirt.x[0] < l.x[1]).map(l => ({
    leg: rot2(l.knee ? rot2(l.poly, l.knee, -(l.kneeAngle ?? 0)) : l.poly, l.pivot, -l.angle),
    plate: skirt.tris ? plateFor(skirt, l.x[0], l.x[1], l.pad ?? 0.01) : skirt.poly,
  })).filter(p => p.plate).filter(p => {
    // 板の届く範囲（蝶番からいちばん遠い点まで）の外にある脚の形は、どう開いても当たらないので外す（結果は変わらない。速くするだけ）
    const reach = Math.max(...p.plate.map(q => Math.hypot(q[0] - skirt.hinge[0], q[1] - skirt.hinge[1])));
    const c = p.leg.reduce((a, q) => [a[0] + q[0] / p.leg.length, a[1] + q[1] / p.leg.length], [0, 0]);
    const r = Math.max(...p.leg.map(q => Math.hypot(q[0] - c[0], q[1] - c[1])));
    return Math.hypot(c[0] - skirt.hinge[0], c[1] - skirt.hinge[1]) - r <= reach + margin;
  });
  if (!pairs.length) return 0;
  for (let t = min; t <= max; t += step) {   // min：ここから探す（脚の形を分けて別々に求めた角度の大きいほうより下に、全部を避ける角度は無い）
    if (!pairs.some(p => overlaps(rot2(p.plate, skirt.hinge, -skirt.dir * t), p.leg, margin))) return t;
  }
  return max;
}
