// 空を飛ぶ XS：背中の LWC の受け 2 つ（飛行形態で LWC の留め具がかみ合う所。LWC を外した後も胴に残る）
// 置く所は体の背中の真ん中の深さを読んだ値（flight/probe_back.mjs）：
//   上の受け：肩甲骨の間、背中のランドセルの頂（高さ 2.47、深さ 0.433）。骨 torso
//   下の受け：腰の後ろ（高さ 1.86、深さ 0.30。腰の後ろの舌の上）。骨 hips
// 形：背中の面に食い込んだ台（角を落とした板）と、その上から後ろへ立つ舌（LWC の留め具の 2 枚の爪が左右から挟む）。舌の口には横に抜けた穴（爪の軸が通る）
// 作った物：flight スレッド（2026-11-15、まとめ役の頼み「胴に LWC の受け 2 つを作り、留め具をそこへかみ合わせて」）。torso.mjs には手を入れていない
import { planesFromPoints } from '../../../xs-editor/xsasm-lib.js';
const ARMOR = '#78877f', FRAME = '#292e31';
const r6 = v => Math.round(v * 1e6) / 1e6;
const block = (name, o = {}) => ({ kind: 'hull', op: 'add', color: ARMOR, mirror: false, bevel: 0, bevelSegs: 1, bone: 'torso', pivot: 'auto', team: false, glow: null, metal: 0.42, rough: 0.6,
  noHit: false, noHeight: false, blockout: false, pos: [0, 0, 0], tf: { p: [0, 0, 0], r: [0, 0, 0], s: [1, 1, 1] }, name, ...o });
const hull = (name, pts, o = {}) => block(name, { planes: planesFromPoints(pts.map(p => p.map(r6))), ...o });

// 受けの寸法（LWC の留め具の爪は x ±0.045〜0.095 の内に入る）
export const MOUNTS = [
  { tag: '上', y: 2.47, depth: 0.433, bone: 'torso' },
  { tag: '下', y: 1.86, depth: 0.30, bone: 'hips' },
];
export const PAD = { hw: 0.12, hl: 0.11, sink: 0.035, out: 0.025 };     // 台：横の半分・高さの半分・面の中へ・面の外へ
export const TONGUE = { hw: 0.035, hl: 0.085, h: 0.075 };             // 舌：横の半分・高さの半分・台の上からの高さ

const P = [];
for (const m of MOUNTS) {
  const s = -m.depth, z0 = s + PAD.sink, z1 = s - PAD.out, zt = z1 - TONGUE.h;
  // 台：外の縁を落とした板（外の面は、四隅を 0.02 内へ寄せる）
  P.push(hull(`背中の LWC の受けの台（${m.tag}）`, [
    ...[[PAD.hw, PAD.hl], [-PAD.hw, PAD.hl], [PAD.hw, -PAD.hl], [-PAD.hw, -PAD.hl]].map(([x, y]) => [x, m.y + y, z0]),
    ...[[PAD.hw - 0.02, PAD.hl - 0.02], [-PAD.hw + 0.02, PAD.hl - 0.02], [PAD.hw - 0.02, -PAD.hl + 0.02], [-PAD.hw + 0.02, -PAD.hl + 0.02]].map(([x, y]) => [x, m.y + y, z1]),
  ], { bone: m.bone, color: FRAME }));
  // 舌：台の上から後ろへ立つ。先は前後を落とす
  P.push(hull(`背中の LWC の受けの舌（${m.tag}）`, [
    ...[[TONGUE.hw, TONGUE.hl], [-TONGUE.hw, TONGUE.hl], [TONGUE.hw, -TONGUE.hl], [-TONGUE.hw, -TONGUE.hl]].map(([x, y]) => [x, m.y + y, z1 + 0.005]),
    ...[[TONGUE.hw, TONGUE.hl - 0.025], [-TONGUE.hw, TONGUE.hl - 0.025], [TONGUE.hw, -TONGUE.hl + 0.025], [-TONGUE.hw, -TONGUE.hl + 0.025]].map(([x, y]) => [x, m.y + y, zt]),
  ], { bone: m.bone }));
  // 舌の横に抜けた穴（爪の軸の通る所）：舌を削る
  P.push(hull(`背中の LWC の受けの穴を削る（${m.tag}）`, [
    ...[[0.05, 0.022], [-0.05, 0.022], [0.05, -0.022], [-0.05, -0.022]].flatMap(([x, y]) => [[x, m.y + y, zt + 0.022], [x, m.y + y, zt + 0.045]]),
  ], { bone: m.bone, op: 'sub' }));
}
export const pieces = P;
