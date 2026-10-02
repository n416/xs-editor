// 機体エディタ Ver2：全身（頭・上半身・背中・腕・下半身・脚）を、カタログのパーツを置いて組む。
//   ・全身をランダムに組んで当たりを付け、気に入らない部位だけランダムを回す・パーツを入れ替える
//   ・色はパーツではなく機体が持つ（paint.js：役で塗る。「いい感じに塗る」「ビビッドを差す」「塗りの候補」）
//   ・頭は頭の組み立て（xsasm-*.js）のカタログ・置き方・ランダムをそのまま使う。頭のパーツは頭の座標（頭の殻の幅が 0.19 ほど）で持ち、
//     頭の入れ物（headHolder）が首の上へ縮めて置く。頭のパーツの id は、ほかの部位と重ならないよう「h·」を付けて持つ
// 置いたパーツは { part, name, mov, rot, scal } の並びで、塗り・寸法の調整と一緒に localStorage に自動保存する（保存先は前の画面 lowerasm.html と別）。
// パーツは付く骨ごとの入れ物に入れて、ゲームと同じ関節のまわりに動かす（ひじ・ひざは 2 重関節 doublejoint.js、スカートは蝶番で脚に押されて開く skirtpush.js）。
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { Store, SAVE_PRE, USER_KEY } from './v2-store.js';
import { LOWER, lowerById, SAMPLES, placementOf, randomLower } from './parts/lower/index.js';
import { UPPER, upperById, UPPER_SAMPLES, placementOfUpper, randomUpper, SHOULDER_AT } from './parts/upper/index.js';
import { pipeDef, randomPipeGen } from './parts/upper/pipegen.js';
import { BACK, backById, BACK_SAMPLES, BACK_GROUP, FX_CAT, DEFAULT_RACK, placementOfBack, nextDockItems, usesDock, canDock, randomBack } from './parts/back/index.js';
import { ARM, armById, ARM_SAMPLES, ARM_CAT, placementOfArm, randomArm } from './parts/arm/index.js';
import { LEG, legById, LEG_SAMPLES, placementOfLeg, randomLeg, LEG_AT } from './parts/leg/index.js';
import { doubleJoint, ELBOW_AXES, KNEE_AXES, BEND, ankleAngle, ANKLE_RANGE } from './doublejoint.js';
import { rotMatrix } from './xsasm.js';
import { mirrorOf, randomHead, placementsFor, headDims } from './xsasm-random.js';
import { PARTS as HEAD_RAW } from './xsasm-parts.js';
import { HP, HEAD, FREE, isHead, rawHead, asHead, halfOf, registerUser, unregisterUser, headShell as headShellIn, headPlace as headPlaceIn, unitParts, registerUnit } from './unitparts.js';
import { XS, VEHICLES, UNIT_M, ROLES, DEFAULTS, shipSeat, gameToEditor } from './xsengine.js';
import { initAi } from './v2-ai.js';
import { initShare } from './v2-share.js';
import { PART_RECIPES, keptPieces, recipeText, canAsk } from './airecipes.js';
import { initPartEdit } from './v2-partedit.js';
import { geoOf, isSub, disposeStale, instGeosOf, drawn, boxOf as blockBox, tfMatrix } from './partgeo.js';
import { freeDef, blockOf, headOf, groupOfPart, isTrackedSet, holderKey, isHeldPart, isGlowPart, sidedName, freeJoints, atRest } from './freeparts.js';
import { MESHES, ensureMeshes, importModel, applyJoints, ensureJoints, meshToBlocks, openJoints, meshReady, setMeshHost, IMPORT_BONES, rigRequest, installPack } from './meshparts.js';
import { DEFAULT_PAINT, ROLE_LABEL, colorOf, randomPalette, randomVivid, hexToHsl } from './paint.js';
import { buildHull, hullReach } from './hull.js';
import { makeSheet } from './xsbody.js';
import { hull2, pushAngle, bandedOutlines } from './skirtpush.js';
import { fitTiltBoth, tilted, TILT_GRID } from './kneetilt.js';
import { P, XH, XL, YH, YL, ZH, ZL, box } from './xsasm-lib.js';
import { byId, register, boneOf as boneOf0, SIDED, sideOf, hasLink as hasLinkIn, bodyParts, fitItem, kneeAxesOf, SEG, ADJ0 } from './bodyparts.js';

const $ = s => document.querySelector(s);
const D = Math.PI / 180;
// 保存先（このブラウザの中）。?save=名前 を付けて開くと、別の保存先になる（ふだんの組み立てを触らずに試すため）
const SAVE_KEY = 'xsv2.' + (new URLSearchParams(location.search).get('save') ?? 'v1');
const S = makeSheet();

// 部品の目次（byId）・どの部分か（halfOf：upper・back・lower・arm・leg）・動力パイプの登録（register）は bodyparts.js（機体エディタと共通）
// 頭のパーツ：頭の組み立てのカタログを、id に「h·」を付けて同じ目次に入れる（上半身の襟と id が重なるものがある）
const boneOf = def => (isHead(def.id) ? 'head' : def.free ? 'hips' : boneOf0(def));
/** 頭の見本：どれも依頼主が自分で組んだ置き方（顔はこちらで推し量って作らない）。
 *  1 番目は機体エディタ Ver2 で組んだ頭（2026-10-02 に貼ってもらった機体の JSON から）。最初に出る頭もこれ。2 番目は DoGA で組んだ頭 */
const HEAD_SAMPLES = { 'バイザーとマスクと耳ブロック': [
  { part: 'headshell', mov: [0, 0, 0.0246], rot: [0, 0, 0], scal: [3.1, 2.999, 2.327] }, { part: 'maska', mov: [0, -0.0698, -0.0898], rot: [0, 0, 0], scal: [3.1, 3.2, 2.2] },
  { part: 'earblock', mov: [-0.2404, 0.0493, 0.0735], rot: [6.5, 14.4, 0], scal: [-1.477, 2.2, 2.2] }, { part: 'earblock', mov: [0.2404, 0.0493, 0.0735], rot: [6.5, -14.4, 0], scal: [1.477, 2.2, 2.2] },
  { part: 'facemask', mov: [0, 0.1525, 0.2419], rot: [-0.4, 0, 0], scal: [1, 1, 1] }, { part: 'neck', mov: [0, -0.4502, -0.05], rot: [0, 0, 0], scal: [1.69, 1.69, 1.69] },
  { part: 'headbandthin', mov: [0, 0.018, 0.0152], rot: [0, 0, 0], scal: [3.1, 3.805, 2.581] }].map(asHead),
  'ひれとクレスト': [
  { part: 'headshell', mov: [0, 0, -0.125], rot: [0, 0, 0], scal: [3.1, 3.2, 2.2] }, { part: 'facemask', mov: [0, 0, 0], rot: [0, 0, 0], scal: [1, 1, 1] },
  { part: 'jawblock', mov: [0, -0.175, -0.175], rot: [10, -180, 0], scal: [2.2, 1.2, 1.3] }, { part: 'fin', mov: [0.3, 0.175, 0], rot: [-20, 10, -110], scal: [1, 1, 1] },
  { part: 'fin', mov: [-0.3, 0.175, 0], rot: [-20, -10, 110], scal: [-1, 1, 1] }, { part: 'crest', mov: [0, 0.3, 0.025], rot: [20, 0, 0], scal: [1, 1, 0.6] }].map(asHead) };
/** ランダムに組む頭：角ばった頭（boxhelm）は選ばない（依頼主の指示。カタログには残り、手で置ける） */
const NO_RANDOM_HEAD = new Set(['boxhelm']);
const randomHeadV2 = () => randomHead(Math.random, HEAD_RAW.filter(d => !NO_RANDOM_HEAD.has(d.id))).map(asHead);
/** いくつでも付けられる部位（カタログを押すと増える）。ほかの部位は 1 つだけ（押すと、置いてある同じ部位のパーツと入れ替わる）。
 *  左右の対は、左右で 1 組。オーブ・挿せるタンクは収納口の数まで増える */
const MULTI = new Set(['ベルト', '腰の筒', '動力パイプ', '胸の飾り', '胴の動力パイプ', '肩の動力パイプ', 'バックパックの装備', '翼の装備', 'エフェクト（光）', '前腕の飾り', '顔', '飾り', 'トサカ', '首当て']);   // （首当ては首に足して付ける。首と同じ部位にしていたら、首当てを選ぶと首が外れた）
const isMulti = def => MULTI.has(def.cat);
/** 1 つだけの部位：置いてある同じ部位（同じ部分の、同じ部位名）のパーツを外す */
function dropSameCat(def) {
  const half = halfOf(def.id), n = items.length;
  items = items.filter(it => !(halfOf(it.part) === half && byId[it.part]?.cat === def.cat));
  if (items.length !== n) selected = -1;
}
// 塗り（paint.js）：機体が持つ色の組とビビッド
let paint = DEFAULT_PAINT();
const placeOf = def => (def.free ? { mov: [0, 0, 0], pair: false } : { head: () => ({ mov: [0, 0, 0], pair: false }), upper: placementOfUpper, back: d => placementOfBack(d, items), arm: placementOfArm, leg: placementOfLeg, lower: placementOf }[halfOf(def.id)](def));
/** 寸法の調整で上半身と一緒に動く部分（上半身・背中と腕） */
const withUpper = id => ['upper', 'back', 'arm'].includes(halfOf(id));

let items = [];
let unitName = '', saveId = '', savedHash = '';   // 今の機体の名前・保存先（保存した機体の id）・保存したときの形（機体の保存と読み込み）
let selected = -1;
let groups = [];   // items と同じ並びの Group

// ---- 3D ----
const canvas = $('#view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x14161a);
const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 100);
const orbit = new OrbitControls(camera, canvas);
const AT = new THREE.Vector3(0, 1.9, 0);
const WEAPON_CAT = '手持ちの武器';
let shipNow = '', viewDist = 5.6, kindSig = 'xs', XS_GAME_IDS = null;   // 艦を開いている間：その種類（battleship / assault）と、向きのボタンの距離
scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x2a2d33, 0.9));
const key = new THREE.DirectionalLight(0xffffff, 1.4); key.position.set(1.2, 2.6, 1.6); scene.add(key);
const fill = new THREE.DirectionalLight(0x8fb3ff, 0.5); fill.position.set(-1.5, 1.2, -1); scene.add(fill);
const grid = new THREE.GridHelper(2, 20, 0x2c3038, 0x22252b); scene.add(grid);
const guideGroup = new THREE.Group(); scene.add(guideGroup);   // 艦のガイド（ゲームで決まっている大きさと場所。書き出さない）
const root = new THREE.Group(); scene.add(root);
const gizmo = new TransformControls(camera, canvas);
gizmo.setSize(0.8);
gizmo.addEventListener('dragging-changed', e => { orbit.enabled = !e.value; if (PE.active()) { if (!e.value) PE.onDragEnd(); return; } if (!e.value) { save(); rebuild(); } });
gizmo.addEventListener('objectChange', () => { if (PE.active()) { PE.onGizmoChange(); return; } if (selected >= 0) { readBackFromGroup(items[selected], gizmo.object); applyToGroup(items[selected], groups[selected]); fillFields(); } });
scene.add(gizmo);

/** 関節のまわりに回す入れ物：outer は関節の位置で回り、inner は元の座標（中の物は立った姿勢の世界の座標のまま置く） */
function joint(parent, p) {
  const outer = new THREE.Group(), inner = new THREE.Group();
  outer.position.set(...p); inner.position.set(-p[0], -p[1], -p[2]);
  outer.add(inner); parent.add(outer);
  return { outer, inner, at: p.slice() };
}
const torsoJ = joint(root, [0, S.belly.y, 0]);
// 頭の入れ物：頭のパーツは頭の座標のまま入れ、入れ物が首の上へ縮めて置く（placeHead）
const headHolder = new THREE.Group(); torsoJ.inner.add(headHolder);
const headJ = joint(torsoJ.inner, [0, S.neck.y, 0]);   // 自由な部品（機体エディタの形式）の頭：首の付け根で回る。中は体の座標のまま
const armJ = { l: joint(torsoJ.inner, SHOULDER_AT), r: joint(torsoJ.inner, [-SHOULDER_AT[0], SHOULDER_AT[1], SHOULDER_AT[2]]) };
const ELBOW = s => [s * (SHOULDER_AT[0] + 0.13), SHOULDER_AT[1] - 0.55, 0];
const foreJ = { l: joint(armJ.l.inner, ELBOW(1)), r: joint(armJ.r.inner, ELBOW(-1)) };
const up = (p, d) => [p[0], p[1] + d, p[2]];
const elbowJ = { l: joint(armJ.l.inner, up(ELBOW(1), ELBOW_AXES[0])), r: joint(armJ.r.inner, up(ELBOW(-1), ELBOW_AXES[0])) };   // 節は上の軸 P1 のまわり
const KNEE = s => [s * LEG_AT[0], LEG_AT[1], LEG_AT[2]];
const legJ = { l: joint(root, [S.hip.x, S.hip.y, 0]), r: joint(root, [-S.hip.x, S.hip.y, 0]) };
const kneeJ = { l: joint(legJ.l.inner, up(KNEE(1), KNEE_AXES[0])), r: joint(legJ.r.inner, up(KNEE(-1), KNEE_AXES[0])) };
const shinJ = { l: joint(legJ.l.inner, KNEE(1)), r: joint(legJ.r.inner, KNEE(-1)) };
const ANKLE = s => [s * LEG_AT[0], LEG_AT[1] - 0.87, LEG_AT[2]];   // 足首（ひざの中心の 0.87 下）
const footJ = { l: joint(shinJ.l.inner, ANKLE(1)), r: joint(shinJ.r.inner, ANKLE(-1)) };
const itemsIn = { head: headHolder, headw: headJ.inner, foot_l: footJ.l.inner, foot_r: footJ.r.inner, hips: root, torso: torsoJ.inner, arm_l: armJ.l.inner, arm_r: armJ.r.inner, elbow_l: elbowJ.l.inner, elbow_r: elbowJ.r.inner, fore_l: foreJ.l.inner, fore_r: foreJ.r.inner,
  leg_l: legJ.l.inner, leg_r: legJ.r.inner, knee_l: kneeJ.l.inner, knee_r: kneeJ.r.inner, shin_l: shinJ.l.inner, shin_r: shinJ.r.inner };
/** 関節の入れ物の位置を p に（回る中心も p） */
const moveJoint = (j, p) => { j.at = p.slice(); j.outer.position.set(...p); j.inner.position.set(-p[0], -p[1], -p[2]); };

const hullGeo = planes => {
  const h = buildHull(planes, { reach: hullReach(planes) });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(h.positions, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(h.normals, 3));
  return g;
};
// ブロックの形は partgeo.js（面で囲った形・押し出し・回転体。「引く」ブロックに削られた後の形）
const MATS = new Map();
// 光る部品（glow）は自分の色で光り、透ける部品（opacity）は奥が見える（光の翼・オーラ・リボン・虫の羽）
const material = (pc, def) => {
  // 自由な部品（機体エディタの形式）は、塗りではなく自分の色・質感。光るかどうかは名前からも決まる
  const free = !!def?.free, glow = free ? !!isGlowPart(pc) : !!pc.glow;
  const c = free ? pc.color ?? '#c3c9d2' : colorOf(pc, def?.cat ?? '', paint), k = `${c}|${glow ? 1 : 0}|${pc.opacity ?? 1}|${free ? `${pc.metal}/${pc.rough}` : ''}`;
  if (!MATS.has(k)) MATS.set(k, new THREE.MeshStandardMaterial({ color: c, metalness: free ? pc.metal ?? 0.55 : glow ? 0 : 0.45, roughness: free ? pc.rough ?? 0.38 : 0.5, flatShading: true, side: THREE.DoubleSide,
    ...(glow ? { emissive: c, emissiveIntensity: 0.85 } : {}), ...(pc.opacity != null ? { transparent: true, opacity: pc.opacity, depthWrite: false } : {}) }));
  return MATS.get(k);
};

/** 置いた部品 1 個 → three の Group（mov・rot・scal を持つ）。蝶番のある piece は、蝶番の軸に置いた子の Group（hinges）に入れる。
 *  部品の中に、ほかの骨に付く piece があれば（すねの部品：中身は骨 shin、ひざの関節の節は骨 knee）、その骨ごとの別の Group（userData.extra）に入れる */
// ---- 取り込んだ形（GLB のスキン。meshparts.js）：骨ごとの形に分けて、骨の入れ物へ入れる ----
const MESH_MATS = new Map(), BONE_GEOS = new WeakMap();
const meshMat = (pc, entry) => {
  const k = `${entry.texId}|${pc.color}|${pc.metal}|${pc.rough}`;
  if (!MESH_MATS.has(k)) MESH_MATS.set(k, new THREE.MeshStandardMaterial({ map: entry.tex ?? null, color: entry.tex ? 0xffffff : pc.color ?? '#c8ccd4', metalness: pc.metal ?? 0.3, roughness: pc.rough ?? 0.6, side: THREE.DoubleSide }));
  return MESH_MATS.get(k);
};
/** 形を、骨ごとの形（同じ頂点を使い、三角形だけ分ける）に。関節で切り分けた形は、三角形がどれも 1 本の骨に付いている。切り分けていない形（骨付きで読んだまま）は、まるごと 1 つ（-1） */
function boneGeos(geo) {
  if (BONE_GEOS.has(geo)) return BONE_GEOS.get(geo);
  const out = new Map(), SI = geo.attributes.skinIndex, SW = geo.attributes.skinWeight, I = geo.index.array, P = geo.attributes.position, v = new THREE.Vector3();
  let rigid = !!SI;
  if (rigid) for (let i = 0; i < SW.count; i += 53) if (SW.getX(i) < 0.999) { rigid = false; break; }
  if (!rigid) out.set(-1, geo);
  else {
    const lists = new Map();
    for (let t = 0; t < I.length; t += 3) { const b = SI.getX(I[t]); (lists.get(b) ?? lists.set(b, []).get(b)).push(I[t], I[t + 1], I[t + 2]); }
    for (const [b, idx] of lists) {
      const g = new THREE.BufferGeometry(), box = new THREE.Box3();
      for (const [n, a] of Object.entries(geo.attributes)) g.setAttribute(n, a);
      g.setIndex(idx);
      for (const i of idx) box.expandByPoint(v.fromBufferAttribute(P, i));
      g.boundingBox = box; g.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
      out.set(b, g);
    }
  }
  BONE_GEOS.set(geo, out);
  return out;
}
const applyTf = (o, pc) => { const tf = pc.tf ?? {}, r = tf.r ?? [0, 0, 0]; o.position.set(...(tf.p ?? [0, 0, 0])); o.rotation.set(r[0] * D, r[1] * D, r[2] * D, 'XYZ'); o.scale.set(...(tf.s ?? [1, 1, 1])); };
/** 形が読み込まれた・切り分けが変わった：置いたパーツを作り直す（続けて何度も来るので、次の描画のときにまとめて） */
let meshDirty = false;
setMeshHost({
  note: (t, w) => note(t, w),
  loaded: id => { for (const def of FREE) for (const pc of def.pieces) if (pc.mesh === id && pc.joints) applyJoints(pc); meshDirty = true; },
  changed: () => { meshDirty = true; },
  closed: () => { persistUser(); meshDirty = true; if (PE.active()) PE.touch(); else save(); },
});
/** 自由な機体（置いたまま）の骨が回る中心を、機体エディタと同じ決め方で出して、関節の入れ物を動かす。無ければ標準の骨格 */
function placeFreeJoints() {
  const i = items.findIndex(it => byId[it.part]?.free && !byId[it.part].tab && atRest(it));
  if (i < 0 || !groups[i]) { moveJoint(torsoJ, [0, S.belly.y, 0]); moveJoint(headJ, [0, S.neck.y, 0]); for (const [s, sg] of [['l', 1], ['r', -1]]) moveJoint(legJ[s], [sg * S.hip.x, S.hip.y, 0]); return; }
  const g = groups[i], pieces = [], rigs = [];
  for (const t of [g, ...g.userData.extra.values()]) for (const o of t.children) {
    if (!o.isMesh || !o.userData.pc) continue;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    if (o.geometry.boundingBox.isEmpty()) continue;
    o.updateMatrix();
    pieces.push({ bone: o.userData.ebone ?? 'torso', box: o.geometry.boundingBox.clone().applyMatrix4(o.matrix), pc: o.userData.pc });
  }
  for (const pc of byId[items[i].part].pieces) if (pc.kind === 'mesh' && pc.rig && MESHES.has(pc.mesh)) rigs.push({ rig: pc.rig, M: tfMatrix(pc.tf) });
  if (!pieces.length) return;
  const at = freeJoints(pieces, rigs), P = n => at[n].toArray();
  moveJoint(torsoJ, P('torso')); moveJoint(headJ, P('head'));
  for (const s of ['l', 'r']) {
    moveJoint(armJ[s], P('arm_' + s)); moveJoint(foreJ[s], P('forearm_' + s)); moveJoint(elbowJ[s], P('forearm_' + s));
    moveJoint(legJ[s], P('leg_' + s)); moveJoint(shinJ[s], P('shin_' + s)); moveJoint(kneeJ[s], P('shin_' + s)); moveJoint(footJ[s], P('foot_' + s));
  }
}
/** 自由な部品（機体エディタの形式）の Group：形 1 個ずつ（ミラー・繰り返しの写しごと）を、付く骨の入れ物（userData.extra）へ分ける。腰に付くものは g そのもの */
const draftMat = new THREE.MeshStandardMaterial({ color: 0x5fa8ff, transparent: true, opacity: 0.28, depthWrite: false, roughness: 0.9, metalness: 0 });
function freeGroup(item, index, def) {
  const g = new THREE.Group();
  g.userData.index = index; g.userData.hinges = []; g.userData.extra = new Map();
  const tracked = isTrackedSet(def.pieces);
  const put = (key, m) => {
    if (key === 'hips') { g.add(m); return; }
    if (!g.userData.extra.has(key)) { const e = new THREE.Group(); e.userData.index = index; g.userData.extra.set(key, e); }
    g.userData.extra.get(key).add(m);
  };
  for (const pc of def.pieces) {
    if (pc.kind === 'mesh' && !pc.blockout) {   // 取り込んだ形：骨ごとの形に分けて置く（まだ読み込めていなければ、読み込んでから作り直す）
      const entry = MESHES.get(pc.mesh);
      if (!entry) { ensureMeshes([pc.mesh]); continue; }
      for (const [b, geo] of boneGeos(entry.geo)) {
        const en = b < 0 ? 'torso' : IMPORT_BONES[b] ?? 'torso', key = en === 'hips' ? 'hips' : en === 'head' ? 'headw' : en.startsWith('wing') ? 'torso' : en.replace('forearm', 'fore');
        const m = new THREE.Mesh(geo, meshMat(pc, entry));
        applyTf(m, pc);
        Object.assign(m.userData, { index, noHit: true, pc, def, meshPart: true, ebone: en });
        put(key, m);
      }
      continue;
    }
    // あたり（下書き。書き出す形には入らない）は、薄い青の形で見せる
    const draft = !!pc.blockout && !isSub(pc) && pc.kind !== 'mesh';
    if (!drawn(pc) && !draft) continue;
    const grp = groupOfPart(pc, tracked);
    instGeosOf(def, pc).forEach((geo, k) => {
      if (!geo.boundingBox) geo.computeBoundingBox();
      const bb = geo.boundingBox, cx = (bb.min.x + bb.max.x) / 2 * item.scal[0] + item.mov[0], key = holderKey(grp, cx);
      const m = new THREE.Mesh(geo, draft ? draftMat : material(pc, def));
      Object.assign(m.userData, { index, noHit: !!pc.noHit || draft, pc, def, inst: k, ebone: sidedName(grp, cx, (bb.min.z + bb.max.z) / 2) });
      put(key, m);
    });
  }
  applyToGroup(item, g);
  return g;
}
function groupOf(item, index) {
  const def = byId[item.part];
  if (def.free) return freeGroup(item, index, def);
  const g = new THREE.Group();
  g.userData.index = index; g.userData.hinges = []; g.userData.extra = new Map();
  const subs = new Map(), b0 = boneOf(def);
  for (const pc of def.pieces) {
    if (isSub(pc)) continue;   // 引くブロックは形を持たない（上に並ぶブロックを削るだけ）
    const m = new THREE.Mesh(geoOf(def, pc), material(pc, def));
    m.userData.index = index; m.userData.noHit = !!pc.noHit; m.userData.pc = pc; m.userData.def = def;
    const pos = new THREE.Vector3(...(pc.pos ?? [0, 0, 0]));
    if (pc.hinge) {
      const k = JSON.stringify(pc.hinge);
      if (!subs.has(k)) {
        const sub = new THREE.Group(); sub.position.set(0, pc.hinge.y, pc.hinge.z); g.add(sub);
        subs.set(k, sub); g.userData.hinges.push({ sub, dir: pc.hinge.dir });
      }
      const sub = subs.get(k);
      m.position.copy(pos.sub(sub.position));
      sub.add(m);
    } else if (pc.bone && pc.bone !== b0) {
      if (!g.userData.extra.has(pc.bone)) { const e = new THREE.Group(); e.userData.index = index; g.userData.extra.set(pc.bone, e); }
      m.position.copy(pos); g.userData.extra.get(pc.bone).add(m);
    } else { m.position.copy(pos); g.add(m); }
  }
  applyToGroup(item, g);
  return g;
}
/** 置いた部品を入れる骨の入れ物（腕・脚の骨は置いた x の向きで左右） */
const holderFor = (b, item) => itemsIn[b] ?? (SIDED.includes(b) ? itemsIn[`${b}_${sideOf(item)}`] : root);
const holderOf = item => holderFor(boneOf(byId[item.part]), item);
/** 置いたパーツを Group に写す。腕・脚のパーツは、寸法の調整（関節の間の長さ）を掛けた置き方で（fitItem） */
function applyToGroup(item, g) {
  const f = fitItem(item, adj);
  for (const t of [g, ...(g.userData.extra?.values() ?? [])]) {
    t.position.set(...f.mov);
    t.quaternion.setFromRotationMatrix(rotMatrix(item.rot));
    t.scale.set(...f.scal);
  }
}
const round = (v, n) => Math.round(v * 10 ** n) / 10 ** n;
function readBackFromGroup(item, g) {
  item.mov = g.position.toArray().map(v => round(v, 4));
  const e = new THREE.Euler().setFromQuaternion(g.quaternion, 'YXZ');   // Ry·Rx·Rz：この組み立ての回転の順
  item.rot = [round(e.x / D, 1), round(e.y / D, 1), round(e.z / D, 1)];
  item.scal = g.scale.toArray().map(v => round(v, 3));
  // 寸法の調整で掛かっている分（位置の y・拡大の y）は、置いたパーツの数値からは外す
  const f0 = fitItem({ ...item, mov: [0, 0, 0], scal: [1, 1, 1] }, adj);
  item.mov[1] = round(item.mov[1] - f0.mov[1], 4); item.scal[1] = round(item.scal[1] / f0.scal[1], 3);
}

// ---- 周りの仮の部品：胸（腹の中心で回る）、首と頭、腕（肩で回り、前腕はひじで曲がる）、左右の脚（股関節で回り、すねはひざで曲がる） ----
const ghostMat = new THREE.MeshStandardMaterial({ color: 0x8a94a3, metalness: 0, roughness: 0.9, transparent: true, opacity: 0.22, depthWrite: false, flatShading: true });
const ghostEdge = new THREE.LineBasicMaterial({ color: 0x8a94a3, transparent: true, opacity: 0.35 });
const ghostAll = [];
const pivotGroup = (parent, p) => { const g = new THREE.Group(); g.position.set(...p); parent.add(g); return g; };
/** 仮の部品を group に置く（planes は立った姿勢の世界の座標。group の世界の位置を引いて置く） */
function ghost(group, planes, origin = null) {
  const geo = hullGeo(planes);
  const o = origin ?? group.getWorldPosition(new THREE.Vector3());
  const m = new THREE.Mesh(geo, ghostMat); m.position.set(-o.x, -o.y, -o.z); group.add(m);
  const e = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 20), ghostEdge); e.position.copy(m.position); group.add(e);
  ghostAll.push(m, e);
  return { geo, meshes: [m, e] };
}
const KNEE_Y = S.hip.y - 0.44, KNEE_Z = -0.03;
const legs = {};
let ghostChest;
const ghostHead = [];   // 仮の首と頭（頭のパーツを置いたら隠す）
const ghostLimb = { arm_l: [], arm_r: [], leg_l: [], leg_r: [] };   // 腕・脚の部品を置いたら、その側の仮の腕・脚を隠す
{
  scene.updateMatrixWorld(true);
  const zero = new THREE.Vector3();
  const cy = S.chest.yBot;
  ghostChest = ghost(torsoJ.inner, [...box(-S.chest.hw, S.chest.hw, cy, S.neck.y - 0.06, -S.chest.hd, S.chest.hd), P([0, -0.9, 1], [0, cy, S.chest.hdLow]), P([0, -0.9, -1], [0, cy, -S.chest.hdLow])], zero);
  ghostHead.push(...ghost(torsoJ.inner, [...box(-0.06, 0.06, S.neck.y - 0.08, S.neck.y + 0.06, -0.06, 0.06)], zero).meshes,           // 首
    ...ghost(torsoJ.inner, [...box(-0.14, 0.14, S.neck.y + 0.02, S.neck.y + 0.3, -0.14, 0.14)], zero).meshes);           // 頭
  for (const [side, s] of [['l', 1], ['r', -1]]) {
    const ax = s * (SHOULDER_AT[0] + 0.13), ey = SHOULDER_AT[1] - 0.55, y = SHOULDER_AT[1];
    const X = (c, h) => [XL(Math.min(c - h, c + h)), XH(Math.max(c - h, c + h))];
    ghostLimb[`arm_${side}`].push(...ghost(armJ[side].inner, [...X(ax, 0.07), YH(y - 0.06), YL(ey + 0.14), ZH(0.075), ZL(-0.075)], zero).meshes,   // 上腕
      ...ghost(armJ[side].inner, [...X(ax, 0.07), YH(ey + 0.07), YL(ey - 0.07), ZH(0.07), ZL(-0.07)], zero).meshes,    // ひじ
      ...ghost(foreJ[side].inner, [...X(ax, 0.075), YH(ey - 0.07), YL(ey - 0.45), ZH(0.08), ZL(-0.075)], zero).meshes, // 前腕
      ...ghost(foreJ[side].inner, [...X(ax, 0.05), YH(ey - 0.44), YL(ey - 0.58), ZH(0.07), ZL(-0.06)], zero).meshes);   // 手
  }
  const { xIn, xOut } = S.legBand, top = S.hip.y - 0.05, bot = S.hip.y - 0.42;
  for (const [side, s] of [['l', 1], ['r', -1]]) {
    const X = (a, b) => s > 0 ? [XL(a), XH(b)] : [XL(-b), XH(-a)];
    const leg = pivotGroup(root, [s * S.hip.x, S.hip.y, 0]);
    scene.updateMatrixWorld(true);
    const thighG = ghost(leg, [...X(xIn, xOut), YH(top), YL(bot), ZH(S.hip.thighFront), ZL(S.hip.thighBack), P([0, -1, 1], [0, bot, 0.03]), P([0, -1, -1], [0, bot, -0.09])]), thigh = thighG.geo;
    const shin = pivotGroup(leg, [0, KNEE_Y - S.hip.y, KNEE_Z]);
    scene.updateMatrixWorld(true);
    const shinG = ghost(shin, [...X(xIn, xOut), YH(bot - 0.02), YL(0.18), ZH(0.09), ZL(-0.13), P([0, 1, 1], [0, bot - 0.02, 0.05]), P([0, 1, -1], [0, bot - 0.02, -0.11])]), shinGeo = shinG.geo;
    ghostLimb[`leg_${side}`].push(...thighG.meshes, ...shinG.meshes, ...ghost(shin, [...X(xIn - 0.02, xOut + 0.03), YL(0), YH(0.18), ZL(-0.1), ZH(0.26)]).meshes);
    // 横から見た形（立った姿勢の世界の座標）：太もも、すね（足も含めて）
    const yz = geo => { const a = geo.attributes.position, out = []; for (let i = 0; i < a.count; i++) out.push([a.getY(i), a.getZ(i)]); return out; };
    const xr = s > 0 ? [xIn - 0.02, xOut + 0.03] : [-xOut - 0.03, -xIn + 0.02];
    legs[side] = { leg, shin, outlines: [
      { poly: hull2(yz(thigh)), pivot: [S.hip.y, 0], x: xr },
      { poly: hull2([...yz(shinGeo), [0, -0.1], [0, 0.26], [0.18, -0.1], [0.18, 0.26]]), pivot: [S.hip.y, 0], knee: [KNEE_Y, KNEE_Z], x: xr },
    ] };
  }
}
$('#ghost').onchange = e => { for (const m of ghostAll) m.visible = e.target.checked; updateGhostChest(); };
/** 仮の胸は、上半身の胸（骨 torso の部品）を置いたら隠す。仮の腕・脚は、その側に腕・脚の部品を置いたら隠す */
function updateGhostChest() {
  const whole = items.some(it => byId[it.part]?.free && !byId[it.part].tab);   // 自由な機体（全身）を置いたら、仮の形はぜんぶ隠す
  if (whole) { for (const m of ghostAll) m.visible = false; return; }
  { const any = items.some(it => halfOf(it.part) === 'head'); for (const m of ghostHead) m.visible = $('#ghost').checked && !any; }
  const has = items.some(it => halfOf(it.part) === 'upper' && ['胸', '背中', '腹', '脇腹'].includes(byId[it.part].cat)); for (const m of ghostChest.meshes) m.visible = $('#ghost').checked && !has;
  for (const [k, list] of Object.entries(ghostLimb)) { const [h, s] = k.split('_'), any = items.some(it => halfOf(it.part) === h && sideOf(it) === s); for (const m of list) m.visible = $('#ghost').checked && !any; }
}

// ---- 姿勢：ゲームと同じ回転（ゲームの骨の回転を、正面が逆向きのエディタの座標へ：Ry(π) で挟む） ----
const _flip = new THREE.Matrix4().makeRotationY(Math.PI);
function setJoint(j, r) {
  const m = _flip.clone().multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(r?.x || 0, r?.y || 0, r?.z || 0, 'YXZ'))).multiply(_flip);
  j.outer.quaternion.setFromRotationMatrix(m);
}
/** 腕の関節の位置：置いた肩関節（部位「肩関節」）の中心。無ければ骨格図の位置 */
function placeArmJoints() {
  for (const [s, sign] of [['l', 1], ['r', -1]]) {
    const sj = items.find(it => byId[it.part].cat === '肩関節' && Math.sign(it.mov[0] || 1) === sign);
    const p = sj ? sj.mov : [sign * SHOULDER_AT[0], SHOULDER_AT[1], SHOULDER_AT[2]];
    const j = armJ[s], d = new THREE.Vector3(p[0] - j.at[0], p[1] - j.at[1], p[2] - j.at[2]);
    if (d.lengthSq() >= 1e-10) moveJoint(j, p);
    // ひじは肩の 0.13 外・0.55 下（骨格図）
    const E = [p[0] + sign * 0.13, p[1] - SEG.upperArm - adj.upperArm, p[2]];
    moveJoint(foreJ[s], E); moveJoint(elbowJ[s], up(E, ELBOW_AXES[0]));
  }
}
/** ひざの軸の位置（上・下・先に曲がる角度）：すねの長さの倍率で伸び縮みする */
const kneeAxes = () => kneeAxesOf(adj);
/** 脚の関節の位置：太ももの長さの分ひざが下がり、すねの長さの分足首が下がる。伸びた分だけ体全体を上げて、足の裏を地面に */
function placeLegJoints() {
  const ax = kneeAxes();
  for (const [s, sign] of [['l', 1], ['r', -1]]) {
    const K = [sign * LEG_AT[0], LEG_AT[1] - adj.thigh, LEG_AT[2]];
    moveJoint(shinJ[s], K); moveJoint(kneeJ[s], up(K, ax[0])); moveJoint(footJ[s], up(K, -SEG.shin - adj.shin));
  }
  root.position.y = adj.thigh + adj.shin;
  // 視点の中心も、体の真ん中に付いていく
  if (shipNow) return;   // （艦は、船体の中心を見る）
  const y = 1.9 + (adj.thigh + adj.shin) / 2;
  if (Math.abs(AT.y - y) > 1e-6) { camera.position.y += y - AT.y; AT.y = y; orbit.target.copy(AT); orbit.update(); }
}
const SLIDERS = ['legL', 'legR', 'shinL', 'shinR', 'twist', 'pitch', 'roll', 'armL', 'armR', 'armLz', 'armRz', 'foreL', 'foreR'];
const X1 = new THREE.Vector3(1, 0, 0);
/** その側に 2 重関節の節（骨 elbow・knee）の部品があるか */
const hasLink = (bone, s) => hasLinkIn(items, bone, s);
const val = k => +$('#' + k).value;
const _v = new THREE.Vector3();
let movePose = null;   // ゲームの動きの 1 コマ（選んでいる間は、上半身と腕はこれに従う）
/** 脚 s を、太もも legDeg・ひざ shinDeg（度。つまみと同じ：前へ上げると正・曲げると負）の姿勢にする */
function poseLeg(s, legDeg, shinDeg) {
  // 脚（股関節のまわり）とすね（ひざ）：2 重関節なら先にすねが下の軸で曲がり（曲がり切るまで）、残りを節が上の軸で曲がる
  legJ[s].outer.rotation.set(-legDeg * D, 0, 0);
  const q = new THREE.Quaternion().setFromAxisAngle(X1, -shinDeg * D), K = new THREE.Vector3(...shinJ[s].at);
  shinJ[s].outer.quaternion.copy(q);
  if (hasLink('knee', s)) { const dj = doubleJoint(q, K, kneeAxes(), BEND.knee); kneeJ[s].outer.quaternion.copy(dj.link); shinJ[s].outer.position.copy(dj.foreAt); }
  else { kneeJ[s].outer.quaternion.identity(); shinJ[s].outer.position.copy(K); }
  // 足首：足の裏が地面と平行になる向きへ（ゲームの向きの角度。エディタは前後が逆なので符号を返す）。回る範囲は、その側のすねの部品が決める
  const shinDef = byId[items.find(it => sideOf(it) === s && byId[it.part]?.cat === 'すね')?.part];
  footJ[s].outer.rotation.x = -ankleAngle(legDeg * D, shinDeg * D, shinDef?.ankle ?? ANKLE_RANGE);
}
function applyPose() {
  for (const k of SLIDERS) $('#' + k + 'v').textContent = val(k) + '°';
  const pose = { l: [val('legL'), val('shinL')], r: [val('legR'), val('shinR')] };
  for (const s of ['l', 'r']) { legs[s].leg.rotation.x = -pose[s][0] * D; legs[s].shin.rotation.x = -pose[s][1] * D; }   // 前へ上げる・ひざを曲げる（足先が後ろへ）
  // 上半身と腕：ゲームの骨の回転（ひねり y、前後 x（前へ倒すと正）、横 z。腕は前へ上げると x が正、外へ開くと z）
  const mp = movePose ?? {};
  setJoint(torsoJ, mp.torso ?? { x: val('pitch') * D, y: val('twist') * D, z: val('roll') * D });
  setJoint(armJ.l, mp.arm_l ?? { x: val('armL') * D, z: -val('armLz') * D });
  setJoint(armJ.r, mp.arm_r ?? { x: val('armR') * D, z: val('armRz') * D });
  // 前腕（ひじ）：2 重関節なら先に前腕が下の軸で曲がり（曲がり切るまで）、残りを節が上の軸で曲がる
  for (const s of ['l', 'r']) {
    setJoint(foreJ[s], mp[`forearm_${s}`] ?? { x: val(s === 'l' ? 'foreL' : 'foreR') * D });
    const E = new THREE.Vector3(...foreJ[s].at);
    if (hasLink('elbow', s)) { const dj = doubleJoint(foreJ[s].outer.quaternion, E, ELBOW_AXES, BEND.elbow); elbowJ[s].outer.quaternion.copy(dj.link); foreJ[s].outer.position.copy(dj.foreAt); }
    else { elbowJ[s].outer.quaternion.identity(); foreJ[s].outer.position.copy(E); }
    poseLeg(s, pose[s][0], pose[s][1]);
  }
  // スカートを押す脚の形：脚の部品を置いた側は、その部品の中の 1 個ずつ（どれも凸）の、今の姿勢での横から見た形
  // （ひざ当てや、すねの張り出しもスカートを押す）。置いていない側は仮の脚
  root.updateMatrixWorld(true);
  const legShapes = ['l', 'r'].flatMap(s => {
    const real = items.flatMap((it, i) => (halfOf(it.part) === 'leg' && sideOf(it) === s && groups[i] ? [groups[i], ...groups[i].userData.extra.values()].flatMap(posedOutlines) : []));
    return real.length ? real : legs[s].outlines.map(o => ({ ...o, angle: pose[s][0] * D, kneeAngle: o.knee ? pose[s][1] * D : 0 }));
  });
  // 各スカートの形は、閉じた姿勢の世界の座標で取り直す（置き方を変えてもそのまま効く）
  for (const g of groups) for (const h of g.userData.hinges) h.sub.rotation.x = 0;
  root.updateMatrixWorld(true);
  for (const g of groups) for (const h of g.userData.hinges) {
    const tris = [], x = [Infinity, -Infinity];   // 三角形ごとの頂点（形は index の無い三角形の並び）
    h.sub.traverse(o => {
      if (!o.isMesh) return;
      const a = o.geometry.attributes.position;
      for (let i = 0; i < a.count; i++) { _v.fromBufferAttribute(a, i).applyMatrix4(o.matrixWorld); tris.push(_v.x, _v.y, _v.z); x[0] = Math.min(x[0], _v.x); x[1] = Math.max(x[1], _v.x); }
    });
    const at = h.sub.getWorldPosition(new THREE.Vector3());
    h.sub.rotation.x = -h.dir * pushAngle({ tris, hinge: [at.y, at.z], dir: h.dir, x }, legShapes);   // 脚ごとにその脚の幅にかかる所で調べる
  }
}
/** 置いた部品の中の 1 個ずつの、今の姿勢での横から見た形（y, z の凸包、x の帯ごと）。当たり判定の無い部品（動力パイプ）は入れない */
function posedOutlines(g) {
  const out = [];
  g.traverse(o => {
    if (!o.isMesh || o.userData.noHit) return;
    const a = o.geometry.attributes.position, tris = [];
    for (let i = 0; i < a.count; i++) { _v.fromBufferAttribute(a, i).applyMatrix4(o.matrixWorld); tris.push(_v.x, _v.y, _v.z); }
    out.push(...bandedOutlines(tris));   // x の幅 5 cm ごとの帯に分ける（同じ x の所どうしで比べる）
  });
  return out;
}
/** 調べる脚の姿勢（太もも・ひざの角度の組、度）：脚の動く範囲ぜんぶ（kneetilt.js の TILT_GRID）と、ゲームの動きの全部のコマ（3° 刻みに丸めて重なりを除く） */
function posePairs() {
  const set = new Map(TILT_GRID.map(p => [p.join(), p])), n = set.size;
  for (const p of [[92, -92], [83, -83], [-30, -86]]) set.set(p.join(), p);
  const deg = v => Math.round((v || 0) / D / 3) * 3;
  for (const frames of Object.values(MOVES)) for (const f of frames) for (const s of ['l', 'r']) { const p = [deg(f[`leg_${s}`]?.x), deg(f[`shin_${s}`]?.x)]; set.set(p.join(), p); }
  return { pairs: [...set.values()], moves: n };   // moves：ここから後ろがゲームの動き（と片膝）
}
/**
 * ひざ当ての角度を、置いてある前スカートに合わせる（kneetilt.js）：すねに付くひざ当てを、付け根を軸に前へ倒して、
 * 前スカートを押さない、いちばん小さい角度にする。置いた部品の mov・rot を書き換える（あとで手で動かしてもよい）
 */
function fitKneeGuards() {
  const isGuard = it => byId[it.part]?.cat === 'ひざ当て' && byId[it.part].pieces[0].bone === 'shin';
  if (!items.some(isGuard)) return;
  const { pairs, moves } = posePairs();
  for (const g of groups) for (const h of g.userData.hinges) h.sub.rotation.x = 0;
  root.updateMatrixWorld(true);
  const shapes = idx => idx.flatMap(i => [groups[i], ...groups[i].userData.extra.values()].flatMap(posedOutlines));
  const set = (i, deg) => { items[i] = tilted(items[i], deg); applyToGroup(items[i], groups[i]); groups[i].updateMatrixWorld(true); };
  // 左右それぞれの：ひざ当て（置いた順）、前スカートの形、ほかの脚の部品
  const side = {};
  for (const s of ['l', 'r']) {
    const gi = items.map((it, i) => i).filter(i => sideOf(items[i]) === s && isGuard(items[i])), skirts = [];
    groups.forEach((g, i) => {
      if (sideOf(items[i]) !== s) return;
      for (const h of g.userData.hinges) {
        if (h.dir <= 0) continue;
        const tris = [], x = [Infinity, -Infinity];
        h.sub.traverse(o => { if (!o.isMesh) return; const a = o.geometry.attributes.position; for (let k = 0; k < a.count; k++) { _v.fromBufferAttribute(a, k).applyMatrix4(o.matrixWorld); tris.push(_v.x, _v.y, _v.z); x[0] = Math.min(x[0], _v.x); x[1] = Math.max(x[1], _v.x); } });
        const at = h.sub.getWorldPosition(new THREE.Vector3());
        skirts.push({ tris, hinge: [at.y, at.z], dir: 1, x });
      }
    });
    const others = items.map((it, i) => i).filter(i => halfOf(items[i].part) === 'leg' && sideOf(items[i]) === s && !gi.includes(i));
    const pose = ([a, b]) => { poseLeg(s, a, b); legJ[s].outer.updateMatrixWorld(true); };
    side[s] = { gi, skirts, pose, others };
  }
  // 左の k 番目と右の k 番目のひざ当てを 1 組にして、同じ角度にそろえる
  const done = [];
  for (let k = 0; k < Math.max(side.l.gi.length, side.r.gi.length); k++) {
    const sds = ['l', 'r'].filter(s => side[s].gi[k] != null).map(s => { const { gi, skirts, pose, others } = side[s], i = gi[k];
      return { i, skirts, poses: pairs, moves, other: p => { pose(p); return shapes(others); }, guard: (p, deg) => { pose(p); set(i, deg); return shapes([i]); } }; });
    const r = fitTiltBoth(sds);
    for (const sd of sds) set(sd.i, r.tilt);
    done.push(`${r.tilt}°${!r.ok ? '（合う角度なし）' : r.pushes ? '（スカートが長く、ひざ当てに押されて少し開く）' : ''}`);
  }
  applyPose(); if (selected >= 0) fillFields(); save();
  note(`ひざ当ての角度を前スカートに合わせました：前へ ${done.join('、')}`, done.some(d => d.includes('なし')));
}
const stopMove = () => { playing = false; movePose = null; $('#moveSel').value = ''; };
for (const k of SLIDERS) $('#' + k).oninput = () => { swing = false; stopMove(); applyPose(); };
const setPose = (v) => { swing = false; stopMove(); SLIDERS.forEach((k, i) => { $('#' + k).value = v[i] ?? 0; }); applyPose(); };
$('#bRest').onclick = () => setPose([]);
$('#bKneel').onclick = () => setPose([92, -12, -10, -86]);   // 片膝：前の脚は太ももが水平、後ろの脚はすねが後ろへ寝る
$('#bSeiza').onclick = () => setPose([86, 86, -163, -163]);   // 正座（ゲームの動きには無い）：太ももを前へ、すねを折りたたむ（2 重関節のひざ）
let swing = false, t0 = 0;
$('#bSwing').onclick = () => { stopMove(); swing = !swing; t0 = performance.now(); };

// ゲームの動き（poses.json）：選ぶと 16 コマをくり返し再生する。脚はつまみへ写す（スカートの押し開きもそれで動く）
const MOVE_LABEL = { saber_0_袈裟斬り: '剣：袈裟斬り', saber_1_横薙ぎ: '剣：横薙ぎ', saber_2_斬り上げ: '剣：斬り上げ', saber_3_唐竹割り: '剣：唐竹割り', saber_dash_唐竹割り: '剣：突進して唐竹割り',
  knife_0_横薙ぎ: 'ナイフ：横薙ぎ', knife_1_突き: 'ナイフ：突き', ram_0_旋回打ち: '打撃：旋回打ち', ram_1_振り下ろし: '打撃：振り下ろし', throw: '投げる', throw_windup_hold: '投げる構え',
  weapon_change: '持ち替え', crouch: 'しゃがむ', twist_aim: 'ひねって構える', charge: '突進', carry: '運ぶ', walk_aim: '歩いて構える', kneel_迫撃: '片膝（迫撃）', sit_片膝: '片膝をつく' };
let MOVES = {}, playing = false, moveAt = 0;
fetch('./poses.json').then(r => r.json()).then(j => {
  MOVES = j.moves;
  $('#moveSel').innerHTML = '<option value="">（つまみで動かす）</option>' + Object.keys(MOVES).map(k => `<option value="${k}">${MOVE_LABEL[k] ?? k}</option>`).join('');
}).catch(() => { $('#moveSel').innerHTML = '<option value="">（動きを読めません）</option>'; });
$('#moveSel').onchange = e => { swing = false; if (!e.target.value) { stopMove(); applyPose(); return; } playing = true; moveAt = performance.now(); };
function moveFrame(now) {
  const frames = MOVES[$('#moveSel').value];
  if (!frames?.length) return;
  const f = Math.max(0, now - moveAt) / 1000 * 10, i = Math.floor(f) % (frames.length + 6), fr = frames[Math.min(i, frames.length - 1)];   // 1 秒に 10 コマ、終わりで少し止まる
  movePose = fr;
  const deg = v => Math.round((v || 0) / D);
  $('#legL').value = deg(fr.leg_l?.x); $('#legR').value = deg(fr.leg_r?.x); $('#shinL').value = deg(fr.shin_l?.x); $('#shinR').value = deg(fr.shin_r?.x);
  applyPose();
}

// ---- 向き ----
const VIEWS = { front: [0, 0, 1], side: [1, 0, 0], threeq: [0.75, 0.35, 1], top: [0, 1, 0.001], back: [-0.5, 0.25, -1], low: [0.6, -0.55, 1] };
let focus = null;   // パーツエディタを開いている間：{ c: 見る中心, dist: 距離 }（向きのボタンが、機体ではなくパーツを映す）
function setView(k) { const d = new THREE.Vector3(...VIEWS[k]).normalize(), c = focus?.c ?? AT; camera.position.copy(c).addScaledVector(d, focus?.dist ?? viewDist); orbit.target.copy(c); orbit.update(); }
document.querySelectorAll('[data-view]').forEach(b => { b.onclick = () => setView(b.dataset.view); });

/** 頭の殻（部位「頭蓋」）の置いたパーツ。無ければ null */
const headShell = () => headShellIn(items);
/** 頭の入れ物の置き方（unitparts.js の headPlace）：{ k, at }。体の座標 = at + k · 頭の座標 */
const headPlace = () => headPlaceIn(items, adj);
function placeHead() { const { k, at } = headPlace(); headHolder.scale.setScalar(k); headHolder.position.set(...at); }
function rebuild() {
  endFlash();
  rebuildMain();
  drawEdges();
}
function rebuildMain() {
  applyKind();
  seatWeapons();
  for (const g of groups) { g.parent?.remove(g); for (const e of g.userData.extra.values()) e.parent?.remove(e); }
  groups = items.map((it, i) => { const g = groupOf(it, i); holderOf(it).add(g); for (const [b, e] of g.userData.extra) holderFor(b, it).add(e); return g; });
  placeArmJoints();
  placeLegJoints();
  placeHead();
  placeFreeJoints();
  if (selected >= 0 && selected < items.length) gizmo.attach(groups[selected]); else gizmo.detach();
  renderList();
  fillFields();
  markCatalog();
  updateGhostChest();
  applyPose();
  if (PE.active()) PE.afterRebuild();
  disposeStale();
}

// ---- 輪郭線：形の折れ目（30° より急な所）に線を引いて見せる。見た目だけ（押して選ぶ・書き出す形には入らない）。パーツエディタの間は引かない ----
let showEdges = false;
try { showEdges = localStorage.getItem('xsv2.edges') === '1'; } catch { /* storage blocked */ }
const edgeMat = new THREE.LineBasicMaterial({ color: 0x0b0d10, transparent: true, opacity: 0.55 }), edgeGeos = new WeakMap();
function drawEdges() {
  if (!showEdges || PE.active()) return;
  for (const g of groups) for (const t of [g, ...g.userData.extra.values()]) {
    const meshes = []; t.traverse(o => { if (o.isMesh && o.userData.pc && (o.geometry.attributes.position?.count ?? 0) < 60000) meshes.push(o); });
    for (const m of meshes) {
      let eg = edgeGeos.get(m.geometry); if (!eg) { eg = new THREE.EdgesGeometry(m.geometry, 30); edgeGeos.set(m.geometry, eg); }
      const line = new THREE.LineSegments(eg, edgeMat); line.raycast = () => {}; line.userData.edge = true; m.add(line);
    }
  }
}
$('#bEdges').classList.toggle('on', showEdges);
$('#bEdges').onclick = () => { showEdges = !showEdges; $('#bEdges').classList.toggle('on', showEdges); try { localStorage.setItem('xsv2.edges', showEdges ? '1' : '0'); } catch { /* storage blocked */ } rebuild(); };

function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== Math.floor(w * renderer.getPixelRatio()) || canvas.height !== Math.floor(h * renderer.getPixelRatio())) { renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
}
function tick(now) {
  if (swing) {
    const a = Math.sin((now - t0) / 1000 * 1.6);
    $('#legL').value = Math.round(a > 0 ? a * 92 : a * 29); $('#legR').value = Math.round(-a > 0 ? -a * 92 : -a * 29);
    $('#shinL').value = Math.round(-Math.max(0, a) * 60); $('#shinR').value = Math.round(-Math.max(0, -a) * 60);
    applyPose();
  }
  if (meshDirty) { meshDirty = false; rebuild(); }
  if (playing) moveFrame(now);
  flashTick(now);
  resize(); orbit.update(); if (PE.active()) PE.tick(); renderer.render(scene, camera); requestAnimationFrame(tick);
}

// ---- クリックで選ぶ・キー ----
const ray = new THREE.Raycaster();
let downAt = null;
canvas.addEventListener('pointerdown', e => { downAt = [e.clientX, e.clientY]; });
canvas.addEventListener('pointerup', e => {
  if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 4 || gizmo.dragging) { downAt = null; return; }
  downAt = null;
  const r = canvas.getBoundingClientRect();
  const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  if (PE.active()) { PE.pick(ndc); return; }   // パーツを直している間は、ブロック・角・面を選ぶ
  ray.setFromCamera(ndc, camera);
  const hits = ray.intersectObjects(groups, true);
  select(hits.length ? hits[0].object.userData.index : -1);
});
document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
  if (PE.active()) { PE.key(e); return; }   // パーツエディタを開いている間は、キーはパーツエディタのもの（元に戻す・やり直すも）
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); $('#bSave').onclick(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
  if (e.key === 'w') gizmo.setMode('translate'); else if (e.key === 'e') gizmo.setMode('rotate'); else if (e.key === 'r') gizmo.setMode('scale');
  else if (e.key === 'Delete' && selected >= 0) removeSelected();
});
for (const b of document.querySelectorAll('#gizmo button')) b.onclick = () => (PE.active() ? PE.setGizmoMode(b.dataset.mode) : gizmo.setMode(b.dataset.mode));

// ---- 一覧と欄 ----
const labelOf = it => (it.name ?? byId[it.part]?.name ?? it.part) + (placeOf(byId[it.part]).pair ? (it.mov[0] >= 0 ? '（+x）' : '（−x）') : '');
function select(i) { if (PE.active()) return; selected = i; if (i >= 0 && items[i]) showTab(halfOf(items[i].part)); if (i >= 0) gizmo.attach(groups[i]); else gizmo.detach(); renderList(); fillFields(); if (i >= 0) flash([i]); }
// ---- 選んだパーツを光らせて知らせる：3D のそのパーツ・カタログのそのパーツのボタン・一覧の行が、2 回点滅する（依頼主の案）。
// 3D で押せば「カタログのどれか」が、一覧・カタログから選べば「機体のどこか」が分かる
const flashMat = new THREE.MeshBasicMaterial({ color: 0x6fb3ff, transparent: true, opacity: 0, depthTest: false, depthWrite: false });
let flashing = null;   // { meshes: 重ねた光, t0 }
const FLASH_MS = 900;
function endFlash() { if (!flashing) return; for (const m of flashing.meshes) m.parent?.remove(m); flashing = null; }
/** 置いたパーツ（items の番号の並び）を点滅させる。カタログのボタンと一覧の行は、最初の 1 個のもの */
function flash(ix) {
  endFlash();
  const meshes = [];
  for (const i of ix) for (const t of groups[i] ? [groups[i], ...groups[i].userData.extra.values()] : []) t.traverse(o => { if (o.isMesh && o.userData.pc && o.material !== flashMat) meshes.push(o); });
  flashing = { t0: performance.now(), meshes: meshes.map(o => { const m = new THREE.Mesh(o.geometry, flashMat); m.renderOrder = 8; m.raycast = () => {}; o.add(m); return m; }) };
  for (const el of document.querySelectorAll('.flash')) el.classList.remove('flash');
  const blink = el => { if (!el) return; void el.offsetWidth; el.classList.add('flash'); el.scrollIntoView({ block: 'nearest' }); };
  blink(catButtons.get(items[ix[0]]?.part));
  blink($('#items').children[ix[0]]);
}
function flashTick(now) {
  if (!flashing) return;
  const t = (now - flashing.t0) / FLASH_MS;
  if (t >= 1) { endFlash(); return; }
  flashMat.opacity = 0.55 * Math.abs(Math.sin(t * Math.PI * 2));   // 2 回
}
const ONE_EACH = new Set(['前スカート', '横スカート', '後ろスカート', '太もも', 'すね', '足']);
function renderList() {
  const el = $('#items');
  el.innerHTML = '';
  items.forEach((it, i) => {
    const d = document.createElement('div');
    d.className = i === selected ? 'sel' : '';
    // 1 か所に 1 つの部位（スカート・太もも・すね・足）が同じ側に 2 つ以上あれば、重なっていると知らせる（別々に動くので、板が 2 枚に見える）
    const cat = byId[it.part]?.cat, dup = ONE_EACH.has(cat) ? items.findIndex((o, j) => j !== i && byId[o.part]?.cat === cat && sideOf(o) === sideOf(it)) : -1;
    d.innerHTML = `<span>${i + 1}. ${labelOf(it)}${dup >= 0 ? ` <b style="color:#e8a33d">⚠ ${dup + 1} 番と同じ部位（重なっている）</b>` : ''}</span>`;
    d.onclick = () => select(i);
    el.appendChild(d);
  });
  $('#sel').hidden = selected < 0;
}
const FIELDS = { mx: ['mov', 0], my: ['mov', 1], mz: ['mov', 2], rx: ['rot', 0], ry: ['rot', 1], rz: ['rot', 2], sx: ['scal', 0], sy: ['scal', 1], sz: ['scal', 2] };
function fillFields() {
  if (selected < 0) return;
  const it = items[selected];
  $('#fName').value = it.name ?? byId[it.part]?.name ?? it.part;
  for (const [id, [k, j]] of Object.entries(FIELDS)) $('#' + id).value = it[k][j];
}
for (const [id, [k, j]] of Object.entries(FIELDS)) $('#' + id).oninput = () => {
  if (selected < 0) return;
  const it = items[selected], v = parseFloat($('#' + id).value);
  if (!Number.isFinite(v)) return;
  it[k][j] = v; applyToGroup(it, groups[selected]); placeArmJoints(); applyPose(); save();
};
$('#fName').oninput = () => { if (selected >= 0) { items[selected].name = $('#fName').value; renderList(); save(); } };

function addItems(list) { items.push(...list); selected = items.length - 1; rebuild(); save(); if (!PE.active() && !addOnly) flash(list.map((_, k) => items.length - list.length + k)); }
function removeSelected() { if (selected < 0) return; items.splice(selected, 1); selected = Math.min(selected, items.length - 1); rebuild(); save(); }
$('#bDel').onclick = removeSelected;
$('#bDup').onclick = () => { if (selected < 0) return; const it = structuredClone(items[selected]); it.mov = [it.mov[0] + 0.05, it.mov[1], it.mov[2]]; addItems([it]); };
$('#bMirror').onclick = () => { if (selected < 0) return; const src = items[selected], m = mirrorOf(structuredClone(src)); if (src.name) m.name = src.name.replace(/（鏡像）$/, '') + '（鏡像）'; else delete m.name; addItems([m]); };   // 名前を付けていないパーツは、カタログの名前のまま（左右は一覧の（±x）で分かる）

// ---- 寸法の調整：上半身の部品をまとめて上下、肩関節と肩アーマーをまとめて左右・上下に動かす。つまみの値は組み立てと一緒に保存し、
// 動かした量（前の値との差）だけ置いた部品の位置を変える（元に戻すでも戻る）
let adj = { ...ADJ0 };
const SHOULDER_CAT = new Set(['肩関節', '肩アーマー']);
/** 肩の左右・高さの調整で一緒に動く部品：肩関節・肩アーマーと腕 */
const followsShoulder = def => SHOULDER_CAT.has(def.cat) || ARM_CAT.has(def.cat);
// 関節の間の長さ・頭：置いたパーツの数値は変えず、表示と書き出しのときに掛ける（bodyparts.js の fitItem・jointsOf、headPlace）
const SEG_ADJ = [['neck', 'adjNeck'], ['headZ', 'adjHeadZ'], ['upperArm', 'adjUArm'], ['foreArm', 'adjFArm'], ['thigh', 'adjThigh'], ['shin', 'adjShin']];
function showAdj() {
  for (const [k, id] of [['up', 'adjUp'], ['sh', 'adjSh'], ['shY', 'adjShY'], ...SEG_ADJ]) { $('#' + id).value = Math.round(adj[k] * 100); $('#' + id + 'v').textContent = `${Math.round(adj[k] * 100)} cm`; }
  $('#adjHeadK').value = Math.round(adj.headK * 100); $('#adjHeadKv').textContent = `${Math.round(adj.headK * 100)} %`;
}
for (const [k, id] of SEG_ADJ) $('#' + id).oninput = () => { adj[k] = +$('#' + id).value / 100; showAdj(); rebuild(); save(); };
$('#adjHeadK').oninput = () => { adj.headK = +$('#adjHeadK').value / 100; showAdj(); rebuild(); save(); };
$('#bAdjReset').onclick = () => { for (const [k] of SEG_ADJ) adj[k] = 0; adj.headK = 1; showAdj(); rebuild(); save(); };
for (const [k, id] of [['up', 'adjUp'], ['sh', 'adjSh'], ['shY', 'adjShY']]) $('#' + id).oninput = () => {
  const v = +$('#' + id).value / 100, d = v - adj[k];
  adj[k] = v;
  for (const it of items) {
    if (!withUpper(it.part)) continue;
    const sh = followsShoulder(byId[it.part]);
    if (k === 'up') it.mov[1] = round(it.mov[1] + d, 4);
    else if (k === 'shY' && sh) it.mov[1] = round(it.mov[1] + d, 4);
    else if (k === 'sh' && sh) it.mov[0] = round(it.mov[0] + Math.sign(it.mov[0] || 1) * d, 4);
  }
  showAdj(); rebuild(); save();
};

// ---- カタログ（部品ごとに小さな絵）。押すと決まった所に置く（左右の対は両側に） ----
// 押すたびに増やす（頭の組み立てと同じ）。「同じ部位は入れ替える」を入れると、同じ部位の部品を消してから置く。
// 同じ部品が同じ所にあれば、重ならないよう 4 cm ずつ下へずらす（あとで移動・回転・拡大で動かす）
/** 動力パイプをランダムに：作り方を選んで部品の形を作り、決まった所に置く（左右の対は両側に） */
function placeRandomPipe() {
  const gen = randomPipeGen(), def = pipeDef(gen);
  byId[def.id] = def;
  const before = items.length;
  place(def);
  for (const it of items.slice(before)) it.gen = gen;
  save();
}
/** 頭のパーツを置く：頭の組み立てと同じ決め方で、頭の殻に合わせた目安の真ん中に（左右の対は両側に）。殻が無ければ、先に標準の殻を置く */
function placeHeadPart(def) {
  const raw = def.id.slice(HP.length), r4 = v => round(v, 4);
  if (def.cat === '頭蓋') {
    const old = headShell();   // 殻は 1 つ：置いてあれば、同じ置き方のまま入れ替える（新しく作るパーツは、同じ置き方で足すだけ）
    if (old && addOnly) { addItems([{ part: def.id, mov: old.mov.slice(), rot: old.rot.slice(), scal: old.scal.slice() }]); return; }
    if (old) { old.part = def.id; rebuild(); save(); return; }
    addItems([{ part: def.id, mov: [0, 0, -0.125], rot: [0, 0, 0], scal: [3, 3.1, 2.2] }]); return;
  }
  if (!headShell()) items.push({ part: HP + 'headshell', mov: [0, 0, -0.125], rot: [0, 0, 0], scal: [3, 3.1, 2.2] });
  if (!isMulti(def) && !addOnly) dropSameCat(def);
  const placed = id => placementsFor(id, rawHead(headShell()), () => 0.5).map(it => asHead({ part: it.part, mov: it.mov.map(r4), rot: it.rot.map(v => round(v, 1)), scal: it.scal.map(v => round(v, 3)) }));
  // 首当ては首に足して付ける：首の無い頭に置いたら、標準の首も一緒に置く（首の無い頭にしない）
  if (def.cat === '首当て' && !addOnly && !items.some(it => isHead(it.part) && byId[it.part]?.cat === '首')) items.push(...placed('neck'));
  const add = placed(raw);
  const same = m => items.some(it => it.part === def.id && Math.abs(it.mov[0] - m[0]) < 1e-6 && Math.abs(it.mov[1] - m[1]) < 1e-6 && Math.abs(it.mov[2] - m[2]) < 1e-6);
  for (let k = 0; k < 20 && add.some(it => same(it.mov)); k++) for (const it of add) it.mov[1] = round(it.mov[1] - 0.03, 4);
  addItems(add);
}
/**
 * 新しく作るパーツは、機体を変えない（依頼主の指摘：作る部位を選んで作り始めただけで、組んでいる機体の頭の殻が新しい箱に入れ替わった。
 * 頼まれていないのに機体を書き換えてはいけない）。パーツエディタを開いている間だけ、位置合わせのために仮に置く（tmp の印付き。今あるパーツとは入れ替えず、
 * 足すだけ）。完了でもやめるでも仮のものは外し、機体は開く前と同じ。できたパーツはカタログに入るだけで、置くのは依頼主がカタログで押したとき。
 * addOnly：仮に置く間だけ true
 */
let addOnly = false;
function placeNew(def) { const n = items.length; addOnly = true; try { place(def); } finally { addOnly = false; } for (const it of items.slice(n)) it.tmp = true; persist(); }
/** 仮に置いたものを外す */
const dropTmp = () => { const n = items.length; items = items.filter(it => !it.tmp); if (items.length !== n) selected = -1; };
/** 自由な部品を置く。頭まるごと：今の頭と入れ替えて、首の付け根の上へ（首のある頭は、首が襟の中へ入る）。自由な機体：そのままの位置に足す */
function placeFree(def) {
  if (def.tab === 'weapon') {   // 手持ちの武器：今の武器と入れ替えて、右手へ（置き場所は seatWeapons が決める）
    if (!addOnly) { const n = items.length; items = items.filter(it => byId[it.part]?.tab !== 'weapon'); if (items.length !== n) selected = -1; }
    addItems([{ part: def.id, mov: [0, 0, 0], rot: [0, 0, 0], scal: [1, 1, 1] }]);
    return;
  }
  if (def.tab === 'head') {
    if (!addOnly) { const n = items.length; items = items.filter(it => halfOf(it.part) !== 'head'); if (items.length !== n) selected = -1; }
    addItems([{ part: def.id, mov: [0, round(S.neck.y + 0.02 + adj.up + adj.neck - (def.bottom ?? S.neck.y), 4), round(adj.headZ, 4)], rot: [0, 0, 0], scal: [1, 1, 1] }]);
  } else addItems([{ part: def.id, mov: [0, 0, 0], rot: [0, 0, 0], scal: [1, 1, 1] }]);
}
function place(def) {
  if (busy()) return;
  if (def.free) { placeFree(def); return; }
  if (isHead(def.id)) { placeHeadPart(def); return; }
  // 背中：バックパックと翼は一緒に付けられる（Ver2 から。前の画面は、どちらか片方だった）。バックパック・翼そのものはそれぞれ 1 つだけで、
  // 入れ替えると、置いてある装備は新しい付ける所へ移す
  const grp = BACK_GROUP[def.cat], base = def.cat === 'バックパック' || def.cat === '翼';
  if (grp) {
    const n = items.length;
    if (!addOnly) items = items.filter(it => !(base && byId[it.part]?.cat === def.cat));
    if (items.length !== n) selected = -1;
    // 装備だけを置こうとして、付ける相手（バックパック・翼）が無ければ、標準のものを先に置く
    const baseCat = grp === 'pack' ? 'バックパック' : '翼';
    if (!base && !items.some(it => byId[it.part]?.cat === baseCat)) place(byId[grp === 'pack' ? 'backpack' : def.slot === 'dock' ? DEFAULT_RACK : 'wingblade']);
  }
  // オーブ（ORB）：ORB 収納ラックの次の空いている収納口へ、左右 1 基ずつ入れる。収納口のある翼が無ければ、先に標準のラックを置く（今の翼と入れ替わる）。
  // 挿せるタンク（斜め下・垂直）も、収納口のある翼ではここへ入る（ほかの翼では吊り下げる所に吊る）
  if (usesDock(def, items)) {
    if (!nextDockItems(items, def.id)) place(byId[DEFAULT_RACK]);
    addItems(nextDockItems(items, def.id));
    return;
  }
  // エフェクト・遠隔砲台は、ほかの部品と同じく押すたびに増える（いくつ置いてもよい。入れ替えたいときは「同じ部位は入れ替える」）
  const { mov, pair, based, rot: rot0 = [0, 0, 0] } = placeOf(def);
  if (withUpper(def.id) && !based) { mov[1] += adj.up + (followsShoulder(def) ? adj.shY : 0); if (followsShoulder(def)) mov[0] += adj.sh; }
  if (!isMulti(def) && !grp && !addOnly) dropSameCat(def);   // （背中の入れ替えは上で済んでいる）
  const same = m => items.some(it => it.part === def.id && Math.abs(it.mov[0] - m[0]) < 1e-6 && Math.abs(it.mov[1] - m[1]) < 1e-6 && Math.abs(it.mov[2] - m[2]) < 1e-6);
  const at = mov.slice();
  for (let k = 0; k < 20 && same(at); k++) at[1] = round(at[1] - 0.04, 4);
  // rot0：決まった傾き（斜め下のタンク）。反対側は鏡像（回転の y・z の符号を返す）
  const add = pair ? [1, -1].map(s => ({ part: def.id, mov: [s * at[0], at[1], at[2]], rot: [rot0[0], s * rot0[1], s * rot0[2]], scal: [s, 1, 1] }))
    : [{ part: def.id, mov: at, rot: rot0.slice(), scal: [1, 1, 1] }];
  addItems(add);
  if (base && !addOnly) reseatGear(def);
  // ラック（ひれ付きの吊り柱）を置いたら、吊り柱の無い装備（タンク）をラックの下の端へ移す
  if (def.id === 'wgrack') { for (const it of items) { const g = byId[it.part]; if (!g?.bare) continue; const m = placementOfBack(g, items).mov; it.mov = [round(Math.sign(it.mov[0] || 1) * m[0], 4), round(m[1], 4), round(m[2], 4)]; } rebuild(); save(); }
  if (!addOnly && (def.cat === 'ひざ当て' || def.cat === '前スカート')) fitKneeGuards();   // ひざ当ての角度は、前スカートに合わせる
}
/** 置いてある装備を、新しく置いたバックパック・翼（def）の付ける所へ移す（左右は今の側のまま） */
function reseatGear(def) {
  const gearCat = def.cat === 'バックパック' ? 'バックパックの装備' : '翼の装備';
  let moved = false;
  // オーブは、新しい翼の収納口へ入れ直す（収納口が足りない分・収納口の無い翼では外す）。挿せるタンクは、収納口のある翼なら収納口へ、無い翼なら吊り下げる所へ
  if (def.cat === '翼') {
    const docked = it => { const g = byId[it.part]; return g?.slot === 'dock' || (!!def.docks?.length && canDock(g)); };
    const orbs = items.filter(it => docked(it) && it.mov[0] >= 0).map(it => it.part);
    if (orbs.length) {
      items = items.filter(it => !docked(it)); selected = -1; moved = true;
      orbs.slice(0, def.docks?.length ?? 0).forEach(id => { const add = nextDockItems(items, id); if (add) items.push(...add); });
    }
  }
  for (const it of items) {
    const g = byId[it.part];
    if (g?.slot === 'dock' || (g?.cat !== gearCat && !(g?.cat === FX_CAT && g.slot !== 'center'))) continue;   // エフェクト（光の帯・光の刃）も付け直す
    const pl = placementOfBack(g, items), m = pl.mov, s = it.mov[0] < 0 ? -1 : 1;
    it.mov = [round(s * m[0], 4), round(m[1], 4), round(m[2], 4)]; moved = true;
    if (g.dockable) { const r = pl.rot ?? [0, 0, 0]; it.rot = [r[0], s * r[1], s * r[2]]; }   // 収納口から吊り下げる所へ戻るときは、傾きも戻す
  }
  if (moved) { rebuild(); save(); }
}
// 「同じ部位は入れ替える」の入り切りを覚える（この画面を開いた人のブラウザだけ）
let thumbR = null, thumbScene = null;
function thumbnail(def, cv) {
  const w = 192, h = 144;
  cv.width = w; cv.height = h;
  if (!thumbR) {
    thumbR = new THREE.WebGLRenderer({ canvas: document.createElement('canvas'), antialias: true, alpha: true, preserveDrawingBuffer: true });
    thumbR.setSize(w, h, false);
    thumbScene = new THREE.Scene();
    thumbScene.add(new THREE.HemisphereLight(0xdde4f0, 0x1a1c22, 0.9));
    const k = new THREE.DirectionalLight(0xffffff, 1.3); k.position.set(1, 2, 1.5); thumbScene.add(k);
  }
  const g0 = groupOf({ part: def.id, mov: [0, 0, 0], rot: [0, 0, 0], scal: [1, 1, 1] }, -1), g = def.free ? new THREE.Group().add(g0, ...g0.userData.extra.values()) : g0;
  thumbScene.add(g);
  const b = new THREE.Box3().setFromObject(g);
  const c = b.getCenter(new THREE.Vector3()), size = b.getSize(new THREE.Vector3()).length();
  const cam = new THREE.PerspectiveCamera(30, w / h, 0.01, 100);
  cam.position.copy(c).add(new THREE.Vector3(0.7, 0.3, 0.75).multiplyScalar(size * 1.9));
  cam.lookAt(c);
  thumbR.render(thumbScene, cam);
  cv.getContext('2d').drawImage(thumbR.domElement, 0, 0);
  thumbScene.remove(g);
}
const catButtons = new Map();
// 左のタブ：部位ごとにカタログを出す
const TABS = [['head', '頭', HEAD], ['upper', '上半身', UPPER], ['back', '背中', BACK], ['arm', '腕', ARM], ['lower', '下半身', LOWER], ['leg', '脚', LEG], ['weapon', '武器', []], ['free', '取り込み', []]];
/** そのタブに並べるパーツ：頭のタブには「頭まるごと」（機体エディタの機体から取り出した頭）、取り込みのタブには自由な機体 */
const tabList = (half, list) => (half === 'head' ? [...list, ...FREE.filter(d => d.tab === 'head')] : half === 'weapon' ? FREE.filter(d => d.tab === 'weapon') : half === 'free' ? FREE.filter(d => !d.tab) : list);
let tab = 'head';
function showTab(t) {
  tab = t;
  for (const b of $('#tabs').children) b.classList.toggle('on', b.dataset.tab === t);
  for (const sec of $('#catalog').children) sec.hidden = sec.dataset.half !== t;
  $('#catalog').scrollTop = 0;
}
$('#tabs').innerHTML = TABS.map(([h, title]) => `<button data-tab="${h}">${title}</button>`).join('');
for (const b of $('#tabs').children) b.onclick = () => showTab(b.dataset.tab);
function renderCatalog() {
  const el = $('#catalog');
  el.innerHTML = '';
  for (const [half, , list0] of TABS) {
    const list = tabList(half, list0);
    const sec = document.createElement('div'); sec.className = 'half'; sec.dataset.half = half; sec.hidden = half !== tab; el.appendChild(sec);
    if (half === 'weapon') {   // 手持ちの武器：名前の決まりと、新しく作るボタン
      const top = document.createElement('div'); top.className = 'hint'; top.style.marginTop = '8px';
      top.innerHTML = '右手に持つ武器。押すと持つ（今の武器と入れ替わる）。腕の長さや手を変えても、手に付いていく。「直す」でパーツエディタ。<br>ブロックの名前で、ゲームでの扱いが決まる：「ライフル」「銃」「マガジン」「マズル」＝銃（格闘・投げる間は隠れる）、「バズーカ」＝バズーカ（選んだときだけ出る）、「マズル」「銃口」＝弾の出る所。<br>機体が武器を持っていなければ、書き出すときに陣営の強襲の 1 式を持たせる。<div class="row" style="margin-top:6px"><button class="small" id="bNewWeapon" style="flex:1">新しい武器を作る</button></div>腕を下ろした姿勢では、銃は下を向く（腕を前へ上げると前を向く）。';
      sec.appendChild(top);
      top.querySelector('#bNewWeapon').onclick = newWeapon;
    }
    if (half === 'free' && !list.length) sec.innerHTML = '<div class="hint" style="margin-top:8px">機体エディタ（1）の形式の機体を開くと、ここに並ぶ。「開く」→「機体エディタ 1 に残っているもの」か、ファイルから</div>';
    for (const cat of [...new Set(list.map(p => p.cat))]) {
      const h = document.createElement('h2'); h.innerHTML = `${cat}<i>${cat === '頭まるごと' ? '押すと、今の頭と入れ替わる' : cat === WEAPON_CAT ? '押すと、右手に持つ（今の武器と入れ替わる）' : cat === '自由な機体' ? '押すと、今の機体に足して置く' : isMulti({ cat }) ? 'いくつでも（押すと増える）' : '1 つ（押すと入れ替わる）'}</i>`; sec.appendChild(h);
      const grid = document.createElement('div'); grid.className = 'cat'; sec.appendChild(grid);
      for (const def of list.filter(p => p.cat === cat)) {
        const b = document.createElement('button');
        const cv = document.createElement('canvas'); b.appendChild(cv);
        const s = document.createElement('span'); s.textContent = (def.user ? '★ ' : '') + def.name; b.appendChild(s);
        b.title = def.name + (placeOf(def).pair ? '（左右の対）' : '');
        b.onclick = () => place(def);
        // 自分のパーツ（★）：カタログから直接、直す・消す（機体に置かなくてもできる）
        if (def.user) {
          const ops = document.createElement('span'); ops.className = 'ops';
          ops.innerHTML = '<span class="edit" title="このパーツをパーツエディタで開いて直す">直す</span><span class="del" title="このパーツをカタログから消す">消す</span>';
          ops.querySelector('.edit').onclick = e => { e.stopPropagation(); if (busy()) return; selected = -1; gizmo.detach(); PE.startDef(def); };
          ops.querySelector('.del').onclick = e => { e.stopPropagation(); dropUserPart(def); };
          b.appendChild(ops);
        }
        grid.appendChild(b);
        catButtons.set(def.id, b);
        try { thumbnail(def, cv); } catch (e) { console.warn('thumbnail', def.id, e); }
      }
    }
  }
}
function markCatalog() { for (const [id, b] of catButtons) b.classList.toggle('on', items.some(it => it.part === id)); }

// ---- 保存・元に戻す（Ctrl+Z）・やり直す（Ctrl+Y）・読み込み・書き出し ----
const hist = [];
let histPos = -1, histAt = 0;
// 保存・元に戻すの記録には、仮に置いたもの（新しく作っているパーツ）を入れない：機体は、パーツを作っている間も開く前のまま
const kept = () => items.filter(it => !it.tmp);
function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify({ items: kept(), adj, paint, name: unitName, saveId, savedHash })); } catch { /* storage blocked */ } }
function save() {
  if (addOnly) return;   // 仮に置いている途中（まだ印が付いていない）は記録しない
  persist();
  const snap = JSON.stringify({ items: kept(), paint, adj });
  if (hist[histPos] === snap) return;
  const now = Date.now();
  if (now - histAt < 400 && histPos >= 0) hist[histPos] = snap;
  else { hist.length = histPos + 1; hist.push(snap); histPos = hist.length - 1; if (hist.length > 100) { hist.shift(); histPos--; } }
  histAt = now;
  showUnitName();
}
function restore(pos) {
  if (pos < 0 || pos >= hist.length) return;
  histPos = pos; histAt = 0;
  { const d = JSON.parse(hist[pos]); items = register(d.items).filter(it => byId[it.part] && !it.tmp); paint = d.paint; adj = { ...ADJ0, ...d.adj }; } selected = -1; showAdj(); rebuild(); showPaint(); persist(); showUnitName();
  note(`${pos + 1} / ${hist.length}`);
}
const undo = () => restore(histPos - 1), redo = () => restore(histPos + 1);
$('#bUndo').onclick = () => (PE.active() ? PE.undo() : undo());
$('#bRedo').onclick = () => (PE.active() ? PE.redo() : redo());
function load() { try { const d = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null'); if (d && Array.isArray(d.items)) { items = register(d.items).filter(it => byId[it.part] && !it.tmp); if (d.adj) adj = { ...adj, ...d.adj }; if (d.paint?.pal) paint = { ...DEFAULT_PAINT(), ...d.paint }; unitName = d.name ?? ''; saveId = d.saveId ?? ''; savedHash = d.savedHash ?? ''; return true; } } catch { /* storage blocked */ } return false; }
/** 上半身・腕の見本・ランダムの部品を、今の寸法の調整の位置へずらす */
const adjusted = list => list.map(it => {
  const sh = followsShoulder(byId[it.part]), m = (it.mov ?? [0, 0, 0]).slice();
  m[1] += adj.up + (sh ? adj.shY : 0); if (sh) m[0] += Math.sign(m[0] || 1) * adj.sh;
  return { ...it, mov: m };
});
const tidy = list => register(list).filter(it => byId[it.part]).map(it => ({ part: it.part, name: it.name, ...(it.gen ? { gen: it.gen } : {}), ...(it.tilt != null ? { tilt: it.tilt } : {}), mov: it.mov ?? [0, 0, 0], rot: it.rot ?? [0, 0, 0], scal: it.scal ?? [1, 1, 1] }));
$('#bApply').onclick = () => {
  try {
    const d = JSON.parse($('#paste').value.trim());
    const list = Array.isArray(d) ? d : d.items;
    if (!Array.isArray(list)) throw new Error('機体の JSON の形が違います');
    if (busy()) return;
    registerUnit(d); for (const def of Object.values(d.userParts ?? {})) if (def?.id && byId[def.id] === def) userParts[def.id] = def;
    persistUser(); renderCatalog();
    // 部位だけの JSON（half 付き）：その部位だけを入れ替える。色・寸法の調整は今のまま
    if (d.half) { replaceHalf(d.half, list.filter(it => halfOf(it.part) === d.half)); note(`${HALF_NAME[d.half] ?? d.half}だけ入れ替えました`); return; }
    if (d.adj) { adj = { ...adj, ...d.adj }; showAdj(); }
    if (d.paint?.pal) { paint = { ...DEFAULT_PAINT(), ...d.paint }; showPaint(); }
    items = tidy(list); selected = -1; rebuild(); save(); note('読みました（保存した機体としては、まだ保存していません）');
  } catch (e) { note('読めません：' + e.message, true); }
};
/** 機体の全部：置いたパーツ・寸法の調整・塗りと、使っている自分のパーツ（ほかのブラウザ・道具でも読めるように） */
const usedUser = list => Object.fromEntries(Object.entries(userParts).filter(([id]) => list.some(it => it.part === id)));
const unitDoc = () => ({ format: 'xs-unit', version: 2, ...(unitName ? { name: unitName } : {}), items: kept(), adj, paint, userParts: usedUser(kept()) });
const HALF_NAME = { head: '頭', upper: '上半身', back: '背中', arm: '腕', lower: '下半身', leg: '脚' };
/** 部位だけ：その部位の置いたパーツ（と、そこで使っている自分のパーツ） */
const halfDoc = half => { const list = items.filter(it => halfOf(it.part) === half); return { format: 'xs-unit-part', version: 2, half, items: list, userParts: usedUser(list) }; };
$('#bCopyAsm').onclick = () => { const h = $('#copyHalf').value; copy(JSON.stringify(h ? halfDoc(h) : unitDoc(), null, 1), `${h ? HALF_NAME[h] + 'だけ' : '機体（全身）'}の JSON をコピーしました`); };
/** 機体エディタの部品（bodyparts.js）：名前は「腰・部品・piece」「胸・…」「腕・…」「脚・…」、骨は piece の bone（無ければ半身ごとの既定）、骨が回る点 joint 付き */
/** 機体（全身）→ 機体エディタの部品（unitparts.js）。頭は骨 head、色は塗りの色 */
const editorParts = () => unitParts(unitDoc()).parts;
async function copy(text, msg) { try { await navigator.clipboard.writeText(text); note(msg); } catch { $('#paste').value = text; note('クリップボードに書けないので、読み込み欄に出しました'); } }
function note(s, warn) { const el = $('#note'); el.textContent = s; el.style.color = warn ? 'var(--warn)' : 'var(--dim)'; clearTimeout(note.t); note.t = setTimeout(() => { el.textContent = ''; }, 4000); }

// 見本：上半身の見本は上半身の部品だけ、下半身・腕・脚の見本はその部分の部品だけを入れ替える
const SAMPLE_SETS = { h: ['head', '頭', HEAD_SAMPLES], u: ['upper', '上半身', UPPER_SAMPLES], b: ['back', '背中', BACK_SAMPLES], a: ['arm', '腕', ARM_SAMPLES], l: ['lower', '下半身', SAMPLES], g: ['leg', '脚', LEG_SAMPLES] };
$('#sampleSel').innerHTML = Object.entries(SAMPLE_SETS).map(([h, [, title, set]]) => `<optgroup label="${title}">${Object.keys(set).map(k => `<option value="${h}:${k}">${k}</option>`).join('')}</optgroup>`).join('');
$('#bPipe').onclick = placeRandomPipe;
$('#bNew').onclick = () => { if (busy() || !okToLeave('新しく始めます')) return; unitName = ''; saveId = ''; savedHash = ''; items = []; paint = DEFAULT_PAINT(); showPaint(); adj = { ...ADJ0 }; showAdj(); selected = -1; rebuild(); save(); };
$('#bRandom').onclick = () => { if (busy()) return; items = tidy([...randomHeadV2(), ...randomLower(), ...adjusted(randomUpper()), ...adjusted(randomBack()), ...adjusted(randomArm()), ...randomLeg()]); selected = -1; rebuild(); save(); fitKneeGuards(); };
$('#bKneeFit').onclick = fitKneeGuards;
/** その部分だけ入れ替える */
const replaceHalf = (half, list) => { if (busy()) return; items = [...items.filter(it => halfOf(it.part) !== half), ...tidy(list)]; selected = -1; rebuild(); save(); if (half === 'leg' || half === 'lower') fitKneeGuards(); };
$('#bRandomHead').onclick = () => replaceHalf('head', randomHeadV2());
$('#bRandomUp').onclick = () => replaceHalf('upper', adjusted(randomUpper()));
$('#bRandomBack').onclick = () => replaceHalf('back', adjusted(randomBack()));
$('#bRandomPack').onclick = () => replaceHalf('back', adjusted(randomBack(Math.random, 'pack')));
$('#bRandomWing').onclick = () => replaceHalf('back', adjusted(randomBack(Math.random, 'wing')));
$('#bRandomLow').onclick = () => replaceHalf('lower', randomLower());
$('#bRandomArm').onclick = () => replaceHalf('arm', adjusted(randomArm()));
$('#bRandomLeg').onclick = () => replaceHalf('leg', randomLeg());
$('#bSample').onclick = () => {
  const [h, k] = [$('#sampleSel').value.slice(0, 1), $('#sampleSel').value.slice(2)];
  const [half, , set] = SAMPLE_SETS[h], list = structuredClone(set[k]);
  replaceHalf(half, withUpper(list[0]?.part) ? adjusted(list) : list);
};

// ---- 自分のパーツ（形を直した写し・新しく作ったパーツ）。このブラウザに残し、カタログの同じ部位に ★ 付きで並ぶ ----
// def = カタログのパーツと同じ形に { user: true, half, base } を足したもの。id は u· で始まる（頭は h·u·）
// 置き場は IndexedDB（v2-store.js の 'userparts'。前は localStorage の xsv2.userparts：艦 1 隻で 0.66 MB あり、数隻で入らなくなった）
const userParts = {};
function persistUser() { Store.set(USER_KEY, JSON.stringify(userParts)).then(ok => { if (!ok) note('自分のパーツを保存できませんでした（ブラウザの保存の容量）', true); }); }
function loadUser() { try { for (const def of Object.values(JSON.parse(Store.get(USER_KEY) ?? '{}'))) if (def?.id && Array.isArray(def.pieces)) { registerUser(def); userParts[def.id] = def; } } catch { /* storage blocked */ } }
/** パーツ src の写しを、自分のパーツとして目次に入れる（fresh：新しく作るときのひな形として） */
function makeUserCopy(src, fresh = false) {
  if (src.free) {   // 自由な部品（最初から入っている武器など）の写し：自由な部品のまま
    const def = { ...structuredClone(src), id: freeId(), name: src.name.replace(/（改）$/, '') + '（改）', user: true };
    registerUser(def);
    return def;
  }
  const half = halfOf(src.id), pre = half === 'head' ? HP : '', base = (src.user ? src.base : src.id.slice(pre.length)) ?? src.id.slice(pre.length);
  let id; for (let n = 1; ; n++) { id = `${pre}u·${base}·${n}`; if (!byId[id]) break; }
  const def = { ...structuredClone(src), id, name: fresh ? `新しい${src.cat}` : src.name.replace(/（改）$/, '') + '（改）', user: true, half, base };
  registerUser(def);
  return def;
}
/** パーツを直している間は、組み替えの操作を止める */
const busy = () => { if (!PE.active()) return false; note('パーツエディタを開いている間は、組み替えできません（「完了して機体へ戻る」か「やめる」で終わってから）', true); return true; };
const PE = initPartEdit({
  scene, camera, orbit, gizmo, canvas, byId, items: () => items, groups: () => groups, note, save: () => save(),
  rebuild: () => rebuild(), restPose: () => setPose([]), repaint: () => applyPaint(), refreshCatalog: () => renderCatalog(),
  colorOf: (pc, def) => (def?.free ? pc.color ?? '#c3c9d2' : colorOf(pc, def?.cat ?? '', paint)),
  /** パーツ def のブロックの形が変わった：置いてあるメッシュを新しい形に付け替える */
  regeo: def => {
    let redo = false, n = 0;
    for (const g of groups) for (const t of [g, ...g.userData.extra.values()]) t.traverse(o => { if (o.isMesh && o.userData.meshPart) { if (o.userData.def === def) applyTf(o, o.userData.pc); return; } if (o.isMesh && o.userData.def === def) { n++; const ng = def.free ? instGeosOf(def, o.userData.pc)[o.userData.inst] : geoOf(def, o.userData.pc); if (!ng) redo = true; else if (o.geometry !== ng) o.geometry = ng; } });
    // 自由な部品：写しの数が変わった（ミラー・繰り返し）ら、置いたパーツを作り直す
    if (def.free && !redo) { const want = def.pieces.filter(drawn).reduce((a, pc) => a + instGeosOf(def, pc).length, 0) * items.filter(it => it.part === def.id).length; if (want !== n) redo = true; }
    if (redo) rebuild();
    disposeStale();
  },
  /** 画面をパーツ用に切り替える・戻す（左右の欄と上の並びが入れ替わり、仮の形は隠す） */
  setMode: on => { document.body.classList.toggle('pe', on); document.querySelector('aside.right').scrollTop = 0; for (const m of ghostAll) m.visible = !on && $('#ghost').checked; if (!on) { updateGhostChest(); $('#bUndo').disabled = $('#bRedo').disabled = false; } },
  setFocus: f => { focus = f; },
  /** 取り込んだ形：関節と切り分けの画面を開く／ブロックの部品に変える（変えたブロックの並びを返す） */
  openJoints: pc => { if (!MESHES.has(pc.mesh)) { note('形を読み込み中です。少し待ってから、もう一度押してください', true); ensureMeshes([pc.mesh]); return; } openJoints(pc); },
  toBlocks: async pc => { if (!MESHES.has(pc.mesh)) { note('形を読み込み中です', true); return null; } const made = await meshToBlocks(pc); return made ? made.map(blockOf) : null; },
  meshInfo: pc => { const e = MESHES.get(pc.mesh); return e ? { tris: e.geo.index.count / 3, cut: !!pc.joints, tex: !!e.tex } : null; },
  undoButtons: (u, r) => { $('#bUndo').disabled = !u; $('#bRedo').disabled = !r; },
  makeUserCopy,
  swapPart: (from, to) => { for (const it of items) if (it.part === from) it.part = to; },
  placeDef: def => placeNew(def),
  saveUserPart: def => { userParts[def.id] = def; persistUser(); },
  dropTmp: () => dropTmp(),
  removeUserPart: (id, dropItems) => { if (dropItems) { items = items.filter(it => it.part !== id); selected = -1; } unregisterUser(id); delete userParts[id]; persistUser(); },
});
$('#bEditPart').onclick = () => { if (selected >= 0 && !PE.active()) { const i = selected; gizmo.detach(); PE.start(i); } };
/** 自分のパーツをカタログから消す（確かめてから）。機体に置いてあるものも外れる。保存した機体は、自分の中にそのパーツの写しを持っているので、開けばまた使える */
function dropUserPart(def) {
  if (busy()) return;
  const n = items.filter(it => it.part === def.id).length;
  if (!confirm(`自分のパーツ「${def.name}」をカタログから消します。${n ? `\n今の機体に置いてある ${n} 個も外れます。` : '\n今の機体には置いていません。'}`)) return;
  items = items.filter(it => it.part !== def.id); selected = -1; unregisterUser(def.id); delete userParts[def.id]; persistUser(); renderCatalog(); showTab(tab); rebuild(); save();
  note(`「${def.name}」をカタログから消しました`);
}
$('#bDropPart').onclick = () => {
  if (selected < 0 || PE.active()) return;
  const def = byId[items[selected].part];
  if (!def?.user) { note('カタログのパーツは消せません（消せるのは ★ の付いた自分のパーツ）', true); return; }
  dropUserPart(def);
};
/** 新しいパーツを作る：選んだ部位の最初のパーツをひな形（付く骨・置き場所）にする */
function fillNewPartSel() {
  // 最初は何も選ばれていない（選ぶまで「新しいパーツを作る」は押せない）。こちらで勝手に部位を決めない：前は最初から「頭蓋」が選ばれていた
  $('#newPartSel').innerHTML = '<option value="">作る部位を選ぶ…</option>' + [['頭', HEAD], ['上半身', UPPER], ['背中', BACK], ['腕', ARM], ['下半身', LOWER], ['脚', LEG]].map(([title, list]) =>
    `<optgroup label="${title}">${[...new Set(list.map(d => d.cat))].map(cat => `<option value="${list.find(d => d.cat === cat && !d.user).id}">${cat}</option>`).join('')}</optgroup>`).join('');
}
const newPartReady = () => { $('#bNewPart').disabled = !$('#newPartSel').value; };
$('#newPartSel').onchange = newPartReady;
$('#bNewPart').onclick = () => { if (busy()) return; const t = byId[$('#newPartSel').value]; if (!t) return; selected = -1; gizmo.detach(); $('#newPartSel').value = ''; newPartReady(); PE.startNew(t); };

// ---- 塗り：役ごとの色（パレット）とビビッド。色を変えたら、置いてあるパーツの材質だけ付け替える（形は作り直さない） ----
function applyPaint() {
  for (const g of groups) for (const t of [g, ...g.userData.extra.values()]) t.traverse(o => { if (o.isMesh && o.userData.pc) o.material = o.userData.pc.blockout && o.userData.def?.free ? draftMat : material(o.userData.pc, o.userData.def); });
}
const ROLE_KEYS = ['main', 'sub', 'frame', 'accent', 'glow'];
function showPaint() {
  $('#paintTeam').checked = !!paint.team;
  const el = $('#paintBox');
  el.innerHTML = ROLE_KEYS.map(r => `<div class="pal"><input type="color" data-role="${r}" value="${paint.pal[r]}"><span>${ROLE_LABEL[r]}</span><label title="「いい感じに塗る」でこの色を変えない"><input type="checkbox" data-lock="${r}" ${paint.lock?.[r] ? 'checked' : ''}>固定</label></div>`).join('')
    + `<div class="hint">${paint.type ? `型：${paint.type}` : '塗る前の色（パーツを作ったときの色）'}</div>`
    + `<h2>ビビッド</h2>` + (paint.vivid.colors.length
      ? paint.vivid.colors.map((c, k) => `<div class="pal"><input type="color" data-vivid="${k}" value="${c}"><span>${Object.keys(paint.vivid.on).filter(cat => paint.vivid.on[cat] === k).join('・') || '差し色だけ'}</span></div>`).join('')
        + '<div class="hint">部位名のパーツは、主装甲をその色で塗る。差し色のブロックもビビッドの色になる</div>'
      : '<div class="hint">なし（「ビビッドを差す」で、鮮やかな色を 1〜3 色、目を引く部位に入れる）</div>');
  for (const i of el.querySelectorAll('[data-role]')) i.oninput = () => { paint.pal[i.dataset.role] = i.value; paint.type = ''; applyPaint(); save(); };
  for (const i of el.querySelectorAll('[data-lock]')) i.onchange = () => { paint.lock = { ...paint.lock, [i.dataset.lock]: i.checked }; save(); };
  for (const i of el.querySelectorAll('[data-vivid]')) i.oninput = () => { paint.vivid.colors[+i.dataset.vivid] = i.value; applyPaint(); save(); };
}
const setPaint = p => { paint = p; applyPaint(); showPaint(); save(); };
/** いま機体にある部位名（ビビッドを塗る候補） */
const catsNow = () => [...new Set(items.map(it => byId[it.part]?.cat).filter(Boolean))];
const newVivid = () => randomVivid(Math.random, catsNow(), hexToHsl(paint.pal.main));
$('#bPaint').onclick = () => setPaint(randomPalette(Math.random, paint));
$('#bVivid').onclick = () => setPaint({ ...paint, vivid: newVivid() });
$('#bVividOff').onclick = () => setPaint({ ...paint, vivid: { colors: [], on: {} } });
$('#bPaintReset').onclick = () => setPaint(DEFAULT_PAINT());
// 塗りの候補：12 通りを小さな絵で並べ、押したものを機体の塗りにする（色の組をランダムに、6 割はビビッドも）
$('#bPaintGrid').onclick = () => {
  const box = $('#paintGrid'), keep = paint, sel = selected;
  box.innerHTML = '<div class="pghead"><b>塗りの候補</b><span class="hint">押すとその塗りになる（固定した色はそのまま）</span><button id="pgMore">別の 12 通り</button><button id="pgClose">閉じる</button></div><div class="pgcells"></div>';
  const cells = box.querySelector('.pgcells');
  if (sel >= 0) gizmo.detach();
  resize();
  // 小さな絵は、機体が大きく写るよう視点を少し寄せて描く（終わったら戻す）
  const camAt = camera.position.clone(); camera.position.lerp(orbit.target, 0.14); camera.updateMatrixWorld();
  const cands = [];
  for (let i = 0; i < 12; i++) {
    const base = randomPalette(Math.random, keep), cand = { ...base, vivid: Math.random() < 0.6 ? randomVivid(Math.random, catsNow(), hexToHsl(base.pal.main)) : { colors: [], on: {} } };
    cands.push(cand);
    paint = cand; applyPaint(); renderer.render(scene, camera);
    const cv = document.createElement('canvas'), W = 300, Hh = 300, src = renderer.domElement, side = Math.min(src.width, src.height);
    cv.width = W; cv.height = Hh;
    cv.getContext('2d').drawImage(src, (src.width - side) / 2, (src.height - side) / 2, side, side, 0, 0, W, Hh);
    const b = document.createElement('button'); b.appendChild(cv);
    const t = document.createElement('span'); t.textContent = cand.type + (cand.vivid.colors.length ? ` ＋ビビッド ${cand.vivid.colors.length} 色` : ''); b.appendChild(t);
    b.onclick = () => { box.hidden = true; setPaint(cand); };
    cells.appendChild(b);
  }
  paint = keep; applyPaint(); camera.position.copy(camAt);
  if (sel >= 0 && groups[sel]) gizmo.attach(groups[sel]);
  box.hidden = false;
  box.querySelector('#pgClose').onclick = () => { box.hidden = true; };
  box.querySelector('#pgMore').onclick = () => $('#bPaintGrid').onclick();
  window.__asm.cands = cands;
};

// ---- ゲーム用に書き出す・チェックだけする：xsengine.js（骨・LOD・材質を付けた .glb を作る、つながりと関節を調べる）を使う ----
// 手持ちの武器はこの画面に無いので、陣営ごとの武器の 1 式（samples/weapons-a.json・weapons-b.json：いまの強襲の銃とバズーカ）を右手に持たせる
async function editorWorker() { await XS.ready(); return XS; }
/** 機体 id（a_raid など）で書き出す → { glb (base64), report, floating（つながっていない部品）, loose（関節で外れる・めり込む）, weapons } */
async function exportGame(id) {
  const X = await editorWorker();
  const w = await (await fetch(`./samples/weapons-${id[0] === 'b' ? 'b' : 'a'}.json`)).json();
  const own = kept().some(it => byId[it.part]?.free && byId[it.part].pieces.some(pc => !pc.blockout && isHeldPart(pc)));   // 自由な機体が自分の武器を持っている
  X.load({ parts: own ? [] : w.parts, ai: '', role: id.replace(/^[ab]_/, '') });
  const applied = await X.applyUnit(structuredClone(unitDoc()), { weaponHand: w.hand_r });
  const chk = X.check(id), out = await X.exportNow(id, true);
  return { ...out, floating: chk.floating, loose: chk.loose, depths: chk.depths, weapons: applied.weapons, own };
}
const GAME_LIMIT = [30000, 5000, 800];
$('#bGame').onclick = async () => {
  if (busy()) return;
  const id = $('#gameId').value, box = $('#gameOut'), esc = t => String(t).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
  if (shipKind()) {   // 艦：骨なしの 1 つの形。大きさがゲームの当たり判定と合っているかも出す
    box.textContent = '書き出しています…（部品の多い艦は 10〜30 秒）';
    await new Promise(r => setTimeout(r, 30));
    try {
      const r = await exportShip(), p = r.report;
      const bin = atob(r.glb), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([u8], { type: 'model/gltf-binary' })); a.download = `${id}.glb`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      const near = (got, want) => (Math.abs(got - want) <= want * 0.15 ? '✓' : '✗');
      box.innerHTML = `<b>${id}.glb を書き出しました</b>（${(u8.length / 1048576).toFixed(1)} MB）<br>`
        + `長さ ${Math.round(p.len)} m ${near(p.len, p.wantLen)}（ゲームの当たり判定 ${p.wantLen} m）・幅 ${Math.round(p.width)} m ${near(p.width, p.wantWidth)}（${p.wantWidth} m）・高さ ${Math.round(p.height)} m<br>`
        + `三角形 ${p.tris.toLocaleString()}、描画 ${p.calls} 回（${esc(p.materials.join(', '))}）<br>`
        + (p.bridge ? '艦長の視点：艦橋の上 ✓<br>' : '<span style="color:var(--warn)">「艦橋」という名前のブロックが無いので、艦長の視点は船体の上になります</span><br>')
        + `<div style="white-space:pre-line${r.conn.ok ? '' : ';color:var(--warn)'}">${esc(r.conn.text)}</div>`
        + `<span class="hint">public/models/${id}.glb に置くと、ゲームがこの形を使う（無ければ今までの形）</span>`;
    } catch (e) { box.textContent = '書き出せませんでした：' + (e?.message ?? e); }
    return;
  }
  box.textContent = '書き出しています…（つながりと関節のチェックを含めて 10〜20 秒）';
  try {
    const r = await exportGame(id);
    const bin = atob(r.glb), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([u8], { type: 'model/gltf-binary' })); a.download = `${id}.glb`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    const ok = (v, lim) => (v <= lim ? '✓' : '✗');
    box.innerHTML = `<b>${id}.glb を書き出しました</b>（${(u8.length / 1048576).toFixed(1)} MB）<br>`
      + `つながり ${r.floating.length ? `✗ 離れている部品 ${r.floating.length} 組` : '✓'} ／ 関節 ${r.loose.length ? `✗ ${r.loose.length} 個の動きで外れる・めり込む` : '✓'}<br>`
      + `三角形 ${r.report.tris.map((t, i) => `${t.toLocaleString()} ${ok(t, GAME_LIMIT[i])}`).join(' / ')}（近く・中・遠く）、描画 ${r.report.calls[0]} 回 ${ok(r.report.calls[0], 5)}、骨 ${r.report.bones.length} 本<br>`
      + [...r.floating.slice(0, 4).map(f => '離れている：' + esc(f)), ...r.loose.slice(0, 4).map(esc)].map(t => `<span style="color:var(--warn)">${t}</span><br>`).join('')
      + `<span class="hint">ゲームに入れるには public/models/${id}.glb に置き、出す前のテスト 3 つ（docs/models.md）を通す。手持ちの武器は${id[0] === 'b' ? ' GIO' : '連合'}の強襲のもの</span>`;
  } catch (e) { box.textContent = '書き出せませんでした：' + (e?.message ?? e); }
};
/** チェックだけ：つながりと関節を調べて、結果をぜんぶ出す（ファイルは作らない） */
$('#bCheck').onclick = async () => {
  if (busy()) return;
  const id = $('#gameId').value, box = $('#gameOut'), esc2 = t => String(t).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
  box.textContent = '調べています…（10〜20 秒）';
  try {
    const X = await editorWorker();
    if (shipKind()) {   // 艦：つながりだけ（関節は無い）
      X.load({ parts: [], ai: '', role: shipKind() });
      await X.applyUnit(structuredClone(unitDoc()));
      const c = X.connect('部品');
      box.innerHTML = `<b>艦として調べました</b><div style="white-space:pre-line${c.ok ? '' : ';color:var(--warn)'}">${esc2(c.text)}</div>`;
      return;
    }
    const w = await (await fetch(`./samples/weapons-${id[0] === 'b' ? 'b' : 'a'}.json`)).json();
    const own = kept().some(it => byId[it.part]?.free && byId[it.part].pieces.some(pc => !pc.blockout && isHeldPart(pc)));
    X.load({ parts: own ? [] : w.parts, ai: '', role: id.replace(/^[ab]_/, '') });
    await X.applyUnit(structuredClone(unitDoc()), { weaponHand: w.hand_r });
    const r = X.report(id), line = (t, ok) => `<div style="white-space:pre-line${ok ? '' : ';color:var(--warn)'}">${esc2(t)}</div>`;
    box.innerHTML = `<b>${$('#gameId').selectedOptions[0].textContent} として調べました</b>${line(r.conn, r.connOk)}${line(r.joint, r.jointOk)}`;
    // 機体エディタの部品でできた機体（AI で作った機体・機体エディタ 1 の機体）：結果を AI に渡して直してもらえる
    const frees = kept().map(it => byId[it.part]);
    if (!r.ok && frees.length && frees.every(d => d?.free && !d.tab)) {
      const bar = document.createElement('div'); bar.className = 'bar';
      bar.innerHTML = '<button class="small" id="bAiFix" title="この結果と今の機体を、AI に直してもらう文章にしてコピーする。AI との会話に貼って送る">結果を AI に渡す用にコピー</button><button class="small" id="bAiPaste" title="AI が直して返してきた答えを貼る（見て・確かめてから、この機体と入れ替える）">AI の答えを貼る</button>';
      box.appendChild(bar);
      const text = AI.fixText(`【つながりチェック】
${r.conn}

【関節チェック】
${r.joint}`, X.doc().parts, frees[0].ai ?? '');
      $('#bAiFix').onclick = async () => { $('#bAiFix').textContent = (await AI.copy(text)) ? 'コピーしました' : 'コピーできませんでした'; };
      $('#bAiPaste').onclick = () => AI.openPaste(id.replace(/^[ab]_/, ''));
    }
  } catch (e) { box.textContent = '調べられませんでした：' + (e?.message ?? e); }
};
/** 持っている武器だけを、武器のモデルとして書き出す（w_<陣営>_<形の名前>.glb：骨なし・メートル・握る所が原点・長さは -Z。docs/model-delivery-design.md）。
 *  機体の腕の長さや置いた向きには関係なく、その武器を作ったときの形のまま出す */
async function exportWeaponGlb(def, name) {
  const X = await editorWorker();
  const { parts } = unitParts({ items: [{ part: def.id, mov: [0, 0, 0], rot: [0, 0, 0], scal: [1, 1, 1] }], adj: { ...ADJ0 }, paint: null, userParts: {} }, { shaped: true });
  X.load({ parts, ai: '', role: '' });
  return X.exportWeapon(def.hand ?? [0, 0, 0]);
}
$('#bWeaponGlb').onclick = async () => {
  if (busy()) return;
  const box = $('#gameOut'), it = kept().find(x => byId[x.part]?.tab === 'weapon'), def = it && byId[it.part];
  if (!def) { box.textContent = '武器を持っていません。左の「武器」のタブで、書き出す武器を持たせてください'; return; }
  const shape = ($('#weaponShape').value.trim() || def.shape || '').replace(/[^a-z0-9_]/gi, '').toLowerCase();
  if (!shape) { box.textContent = '形の名前（半角の英数字と _。例 heat_axe）を入れてください。ゲームの武器のデータの「held」と同じ名前'; return; }
  const file = `w_${$('#gameId').value[0] === 'b' ? 'b' : 'a'}_${shape}.glb`;
  box.textContent = '書き出しています…';
  try {
    const r = await exportWeaponGlb(def, shape), p = r.report;
    const bin = atob(r.glb), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([u8], { type: 'model/gltf-binary' })); a.download = file; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    box.innerHTML = `<b>${file} を書き出しました</b>（${(u8.length / 1024).toFixed(0)} KB）<br>握る所から先まで ${p.len.toFixed(2)} m・後ろへ ${p.behind.toFixed(2)} m、三角形 ${p.tris.toLocaleString()}、描画 ${p.calls} 回${p.muzzle ? '、弾の出る所あり' : ''}<br>`
      + `<span class="hint">public/models/${file} に置くと、ゲームがその武器の形として手に持たせる（今つながっているのはヒートアックス：heat_axe）</span>`;
  } catch (e) { box.textContent = '書き出せませんでした：' + (e?.message ?? e); }
};
/** ふつうの .glb：今の形（立った姿勢）を、骨なしで書き出す */
$('#bGlb').onclick = async () => {
  if (busy()) return;
  try {
    const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
    setPose([]); root.updateMatrixWorld(true);
    const g = new THREE.Group();
    for (const grp of groups) for (const t of [grp, ...grp.userData.extra.values()]) t.traverse(o => { if (o.isMesh && o.userData.pc && !o.userData.pc.blockout && o.material !== flashMat) { const geo = o.geometry.clone().applyMatrix4(o.matrixWorld); g.add(new THREE.Mesh(geo, o.material)); } });
    const data = await new Promise((ok, ng) => new GLTFExporter().parse(g, ok, ng, { binary: true }));
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data], { type: 'model/gltf-binary' })); a.download = `${safeName(unitName)}.glb`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    $('#gameOut').textContent = `${safeName(unitName)}.glb を書き出しました（${(data.byteLength / 1048576).toFixed(1)} MB。骨なし・立った姿勢。ゲームには「書き出す」のほうを使う）`;
    window.__asm.lastGlb = data.byteLength;
  } catch (e) { $('#gameOut').textContent = '書き出せませんでした：' + (e?.message ?? e); }
};
$('#paintTeam').onchange = e => { paint.team = e.target.checked; save(); };

// ---- 機体の保存と読み込み ----
// ・保存：名前を付けて、このブラウザに何体でも（IndexedDB。v2-store.js の 'save:<id>' に 1 体ずつ { name, at, thumb, doc }。前は localStorage の xsv2.saves に全部まとめて入れていて、5 MB ほどで入らなくなった。doc は機体の JSON：置いたパーツ・寸法の調整・塗り・使っている自分のパーツ）
// ・開く：保存した機体の一覧（絵つき）から。ファイル（.json）に保存・ファイルから開く・画面に落として開く
// ・今の機体は別に自動で残る（SAVE_KEY。閉じても続きから）。そこに名前・保存先・保存したときの形（savedHash）も入れて、保存してから変えたかどうか（●）を出す
const strHash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36) + '.' + s.length; };
const docHash = () => strHash(JSON.stringify({ items: kept(), adj, paint }));
const dirty = () => docHash() !== savedHash;
/** 保存した機体ぜんぶ { id: { name, at, thumb, doc } }（読むたびに新しい写し。壊れた 1 体は飛ばす） */
const readSaves = () => { const s = {}; for (const k of Store.keys(SAVE_PRE)) { try { s[k.slice(SAVE_PRE.length)] = JSON.parse(Store.get(k)); } catch { /* 読めない 1 体 */ } } return s; };
const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
function showUnitName() {
  const el = $('#unitName'), d = dirty();
  el.textContent = (unitName || '名前なし') + (d ? ' ●' : '');
  el.style.color = d ? 'var(--warn)' : 'var(--text)';
  el.title = `今の機体：${unitName || '名前なし'}。${!saveId ? 'まだ保存していない（「保存」で名前を付けて保存）' : d ? '保存してから変えたところがある（「保存」で上書き）' : '保存済み'}`;
}
/** 保存していない変更があるとき、開く・新しくする前に確かめる */
const okToLeave = what => !dirty() || !items.length || confirm(`今の機体${unitName ? `「${unitName}」` : ''}には、保存していない変更があります。このまま${what}か？\n（「キャンセル」で戻って、先に保存できます）`);
/** 今の機体の小さな絵（斜め前から。つまみ・仮の形は写さない） */
function unitThumb() {
  const cam = camera.position.clone(), tgt = orbit.target.clone(), gv = gizmo.visible, ghosts = ghostAll.map(m => m.visible);
  endFlash(); gizmo.visible = false; for (const m of ghostAll) m.visible = false;
  resize(); setView('threeq'); camera.position.lerp(orbit.target, 0.1); camera.updateMatrixWorld();
  renderer.render(scene, camera);
  const cv = document.createElement('canvas'), src = renderer.domElement, side = Math.min(src.width, src.height);
  cv.width = cv.height = 220;
  cv.getContext('2d').drawImage(src, (src.width - side) / 2, (src.height - side) / 2, side, side, 0, 0, 220, 220);
  camera.position.copy(cam); orbit.target.copy(tgt); orbit.update(); gizmo.visible = gv; ghostAll.forEach((m, i) => { m.visible = ghosts[i]; });
  return cv.toDataURL('image/jpeg', 0.82);
}
/** 今の機体を保存する。id を渡すとそこへ上書き、無ければ新しく */
async function saveUnit(name, id = '') {
  if (busy()) return false;
  const prevName = unitName, hash = docHash();   // （保存するのは今の形。書き終わるのを待つ間に変えた分は「保存していない変更」のまま）
  id ||= 's' + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);
  unitName = name.trim() || '名前なし';
  if (!await Store.set(SAVE_PRE + id, JSON.stringify({ name: unitName, at: new Date().toISOString(), thumb: unitThumb(), doc: unitDoc() }))) { unitName = prevName; note('保存できませんでした：このブラウザの保存の容量がいっぱいです。「開く」→「ファイルに保存」で、ファイルに残してください', true); return false; }
  saveId = id; savedHash = hash; persist(); showUnitName();
  note(`「${unitName}」を保存しました`);
  return true;
}
/** 機体の JSON（全身）を今の機体にする */
function openDoc(d, name = '', id = '') {
  const list = Array.isArray(d) ? d : d.items;
  if (!Array.isArray(list)) throw new Error('機体の JSON の形が違います');
  registerUnit(d); for (const def of Object.values(d.userParts ?? {})) if (def?.id && byId[def.id] === def) userParts[def.id] = def;
  persistUser(); renderCatalog(); showTab(tab);
  adj = { ...ADJ0, ...(d.adj ?? {}) }; showAdj();
  paint = d.paint?.pal ? { ...DEFAULT_PAINT(), ...d.paint } : DEFAULT_PAINT(); showPaint();
  items = tidy(list); selected = -1;
  unitName = name || d.name || ''; saveId = id; savedHash = '';
  rebuild(); save();
  if (id) { savedHash = docHash(); persist(); showUnitName(); }
}
const safeName = n => String(n || '機体').replace(/[\\/:*?"<>|]/g, '_');
function saveFile(doc = unitDoc(), name = `${safeName(unitName)}.xsunit.json`) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(doc, null, 1)], { type: 'application/json' })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  note(`${name} を書き出しました（ブラウザのダウンロードの場所に入ります）`);
}
/** 機体の JSON に入っている自分のパーツを、カタログに入れる */
function takeUserParts(d) { registerUnit(d); for (const def of Object.values(d.userParts ?? {})) if (def?.id && byId[def.id] === def) userParts[def.id] = def; persistUser(); renderCatalog(); showTab(tab); }
/** ファイル（機体の JSON）を開く。部位だけの JSON なら、その部位だけ入れ替える */
async function openFile(file) {
  if (busy()) return;
  if (/\.(glb|gltf)$/i.test(file.name) || /gltf/.test(file.type)) { await importGlb(file); return; }
  try {
    const d = JSON.parse(await file.text());
    if (d?.half && Array.isArray(d.items)) { takeUserParts(d); replaceHalf(d.half, d.items.filter(it => halfOf(it.part) === d.half)); note(`${HALF_NAME[d.half] ?? d.half}だけ入れ替えました`); return; }
    const e1 = Array.isArray(d) && d[0]?.kind ? d : Array.isArray(d?.parts) ? d.parts : Array.isArray(d?.scene) ? d.scene : null;   // 機体エディタ（1）の形式
    if (e1) { if (!okToLeave('ファイルを開きます')) return; openE1(e1, d.name || d.title || file.name.replace(/\.json$/i, ''), d.role); $('#saveBox').hidden = true; return; }
    if (!Array.isArray(d?.items)) throw new Error('機体のファイルではありません');
    if (!okToLeave('ファイルを開きます')) return;
    openDoc(d, d.name || file.name.replace(/(\.xsunit)?\.json$/i, ''));
    $('#saveBox').hidden = true;
    note(`「${unitName || '名前なし'}」をファイルから開きました（このブラウザにはまだ保存していません。「保存」で残せます）`);
  } catch (e) { note('開けません：' + e.message, true); }
}
function renderSaves() {
  const s = readSaves(), ids = Object.keys(s).sort((a, b) => (s[b].at ?? '').localeCompare(s[a].at ?? '')), box = $('#saveBox .box');
  const day = t => { const d = new Date(t); return Number.isNaN(+d) ? '' : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
  box.innerHTML = `<div class="top"><b>機体の保存と読み込み</b><button id="svClose">閉じる（Esc）</button></div>
    <h2>今の機体${unitName ? `：${esc(unitName)}` : ''}${dirty() ? '<span class="hint">　● 保存していない変更がある</span>' : ''}</h2>
    <div class="now"><input type="text" id="svName" placeholder="機体の名前" value="${esc(unitName)}">
      ${saveId && s[saveId] ? `<button id="svOver" class="acc" title="保存してある「${esc(s[saveId].name)}」を、今の機体で置き換える">上書き保存</button><button id="svNew" title="今の機体を、別の機体として新しく保存する（元の保存は残る）">別の機体として保存</button>` : '<button id="svNew" class="acc">名前を付けて保存</button>'}
      <button id="svFile" title="今の機体を .json のファイルにする（別のパソコン・ブラウザへ持っていく、手元に残す）">ファイルに保存</button>
      <button id="svOpenFile" title="ファイル（.json）から機体を開く。画面にファイルを落としても開く">ファイルから開く</button>
      <button id="svGlb" title="Blender や 3D 生成 AI で作った .glb を読み込んで、機体にする（骨に合わせて曲がるスキン。部位ごとに切り分ける）">GLB を読み込む</button>
      <button id="svRig" title="パソコンの AI（Claude Code など）に Blender で骨を付けてもらう頼み方を出す">AI に骨を付けてもらう</button></div>
    <div class="hint" style="margin-top:4px" id="svRoom">保存はこのブラウザの中に残ります（ブラウザのデータを消すと無くなる）。大事な機体は「ファイルに保存」でも残してください</div>
    <h2>保存した機体 <span class="hint">${ids.length} 体</span></h2>
    ${ids.length ? `<div class="svcells">${ids.map(id => `<div class="svcell ${id === saveId ? 'cur' : ''}" data-id="${id}"><img src="${s[id].thumb ?? ''}" alt="" title="開く"><div class="nm" title="${esc(s[id].name)}">${esc(s[id].name)}</div><div class="hint">${day(s[id].at)}${id === saveId ? '・今の機体' : ''}</div>
      <div class="bar"><button class="small acc" data-act="open">開く</button><button class="small" data-act="file" title="この機体を .json のファイルにする">ファイルへ</button><button class="small" data-act="del">消す</button></div></div>`).join('')}</div>` : '<div class="hint">まだありません。上の「名前を付けて保存」で、今の機体がここに並びます</div>'}`;
  renderE1(box);
  Store.room().then(r => { const el = $('#svRoom'); if (r?.quota && el) el.textContent += `　今このサイトで使っている量：${(r.used / 1048576).toFixed(1)} MB（このブラウザでは ${r.quota > 1073741824 ? `${(r.quota / 1073741824).toFixed(0)} GB` : `${Math.round(r.quota / 1048576)} MB`} くらいまで入る）`; });
  const nameNow = () => $('#svName').value.trim();
  const needName = () => { if (nameNow()) return true; note('機体の名前を入れてください', true); $('#svName').focus(); return false; };
  $('#svClose').onclick = () => { $('#saveBox').hidden = true; };
  $('#svNew').onclick = async () => { if (needName() && await saveUnit(nameNow())) renderSaves(); };
  if ($('#svOver')) $('#svOver').onclick = async () => { if (needName() && await saveUnit(nameNow(), saveId)) renderSaves(); };
  $('#svFile').onclick = () => { if (nameNow()) { unitName = nameNow(); persist(); showUnitName(); } saveFile(); };
  $('#svOpenFile').onclick = () => $('#unitFile').click();
  $('#svGlb').onclick = () => $('#unitFile').click();
  $('#svRig').onclick = showRigRequest;
  $('#svName').onkeydown = e => { if (e.key === 'Enter') ($('#svOver') ?? $('#svNew')).click(); };
  for (const cell of box.querySelectorAll('.svcell[data-id]')) {
    const id = cell.dataset.id, open = () => {
      if (busy()) return;
      if (id !== saveId && !okToLeave(`「${s[id].name}」を開きます`)) return;
      if (id === saveId && dirty() && !confirm(`「${s[id].name}」を、保存したときの形に戻します（保存してからの変更は消えます。↶ 戻すで取り戻せます）`)) return;
      try { openDoc(s[id].doc, s[id].name, id); $('#saveBox').hidden = true; note(`「${s[id].name}」を開きました`); } catch (e) { note('開けません：' + e.message, true); }
    };
    cell.querySelector('img').onclick = open;
    cell.querySelector('[data-act=open]').onclick = open;
    cell.querySelector('[data-act=file]').onclick = () => saveFile({ ...s[id].doc, name: s[id].name }, `${safeName(s[id].name)}.xsunit.json`);
    cell.querySelector('[data-act=del]').onclick = async () => {
      if (!confirm(`保存した機体「${s[id].name}」を消します。元に戻せません。${id === saveId ? '\n（今開いている機体そのものは画面に残りますが、保存はなくなります）' : ''}`)) return;
      if (!await Store.del(SAVE_PRE + id)) { note('消せませんでした', true); return; }
      if (id === saveId) { saveId = ''; savedHash = ''; persist(); showUnitName(); }
      renderSaves();
    };
  }
}
// （開くたびに置き場を読み直す：ほかのタブで保存した機体も並ぶ）
const openSaves = async () => { if (busy()) return; await Store.reload(); renderSaves(); $('#saveBox').hidden = false; };
$('#bOpen').onclick = openSaves;
$('#bSave').onclick = async () => { if (busy()) return; const cur = saveId && Store.get(SAVE_PRE + saveId); if (cur) await saveUnit(unitName || JSON.parse(cur).name, saveId); else { await openSaves(); $('#svName').focus(); note('名前を付けて保存してください'); } };
$('#saveBox').addEventListener('pointerdown', e => { if (e.target === $('#saveBox')) $('#saveBox').hidden = true; });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#saveBox').hidden) $('#saveBox').hidden = true; });
$('#unitFile').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (f) openFile(f); };
// 画面にファイルを落として開く
let dragN = 0;
const hasFile = e => [...(e.dataTransfer?.types ?? [])].includes('Files');
window.addEventListener('dragenter', e => { if (!hasFile(e)) return; e.preventDefault(); dragN++; document.body.classList.add('drop'); });
window.addEventListener('dragleave', e => { if (!hasFile(e)) return; if (--dragN <= 0) { dragN = 0; document.body.classList.remove('drop'); } });
window.addEventListener('dragover', e => { if (hasFile(e)) e.preventDefault(); });
window.addEventListener('drop', e => { if (!hasFile(e)) return; e.preventDefault(); dragN = 0; document.body.classList.remove('drop'); const f = e.dataTransfer.files[0]; if (f) openFile(f); });

// ---- 機体エディタ（1）で作ったもの：このブラウザに残っているものと、その形式のファイル ----
// 機体エディタ（1）は捨てる予定。そこで作った機体・頭は、Ver2 へ「自由な部品」（freeparts.js）として取り込む：
//   機体として開く     ：部品の並びを 1 つの自由な機体にして、今の機体をそれにする（パーツエディタで直せる・ゲーム用に書き出せる）
//   頭だけ取り込む     ：頭の部品だけを「頭まるごと」としてカタログの頭のタブに入れる（機体は変えない。押すと今の頭と入れ替わる）
//   頭の組み立ての頭   ：頭ジェネレーター・頭の組み立てで組んだ頭は、Ver2 の頭のパーツと同じものなので、そのまま今の機体の頭にする
const E1_CURRENT = 'xs-part-editor-current-v1', E1_SAMPLES = 'xs-part-editor-samples-v1', E1_HEADS = [['xsasm.editor.v1', '頭ジェネレーター（機体エディタ 1 の中）で組んだ頭'], ['xsasm.v1', '頭の組み立て（xsasm.html）で組んだ頭']];
const freeId = () => { for (let n = 1; ; n++) if (!byId[`u·free·${n}`]) return `u·free·${n}`; };
const keepUser = def => { registerUser(def); userParts[def.id] = def; persistUser(); renderCatalog(); showTab(tab); };
/** このブラウザに残っている、機体エディタ（1）と頭の道具のデータ */
function e1Sources() {
  const out = [], get = k => { try { return JSON.parse(localStorage.getItem(k) ?? 'null'); } catch { return null; } };
  const cur = get(E1_CURRENT);
  if (Array.isArray(cur?.parts) && cur.parts.length) out.push({ kind: 'model', name: '機体エディタ 1 の「つづき」の機体', parts: cur.parts, role: cur.role, at: cur.savedAt });
  for (const s of (Array.isArray(get(E1_SAMPLES)) ? get(E1_SAMPLES) : [])) if (Array.isArray(s?.parts) && s.parts.length) out.push({ kind: 'model', name: s.name || '名前なし', parts: s.parts, role: s.role, thumb: s.thumb, at: s.savedAt });
  for (const [k, title] of E1_HEADS) { const d = get(k), list = (d?.items ?? []).filter(it => byId[HP + it.part]); if (list.length) out.push({ kind: 'head', name: title, items: list }); }
  return out;
}
/** 自由な機体 def を、今の機体にする */
function openFree(def, name) {
  keepUser(def);
  adj = { ...ADJ0 }; showAdj(); paint = DEFAULT_PAINT(); showPaint();
  items = [{ part: def.id, mov: [0, 0, 0], rot: [0, 0, 0], scal: [1, 1, 1] }]; selected = -1;
  unitName = name || ''; saveId = ''; savedHash = '';
  rebuild(); save();
}
/** GLB（外で作った形）を読み込んで、今の機体にする。骨の無い形は、標準の体型の関節で切り分ける（あとで「関節と切り分け」で球を合わせる） */
async function importGlb(file) {
  if (busy() || !okToLeave(`「${file.name}」を取り込みます`)) return null;
  try {
    note(`「${file.name}」を読み込んでいます…（三角形を減らすので、少しかかります）`);
    const { made, inTris, outTris, usesWings, rigged } = await importModel(file);
    const pc = blockOf(made[0]);
    if (!(await meshReady(pc.mesh))) throw new Error('形を読み込めませんでした');
    if (!rigged) { ensureJoints(pc); applyJoints(pc); }
    const name = file.name.replace(/\.(glb|gltf)$/i, ''), def = freeDef(freeId(), name, [], { from: 'glb' });
    def.pieces.push(pc);
    openFree(def, name);
    $('#saveBox').hidden = true;
    const msg = `「${file.name}」を取り込みました。三角形 ${inTris.toLocaleString()} → ${outTris.toLocaleString()}。`
      + (rigged ? 'この形に付いていた骨と、その付け方をそのまま使いました。' : '標準の体型の関節で切り分けました。機体を選んで「パーツエディタで開く」→「関節と切り分け（3 面図）」で、関節の球をこの形に合わせてください。')
      + '「動かして確かめる」で曲がり方を見られます。' + (usesWings ? '背中の翼は左右の「翼」の骨に付けました（ゲームではブースト・ダッシュ・ジャンプで開く）。' : '');
    $('#gameOut').textContent = msg; note(msg);
    return def;
  } catch (e) { note('取り込めませんでした：' + (e?.message ?? e), true); return null; }
}
/** AI に骨を付けてもらう：パソコンの AI（ファイルを読み書きできて、コマンドを動かせるもの）に渡す頼み方を出す */
function showRigRequest() {
  const box = $('#saveBox .box');
  const draw = wings => {
    box.innerHTML = `<div class="top"><b>AI に骨を付けてもらう（Blender）</b><button id="rgBack">戻る</button><button id="svClose">閉じる（Esc）</button></div>
      <div class="hint" style="margin:6px 0">3D 生成 AI などで作った .glb に、パソコンの AI（Claude Code など、ファイルを読み書きできてコマンドを動かせる AI）で骨を付けてもらう。下の頼み方をコピーして、元の .glb と一緒に AI に渡す。できた「…_骨付き.glb」を、ここで読み込む</div>
      <div class="now"><label class="chk"><input type="checkbox" id="rgWings" ${wings ? 'checked' : ''}>背中に翼がある（翼の骨も付けてもらう）</label><button id="rgCopy" class="acc">頼み方をコピー</button><button id="rgImport">できた .glb を読み込む</button><span class="hint" id="rgNote"></span></div>
      <textarea id="rgText" readonly style="height:46vh;margin-top:8px"></textarea>`;
    $('#rgText').value = rigRequest(wings);
    $('#rgWings').onchange = e => draw(e.target.checked);
    $('#rgCopy').onclick = async () => { try { await navigator.clipboard.writeText($('#rgText').value); $('#rgNote').textContent = 'コピーしました'; } catch { $('#rgText').select(); $('#rgNote').textContent = 'コピーできないので、下の文を選びました（Ctrl+C で）'; } };
    $('#rgImport').onclick = () => $('#unitFile').click();
    $('#rgBack').onclick = renderSaves;
    $('#svClose').onclick = () => { $('#saveBox').hidden = true; };
  };
  draw(false);
}
// ---- 手持ちの武器：機体エディタの部品でできた「自由な部品」（def.tab = 'weapon'）。def.hand は、その武器を作ったときの右手の中心 ----
// 置いた武器（items の 1 つ）は、今の右手の中心に合わせて動かす（it.hand：最後に合わせた右手の中心。つまみで動かした分は残る）
let handSig = '', handAt = null;
/** 今の機体の右手の中心（書き出しと同じ探し方：bodyParts の anchors.hand_r）。手が無ければ null */
function handNow() {
  const body = items.filter(it => byId[it.part] && byId[it.part].tab !== 'weapon' && !isHead(it.part) && !(it.tmp && byId[it.part].tab));
  const sig = JSON.stringify([body.map(it => [it.part, it.mov, it.rot, it.scal]), adj]);
  if (sig !== handSig) { handSig = sig; try { handAt = bodyParts(body, adj).anchors.hand_r; } catch { handAt = null; } }
  return handAt;
}
function seatWeapons() {
  const ws = items.filter(it => byId[it.part]?.tab === 'weapon');
  if (!ws.length) return;
  const h = handNow();
  if (!h) return;
  for (const it of ws) {
    const d = byId[it.part];
    it.mov = it.hand ? it.mov.map((v, k) => v + h[k] - it.hand[k]) : h.map((v, k) => v - (d.hand?.[k] ?? v));   // （丸めない：書き出しが、武器を手へ動かす計算と同じ値になる）
    it.hand = h.slice();
  }
}
/** 新しい武器を箱から作る：今の右手の所に、握りと本体と銃身と銃口。パーツエディタで開く */
function newWeapon() {
  if (busy()) return;
  const h = handNow() ?? [-0.59, 1.6, 0], r = (w, hh) => [[-w / 2, -hh / 2], [w / 2, -hh / 2], [w / 2, hh / 2], [-w / 2, hh / 2]], at = (x, y, z) => [round(h[0] + x, 4), round(h[1] + y, 4), round(h[2] + z, 4)];
  const def = { ...freeDef(freeId(), '新しい武器', [
    // 腕を下ろした姿勢で、銃は下（−y）を向く（腕を前へ上げると前を向く。最初から入っている 1 式と同じ向き）。握りは手から前（+z）へ出て、本体につながる
    { name: '銃・握り', pts: r(0.04, 0.05), depth: 0.12, bevel: 0.008, pos: at(0, 0, 0.055), color: '#23262c' },
    { name: '銃・本体', pts: r(0.07, 0.34), depth: 0.09, bevel: 0.012, pos: at(0, -0.12, 0.11), color: '#6b727d' },
    { name: '銃身', kind: 'lathe', pts: [[0.016, -0.17], [0.016, 0.17]], segments: 12, pos: at(0, -0.44, 0.11), color: '#23262c' },
    { name: 'マズル', kind: 'lathe', pts: [[0.022, -0.02], [0.022, 0.02]], segments: 12, pos: at(0, -0.62, 0.11), color: '#23262c' },
  ], { tab: 'weapon', from: 'new' }), cat: WEAPON_CAT, hand: h.map(v => round(v, 4)) };
  keepUser(def); showTab('weapon');
  selected = -1; gizmo.detach();
  PE.startDef(def);
}

// ---- 艦（戦艦・強襲艦）：機体エディタの部品でできた、骨や関節の無い 1 つの形。「自由な機体」として持ち、用途（def.role）が艦の種類 ----
/** 今の機体が艦なら、その種類（'battleship' / 'assault'）。そうでなければ '' */
function shipKind() { const ds = items.filter(it => !it.tmp).map(it => byId[it.part]); return ds.length === 1 && ds[0]?.free && VEHICLES[ds[0].role] ? ds[0].role : ''; }
/** 見え方を、作っているものに合わせる：XS（今まで通り）か、艦（その大きさが入る距離と、ガイド） */
function applyKind() {
  XS_GAME_IDS ??= $('#gameId').innerHTML;
  const k = shipKind(), def = k ? byId[items.find(it => !it.tmp).part] : null, sig = k ? `${k}·${def.id}·${JSON.stringify(def.hit ?? null).length}` : 'xs';
  if (sig === kindSig) return;
  const was = shipNow; kindSig = sig; shipNow = k;
  for (const o of [...guideGroup.children]) { o.geometry?.dispose(); o.material?.dispose(); guideGroup.remove(o); }
  document.body.classList.toggle('ship', !!k);
  const v = VEHICLES[k];
  if (!v) {
    camera.near = 0.01; camera.far = 100; viewDist = 5.6; AT.set(0, 1.9, 0);
    grid.scale.setScalar(1); grid.position.y = 0;
    $('#gameId').innerHTML = XS_GAME_IDS;
    $('#gameOut').textContent = '選んだ機体として、つながりと関節（その機体に起こる動き）を調べてから .glb を作る';
  } else {
    const L = v.len / UNIT_M, W = v.width / UNIT_M, H = v.deckY / UNIT_M;
    camera.near = 0.1; camera.far = 1500; viewDist = L * 2.1; AT.set(0, 0, 0);
    grid.scale.setScalar(60); grid.position.y = -H - 2;
    // 当たり判定の船体と甲板：ゲームの見本から開いた艦は、その箱の組み合わせ（shared/shipshape.ts）。ほかは、大きさの箱 1 つ
    const edge = new THREE.LineBasicMaterial({ color: 0x5fd8ff, transparent: true, opacity: 0.7 });
    const deckMat = new THREE.MeshBasicMaterial({ color: 0x7dff9a, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false });
    for (const hb of def.hit ?? [{ min: [-W / 2, -H, -L / 2], max: [W / 2, H, L / 2], deck: true }]) {
      const size = hb.max.map((x, i) => x - hb.min[i]), mid = hb.max.map((x, i) => (x + hb.min[i]) / 2);
      const box = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(...size)), edge);
      box.position.set(...mid); guideGroup.add(box);
      if (hb.deck) { const deck = new THREE.Mesh(new THREE.PlaneGeometry(size[0], size[2]), deckMat); deck.rotation.x = -Math.PI / 2; deck.position.set(mid[0], hb.max[1], mid[2]); guideGroup.add(deck); }
    }
    const bow = new THREE.Mesh(new THREE.ConeGeometry(W * 0.12, W * 0.3, 12), new THREE.MeshBasicMaterial({ color: 0xffd24a }));
    bow.rotation.x = Math.PI / 2; bow.position.set(0, H, L / 2 + W * 0.25); guideGroup.add(bow);
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(3 / UNIT_M, 16, 12), new THREE.MeshBasicMaterial({ color: 0xff8a3b, transparent: true, opacity: 0.8, depthTest: false }));
      s.position.copy(gameToEditor(shipSeat(v, i))); s.renderOrder = 5; guideGroup.add(s);
    }
    for (const o of guideGroup.children) o.raycast = () => {};   // （ガイドは選べない）
    guideGroup.visible = $('#shipGuide').checked;
    $('#shipTitle').textContent = `${v.name}（長さ ${v.len} m・幅 ${v.width} m。${def.hit ? '当たり判定は、ゲームの見本の形' : '当たり判定は、この大きさの箱'}）`;
    $('#gameId').innerHTML = `<option value="ship_a_${k}">連合・${v.name}</option><option value="ship_b_${k}">GIO・${v.name}</option>`;
    $('#gameOut').textContent = `艦として書き出す（骨なし・メートル）。つながりを調べてから .glb を作る`;
  }
  camera.updateProjectionMatrix();
  if (!!was !== !!k || k) { orbit.target.copy(AT); setView('threeq'); }
}
$('#shipGuide').onchange = e => { guideGroup.visible = e.target.checked; };
for (const t of ['寸法の調整', '動かして確かめる', '見本', '色']) [...document.querySelectorAll('aside.right details > summary')].find(s => s.firstChild.textContent.trim() === t)?.parentElement.classList.add('xsonly');
for (const t of ['ランダム', '色']) [...document.querySelectorAll('header .grp > b')].find(b => b.textContent === t)?.parentElement.classList.add('xsonly');   // （艦の色は、ブロックごとの色。パーツエディタで変える）
$('#paintTeam').closest('label').classList.add('xsonly');
/** 艦として開く（parts：機体エディタの部品の並び。hit：ゲームの当たり判定の箱。無ければ大きさの箱 1 つ） */
function openShip(parts, name, kind, hit = null) {
  const def = openE1(parts, name, kind);
  if (Array.isArray(hit) && hit.length) { def.hit = hit; persistUser(); }
  rebuild();
  return def;
}
/** 艦の見本の部品の既定値（ship-samples.json は、これと違う所だけを持つ） */
const shipPart = o => ({ kind: 'extrude', bevel: 0.02, corner: 0, metal: 0.3, rough: 0.6, rot: [0, 0, 0], scl: [1, 1, 1], ...o });
/** 箱から作る艦：船体の箱（ガイドの大きさ）と、艦橋 */
const blankShip = kind => {
  const v = VEHICLES[kind], L = v.len / UNIT_M, W = v.width / UNIT_M, H = v.deckY / UNIT_M, r = (w, h) => [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]];
  return [shipPart({ name: '船体', color: '#c3c9d2', pts: r(W, 2 * H), depth: L, bevel: 0.3, taper: 0.7 }),
    shipPart({ name: '艦橋', color: '#6b727d', pts: r(W * 0.3, H * 0.8), depth: L * 0.12, bevel: 0.1, pos: [0, H * 1.35, -L * 0.15], taper: 0.8 })];
};
/** 艦としてゲーム用に書き出す → { glb (base64), report, conn { ok, text } } */
async function exportShip() {
  const kind = shipKind(), X = await editorWorker();
  X.load({ parts: [], ai: '', role: kind });
  await X.applyUnit(structuredClone(unitDoc()));
  const conn = X.connect('部品'), out = await X.exportShip(kind);
  return { ...out, conn };
}

// ---- AI で作る（v2-ai.js）：AI の機体は、機体エディタの部品の並びなので「自由な機体」として開く ----
// パーツ 1 つを AI に作ってもらう：部位（ひな形 = その部位の最初のパーツ）ごとの頼み方は airecipes.js。
// AI が作るのは装甲と中身だけ。関節の節・回転の中心・蝶番の軸など、動きを決めるブロックはひな形から残す（keptPieces）。
const ROLE_HEX = { main: '#c3c9d2', sub: '#6b727d', frame: '#23262c', accent: '#b8483e', glow: '#ffd257' };
const nearRole = hex => {
  const c = new THREE.Color(/^#[0-9a-f]{6}$/i.test(hex ?? '') ? hex : ROLE_HEX.main);
  let best = 'main', d = Infinity;
  for (const [k, h] of Object.entries(ROLE_HEX)) { const o = new THREE.Color(h), e = (c.r - o.r) ** 2 + (c.g - o.g) ** 2 + (c.b - o.b) ** 2; if (e < d) { d = e; best = k; } }
  return best;
};
const AI_GEOM = ['kind', 'op', 'pts', 'depth', 'bevel', 'bevelSegs', 'corner', 'cornerSegs', 'taper', 'tiltY', 'ridge', 'segments', 'side', 'top', 'planes', 'mirror', 'arrayCount', 'arrayStep'];
/** AI の答えの部品（機体エディタの部品の書き方）→ このパーツのブロック。付く骨などは、ひな形の「AI が作る所」のブロックから引き継ぐ */
function aiBlocks(list, tpl) {
  const rc = PART_RECIPES[tpl.id] ?? {}, kept = keptPieces(tpl), made = tpl.pieces.filter(pc => !kept.includes(pc));
  const ref = made[0] ?? tpl.pieces[0];
  return list.map(p => {
    const b = blockOf(p), out = { name: b.name, pos: [0, 0, 0], tf: b.tf };
    for (const k of AI_GEOM) if (b[k] !== undefined && b[k] !== null) out[k] = b[k];
    for (const k of ['bone', 'pivot', 'metal', 'rough']) if (ref?.[k] !== undefined) out[k] = structuredClone(ref[k]);
    if (rc.hinge && ref?.hinge && (b.op ?? 'add') === 'add') out.hinge = structuredClone(ref.hinge);
    const role = nearRole(p.color); out.color = ROLE_HEX[role];
    if (role === 'glow') { out.glow = true; out.metal = 0; out.rough = 0.3; }
    return out;
  });
}
/** ひな形 tpl に、AI のブロックを入れたパーツ（目次には入れない） */
const aiPartDef = (list, tpl) => ({ ...structuredClone(tpl), id: '·ai·peek', user: true, pieces: [...aiBlocks(list, tpl), ...structuredClone(keptPieces(tpl))] });
const boxOfPieces = pcs => { const b = new THREE.Box3(); for (const pc of pcs) if (drawn(pc)) b.union(blockBox(pc)); return b; };
const r3 = v => (Math.round(v * 1000) / 1000).toString();
const rangeText = b => `x ${r3(b.min.x)}〜${r3(b.max.x)}、y ${r3(b.min.y)}〜${r3(b.max.y)}、z ${r3(b.min.z)}〜${r3(b.max.z)}`;
function aiPartInfo(id) {
  const tpl = byId[id], kept = keptPieces(tpl), made = tpl.pieces.filter(pc => !kept.includes(pc));
  const box = boxOfPieces(made.length ? made : tpl.pieces);
  let pair = false; try { pair = !isHead(id) && !!placeOf(tpl).pair; } catch { /* placed by its own rule */ }
  const size = box.getSize(new THREE.Vector3());
  const text = [
    `部位: ${tpl.cat}`,
    `収める範囲（パーツの中の座標。ここから大きくはみ出さない）: ${rangeText(box)}（幅 ${r3(size.x)} × 高さ ${r3(size.y)} × 奥行き ${r3(size.z)}）`,
    pair ? '左右: このパーツは左右に 1 つずつ付きます。機体の左（+X 側）に付くものを 1 つだけ作ってください（右は自動で反転します）。+X が外側、−X が体の中心の側です。`mirror` は使わないでください。'
      : '左右: このパーツは体の真ん中に 1 つ付きます。x = 0 が体の中心です。左右対称に作ってください（片側だけ書いて `mirror: true` にしてもかまいません）。',
    recipeText(tpl.id),
    kept.length ? `エディタが自動で付けるブロック（あなたは作らないでください。これに重ねてつなぎます）:\n${kept.filter(drawn).map(pc => `- ${pc.name}（${rangeText(blockBox(pc))}）`).join('\n')}` : '',
    `今のカタログの同じ部位のパーツ「${tpl.name}」の、あなたが作る所に当たるブロック（参考。名前と範囲）:\n${made.filter(drawn).slice(0, 30).map(pc => `- ${pc.name}（${rangeText(blockBox(pc))}）`).join('\n')}`,
  ].filter(Boolean).join('\n\n');
  return { cat: tpl.cat, text, box: { lo: box.min.toArray(), hi: box.max.toArray() }, pair };
}
const AI = initAi({
  busy,
  partSlots: () => [['頭', HEAD], ['上半身', UPPER], ['背中', BACK], ['腕', ARM], ['下半身', LOWER], ['脚', LEG]].flatMap(([group, list]) =>
    [...new Set(list.map(d => d.cat))].map(cat => ({ group, cat, id: list.find(d => d.cat === cat && !d.user).id })).filter(s => canAsk(s.id))),
  partInfo: aiPartInfo,
  /** AI のブロックの形（パーツの中の座標）。ひな形から残すブロックも一緒に（暗く） */
  partView: (list, id) => {
    const def = aiPartDef(list, byId[id]), n = list.length;
    const out = def.pieces.map((pc, i) => (drawn(pc) ? { geo: geoOf(def, pc).clone().translate(...(pc.pos ?? [0, 0, 0])), color: i < n ? pc.color : '#3a3f48', metal: pc.metal, rough: pc.rough, glow: i < n && !!pc.glow } : null)).filter(Boolean);
    disposeStale();
    return out;
  },
  /** AI のブロックを確かめる：つながっているか、収める範囲に入っているか、多すぎないか */
  partCheck: (list, id) => {
    const tpl = byId[id], def = aiPartDef(list, tpl), info = aiPartInfo(id), lines = [];
    let ok = true;
    const adds = list.filter(p => (p.op ?? 'add') === 'add').length;
    lines.push(`ブロック ${list.length} 個（足す ${adds}・引く ${list.length - adds}）`);
    if (!adds) { ok = false; lines.push('✗ 足すブロックがありません。'); }
    // つながり：AI のブロックと、ひな形から残すブロックを合わせて調べる（パーツの中の座標のまま）
    XS.load({ parts: def.pieces.map(pc => { const { tf, pos, ...rest } = pc; const q = tf ? { pos: (tf.p ?? [0, 0, 0]).map((v, k) => v + (pos?.[k] ?? 0)), rot: (tf.r ?? [0, 0, 0]).map(v => v * Math.PI / 180), scl: tf.s ?? [1, 1, 1] } : { pos: pos ?? [0, 0, 0] }; return { ...rest, ...q, bone: 'torso', pivot: 'none', mirror: !!pc.mirror }; }), role: '' });
    const c = XS.connect('ブロック'); if (!c.ok) ok = false; lines.push(c.text);
    // 範囲：ひな形の同じ所の箱と比べる
    const box = new THREE.Box3();
    for (const pc of def.pieces.slice(0, list.length)) if (drawn(pc)) for (const g of instGeosOf(def, pc)) { g.computeBoundingBox(); box.union(g.boundingBox); }
    disposeStale();
    if (!box.isEmpty()) {
      const lo = info.box.lo, hi = info.box.hi, axis = ['x', 'y', 'z'], over = [];
      for (let k = 0; k < 3; k++) {
        const tol = Math.max(0.03, (hi[k] - lo[k]) * 0.25), a = box.min.getComponent(k), b = box.max.getComponent(k);
        if (a < lo[k] - tol) over.push(`${axis[k]} の小さい側へ ${r3(lo[k] - a)}`);
        if (b > hi[k] + tol) over.push(`${axis[k]} の大きい側へ ${r3(b - hi[k])}`);
      }
      const size = box.getSize(new THREE.Vector3()), want = new THREE.Vector3(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
      if (over.length) { ok = false; lines.push(`✗ 収める範囲からはみ出しています：${over.join('、')}。今の範囲は ${rangeText(box)}、収める範囲は x ${r3(lo[0])}〜${r3(hi[0])}、y ${r3(lo[1])}〜${r3(hi[1])}、z ${r3(lo[2])}〜${r3(hi[2])}。`); }
      else if (size.x < want.x * 0.4 && size.y < want.y * 0.4 && size.z < want.z * 0.4) { ok = false; lines.push(`✗ 小さすぎます：今の大きさは 幅 ${r3(size.x)} × 高さ ${r3(size.y)} × 奥行き ${r3(size.z)}、収める範囲は 幅 ${r3(want.x)} × 高さ ${r3(want.y)} × 奥行き ${r3(want.z)}。`); }
      else lines.push(`✓ 収める範囲に入っています（今の範囲：${rangeText(box)}）。`);
    }
    return { ok, text: lines.join('\n') };
  },
  /** AI のブロックを、自分のパーツ（★）としてカタログに入れる。機体は変えない */
  takePart: (list, name, id, ai) => {
    const tpl = byId[id], def = makeUserCopy(tpl, true);
    def.pieces = [...aiBlocks(list, tpl), ...structuredClone(keptPieces(tpl))];
    def.name = name || `AI の${tpl.cat}`; def.from = 'ai'; if (ai) def.ai = ai;
    userParts[def.id] = def; persistUser(); renderCatalog();
    const t = halfOf(def.id); if (TABS.some(x => x[0] === t)) showTab(t);
    note(`「${def.name}」をカタログの ${tpl.cat} に ★ で入れました。押すと機体に付きます（「直す」でパーツエディタ）`);
    return def;
  },
  take: (list, name, role, ai) => {
    if (!okToLeave('AI が作った機体にします')) return false;
    const def = openE1(structuredClone(list), name || 'AI で作った機体', role);
    if (ai) { def.ai = ai; persistUser(); }   // 使った AI の名前（機体と一緒に残す）
    return true;
  },
});
$('#bAi').onclick = () => AI.open();
// ---- みんなの機体（v2-share.js）：投稿するのは機体の JSON（Ver2 の形）。名前に使えない文字（< > " ' ` と制御文字）は抜いて送る ----
const IMPORT_SAMPLES = ['./samples/wings-import.json'];
const postText = v => typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f<>"'`]/g, '').slice(0, 120)
  : Array.isArray(v) ? v.map(postText) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, postText(x)])) : v;
const postDoc = () => { const d = postText(structuredClone(unitDoc())); delete d.name; return d; };
const SHARE = initShare({
  busy, okToLeave, kinds: ROLES, doc: postDoc, name: () => unitName, thumb: () => unitThumb(),
  role: () => { const r = $('#gameId').value.replace(/^[ab]_/, ''); return ROLES[r] ? r : ''; },
  problem: () => {
    if (shipKind()) return '艦は「みんなの機体」にはまだ投稿できません。';
    if (!kept().length) return 'パーツが無いので投稿できません。';
    const text = JSON.stringify(postDoc());
    if (text.includes('"kind":"mesh"')) return '取り込んだ形（.glb）の入った機体は投稿できません。';
    if (text.length > 300000) return `機体のデータが大きすぎます（${Math.round(text.length / 1000)} KB。300 KB まで）。作ったパーツを減らしてください。`;
    return '';
  },
  // つながりと関節（「チェックだけする」と同じ調べ方）
  check: async () => {
    const id = $('#gameId').value, X = await editorWorker();
    const w = await (await fetch(`./samples/weapons-${id[0] === 'b' ? 'b' : 'a'}.json`)).json();
    const own = kept().some(it => byId[it.part]?.free && byId[it.part].pieces.some(pc => !pc.blockout && isHeldPart(pc)));
    X.load({ parts: own ? [] : w.parts, ai: '', role: id.replace(/^[ab]_/, '') });
    await X.applyUnit(structuredClone(unitDoc()), { weaponHand: w.hand_r });
    const r = X.report(id);
    return { ok: r.ok, text: `${$('#gameId').selectedOptions[0].textContent} として調べました\n${r.conn}\n${r.joint}` };
  },
  openUnit: (doc, title) => { openDoc(doc, title); note(`「${title}」を開きました（このブラウザにはまだ保存していません。「保存」で残せます）`); },
  openScene: (parts, title, role, ai) => { const def = openE1(parts, title, role); if (ai) { def.ai = ai; persistUser(); } },
});
$('#bShare').onclick = () => { if (!busy()) SHARE.open(); };
// ---- スマホ：下のタブで、下に出す欄を選ぶ（パーツ＝左の欄、調整＝右の欄、3D だけ）。広い画面では使わない（CSS が無視する）----
function setSheet(k) { document.body.dataset.sheet = k; for (const b of document.querySelectorAll('#mnav button')) b.classList.toggle('on', b.dataset.sheet === k); }
for (const b of document.querySelectorAll('#mnav button')) b.onclick = () => setSheet(b.dataset.sheet);
setSheet('parts');
// ---- 作り方（手順）----
$('#bHow').onclick = () => { $('#howBox').hidden = false; };
$('#howClose').onclick = () => { $('#howBox').hidden = true; };
$('#howBox').addEventListener('pointerdown', e => { if (e.target === $('#howBox')) $('#howBox').hidden = true; });
addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#howBox').hidden) $('#howBox').hidden = true; });
$('#howCheck').onclick = () => { $('#howBox').hidden = true; const d = $('#bCheck').closest('details'); if (d) d.open = true; $('#bCheck').click(); $('#bCheck').scrollIntoView({ block: 'center' }); };
// ---- 新しい版の知らせ：公開のとき BUILD がコミットの番号に書き換わる（.github/workflows/xs-editor-publish.yml）。version.json と違えば、読み直しをすすめる ----
const BUILD = '568382f';
let newBuild = null;
$('#appTitle').title = `版: ${BUILD}`;
async function checkUpdate() {
  if (BUILD === 'dev' || newBuild) return;
  try {
    const j = await (await fetch(`version.json?t=${Date.now()}`, { cache: 'no-store' })).json();
    if (j?.build && j.build !== BUILD) { newBuild = j.build; $('#updBar').hidden = false; }
  } catch { /* offline or no version file */ }
}
$('#updGo').onclick = () => { save(); location.replace(`${location.pathname}?v=${encodeURIComponent(newBuild)}${location.hash}`); };
$('#updLater').onclick = () => { $('#updBar').hidden = true; };
setTimeout(checkUpdate, 3000);
setInterval(checkUpdate, 30 * 60 * 1000);
// 部位を選んであれば、その部位のパーツを作る画面として開く（AI に頼めない部位なら、画面の中で選び直す）
$('#bAiPart').onclick = () => { const id = $('#newPartSel').value; AI.openPart(id && canAsk(id) ? id : ''); };
/** 機体エディタ（1）の部品の並びを、機体として開く */
function openE1(parts, name, role = '') {
  const def = freeDef(freeId(), name || '機体エディタ 1 の機体', parts, { role, from: 'e1' });
  openFree(def, name);
  ensureMeshes(def.pieces.filter(p => p.kind === 'mesh').map(p => p.mesh));
  note(`「${def.name}」を開きました（部品 ${def.pieces.length} 個）`);
  return def;
}
/** 機体エディタ（1）の部品の並びから、頭だけをカタログの頭のタブへ入れる（機体は変えない） */
function takeHead(parts, name) {
  const h = headOf(parts, p => blockBox(blockOf(p)));
  if (!h) { note('この機体には、頭の部品がありません（名前に 頭・首・目・バイザー・アンテナ などが付く部品、または付く骨を「頭」にした部品）', true); return null; }
  const def = freeDef(freeId(), `${name}の頭`, h.parts, { tab: 'head', from: 'e1' });
  def.bottom = Math.round(h.bottom * 1e4) / 1e4;
  keepUser(def);
  note(`「${def.name}」（部品 ${def.pieces.length} 個）を、カタログの「頭」のタブに ★ で入れました。機体は変えていません（付けるには、カタログで押す）`);
  return def;
}
/** 「開く」の画面の中：機体エディタ 1 に残っているもの */
function renderE1(box) {
  const list = e1Sources();
  const sec = document.createElement('div');
  sec.innerHTML = `<h2>機体エディタ 1・頭の道具に残っているもの <span class="hint">このブラウザの中。${list.length} 件</span></h2>` + (list.length
    ? `<div class="svcells">${list.map((s, i) => `<div class="svcell" data-e1="${i}">${s.thumb ? `<img src="${s.thumb}" alt="">` : ''}<div class="nm" title="${esc(s.name)}">${esc(s.name)}</div><div class="hint">${s.kind === 'model' ? `部品 ${s.parts.length} 個` : `頭のパーツ ${s.items.length} 個`}</div>
        <div class="bar">${s.kind === 'model' ? '<button class="small acc" data-act="unit" title="この機体を、今の機体として開く">機体として開く</button><button class="small" data-act="head" title="頭の部品だけを、カタログの頭のタブに入れる（機体は変えない）">頭だけ取り込む</button>' : '<button class="small acc" data-act="asm" title="この頭を、今の機体の頭にする（今の頭と入れ替わる）">今の機体の頭にする</button>'}</div></div>`).join('')}</div>`
    : '<div class="hint">見つかりません（機体エディタ 1 を、このブラウザ・同じアドレスで使ったときのデータが出ます）。ファイルに書き出してあるものは、上の「ファイルから開く」で開けます</div>');
  box.appendChild(sec);
  // 見本の機体（機体エディタ 1 に入っていた見本。samples/xs-samples.json）
  const sm = document.createElement('div');
  sm.innerHTML = '<h2>見本の機体 <span class="hint">機体エディタ 1 に入っていた見本</span></h2><div class="svcells" id="svSamples"><span class="hint">読み込み中…</span></div>';
  box.appendChild(sm);
  fetch('./samples/xs-samples.json').then(r => r.json()).then(d => {
    const el = sm.querySelector('#svSamples'); if (!el.isConnected) return;
    el.innerHTML = d.samples.map((s, i) => `<div class="svcell" data-sm="${i}"><div class="nm">${esc(s.name)}</div><div class="hint">部品 ${s.parts.length} 個</div><div class="bar"><button class="small acc" data-act="unit">機体として開く</button><button class="small" data-act="head">頭だけ取り込む</button></div></div>`).join('');
    for (const cell of el.querySelectorAll('[data-sm]')) {
      const s = d.samples[+cell.dataset.sm];
      cell.querySelector('[data-act=unit]').onclick = () => { if (busy() || !okToLeave(`「${s.name}」を開きます`)) return; openE1(structuredClone(s.parts), s.name, s.role); $('#saveBox').hidden = true; };
      cell.querySelector('[data-act=head]').onclick = () => { if (busy()) return; if (takeHead(structuredClone(s.parts), s.name)) { $('#saveBox').hidden = true; showTab('head'); } };
    }
  }).catch(() => { const el = sm.querySelector('#svSamples'); if (el) el.innerHTML = '<span class="hint">見本を読めませんでした</span>'; });
  // 艦：ゲームの今の艦（見本）から始めるか、箱から作る
  const sh = document.createElement('div');
  sh.innerHTML = '<h2>艦（戦艦・強襲艦） <span class="hint">ゲームの艦の形を作る。骨や関節の無い 1 つの形で、艦として書き出す</span></h2><div class="svcells" id="svShips"><span class="hint">読み込み中…</span></div>';
  box.appendChild(sh);
  Promise.all([fetch('./ship-samples.json').then(r => r.json()).then(d => d.samples.map(s => ({ ...s, parts: s.parts.map(shipPart) }))), fetch('./samples/ship-assault.json').then(r => r.json()).then(d => d.samples)]).then(([a, b]) => {
    const el = sh.querySelector('#svShips'); if (!el.isConnected) return;
    const list = [...a, ...b, ...Object.entries(VEHICLES).map(([k, v]) => ({ name: `${v.name}を箱から作る`, role: k, blank: true }))];
    el.innerHTML = list.map((s, i) => `<div class="svcell" data-sh="${i}"><div class="nm">${esc(s.name)}</div><div class="hint">${s.blank ? `長さ ${VEHICLES[s.role].len} m・幅 ${VEHICLES[s.role].width} m の箱と艦橋` : `${VEHICLES[s.role].name}・部品 ${s.parts.length} 個`}</div><div class="bar"><button class="small acc">${s.blank ? '箱から作る' : '艦として開く'}</button></div></div>`).join('');
    for (const cell of el.querySelectorAll('[data-sh]')) {
      const s = list[+cell.dataset.sh];
      cell.querySelector('button').onclick = () => { if (busy() || !okToLeave(`「${s.name}」を開きます`)) return; $('#saveBox').hidden = true; openShip(s.blank ? blankShip(s.role) : structuredClone(s.parts), s.blank ? `新しい${VEHICLES[s.role].name}` : s.name, s.role, s.hit); };
    }
  }).catch(() => { const el = sh.querySelector('#svShips'); if (el) el.innerHTML = '<span class="hint">艦の見本を読めませんでした</span>'; });
  // 取り込みの見本：外で作った形（.glb）を取り込んで関節で切り分けた機体（形はパックで配る：samples/*.xsmesh）
  const im = document.createElement('div');
  im.innerHTML = '<h2>取り込みの見本 <span class="hint">3D 生成 AI などで作った形を取り込んで、関節で切り分けた機体（骨に合わせて曲がるスキン）</span></h2><div class="svcells" id="svImports"><span class="hint">読み込み中…</span></div>';
  box.appendChild(im);
  Promise.all(IMPORT_SAMPLES.map(url => fetch(url).then(r => r.json()).then(d => ({ ...d, url })))).then(list => {
    const el = im.querySelector('#svImports'); if (!el.isConnected) return;
    el.innerHTML = list.map((s, i) => `<div class="svcell" data-im="${i}"><div class="nm">${esc(s.name)}</div><div class="hint">取り込んだ形 1 個（初めて開くときに形を読み込む：約 2.4 MB）</div><div class="bar"><button class="small acc">機体として開く</button></div></div>`).join('');
    for (const cell of el.querySelectorAll('[data-im]')) {
      const s = list[+cell.dataset.im], b = cell.querySelector('button');
      b.onclick = async () => {
        if (busy() || !okToLeave(`「${s.name}」を開きます`)) return;
        b.disabled = true; b.textContent = '形を読み込んでいます…';
        try {
          await installPack(new URL(s.mesh, new URL(s.url, location.href)).href, s.meshId);
          openE1([{ ...DEFAULTS, ...structuredClone(s.part), mesh: s.meshId }], s.name, s.role);
          $('#saveBox').hidden = true;
        } catch (e) { b.disabled = false; b.textContent = '機体として開く'; note('開けません：' + (e?.message ?? e), true); }
      };
    }
  }).catch(() => { const el = im.querySelector('#svImports'); if (el) el.innerHTML = '<span class="hint">取り込みの見本を読めませんでした</span>'; });
  for (const cell of sec.querySelectorAll('[data-e1]')) {
    const s = list[+cell.dataset.e1], on = (act, fn) => { const b = cell.querySelector(`[data-act=${act}]`); if (b) b.onclick = fn; };
    on('unit', () => { if (busy() || !okToLeave(`「${s.name}」を開きます`)) return; try { openE1(structuredClone(s.parts), s.name, s.role); $('#saveBox').hidden = true; } catch (e) { note('開けません：' + e.message, true); } });
    on('head', () => { if (busy()) return; try { if (takeHead(structuredClone(s.parts), s.name)) { $('#saveBox').hidden = true; showTab('head'); } } catch (e) { note('取り込めません：' + e.message, true); } });
    on('asm', () => { if (busy()) return; replaceHalf('head', s.items.map(it => asHead(structuredClone(it)))); $('#saveBox').hidden = true; note(`${s.name}を、今の機体の頭にしました（↶ 戻すで戻せます）`); });
  }
}

// ---- 起動 ----
// 最初から入っている武器（陣営ごとの強襲の 1 式）。保存した機体が持っていることがあるので、機体を読む前に目次へ入れる
for (const [f, id, name] of [['a', 'w·a', '連合の強襲の 1 式（ライフルとバズーカ）'], ['b', 'w·b', 'GIO の強襲の 1 式（ライフルとバズーカ）']]) {
  try {
    const w = await (await fetch(`./samples/weapons-${f}.json`)).json();
    registerUser({ ...freeDef(id, name, w.parts, { tab: 'weapon', from: 'sample' }), cat: WEAPON_CAT, user: false, hand: w.hand_r });
  } catch (e) { console.warn('weapons', f, e); }
}
// 自分のモデルとして書き出す武器（ゲームが手に持たせる 1 つの形。samples/w_<陣営>_<形の名前>.json）。def.shape が、ゲームでの形の名前
for (const file of ['w_a_machine_gun', 'w_b_machine_gun', 'w_a_beam_rifle', 'w_b_beam_rifle', 'w_b_heat_axe']) {
  try {
    const w = await (await fetch(`./samples/${file}.json`)).json();
    registerUser({ ...freeDef(`w·${file.slice(2)}`, w.name, w.parts, { tab: 'weapon', from: 'sample' }), cat: WEAPON_CAT, user: false, hand: w.hand_r, shape: w.shape, faction: w.faction });
  } catch (e) { console.warn('weapon', file, e); }
}
// 置き場（IndexedDB）を開く。前の置き場（localStorage）に残っていた機体・パーツは、ここで移る
const stored = await Store.open();
loadUser();
fillNewPartSel(); newPartReady();
renderCatalog();
showTab(tab);
if (!load()) items = tidy(structuredClone(Object.values(SAMPLES)[0]));
// （全身が 1 つの形の機体＝艦・機体エディタ 1 の機体・AI の機体には足さない。足すと、開き直すたびに艦の中へ XS の体が入り、艦でなくなっていた）
if (!items.some(it => byId[it.part]?.free && !byId[it.part].tab)) {
  if (!items.some(it => halfOf(it.part) === 'head')) items.push(...tidy(structuredClone(Object.values(HEAD_SAMPLES)[0])));   // 頭が無ければ見本の頭を足す
  if (!items.some(it => halfOf(it.part) === 'upper')) items.push(...tidy(adjusted(structuredClone(Object.values(UPPER_SAMPLES)[0]))));   // 上半身が無ければ標準の上半身を足す
  if (!items.some(it => halfOf(it.part) === 'arm')) items.push(...tidy(adjusted(structuredClone(Object.values(ARM_SAMPLES)[0]))));   // 腕・脚も同じ
  if (!items.some(it => halfOf(it.part) === 'leg')) items.push(...tidy(structuredClone(Object.values(LEG_SAMPLES)[0])));
}
showAdj();
showPaint();
setView('threeq');
rebuild();
save();
showUnitName();
requestAnimationFrame(tick);
// 確かめるための出口（画面の外から、置いた部品と視点を見る）
window.__asm = { exportWeaponGlb, ship: { kind: () => shipKind(), open: openShip, exportShip, guides: () => guideGroup.children.length, shipPart }, saves: { store: Store, stored, readSaves, saveUnit, openFile, dirty, name: () => unitName, id: () => saveId, openE1, takeHead, e1Sources, importGlb }, MESHES, renderer, scene, camera, orbit, root, items: () => items, groups: () => groups, paint: () => paint, editorParts, exportGame, unitDoc: () => unitDoc(), pe: PE, gizmo, select, userParts, byId };
