// 背中のバックパック（胴の骨 torso）。原点は胸の下端の中心（y 2.1）。胸の背中の板（z −0.2 前後）に前の面を差し込む。
// 噴射口は本当に中が空いた鐘形：短い板を輪に並べた殻と、奥（のど）の黒い円盤。
// 種類：ランドセル（下に噴射口 2 つ）・大型ブースター（縦の筒 2 本と中央の箱）・薄いランドセル（小さな噴射口 4 つ）
import { P, XL, XH, YL, YH, ZL, ZH, both, prismY, planesFromPoints, piece, DARK, BLACK } from '../../xsasm-lib.js';
import { crown, steps } from '../lower/shape.js';

const D = Math.PI / 180;
/** 下向きの噴射口（中心 c が上の端、長さ len、上の外の半径 r0・下 r1、殻の厚み t）。n 枚の殻と黒いのど */
function nozzle(name, c, { len = 0.09, r0 = 0.045, r1 = 0.066, t = 0.012, n = 12 } = {}) {
  const out = [];
  for (let k = 0; k < n; k++) {
    const pts = [];
    for (const a of [(k - 0.1) * 360 / n, (k + 1.1) * 360 / n]) {
      const s = Math.sin(a * D), co = Math.cos(a * D);
      for (const [r, y] of [[r0, 0], [r0 - t, 0], [r1, -len], [r1 - t, -len]]) pts.push([c[0] + r * s, c[1] + y, c[2] + r * co]);
    }
    out.push(piece(`${name}の殻 ${k + 1}`, planesFromPoints(pts), { color: DARK }));
  }
  out.push(piece(`${name}ののど`, [...prismY(r0 - t + 0.002, n, 0).map(p => [p[0], p[1], p[2], p[3] + p[0] * c[0] + p[2] * c[2]]), YL(c[1] - 0.03), YH(c[1] + 0.005)], { color: BLACK }));
  out.push(piece(`${name}の付け根`, [...prismY(r0 + 0.008, n, 0).map(p => [p[0], p[1], p[2], p[3] + p[0] * c[0] + p[2] * c[2]]), YL(c[1] - 0.004), YH(c[1] + 0.03)], { color: DARK }));
  return out;
}
/** 丸い箱：x ±w、y y0〜y1、z z0（前）〜z1（後ろ、負）。後ろと横と上の面を少し丸める */
const pack = (name, w, y0, y1, z0, z1, o = {}) => {
  const cy = (y0 + y1) / 2, cz = (z0 + z1) / 2;
  return piece(name, [...crown('z', -1, (x, y) => -z1 - 0.5 * x * x - 0.4 * (y - cy) ** 2, steps(-w, w, 4), steps(y0, y1, 3)),
    ...crown('y', 1, (x, z) => y1 - 0.5 * x * x - 0.8 * (z - cz) ** 2, steps(-w, w, 4), steps(z1, z0, 2)),
    ...both(P([1, 0, -0.5], [w, 0, z1 + 0.03])), ...both(P([1, 0.5, 0], [w, y1 - 0.03, 0])), ...both(P([1, -0.4, 0], [w, y0 + 0.03, 0])),
    XH(w), XL(-w), YL(y0), ZH(z0), P([0, -1, -0.8], [0, y0, z1 + 0.03])], o);
};
export default [
  { id: 'backpack', name: 'ランドセル（噴射口 2 つ）', cat: 'バックパック', size: [0.44, 0.52, 0.22],
    pieces: [pack('ランドセル', 0.2, 0.14, 0.5, -0.17, -0.36),
      piece('ランドセルのパネル', [...crown('z', -1, (x, y) => 0.372 - 0.5 * x * x - 0.4 * (y - 0.34) ** 2, steps(-0.12, 0.12, 3), steps(0.24, 0.44, 2)),
        ZH(-0.35), XL(-0.12), XH(0.12), YL(0.24), YH(0.44), ...both(P([1, 0, -1], [0.12, 0, -0.36])), P([0, 1, -1], [0, 0.44, -0.36]), P([0, -1, -1], [0, 0.24, -0.36])]),
      piece('噴射口の台', [XL(-0.19), XH(0.19), YL(0.1), YH(0.16), ZH(-0.2), ZL(-0.33), ...both(P([1, -1, 0], [0.19, 0.12, 0])), P([0, -1, -1], [0, 0.1, -0.31])], { color: DARK }),
      ...nozzle('噴射口（+x）', [0.105, 0.105, -0.265]), ...nozzle('噴射口（−x）', [-0.105, 0.105, -0.265])] },
  { id: 'backpackbooster', name: '大型ブースター（筒 2 本）', cat: 'バックパック', size: [0.5, 0.6, 0.3],
    pieces: [pack('ブースターの台', 0.12, 0.2, 0.48, -0.17, -0.31, { color: DARK }),
      ...[1, -1].flatMap(s => [
        piece(`ブースター（${s > 0 ? '+x' : '−x'}）`, [...prismY(0.085, 12, 15).map(p => [p[0], p[1], p[2], p[3] + p[0] * s * 0.16 + p[2] * -0.3]), YL(0.1), YH(0.52),
          P([0, 1, 0], [0, 0.52, 0]), ...[0, 60, 120, 180, 240, 300].map(a => P([Math.sin(a * D), 1.2, Math.cos(a * D)], [s * 0.16 + 0.085 * Math.sin(a * D), 0.5, -0.3 + 0.085 * Math.cos(a * D)]))]),
        piece(`ブースターの帯（${s > 0 ? '+x' : '−x'}）`, [...prismY(0.092, 12, 15).map(p => [p[0], p[1], p[2], p[3] + p[0] * s * 0.16 + p[2] * -0.3]), YL(0.33), YH(0.36)], { color: DARK }),
        ...nozzle(`噴射口（${s > 0 ? '+x' : '−x'}）`, [s * 0.16, 0.1, -0.3], { len: 0.1, r0: 0.07, r1: 0.085 })])] },
  { id: 'backpackslim', name: '薄いランドセル（噴射口 4 つ）', cat: 'バックパック', size: [0.46, 0.44, 0.16],
    pieces: [pack('ランドセル', 0.21, 0.16, 0.49, -0.17, -0.3),
      piece('ランドセルの溝', [XL(-0.215), XH(0.215), YL(0.3), YH(0.32), ZH(-0.2), ZL(-0.305), ...both(P([1, 0, -0.5], [0.21, 0, -0.27]))], { color: DARK }),
      ...[-0.15, -0.05, 0.05, 0.15].flatMap((x, i) => nozzle(`噴射口 ${i + 1}`, [x, 0.16, -0.24], { len: 0.06, r0: 0.032, r1: 0.045, t: 0.009, n: 10 }))] },
];
