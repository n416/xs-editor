// ひざ当ての角度：すねに付くひざ当ては、付け根（盾の下の端の裏。すねの前の上の端）を軸に前へ倒せる。
// 前スカートに当たらない（スカートを押さない）いちばん小さい角度を、置いてある前スカートに合わせて選ぶ。
// 短いスカートなら倒さない。スカートが長い・ひざ当てが大きいほど、大きく倒す（スカートの裾の前へ出す）。[独自]
// 調べる姿勢は、脚の動く範囲ぜんぶ（前後の振り × ひざの曲げ。TILT_GRID）と、ゲームの動き。ゲームの動きだけだと、脚を少し後ろへ引いた
// 姿勢が抜けて、そこでひざ当てがスカートの裾に入り、スカートが一気に開く（歩くたびにスカートがパカパカする）。
// xs-editor/lowerasm.js（組み立て画面）と tools/lowergen/limbcheck.mjs（確認ツール）が同じ決め方で使う。
import { pushAngle } from './skirtpush.js';

/** 倒す軸（部品の座標の y・z、ひざの中心が原点）。横（x）の軸 */
export const TILT_PIVOT = [-0.2, 0.105];
/** 試す角度（度）：0 から TILT_MAX まで TILT_STEP ずつ。TILT_EPS：ひざ当てがスカートを押してよい余り（ラジアン） */
export const TILT_STEP = 3, TILT_MAX = 60, TILT_EPS = 0.02;
/** 脚の動く範囲の姿勢 [太もも, ひざ]（度。太ももは前へ上げると正、ひざは曲げると負）。先に、当たりやすい姿勢（立つ・後ろへ振る）を並べる。
 *  太ももを大きく前へ上げるのは、ひざを曲げたときだけ（まっすぐの脚を高く上げる動きは無い）：ひざは太ももの角度の 0.5〜1 倍 */
export const TILT_GRID = [
  ...[0, -20, -40, -60, -80, -100].flatMap(k => [0, -6, -12, -18, -24, -30].map(l => [l, k])),
  ...[0, -20, -40, -60].flatMap(k => [6, 12, 18, 24, 30].map(l => [l, k])),
  ...[38, 46, 54, 62, 70, 78, 86, 94].flatMap(l => [0.5, 0.65, 0.8, 1].map(f => [l, -Math.round(l * f)])),
];

/** 角度 deg（前へ倒すと正）だけ倒したときの、置く位置のずれ [dy, dz]。部品は原点のまわりに回るので、軸が動かないように戻す分。scal は部品の拡大 */
export function tiltShift(deg, scal = [1, 1, 1]) {
  const r = deg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r), y = TILT_PIVOT[0] * scal[1], z = TILT_PIVOT[1] * scal[2];
  return [y - (y * c - z * s), z - (y * s + z * c)];
}
/** 置いた部品 it（{ mov, rot, scal, tilt }）を、角度 deg に倒した部品にして返す（前に倒してあった分 tilt は戻してから） */
export function tilted(it, deg) {
  const prev = it.tilt ?? 0, scal = it.scal ?? [1, 1, 1], a = tiltShift(prev, scal), b = tiltShift(deg, scal), rot = it.rot ?? [0, 0, 0];
  const r4 = v => Math.round(v * 1e4) / 1e4;
  return { ...it, mov: [it.mov[0], r4(it.mov[1] - a[0] + b[0]), r4(it.mov[2] - a[1] + b[1])], rot: [Math.round((rot[0] - prev + deg) * 10) / 10, rot[1], rot[2]], tilt: deg };
}

/** スカートが開ききる角度（skirtpush.js の pushAngle の上限）。これに達したら、開ききっても脚の部品を避けられていない */
const CAP = 1.9;
/**
 * 片側のひざ当ての角度。side = { skirts, poses, other, guard, moves }：
 *   moves：poses のうち、ゲームの動きが始まる番号（その前は TILT_GRID の姿勢）。relaxed のときは、ゲームの動きだけで調べる
 *   skirts：その脚の側の前スカート [{ tris, hinge: [y, z], dir, x: [x0, x1] }]（閉じた姿勢の形。skirtpush.js の pushAngle に渡す形）
 *   poses：調べる姿勢の並び（中身は other・guard に渡すだけ）
 *   other(pose)：その姿勢での、ひざ当て以外の脚の部品の横から見た形（skirtpush.js の bandedOutlines の並び）
 *   guard(pose, deg)：角度 deg に倒したひざ当ての、その姿勢での形
 * from 以上で条件に合う、いちばん小さい角度を返す。無ければ { tilt: 0, ok: false }。条件は、どの姿勢でも：
 *   relaxed でないとき：ほかの脚の部品に押されて開いたスカートの位置（その角度 + TILT_EPS まで）で、ひざ当てがスカートに当たらない
 *                      （ひざ当てはスカートを押さない）
 *   relaxed のとき：ゲームの動きの姿勢で、スカートが開ききらずに、脚とひざ当てを避けられる（ひざ当てがスカートを押すのは許す）
 */
export function fitTilt(side, from = 0, relaxed = false) {
  const { skirts, poses, other, guard } = side;
  if (!skirts.length) return { tilt: from, ok: true };
  // ほかの脚の部品の形と、それが押す角度（姿勢ごとに 1 回だけ求めて覚える）
  side.oth ??= []; side.base ??= poses.map(() => []);
  const oth = i => (side.oth[i] ??= other(poses[i]));
  const base = (i, k) => (side.base[i][k] ??= pushAngle(skirts[k], oth(i)));
  for (let deg = from; deg <= TILT_MAX; deg += TILT_STEP) {
    let ok = true;
    for (let i = relaxed ? side.moves ?? 0 : 0; i < poses.length && ok; i++) {
      const g = guard(poses[i], deg);
      for (let k = 0; k < skirts.length && ok; k++) {
        const b = base(i, k);
        if (b >= CAP - 0.011) continue;                     // ひざ当てが無くても開ききっている姿勢は数えない
        if (!relaxed) { if (pushAngle(skirts[k], g, { min: b }) > b + TILT_EPS) ok = false; }
        else if (pushAngle(skirts[k], [...oth(i), ...g], { min: b }) >= CAP - 0.011) ok = false;
      }
    }
    if (ok) return { tilt: deg, ok: true };
  }
  return { tilt: 0, ok: false };
}
/**
 * 左右のひざ当てを同じ角度にそろえる：どちらの側でも条件に合う、いちばん小さい角度。sides は fitTilt の side の並び（左右。片方だけでもよい）。
 * まず「スカートを押さない」角度を探し、無ければ（ひざまで届く長いスカート）「押すが、開ききって引っかかることは無い」角度にする（pushes: true）
 */
export function fitTiltBoth(sides) {
  for (const relaxed of [false, true]) {
    let from = 0, failed = false;
    for (let n = 0; n < 6 && !failed; n++) {
      const res = sides.map(sd => fitTilt(sd, from, relaxed));
      if (res.some(r => !r.ok)) { failed = true; break; }
      const m = Math.max(...res.map(r => r.tilt));
      if (res.every(r => r.tilt === m)) return { tilt: m, ok: true, pushes: relaxed };
      from = m;
    }
  }
  return { tilt: 0, ok: false };
}
