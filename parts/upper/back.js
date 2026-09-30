// 背中（胴の後ろの上、胴の骨 torso）：胴を胸・背中・腹・脇腹に分けたうちの後ろの上。y 0.2〜0.555、z 0.03 より後ろ。原点は胸の下端の中心（y 2.1）。
// 種類ごとに輪郭（横・上から見た形）から違う。広い面は垂直にも水平にもしない。バックパックは背中の後ろに差す（別の組み立て）。
//   反った板と台：縦にも横にも反った板に、バックパックを差す暗い台 2 本
//   大きなこぶ：横から見て後ろへ大きく丸く盛り上がる（後ろへ 12 cm 多く出る）。暗い帯
//   背骨と肋：細い芯の後ろに、背骨の節 6 つと、左右へ回る肋の棒 3 本ずつ
//   放熱板：暗い板に、外へ少し傾いたひれを 7 枚。ひれの上下の縁は斜め
//   肩甲骨：左右の厚い丸い塊と、真ん中の後ろ下を向いた丸い噴射口
import { P, YL, both, piece, DARK, BLACK } from '../../xsasm-lib.js';
import { crown, steps } from '../lower/shape.js';
import { STD, sideX, backZ, hull, mirP, pairPl, slab, unit, cross } from './kit.js';

const { wt, top, zb } = STD;
const ptsBoth = pts => [...pts, ...mirP(pts)];
const coreStd = () => hull('背中の芯', ptsBoth([[sideX(0.2) - 0.005, 0.2, 0.03], [sideX(0.2) - 0.005, 0.2, backZ(0.2)], [sideX(0.3), 0.3, 0.03], [sideX(0.3), 0.3, -zb],
  [wt, 0.47, 0.03], [wt, 0.47, -zb + 0.01], [0.13, top, 0.03], [0.13, top, -zb + 0.06]]), { color: DARK });
const topPlate = (z0 = -zb + 0.03) => piece('背中の上の板', [...crown('y', 1, (x, z) => top + 0.012 - 0.25 * x * x - 0.5 * (z + 0.02) ** 2, steps(-wt + 0.05, wt - 0.05, 5), steps(z0, 0.03, 2)),
  YL(top - 0.03), ...both(P([1, 0.8, 0], [wt - 0.03, top - 0.02, 0])), P([0, 0.6, -1], [0, top, z0]), P([0, 0, 1], [0, 0, 0.03])]);
/** 背中の面（後ろへの出）。z = −fk */
const fk = (x, y) => zb + 0.025 - 0.35 * x * x - 0.5 * (y - 0.33) ** 2;
const side = both(P([1, -0.25, -0.4], [sideX(0.3) - 0.01, 0.3, -zb]));
const plate = (name = '背中の板', o = {}) => piece(name, slab('z', -1, fk, [-(wt - 0.035), wt - 0.035], [0.215, 0.5], { bev: 0.016, depth: 0.06, na: 6, extra: [...side, P([0, 1, -0.6], [0, 0.49, -zb])] }), o);
const B = (id, name, size, pieces) => ({ id, name, cat: '背中', size, pieces });

// ---- 大きなこぶ ----
function hump() {
  const rings = [[0.2, 0.25, 0.19], [0.33, 0.3, 0.3], [0.44, 0.3, 0.31], [0.52, 0.26, 0.26], [top, 0.18, 0.16]];
  const ring = (y, rx, rz, k = 20) => Array.from({ length: k + 1 }, (_, j) => { const a = Math.PI * j / k; return [rx * Math.cos(a), y, Math.min(0.03, -rz * Math.sin(a))]; });
  return B('backhump', '背中（大きなこぶ）', [0.62, 0.36, 0.34], [
    hull('背中のこぶ', rings.flatMap(([y, rx, rz]) => ring(y, rx, rz))),
    hull('こぶの帯', [...ring(0.375, 0.302, 0.305), ...ring(0.4, 0.302, 0.307)].map(p => [p[0] * 1.03, p[1], p[2] * 1.035]), { color: DARK }),
    topPlate(-0.14)]);
}

// ---- 背骨と肋 ----
function spine() {
  const verts = Array.from({ length: 6 }, (_, k) => {
    const y0 = 0.215 + k * 0.055, y1 = y0 + 0.042, zb0 = -0.09, zb1 = -0.165 - 0.01 * Math.sin(Math.PI * k / 5);
    return hull(`背骨の節 ${k + 1}`, ptsBoth([[0.045, y0, zb0], [0.045, y1, zb0], [0.035, y0 + 0.006, zb1 + 0.012], [0.035, y1 - 0.004, zb1], [0.015, y0 + 0.008, zb1 - 0.006], [0.015, y1, zb1 - 0.01]]), k % 2 ? { color: DARK } : {});
  });
  // 肋：背骨の横から外の前へ回る棒。外ほど下がる
  const rib = (name, y) => Array.from({ length: 6 }, (_, j) => {
    const pts = [];
    for (const t of [0.12 + 1.35 * j / 6 - 0.02, 0.12 + 1.35 * (j + 1) / 6 + 0.02]) {
      const x = 0.29 * Math.sin(t), z = -0.15 * Math.cos(t) + 0.005, yy = y - 0.04 * t;
      for (const [dr, dy] of [[0, 0.012], [0, -0.012], [-0.022, 0.012], [-0.022, -0.012]]) pts.push([x * (1 + dr / 0.29), yy + dy, z * (1 + dr / 0.15)]);
    }
    return hull(`${name}（${j + 1}）`, pts);
  });
  const ribs = [0, 1, 2].flatMap(k => rib(`肋 ${k + 1}（+x）`, 0.44 - 0.08 * k));
  return B('backspine', '背中（背骨と肋）', [0.62, 0.36, 0.22], [
    hull('背中の芯', ptsBoth([[0.24, 0.2, 0.03], [0.24, 0.2, -0.1], [0.3, 0.45, 0.03], [0.3, 0.45, -0.11], [0.13, top, 0.03], [0.13, top, -0.1]]), { color: DARK }),
    topPlate(-0.1), ...verts, ...ribs, ...ribs.map(pc => ({ ...pc, name: pc.name.replace('+x', '−x'), planes: pc.planes.map(p => [-p[0], p[1], p[2], p[3]]) }))]);
}

// ---- 放熱板 ----
function fins() {
  const fin = (x, k) => {
    const out = Math.sign(x) * 0.012, z = y => -(fk(x, y) - 0.01);   // 外へ少し傾ける。上下の縁は斜め
    // ひれは根元が厚く先が薄い（横の面も立てない）
    return hull(`放熱板のひれ ${k + 1}`, [[x - 0.008, 0.245, z(0.245)], [x + 0.008, 0.245, z(0.245)], [x - 0.008, 0.49, z(0.49)], [x + 0.008, 0.49, z(0.49)],
      [x + out - 0.003, 0.27, z(0.27) - 0.07], [x + out + 0.003, 0.27, z(0.27) - 0.07], [x + out - 0.003, 0.46, z(0.46) - 0.085], [x + out + 0.003, 0.46, z(0.46) - 0.085]]);
  };
  return B('backfins', '背中（放熱板）', [0.62, 0.36, 0.3], [coreStd(), topPlate(), plate('放熱板の台', { color: DARK }),
    ...[-0.18, -0.12, -0.06, 0, 0.06, 0.12, 0.18].map((x, k) => fin(x, k))]);
}

// ---- 肩甲骨 ----
function blades() {
  // 噴射口：後ろ下を向いた丸い輪（12 枚の板）と、奥の黒い円盤
  const o = [0, 0.37, -(fk(0, 0.37) + 0.005)], n = unit([0, -0.35, -1]), u = [1, 0, 0], v = unit(cross(n, u));
  const at = (r, a, c) => [0, 1, 2].map(i => o[i] + r * (Math.cos(a) * u[i] + Math.sin(a) * v[i]) + c * n[i]);
  const port = Array.from({ length: 12 }, (_, j) => {
    const pts = [];
    for (const a of [(j - 0.1) * Math.PI / 6, (j + 1.1) * Math.PI / 6]) for (const [r, c] of [[0.065, -0.02], [0.065, 0.035], [0.045, -0.02], [0.047, 0.035]]) pts.push(at(r, a, c));
    return hull(`噴射口の輪 ${j + 1}`, pts, { color: DARK });
  });
  const disc = hull('噴射口の奥', Array.from({ length: 12 }, (_, j) => [at(0.047, j * Math.PI / 6, -0.005), at(0.047, j * Math.PI / 6, 0.005)]).flat(), { color: BLACK });
  return B('backblades', '背中（肩甲骨）', [0.62, 0.36, 0.3], [coreStd(), topPlate(), plate(),
    ...pairPl('肩甲骨', slab('z', -1, (x, y) => fk(x, y) + 0.06 - 1.1 * (x - 0.17) ** 2 - 1.2 * (y - 0.39) ** 2, [0.075, wt - 0.045], [0.25, 0.51],
      { bev: 0.026, depth: 0.12, na: 4, nb: 4, extra: [P([1, 0.4, -0.3], [wt - 0.05, 0.45, -zb]), P([-1, 0, -0.5], [0.075, 0, -zb - 0.04])] })),
    ...port, disc]);
}

export default [
  B('back', '背中（反った板と台）', [0.62, 0.36, 0.26], [coreStd(), topPlate(), plate(),
    ...pairPl('バックパックの台', slab('z', -1, (x, y) => fk(x, y) + 0.018 - 0.4 * (x - 0.1) ** 2, [0.075, 0.125], [0.24, 0.49], { bev: 0.009, depth: 0.05, na: 2, nb: 4 }), { color: DARK })]),
  hump(), spine(), fins(), blades(),
];
