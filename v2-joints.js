// 機体エディタ Ver2 のジョイント（issue 1225、テスター ポッチャさん 2026-11-27 #色々なツールへの要望：
// 「形態 1・形態 2 の変形で部品を 1 つずつ動かす手間を、ジョイントでつないでまとめて動かせるようにしたい」）。
// エディタの中の道具だけで、ゲーム・中央・UE は変えない：ジョイントは、つないだパーツの形態 2 からの「ずらす・回す」（item.forms[n] の p・r）をまとめて書く。
//   付け根のパーツ：item.joint = { id: 'j1', type: 'hinge' | 'spin' | 'slide', at: [x, y, z]（軸の点。付け根の原点からの、付け根の向きの座標。拡大は掛けない）,
//                                 axis: 'x' | 'y' | 'z'（付け根の向きの軸）, min, max, v: { 形態の番号: 角度（度）か距離 },
//                                 rev?: true（逆向き：値の向きを返す。issue 1293）, delay?: ミリ秒（付け根が動き出してから、つないだパーツが動き出すまで。issue 1293） }
//   1 つの付け根にジョイントを 2 つ以上（issue 1293、ポッチャさん 2026-11-28「1 つのパーツにジョイントを複数付けられるように」）：
//     item.joint を、その形の並び [{ id: 'j1', … }, { id: 'j2', … }] にする（1 つの時は今までどおりの 1 つの形のまま保存する：putJoints）。
//     ジョイントごとに軸・種類・値・遅れを持ち、つながるパーツはどれか 1 つ（item.jt）につながる。読むのはいつも jointsOn で
//   つながるパーツ：item.jt = 'j1'（付け根でもあってよい：ジョイントの先にジョイント。issue 1293）
// 形態 n のつながるパーツの置き方 ＝ 付け根の形態 n の置き方 × ジョイントの動き（軸の回りに v[n] 度、スライダーは軸の向きに v[n]）× 付け根の形態 1 の置き方の逆 × そのパーツの形態 1 の置き方。
// 付け根・つながるパーツの形態 1 の置き方を直しても、計算し直すと付いてくる（v2.js syncJoints）。
// 連鎖（issue 1293、ポッチャさん 2026-11-28「親が回ったら、子のパーツ・ブロック（ジョイントの軸）も一緒に付いて回るように」）：
//   つながるパーツをさらに付け根にしてよい。親のジョイントから先に計算する（jointOrder）ので、子の付け根の形態 n の置き方に親の動きが入り、子の軸もその先も付いて回る。
//   輪になるつながり（自分の先祖につなぐ）は作らせず、あれば外す（jointCycle）。
// 形態の間の動きは今までどおり、パーツごとに真っ直ぐ（v2-forms.js itemFormDelta）
import * as THREE from 'three';

export const JOINT_KIND = { hinge: 'ヒンジ', spin: '回転', slide: 'スライダー' };
/** 種類ごとの、下限・上限の既定 [独自]（ヒンジ：角度に上限・下限、回転：制限なし（1 回りずつ両へ）、スライダー：距離） */
export const JOINT_RANGE = { hinge: [-90, 90], spin: [-360, 360], slide: [-0.5, 0.5] };
export const isSlide = j => j?.type === 'slide';

/** パーツ it のジョイントの並び（無ければ空。1 つの形でも並びの形でも：issue 1293） */
export const jointsOn = it => (Array.isArray(it?.joint) ? it.joint.filter(Boolean) : it?.joint ? [it.joint] : []);
/** パーツ it のジョイントを list にする（0 なら消し、1 つなら今までの 1 つの形、2 つからは並び） */
export function putJoints(it, list) {
  if (!list.length) delete it.joint; else it.joint = list.length === 1 ? list[0] : list;
  return it;
}
/** id のジョイント（j）とその付け根（it）。無ければ null */
export function jointById(items, id) {
  if (!id) return null;
  for (const it of items) { const j = jointsOn(it).find(x => x.id === id); if (j) return { it, j }; }
  return null;
}
/** it がつながっているジョイントの付け根（親）。無ければ null（it 自身が付け根でも、親を返す） */
export const jointParent = (items, it) => (it?.jt ? items.find(o => o !== it && jointsOn(o).some(j => j.id === it.jt)) ?? null : null);
/** 付け根（item.joint を持つ物）を探す：it が付け根ならそれ、つながるパーツなら付け根。無ければ null */
export function jointRoot(items, it) {
  if (!it) return null;
  if (jointsOn(it).length) return it;
  return jointParent(items, it);
}
/** ジョイント j（省くと付け根の最初のジョイント）につながるパーツの並び */
export function jointKids(items, root, j = jointsOn(root)[0]) {
  return j ? items.filter(o => o !== root && o.jt === j.id) : [];
}
/** it から親へたどった付け根の並び（近い順）。輪になっていたら null */
export function jointAncestors(items, it) {
  const seen = new Set([it]), out = [];
  for (let p = jointParent(items, it); p; p = jointParent(items, p)) { if (seen.has(p)) return null; seen.add(p); out.push(p); }
  return out;
}
/** kid を root のジョイントにつなぐと輪になるか（root が kid 自身か、kid の子孫） */
export function jointCycle(items, root, kid) {
  if (root === kid) return true;
  const up = jointAncestors(items, root);
  return up == null || up.includes(kid);
}
/** 付け根を、親のジョイントが先に来る順に並べる（輪になっている物は入れない） */
export function jointOrder(items) {
  const roots = items.filter(it => jointsOn(it).length).map(it => ({ it, d: jointAncestors(items, it) }));
  return roots.filter(r => r.d).sort((a, b) => a.d.length - b.d.length).map(r => r.it);
}
/** 新しいジョイントの id（今の items に無い物） */
export const newJointId = items => { for (let n = 1; ; n++) if (!items.some(it => jointsOn(it).some(j => j.id === `j${n}`))) return `j${n}`; };
/** 新しいジョイント（ヒンジ、付け根の原点に x の軸） */
export const makeJoint = (items, type = 'hinge') => ({ id: newJointId(items), type, at: [0, 0, 0], axis: 'x', min: JOINT_RANGE[type][0], max: JOINT_RANGE[type][1], v: {} });
/** 値 v をそのジョイントの下限・上限に収める */
export function clampJoint(j, v) {
  const lo = Math.min(j.min, j.max), hi = Math.max(j.min, j.max);
  return Math.max(lo, Math.min(hi, Number.isFinite(v) ? v : 0));
}
/** 形態 n の値（決めていなければ 0、形態 1 はいつも 0） */
export const jointValue = (j, n) => (n > 1 ? clampJoint(j, +(j.v?.[n] ?? 0)) : 0);
/** 種類を変える：下限・上限を新しい種類の既定にし、値を収め直す */
export function setJointType(j, type) {
  j.type = type; [j.min, j.max] = JOINT_RANGE[type];
  for (const n of Object.keys(j.v ?? {})) j.v[n] = clampJoint(j, j.v[n]);
}

const AX = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };
/** ジョイントの値 v の動き（付け根の座標の行列）：軸の点 at を通る軸の回りに v 度。スライダーは軸の向きに v */
export function jointMotion(j, v) {
  const a = AX[j.axis] ?? AX.x;
  if (j.rev) v = -v;   // （逆向き：issue 1293）
  if (isSlide(j)) return new THREE.Matrix4().makeTranslation(a.x * v, a.y * v, a.z * v);
  const at = new THREE.Vector3(...(j.at ?? [0, 0, 0]));
  return new THREE.Matrix4().makeTranslation(at.x, at.y, at.z)
    .multiply(new THREE.Matrix4().makeRotationAxis(a, v * Math.PI / 180))
    .multiply(new THREE.Matrix4().makeTranslation(-at.x, -at.y, -at.z));
}
/**
 * つながるパーツの形態 n のずれ（item.forms[n] の p・r）を出す。行列はどれも、v2.js の置き方の形（位置・向き・拡大）：
 *   Pr / Pc：付け根・つながるパーツの骨の入れ物の世界の行列、Lr1 / Lrn：付け根の形態 1・形態 n の置き方（拡大を掛けない）、
 *   Lc1：つながるパーツの形態 1 の置き方（拡大も）、mov：その位置（fitItem の後）、q0：その向き、J：ジョイントの動き（jointMotion）
 * 返すのは { p: [x, y, z], r: [x, y, z]（度、'XYZ'） }（v2-forms.js look と同じ形：位置に p を足し、向きの後ろに r を掛ける）
 */
export function kidForm({ Pr, Lr1, Lrn, J, Pc, Lc1, mov, q0 }) {
  const M = Pc.clone().invert().multiply(Pr).multiply(Lrn).multiply(J).multiply(Lr1.clone().invert()).multiply(Pr.clone().invert()).multiply(Pc).multiply(Lc1);
  const pos = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  M.decompose(pos, q, s);
  const e = new THREE.Euler().setFromQuaternion(q0.clone().invert().multiply(q), 'XYZ'), D = Math.PI / 180;
  const r4 = v => Math.round(v * 1e4) / 1e4, r2 = v => Math.round(v * 100) / 100;
  return { p: pos.sub(mov).toArray().map(r4), r: [e.x, e.y, e.z].map(v => r2(v / D)) };
}
/** つないだパーツの遅れ（ミリ秒）：付け根の遅れ ＋ ジョイントの遅れ。ジョイントに遅れを決めていなければ null（パーツの遅れのまま） */
export const jointDelayOf = (j, rootDelay) => (j && j.delay != null ? Math.max(0, Math.round(rootDelay + (+j.delay || 0))) : null);
/** 写し（反対側にも・貼り付け）では、ジョイントを外して、値（forms）だけ残す */
export function dropJoint(it) { delete it.joint; delete it.jt; return it; }

// ---- パーツエディタのジョイント（issue 1293 の 1、ポッチャさん 2026-11-28「パーツエディタの方でもジョイントを足せるように」）----
// 置いたパーツのジョイントと同じ形（pc.joint・pc.jt。jointsOn・jointOrder などはそのまま使える）を、パーツの中のブロックに持たせる。
// 違うのは置き方だけ：ブロックは向きを持たず、形態 n の見た目は「ブロックの真ん中 C で r 回し、p ずらす」（v2-forms.js showForms・bakeForm）。
//   付け根の軸の点 at は、付け根のブロックの真ん中からの、パーツの座標（向きもパーツの x・y・z）。
//   形態 n のつながるブロックの置き方 ＝ 付け根の形態 n の置き方 × ジョイントの動き（真ん中から at の点を通る軸）。形態 1 は動かない（付け根もつながるブロックも元の所）。
//   それを、つながるブロックの真ん中 Ck で回す形に直す：r ＝ 置き方の向き、p ＝ 置き方で Ck が行く所 − Ck。
// ブロックの真ん中は bakeForm と同じ boxOf の真ん中（削る前の形、繰り返し・ミラーの写しは入れない）。ミラーの写しは形態のずれが左右に返るので、写しも鏡に写した所で回る。
// 繰り返しの写しは、写しごとに自分の真ん中で回るので、回るジョイントではずれる（スライダーはずれない）
const D = Math.PI / 180;
/** ブロック pc の形態 n の置き方（パーツの座標の行列）。C：ブロックの真ん中 */
export function blockPlace(pc, n, C) {
  const f = n > 1 ? pc?.forms?.[n] : null, p = f?.p ?? [0, 0, 0], r = f?.r ?? [0, 0, 0];
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(r[0] * D, r[1] * D, r[2] * D, 'XYZ'));
  return new THREE.Matrix4().makeTranslation(C.x + p[0], C.y + p[1], C.z + p[2]).multiply(new THREE.Matrix4().makeRotationFromQuaternion(q)).multiply(new THREE.Matrix4().makeTranslation(-C.x, -C.y, -C.z));
}
/** 付け根の真ん中 C を原点にしたジョイントの動き（パーツの座標の行列） */
export const blockMotion = (j, v, C) => new THREE.Matrix4().makeTranslation(C.x, C.y, C.z).multiply(jointMotion(j, v)).multiply(new THREE.Matrix4().makeTranslation(-C.x, -C.y, -C.z));
/** 置き方 T（パーツの座標）を、真ん中 Ck のブロックの形態のずれ { p, r } に */
export function blockForm(T, Ck) {
  const pos = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  T.decompose(pos, q, s);
  const e = new THREE.Euler().setFromQuaternion(q, 'XYZ'), c = Ck.clone().applyMatrix4(T).sub(Ck);
  const r4 = v => Math.round(v * 1e4) / 1e4 || 0, r2 = v => Math.round(v * 100) / 100 || 0;
  return { p: c.toArray().map(r4), r: [e.x, e.y, e.z].map(v => r2(v / D)) };
}
/**
 * パーツのブロック pieces のつながるブロックの形態のずれ（とジョイントの遅れ）を、ジョイントから計算し直す（変わった物があれば true）。
 * top：形態の数、centerOf(pc)：ブロックの真ん中（THREE.Vector3、パーツの座標）、delayOf(pc)：ブロックの遅れ（ミリ秒）、maxDelay：遅れの上限。
 * 付け根の無いつながり・輪になるつながりは外す。親のジョイントから先に計算する（jointOrder）ので、ジョイントの先のジョイントも付いて回る
 */
export function syncBlockJoints(pieces, top, centerOf, delayOf, maxDelay) {
  let changed = false;
  for (const pc of pieces) if (pc.jt && (!jointParent(pieces, pc) || jointAncestors(pieces, pc) == null)) { delete pc.jt; changed = true; }
  const C = new Map(), cen = pc => { if (!C.has(pc)) C.set(pc, centerOf(pc)); return C.get(pc); };
  for (const rt of jointOrder(pieces)) for (const j of jointsOn(rt)) {
    const dl = jointDelayOf(j, delayOf(rt));
    for (const ct of pieces) {
      if (ct === rt || ct.jt !== j.id) continue;
      for (let n = 2; n <= top; n++) {
        const T = blockPlace(rt, n, cen(rt)).multiply(blockMotion(j, jointValue(j, n), cen(rt)));
        const before = JSON.stringify(ct.forms?.[n] ?? null);
        const all = { ...(ct.forms ?? {}) }, f = { ...(all[n] ?? {}), ...blockForm(T, cen(ct)) };
        for (const k of ['p', 'r']) if (f[k].every(v => !v)) delete f[k];
        if (Object.keys(f).length) all[n] = f; else delete all[n];
        if (Object.keys(all).length) ct.forms = all; else delete ct.forms;
        if (JSON.stringify(ct.forms?.[n] ?? null) !== before) changed = true;
      }
      if (dl != null) { const ms = Math.max(0, Math.min(maxDelay, dl)); if (ms !== delayOf(ct)) { if (ms) ct.formDelay = ms; else delete ct.formDelay; changed = true; } }
    }
  }
  return changed;
}
