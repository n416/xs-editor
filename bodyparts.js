// 体の組み立て（lowerasm.js で置いた部品の並び）→ 機体エディタ（index.html）の部品。
// 組み立て画面・機体エディタ（体ジェネレーター）・画面なしの道具（tools/bodyxs.ts）が同じものを使う。
//   ・部品の目次（上半身・背中・腕・下半身・脚）と、ランダムに作った動力パイプの登録
//   ・骨が回る中心（jointsOf）：肩・ひじ（2 重関節の上の軸と下の軸）・股関節・ひざ（同じ）・足首・腹
//   ・エディタの部品（bodyParts）：名前「胸・部品・piece」、骨、回転の中心 joint（部品の座標で、その骨が回る点）
// 2 重関節（doublejoint.js）の書き方：節（骨 elbow・knee）は上の軸 P1 のまわり、下の部品（骨 fore・shin）は下の軸 P2 のまわりに回る。
// 曲げが first（ひじ 78°・ひざ 82°）までは下の軸だけが曲がるので、ゲームの「1 点で回す」動きと同じになる。
import * as THREE from 'three';
import { lowerById } from './parts/lower/index.js';
import { upperById, SHOULDER_AT } from './parts/upper/index.js';
import { pipeDef } from './parts/upper/pipegen.js';
import { backById } from './parts/back/index.js';
import { armById } from './parts/arm/index.js';
import { legById, LEG_AT } from './parts/leg/index.js';
import { ELBOW_AXES, KNEE_AXES } from './doublejoint.js';
import { rotMatrix } from './xsasm.js';
import { buildHull, hullReach } from './hull.js';
import { makeSheet } from './xsbody.js';
import { shapesOf, freeShapes, instGeosOf, drawn } from './partgeo.js';
import { freeParts, groupOfPart, isHeldPart, isTrackedSet } from './freeparts.js';

const S = makeSheet();
/** 部品の目次。ランダムに作った動力パイプ（置いた部品に作り方 gen を持つ）は、id「pipegen·…」でここに足す（register） */
export const byId = { ...lowerById, ...upperById, ...backById, ...armById, ...legById };
/** どの部分か（upper・back・lower・arm・leg） */
export const halfOf = id => (armById[id] ? 'arm' : legById[id] ? 'leg' : backById[id] ? 'back' : upperById[id] || String(id).startsWith('pipegen') ? 'upper' : 'lower');
export const register = list => { for (const it of list) if (it.gen) byId[it.part] = pipeDef(it.gen); return list; };
/** 部品が付く骨（部品の最初の piece の bone。無ければ半身ごとの既定：上半身は胸、下半身は腰） */
export const boneOf = def => def.pieces[0].bone ?? (['upper', 'back'].includes(halfOf(def.id)) ? 'torso' : 'hips');
export const SIDED = ['arm', 'elbow', 'fore', 'leg', 'knee', 'shin', 'foot'];
export const sideOf = item => (item.mov[0] >= 0 ? 'l' : 'r');
/** 足首（ひざの中心の 0.87 下） */
export const ANKLE_DROP = 0.87;

/**
 * 関節の間の長さ（標準の体。エディタの単位）：肩〜ひじ・ひじ〜手・股関節〜ひざ・ひざ〜足首。
 * 寸法の調整 adj の upperArm・foreArm・thigh・shin は、この長さに足す量。置いたパーツの数値は標準の体のまま持ち、
 * 表示と書き出しのときに fitItem で掛ける：その区間のパーツ（上腕・前腕・太もも・すね）は縦に伸び縮みし、先のパーツはその分だけ下がる。
 * 脚が伸びた分は体全体が上がる（足の裏は地面のまま）。[独自]
 */
export const SEG = { upperArm: 0.55, foreArm: 0.5, thigh: 0.46, shin: 0.87 };
export const ADJ0 = { up: 0, sh: 0, shY: 0, neck: 0, headK: 1, headZ: 0, upperArm: 0, foreArm: 0, thigh: 0, shin: 0 };
/**
 * 区間のパーツの伸び縮み：[動かさない点 y0, 反対の端 y1]（パーツの座標。原点はひじ・ひざの中心）。y0 は、となりのパーツとつながる端：
 *   上腕  ：下の端（ひじの部品の上の端 +0.092 に合う）を動かさず、上（肩）へ伸びる
 *   前腕  ：上の端（ひじの部品の下の端 −0.082）を動かさず、下（手首 −0.475）へ伸びる
 *   太もも：ひざの上の軸（+0.04）を動かさず、上（股関節 +0.46）へ伸びる
 *   すね  ：ひざの上の軸（+0.04。すねの部品に入っているひざの節の上の軸）を動かさず、下（足首 −0.87）へ伸びる
 * 最初の版は原点のまわりに伸び縮みさせていて、伸ばした分だけ上腕の下の端がひじから離れた（すき間）。
 */
const STRETCH = { 上腕: [0.092, 0.545], 前腕: [-0.082, -0.475], 太もも: [0.04, 0.46], すね: [0.04, -0.87] };
const kOf = ([y0, y1], d) => 1 + (d || 0) / Math.abs(y1 - y0);
/** 区間ごとの伸び縮みの倍率 */
export const segK = (adj = {}) => ({ kU: kOf(STRETCH.上腕, adj.upperArm), kF: kOf(STRETCH.前腕, adj.foreArm), kT: kOf(STRETCH.太もも, adj.thigh), kS: kOf(STRETCH.すね, adj.shin) });
/** ひざの 2 重関節の軸 [上の軸までの高さ, 下の軸までの深さ, 先に曲がる角度]：上の軸は動かず、下の軸はすねと一緒に伸び縮みする */
export const kneeAxesOf = (adj = {}) => { const { kS } = segK(adj), y0 = STRETCH.すね[0]; return [KNEE_AXES[0], (KNEE_AXES[0] + KNEE_AXES[1]) * kS - y0, KNEE_AXES[2]]; };
/** 置いたパーツ it を、寸法の調整 adj の骨格に合わせたもの（位置の y と拡大の y だけが変わる。変わらなければ it そのもの） */
export function fitItem(it, adj) {
  const def = byId[it.part], half = def && adj ? halfOf(it.part) : '';
  if (half !== 'arm' && half !== 'leg') return it;
  const { kU, kF, kT, kS } = segK(adj), c = def.cat;
  // dy：ひじ・ひざの中心が下がる分。区間のパーツ（上腕・前腕・太もも・すね）は、長さを骨格が決める：置いたパーツの縦の拡大は使わず
  //（太さ＝横と前後の拡大だけが効く）、となりとつながる端 y0 がいつも同じ所に来る。太くしようと全体を 1.5 倍にした上腕が、
  // ひじから離れたり肩を突き抜けたりしない
  const sy = Math.abs(it.scal[1]) || 1, seg = (k, y0) => { ky = k / sy; dy += y0 * (1 - k); };
  let dy = half === 'arm' ? -(adj.upperArm || 0) : -(adj.thigh || 0), ky = 1;
  if (c === '上腕') seg(kU, STRETCH.上腕[0]);
  else if (c === '前腕') seg(kF, STRETCH.前腕[0]);
  else if (c === '前腕の飾り') { ky = kF; dy += STRETCH.前腕[0] * (1 - kF) * sy; }   // 飾りは前腕に沿って動く（大きさは置いたまま × 前腕の伸び）
  else if (c === '手') dy -= adj.foreArm || 0;
  else if (c === '太もも') seg(kT, STRETCH.太もも[0]);
  else if (c === 'すね') seg(kS, STRETCH.すね[0]);
  else if (c === 'ひざ当て' && def.pieces[0].bone === 'shin') { ky = kS; dy += STRETCH.すね[0] * (1 - kS) * sy; }   // すねに付くひざ当ては、すねと一緒に伸び縮みする（付け根が離れない）
  else if (c === '足') dy -= adj.shin || 0;
  if (!dy && ky === 1) return it;
  return { ...it, mov: [it.mov[0], it.mov[1] + dy, it.mov[2]], scal: [it.scal[0], it.scal[1] * ky, it.scal[2]] };
}
const up = (p, d) => [p[0], p[1] + d, p[2]];
/** その側に 2 重関節の節（骨 elbow・knee）の部品があるか */
export const hasLink = (items, bone, s) => items.some(it => sideOf(it) === s && byId[it.part]?.pieces.some(pc => pc.bone === bone));

/** 骨が回る中心（立った姿勢の座標）。節の無い側は、ひじ・ひざの中心の 1 点。adj：寸法の調整（関節の間の長さ） */
export function jointsOf(items, adj = {}) {
  const ax = kneeAxesOf(adj);
  const J = { torso: [0, S.belly.y, 0] };
  for (const [s, sign] of [['l', 1], ['r', -1]]) {
    const sj = items.find(it => byId[it.part]?.cat === '肩関節' && Math.sign(it.mov[0] || 1) === sign);
    const sh = sj ? sj.mov.slice() : [sign * SHOULDER_AT[0], SHOULDER_AT[1], SHOULDER_AT[2]];
    const E = [sh[0] + sign * 0.13, sh[1] - SEG.upperArm - (adj.upperArm || 0), sh[2]], el = hasLink(items, 'elbow', s);
    J['arm_' + s] = sh;
    if (el) J['elbow_' + s] = up(E, ELBOW_AXES[0]);
    J['fore_' + s] = el ? up(E, -ELBOW_AXES[1]) : E;
    const K = [sign * LEG_AT[0], LEG_AT[1] - (adj.thigh || 0), LEG_AT[2]], kn = hasLink(items, 'knee', s);
    J['leg_' + s] = [sign * S.hip.x, S.hip.y, 0];
    if (kn) J['knee_' + s] = up(K, ax[0]);
    J['shin_' + s] = kn ? up(K, -ax[1]) : K;
    J['foot_' + s] = up(K, -ANKLE_DROP - (adj.shin || 0));
  }
  return J;
}

/** オーブ（ORB）の大きさ：部品 id → [記号, 砲身の長さ] */
export const ORB_SIZE = { wgorbs: ['s', 1.0], wgorb: ['m', 1.5], wgorbl: ['l', 2.0] };
/**
 * 置いてあるオーブの番号：機体の右（エディタの −x、ゲームの +x）が偶数、左が奇数。それぞれ体に近い順（同じなら上から）に 0, 2, 4… / 1, 3, 5…。
 * ゲームは骨 orb_<番号> でオーブ 1 基を隠し、収納口の位置と向きを orb_dock_<番号> から読む（docs/models.md「オーブ」）
 */
export function orbNumbers(items) {
  const out = new Map();
  for (const sgn of [-1, 1]) items.filter(it => ORB_SIZE[it.part] && (it.mov[0] < 0 ? -1 : 1) === sgn)
    .sort((a, b) => Math.abs(a.mov[0]) - Math.abs(b.mov[0]) || b.mov[1] - a.mov[1]).forEach((it, j) => out.set(it, 2 * j + (sgn < 0 ? 0 : 1)));
  return out;
}
const HALF_LABEL = { upper: '胸', back: '背', arm: '腕', leg: '脚', lower: '腰' };
const r5 = v => Math.round(v * 1e5) / 1e5;
/**
 * 置いた部品の並び → { parts: 機体エディタの部品, anchors: { neck: 首の付け根, hand_r: 右手の中心 } }。
 * adj：寸法の調整（up：上半身を上下に動かした量。首の付け根がその分動く）。colorOf(pc, def)：ブロックの色を決める（機体エディタ Ver2 の塗り。無ければ部品の色）
 */
export function bodyParts(items, adj = {}, colorOf = null) {
  const J = jointsOf(items, adj), hand = new THREE.Box3(), v = new THREE.Vector3(), orbs = orbNumbers(items);
  const parts = items.flatMap(src => {
    const def = byId[src.part];
    if (!def) return [];
    if (def.free) {   // 自由な部品（機体エディタの形式）：元の部品の並びへ戻す
      // 右手（武器を持たせる所）：前腕・手に付く「手」という名前の部品のうち、機体の右（−x）にあるもの（機体エディタの書き出しと同じ探し方）
      const tracked = isTrackedSet(def.pieces), M = new THREE.Matrix4().compose(new THREE.Vector3(...src.mov), new THREE.Quaternion().setFromRotationMatrix(rotMatrix(src.rot)), new THREE.Vector3(...src.scal));
      for (const pc of def.pieces) if (drawn(pc) && !isHeldPart(pc) && groupOfPart(pc, tracked) === 'fore' && /手/.test(pc.name ?? '') && !/手首/.test(pc.name ?? '')) for (const g of instGeosOf(def, pc)) {
        if (!g.boundingBox) g.computeBoundingBox();
        const b = g.boundingBox.clone().applyMatrix4(M);
        if (!g.boundingBox.isEmpty() && b.min.x + b.max.x < 0) hand.union(b);
      }
      return freeParts(def, src, freeShapes);
    }
    const it = fitItem(src, adj);   // 関節の間の長さを掛けた置き方
    const R = rotMatrix(it.rot), e = new THREE.Euler().setFromRotationMatrix(R, 'XYZ');
    const half = halfOf(it.part), upper = half === 'upper' || half === 'back', q = new THREE.Quaternion().setFromRotationMatrix(R);
    // 書き出すブロック（partgeo.js の shapesOf）：カタログのパーツは凸の形そのまま。パーツエディタで作った押し出し・回転体・削った形は三角形で
    return shapesOf(def).map(({ pc, shape }) => {
      const off = new THREE.Vector3(...(pc.pos ?? [0, 0, 0])).multiply(new THREE.Vector3(...it.scal)).applyMatrix4(R);
      const { pos, hinge, center, ...rest } = pc;
      const bone = pc.bone ?? (upper ? 'torso' : 'hips'), at = [it.mov[0] + off.x, it.mov[1] + off.y, it.mov[2] + off.z];
      const M = new THREE.Matrix4().compose(new THREE.Vector3(...at), q, new THREE.Vector3(...it.scal));
      // その骨が回る点を、部品の座標で持たせる（エディタはこれを骨の位置にする。スカートは蝶番の部品が決める）
      const pv = J[SIDED.includes(bone) ? `${bone}_${sideOf(it)}` : bone];
      const joint = pv ? v.set(...pv).applyMatrix4(M.clone().invert()).toArray().map(r5) : null;
      // オーブ：番号・大きさと、収納口の点（オーブの原点）を部品の座標で。向きは部品の回転そのまま（砲身が −y、収納口の面の向きが z）
      const orb = orbs.has(src) ? { i: orbs.get(src), size: ORB_SIZE[it.part][0], len: ORB_SIZE[it.part][1], dock: v.set(...it.mov).applyMatrix4(M.clone().invert()).toArray().map(r5) } : null;
      if (def.cat === '手' && it.mov[0] < 0) {
        const ps = shape.tris ?? buildHull(pc.planes, { reach: hullReach(pc.planes) }).positions;
        for (let i = 0; i < ps.length; i += 3) hand.expandByPoint(v.set(ps[i], ps[i + 1], ps[i + 2]).applyMatrix4(M));
      }
      return { ...rest, ...(colorOf ? { color: colorOf(pc, def) } : {}), name: `${HALF_LABEL[half]}・${it.name ?? def.name}・${pc.name}`, bone, pivot: pc.pivot ?? 'none', glow: !!pc.glow, gun: false, noHit: !!pc.noHit, noHeight: half === 'back',
        ...(joint ? { joint } : {}), ...(orb ? { orb } : {}), ...shape, pos: at, rot: [e.x, e.y, e.z], scl: it.scal.slice() };
    });
  });
  return { parts, anchors: { neck: [0, S.neck.y + (adj.up ?? 0), 0], hand_r: hand.isEmpty() ? null : hand.getCenter(new THREE.Vector3()).toArray() } };
}
