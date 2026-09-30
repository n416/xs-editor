// モノアイの帯：顔の前に付ける、横に回り込む暗い帯。前を 5 面（正面・左右の斜め・左右の横）で囲む多角形の輪で、後ろは開いている。
// 帯の中央の前に 1 つの光る丸いレンズ（8 角形）。帯の上下に細い明るい縁の板（帯より少し外へ出る）。中心が原点、前が +z
import { P, XH, XL, YH, YL, ZH, ZL, both, piece, pair, MAIN, DARK, BLACK, GLOW } from '../xsasm-lib.js';

// 帯の外形（上から見た五角形）：正面 z 0.052（|x| 0.048 まで）、斜め 45 度で (0.048, 0.052) → (0.096, 0.004)、横 x 0.096（z 0.004 → -0.06 で開く）
const T = 0.012;                                          // 帯の厚み（外の面から内の面まで）
const C1 = [0.048, 0, 0.052], C2 = [0.096, 0, 0.004];     // 角：正面/斜め、斜め/横
const S2 = Math.SQRT1_2;
const M1 = P([1 + S2, 0, -S2], C1), M2 = P([S2, 0, -1 - S2], C2);   // 角の継ぎ目（隣り合う面の二等分の面）。輪を外へ広げても同じ面
const neg = p => [-p[0], -p[1], -p[2], -p[3]];            // 同じ面の反対側（法線を反転）

/** 五角形の輪を 5 枚の板で。d は外へ広げる量、y0..y1 は高さ。内の面は帯と同じ（縁の板は帯にぴったり重なる） */
function ring(name, d, y0, y1, o) {
  const inner = 0.1 - T * Math.SQRT2;                     // 斜めの内の面：x + z = inner
  return [
    piece(`${name}・前`, [ZH(0.052 + d), ZL(0.052 - T), YL(y0), YH(y1), ...both(M1)], o),                                   // 正面の板
    ...pair(`${name}・斜め`, [P([1, 0, 1], [C1[0] + d * S2, 0, C1[2] + d * S2]), P([-1, 0, -1], [inner / 2, 0, inner / 2]),   // 45 度の板
      YL(y0), YH(y1), neg(M1), M2], o),
    ...pair(`${name}・横`, [XH(0.096 + d), XL(0.096 - T), YL(y0), YH(y1), ZL(-0.06), neg(M2)], o),                          // 横の板（後ろは開く）
  ];
}

/** 8 角形の柱（上下左右に平らな面）：後ろ z0 で半径 r0、前 z1 で半径 r1（前へすぼまる） */
function oct(r0, z0, r1, z1) {
  const n = norm2(z1 - z0, r0 - r1);                     // 側面の法線（半径方向, z 方向）
  return [ZH(z1), ZL(z0), ...Array.from({ length: 8 }, (_, i) => {
    const th = i * Math.PI / 4;
    return P([n[0] * Math.cos(th), n[0] * Math.sin(th), n[1]], [r0 * Math.cos(th), r0 * Math.sin(th), z0]);
  })];
}
function norm2(a, b) { const l = Math.hypot(a, b); return [a / l, b / l]; }
const BEZEL = oct(0.0195, 0.048, 0.0195, 0.056);          // レンズの受け（黒い 8 角形の座）：正面の板から少し出る。帯の高さいっぱい
const LENS = oct(0.017, 0.052, 0.0135, 0.06);             // レンズ：受けの中央から前へ出て、前へ少しすぼまる

export default {
  id: 'monoeye', name: 'モノアイの帯', cat: '顔', size: [0.2, 0.05, 0.12],
  pieces: [
    ...ring('帯', 0, -0.02, 0.02, { color: DARK }),          // 暗い帯（高さ 0.04）
    ...ring('上縁', 0.004, 0.02, 0.025, { color: MAIN }),     // 上の明るい縁（厚さ 0.005、帯より 0.004 外へ）
    ...ring('下縁', 0.004, -0.025, -0.02, { color: MAIN }),   // 下の明るい縁
    piece('レンズの座', BEZEL, { color: BLACK }),             // レンズを受ける黒い座
    piece('レンズ', LENS, { color: GLOW, glow: true, metal: 0, rough: 0.3 }),
  ],
};
