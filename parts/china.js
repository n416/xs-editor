// あご（見本 A）：もう一つの頭ジェネレーター（見本 A）のあご。前の面は台形（上が広く下が狭い）、その下は斜めの面、外の縁はわずかにすぼまる。
// 資料の単位（1 画素）を K に。目の高さの線を y 0、部品の奥（後ろの面）を z 0 にし、前が +z。attach は頭の殻の座標での置き場所
import { planesFromPoints, piece, MAIN } from '../xsasm-lib.js';

const K = 0.0008;
const both = pts => pts.flatMap(([x, y, z]) => x === 0 ? [[0, y, z]] : [[x, y, z], [-x, y, z]]);
const back = (pts, z) => pts.map(([x, y]) => [x, y, z]);
const f = [[7, -75.2, 88.5], [4.4, -100.6, 89.2], [8.9, -75.2, 83], [8.3, -116, 93.7]];
const raw = both([...f, ...back(f, 30)]);
const YC = -95.6, ZB = 30;
const pts = raw.map(([x, y, z]) => [x * K, (y - YC) * K, (z - ZB) * K]);
export default {
  id: 'china', name: 'あご（見本 A）', cat: 'あご', size: [0.014, 0.033, 0.051], attach: [0, YC * K + 0.023, ZB * K],
  pieces: [piece('あご', planesFromPoints(pts))],
};
