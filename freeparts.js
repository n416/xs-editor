// 自由な部品：機体エディタ（index.html。捨てる予定）の形式の部品を、機体エディタ Ver2 のパーツとして持つ。
// 機体エディタの機体 = 部品の並び { name, kind (extrude / lathe / hull / mesh), op, color, mirror, pts, depth, …, bone, pivot, team, glow, pos, rot（ラジアン）, scl }。
// Ver2 では、その並びをそのまま 1 つの「自分のパーツ」（def.free = true）のブロックにする：
//   ブロック = 機体エディタの部品。置き方だけ tf { p: pos, r: rot（度）, s: scl } に直す。ほかの項目（名前・骨・回転の中心・色・陣営色…）はそのまま
//   引くブロックは、一覧で自分より上のブロックを削る（機体エディタと同じ決まり）。左右ミラーは、パーツの x = 0（= 機体の真ん中）で反転
//   付く骨は、機体エディタと同じ決まり（部品の名前から。指定があればそれ）。左右は、その形の真ん中の x で決まる
// 置いたパーツ（item）が動かしていなければ、書き出しでは元の部品の並びにそのまま戻す（機体エディタで書き出すのと同じ形になる）。
import * as THREE from 'three';
import { rotMatrix } from './xsasm.js';

const D = Math.PI / 180;
const rect = (w, h) => [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]];
/** 機体エディタの部品の、形の項目の既定値（保存された機体はぜんぶ持っている。AI が書いた機体は省いていることがある） */
export const E1 = { kind: 'extrude', op: 'add', color: '#c3c9d2', mirror: false, pts: rect(0.8, 0.8), depth: 0.4, bevel: 0.04, bevelSegs: 1, corner: 0, cornerSegs: 1, taper: 1, tiltY: 0, ridge: 0,
  segments: 24, arrayCount: 1, arrayStep: [0, 0.15, 0], metal: 0.55, rough: 0.38, blockout: false, bone: 'auto', team: false, glow: null, pivot: 'auto', noHit: false, noHeight: false, gun: null, opacity: null, side: null, top: null, planes: null };

// ---- 付く骨・回転の中心（機体エディタと同じ決まり） ----
export const BONE_CHOICES = { auto: '自動（名前から）', head: '頭', torso: '胴', hips: '腰', arm: '腕（肩〜ひじ）', elbow: 'ひじの節（2 重関節）', fore: '前腕・手', leg: '太もも', knee: 'ひざの節（2 重関節）', shin: 'すね', foot: '足（足首から下）', cannon: '大砲の砲身', wing: '翼（背中・ゲームが開く）', skirt: 'スカート（腰の蝶番・脚に押されて開く）' };
export const PIVOT_CHOICES = { auto: '自動（名前から）', none: 'なし', head: '頭', torso: '胴', arm: '腕（肩）', fore: '前腕（ひじ）', leg: '太もも（股関節）', shin: 'すね（ひざ）', cannon: '大砲（付け根）', skirt: 'スカート（蝶番）' };
const BONE_RULES = [
  ['hips', /キャタピラ|履帯|車体|転輪|起動輪|誘導輪/],
  ['torso', /ウイング|付け根|バックパック|フィン|ロッド|背中|レーダー|ミサイル|ブースター/],
  ['head', /頭|^首|目|バイザー|トサカ|顔|ヘルメット|ほほ|耳|カメラ|アンテナ|額/],
  ['shin', /すね|ふくらはぎ|ひざ|足首/],
  ['foot', /足|つま先|かかと|靴底/],
  ['leg', /太もも|股関節/],
  ['fore', /前腕|手|指|ライフル|銃|マガジン|マズル|パイル|杭|シールド|バズーカ/],
  ['arm', /肩|腕|ひじ/],
  ['hips', /腰|股|スカート/],
];
const PIVOT_RULES = [['arm', /肩関節/], ['fore', /^ひじ$|ひじ関節/], ['leg', /股関節/], ['shin', /ひざ関節|^ひざ$/], ['foot', /^足首$|足首関節|足首の関節/], ['head', /^首$/], ['torso', /^腹$|腹のフレーム|旋回/],
  ['cannon', /(大砲|キャノン|砲).*(付け根|台座|基部)|砲架/], ['skirt', /スカートの蝶番/]];
const JOINT_PARENT = { arm: 'torso', fore: 'arm', leg: 'hips', shin: 'leg', foot: 'shin', head: 'torso', torso: 'hips', cannon: 'torso', wing: 'torso', skirt: 'hips' };
const GUN_RE = /ライフル|銃|マガジン|マズル/, BAZOOKA_RE = /バズーカ/, CANNON_RE = /大砲|キャノン|砲身/, GLOW_RE = /目|センサー|バイザー|アイ/, TRACK_RE = /キャタピラ|履帯/;
/** 回転の中心になる部品か（どの関節の）。ならなければ null */
export const pivotOfPart = p => {
  if (p.pivot && p.pivot !== 'auto') return p.pivot === 'none' ? null : p.pivot;
  for (const [g, re] of PIVOT_RULES) if (re.test(p.name ?? '')) return g;
  return null;
};
/** キャタピラの機体か（脚の骨が無い：脚の部品は腰に付く） */
export const isTrackedSet = pieces => pieces.some(p => (p.op ?? 'add') === 'add' && !p.blockout && TRACK_RE.test(p.name ?? ''));
/** 部品が付く骨の組（head・torso・hips・arm・elbow・fore・leg・knee・shin・foot・cannon・wing・skirt） */
export const groupOfPart = (p, tracked = false) => {
  let g = 'torso';
  const pv = pivotOfPart(p), name = p.name ?? '';
  if (p.bone && p.bone !== 'auto') g = p.bone;
  else if (pv) g = JOINT_PARENT[pv] ?? 'torso';
  else if (CANNON_RE.test(name) && !GUN_RE.test(name)) g = 'cannon';
  else for (const [k, re] of BONE_RULES) if (re.test(name)) { g = k; break; }
  return tracked && (g === 'leg' || g === 'knee' || g === 'shin' || g === 'foot') ? 'hips' : g;
};
export const isGunPart = p => p.gun ?? GUN_RE.test(p.name ?? '');
/** 手持ちの武器（銃・バズーカ）か */
export const isHeldPart = p => isGunPart(p) || BAZOOKA_RE.test(p.name ?? '');
export const isGlowPart = p => p.glow ?? GLOW_RE.test(p.name ?? '');
/** Ver2 の画面で入れる骨の入れ物：組 g と、その形の真ん中の x（機体の左が +x） */
export const holderKey = (g, cx) => (['arm', 'elbow', 'fore', 'leg', 'knee', 'shin', 'foot'].includes(g) ? `${g}_${cx >= 0 ? 'l' : 'r'}` : g === 'head' ? 'headw' : g === 'hips' || g === 'skirt' ? 'hips' : 'torso');

// ---- 機体エディタの部品 ⇔ ブロック ----
const r5 = v => Math.round(v * 1e5) / 1e5;
/** 機体エディタの部品 → ブロック */
export function blockOf(p) {
  const { pos, rot, scl, id, proxy, _geo, _geoKey, ...rest } = p;
  const out = { ...structuredClone(E1), ...structuredClone(rest), name: String(p.name ?? '部品') };
  out.tf = { p: (pos ?? [0, 0, 0]).map(r5), r: (rot ?? [0, 0, 0]).map(v => v / D), s: (scl ?? [1, 1, 1]).slice() };
  out.pos = [0, 0, 0];
  return out;
}
/** ブロック → 機体エディタの部品 */
export function partOf(pc) {
  const { tf, pos, ...rest } = pc;
  return { ...structuredClone(rest), pos: (tf?.p ?? [0, 0, 0]).slice(), rot: (tf?.r ?? [0, 0, 0]).map(v => v * D), scl: (tf?.s ?? [1, 1, 1]).slice() };
}
/** 機体エディタの部品の並び → Ver2 の自分のパーツ（def.free）。opt.tab：カタログのどのタブに並べるか（'head' = 頭まるごと） */
export function freeDef(id, name, parts, opt = {}) {
  return { id, name, cat: opt.tab === 'head' ? '頭まるごと' : '自由な機体', size: [1, 1, 1], user: true, free: true, half: 'free', ...(opt.tab ? { tab: opt.tab } : {}), ...(opt.role ? { role: opt.role } : {}), ...(opt.from ? { from: opt.from } : {}),
    pieces: parts.filter(p => p && typeof p === 'object').map(blockOf) };
}
/** 置いたパーツが、置いたまま（動かしていない）か */
export const atRest = it => it.mov.every(v => Math.abs(v) < 1e-9) && it.rot.every(v => Math.abs(v) < 1e-9) && it.scal.every(v => Math.abs(v - 1) < 1e-9);
/**
 * 置いた自由なパーツ → 機体エディタの部品の並び。
 *   動かしていなければ：元の部品そのまま（機体エディタで書き出すのと同じ形になる）
 *   動かしてある：形を三角形にして、置き方を掛ける（shapes(def) = partgeo.js の freeShapes。1 個ずつ：ミラーの写しは反対側の骨に付く）
 */
export function freeParts(def, it, shapes) {
  const tracked = isTrackedSet(def.pieces);
  if (atRest(it)) return def.pieces.map(partOf);
  const R = rotMatrix(it.rot), e = new THREE.Euler().setFromRotationMatrix(R, 'XYZ');
  return shapes(def).map(({ pc, shape }) => {
    const { tf, pos, pts, planes, side, top, ...rest } = pc;
    return { ...structuredClone(rest), ...shape, bone: groupOfPart(pc, tracked), pivot: pivotOfPart(pc) ?? 'none', glow: !!isGlowPart(pc), gun: !!isGunPart(pc), pos: it.mov.slice(), rot: [e.x, e.y, e.z], scl: it.scal.slice() };
  });
}

// ---- 頭だけを取り出す ----
/**
 * 部品の並びから、頭の部品（付く骨が頭）と首（名前が「首…」。機体エディタでは胴に付く関節だが、頭と一緒に持っていく：骨を頭にして、回転の中心からは外す）と、
 * 頭を削っている引く部品を取り出す。boxOf(p)：部品の範囲（THREE.Box3）。
 * 戻り値 { parts, bottom: 頭の下の端の高さ（首は入れない）, hasNeck }。頭が無ければ null
 */
export function headOf(parts, boxOf) {
  const tracked = isTrackedSet(parts), isNeck = p => /^首/.test(p.name ?? '') && (p.bone ?? 'auto') === 'auto';
  const isHead = p => !p.blockout && !isHeldPart(p) && (groupOfPart(p, tracked) === 'head' || isNeck(p));
  const solid = parts.filter(p => (p.op ?? 'add') === 'add' && isHead(p));
  if (!solid.length) return null;
  const box = new THREE.Box3(), body = new THREE.Box3();
  for (const p of solid) { const b = boxOf(p); box.union(b); if (!/^首/.test(p.name ?? '')) body.union(b); }
  // 引く部品：名前で頭に付くもの、または骨の指定が無く、頭の範囲の中にあるもの
  const keep = new Set(solid);
  for (const p of parts) if (p.op === 'sub' && !p.blockout) {
    if (isHead(p) && (p.bone !== 'auto' || BONE_RULES[2][1].test(p.name ?? ''))) { keep.add(p); continue; }
    if ((p.bone ?? 'auto') !== 'auto') continue;
    const b = boxOf(p), c = b.getCenter(new THREE.Vector3());
    if (box.containsPoint(c)) keep.add(p);
  }
  return { parts: parts.filter(p => keep.has(p)).map(p => (isNeck(p) ? { ...p, bone: 'head', pivot: 'none' } : p)), bottom: (body.isEmpty() ? box : body).min.y, hasNeck: solid.some(p => /^首/.test(p.name ?? '')) };
}

// ---- 骨が回る中心（機体エディタと同じ決め方） ----
const SKIRT_BONES = ['skirt_front_l', 'skirt_front_r', 'skirt_back_l', 'skirt_back_r'];
/** 機体エディタの骨の名前：組 g と、その形の真ん中の x・z */
export const sidedName = (g, cx, cz = 0) => (g === 'skirt' ? `skirt_${cz >= 0 ? 'front' : 'back'}_${cx >= 0 ? 'l' : 'r'}`
  : ['arm', 'elbow', 'leg', 'knee', 'shin', 'foot', 'fore', 'wing'].includes(g) ? `${g === 'fore' ? 'forearm' : g}_${cx >= 0 ? 'l' : 'r'}` : g);
/**
 * 自由な機体の、骨が回る中心（機体の座標）。機体エディタの書き出しと同じ決め方：骨ごとの形の範囲から。関節の部品（肩関節・ひじ・股関節・ひざ・首 など）が
 * あればその中心。取り込んだ形（スキン）は、その骨組み（rig）の点。
 *   pieces：[{ bone: 機体エディタの骨の名前, box: THREE.Box3, pc: ブロック }]　rigs：[{ rig: { 骨: [x, y, z] }, M: 置き方の行列 }]
 * 戻り値 { 骨の名前: THREE.Vector3 }
 */
export function freeJoints(pieces, rigs = []) {
  const boxes = {}, V = THREE.Vector3;
  for (const pc of pieces) (boxes[pc.bone] ||= new THREE.Box3()).union(pc.box);
  const B = n => boxes[n] || null, ctr = b => b.getCenter(new V());
  const whole = new THREE.Box3(); Object.values(boxes).forEach(b => whole.union(b));
  const counted = new THREE.Box3(); for (const pc of pieces) if (!pc.pc.noHeight) counted.union(pc.box);
  if (!counted.isEmpty() && counted.max.y < whole.max.y) whole.max.y = counted.max.y;
  const H = whole.max.y - whole.min.y, at = {};
  const legTop = Math.max(B('leg_l')?.max.y ?? -Infinity, B('leg_r')?.max.y ?? -Infinity);
  at.hips = new V(0, isFinite(legTop) ? legTop - 0.03 * H : B('hips') ? ctr(B('hips')).y : whole.min.y + 0.5 * H, B('hips') ? ctr(B('hips')).z : 0);
  at.torso = new V(0, B('torso')?.min.y ?? at.hips.y + 0.05 * H, B('torso') ? ctr(B('torso')).z : 0);
  at.head = new V(0, B('head')?.min.y ?? whole.max.y - 0.1 * H, B('head') ? ctr(B('head')).z : 0);
  for (const s of ['l', 'r']) {
    const sign = s === 'l' ? 1 : -1, a = B('arm_' + s), l = B('leg_' + s), k = B('shin_' + s), ft = B('foot_' + s), f = B('forearm_' + s);
    at['arm_' + s] = a ? new V(sign * (Math.min(Math.abs(a.min.x), Math.abs(a.max.x)) + 0.15 * (a.max.x - a.min.x)), a.max.y - 0.18 * (a.max.y - a.min.y), ctr(a).z) : new V(sign * 0.25 * H, at.head.y - 0.1 * H, 0);
    at['leg_' + s] = l ? new V(ctr(l).x, l.max.y - 0.05 * (l.max.y - l.min.y), ctr(l).z) : new V(sign * 0.08 * H, at.hips.y, 0);
    at['shin_' + s] = k ? new V(ctr(k).x, k.max.y - 0.08 * (k.max.y - k.min.y), ctr(k).z) : new V(at['leg_' + s].x, at['leg_' + s].y - 0.25 * H, 0);
    at['foot_' + s] = ft ? new V(ctr(ft).x, ft.max.y, ft.min.z + 0.35 * (ft.max.z - ft.min.z)) : new V(at['shin_' + s].x, whole.min.y + 0.035 * H, at['shin_' + s].z);
    at['forearm_' + s] = f ? new V(ctr(f).x, f.max.y, ctr(f).z) : at['arm_' + s].clone().add(new V(0, -0.18 * H, 0));
  }
  // 関節の部品：その中心が回る点
  const found = {}, tracked = isTrackedSet(pieces.map(p => p.pc));
  for (const pc of pieces) {
    const g = pivotOfPart(pc.pc);
    if (!g || (tracked && (g === 'leg' || g === 'shin' || g === 'foot'))) continue;
    const c = ctr(pc.box);
    (found[sidedName(g, c.x, c.z)] ||= []).push(c);
  }
  for (const [name, list] of Object.entries(found)) at[name] = list.reduce((a, b) => a.add(b), new V()).multiplyScalar(1 / list.length);
  if (found.leg_l && found.leg_r) at.hips = new V(0, (at.leg_l.y + at.leg_r.y) / 2, (at.leg_l.z + at.leg_r.z) / 2);
  // 取り込んだ形：骨組みの点
  for (const { rig, M } of rigs) for (const [name, p] of Object.entries(rig ?? {})) if (Array.isArray(p)) at[name] = new V(...p).applyMatrix4(M);
  return at;
}
