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
import { f1HeadSample } from './parts/index.js';
import { HP, HEAD, FREE, isHead, rawHead, asHead, halfOf, registerUser, unregisterUser, headShell as headShellIn, headPlace as headPlaceIn, unitParts, registerUnit, DECO, DECO_CAT, refreshDecos } from './unitparts.js';
import { XS, VEHICLES, UNIT_M, ROLES, DEFAULTS, shipSeat, gameToEditor } from './xsengine.js';
import { initAi } from './v2-ai.js';
import { initShare } from './v2-share.js';
import { PART_RECIPES, keptPieces, recipeText, canAsk } from './airecipes.js';
import { initPartEdit } from './v2-partedit.js';
import { makeWeaponBench } from './v2-weapon.js';
import { FORM_DELAY_MAX, FORM_MAX, FORM_MS, bakeForm, dropFormIn, formDelayOf, formSpanOf, hasPurge, purgedDoc, FORM_WHEN, formWhenOf, FORM_KIND, formKindOf, setFormKind, isFlyKind, flyTilt, formOf, formsUsed, itemFlame, itemFormDelta, itemFormsUsed, keepBase, mirrorForms, setForm, showForms } from './v2-forms.js';
import { geoOf, isSub, disposeStale, instGeosOf, drawn, boxOf as blockBox, tfMatrix } from './partgeo.js';
import { freeDef, blockOf, headOf, groupOfPart, isTrackedSet, holderKey, isHeldPart, isGlowPart, sidedName, freeJoints, atRest, markTurret } from './freeparts.js';
import { MESHES, ensureMeshes, importModel, applyJoints, ensureJoints, meshToBlocks, openJoints, meshReady, setMeshHost, IMPORT_BONES, rigRequest, installPack, GW_PREFIX } from './meshparts.js';
import { DEFAULT_PAINT, ROLE_LABEL, GLOW_ROLES, colorOf, opacityOf, opacityAt, roleAlphaAt, setFormAlpha, paintFormsUsed, loadPaint, randomPalette, randomVivid, hexToHsl } from './paint.js';
import { buildHull, hullReach } from './hull.js';
import { makeSheet } from './xsbody.js';
import { hull2, pushAngle, bandedOutlines } from './skirtpush.js';
import { fitTiltBoth, tilted, TILT_GRID } from './kneetilt.js';
import { autoFix } from './v2-autofix.js';
import { P, XH, XL, YH, YL, ZH, ZL, box } from './xsasm-lib.js';
import { JET_R, JET, FX_KINDS, FX_WHEN, FX_N, FX_S, fxOf } from './parts/back/jetshield.js';
import { JOINT_KIND, JOINT_RANGE, isSlide, jointsOn, putJoints, jointById, jointRoot, jointKids, jointParent, jointAncestors, jointCycle, jointOrder, jointDelayOf, makeJoint, clampJoint, jointValue, setJointType, jointMotion, kidForm, dropJoint } from './v2-joints.js';
import { byId, register, boneOf as boneOf0, SIDED, sideOf, hasLink as hasLinkIn, bodyParts, fitItem, jointsOf, kneeAxesOf, SEG, ADJ0 } from './bodyparts.js';

const $ = s => document.querySelector(s);
const D = Math.PI / 180;
// 保存先（このブラウザの中）。?save=名前 を付けて開くと、別の保存先になる（ふだんの組み立てを触らずに試すため）
// ?skin=<みんなの機体の id>：ゲームのページの見えない窓の中で開かれ、その機体を書き出してゲームへ渡すだけ（下の「ゲームのスキンにする」）。
// ふだんの「つづきから」と自分のパーツには触らない
const SKIN_MODEL = new URLSearchParams(location.search).get('skin');
const SAVE_KEY = 'xsv2.' + (new URLSearchParams(location.search).get('save') ?? (SKIN_MODEL ? 'skin' : 'v1'));
const S = makeSheet();

// 部品の目次（byId）・どの部分か（halfOf：upper・back・lower・arm・leg）・動力パイプの登録（register）は bodyparts.js（機体エディタと共通）
// 頭のパーツ：頭の組み立てのカタログを、id に「h·」を付けて同じ目次に入れる（上半身の襟と id が重なるものがある）
const boneOf = def => (isHead(def.id) ? 'head' : def.free ? 'hips' : boneOf0(def));
/** 頭の見本：どれも依頼主が自分で組んだ置き方（顔はこちらで推し量って作らない）。
 *  1 番目は機体エディタ Ver2 で組んだ頭（2026-10-02 に貼ってもらった機体の JSON から）。最初に出る頭もこれ。2 番目は DoGA で組んだ頭。
 *  3 番目は連合の強襲の頭（機体エディタ 1 の形式の頭を部品に分けたもの：parts/peakhelm.js。置き方は元の頭のまま。tools/headgen/e1head.mjs が出す） */
const TALL_HEAVY = [
  { part: 'heavyhelmplain', mov: [0, 0, -0.125], rot: [0, 0, 0], scal: [3, 4.338, 3] }, { part: 'monoeyelens', mov: [0, 0.0573, 0.1279], rot: [0, 0, 0], scal: [2.919, 2.631, 1.509] },
  { part: 'china', mov: [-0.0063, -0.2349, 0.0919], rot: [24, 0, 0], scal: [5.766, 4.764, 4.329] }, { part: 'neckarmor', mov: [0, -0.4311, -0.1772], rot: [0, 0, 0], scal: [2.289, 2.994, 2.289] }];
const HEAD_SAMPLES = { 'バイザーとマスクと耳ブロック': [
  { part: 'headshell', mov: [0, 0, 0.0246], rot: [0, 0, 0], scal: [3.1, 2.999, 2.327] }, { part: 'maska', mov: [0, -0.0698, -0.0898], rot: [0, 0, 0], scal: [3.1, 3.2, 2.2] },
  { part: 'earblock', mov: [-0.2404, 0.0493, 0.0735], rot: [6.5, 14.4, 0], scal: [-1.477, 2.2, 2.2] }, { part: 'earblock', mov: [0.2404, 0.0493, 0.0735], rot: [6.5, -14.4, 0], scal: [1.477, 2.2, 2.2] },
  { part: 'facemask', mov: [0, 0.1525, 0.2419], rot: [-0.4, 0, 0], scal: [1, 1, 1] }, { part: 'neck', mov: [0, -0.4502, -0.05], rot: [0, 0, 0], scal: [1.69, 1.69, 1.69] },
  { part: 'headbandthin', mov: [0, 0.018, 0.0152], rot: [0, 0, 0], scal: [3.1, 3.805, 2.581] }].map(asHead),
  'ひれとクレスト': [
  { part: 'headshell', mov: [0, 0, -0.125], rot: [0, 0, 0], scal: [3.1, 3.2, 2.2] }, { part: 'facemask', mov: [0, 0, 0], rot: [0, 0, 0], scal: [1, 1, 1] },
  { part: 'jawblock', mov: [0, -0.175, -0.175], rot: [10, -180, 0], scal: [2.2, 1.2, 1.3] }, { part: 'fin', mov: [0.3, 0.175, 0], rot: [-20, 10, -110], scal: [1, 1, 1] },
  { part: 'fin', mov: [-0.3, 0.175, 0], rot: [-20, -10, 110], scal: [-1, 1, 1] }, { part: 'crest', mov: [0, 0.3, 0.025], rot: [20, 0, 0], scal: [1, 1, 0.6] }].map(asHead),
  '強襲の頭（ひさしとトサカ）': [
  { part: 'peakhelm', mov: [0, 0, -0.125], rot: [0, 0, 0], scal: [3, 3.1, 2.2] }, { part: 'peakcheek', mov: [0.1035, -0.0722, 0.0079], rot: [0, 0, 0], scal: [3, 3.1, 2.2] },
  { part: 'peakcheek', mov: [-0.1035, -0.0722, 0.0079], rot: [0, 0, 0], scal: [-3, 3.1, 2.2] }, { part: 'earsensor', mov: [0.2871, 0.0273, -0.1371], rot: [0, 0, 0], scal: [3, 3.1, 2.2] },
  { part: 'earsensor', mov: [-0.2871, 0.0273, -0.1371], rot: [0, 0, 0], scal: [-3, 3.1, 2.2] }, { part: 'crestblade', mov: [0, 0.5276, -0.147], rot: [0, 0, 0], scal: [3, 3.1, 2.2] },
  { part: 'browplate', mov: [0, 0.2331, 0.1812], rot: [0, 0, 0], scal: [3, 3.1, 2.2] }, { part: 'neckblocks', mov: [0, -0.4579, -0.0539], rot: [0, 0, 0], scal: [3, 3.1, 2.2] }].map(asHead),
  // F1 型：取り込んだ機体の頭の組み方そのまま（parts/f1.js の sample。tools/partimport.mjs が書く）
  'F1 型': f1HeadSample.map(asHead),
  // 重装の頭を縦に伸ばした頭（2026-10-05 に貼ってもらった頭の部品の並びから。置き方は元のまま：殻の幅を 3 として戻した）。モノアイあり・なし
  '重装の頭（高いドームとモノアイ）': TALL_HEAVY.map(asHead),
  '重装の頭（高いドーム・モノアイなし）': TALL_HEAVY.filter(it => it.part !== 'monoeyelens').map(asHead) };
const randomHeadV2 = () => randomHead(Math.random, HEAD_RAW).map(asHead);
/** いくつでも付けられる部位（カタログを押すと増える）。ほかの部位は 1 つだけ（押すと、置いてある同じ部位のパーツと入れ替わる）。
 *  左右の対は、左右で 1 組。オーブ・挿せるタンクは収納口の数まで増える */
const MULTI = new Set(['噴射口', 'ベルト', '腰の筒', '動力パイプ', '胸の飾り', '胴の動力パイプ', '肩の動力パイプ', 'バックパックの装備', '翼の装備', 'エフェクト（光）', '前腕の飾り', '顔', '飾り', 'トサカ', 'アンテナ（額）', 'アンテナの中央（額）', '首当て', '胸の増加装甲', '肩の増加装甲', '前腕の増加装甲', 'すねの増加装甲']);   // （首当ては首に足して付ける。首と同じ部位にしていたら、首当てを選ぶと首が外れた）
const isMulti = def => MULTI.has(def.cat);
const TRACK_CAT = 'キャタピラ';
// 「1 つだけの部位も足す」（issue #185、テスター 静流りおさん 2026-11-05「いくつも付けたい」）：入れると、1 つだけの部位も入れ替えずに足して置く（同じ所に置いたものは 4 cm ずつ下へずれる）。
// 足したものは、移動のつまみか「付ける骨」で好きな所へ。入り切りはこの画面を開いた人のブラウザだけで覚える
const ADD_MORE_KEY = 'xsv2.addMore';
const addMore = () => !!document.querySelector('#addMore')?.checked;
let addMoreLabel = () => {};
/** 1 つだけの部位：置いてある同じ部位（同じ部分の、同じ部位名）のパーツを外す */
function dropSameCat(def) {
  const half = halfOf(def.id), n = items.length;
  items = items.filter(it => !(halfOf(it.part) === half && byId[it.part]?.cat === def.cat));
  if (items.length !== n) selected = -1;
}
// 塗り（paint.js）：機体が持つ色の組とビビッド
let paint = DEFAULT_PAINT();
const placeOf = def => (def.free ? { mov: [0, 0, 0], pair: false } : { head: () => ({ mov: [0, 0, 0], pair: false }), weapon: () => ({ mov: [0, 0, 0], pair: false }), upper: placementOfUpper, back: d => placementOfBack(d, items), arm: placementOfArm, leg: placementOfLeg, lower: placementOf }[halfOf(def.id)](def));
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
const hemi = scene.children.find(o => o.isHemisphereLight);
// 「影を消す」の時だけ点ける、主の光の反対側と下からの光（issue 1204：反対側が暗くて作りづらい。エディタの見た目だけで、ゲームの中の見え方は変えない）
const back = new THREE.DirectionalLight(0xffffff, 0); back.position.set(-1.2, 1.4, -1.6); scene.add(back);
const under = new THREE.DirectionalLight(0xffffff, 0); under.position.set(0.4, -2, 0.6); scene.add(under);
const grid = new THREE.GridHelper(2, 20, 0x2c3038, 0x22252b); scene.add(grid);
const guideGroup = new THREE.Group(); scene.add(guideGroup);   // 艦のガイド（ゲームで決まっている大きさと場所。書き出さない）
const root = new THREE.Group();
// （空を飛ぶ形を「ゲームの向きで見る」時だけ、描く間だけ前へ倒す組：issue 1036、v2-forms.js flyTilt。描き終えたら元に戻すので、ほかの計算はいつも立った形）
const flyGroup = new THREE.Group(); scene.add(flyGroup); flyGroup.add(root);
const gizmo = new TransformControls(camera, canvas);
gizmo.setSize(0.8);
// 「武器を作る」の欄（v2-weapon.js）：持っている武器の点（握り・銃口・刃の根元・刃の先）・元の武器の点線の箱・武器だけを見る
const bench = makeWeaponBench({
  get gizmo() { return gizmo; }, get orbit() { return orbit; }, get camera() { return camera; }, byId,
  items: () => items, groups: () => groups, form: () => formNow,
  own: i => { const it = items[i]; if (!it) return null; const d = byId[it.part]; if (d?.user) return d; const c = makeUserCopy(d); keepUser(c); it.part = c.id; return c; },
  persist: () => persistUser(), save: () => save(), rebuild: () => rebuild(), note: (t, w) => note(t, w),
  side: () => ($('#gameId').value[0] === 'b' ? 'b' : 'a'),
});
gizmo.addEventListener('dragging-changed', e => { orbit.enabled = !e.value; if (!PE.active() && gizmo.object?.userData.wpt) { if (!e.value) bench?.onDragEnd(); return; } if (PE.active()) { if (!e.value) PE.onDragEnd(); return; } if (e.value) { if (gizmo.object === pivot) pivotStart(); return; } save(); rebuild(); });
gizmo.addEventListener('objectChange', () => { if (PE.active()) { PE.onGizmoChange(); return; } if (bench?.onGizmo()) return; if (gizmo.object === pivot) { pivotMove(); return; } if (selected >= 0) { readBackFromGroup(items[selected], gizmo.object); applyToGroup(items[selected], groups[selected]); fillFields(); } });
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
  leg_l: legJ.l.inner, leg_r: legJ.r.inner, knee_l: kneeJ.l.inner, knee_r: kneeJ.r.inner, shin_l: shinJ.l.inner, shin_r: shinJ.r.inner,
  shield: foreJ.l.inner };   // 付ける骨「盾」の部品：左の前腕と一緒に動く（ゲームでは、その XS の盾として左手に持つ。盾の欄）
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
// 光る部品（glow）は自分の色で光り、透ける部品（opacity）は奥が見える（光の翼・オーラ・リボン・虫の羽）。塗りの役の透明度（paint.alpha、issue #746）も同じ
const material = (pc, def) => {
  // 自由な部品（機体エディタの形式）は、塗りではなく自分の色・質感。光るかどうかは名前からも決まる
  const free = !!(def?.free || def?.deco), glow = free ? !!isGlowPart(pc) : !!pc.glow;   // （武器の飾りも、武器の色・質感のまま）
  const c = free && !pc.role ? pc.color ?? '#c3c9d2' : colorOf(pc, def?.cat ?? '', paint), op = free && !pc.role ? pc.opacity ?? null : opacityOf(pc, paint), k = `${c}|${glow ? 1 : 0}|${op ?? 1}|${free ? `${pc.metal}/${pc.rough}` : ''}`;
  if (!MATS.has(k)) MATS.set(k, new THREE.MeshStandardMaterial({ color: c, metalness: free ? pc.metal ?? 0.55 : glow ? 0 : 0.45, roughness: free ? pc.rough ?? 0.38 : 0.5, side: THREE.DoubleSide,
    ...(glow ? { emissive: c, emissiveIntensity: 0.85 } : {}), ...(op != null ? { transparent: true, opacity: op, depthWrite: false } : {}) }));
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
  loaded: id => { for (const def of FREE) for (const pc of def.pieces) if (pc.mesh === id && pc.joints) applyJoints(pc); meshDirty = true; redrawThumbs(id); },
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
  // 自由な部品が形を持つ骨だけ、その決め方の位置へ動かす。持たない骨（上半身と太ももだけの部品に、カタログのすね・足を付けた時のすね・足首など）は、
  // freeJoints の推測（すねの部品が無ければ太ももの 1/4 下、足が無ければ部品全体の下の端）ではなく、標準の骨格の位置のまま。
  // 推測の足首はひざより上に来ていて、ひざを曲げると足がすねから離れた（issue #90）
  const has = new Set(pieces.map(p => p.bone)), carried = n => has.has(n) || rigs.some(r => Array.isArray(r.rig?.[n]));
  moveJoint(torsoJ, carried('torso') ? P('torso') : [0, S.belly.y, 0]); moveJoint(headJ, carried('head') ? P('head') : [0, S.neck.y, 0]);
  for (const [s, sg] of [['l', 1], ['r', -1]]) {
    if (carried('arm_' + s)) moveJoint(armJ[s], P('arm_' + s));
    if (carried('forearm_' + s)) { moveJoint(foreJ[s], P('forearm_' + s)); moveJoint(elbowJ[s], P('forearm_' + s)); }
    moveJoint(legJ[s], carried('leg_' + s) ? P('leg_' + s) : [sg * S.hip.x, S.hip.y, 0]);
    if (carried('shin_' + s)) { moveJoint(shinJ[s], P('shin_' + s)); moveJoint(kneeJ[s], P('shin_' + s)); }
    if (carried('foot_' + s)) moveJoint(footJ[s], P('foot_' + s));
  }
}
/** 自由な部品（機体エディタの形式）の Group：形 1 個ずつ（ミラー・繰り返しの写しごと）を、付く骨の入れ物（userData.extra）へ分ける。腰に付くものは g そのもの */
const draftMat = new THREE.MeshStandardMaterial({ color: 0x5fa8ff, transparent: true, opacity: 0.28, depthWrite: false, roughness: 0.9, metalness: 0 });
function freeGroup(item, index, def) {
  const g = new THREE.Group();
  g.userData.index = index; g.userData.hinges = []; g.userData.extra = new Map();
  markTurret(def);   // （大砲のブロックは付け根から先がまるごと砲：freeparts.js markTurret）
  const tracked = isTrackedSet(def.pieces);
  const put = (key, m) => {
    if (key === 'hips' || item.bone === 'shield') { g.add(m); return; }   // （盾にした部品は、ブロックの骨によらず全部が盾の入れ物へ）
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
    // 形態（v2-forms.js）のあるブロックは、ミラー・繰り返しの写しを 1 つずつのメッシュに（ミラーの写しは逆へ動く）
    (pc.forms ? instGeosOf(def, pc) : [geoOf(def, pc)]).forEach((geo, k) => {
    const m = new THREE.Mesh(geo, material(pc, def));
    m.userData.index = index; m.userData.noHit = !!pc.noHit; m.userData.pc = pc; m.userData.def = def;
    if (pc.forms) m.userData.inst = k;
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
    } else if (pc.bone && pc.bone !== b0 && !item.bone) {   // （付ける骨を選んだ部品は、ブロックごとの骨を使わず、全部をその骨へ）
      if (!g.userData.extra.has(pc.bone)) { const e = new THREE.Group(); e.userData.index = index; g.userData.extra.set(pc.bone, e); }
      m.position.copy(pos); g.userData.extra.get(pc.bone).add(m);
    } else { m.position.copy(pos); g.add(m); }
    });
  }
  applyToGroup(item, g);
  return g;
}
/** 部品ごとに選べる付ける骨（item.bone。issue #185、テスター vault さん 2026-11-05）：無ければ部位の決まり（boneOf）。腕・脚は置いた x の向きの側。
 *  頭は、首の付け根で回る体の座標の入れ物（自由な部品の頭と同じ）。ひじ・ひざの節（2 重関節）は、節の部品のある時だけ骨があるので選ばせない */
const BONE_PICK = [['hips', '腰'], ['torso', '胴'], ['head', '頭'], ['arm', '上腕'], ['fore', '前腕'], ['leg', '太もも'], ['shin', 'すね'], ['foot', '足'], ['shield', '盾（左手に持つ）']];
const BONE_HOLDER = { head: 'headw' };
const canPickBone = it => !!it && !isHead(it.part) && !byId[it.part]?.free;
/** 置いた部品を入れる骨の入れ物（腕・脚の骨は置いた x の向きで左右） */
const holderFor = (b, item) => itemsIn[b] ?? (SIDED.includes(b) ? itemsIn[`${b}_${sideOf(item)}`] : root);
const holderOf = item => holderFor(item.bone ? BONE_HOLDER[item.bone] ?? item.bone : boneOf(byId[item.part]), item);
/** 置いたパーツを Group に写す。腕・脚のパーツは、寸法の調整（関節の間の長さ）を掛けた置き方で（fitItem） */
// 置いたパーツの形態（issue #810、v2-forms.js itemFormDelta）：今見せている形態 { from, to, el }（showFormNow が入れる。null は形態 1）。
// el は切り替えてからのミリ秒（切り替え中でなければ Infinity）。パーツごとの途中 t は、その遅れ（issue #813 formDelayOf）を引いて出す
let itemView = null;
const viewOf = item => itemView && { from: itemView.from, to: itemView.to, t: (itemView.el - formDelayOf(item)) / FORM_MS };
function applyToGroup(item, g) {
  const f = fitItem(item, adj), d = itemFormDelta(item, viewOf(item));
  g.userData.fdelta = d;   // （読み戻す時に外す分）
  for (const t of [g, ...(g.userData.extra?.values() ?? [])]) {
    t.position.set(...f.mov);
    t.quaternion.setFromRotationMatrix(rotMatrix(item.rot));
    t.scale.set(...f.scal);
    if (d) { t.position.add(d.p); t.quaternion.multiply(d.q); t.scale.multiplyScalar(d.s); }
  }
}
const round = (v, n) => Math.round(v * 10 ** n) / 10 ** n;
function readBackFromGroup(item, g) {
  // 形態 2 からを見ている間のつまみ：形態のずれ（applyToGroup が足した分）を外して、形態 1 の置き方として読む
  const d = g.userData.fdelta, pos = g.position.clone(), q = g.quaternion.clone(), sc = g.scale.clone();
  if (d) { pos.sub(d.p); q.multiply(d.q.clone().invert()); sc.divideScalar(d.s); }
  item.mov = pos.toArray().map(v => round(v, 4));
  const e = new THREE.Euler().setFromQuaternion(q, 'YXZ');   // Ry·Rx·Rz：この組み立ての回転の順
  item.rot = [round(e.x / D, 1), round(e.y / D, 1), round(e.z / D, 1)];
  item.scal = sc.toArray().map(v => round(v, 3));
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
const ghostHips = [];   // 仮の腰（下半身の「腰」を置いたら隠す）と、仮の腰の関節（下半身の「腰の関節」を置いたら隠す）。2 個ずつ
const ghostHead = [];   // 仮の首と頭（頭のパーツを置いたら隠す）
const ghostLimb = { arm_l: [], arm_r: [], leg_l: [], leg_r: [] };   // 腕・脚の部品を置いたら、その側の仮の腕・脚を隠す
{
  scene.updateMatrixWorld(true);
  const zero = new THREE.Vector3();
  const cy = S.waist.yTop;   // 仮の胸は、腹の下の端（腰の帯の上の端）まで
  ghostChest = ghost(torsoJ.inner, [...box(-S.chest.hw, S.chest.hw, cy, S.neck.y - 0.06, -S.chest.hd, S.chest.hd), P([0, -0.9, 1], [0, cy, S.chest.hdLow]), P([0, -0.9, -1], [0, cy, -S.chest.hdLow])], zero);
  ghostHips.push(...ghost(root, [...box(-S.waist.hw, S.waist.hw, S.hip.y - 0.08, S.waist.yTop, -S.waist.hd, S.waist.hd), P([0, -1, 1], [0, S.hip.y - 0.08, S.waist.hd - 0.06]), P([0, -1, -1], [0, S.hip.y - 0.08, -S.waist.hd + 0.06])], zero).meshes,   // 腰
    ...ghost(root, [...box(-S.belly.r, S.belly.r, S.waist.yTop - 0.02, S.chest.yBot + 0.02, -S.belly.r, S.belly.r)], zero).meshes);   // 腰の関節
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
/** 仮の胸は、上半身の胸（骨 torso の部品）を置いたら隠す。仮の腰・腰の関節は、下半身の「腰」「腰の関節」を置いたら隠す。仮の腕・脚は、その側に腕・脚の部品を置いたら隠す */
function updateGhostChest() {
  const whole = items.some(it => byId[it.part]?.free && !byId[it.part].tab);   // 自由な機体（全身）を置いたら、仮の形はぜんぶ隠す
  if (whole) { for (const m of ghostAll) m.visible = false; return; }
  { const any = items.some(it => halfOf(it.part) === 'head'); for (const m of ghostHead) m.visible = $('#ghost').checked && !any; }
  const has = items.some(it => halfOf(it.part) === 'upper' && ['胸', '背中', '腹', '脇腹'].includes(byId[it.part].cat)); for (const m of ghostChest.meshes) m.visible = $('#ghost').checked && !has;
  { const has = cat => items.some(it => halfOf(it.part) === 'lower' && byId[it.part].cat === cat); ghostHips.forEach((m, i) => { m.visible = $('#ghost').checked && !has(i < 2 ? '腰' : '腰の関節'); }); }
  for (const [k, list] of Object.entries(ghostLimb)) { const [h, s] = k.split('_'), any = items.some(it => halfOf(it.part) === h && (sideOf(it) === s || byId[it.part]?.cat === TRACK_CAT)); for (const m of list) m.visible = $('#ghost').checked && !any; }
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
  const isGuard = it => byId[it.part]?.cat === 'ひざ当て' && byId[it.part].pieces[0].bone === 'shin' && !byId[it.part].fixed;   // fixed：倒さないひざ当て（ひざの真ん前に付く盾。parts/leg/vw.js）
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
  weapon_change: '持ち替え', crouch: 'しゃがむ', twist_aim: 'ひねって構える', charge: '突進', carry: '運ぶ', walk_aim: '歩いて構える', look_dash: 'ダッシュ', look_aim: '銃を構える', kneel_迫撃: '片膝（迫撃）', sit_片膝: '片膝をつく' };
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
const VIEWS = { front: [0, 0, 1], side: [1, 0, 0], threeq: [0.75, 0.35, 1], top: [0, 1, 0.001], back: [-0.5, 0.25, -1], rear: [0, 0, -1], side2: [-1, 0, 0], low: [0.6, -0.55, 1] };   // rear・side2：真後ろ・逆の真横（dousan さん 2026-11-25 #色々なツールへの要望）
let focus = null;   // パーツエディタを開いている間：{ c: 見る中心, dist: 距離 }（向きのボタンが、機体ではなくパーツを映す）
function setView(k) { const d = new THREE.Vector3(...VIEWS[k]).normalize(), c = focus?.c ?? AT; camera.position.copy(c).addScaledVector(d, focus?.dist ?? viewDist); orbit.target.copy(c); orbit.update(); }
document.querySelectorAll('[data-view]').forEach(b => { b.onclick = () => setView(b.dataset.view); });
{ const el = document.getElementById('views'); new ResizeObserver(() => document.documentElement.style.setProperty('--viewsH', el.offsetHeight + 'px')).observe(el); }   // 視点のボタンが折り返したら、パーツエディタの道具の列をその下へ

/** 頭の殻（部位「頭蓋」）の置いたパーツ。無ければ null */
const headShell = () => headShellIn(items);
/** 頭の入れ物の置き方（unitparts.js の headPlace）：{ k, at }。体の座標 = at + k · 頭の座標 */
const headPlace = () => headPlaceIn(items, adj);
function placeHead() { const { k, at } = headPlace(); headHolder.scale.setScalar(k); headHolder.position.set(...at); }
function rebuild() {
  endFlash();
  rebuildMain();
  drawEdges();
  applyPurgeView();
  if (!PE.active()) bench?.afterRebuild();
}

// ---- パージ後を見る（issue #745）：「パージで外れる」の印（item.purge）を付けた部品を隠す。見た目だけ（保存・書き出す形は変わらない）。パーツエディタの間は隠さない ----
let showPurged = false;
// 撃ち切り後を見る（issue #795）：「ロマン砲変形」の印（item.roman）の、撃ち切ると外れる部品を隠し、撃ち切ると出る部品だけを出す。印の無い時は全部を出す
// （出る部品も、ふだんは見えて置き直せる）。見た目だけ
let showRoman = false;
function applyPurgeView() {
  const hide = it => !PE.active() && ((showPurged && it?.purge) || (showRoman && it?.roman?.m === 'd'));
  // （パーツエディタで「パージで外れる」を付けたブロック pc.purge も隠す。ポッチャさん 2026-11-20「パーツエディタの方でも、パージする設定ほしい」）
  const off = showPurged && !PE.active();
  groups.forEach((g, i) => {
    const v = !hide(items[i]); g.visible = v;
    for (const e of g.userData.extra.values()) e.visible = v;
    for (const r of [g, ...g.userData.extra.values()]) r.traverse(o => { if (o.isMesh && o.userData.pc?.purge) o.visible = !off; });
  });
}
/** パージで外れる物の数：置いたパーツ（item.purge）と、それ以外のパーツの中のブロック（pc.purge） */
const purgeCount = () => { const ks = kept(); return { items: ks.filter(it => it.purge).length, blocks: ks.filter(it => !it.purge).reduce((n, it) => n + (byId[it.part]?.pieces ?? []).filter(pc => pc.purge).length, 0) }; };
$('#bRoman').onclick = () => {
  showRoman = !showRoman; $('#bRoman').classList.toggle('on', showRoman); applyPurgeView();
  if (showRoman) { const ms = kept().filter(it => it.roman), d = ms.filter(it => it.roman.m === 'd').length; note(ms.length ? `武器を撃ち切った後の姿（外れる部品 ${d} 個を隠し、出る部品 ${ms.length - d} 個を出しています。どのスロットも撃ち切った姿）。もう一度押すと戻る` : '「ロマン砲変形」の印を付けた部品がありません（部品を選んで、右の欄の「ロマン砲変形」で付ける）', !ms.length); }
};
$('#bPurged').onclick = () => {
  showPurged = !showPurged; $('#bPurged').classList.toggle('on', showPurged); applyPurgeView();
  if (showPurged) { const c = purgeCount(), n = c.items + c.blocks; note(n ? `パージで外れた後の姿（外れる部品 ${c.items} 個${c.blocks ? `・パーツの中のブロック ${c.blocks} 個` : ''}を隠しています）。もう一度押すと戻る` : '「パージで外れる」の印を付けた部品がありません（部品を選んで、右の欄のチェックで付ける。パーツの中のブロックだけなら、パーツエディタの「ゲーム用」で）', !n); }
};
function rebuildMain() {
  applyKind();
  seatWeapons();
  refreshDecos();
  multiAt = null;
  for (const g of groups) { g.parent?.remove(g); for (const e of g.userData.extra.values()) e.parent?.remove(e); }
  groups = items.map((it, i) => { const g = groupOf(it, i); holderOf(it).add(g); for (const [b, e] of g.userData.extra) holderFor(b, it).add(e); return g; });
  placeArmJoints();
  placeLegJoints();
  placeHead();
  placeFreeJoints();
  attachGizmo();
  renderList();
  fillFields();
  markCatalog();
  updateGhostChest();
  applyPose();
  renderForms();
  showFormNow();
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

// ---- 影を消す（issue 1204）：反対側と下からも光を当て、空の光を強めて、暗い側を無くす。エディタの見た目だけ（書き出す形・ゲームの光は変えない） ----
let flatLight = false;
try { flatLight = localStorage.getItem('xsv2.flatlight') === '1'; } catch { /* storage blocked */ }
function applyLight() {
  back.intensity = flatLight ? 1.1 : 0;
  under.intensity = flatLight ? 0.5 : 0;
  hemi.intensity = flatLight ? 1.3 : 0.9;
  hemi.groundColor.setHex(flatLight ? 0x8a8f99 : 0x2a2d33);
  $('#bLight').classList.toggle('on', flatLight);
}
applyLight();
$('#bLight').onclick = () => { flatLight = !flatLight; try { localStorage.setItem('xsv2.flatlight', flatLight ? '1' : '0'); } catch { /* storage blocked */ } applyLight(); };

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
  if (formAnim) { showFormNow(); if (now - formAnim.t0 >= formSpanOf(items, it => byId[it.part])) { formAnim = null; showFormNow(); multiAt = null; fillMulti(); } }
  shotTick(now);
  flameTick(now);
  resize(); orbit.update(); if (PE.active()) PE.tick();
  const tilted = tiltForView(); jointMarkTick(); renderer.render(scene, camera); if (tilted) untilt();
  requestAnimationFrame(tick);
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
  if (PE.active()) { PE.pick(ndc, e.ctrlKey || e.shiftKey || e.metaKey); return; }   // パーツを直している間は、ブロック・角・辺・面を選ぶ（Ctrl・Shift で選び足す）
  const i = hitAt(ndc);
  if (e.altKey) selectOne(i); else select(i, e.ctrlKey || e.shiftKey || e.metaKey);   // Ctrl・Shift で選び足す・外す。Alt はグループの中の 1 つだけ
});
/** 画面の点（-1〜1）にある置いたパーツの番号（無ければ -1） */
function hitAt(ndc) {
  ray.setFromCamera(ndc, camera);
  const shown = o => { for (let q = o; q; q = q.parent) if (!q.visible) return false; return true; };   // （「パージ後を見る」で隠した部品は押せない）
  const hits = ray.intersectObjects(groups, true).filter(h => shown(h.object));
  return hits.length ? hits[0].object.userData.index : -1;
}
canvas.addEventListener('dblclick', e => {   // ダブルクリック：グループの中の 1 つだけを選ぶ
  if (PE.active()) return;
  const r = canvas.getBoundingClientRect();
  selectOne(hitAt(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)));
});
document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
  if (PE.active()) { PE.key(e); return; }   // パーツエディタを開いている間は、キーはパーツエディタのもの（元に戻す・やり直すも）
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 's') { e.preventDefault(); $('#bSaveAs').onclick(); return; }   // Ctrl+Shift+S：名前を付けて保存
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); $('#bSave').onclick(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'g') { e.preventDefault(); e.shiftKey ? ungroupPicked() : groupPicked(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c' && !window.getSelection()?.toString()) { e.preventDefault(); copyParts(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') { e.preventDefault(); pasteParts(); return; }
  if (e.key === 'w') gizmo.setMode('translate'); else if (e.key === 'e') gizmo.setMode('rotate'); else if (e.key === 'r') gizmo.setMode('scale');
  else if (e.key === 'Delete' && selected >= 0) removeSelected();
});
for (const b of document.querySelectorAll('#gizmo button')) b.onclick = () => (PE.active() ? PE.setGizmoMode(b.dataset.mode) : gizmo.setMode(b.dataset.mode));

// ---- 一覧と欄 ----
const labelOf = it => (it.name ?? byId[it.part]?.name ?? it.part) + (placeOf(byId[it.part]).pair ? (it.mov[0] >= 0 ? '（+x）' : '（−x）') : '');
// ---- 選ぶ・グループ（issue #170、テスター 静流りおさん 2026-11-05）：グループ（item.grp が同じパーツ）は、押すと全部が選ばれ、つまみでまとめて動く・回る・大きさが変わる。
// Ctrl・Shift を押しながら押すと選び足す（もう一度押すと外す）。2 つ以上を選ぶと、つまみは選んだもの全部の真ん中に出る（向きは左右・上下・前後）。
// 骨の違うパーツ（胴と腕など）も、世界の座標でまとめて動かして、それぞれの骨の入れ物の数値に戻す。Alt を押して押すか、ダブルクリックで、グループの中の 1 つだけ
let picked = [];   // 選んでいるパーツの番号（selected はその中の、欄に出す 1 つ）
const membersOf = i => (items[i]?.grp ? items.flatMap((it, j) => (it.grp === items[i].grp ? [j] : [])) : i >= 0 && items[i] ? [i] : []);
/** 選んでいるものを今の items に合わせる（items を入れ替えて selected を −1 にした所・足して selected を変えた所の後） */
function syncPicked() {
  picked = picked.filter(i => i >= 0 && i < items.length);
  if (selected < 0 || selected >= items.length) picked = [];
  else if (!picked.includes(selected)) picked = membersOf(selected);
}
function select(i, add = false) {
  if (PE.active()) return;
  const m = membersOf(i);
  if (add && m.length) {
    if (m.every(j => picked.includes(j))) { picked = picked.filter(j => !m.includes(j)); selected = picked.length ? picked[picked.length - 1] : -1; }
    else { picked = [...picked.filter(j => !m.includes(j)), ...m]; selected = i; }
  } else if (!add) { picked = m; selected = m.length ? i : -1; }
  if (selected >= 0 && items[selected]) showTab(halfOf(items[selected].part));
  attachGizmo(); renderList(); fillFields(); if (picked.length) flash(picked);
}
/** グループの中の 1 つだけを選ぶ */
function selectOne(i) { if (PE.active()) return; picked = i >= 0 && items[i] ? [i] : []; selected = picked.length ? i : -1; attachGizmo(); renderList(); fillFields(); if (picked.length) flash(picked); }
// まとめて動かすつまみの点：選んだもの全部（骨の入れ物に分けたブロックも）の箱の真ん中
const pivot = new THREE.Object3D(); scene.add(pivot);
let pivotFrom = null;   // { P: つまみを掴んだ時のつまみの行列, W: その時の選んだもの 1 つずつの行列 }
function attachGizmo() {
  syncPicked();
  if (picked.length > 1) {
    scene.updateMatrixWorld(true);
    const b = new THREE.Box3();
    for (const i of picked) for (const t of groups[i] ? [groups[i], ...groups[i].userData.extra.values()] : []) b.expandByObject(t);
    pivot.position.copy(b.isEmpty() ? new THREE.Vector3() : b.getCenter(new THREE.Vector3())); pivot.quaternion.identity(); pivot.scale.set(1, 1, 1); pivot.updateMatrixWorld(true);
    gizmo.attach(pivot);
  } else if (selected >= 0 && groups[selected]) gizmo.attach(groups[selected]);
  else gizmo.detach();
}
function pivotStart() { scene.updateMatrixWorld(true); pivotFrom = { P: pivot.matrixWorld.clone(), W: picked.map(i => groups[i].matrixWorld.clone()) }; }
const _d = new THREE.Matrix4(), _m = new THREE.Matrix4();
function pivotMove() {
  if (!pivotFrom) pivotStart();
  pivot.updateMatrixWorld(true);
  _d.copy(pivot.matrixWorld).multiply(_m.copy(pivotFrom.P).invert());   // 掴んでからつまみが動いた分（世界の座標で）
  picked.forEach((i, k) => {
    const g = groups[i]; if (!g?.parent) return;
    g.parent.updateMatrixWorld(true);
    _m.copy(g.parent.matrixWorld).invert().multiply(_d).multiply(pivotFrom.W[k]);
    _m.decompose(g.position, g.quaternion, g.scale);
    readBackFromGroup(items[i], g); applyToGroup(items[i], g);
  });
  multiAt = null; placeArmJoints(); applyPose(); fillFields();
}
const newGrp = () => { for (let n = 1; ; n++) if (!items.some(it => it.grp === `g${n}`)) return `g${n}`; };
/** 選んでいるもの（2 つ以上）を 1 つのグループに（中に別のグループがあれば、それも含めて 1 つに） */
function groupPicked() {
  if (PE.active()) return;
  if (picked.length < 2) { note('グループにするには、Ctrl か Shift を押しながら 2 つ以上を選びます'); return; }
  const g = newGrp(); for (const i of picked) items[i].grp = g;
  rebuild(); save(); note(`${picked.length} 個をグループにしました（押すと全部が選ばれる。1 つだけ選ぶのは Alt を押して押すか、ダブルクリック）`);
}
function ungroupPicked() {
  if (PE.active() || !picked.some(i => items[i]?.grp)) return;
  for (const i of picked) delete items[i].grp;
  rebuild(); save(); note('グループを解きました（今は選んだままなので、このまま動かすとまとめて動く）');
}
// ---- 骨ごとに選ぶ（issue #1008、テスター アズキトギさん 2026-11-20「特定の骨に紐付けされたパーツ全てをまとめて移動」）：
// 選んでいるパーツの骨に付いたパーツを全部選ぶ。選んだ後は、今のまとめて動かすつまみがそのまま効く。
// パーツの骨は、その形が入っている骨の入れ物（カタログの部品は「付ける骨」の欄と同じ。自由な部品（機体エディタの形式）は、形ごとに骨の入れ物へ分かれるので、
// 形の入っている骨の全部）。2 つ以上の骨にまたがるパーツは、どの骨でも選ばれ、動かすとまるごと動く（パーツの位置は 1 つなので）。
// 選んでいるパーツが 2 つ以上の骨にまたがる時は、どの骨かを欄で選ぶ（既定は形の一番多い骨）。
// 左右のある骨（上腕・前腕・太もも・すね・足など）は、既定は同じ側だけ。「左右の両側」に印を付けると反対側の同じ骨も。隠しているパーツ（パージ後・撃ち切り後を見る）は選ばない
const BONE_WORD = { hips: '腰', torso: '胴', head: '頭', arm: '上腕', elbow: 'ひじ', fore: '前腕', leg: '太もも', knee: 'ひざ', shin: 'すね', foot: '足', shield: '盾' };
/** 骨の入れ物 h の名前（'arm_l' など。頭の 2 つの入れ物は 'head' に揃える。盾の入れ物は左の前腕と同じ物なので、盾の印のパーツだけ 'shield'） */
function holderName(h, it) {
  if (it.bone === 'shield' && h === itemsIn.shield) return 'shield';
  const k = Object.keys(itemsIn).find(n => n !== 'shield' && itemsIn[n] === h) ?? 'hips';
  return k === 'headw' ? 'head' : k;
}
/** 置いたパーツ i の形が入っている骨と、その形の数（Map。形の多い順）。組み上がっていなければ空 */
function bonesOf(i) {
  const it = items[i], g = groups[i], m = new Map();
  if (!it || !g?.parent) return m;
  for (const t of [g, ...g.userData.extra.values()]) {
    if (!t.parent) continue;
    let n = 0; t.traverse(o => { if (o.isMesh && o.userData.pc) n++; });
    if (n) { const k = holderName(t.parent, it); m.set(k, (m.get(k) ?? 0) + n); }
  }
  if (!m.size) m.set(holderName(g.parent, it), 0);   // （形の無いパーツは、位置の乗る骨）
  return new Map([...m].sort((x, y) => y[1] - x[1]));
}
const boneBase = k => k.replace(/_[lr]$/, '');
const boneLabel = (k, both) => `${BONE_WORD[boneBase(k)] ?? boneBase(k)}${boneBase(k) !== k && !both ? (k.endsWith('_l') ? '・左' : '・右') : ''}`;
/** 選んでいるパーツの、選ぶ骨（欄で選んだ物。無ければ形の一番多い骨） */
function boneToPick() {
  const bs = selected >= 0 ? [...bonesOf(selected).keys()] : [], v = $('#fPickBone').value;
  return bs.includes(v) ? v : bs[0] ?? null;
}
/** 骨 k に付いたパーツの番号の並び（both：左右の両側） */
function onBone(k, both) {
  if (!k) return [];
  const hit = both && boneBase(k) !== k ? o => boneBase(o) === boneBase(k) : o => o === k;
  return items.flatMap((_, j) => (groups[j]?.visible !== false && [...bonesOf(j).keys()].some(hit) ? [j] : []));
}
function pickBone() {
  if (PE.active() || selected < 0) return;
  const k = boneToPick(), sided = !!k && boneBase(k) !== k, both = sided && $('#fBoneBoth').checked, list = onBone(k, both);
  if (!list.length) return;
  picked = list; if (!picked.includes(selected)) selected = picked[0];
  attachGizmo(); renderList(); fillFields(); flash(picked);
  const wide = list.filter(j => bonesOf(j).size > 1).length;
  note(`「${boneLabel(k, both)}」に付いたパーツ ${list.length} 個を選びました。つまみ（移動・回転・拡大）でまとめて動く${wide ? `（そのうち ${wide} 個はほかの骨にもまたがるので、まるごと動く）` : ''}`);
}
/** 「この骨の部品を全部選ぶ」の欄を、選んでいるパーツに合わせる */
function showBoneBar() {
  const bs = selected >= 0 ? [...bonesOf(selected).keys()] : [];
  $('#boneBar').hidden = !bs.length;
  if (!bs.length) return;
  const sel = $('#fPickBone'), keep = sel.dataset.of === String(selected) ? sel.value : '';   // （ほかのパーツを選んだら、形の一番多い骨から）
  sel.dataset.of = String(selected);
  sel.innerHTML = bs.map(b => `<option value="${b}">${boneLabel(b, false)}</option>`).join('');
  sel.value = bs.includes(keep) ? keep : bs[0]; sel.hidden = bs.length < 2;
  const k = sel.value, sided = boneBase(k) !== k, both = sided && $('#fBoneBoth').checked;
  $('#bPickBone').textContent = `「${boneLabel(k, both)}」の部品を全部選ぶ（${onBone(k, both).length} 個）`;
  $('#fBoneBothL').hidden = !sided;
}
/** 写した並びのグループを、元と別の新しいグループにする（写したものどうしは同じグループのまま） */
function regroup(list) {
  const map = new Map(), used = new Set(items.map(it => it.grp).filter(Boolean));
  let n = 1;
  for (const it of list) if (it.grp) { if (!map.has(it.grp)) { while (used.has(`g${n}`)) n++; map.set(it.grp, `g${n}`); used.add(`g${n}`); } it.grp = map.get(it.grp); }
  return list;
}
/** 足したもの（items の後ろ n 個）を選ぶ */
const pickLast = n => { picked = items.map((_, j) => j).slice(-n); selected = items.length - 1; attachGizmo(); renderList(); fillFields(); };
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
    d.className = picked.includes(i) ? 'sel' : '';
    // 1 か所に 1 つの部位（スカート・太もも・すね・足）が同じ側に 2 つ以上あれば、重なっていると知らせる（別々に動くので、板が 2 枚に見える）
    const cat = byId[it.part]?.cat, dup = ONE_EACH.has(cat) ? items.findIndex((o, j) => j !== i && byId[o.part]?.cat === cat && sideOf(o) === sideOf(it)) : -1;
    d.innerHTML = `<span>${i + 1}. ${labelOf(it)}${it.grp ? ` <b class="grp" title="グループ（押すと全部が選ばれる。1 つだけはダブルクリック）">［${it.grp.replace(/^g/, 'グループ ')}］</b>` : ''}${it.bone ? ` <i class="bone">骨：${BONE_PICK.find(([b]) => b === it.bone)?.[1] ?? it.bone}</i>` : ''}${it.purge ? ' <i class="bone" title="パージで外れる">パージ</i>' : ''}${jointsOn(it).length ? ` <i class="bone" title="ジョイントの付け根（issue 1225）">ジョイント ${jointsOn(it).map(j => j.id).join('・')}</i>` : ''}${it.jt ? ` <i class="bone" title="ジョイントにつながっている（形態 2 からのずらす・回すはジョイントで決まる）">→${it.jt}</i>` : ''}${it.roman ? ` <i class="bone" title="ロマン砲変形：スロット ${it.roman.s} を撃ち切ると${it.roman.m === 'd' ? '外れる' : '出る'}">撃切${it.roman.s}${it.roman.m === 'd' ? '外' : '出'}</i>` : ''}${dup >= 0 ? ` <b style="color:#e8a33d">⚠ ${dup + 1} 番と同じ部位（重なっている）</b>` : ''}</span>`;
    d.onclick = e => (e.detail >= 2 && !(e.ctrlKey || e.shiftKey || e.metaKey) ? selectOne(i) : select(i, e.ctrlKey || e.shiftKey || e.metaKey));   // 2 度目の押し（ダブルクリック）はグループの中の 1 つだけ（行は押すたびに作り直すので dblclick は届かない）
    el.appendChild(d);
  });
  $('#sel').hidden = selected < 0;
  const many = picked.length > 1, grouped = picked.some(i => items[i]?.grp), oneGroup = many && picked.every(i => items[i]?.grp && items[i].grp === items[picked[0]].grp);
  for (const r of document.querySelectorAll('#sel .one')) r.hidden = many;
  $('#multiInfo').hidden = !many;
  if (many) $('#multiInfo').textContent = `${picked.length} 個を選んでいます${oneGroup ? `（${items[picked[0]].grp.replace(/^g/, 'グループ ')}）` : ''}。つまみ（移動・回転・拡大）でまとめて動く`;
  $('#bGroup').hidden = !many || oneGroup; $('#bUngroup').hidden = !grouped;
  fillMulti();   // まとめて数値で動かす（issue 1190）
  showBoneBar();   // 骨ごとに選ぶ（issue #1008）
  renderJetShield();
  renderFx();
}
const FIELDS = { mx: ['mov', 0], my: ['mov', 1], mz: ['mov', 2], rx: ['rot', 0], ry: ['rot', 1], rz: ['rot', 2], sx: ['scal', 0], sy: ['scal', 1], sz: ['scal', 2] };
function fillFields() {
  if (selected < 0) return;
  const it = items[selected];
  $('#fName').value = it.name ?? byId[it.part]?.name ?? it.part;
  const b0 = canPickBone(it) ? boneOf(byId[it.part]) : '', auto = BONE_PICK.find(([b]) => b === b0)?.[1] ?? '部位の決まり';
  $('#fBone').innerHTML = `<option value="">自動（${auto}）</option>` + BONE_PICK.map(([b, l]) => `<option value="${b}">${l}${['arm', 'fore', 'leg', 'shin', 'foot'].includes(b) ? `（${sideOf(it) === 'l' ? '+x' : '−x'} の側）` : ''}</option>`).join('');
  $('#fBone').value = it.bone ?? ''; $('#fBone').disabled = !canPickBone(it);
  $('#fPurge').checked = pickedList().every(i => items[i].purge);
  { const r = pickedList().map(i => items[i].roman ? `${items[i].roman.s}${items[i].roman.m}` : ''); $('#fRoman').value = r.every(v => v === r[0]) ? r[0] : ''; }
  for (const [id, [k, j]] of Object.entries(FIELDS)) $('#' + id).value = it[k][j];
  fillJetDir();
  fillItemForm();
  fillJoint();
  fillMulti();
}
for (const [id, [k, j]] of Object.entries(FIELDS)) $('#' + id).oninput = () => {
  if (selected < 0) return;
  const it = items[selected], v = parseFloat($('#' + id).value);
  if (!Number.isFinite(v)) return;
  it[k][j] = v; applyToGroup(it, groups[selected]); placeArmJoints(); applyPose(); save();
};
$('#fName').oninput = () => { if (selected >= 0) { items[selected].name = $('#fName').value; renderList(); save(); } };
// 付ける骨：立った姿勢の位置はそのまま（骨の入れ物は、どれも立った姿勢の世界の座標）、動かす時にその骨と一緒に動く
$('#fBone').onchange = () => { const it = items[selected]; if (!canPickBone(it)) return; const b = $('#fBone').value; if (b) it.bone = b; else delete it.bone; rebuild(); save(); };
// パージで外れる（issue #745）：選んでいる部品（いくつか選んでいれば全部）に印 item.purge を付ける・外す。左右の対の部品は、反対側（同じパーツで x だけが逆）にも同じ印
const twinOf = i => { const it = items[i]; if (!it || Math.abs(it.mov[0]) < 1e-4) return -1; return items.findIndex((o, j) => j !== i && o.part === it.part && Math.abs(o.mov[0] + it.mov[0]) < 1e-3 && Math.abs(o.mov[1] - it.mov[1]) < 1e-3 && Math.abs(o.mov[2] - it.mov[2]) < 1e-3); };
$('#fPurge').onchange = () => {
  if (selected < 0) return;
  const on = $('#fPurge').checked, set = new Set(pickedList()), mine = set.size;
  for (const i of [...set]) { const t = twinOf(i); if (t >= 0) set.add(t); }
  for (const i of set) { if (on) items[i].purge = true; else delete items[i].purge; }
  rebuild(); save(); note(`${set.size} 個を${on ? 'パージで外れる部品にしました' : 'パージで外れない部品に戻しました'}${set.size > mine ? '（左右の対の反対側も）' : ''}`);
};
// ロマン砲変形（issue #795）：選んでいる部品（いくつか選んでいれば全部）に印 item.roman = { s: 武器スロット 1〜3, m: 'd' 撃ち切ると外れる | 's' 撃ち切ると出る }。
// 左右の対には写さない（片腕だけに付ける武装が多い：原作の撃ち切りのミサイルも左手だけ）
$('#fRoman').onchange = () => {
  if (selected < 0) return;
  const v = $('#fRoman').value, set = pickedList();
  for (const i of set) { if (v) items[i].roman = { s: +v[0], m: v[1] }; else delete items[i].roman; }
  rebuild(); save(); note(v ? `${set.length} 個を、スロット ${v[0]} の武器を撃ち切ると${v[1] === 'd' ? '外れて落ちる' : '現れる'}部品にしました` : `${set.length} 個のロマン砲変形の印を外しました`);
};
// ---- まとめて数値で動かす（issue 1190、テスター Wijick さん 2026-11-25「形態を複数作る時、グループしたパーツは数値を入力したら一緒に動かせるように」）：
// 2 つ以上を選んでいる時（グループを押すと全部が選ばれる）、右の「位置」は選んだもの全部の真ん中、「回転」はその真ん中を軸に回した量（選び直すと 0）。
// 数を変えると全部が一緒に動く（部品どうしの位置・向きはそのまま）。形態 1 では置き方（mov・rot）を、形態 2 からはその形態のずらす・回す（item.forms[n] の p・r）を変える。
// 軸は機体の 左右・上下・前後（root の座標。空を飛ぶ形を倒して見ている時も）
let multiAt = null;   // { key, c: 真ん中（root の座標）, r: 回した量 [x, y, z]（度） }
const multiKey = () => `${picked.join(',')}|${formNow}`;
function multiCenter() {
  scene.updateMatrixWorld(true);
  const b = new THREE.Box3();
  for (const i of picked) for (const t of groups[i] ? [groups[i], ...groups[i].userData.extra.values()] : []) b.expandByObject(t);
  return root.worldToLocal(b.isEmpty() ? new THREE.Vector3() : b.getCenter(new THREE.Vector3()));
}
function fillMulti() {
  const box = $('#multiMove'); if (!box) return;
  box.hidden = picked.length < 2 || PE.active();
  if (box.hidden) { multiAt = null; return; }
  if (multiAt?.key !== multiKey()) multiAt = { key: multiKey(), c: multiCenter(), r: [0, 0, 0] };
  [0, 1, 2].forEach(k => { $('#mm' + 'xyz'[k]).value = round(multiAt.c.getComponent(k), 3); $('#mr' + 'xyz'[k]).value = multiAt.r[k]; });
  $('#multiHint').textContent = formNow === 1
    ? '位置は選んだもの全部の真ん中、回転はその真ん中を軸に回す量（度）。数を変えると全部が一緒に動く（形態 1 の置き方）'
    : `形態 ${formNow} での、選んだもの全部のずらし・回し（位置は全部の真ん中、回転はその真ん中を軸に回す量）。形態 1 の置き方はそのまま`;
}
/** 選んだもの全部に、root の座標での動き Dl（行列）を掛ける。形態 1 は置き方を、形態 2 からはその形態のずれを書き換える */
function moveMulti(Dl) {
  root.updateMatrixWorld(true);
  const Rw = root.matrixWorld, Dw = Rw.clone().multiply(Dl).multiply(Rw.clone().invert()), n = formNow;
  for (const i of picked) {
    const it = items[i], g = groups[i]; if (!it || !g?.parent) continue;
    g.parent.updateMatrixWorld(true);
    const P = g.parent.matrixWorld, f = fitItem(it, adj), q0 = new THREE.Quaternion().setFromRotationMatrix(rotMatrix(it.rot));
    const fv = n > 1 ? formOf(it, n) : null, p = fv?.p ?? [0, 0, 0], r = fv?.r ?? [0, 0, 0];
    const qf = new THREE.Quaternion().setFromEuler(new THREE.Euler(r[0] * D, r[1] * D, r[2] * D, 'XYZ'));
    const L = new THREE.Matrix4().compose(new THREE.Vector3(...f.mov).add(new THREE.Vector3(...p)), q0.clone().multiply(qf), new THREE.Vector3(...f.scal));
    const pos = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    P.clone().invert().multiply(Dw).multiply(P).multiply(L).decompose(pos, q, s);
    if (n === 1) { g.userData.fdelta = null; g.position.copy(pos); g.quaternion.copy(q); g.scale.copy(s); readBackFromGroup(it, g); applyToGroup(it, g); continue; }
    const e = new THREE.Euler().setFromQuaternion(q0.invert().multiply(q), 'XYZ');
    setForm(it, n, { p: pos.sub(new THREE.Vector3(...f.mov)).toArray().map(v => round(v, 4)), r: [e.x, e.y, e.z].map(v => round(v / D, 2)) });
  }
  if (n === 1) { placeArmJoints(); applyPose(); } else showFormNow();
  attachGizmo(); save();
}
{
  const vals = k => [0, 1, 2].map(a => parseFloat($('#' + k + 'xyz'[a]).value));
  for (const a of 'xyz') {
    $('#mm' + a).oninput = () => {
      if (!multiAt) return;
      const v = vals('mm'); if (!v.every(Number.isFinite)) return;
      const d = new THREE.Vector3(...v).sub(multiAt.c); if (d.lengthSq() < 1e-12) return;
      multiAt.c.add(d); moveMulti(new THREE.Matrix4().makeTranslation(d.x, d.y, d.z));
    };
    $('#mr' + a).oninput = () => {
      if (!multiAt) return;
      const v = vals('mr'); if (!v.every(Number.isFinite)) return;
      const qa = new THREE.Quaternion().setFromEuler(new THREE.Euler(...multiAt.r.map(x => x * D), 'XYZ'));
      const qb = new THREE.Quaternion().setFromEuler(new THREE.Euler(...v.map(x => x * D), 'XYZ'));
      const R = new THREE.Matrix4().makeRotationFromQuaternion(qb.multiply(qa.invert())), c = multiAt.c;
      multiAt.r = v;
      moveMulti(new THREE.Matrix4().makeTranslation(c.x, c.y, c.z).multiply(R).multiply(new THREE.Matrix4().makeTranslation(-c.x, -c.y, -c.z)));
    };
  }
}
$('#bGroup').onclick = groupPicked;
$('#bUngroup').onclick = ungroupPicked;
$('#bPickBone').onclick = pickBone;
$('#fBoneBoth').onchange = showBoneBar;
$('#fPickBone').onchange = showBoneBar;

// ---- ジョイント（issue 1225、テスター ポッチャさん 2026-11-27「形態 1・形態 2 の変形で部品を 1 つずつ動かす手間を、ジョイントでつないでまとめて動かせるように」、v2-joints.js）：
// 付け根のパーツに軸（ヒンジ・回転・スライダー）を置き、ほかのパーツをつなぐ。形態 2 からで角度（スライダーは距離）を決めると、つないだパーツの形態のずらす・回す
// （item.forms[n] の p・r）がまとめて入る。付け根の形態 n の置き方にも付いて行く。保存のたびに計算し直す（syncJoints）ので、形態 1 の置き方を直しても付いてくる。
// 骨の違うパーツどうし（胴と腕など）は、今の姿勢での骨の位置で計算する（moveMulti と同じ）
/** 置いたパーツ it の、形態 n の置き方の行列（withScale：拡大も掛ける）と、fitItem の結果・形態 1 の向き */
function formPlace(it, n, withScale) {
  const f = fitItem(it, adj), q0 = new THREE.Quaternion().setFromRotationMatrix(rotMatrix(it.rot));
  const fv = n > 1 ? formOf(it, n) : null, p = fv?.p ?? [0, 0, 0], r = fv?.r ?? [0, 0, 0];
  const qf = new THREE.Quaternion().setFromEuler(new THREE.Euler(r[0] * D, r[1] * D, r[2] * D, 'XYZ'));
  const L = new THREE.Matrix4().compose(new THREE.Vector3(...f.mov).add(new THREE.Vector3(...p)), q0.clone().multiply(qf), withScale ? new THREE.Vector3(...f.scal) : new THREE.Vector3(1, 1, 1));
  return { L, f, q0 };
}
const parentWorld = i => { const g = groups[i]; if (!g?.parent) return null; g.parent.updateMatrixWorld(true); return g.parent.matrixWorld; };
/** つながったパーツの形態のずれ（とジョイントの遅れ）を、ジョイントから計算し直す（変わった物があれば true）。付け根の無いつながり・輪になるつながりは外す。
 *  ジョイントの先のジョイント（issue 1293）：親のジョイントから先に計算する（jointOrder）ので、子の付け根の形態 n の置き方（formPlace）に親の動きが入り、子の軸とその先も付いて回る */
function syncJoints() {
  if (PE.active() || groups.length !== items.length) return false;
  let changed = false;
  for (const it of items) if (it.jt && (!jointParent(items, it) || jointAncestors(items, it) == null)) { delete it.jt; changed = true; }
  const roots = jointOrder(items);
  const top = Math.min(FORM_MAX, Math.max(formCount(), ...roots.flatMap(rt => jointsOn(rt).flatMap(j => Object.keys(j.v ?? {}).map(Number).filter(Number.isFinite)))));   // （連鎖の先まで同じ形態の数で）
  for (const rt of roots) for (const j of jointsOn(rt)) {   // （1 つの付け根に 2 つ以上のジョイント：それぞれのつながるパーツを、そのジョイントで：issue 1293）
    const ri = items.indexOf(rt), Pr = parentWorld(ri); if (!Pr) continue;
    const Lr1 = formPlace(rt, 1, false).L, dl = jointDelayOf(j, formDelayOf(rt));
    items.forEach((ct, ci) => {
      if (ct === rt || ct.jt !== j.id) return;
      const Pc = parentWorld(ci); if (!Pc) return;
      const c1 = formPlace(ct, 1, true), mov = new THREE.Vector3(...c1.f.mov);
      for (let n = 2; n <= top; n++) {
        const kf = kidForm({ Pr, Lr1, Lrn: formPlace(rt, n, false).L, J: jointMotion(j, jointValue(j, n)), Pc, Lc1: c1.L, mov, q0: c1.q0 });
        const before = JSON.stringify(ct.forms?.[n] ?? null);
        setForm(ct, n, { p: kf.p, r: kf.r });
        if (JSON.stringify(ct.forms?.[n] ?? null) !== before) changed = true;
      }
      // ジョイントの遅れ（issue 1293）：決めてあれば、つないだパーツの遅れ ＝ 付け根の遅れ ＋ ジョイントの遅れ（決めていなければパーツの遅れのまま）
      if (dl != null) { const ms = formDelayOf({ formDelay: dl }); if (ms !== formDelayOf(ct)) { if (ms) ct.formDelay = ms; else delete ct.formDelay; changed = true; } }
    });
  }
  return changed;
}
/** 計算し直して、今の形態の見た目にする */
function jointsNow() { if (syncJoints()) showFormNow(); }
// 3D の軸の印：付け根（またはつながったパーツ）を選んでいる間、軸の線と軸の点を出す（スライダーは向きの線だけ）
const jointMark = new THREE.Group();
{
  const mat = new THREE.LineBasicMaterial({ color: 0xffb02e, depthTest: false, transparent: true });
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.25, 0, 0), new THREE.Vector3(0.25, 0, 0)]), mat);
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.012, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffb02e, depthTest: false, transparent: true }));
  line.renderOrder = dot.renderOrder = 9; line.raycast = dot.raycast = () => {};
  dot.name = 'dot'; jointMark.add(line, dot);
}
jointMark.visible = false; jointMark.matrixAutoUpdate = false; scene.add(jointMark);
const AXQ = { x: new THREE.Quaternion(), y: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 2)), z: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -Math.PI / 2, 0)) };
/** 欄と軸の印に出すジョイント：つながっているだけのパーツなら、そのジョイント。付け根なら、選んでいる物（jointCur）か最初の物（issue 1293） */
let jointCur = null;
function shownJoint(it, rt) {
  if (!rt) return null;
  if (rt !== it) return jointById(items, it.jt)?.j ?? null;
  const list = jointsOn(rt);
  return list.find(j => j.id === jointCur) ?? list[0] ?? null;
}
function jointMarkTick() {
  const it = selected >= 0 && !PE.active() ? items[selected] : null, rt = jointRoot(items, it), ri = rt ? items.indexOf(rt) : -1, g = groups[ri], j = shownJoint(it, rt);
  jointMark.visible = !!j && !!g?.parent && !!g.visible;
  if (!jointMark.visible) return;
  g.updateWorldMatrix(true, false);
  const pos = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  g.matrixWorld.decompose(pos, q, s);   // （拡大は掛けない：軸の点は付け根の原点からの、拡大の無い座標）
  const at = isSlide(j) ? [0, 0, 0] : j.at ?? [0, 0, 0];
  jointMark.matrix.compose(pos, q, new THREE.Vector3(1, 1, 1)).multiply(new THREE.Matrix4().compose(new THREE.Vector3(...at), AXQ[j.axis] ?? AXQ.x, new THREE.Vector3(1, 1, 1)));
  jointMark.matrixWorldNeedsUpdate = true;
  jointMark.getObjectByName('dot').visible = !isSlide(j);
}
/** 置いたパーツ i の原点（形態 1）を、付け根 ri の座標（拡大の無い）で */
function originIn(ri, i) {
  const Pr = parentWorld(ri), Pc = parentWorld(i); if (!Pr || !Pc) return [0, 0, 0];
  const v = new THREE.Vector3().applyMatrix4(Pc.clone().multiply(formPlace(items[i], 1, true).L));
  return v.applyMatrix4(Pr.clone().multiply(formPlace(items[ri], 1, false).L).invert()).toArray().map(x => round(x, 4));
}
function fillJoint() {
  const box = $('#itemJoint'); if (!box) return;
  const it = selected >= 0 && !PE.active() ? items[selected] : null;
  if (!it) { box.innerHTML = ''; return; }
  const rt = jointRoot(items, it), others = picked.filter(i => i !== selected && items[i]);
  const head = '<div class="bar" style="margin-top:6px"><b style="font-size:12px;align-self:center">ジョイント</b></div>';
  // 作る（付け根：このパーツ）。ほかのジョイントにつながっているパーツも付け根にできる（ジョイントの先のジョイント、issue 1293）
  // 付け根に、もうジョイントがあれば「足す」（1 つの付け根に 2 つ目からの軸：issue 1293）
  const has = jointsOn(it).length > 0;
  const makeBtn = others.length ? `<div class="bar"><button class="small" id="bJointMake" title="今のパーツ（最後に選んだ物）が付け根、ほかに選んだ物がつながるパーツ${has ? '。このパーツの今のジョイントはそのままで、別の軸を足す' : ''}">ジョイントを${has ? '足す' : '作る'}（付け根：このパーツ、つなぐ：ほかの ${others.length} 個）</button></div>` : '';
  const makeOn = () => { if ($('#bJointMake')) $('#bJointMake').onclick = () => {
    const kids = others.filter(i => !jointCycle(items, it, items[i]));
    if (!kids.length) { note('つなぐパーツが、どれもこのパーツの親のジョイントの付け根です（輪になるつなぎ方はできません）', true); return; }
    const nj = makeJoint(items);
    putJoints(it, [...jointsOn(it), nj]); jointCur = nj.id;
    for (const i of kids) items[i].jt = nj.id;
    save(); renderList(); fillFields();
    note(`ジョイント ${nj.id} を${has ? '足しました' : '作りました'}（付け根：${labelOf(it)}、つなぐ：${kids.length} 個${kids.length < others.length ? '。親のジョイントの付け根は外しました' : ''}）。形態 2 からで角度を決めます`);
  }; };
  const about = '<div class="hint">ジョイント：付け根のパーツに軸（ヒンジ・回転・スライダー）を置き、ほかのパーツをつなぐ。形態 2 からで角度（スライダーは距離）を決めると、つないだパーツの、その形態のずらす・回すがまとめて入る（付け根を形態で動かすと、つないだパーツも付いて行く）。作るには、つなぐパーツを選び、最後に付け根を Ctrl を押しながら選んで「ジョイントを作る」。もうジョイントのある付け根で同じようにすると、別の軸を足せる（「ジョイントを足す」）。エディタの中の道具で、ゲームには形態のずれとして入る</div>';
  if (!rt) { box.innerHTML = head + makeBtn + about; makeOn(); return; }
  const j = shownJoint(it, rt); if (!j) { box.innerHTML = head + makeBtn + about; makeOn(); return; }
  const ri = items.indexOf(rt), kid = rt !== it, kids = jointKids(items, rt, j), fN = formNow, slide = isSlide(j), all = jointsOn(rt);
  const unit = slide ? '' : '°', step = slide ? 0.01 : 5, v = jointValue(j, fN);
  const addable = others.filter(i => items[i].jt !== j.id && !jointCycle(items, rt, items[i]));
  const up = !kid && jointParent(items, rt);   // （この付け根が、さらに親のジョイントにつながっている：issue 1293）
  box.innerHTML = head
    + `<div class="hint">${kid ? `このパーツは、ジョイント ${j.id}（付け根：${labelOf(rt)}）につながっています。形態 2 からのずらす・回すは、ジョイントで決まります` : all.length > 1 ? `このパーツは、ジョイント ${all.map(x => x.id).join('・')} の付け根です（${all.length} 個の軸）。下で選んだジョイント ${j.id} につながっているパーツ：${kids.length} 個` : `このパーツは、ジョイント ${j.id} の付け根です。つながっているパーツ：${kids.length} 個`}</div>`
    + (!kid && all.length > 1 ? `<div class="row"><label>ジョイント</label><select id="jPick" title="この付け根の、どのジョイントを見るか（軸ごとに、つながるパーツ・種類・値が別）">${all.map(x => `<option value="${x.id}" ${x === j ? 'selected' : ''}>${x.id}（${JOINT_KIND[x.type] ?? x.type}・${x.axis}、${jointKids(items, rt, x).length} 個）</option>`).join('')}</select></div>` : '')
    + (up ? `<div class="hint">この付け根も、ジョイント ${rt.jt}（付け根：${labelOf(up)}）につながっています。親のジョイントが回ると、このジョイントの軸とつないだパーツも一緒に付いて回ります</div><div class="bar"><button class="small" id="bJointUp">親の付け根を選ぶ</button></div>` : '')
    + makeBtn
    + `<div class="row"><label>種類</label><select id="jType">${Object.entries(JOINT_KIND).map(([k, t]) => `<option value="${k}" ${j.type === k ? 'selected' : ''}>${t}</option>`).join('')}</select></div>`
    + `<div class="row"><label>${slide ? '向き' : '軸'}</label><select id="jAxis">${['x', 'y', 'z'].map(a => `<option value="${a}" ${j.axis === a ? 'selected' : ''}>付け根の ${a}</option>`).join('')}</select></div>`
    + (slide ? '' : `<div class="row"><label>軸の点</label>${[0, 1, 2].map(a => `<input type="number" step="0.01" data-jat="${a}" value="${j.at?.[a] ?? 0}">`).join('')}</div>`
      + `<div class="bar"><button class="small" id="bJointAt0" title="軸の点を、付け根のパーツの原点（つまみの出る所）に">付け根の原点に</button>${kid ? '<button class="small" id="bJointAtKid" title="軸の点を、このパーツ（つながっている方）の原点に">このパーツの原点に</button>' : ''}</div>`)
    + `<label class="chk" title="値の向きを返す（ヒンジ・回転は回る向き、スライダーはずれる向き）"><input type="checkbox" id="jRev" ${j.rev ? 'checked' : ''}>逆向きに${slide ? 'ずらす' : '回す'}</label>`
    + (formCount() > 1 ? `<div class="row"><label>遅れ</label><input type="number" id="jDelay" min="0" max="${FORM_DELAY_MAX / 1000}" step="0.05" value="${(j.delay ?? 0) / 1000}" title="形態を切り替えた時、付け根が動き出してから、つないだパーツが動き出すまでの秒（0〜${FORM_DELAY_MAX / 1000}）"><span class="hint" style="align-self:center">秒</span></div>`
      + '<div class="hint">遅れ：形態を切り替えた時、付け根が動き出してから、つないだパーツが動き出すまでの秒。決めると、つないだパーツの「遅れ」はこれで決まる（ジョイントの先のジョイントは、その分さらに遅れる）</div>' : '')
    + `<div class="row"><label>下限・上限</label><input type="number" step="${step}" id="jMin" value="${j.min}"><input type="number" step="${step}" id="jMax" value="${j.max}"><span class="hint" style="align-self:center">${unit}</span></div>`
    + (fN > 1
      ? `<div class="row"><label>形態 ${fN}</label><input type="range" id="jValR" min="${Math.min(j.min, j.max)}" max="${Math.max(j.min, j.max)}" step="${slide ? 0.005 : 1}" value="${v}"><input type="number" id="jVal" step="${step}" value="${v}" style="width:64px"><span class="hint" style="align-self:center">${slide ? '距離' : '度'}</span></div>`
      : '<div class="hint">形態 1 はいつもの置き方（ジョイントは 0）。上の「形態」で形態 2 からを選ぶと、その形態での角度（スライダーは距離）を決められる</div>')
    + `<div class="bar">${addable.length ? `<button class="small" id="bJointAdd" title="ほかに選んでいるパーツを、このジョイントにつなぐ">選んでいる ${addable.length} 個をつなぐ</button>` : ''}${kid ? '<button class="small" id="bJointOff" title="このパーツをジョイントから外す（今の形態のずれはそのまま残る）">このパーツを外す</button><button class="small" id="bJointRoot">付け根を選ぶ</button>' : ''}<button class="small" id="bJointDel" title="ジョイントを消す（つながっていたパーツの形態のずれはそのまま残る）">ジョイントを消す</button></div>`
    + about;
  const redo = () => { jointsNow(); save(); };
  if ($('#jPick')) $('#jPick').onchange = e => { jointCur = e.target.value; fillJoint(); };
  $('#jType').onchange = e => { setJointType(j, e.target.value); redo(); fillJoint(); };
  $('#jAxis').onchange = e => { j.axis = e.target.value; redo(); if (all.length > 1) fillJoint(); };   // （ジョイントを選ぶ欄の「軸」の字も直す）
  $('#jRev').onchange = e => { if (e.target.checked) j.rev = true; else delete j.rev; redo(); };
  if ($('#jDelay')) $('#jDelay').onchange = e => { j.delay = formDelayOf({ formDelay: (+e.target.value || 0) * 1000 }); e.target.value = j.delay / 1000; redo(); fillItemForm(); };
  if ($('#bJointUp')) $('#bJointUp').onclick = () => select(items.indexOf(up));
  makeOn();
  for (const el of box.querySelectorAll('[data-jat]')) { el.oninput = () => { j.at = [0, 1, 2].map(a => +box.querySelector(`[data-jat="${a}"]`).value || 0); jointsNow(); }; el.onchange = () => save(); }
  if ($('#bJointAt0')) $('#bJointAt0').onclick = () => { j.at = [0, 0, 0]; redo(); fillJoint(); };
  if ($('#bJointAtKid')) $('#bJointAtKid').onclick = () => { j.at = originIn(ri, selected); redo(); fillJoint(); };
  const lim = () => {
    const a = +$('#jMin').value, b = +$('#jMax').value;
    if (Number.isFinite(a)) j.min = a; if (Number.isFinite(b)) j.max = b;
    for (const n of Object.keys(j.v ?? {})) j.v[n] = clampJoint(j, j.v[n]);
    redo(); fillJoint();
  };
  $('#jMin').onchange = lim; $('#jMax').onchange = lim;
  if (fN > 1) {
    const setV = (x, from) => {
      const c = clampJoint(j, +x); j.v = { ...(j.v ?? {}), [fN]: c }; if (!c) delete j.v[fN];
      if (from !== 'r') $('#jValR').value = c; if (from !== 'n') $('#jVal').value = c;
      jointsNow();
    };
    $('#jValR').oninput = e => setV(e.target.value, 'r'); $('#jValR').onchange = () => save();
    $('#jVal').oninput = e => setV(e.target.value, 'n'); $('#jVal').onchange = e => { setV(e.target.value); save(); };
  }
  if ($('#bJointAdd')) $('#bJointAdd').onclick = () => { for (const i of addable) items[i].jt = j.id; redo(); renderList(); fillFields(); note(`${addable.length} 個をジョイント ${j.id} につなぎました`); };
  if ($('#bJointOff')) $('#bJointOff').onclick = () => { delete it.jt; save(); renderList(); fillFields(); note(`ジョイント ${j.id} から外しました（形態のずれはそのまま）`); };
  if ($('#bJointRoot')) $('#bJointRoot').onclick = () => select(ri);
  $('#bJointDel').onclick = () => { for (const k of kids) delete k.jt; putJoints(rt, all.filter(x => x !== j)); save(); renderList(); fillFields(); note(`ジョイント ${j.id} を消しました（形態のずれはそのまま）`); };
}

function addItems(list) { items.push(...list); selected = items.length - 1; rebuild(); save(); if (!PE.active() && !addOnly) flash(list.map((_, k) => items.length - list.length + k)); }
function removeSelected() {
  if (selected < 0) return;
  const out = new Set(picked.length ? picked : [selected]);
  items = items.filter((_, j) => !out.has(j)); picked = []; selected = out.size > 1 ? -1 : Math.min(selected, items.length - 1); rebuild(); save();
}
$('#bDel').onclick = removeSelected;
// 複製・反対側にも：選んでいるもの全部を写す。グループは写した方が新しいグループになり、写したものを選ぶ
const pickedList = () => (picked.length ? picked : [selected]).filter(i => items[i]);
$('#bDup').onclick = () => { if (selected < 0) return; const list = regroup(pickedList().map(i => { const it = structuredClone(items[i]); it.mov = [it.mov[0] + 0.05, it.mov[1], it.mov[2]]; return it; })); addItems(list); pickLast(list.length); };
// コピー・貼り付け（テスター 静流りおさん 2026-11-08 #要望用「作った部品…使いたい部品（腕の飾り→盾）などに入れたい」「コピーして他部品で貼り付けて
// 使うでもいい」; ハブの決め）：選んでいるパーツを覚え、貼る時に選んでいるパーツ（貼り先）の所へ、その骨に付けて置く。形・色・役は覚えた
// パーツのまま（同じパーツを置く）。貼り先が左右の対の片方なら、反対側にも鏡像を置く。貼り先が無ければ、元の所に少しずらして置く [形 独自]
let clip = null;
function copyParts() {
  const list = pickedList();
  if (!list.length) return;
  clip = list.map(i => structuredClone(items[i]));
  note(`${clip.length} 個のパーツをコピーしました。付けたい所のパーツを選んで「貼り付け」（Ctrl+V）`);
}
const BONE_KEYS = new Set(BONE_PICK.map(([b]) => b));
function pasteParts() {
  if (!clip?.length) { note('先に、貼りたいパーツを選んで「コピー」（Ctrl+C）', true); return; }
  const tgt = items[selected], c = [0, 1, 2].map(k => clip.reduce((a, it) => a + (it.mov?.[k] ?? 0), 0) / clip.length);
  const bone = tgt && canPickBone(tgt) ? tgt.bone ?? (BONE_KEYS.has(boneOf(byId[tgt.part])) ? boneOf(byId[tgt.part]) : null) : null;
  // (貼り付けた物は、元の形の写しを持つ自分のパーツ（★）：パーツエディタで直しても元は変わらない。同じパーツから貼った物どうし
  // （左右の対の両方）は 1 つの写しを分け合う [テスター 静流りおさん 2026-11-08 #要望用「コピーで増やした方は…自由に形状変化させたい」; ハブの決め])
  const copies = new Map();
  const ownOf = id => { if (!copies.has(id)) { const def = makeUserCopy(byId[id]); keepUser(def); copies.set(id, def.id); } return copies.get(id); };
  const out = clip.map(src => {
    const it = dropJoint(structuredClone(src));   // （貼り付けた物はジョイントを外し、形態のずれだけ残す：issue 1225）
    if (byId[src.part]) it.part = ownOf(src.part);
    if (tgt) { it.mov = [0, 1, 2].map(k => round(tgt.mov[k] + (src.mov?.[k] ?? 0) - c[k], 4)); if (bone && canPickBone(it)) it.bone = bone; }
    else it.mov = [(it.mov?.[0] ?? 0) + 0.05, it.mov?.[1] ?? 0, it.mov?.[2] ?? 0];
    return it;
  });
  // 貼り先が左右の対の片方（同じパーツが x を返した所にある）：反対側にも
  const twin = tgt && Math.abs(tgt.mov[0]) > 1e-4 && items.some(o => o !== tgt && o.part === tgt.part && Math.abs(o.mov[0] + tgt.mov[0]) < 1e-3 && Math.abs(o.mov[1] - tgt.mov[1]) < 1e-3);
  const list = regroup(twin ? [...out, ...out.map(it => mirrorItem(structuredClone(it)))] : out);
  addItems(list); pickLast(list.length);
  note(`${clip.length} 個のパーツを貼り付けました${twin ? '（反対側にも）' : ''}${bone ? `。付ける骨：${BONE_PICK.find(([b]) => b === bone)?.[1] ?? bone}` : ''}`);
}
/** この片方だけ別にする：選んでいるパーツに、元の形の写しを持つ自分のパーツ（★）を持たせ、同じパーツを指すほかの物（左右の対の反対側など）
 *  と切り離す。直しても、ほかの物は変わらない */
function splitParts() {
  const list = pickedList().filter(i => items.some((o, j) => j !== i && o.part === items[i].part));
  if (!list.length) { note('選んでいるパーツは、ほかの物と同じ形を分け合っていません（もう別になっています）'); return; }
  for (const i of list) { const def = makeUserCopy(byId[items[i].part]); keepUser(def); items[i].part = def.id; }
  rebuild(); save(); renderList(); fillFields();
  note(`${list.length} 個のパーツを別の形にしました。直しても、ほかの物は変わりません`);
}
$('#bSplitP').onclick = splitParts;
$('#bCopyP').onclick = copyParts;
$('#bPasteP').onclick = pasteParts;
$('#bMirror').onclick = () => {
  if (selected < 0) return;
  const list = regroup(pickedList().map(i => { const src = items[i], m = mirrorItem(structuredClone(src)); if (src.name) m.name = src.name.replace(/（鏡像）$/, '') + '（鏡像）'; else delete m.name; return m; }));   // 名前を付けていないパーツは、カタログの名前のまま（左右は一覧の（±x）で分かる）
  addItems(list); pickLast(list.length);
};

// ---- 寸法の調整：上半身の部品をまとめて上下、肩関節と肩アーマーをまとめて左右・上下に動かす。つまみの値は組み立てと一緒に保存し、
// 動かした量（前の値との差）だけ置いた部品の位置を変える（元に戻すでも戻る）
// 新しい機体の寸法の調整：上半身を 24 cm 下げて腰の帯に載せ（胴を短く）、肩を 2 cm 内へ（胴を細くした分。4 cm では、投げる動きで肩アーマーが胸の芯に 6 cm 入った）（依頼主が写真を見せて「胴体長すぎ」「デブ」）。
// 保存してある機体・読み込む機体は、その機体の値のまま（値が無ければ 0）
const NEW_ADJ = { ...ADJ0, up: -0.24, sh: -0.02, upperArm: -0.15, foreArm: -0.13, std: 2 };   // 腕は写真の長さ（肩の関節から拳の先まで全高の 31%）
let adj = { ...NEW_ADJ };
const SHOULDER_CAT = new Set(['肩関節', '肩アーマー', '肩の増加装甲']);
/** 肩の左右・高さの調整で一緒に動く部品：肩関節・肩アーマーと腕 */
const followsShoulder = def => SHOULDER_CAT.has(def.cat) || ARM_CAT.has(def.cat);
/** 前の頭身の機体（上半身が腰の帯から浮いていて、腰の関節の柱が見える）を、開いたときに 1 回だけ新しい標準へ直す：上半身・背中・腕の部品を腰の帯に載る高さへ下げ、
 *  肩を 2 cm 内へ、腕は長さを変えていなければ写真の長さへ（ゲームの機体を直した tools/lineup/rebody.mjs と同じ動かし方）。直した印は寸法の調整の std。
 *  全身が 1 つの形の機体（艦など）と、上半身があるのに腰の帯（下半身の「腰」）の無い機体（キャタピラの車体など）は変えない。直したら true */
function toNewBody(list, a) {
  if (a.std >= 2) return false;
  a.std = 2;
  const has = f => list.some(it => byId[it.part] && f(it.part, byId[it.part]));
  // 上半身の部品がまだ無い機体は、寸法だけ新しい標準に（あとから足す標準の上半身がその高さに載る）
  if (a.up <= NEW_ADJ.up + 1e-6 || has((id, def) => def.free && !def.tab) || (has(withUpper) && !has((id, def) => halfOf(id) === 'lower' && def.cat === '腰'))) return false;
  const d = NEW_ADJ.up - a.up;
  for (const it of list) {
    if (!byId[it.part] || !withUpper(it.part)) continue;
    it.mov = (it.mov ?? [0, 0, 0]).slice(); it.mov[1] = round(it.mov[1] + d, 4);
    if (followsShoulder(byId[it.part])) it.mov[0] = round(it.mov[0] + Math.sign(it.mov[0] || 1) * NEW_ADJ.sh, 4);
  }
  a.up = NEW_ADJ.up; a.sh = round(a.sh + NEW_ADJ.sh, 4);
  if (!a.upperArm && !a.foreArm) { a.upperArm = NEW_ADJ.upperArm; a.foreArm = NEW_ADJ.foreArm; }
  return true;
}
// 関節の間の長さ・頭：置いたパーツの数値は変えず、表示と書き出しのときに掛ける（bodyparts.js の fitItem・jointsOf、headPlace）
const SEG_ADJ = [['neck', 'adjNeck'], ['headZ', 'adjHeadZ'], ['upperArm', 'adjUArm'], ['foreArm', 'adjFArm'], ['thigh', 'adjThigh'], ['shin', 'adjShin']];
function showAdj() {
  for (const [k, id] of [['up', 'adjUp'], ['sh', 'adjSh'], ['shY', 'adjShY'], ...SEG_ADJ]) { $('#' + id).value = Math.round(adj[k] * 100); $('#' + id + 'v').textContent = `${Math.round(adj[k] * 100)} cm`; }
  $('#adjHeadK').value = Math.round(adj.headK * 100); $('#adjHeadKv').textContent = `${Math.round(adj.headK * 100)} %`;
}
for (const [k, id] of SEG_ADJ) $('#' + id).oninput = () => { adj[k] = +$('#' + id).value / 100; showAdj(); rebuild(); save(); };
$('#adjHeadK').oninput = () => { adj.headK = +$('#adjHeadK').value / 100; showAdj(); rebuild(); save(); };
$('#bAdjReset').onclick = () => { for (const [k] of SEG_ADJ) adj[k] = 0; adj.headK = 1; showAdj(); rebuild(); save(); };
/** 上半身の上下・肩の左右・肩の高さを v にする：前の値との差だけ、置いた部品を動かす */
function moveAdj(k, v) {
  const d = v - adj[k];
  adj[k] = v;
  for (const it of items) {
    if (!withUpper(it.part)) continue;
    const sh = followsShoulder(byId[it.part]);
    if (k === 'up') it.mov[1] = round(it.mov[1] + d, 4);
    else if (k === 'shY' && sh) it.mov[1] = round(it.mov[1] + d, 4);
    else if (k === 'sh' && sh) it.mov[0] = round(it.mov[0] + Math.sign(it.mov[0] || 1) * d, 4);
  }
}
for (const [k, id] of [['up', 'adjUp'], ['sh', 'adjSh'], ['shY', 'adjShY']]) $('#' + id).oninput = () => { moveAdj(k, +$('#' + id).value / 100); showAdj(); rebuild(); save(); };
/**
 * 体型の雛形：ゲームの XS の関節の位置に合わせる（テスターの声 2026-11-21「ニャーノの肩の位置は今の寸法の調整で設定できる位置よりも下にある」、依頼主「対応してあげて」）。
 * ニャーノ（GIO の支援機。ゲームの形は機体エディタの部品でできた「自由な機体」1 つで、カタログの骨格と違う）の関節を、ゲームの模型
 * public/models/b_support_04.glb の骨の位置で測った値（エディタの単位。足の裏が 0、全高 3.01）[独自: 測った値]：
 *   肩 x 0.50・y 2.199、首の付け根（head）y 2.199、ひざ y 1.059、足首 y 0.309、股関節 y 1.434、ひじ 1.769、右手 1.394。
 * 脚・腕の長さは、カタログの骨格でその位置になる値（npx tsx out/nyano/probe.ts で書き出して確かめた：太もも −5・すね −12 で ひざの下の軸 0.89〜上の軸 1.10・股関節 1.43、
 * 上腕 −17・前腕 −12 で 肩→ひじ 0.43・ひじ→手 0.37）。肩と首は、その長さにしてから今の機体の肩関節・首の位置を測って、差だけ動かす
 * （肩関節は jointsOf と同じ所、首はゲーム用の書き出しの頭の骨と同じ所：neckBaseY）。
 * 合わせられない所：股の幅（ニャーノ 0.27・カタログ 0.175）、腕・脚が外へ開く角度（ニャーノのひじ・足首は肩・股関節より外）、腹の回る中心（ニャーノ 1.40・カタログ 2.0）
 */
const BODY_TYPES = { nyano: { thigh: -0.05, shin: -0.12, upperArm: -0.17, foreArm: -0.12, shoulder: [0.5, 2.199], neckBase: 2.199 } };
/** 首の付け根の高さ（表示している形で。脚の長さで体が上がった分も入る）。ゲーム用の書き出しの頭の骨と同じ決め方（xsengine.js jointPositions）：
 *  頭の回る中心のブロック（回転の中心が「頭」か、名前が「首」。カタログの首では「段」）があればその中心、無ければ頭のパーツのいちばん下。頭が無ければ null */
function neckBaseY() {
  root.updateMatrixWorld(true);
  const neck = new THREE.Box3(), all = new THREE.Box3();
  const pivotHead = pc => pc.pivot === 'head' || ((!pc.pivot || pc.pivot === 'auto') && pc.name === '首');
  items.forEach((it, i) => { if (!groups[i]) return; groups[i].traverse(o => { if (!o.isMesh || !o.userData.pc) return; if (isHead(it.part)) all.expandByObject(o); if (pivotHead(o.userData.pc)) neck.expandByObject(o); }); });
  return !neck.isEmpty() ? (neck.min.y + neck.max.y) / 2 : all.isEmpty() ? null : all.min.y;
}
function applyBodyType(T) {
  for (const k of ['thigh', 'shin', 'upperArm', 'foreArm']) adj[k] = T[k];
  const lift = adj.thigh + adj.shin, J = jointsOf(items, adj).arm_l;
  moveAdj('sh', round(adj.sh + T.shoulder[0] - Math.abs(J[0]), 4));
  moveAdj('shY', round(adj.shY + T.shoulder[1] - lift - J[1], 4));
  rebuild();
  const y = neckBaseY();
  if (y !== null) { adj.neck = round(adj.neck + T.neckBase - y, 4); rebuild(); }
  showAdj(); save();
}
$('#bBodyNyano').onclick = () => applyBodyType(BODY_TYPES.nyano);

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
/** 武器の飾りを置く（issue #265）：いくつでも。握る所を背中の右寄りに、骨は胴（銃身は下を向く）。そこから「付ける骨」とつまみで好きな所へ。
 *  手に持つ武器とは別のもの：持っている武器は入れ替えない */
function placeDeco(def) {
  const at = [0.12, round(S.neck.y - 0.12 + adj.up, 4), round(-S.chest.hd - 0.06, 4)];
  const same = m => items.some(it => it.part === def.id && Math.abs(it.mov[0] - m[0]) < 1e-6 && Math.abs(it.mov[1] - m[1]) < 1e-6 && Math.abs(it.mov[2] - m[2]) < 1e-6);
  for (let k = 0; k < 20 && same(at); k++) at[1] = round(at[1] - 0.04, 4);
  addItems([{ part: def.id, bone: 'torso', mov: at, rot: [0, 0, 0], scal: [1, 1, 1] }]);
}
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
  } else {
    // 脚・背中のタブの自由なパーツ（キャタピラの車体・大砲）：同じ部位のものと入れ替える。キャタピラの車体は脚そのものなので、置いてある脚の部品も外す
    if (def.tab && !addOnly && !addMore()) { dropSameCat(def); if (def.cat === TRACK_CAT) { const n = items.length; items = items.filter(it => !(halfOf(it.part) === 'leg' && !byId[it.part]?.free)); if (items.length !== n) selected = -1; } }
    addItems([{ part: def.id, mov: [0, 0, 0], rot: [0, 0, 0], scal: [1, 1, 1] }]);
  }
}
function place(def) {
  if (busy()) return;
  if (def.jet) { addJet(def); return; }   // 噴射口（背中のタブ）：胴の後ろへ 1 つ（「噴射口」の欄の「＋ 噴射口を足す」と同じ）。形を直した「噴射口（改）」はそれを置く（issue 1162）
  if (def.deco) { placeDeco(def); return; }
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
  if (!isMulti(def) && !grp && !addOnly && !addMore()) dropSameCat(def);   // （背中の入れ替えは上で済んでいる）
  if (halfOf(def.id) === 'leg' && !addOnly && !addMore()) { const n = items.length; items = items.filter(it => byId[it.part]?.cat !== TRACK_CAT); if (items.length !== n) selected = -1; }   // 脚の部品を置いたら、キャタピラの車体は外す
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
/** 形が読み込まれた：その形を使うカタログのボタンの絵を描き直す（ゲームの武器の模型 issue 1101 など、絵を描いた時にまだ形が無かった物は空の絵だった） */
function redrawThumbs(meshId) {
  for (const def of FREE) {
    if (!def.pieces.some(pc => pc.mesh === meshId)) continue;
    const cv = catButtons.get(def.id)?.querySelector('canvas');
    if (cv?.isConnected) try { thumbnail(def, cv); } catch (e) { console.warn('thumbnail', def.id, e); }
  }
}
// 左のタブ：部位ごとにカタログを出す
const TABS = [['head', '頭', HEAD], ['upper', '上半身', UPPER], ['back', '背中', BACK], ['arm', '腕', ARM], ['lower', '下半身', LOWER], ['leg', '脚', LEG], ['weapon', '武器', []], ['free', '取り込み', []]];
/** そのタブに並べるパーツ：頭のタブには「頭まるごと」（機体エディタの機体から取り出した頭）、取り込みのタブには自由な機体 */
// 脚のタブには自由なパーツの「キャタピラの車体」、背中のタブには「大砲」も（目次に入っていたのに、どのタブにも出ていなかった。issue #185）
const tabList = (half, list) => (half === 'head' ? [...list.filter(d => !d.retired), ...FREE.filter(d => d.tab === 'head')] : half === 'weapon' ? [...FREE.filter(d => d.tab === 'weapon'), ...DECO] : half === 'free' ? FREE.filter(d => !d.tab) : [...list, ...(half === 'back' ? [JET] : []), ...FREE.filter(d => d.tab === half)]);
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
      const wb = document.createElement('div'); wb.className = 'wbench'; wb.style.cssText = 'margin-top:8px;padding:6px 8px;border:1px solid var(--line, #3a3f48);border-radius:6px;display:flex;flex-direction:column;gap:4px'; sec.appendChild(wb); bench?.mount(wb);
      const top = document.createElement('div'); top.className = 'hint'; top.style.marginTop = '8px';
      top.innerHTML = '右手に持つ武器。押すと持つ（今の武器と入れ替わる）。腕の長さや手を変えても、手に付いていく。「直す」でパーツエディタ。<br>ブロックの名前で、ゲームでの扱いが決まる：「ライフル」「銃」「マガジン」「マズル」＝銃（格闘・投げる間は隠れる）、「バズーカ」＝バズーカ（選んだときだけ出る）、「マズル」「銃口」＝弾の出る所。<br>機体が武器を持っていなければ、書き出すときに陣営の強襲の 1 式を持たせる。<div class="row" style="margin-top:6px"><button class="small" id="bNewWeapon" style="flex:1">新しい武器を作る</button></div>腕を下ろした姿勢では、銃は下を向く（腕を前へ上げると前を向く）。<br>下の「武器の飾り」は、同じ武器の形を見た目だけの部品として足す（いくつでも。腰・背中・腕など好きな骨に付けて、動かす・回す・大きさを変える。撃つ所・強さは変わらない）。';
      sec.appendChild(top);
      top.querySelector('#bNewWeapon').onclick = newWeapon;
    }
    if (half === 'free' && !list.length) sec.innerHTML = '<div class="hint" style="margin-top:8px">機体エディタ（1）の形式の機体を開くと、ここに並ぶ。「開く」→「機体エディタ 1 に残っているもの」か、ファイルから</div>';
    for (const cat of [...new Set(list.map(p => p.cat))]) {
      const h = document.createElement('h2'); h.innerHTML = `${cat}<i>${cat === '頭まるごと' ? '押すと、今の頭と入れ替わる' : cat === WEAPON_CAT ? '押すと、右手に持つ（今の武器と入れ替わる）' : cat === DECO_CAT ? 'いくつでも。見た目だけ（撃てない・当たりも強さも変わらない）。押すと背中に足す。「付ける骨」とつまみで好きな所へ' : cat === '自由な機体' ? '押すと、今の機体に足して置く' : isMulti({ cat }) ? 'いくつでも（押すと増える）' : cat === TRACK_CAT ? '1 つ（押すと脚と入れ替わる）' : '<span class="oneLabel">1 つ（押すと入れ替わる）</span>'}</i>`; sec.appendChild(h);
      const grid = document.createElement('div'); grid.className = 'cat'; sec.appendChild(grid);
      for (const def of list.filter(p => p.cat === cat)) {
        const b = document.createElement('button');
        const cv = document.createElement('canvas'); b.appendChild(cv);
        const s = document.createElement('span'); s.textContent = (def.user ? '★ ' : '') + def.name; b.appendChild(s);
        b.title = def.name + (placeOf(def).pair ? '（左右の対）' : '');
        b.onclick = () => place(def);
        // 自分のパーツ（★）：カタログから直接、直す・複製・消す（機体に置かなくてもできる）
        if (def.user && !def.deco) {   // （武器の飾りは、元の武器を直す・消すと一緒に変わる）
          const ops = document.createElement('span'); ops.className = 'ops';
          ops.innerHTML = '<span class="edit" title="このパーツをパーツエディタで開いて直す">直す</span><span class="dup" title="このパーツの写しを、カタログの同じ部位に ★ 付きで作る（元のパーツは変わらない。写しを「直す」で派生品にする）">複製</span><span class="del" title="このパーツをカタログから消す">消す</span>';
          ops.querySelector('.edit').onclick = e => { e.stopPropagation(); if (busy()) return; selected = -1; gizmo.detach(); PE.startDef(def); };
          ops.querySelector('.dup').onclick = e => { e.stopPropagation(); dupUserPart(def); };
          ops.querySelector('.del').onclick = e => { e.stopPropagation(); dropUserPart(def); };
          b.appendChild(ops);
        }
        grid.appendChild(b);
        catButtons.set(def.id, b);
        try { thumbnail(def, cv); } catch (e) { console.warn('thumbnail', def.id, e); }
      }
    }
  }  addMoreLabel();
}
{
  const box = $('#addMore');
  try { box.checked = localStorage.getItem(ADD_MORE_KEY) === '1'; } catch { /* storage blocked */ }
  const label = () => { for (const el of document.querySelectorAll('#catalog .oneLabel')) el.textContent = box.checked ? '1 つ（入れ替えずに足す）' : '1 つ（押すと入れ替わる）'; };
  box.onchange = () => { try { localStorage.setItem(ADD_MORE_KEY, box.checked ? '1' : '0'); } catch { /* storage blocked */ } label(); };
  addMoreLabel = label;
}
function markCatalog() { for (const [id, b] of catButtons) b.classList.toggle('on', items.some(it => it.part === id)); }

// ---- 保存・元に戻す（Ctrl+Z）・やり直す（Ctrl+Y）・読み込み・書き出し ----
const hist = [];
let histPos = -1, histAt = 0;
// 保存・元に戻すの記録には、仮に置いたもの（新しく作っているパーツ）を入れない：機体は、パーツを作っている間も開く前のまま
const kept = () => items.filter(it => !it.tmp);
/** 機体が自分の武器を持っている（書き出す・調べる時に見本の銃とバズーカを持たせない）：手の武器の名前の部品のある自由なパーツ、または機体の模型に入る
 *  「武器」のタブの武器（def.shape の無い物。名前に「銃」の無い斧なども：issue 1047。2026-11-21 までは部品の名前だけで決め、見本の銃と重ねて書き出していた） */
const ownsWeapon = () => kept().some(it => { const d = byId[it.part]; return !!d?.free && ((d.tab === 'weapon' && !d.shape) || d.pieces.some(pc => !pc.blockout && isHeldPart(pc))); });
function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify({ items: kept(), adj, paint, name: unitName, saveId, savedHash })); } catch { /* storage blocked */ } }
function save() {
  if (addOnly) return;   // 仮に置いている途中（まだ印が付いていない）は記録しない
  jointsNow();   // （ジョイントにつながったパーツの形態のずれを、今の置き方から計算し直す：issue 1225）
  persist();
  const snap = JSON.stringify({ items: kept(), paint, adj });
  if (hist[histPos] === snap) return;
  const now = Date.now();
  if (now - histAt < 400 && histPos >= 0) hist[histPos] = snap;
  else { hist.length = histPos + 1; hist.push(snap); histPos = hist.length - 1; if (hist.length > 100) { hist.shift(); histPos--; } }
  histAt = now;
  showUnitName();
  jetCountSoon();
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
function load() { try { const d = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null'); if (d && Array.isArray(d.items)) { items = register(d.items).filter(it => byId[it.part] && !it.tmp); adj = { ...ADJ0, ...(d.adj ?? {}) }; toNewBody(items, adj); unitName = d.name ?? ''; saveId = d.saveId ?? ''; savedHash = d.savedHash ?? ''; if (d.paint?.pal) { paint = d.paint; const same = savedHash && (() => { try { return savedHash === docHash(); } catch { return false; } })(); paint = loadPaint(d.paint); if (same) savedHash = docHash(); /* 足した色の枠で埋めただけなら、保存した時のままと見る */ } return true; } } catch { /* storage blocked */ } return false; }
/** 上半身・腕の見本・ランダムの部品を、今の寸法の調整の位置へずらす */
const adjusted = list => list.map(it => {
  const sh = followsShoulder(byId[it.part]), m = (it.mov ?? [0, 0, 0]).slice();
  m[1] += adj.up + (sh ? adj.shY : 0); if (sh) m[0] += Math.sign(m[0] || 1) * adj.sh;
  return { ...it, mov: m };
});
const tidy = list => register(list).filter(it => byId[it.part]).map(it => ({ part: it.part, name: it.name, ...(it.gen ? { gen: it.gen } : {}), ...(it.tilt != null ? { tilt: it.tilt } : {}), ...(it.bone ? { bone: it.bone } : {}), ...(it.grp ? { grp: it.grp } : {}), ...(it.purge ? { purge: true } : {}), ...(it.roman ? { roman: { s: it.roman.s, m: it.roman.m } } : {}), ...(it.forms ? { forms: it.forms } : {}), ...(formDelayOf(it) ? { formDelay: formDelayOf(it) } : {}), ...(it.joint ? { joint: it.joint } : {}), ...(it.jt ? { jt: it.jt } : {}), mov: it.mov ?? [0, 0, 0], rot: it.rot ?? [0, 0, 0], scal: it.scal ?? [1, 1, 1] }));
$('#bApply').onclick = () => {
  try {
    const d = JSON.parse($('#paste').value.trim());
    const list = Array.isArray(d) ? d : d.items;
    if (!Array.isArray(list)) throw new Error('機体の JSON の形が違います');
    if (busy()) return;
    adoptUserParts(d); registerUnit(d); for (const def of Object.values(d.userParts ?? {})) if (def?.id && byId[def.id] === def) userParts[def.id] = def;
    persistUser(); renderCatalog();
    // 部位だけの JSON（half 付き）：その部位だけを入れ替える。色・寸法の調整は今のまま
    if (d.half) { replaceHalf(d.half, list.filter(it => halfOf(it.part) === d.half)); note(`${HALF_NAME[d.half] ?? d.half}だけ入れ替えました`); return; }
    if (d.adj) adj = { ...adj, std: 0, ...d.adj };
    if (d.paint?.pal) { paint = loadPaint(d.paint); showPaint(); }
    items = tidy(list); const fixed = d.adj && toNewBody(items, adj); showAdj(); selected = -1; rebuild(); save(); note(fixed ? '読みました。前の頭身の機体なので、新しい頭身（上半身を腰の帯に載せる）に直しました' : '読みました（保存した機体としては、まだ保存していません）');
  } catch (e) { note('読めません：' + e.message, true); }
};
/** 機体の全部：置いたパーツ・寸法の調整・塗りと、使っている自分のパーツ（ほかのブラウザ・道具でも読めるように） */
const usedUser = list => Object.fromEntries(Object.entries(userParts).filter(([id]) => list.some(it => it.part === id || byId[it.part]?.src === id)));   // （武器の飾りは、元の自分の武器を持っていく：読んだ側で飾りが作られる）
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
$('#bNew').onclick = () => { if (busy() || !okToLeave('新しく始めます')) return; resetForms(); unitName = ''; saveId = ''; savedHash = ''; items = []; paint = DEFAULT_PAINT(); showPaint(); adj = { ...NEW_ADJ }; showAdj(); selected = -1; rebuild(); save(); };
$('#bRandom').onclick = () => { if (busy()) return; adj = { ...NEW_ADJ }; showAdj(); items = tidy([...randomHeadV2(), ...randomLower(), ...adjusted(randomUpper()), ...adjusted(randomBack()), ...adjusted(randomArm()), ...randomLeg()]); selected = -1; rebuild(); save(); fitKneeGuards(); };
$('#bKneeFit').onclick = fitKneeGuards;
/** その部分だけ入れ替える */
const replaceHalf = (half, list, fit = true) => { if (busy()) return; items = [...items.filter(it => halfOf(it.part) !== half || isJet(it) || it.bone === 'shield'), ...tidy(list)]; selected = -1; rebuild(); save(); if (fit && (half === 'leg' || half === 'lower')) fitKneeGuards(); };
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
  // ひざ当ての角度（tilt）を持っている見本は、置かれていた角度のままにする（前スカートに合わせて倒し直さない）
  replaceHalf(half, withUpper(list[0]?.part) ? adjusted(list) : list, !list.some(it => it.tilt != null));
};

// ---- 自分のパーツ（形を直した写し・新しく作ったパーツ）。このブラウザに残し、カタログの同じ部位に ★ 付きで並ぶ ----
// def = カタログのパーツと同じ形に { user: true, half, base } を足したもの。id は u· で始まる（頭は h·u·）
// 置き場は IndexedDB（v2-store.js の 'userparts'。前は localStorage の xsv2.userparts：艦 1 隻で 0.66 MB あり、数隻で入らなくなった）
const userParts = {};
function persistUser() { if (SKIN_MODEL) return; Store.set(USER_KEY, JSON.stringify(userParts)).then(ok => { if (!ok) note('自分のパーツを保存できませんでした（ブラウザの保存の容量）', true); }); }
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
// ---- 形態（変形の見た目、issue #145。v2-forms.js）：右の「形態」と、パーツエディタの「形態」で切り替える。書き出す形・チェック・小さな絵は形態 1 ----
let formNow = 1, formAdded = 1, formAnim = null;   // formAdded：「＋」で足した数（ブロックに書くまでは数に入らないので）
const formCount = () => Math.min(FORM_MAX, Math.max(formAdded, formsUsed(kept().map(it => byId[it.part])), itemFormsUsed(kept()), paintFormsUsed(paint)));
const formRoots = () => groups.flatMap(g => [g, ...g.userData.extra.values()]);
/** メッシュ o の、塗りのとおりの材質（形態で色を変える時は、この写しに色を入れる） */
function formMat(o) { return o.userData.meshPart ? o.userData.fb?.m ?? o.material : o.userData.pc.blockout && o.userData.def?.free ? draftMat : material(o.userData.pc, o.userData.def); }
/** メッシュ o の形態 n の不透明度（塗りの役の形態ごとの透明度、issue #863。塗らないメッシュは形態で変わらないので -1） */
function formOp(o, n) {
  const pc = o.userData.pc, def = o.userData.def;
  if (o.userData.meshPart || (pc.blockout && def?.free) || ((def?.free || def?.deco) && !pc.role)) return -1;
  return opacityAt(pc, paint, n);
}
function showFormNow() {
  const v = formView();
  // （置いたパーツごとに、その遅れを引いた途中の見た目：issue #813）
  groups.forEach((g, i) => showForms([g, ...g.userData.extra.values()], v.from, v.to, (v.el - formDelayOf(items[i])) / FORM_MS, formMat, formOp));
  placeItemForms(v);
}
/** 置いたパーツの形態（item.forms）を、形態の途中 v（null は形態 1）の置き方にする */
function placeItemForms(v) {
  itemView = v;
  groups.forEach((g, i) => { if (items[i] && (items[i].forms || g.userData.fdelta)) applyToGroup(items[i], g); });
}
/** 今の形態の途中：{ from, to, el（移り始めてからのミリ秒） }。「変形の途中」のつまみ（formScrub）を動かしている間は、形態 1 → 見ている形態のその時 */
function formView() {
  if (formScrub != null) return { from: 1, to: scrubTo(), el: formScrub * formSpan() };
  return formAnim ? { from: formAnim.from, to: formAnim.to, el: performance.now() - formAnim.t0 } : { from: formNow, to: formNow, el: Infinity };
}
const formSpan = () => formSpanOf(items, it => byId[it.part]);
/** 「変形の途中」のつまみの行き先：見ている形態（形態 1 の時は形態 2） */
const scrubTo = () => (formNow > 1 ? formNow : Math.min(2, formCount()));
// ---- 変形の種類と、変形の途中を見る（issue 1036、v2-forms.js FORM_KIND）----
// formScrub：「変形の途中」のつまみ（0〜1、null は動かしていない）。gameTilt：空を飛ぶ形を、ゲームと同じに前へ倒して見る
let formScrub = null, gameTilt = true, tiltMid = 0;
/** 形態の途中 v での、空を飛ぶ形への倒れ（0 立った〜1 腹ばい）。ゲームは模型の変形と同じ間に倒れる（world.ts の tiltP）。
 *  倒さない空を飛ぶ形（'flyUp'、issue 1201）は倒れない（0） */
function flyK(v) {
  const a = formKindOf(adj, v.from) === 'fly' ? 1 : 0, b = formKindOf(adj, v.to) === 'fly' ? 1 : 0;
  if (a === b) return a;
  return a + (b - a) * Math.min(1, Math.max(0, v.el / formSpan()));
}
/** 描く前に倒す（倒した時 true）。体の真ん中は、立った形の足の裏から頭の上までの半分（ゲームは RULES.unitHeight / 2） */
function tiltForView() {
  if (!gameTilt || shipNow || PE.active() || !adj.formKind) return false;
  const k = flyK(formView());
  if (k <= 0) { tiltMid = 0; return false; }   // （立った形に戻った：次に倒す時、今の形の高さを測り直す）
  if (!tiltMid) { root.updateMatrixWorld(true); const b = new THREE.Box3().setFromObject(root); tiltMid = b.isEmpty() ? 1 : Math.max(0.1, b.max.y / 2); }
  const t = flyTilt(k, tiltMid);
  flyGroup.rotation.x = t.rx; flyGroup.position.set(0, t.y, t.z); flyGroup.updateMatrixWorld(true);
  return true;
}
function untilt() { flyGroup.rotation.x = 0; flyGroup.position.set(0, 0, 0); flyGroup.updateMatrixWorld(true); }
/** 変形の種類・ゲームの向きで見る・変形の途中のつまみ（形態が 2 つからの時） */
function fillFormKind(n) {
  const box = $('#formKind'); if (!box) return;
  if (n < 2) { box.innerHTML = ''; return; }
  const kinds = Array.from({ length: n - 1 }, (_, i) => i + 2).map(f => {
    const k = formKindOf(adj, f) ?? '';
    return `<div class="row"><label style="width:auto">形態 ${f} の種類</label><select data-fkind="${f}"><option value="" ${k ? '' : 'selected'}>種類なし（見た目だけ）</option>${Object.entries(FORM_KIND).map(([v, t]) => `<option value="${v}" ${k === v ? 'selected' : ''}>${t}</option>`).join('')}</select></div>`;
  }).join('');
  const span = formSpan() / 1000, to = scrubTo(), t = formScrub ?? 1;
  const warn = isFlyKind(formKindOf(adj, 2)) && !formWhenOf(adj).includes('sys') ? '<div class="hint warn">形態 2 が空を飛ぶ形なのに、下の「ゲームで形態 2 になる時」に「特殊システムの間（…飛行形態の間）」が入っていない：ゲームの飛行形態でこの姿にならない</div>' : '';
  box.innerHTML = '<div class="hint" style="margin-top:6px"><b>変形の種類</b>（空を飛ぶ形の形態 2 は、ゲームの変形できる XS の自分のスキンで、飛行形態の姿になる。ゲームは模型ごと体の真ん中を軸に前へ倒すので、空を飛ぶ形は立ったまま作る：脚をそろえて下へ、腕は頭の上へ、翼を広げる、など。「体を倒さない」の方は、ゲームでも倒さず、作った形の向きのまま飛ぶ。地上を走る形は、ゲームではまだ使わない）</div>'
    + kinds + warn
    + `<label class="chk"><input type="checkbox" id="formTilt" ${gameTilt ? 'checked' : ''}>空を飛ぶ形を、ゲームの向きで見る（体の真ん中を軸に前へ倒す。見た目だけで、置き方のデータは立った形のまま。「体を倒さない」の形は倒さない）</label>`
    + `<div class="row"><label style="width:auto">変形の途中</label><input type="range" id="formScrub" min="0" max="1000" value="${Math.round(t * 1000)}"><span id="formScrubV" class="hint">${formScrub == null ? '' : `${(t * span).toFixed(2)} / ${span.toFixed(2)} 秒`}</span></div>`
    + `<div class="bar"><button class="small" id="bFormPlay" title="形態 1 から形態 ${to} へ、ゲームと同じ速さで動かして見る">形態 1 → ${to} を動かして見る</button></div>`;
  for (const el of box.querySelectorAll('[data-fkind]')) el.onchange = () => {
    setFormKind(adj, +el.dataset.fkind, el.value || null); tiltMid = 0; save(); fillFormKind(formCount());
    note(el.value ? `形態 ${el.dataset.fkind}：${FORM_KIND[el.value]}。次に「ゲーム用に書き出す」・みんなの機体からスキンにすると模型に入る` : `形態 ${el.dataset.fkind}：種類なし`);
  };
  $('#formTilt').onchange = () => { gameTilt = $('#formTilt').checked; };
  $('#formScrub').oninput = () => {
    formAnim = null; formScrub = +$('#formScrub').value / 1000;
    $('#formScrubV').textContent = `形態 1 → ${scrubTo()}：${(formScrub * span).toFixed(2)} / ${span.toFixed(2)} 秒`;
    showFormNow();
  };
  $('#bFormPlay').onclick = () => { formScrub = null; const n2 = scrubTo(); formNow = 1; formAnim = null; switchForm(n2); };
}
function switchForm(n) {
  n = Math.max(1, Math.min(formCount(), n));
  if (formScrub != null) { formScrub = null; formAnim = null; if (n === formNow) { showFormNow(); renderForms(); return; } }
  if (n === formNow && !formAnim) return;

  formAnim = { from: formNow, to: n, t0: performance.now() }; formNow = n;
  renderForms(); showPaint();   // （色の欄の透明度は、今の形態の値）
  // （「武器を作る」の欄の「点（形態 n）」と点の印も、今の形態の物に描き直す：前は機体を組み直すまで前の形態のまま、issue 1051。パーツエディタの間は描かない：rebuild と同じ）
  if (!PE.active()) bench?.afterRebuild();
}
function addForm() { if (formCount() >= FORM_MAX) return; formAdded = formCount() + 1; switchForm(formAdded); }
// 形態を消す（issue 1277、Wijick さん 2026-11-28 #色々なツールへの要望「使わない形態・間違って増やした形態を消せるようにしたい」）：
// 今見ている形態 n（2 から。形態 1 はゲームに書き出す形なので消せない）を消し、後ろの形態を 1 つずつ前へ詰める（形態 3 が形態 2 に）。
// 消す物：置いたパーツの形態（item.forms）・ジョイントの値（joint.v）・この機体で使っている自分のパーツのブロックの形態（pc.forms）と
// 武器の点（def.wpts）・塗りの形態ごとの透明度（paint.formAlpha）・変形の種類（adj.formKind）。「ゲームで形態 2 になる時」（adj.formWhen）は
// 形態の番号でなく「形態 2」の決まりなので、そのまま（詰めて形態 2 になった物に効く）。自分のパーツはカタログの物を書き換えるので、
// ほかの機体でも同じパーツを使っていれば、その形態も消える（パーツエディタでブロックの形態を変えた時と同じ）
function removeForm(n = formNow) {
  const N = formCount();
  if (n < 2 || n > N) return false;
  if (PE.active()) { note('パーツエディタを閉じてから、形態を消してください', true); return false; }
  const list = kept(), defs = new Set();
  for (const it of list) for (const d of [byId[it.part], byId[byId[it.part]?.src]]) if (d && userParts[d.id] === d) defs.add(d);
  const shared = [...defs].filter(d => d.pieces?.some(pc => pc.forms?.[n]));
  if (!confirm(`形態 ${n} を消します。${n < N ? `\n形態 ${n + 1}${n + 1 < N ? `〜${N}` : ''} は 1 つずつ前へ詰まります（形態 ${n + 1} が形態 ${n} に）。` : ''}`
    + (shared.length ? `\n自分のパーツ ${shared.map(d => `「${d.name}」`).join('')} のブロックの形態 ${n} も消えます（ほかの機体で同じパーツを使っていれば、そちらからも消えます）。` : '')
    + '\n（↶ 戻すで取り戻せます。自分のパーツのブロックの形態は戻りません）')) return false;
  for (const it of list) { dropFormIn(it, 'forms', n); for (const j of jointsOn(it)) dropFormIn(j, 'v', n); }
  let userTouched = false;
  for (const d of defs) {
    for (const pc of d.pieces ?? []) { if (dropFormIn(pc, 'forms', n)) userTouched = true; for (const j of jointsOn(pc)) if (dropFormIn(j, 'v', n)) userTouched = true; }   // （ブロックのジョイントの値も：issue 1293）
    if (dropFormIn(d, 'wpts', n)) userTouched = true;
  }
  if (paint) dropFormIn(paint, 'formAlpha', n);
  dropFormIn(adj, 'formKind', n);
  if (userTouched) persistUser();
  formAdded = Math.max(1, Math.min(formAdded, N - 1));
  formNow = n - 1; formAnim = null; formScrub = null; tiltMid = 0;
  save(); rebuild(); renderForms(); showPaint(); showFormNow();
  note(`形態 ${n} を消しました（形態は ${formCount()} つ）`);
  return true;
}
function resetForms() { formNow = 1; formAdded = 1; formAnim = null; formScrub = null; tiltMid = 0; renderForms(); showPaint(); }
function renderForms() {
  const bar = $('#formBar'); if (!bar) return;
  const n = formCount();
  if (formNow > n) { formNow = n; formAnim = null; }   // （その形態を使うブロックが無くなった）
  bar.innerHTML = Array.from({ length: n }, (_, i) => `<button class="small ${i + 1 === formNow ? 'acc' : ''}" data-form="${i + 1}">形態 ${i + 1}</button>`).join('')
    + (n < FORM_MAX ? '<button class="small" id="bFormAdd" title="形態を 1 つ足す（パーツエディタでブロックを選び、右の「形態」で、この形態での見た目を決める）">＋ 形態を足す</button>' : '')
    + (formNow > 1 ? `<button class="small" id="bFormDel" title="今見ている形態 ${formNow} を消す（後ろの形態は 1 つずつ前へ詰まる。形態 1 は消せない）">− 形態 ${formNow} を消す</button>` : '');
  for (const b of bar.querySelectorAll('[data-form]')) b.onclick = () => switchForm(+b.dataset.form);
  if ($('#bFormAdd')) $('#bFormAdd').onclick = addForm;
  if ($('#bFormDel')) $('#bFormDel').onclick = () => removeForm(formNow);
  fillFormWhen(n);
  fillFormKind(n);
  fillItemForm();
  fillJoint();
}
// ゲームで形態 2 になる時（ポッチャさん 2026-11-20「形態変形状態をチャージ時、特殊システム発動、迫撃砲使用時などの条件が欲しい」、v2-forms.js FORM_WHEN）：
// 形態が 2 つからの時に出す。選んだどれか 1 つでも当てはまる間、ゲームの自分のスキンが形態 2 になる。adj.formWhen に持つ
function fillFormWhen(n) {
  const box = $('#formWhen'); if (!box) return;
  if (n < 2) { box.innerHTML = ''; return; }
  const on = new Set(formWhenOf(adj));
  box.innerHTML = '<div class="hint" style="margin-top:6px"><b>ゲームで形態 2 になる時</b>（自分のスキンで。選んだどれか 1 つでも当てはまる間。何も選ばなければ、ゲームでは形態 1 のまま）</div>'
    + Object.entries(FORM_WHEN).map(([k, v]) => `<label class="chk"><input type="checkbox" data-fwhen="${k}" ${on.has(k) ? 'checked' : ''}>${v}</label>`).join('');
  for (const el of box.querySelectorAll('[data-fwhen]')) el.onchange = () => {
    const now = Object.keys(FORM_WHEN).filter(k => box.querySelector(`[data-fwhen="${k}"]`).checked);
    if (now.length === 1 && now[0] === 'sys') delete adj.formWhen; else adj.formWhen = now;   // （今までどおりの ['sys'] は書かない）
    save(); fillFormKind(formCount());
    note(now.length ? `ゲームで形態 2 になる時：${now.map(k => FORM_WHEN[k]).join('・')}。次に「ゲーム用に書き出す」・みんなの機体からスキンにすると入る` : 'ゲームでは形態 2 にならない（形態 1 のまま）');
  };
}
// ---- 置いたパーツ単体の形態（issue #810、テスター ポッチャさん「右枠のパーツ単体でも形態のエディットさせてほしい」）：
// 右の「置いたパーツ」で選んだパーツ（最後に選んだ 1 つ）の、今の形態でのパーツ全体の見た目（出す・消す、ずらす、回す）。item.forms（v2-forms.js itemFormDelta）
/** 左右反転の写し：形態も左右を返す */
function mirrorItem(it) { const m = mirrorOf(it); if (it.forms) m.forms = mirrorForms(it.forms); return dropJoint(m); }   // （写しはジョイントを外し、形態のずれだけ残す：issue 1225）
function fillItemForm() {
  const box = $('#itemForm'); if (!box) return;
  const it = selected >= 0 ? items[selected] : null;
  if (!it) { box.innerHTML = ''; return; }
  const n = formCount(), fN = formNow, fv = formOf(it, fN) ?? {}, p = fv.p ?? [0, 0, 0], r = fv.r ?? [0, 0, 0];
  const jointKid = jointParent(items, it) != null;   // （ジョイントにつながったパーツ：ずらす・回すはジョイントで決まる、issue 1225。付け根でもある時も：issue 1293）
  const jDelay = jointKid && jointById(items, it.jt)?.j?.delay != null;   // （遅れもジョイントで決まる：issue 1293）
  const seg = Array.from({ length: n }, (_, i) => `<button class="small ${i + 1 === fN ? 'acc' : ''}" data-iform="${i + 1}">形態 ${i + 1}</button>`).join('')
    + (n < FORM_MAX ? '<button class="small" id="bIFormAdd" title="形態を 1 つ足す">＋</button>' : '');
  // 移る時の遅れ（issue #813）：形態が 2 つからの時に出す。秒で見せ、ミリ秒で持つ（item.formDelay）
  const delay = n > 1
    ? `<div class="row one"><label>遅れ</label><input type="number" id="iFDelay" min="0" max="${FORM_DELAY_MAX / 1000}" step="0.05" value="${formDelayOf(it) / 1000}" ${jDelay ? 'disabled' : ''} title="形態を切り替えた時、このパーツが動き出すまでの秒（0〜${FORM_DELAY_MAX / 1000}）"><span class="hint" style="align-self:center">秒${jDelay ? `（ジョイント ${it.jt} の遅れで決まる）` : ''}</span></div>`
      + '<div class="hint one">遅れ：形態を切り替えた時、このパーツ（中のブロックの形態も）がこの秒数だけ待ってから動く。パーツごとに変えると、順に変形して見える。行きも帰りも同じ遅れ</div>'
    : '';
  box.innerHTML = `<div class="bar"><b style="font-size:12px;align-self:center">形態</b>${seg}</div>` + delay + (fN === 1
    ? '<div class="hint">形態 1 はいつもの置き方（ゲーム用に書き出す形）。形態 2 からを選ぶと、その形態でのこのパーツ全体の見た目（出す・消す、ずらす、回す）を決められる。ブロックごとに変えるのは、パーツエディタの「形態」</div>'
    : `<label class="chk"><input type="checkbox" id="iFHide" ${fv.hide ? 'checked' : ''}>形態 ${fN} では、このパーツを出さない</label>`
      + (isJet(it) ? `<label class="chk" title="この噴射口（炎の点）から、形態 ${fN} では炎を出さない。「噴射口」の欄の「炎の見本を出す」で見える。形態 1（ゲームに書き出す形）はいつも出す"><input type="checkbox" id="iFNoFlame" ${fv.noFlame ? 'checked' : ''}>形態 ${fN} では、炎を出さない</label>` : '')
      + (jointKid
        ? `<div class="hint one">形態 ${fN} のずらす・回すは、ジョイント ${it.jt} で決まります（下の「ジョイント」の欄）</div>`
        : `<div class="row one"><label>ずらす</label>${[0, 1, 2].map(a => `<input type="number" step="0.01" data-ifp="${a}" value="${p[a]}">`).join('')}</div>`
          + `<div class="row one"><label>回す</label>${[0, 1, 2].map(a => `<input type="number" step="5" data-ifr="${a}" value="${r[a]}">`).join('')}</div>`
          + '<div class="hint one">ずらす：左右・上下・前後（位置の欄と同じ向き）。回す：度、パーツの原点（つまみの出る所）で、パーツの向きの x・y・z の軸の回り。「反対側にも」で写すと左右を返す。つまみと位置・回転・拡大の欄は、形態 1 の置き方を動かす</div>'
          + `<div class="bar"><button class="small" id="bIFReset">形態 ${fN} を形態 1 と同じに戻す</button></div>`));
  for (const b of box.querySelectorAll('[data-iform]')) b.onclick = () => switchForm(+b.dataset.iform);
  if ($('#bIFormAdd')) $('#bIFormAdd').onclick = addForm;
  for (const r of box.querySelectorAll('.one')) r.hidden = picked.length > 1;   // （2 つ以上を選んでいる時は、上の「位置」「回転」でまとめて：issue 1190）
  if ($('#iFDelay')) $('#iFDelay').onchange = e => {
    const ms = formDelayOf({ formDelay: (+e.target.value || 0) * 1000 });
    if (ms) it.formDelay = ms; else delete it.formDelay;
    e.target.value = ms / 1000; save();
  };
  if (fN === 1) return;
  const set = change => { if (change) setForm(it, fN, change); else if (it.forms) { delete it.forms[fN]; if (!Object.keys(it.forms).length) delete it.forms; } showFormNow(); };
  const vec = k => [0, 1, 2].map(a => +box.querySelector(`[data-${k}="${a}"]`).value || 0);
  $('#iFHide').onchange = e => { set({ hide: e.target.checked || null }); save(); renderForms(); };
  if ($('#iFNoFlame')) $('#iFNoFlame').onchange = e => {
    set({ noFlame: e.target.checked || null }); save(); renderForms();
    if (!$('#jetFlameOn').checked) { $('#jetFlameOn').checked = true; note('炎の見本を出しました（「噴射口」の欄の「炎の見本を出す」）'); }
  };
  for (const el of box.querySelectorAll('[data-ifp],[data-ifr]')) { el.oninput = () => set({ p: vec('ifp'), r: vec('ifr') }); el.onchange = () => save(); }
  if ($('#bIFReset')) $('#bIFReset').onclick = () => { set(null); save(); renderForms(); };
}
// ---- 武器の口の試し撃ち（issue #144）：「武器の口」を選んだブロックの真ん中から、機体の前（+Z）へ短いビームを見せる。見た目だけ ----
const shotGeo = new THREE.CylinderGeometry(0.022, 0.022, 1, 10).rotateX(Math.PI / 2).translate(0, 0, 0.5);
let shots = [];
function testFire(only) {
  const at = [];
  for (const t of formRoots()) t.traverse(o => {
    if (!o.isMesh || !o.userData.pc?.mouth || (only && o.userData.pc !== only) || o.scale.x < 0.01) return;
    o.updateWorldMatrix(true, false);
    // （カタログ型のパーツは、ミラー・繰り返しの写しが 1 つのメッシュ：写しごとに）
    for (const g of o.userData.inst == null && !o.userData.meshPart ? instGeosOf(o.userData.def, o.userData.pc) : [o.geometry]) {
      if (!g.boundingBox) g.computeBoundingBox();
      at.push(g.boundingBox.getCenter(new THREE.Vector3()).applyMatrix4(o.matrixWorld));
    }
  });
  if (!at.length) { note(only ? '先にこのブロックの「武器の口」を選んでください' : '「武器の口」を選んだブロックがありません（パーツエディタでブロックを選び、右の「ゲーム用」の「武器の口」で選ぶ）', true); return; }
  const t0 = performance.now();
  for (const p of at) for (let k = 0; k < 3; k++) {
    const m = new THREE.Mesh(shotGeo, new THREE.MeshBasicMaterial({ color: 0x8cecff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.position.copy(p); m.scale.set(1, 1, 1e-3); m.renderOrder = 12; m.visible = false; scene.add(m);
    shots.push({ m, t0: t0 + k * 260 });
  }
  note(`${at.length} か所の武器の口から撃ちました（見た目だけ。ゲームでは、その種類の武器を撃つとここから出る）`);
}
function shotTick(now) {
  shots = shots.filter(({ m, t0 }) => {
    const t = (now - t0) / 420;
    if (t >= 1) { scene.remove(m); m.material.dispose(); return false; }
    m.visible = t >= 0;
    if (t >= 0) { m.scale.z = 1.8 * Math.min(1, t * 3); m.material.opacity = 0.95 * (1 - t); }
    return true;
  });
}
// ---- 炎の見本（issue #812、テスター ポッチャさん「噴射口のエフェクトも形態ごとにONOFFさせてほしい」）：「噴射口」の欄の「炎の見本を出す」で、
// 置いた噴射口・炎の点（jetshield.js の jet・jetpoint）の口から、噴く向き（−z）へ炎の形を出す。エディタの中だけ（書き出さない・小さな絵に写さない）。
// 置いたパーツの組の子なので、形態のずれ（ずらす・回す・出さない）と一緒に動き、形態ごとの「炎を出さない」（item.forms[n].noFlame、
// v2-forms.js itemFlame）で、形態を移る間に縮んで消える・伸びて出る。名前に「噴射口」の付いた部品からの炎は形が分かりにくいので出さない
// （「部品の噴射口も動かせるようにする」で炎の点にすれば出る）[独自]。形・色はゲームの炎に寄せた目安 [独自]
const FLAME_LEN = 0.5;   // 炎の長さ（拡大 1 のとき。口の半径 JET_R の約 8 倍）[独自]
const flameGeos = [[JET_R * 0.95, FLAME_LEN], [JET_R * 0.55, FLAME_LEN * 0.6]].map(([r, h]) => new THREE.ConeGeometry(r, h, 14, 1, true).rotateX(-Math.PI / 2).translate(0, 0, -h / 2));
const flameMats = [0xff8a3d, 0xfff1c4].map(c => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
let flamesHidden = false;   // （小さな絵を撮る間）
function flameOf(g) {
  if (g.userData.flame) return g.userData.flame;
  const f = new THREE.Group(); f.name = '炎の見本';
  for (let k = 0; k < 2; k++) { const m = new THREE.Mesh(flameGeos[k], flameMats[k]); m.renderOrder = 11; m.raycast = () => {}; f.add(m); }
  g.add(f); g.userData.flame = f;
  return f;
}
function flameTick(now) {
  const on = !flamesHidden && !!$('#jetFlameOn')?.checked;
  groups.forEach((g, i) => {
    if (!g) return;
    const it = items[i], k = on && isJet(it) ? itemFlame(it, viewOf(it)) : 0;   // （遅れのある噴射口は、その遅れの後で炎も移る：issue #813）
    if (!k && !g.userData.flame) return;
    const f = flameOf(g);
    f.visible = k > 0.01;
    if (f.visible) f.scale.set(k, k, k * (1 + 0.06 * Math.sin(now / 45 + i * 1.7)));   // （少し揺らす）
  });
}
/** パーツを直している間は、組み替えの操作を止める */
const busy = () => { if (!PE.active()) return false; note('パーツエディタを開いている間は、組み替えできません（「完了して機体へ戻る」か「やめる」で終わってから）', true); return true; };
const PE = initPartEdit({
  scene, camera, orbit, gizmo, canvas, byId, items: () => items, groups: () => groups, note, save: () => save(),
  rebuild: () => rebuild(), restPose: () => setPose([]),
  /** 形態（v2-forms.js）：今の形態・数・切り替える・足す・ブロックの見た目を変えた後にかけ直す。武器の口の試し撃ち */
  form: () => formNow, forms: () => formCount(), setForm: n => switchForm(n), addForm: () => addForm(), showForms: () => { renderForms(); showFormNow(); }, testFire: pc => testFire(pc), repaint: () => applyPaint(), refreshCatalog: () => renderCatalog(),
  colorOf: (pc, def) => (def?.free && !pc.role ? pc.color ?? '#c3c9d2' : colorOf(pc, def?.cat ?? '', paint)),   // （自由なパーツでも役を書いたブロックは塗りの色。issue 1021）
  /** パーツ def のブロックの形が変わった：置いてあるメッシュを新しい形に付け替える */
  regeo: def => {
    let redo = false, n = 0;
    for (const g of groups) for (const t of [g, ...g.userData.extra.values()]) t.traverse(o => { if (o.isMesh && o.userData.meshPart) { if (o.userData.def === def) { applyTf(o, o.userData.pc); keepBase(o); } return; } if (o.isMesh && o.userData.def === def) { n++; const ng = def.free || o.userData.inst != null ? instGeosOf(def, o.userData.pc)[o.userData.inst] : geoOf(def, o.userData.pc); if (!ng) redo = true; else if (o.geometry !== ng) o.geometry = ng; } });
    // 自由な部品：写しの数が変わった（ミラー・繰り返し）ら、置いたパーツを作り直す
    if (def.free && !redo) { const want = def.pieces.filter(drawn).reduce((a, pc) => a + instGeosOf(def, pc).length, 0) * items.filter(it => it.part === def.id).length; if (want !== n) redo = true; }
    if (redo) rebuild(); else showFormNow();
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
  /** パーツの部位を変える・ブロックを分ける（issue #870）：部位の選択肢と、変える処理（recatPart） */
  catOptions: sel => '<option value="">部位を選ぶ…</option>' + catOptions(sel), recat: (def, tplId, pick) => recatPart(def, tplId, pick),
  swapPart: (from, to) => { for (const it of items) if (it.part === from) it.part = to; },
  placeDef: def => placeNew(def),
  saveUserPart: def => { userParts[def.id] = def; persistUser(); },
  dropTmp: () => dropTmp(),
  removeUserPart: (id, dropItems) => { if (dropItems) { items = items.filter(it => it.part !== id); selected = -1; } unregisterUser(id); delete userParts[id]; persistUser(); },
});
$('#bEditPart').onclick = () => { if (selected >= 0 && !PE.active()) { const i = selected; picked = [i]; gizmo.detach(); PE.start(i); } };
/** 自分のパーツをカタログから消す（確かめてから）。機体に置いてあるものも外れる。保存した機体は、自分の中にそのパーツの写しを持っているので、開けばまた使える */
function dropUserPart(def) {
  if (busy()) return;
  const n = items.filter(it => it.part === def.id).length;
  if (!confirm(`自分のパーツ「${def.name}」をカタログから消します。${n ? `\n今の機体に置いてある ${n} 個も外れます。` : '\n今の機体には置いていません。'}`)) return;
  items = items.filter(it => it.part !== def.id); selected = -1; unregisterUser(def.id); delete userParts[def.id]; persistUser(); renderCatalog(); showTab(tab); rebuild(); save();
  note(`「${def.name}」をカタログから消しました`);
}
/** 自分のパーツを複製する（issue 1260）：写しを、カタログの同じ部位の新しい自分のパーツ（★）にする。元のパーツ・機体は変えない。
 *  名前は「元の名前（写し）」、もうあれば「（写し 2）」…（makeUserCopy の「（改）」のままだと、（改）の物を写すと同じ名前が並ぶ） */
function dupUserPart(def) {
  if (busy() || !def?.user) return;
  const c = makeUserCopy(def);
  const head = def.name, names = new Set(Object.values(byId).map(d => d?.name));
  c.name = `${head}（写し）`;
  for (let n = 2; names.has(c.name); n++) c.name = `${head}（写し ${n}）`;
  keepUser(c);
  note(`「${def.name}」の写し「${c.name}」を、カタログの「${c.cat}」に ★ 付きで作りました。元のパーツと機体は変えていません（写しの「直す」でパーツエディタ）`);
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
  $('#newPartSel').innerHTML = '<option value="">作る部位を選ぶ…</option>' + catOptions();
}
/** 部位の選択肢（部分ごとの組）。値はその部位のひな形のパーツの id。sel：選んでおく id */
function catOptions(sel = '') {
  return [['頭', HEAD], ['上半身', UPPER], ['背中', BACK], ['腕', ARM], ['下半身', LOWER], ['脚', LEG]].map(([title, list]) =>
    `<optgroup label="${title}">${[...new Set(list.map(d => d.cat))].map(cat => { const id = tplOf(list, cat, true).id; return `<option value="${id}" ${id === sel ? 'selected' : ''}>${cat}</option>`; }).join('')}</optgroup>`).join('');
}
/**
 * パーツ def の部位を変える・ブロックを分ける（issue #870。パーツエディタの「パーツの部位」）。tplId：変える先の部位のひな形（catOptions の値）。
 * pick：分けるブロックの番号（null は全部＝部位を変える）。変える先の部位の新しい自分のパーツを作って返す。
 * ・ブロックの付く骨・回転の中心・蝶番は、ひな形の最初のブロックのもの（新しく作るパーツと同じ：v2-partedit.js carry）。部位の骨に付くように
 * ・機体に置いてある所（def を使う置いたパーツごと）は、立った姿勢・形態 1 の世界の位置・向き・大きさのまま、新しい部位の骨の入れ物へ入れ直す
 *   （部位を変える：置いたパーツをそのまま付け替える。分ける：同じ所に新しいパーツを足し、元のパーツからはそのブロックを外す）
 * ・元のパーツはカタログから消さない。ほかに保存した機体は、自分の中にパーツの写しを持つので変わらない（registerUnit）
 */
function recatPart(def, tplId, pick = null) {
  const tpl = byId[tplId];
  if (!tpl || !def || def.free || def.deco) return null;
  const whole = !pick || pick.length >= def.pieces.length, take = whole ? def.pieces.map((_, i) => i) : [...new Set(pick)].sort((a, b) => a - b);
  // 立った姿勢・形態 1 で、今の置き方（世界の行列）を覚える
  setPose([]); formNow = 1; formAnim = null; renderForms(); rebuild();
  const at = [];
  items.forEach((it, i) => { if (it.part === def.id && !it.tmp && groups[i]) { groups[i].updateWorldMatrix(true, false); at.push({ i, W: groups[i].matrixWorld.clone() }); } });
  const nd = makeUserCopy(tpl, true), ref = tpl.pieces[0];
  nd.name = whole ? def.name : `${def.name}（分けた）`;
  nd.base = def.base ?? String(def.id).replace(/^h·/, '');   // （パーツエディタの「元：」は、ひな形ではなく元のパーツ）
  // （ブロックの並びは入れ替えずに中身を替える：頭のパーツは、頭の組み立ての目次の写しも同じ並びを指している：registerUser）
  nd.pieces.length = 0;
  nd.pieces.push(...take.map(k => { const pc = structuredClone(def.pieces[k]); for (const key of ['bone', 'pivot', 'hinge']) { if (ref?.[key] !== undefined) pc[key] = structuredClone(ref[key]); else delete pc[key]; } return pc; }));
  if (!whole) for (const k of [...take].reverse()) def.pieces.splice(k, 1);
  // 置いてあった所へ：まず仮の位置（腕・脚の左右は位置の x の向きで決まる）で入れ、骨の入れ物が決まってから世界の行列を入れ物の座標に直す
  const made = [];
  for (const { i, W } of at) {
    const old = items[i], { part, mov, rot, scal, bone, tmp, tilt, name, ...rest } = old, p = new THREE.Vector3().setFromMatrixPosition(W);
    const it = { ...rest, ...(whole && name ? { name } : {}), part: nd.id, mov: [p.x, p.y, p.z], rot: [0, 0, 0], scal: [1, 1, 1] };
    if (whole) { items[i] = it; made.push({ j: i, W }); } else { items.push(it); made.push({ j: items.length - 1, W }); }
  }
  rebuild();
  for (const { j, W } of made) {
    const g = groups[j]; if (!g?.parent) continue;
    g.parent.updateWorldMatrix(true, false);
    g.parent.matrixWorld.clone().invert().multiply(W).decompose(g.position, g.quaternion, g.scale);
    readBackFromGroup(items[j], g);
  }
  selected = -1;
  userParts[nd.id] = nd; userParts[def.id] = def; persistUser();
  rebuild(); save(); renderCatalog();
  return nd;
}
/** その部位のひな形：カタログの最初のパーツ。自分のパーツ（★）しか無い部位は、own なら自分のパーツの最初、でなければ無し。
 *  前は自分のパーツしか無い部位で undefined.id になり、起動の途中で落ちて 3D が真っ暗になった（テスター 静流りおさん 2026-11-08） */
function tplOf(list, cat, own) { return list.find(d => d.cat === cat && !d.user) ?? (own ? list.find(d => d.cat === cat) : undefined); }
const newPartReady = () => { $('#bNewPart').disabled = !$('#newPartSel').value; };
$('#newPartSel').onchange = newPartReady;
$('#bNewPart').onclick = () => { if (busy()) return; const t = byId[$('#newPartSel').value]; if (!t) return; selected = -1; gizmo.detach(); $('#newPartSel').value = ''; newPartReady(); PE.startNew(t); };

// ---- 塗り：役ごとの色（パレット）とビビッド。色を変えたら、置いてあるパーツの材質だけ付け替える（形は作り直さない） ----
function applyPaint() {
  for (const g of groups) for (const t of [g, ...g.userData.extra.values()]) t.traverse(o => { if (o.isMesh && o.userData.pc && !o.userData.meshPart) o.material = formMat(o); });
  showFormNow();
}
const ROLE_KEYS = Object.keys(ROLE_LABEL);
/** 役 r の、今の形態の透明度（%。塗りの alpha・formAlpha は不透明度。形態 2 からは paint.formAlpha、issue #863） */
const tpOf = r => Math.round((1 - roleAlphaAt(r, paint, formNow)) * 100);
function showPaint() {
  $('#paintTeam').checked = !!paint.team;
  const el = $('#paintBox'), row = r => `<div class="pal"><input type="color" data-role="${r}" value="${paint.pal[r]}"><span>${ROLE_LABEL[r]}</span><label title="「いい感じに塗る」でこの色を変えない"><input type="checkbox" data-lock="${r}" ${paint.lock?.[r] ? 'checked' : ''}>固定</label>`
    // 透明度（issue #746）：0% は不透明、100% は見えない。その役のブロックがみな同じだけ透ける（盾・武器も、ブロックの色の役で選んだ枠の透明度になる）
    + `<div class="palA"><span title="${formNow > 1 ? `形態 ${formNow} での透明度（形態 1 と同じにすると、形態 1 の値に従う）` : '形態 1 の透明度（ほかの形態も、変えていなければこの値）'}">${formNow > 1 ? `透明度（形態 ${formNow}）` : '透明度'}</span><input type="range" min="0" max="100" step="5" data-alpha="${r}" value="${tpOf(r)}"><b>${tpOf(r)}%</b></div></div>`;
  // 光らない色・光る色に分けて並べる。追加の色・発光 2〜3 は、パーツエディタでブロックの「色の役」に選んだ所だけに付く
  el.innerHTML = '<div class="hint">光らない色</div>' + ROLE_KEYS.filter(r => !GLOW_ROLES.has(r)).map(row).join('')
    + '<div class="hint">光る色</div>' + ROLE_KEYS.filter(r => GLOW_ROLES.has(r)).map(row).join('')
    + '<div class="hint">追加の色 1〜3・発光 2〜3 は、パーツエディタでブロックの「色の役」に選ぶと使える</div>'
    + `<div class="hint">${paint.type ? `型：${paint.type}` : '塗る前の色（パーツを作ったときの色）'}</div>`
    + `<h2>ビビッド</h2>` + (paint.vivid.colors.length
      ? paint.vivid.colors.map((c, k) => `<div class="pal"><input type="color" data-vivid="${k}" value="${c}"><span>${Object.keys(paint.vivid.on).filter(cat => paint.vivid.on[cat] === k).join('・') || '差し色だけ'}</span></div>`).join('')
        + '<div class="hint">部位名のパーツは、主装甲をその色で塗る。差し色のブロックもビビッドの色になる</div>'
      : '<div class="hint">なし（「ビビッドを差す」で、鮮やかな色を 1〜3 色、目を引く部位に入れる）</div>');
  for (const i of el.querySelectorAll('[data-role]')) i.oninput = () => { paint.pal[i.dataset.role] = i.value; paint.type = ''; applyPaint(); save(); };
  for (const i of el.querySelectorAll('[data-alpha]')) i.oninput = () => {
    const r = i.dataset.alpha, t = +i.value;
    // 形態 2 からは、その形態だけの透明度（paint.formAlpha、issue #863）。形態 1 は今までどおり paint.alpha
    if (formNow > 1) setFormAlpha(paint, formNow, r, (100 - t) / 100);
    else { const alpha = { ...(paint.alpha ?? {}) }; if (t > 0) alpha[r] = (100 - t) / 100; else delete alpha[r]; paint.alpha = alpha; }
    i.nextElementSibling.textContent = `${t}%`; applyPaint(); save();
  };
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
/** Claws (parts whose name starts with 爪): hands that hold nothing, so no sample gun or bazooka is put in them */
const clawHands = () => kept().some(it => !byId[it.part]?.deco && (byId[it.part]?.pieces ?? []).some(pc => /^爪/.test(pc.name ?? '') && !pc.blockout));
async function editorWorker() { await XS.ready(); return XS; }
/** 関節のチェックの進み具合を out に出す（onStep(done, total)。チェックの間もページは動く） */
const stepNote = (out, what) => (done, total) => { out.textContent = `${what}（姿勢 ${done} / ${total}）`; };
/** 機体 id（a_raid など）で書き出す → { glb (base64), report, floating（つながっていない部品）, loose（関節で外れる・めり込む）, weapons } */
// ---- 噴射口と盾（テスター もちゅなさん 2026-11-15「スラスターの噴射口の位置を変更する方法」「噴射口を増設する方法」「盾を自作することはできる？」、
// #要望用「スラスター噴射専用のパーツの実装と、噴射する方向を矢印で表示して欲しい」; 依頼主「エディタの要望叶えてあげて」）[作り 独自] ----
// 噴射口：炎を出す専用の部品（parts/back/jetshield.js の jet）。背中のタブの「噴射口」か、「噴射口」の欄の「＋ 噴射口を足す」で置き、
// 動かす・回す（向きの矢印も一緒に回る）・拡大（炎の太さ）・複製・反対側にも・外す。腕・脚には「付ける骨」で。部品の名前に「噴射口」の
// 付いた物（ランドセルの口など）からの炎はそのまま、そこに足される。
// 炎の点（jetpoint）：「部品の噴射口も動かせるようにする」で、部品の名前による炎を 1 つずつ形の無い点に写す。点があると名前による炎は
// 出ず、炎は噴射口の部品と点からだけ出る。「炎の点を外す」で元に戻る。
// 盾：付ける骨「盾」の部品が、戦闘で左手に持つ盾の見た目になる（盾を持つ XS だけ。大きさはその XS の盾に合わせる。見た目だけ）
// 保存データ（機体の JSON の items）にそのまま残る：噴射口 { part: 'jet', mov, rot, scal, bone? }、炎の点 { part: 'jetpoint', … }、盾の部品
// { …, bone: 'shield' }。書き出し（xsengine.js）は同じ items から炎の点（jet_<n>）と盾（節 shield）を作る（tools/bodyxs.ts でも同じ）
// （関数と var：組み立ての初めの描き直し（renderList）からも呼ばれる）
function isJet(it) { return !!byId[it?.part]?.jet; }
function isJetPoint(it) { return byId[it?.part]?.jet === 'point'; }
function canShield(it) { return !!it && !isHead(it.part) && !isJet(it) && !isFx(it); }   // （頭の部品は頭の座標で持つので、盾にできない）
// 書き出しの道具（xsengine.js）は 1 つの機体しか持てない：書き出しと、部品の噴射口の数えを 1 つずつ順に
let engineQ = Promise.resolve();
const onEngine = fn => { const r = engineQ.then(fn, fn); engineQ = r.catch(() => {}); return r; };
/** ゲームの骨（書き出しの名前）→ 付ける骨（BONE_PICK） */
const pickOfBone = b => { const m = /^(arm|elbow|forearm|leg|knee|shin|foot|wing|skirt_front|skirt_back)_([lr])$/.exec(b); return m ? { arm: 'arm', elbow: 'arm', forearm: 'fore', leg: 'leg', knee: 'leg', shin: 'shin', foot: 'foot', wing: 'torso' }[m[1]] ?? 'hips' : b === 'hips' || b === 'head' ? b : 'torso'; };
/** 部品の名前による噴射口（ランドセルの口など。噴射口の部品・炎の点は入れない）→ [{ pos, dir, r, bone }]（エディタの座標、立った姿勢） */
const partNozzles = () => onEngine(async () => {
  const X = await editorWorker();
  X.load({ parts: [], ai: '', role: 'raid' });
  await X.applyUnit(structuredClone({ ...unitDoc(), items: kept().filter(it => !isJet(it)) }));
  return X.partNozzles();
});
/** 噴射口 1 つ → 炎の点の置いたパーツ（−z が噴き出す向き。回転は Ry·Rx·Rz） */
const pointItem = z => {
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), new THREE.Vector3(...z.dir).normalize()), e = new THREE.Euler().setFromQuaternion(q, 'YXZ');
  const k = round(Math.min(4, Math.max(0.25, z.r / JET_R)), 3), b = pickOfBone(z.bone);
  return { part: 'jetpoint', mov: z.pos.map(v => round(v, 4)), rot: [round(e.x / D, 1), round(e.y / D, 1), round(e.z / D, 1)], scal: [k, k, k], ...(b !== 'torso' ? { bone: b } : {}) };
};
var partJets = null, jetTimer = 0, shieldGuide = null;   // 部品の名前による噴射口の数（数え終わるまで null）、数え直しの時計、盾の目安の枠
function jetCountSoon() {
  clearTimeout(jetTimer);
  if (!$('#jetBox')?.open || items.some(isJetPoint)) return;
  jetTimer = setTimeout(async () => { try { partJets = (await partNozzles()).length; } catch { partJets = null; } renderJetShield(); }, 700);
}
/** 噴射口の部品を 1 つ：胴の部品の後ろの面に、真ん中から少し横へ（足すたびに左右を替える）、後ろ下へ噴く向きで */
/** 噴射口を胴の後ろへ 1 つ足す。def：置く噴射口（既定は元の「噴射口」。カタログの「★ 噴射口（改）」は自分のパーツを置く：issue 1162） */
function addJet(def = byId.jet) {
  if (busy()) return;
  const box = new THREE.Box3();
  items.forEach((it, i) => { if (!isJet(it) && groups[i] && holderOf(it) === torsoJ.inner) box.expandByObject(groups[i]); });
  const n = items.filter(it => byId[it.part]?.jet === 'part').length, side = n % 2 ? -1 : 1;
  const at = box.isEmpty() ? [0, 2.25, -0.3] : [0, box.getCenter(new THREE.Vector3()).y + 0.05, box.min.z - 0.02];
  addItems([{ part: def.id, mov: [round(side * (0.1 + 0.04 * Math.floor(n / 2)), 4), round(at[1], 4), round(at[2], 4)], rot: [-45, 0, 0], scal: [1, 1, 1] }]); pickLast(1);
  note('噴射口を 1 つ足しました。オレンジの矢印が噴射の向き。つまみか「位置・回転・拡大」で動かす（回すと矢印も回る）');
}
async function addJetPoints() {
  if (busy() || items.some(isJetPoint)) return;
  note('部品の噴射口を調べています…');
  const zs = await partNozzles();
  if (!zs.length) { note('名前に「噴射口」の付いた部品がありません', true); return; }
  addItems(zs.map(pointItem)); pickLast(1);
  note(`部品の噴射口の炎 ${zs.length} 個を、動かせる炎の点にしました（点があると、部品の名前による炎は出ません）`);
}
function resetJets() {
  if (busy() || !items.some(isJetPoint)) return;
  items = items.filter(it => !isJetPoint(it)); selected = -1; picked = []; rebuild(); save();
  note('炎の点を外しました。部品の噴射口から炎が出ます');
}
// 盾の目安：ゲームの標準の盾（高さ 8 m・幅 4.6 m）を、ゲームが持たせる所（左手の外、手より少し上）に枠で出す（書き出さない）
function shieldAt() { const e = foreJ.l.at ?? ELBOW(1); return [e[0] + 0.15, e[1] - 0.12, e[2]]; }
function placeShieldBase() {
  if (busy()) return;
  addItems([{ part: 'shieldbase', mov: shieldAt().map(v => round(v, 4)), rot: [0, 0, 0], scal: [1, 1, 1], bone: 'shield' }]); pickLast(1);
  note('盾の土台を左の前腕に置きました。ほかの部品も「盾にする」で盾に足せます');
}
function setShield(on) {
  const list = pickedList().filter(i => canShield(items[i]));
  if (!list.length) { note(on ? '盾にする部品を選んでください（頭の部品と噴射口は盾にできません）' : '盾の部品を選んでください', true); return; }
  for (const i of list) { if (on) items[i].bone = 'shield'; else if (items[i].bone === 'shield') delete items[i].bone; }
  rebuild(); save();
  note(on ? `${list.length} 個の部品を盾にしました（左の前腕と一緒に動き、ゲームでは盾として持つ）` : `${list.length} 個の部品を盾から外しました`);
}
function renderJetShield() {
  const jl = $('#jetList'); if (!jl) return;
  const own = items.map((it, i) => [it, i]).filter(([it]) => isJet(it)), points = own.filter(([it]) => isJetPoint(it)).length;
  jl.innerHTML = '';
  let nj = 0, np = 0;
  own.forEach(([it, i]) => {
    const d = document.createElement('div'); d.className = picked.includes(i) ? 'sel' : '';
    const b = it.bone ? BONE_PICK.find(([x]) => x === it.bone)?.[1] ?? it.bone : '胴', side = ['arm', 'fore', 'leg', 'shin', 'foot'].includes(it.bone) ? (sideOf(it) === 'l' ? '・左' : '・右') : '';
    d.innerHTML = `<span>${isJetPoint(it) ? `炎の点 ${++np}` : `噴射口 ${++nj}`}（${b}${side}、大きさ ${round((Math.abs(it.scal[0]) + Math.abs(it.scal[1])) / 2, 2)}）</span><b class="x" title="外す">×</b>`;
    d.onclick = e => { if (e.target.classList.contains('x')) { items.splice(i, 1); selected = -1; picked = []; rebuild(); save(); return; } selectOne(i); };
    jl.appendChild(d);
  });
  jl.hidden = !own.length;
  fillJetDir();
  $('#jetInfo').innerHTML = (nj ? `噴射口の部品 <b>${nj} 個</b>。` : '') + (points
    ? `部品の名前による炎は、<b>${points} 個</b>の炎の点に写してあります（部品からは出ません）。`
    : `名前に「噴射口」の付いた部品（ランドセルの口など）からも炎が出ます${partJets == null ? '' : `：<b>${partJets} 個</b>`}。`) + 'オレンジの矢印が噴射の向き';
  $('#bJetReset').hidden = !points; $('#bJetPoints').hidden = !!points;
  const sh = items.filter(it => it.bone === 'shield').length, sel = items[selected];
  $('#shieldInfo').innerHTML = sh ? `盾の部品：<b>${sh} 個</b>` : '盾の部品はまだありません（ゲームではいつもの盾）';
  $('#bShieldOn').disabled = !canShield(sel) || sel.bone === 'shield'; $('#bShieldOff').disabled = !(sel?.bone === 'shield');
  const want = !!$('#shieldBox')?.open && $('#shieldGuideOn').checked;
  if (want && !shieldGuide) { shieldGuide = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.08, 8 / UNIT_M, 4.6 / UNIT_M)), new THREE.LineBasicMaterial({ color: 0x6fb3ff, transparent: true, opacity: 0.55 })); foreJ.l.inner.add(shieldGuide); }
  if (shieldGuide) shieldGuide.visible = want;
  if (want) { const a = shieldAt(); shieldGuide.position.set(a[0] + 0.04, a[1], a[2]); }
}
// 噴射の向き（テスター もちゅなさん 2026-11-16 #要望用「スラスターの噴射方向を細かく設定できるようにしてほしい」）：選んでいる噴射口・炎の点の
// 向きを、左右・上下の 2 つの角度（1° きざみ）で入れる・矢印をドラッグして回す。向きは置いたパーツの回転（rot）そのもので、保存データに残り、
// 書き出し・ゲームの炎も同じ向き。角度は付ける骨の、立った姿勢の向きで：左右 0° が真後ろ、+ が機体の左（+x）へ、上下 0° が水平、− が下へ。
// 回転は [上下, −左右, 0]（Ry·Rx の順に −z を回すと、噴く向き (−cos 上下·sin(−左右)…) になる）。ひねり（z の回転）は向きを変えないので 0 にする [独自]
/** 置いたパーツの回転 → 噴く向きの [左右, 上下]（度） */
function jetAngles(it) {
  const d = new THREE.Vector3(0, 0, -1).applyMatrix4(rotMatrix(it.rot ?? [0, 0, 0]));
  return [Math.round(Math.atan2(d.x, -d.z) / D), Math.round(Math.asin(Math.max(-1, Math.min(1, d.y))) / D)];
}
function setJetAngles(i, yaw, pitch) {
  const it = items[i];
  yaw = ((Math.round(yaw) + 540) % 360) - 180; pitch = Math.max(-90, Math.min(90, Math.round(pitch)));
  it.rot = [pitch, yaw ? -yaw : 0, 0];
  if (groups[i]) applyToGroup(it, groups[i]);
  applyPose();
}
function fillJetDir() {
  const box = $('#jetDir'); if (!box) return;
  const it = items[selected], on = selected >= 0 && isJet(it) && picked.length <= 1;
  box.hidden = !on;
  if (!on) return;
  const [y, p] = jetAngles(it);
  if (document.activeElement !== $('#jetYaw')) $('#jetYaw').value = y;
  if (document.activeElement !== $('#jetPitch')) $('#jetPitch').value = p;
}
for (const id of ['jetYaw', 'jetPitch']) $('#' + id).oninput = () => {
  if (selected < 0 || !isJet(items[selected])) return;
  const y = parseFloat($('#jetYaw').value), p = parseFloat($('#jetPitch').value);
  if (!Number.isFinite(y) || !Number.isFinite(p)) return;
  setJetAngles(selected, y, p); fillFields(); save();
};
// 矢印をドラッグ：選んでいる噴射口（か炎の点）を押してドラッグすると、口を中心に、押している所の方へ向く（口のまわりの球に画面の線が
// 当たる所。当たらなければ線のいちばん近い所）。掴むのは矢印（口はつまみと重なる）。押すだけ（動かさない）なら今までどおり選ぶ
let jetDrag = null;
canvas.addEventListener('pointerdown', e => {
  if (PE.active() || gizmo.dragging || e.button !== 0 || selected < 0 || !(isJet(items[selected]) || isFx(items[selected])) || !groups[selected]) return;
  const r = canvas.getBoundingClientRect();
  ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
  // (掴むのは矢印：口はつまみの真ん中と重なるので、つまみに譲る)
  if (!ray.intersectObject(groups[selected], true).some(h => /^向きの矢印/.test(h.object.userData.pc?.name ?? ''))) return;
  jetDrag = { i: selected, id: e.pointerId };
  e.stopImmediatePropagation();   // （視点は回さない）
  canvas.setPointerCapture(e.pointerId);
}, true);
canvas.addEventListener('pointermove', e => {
  if (!jetDrag || e.pointerId !== jetDrag.id) return;
  const g = groups[jetDrag.i], r = canvas.getBoundingClientRect();
  ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
  g.updateWorldMatrix(true, false);
  const o = new THREE.Vector3().setFromMatrixPosition(g.matrixWorld), R = 0.29 * Math.max(0.3, Math.abs(g.getWorldScale(new THREE.Vector3()).y));
  const hit = ray.ray.intersectSphere(new THREE.Sphere(o, R), new THREE.Vector3()) ?? ray.ray.closestPointToPoint(o, new THREE.Vector3());
  const d = hit.sub(o);
  if (d.lengthSq() < 1e-8) return;
  d.normalize().applyQuaternion(g.parent.getWorldQuaternion(new THREE.Quaternion()).invert());   // （付ける骨の向きで）
  setJetAngles(jetDrag.i, Math.atan2(d.x, -d.z) / D, Math.asin(Math.max(-1, Math.min(1, d.y))) / D);
  fillFields();
}, true);
const endJetDrag = e => { if (!jetDrag || e.pointerId !== jetDrag.id) return; jetDrag = null; save(); renderJetShield(); renderFx(); };
canvas.addEventListener('pointerup', endJetDrag, true);
canvas.addEventListener('pointercancel', endJetDrag, true);
$('#bJetAdd').onclick = () => addJet();
$('#bJetReset').onclick = resetJets;
$('#bJetPoints').onclick = addJetPoints;
$('#jetBox').ontoggle = () => { jetCountSoon(); renderJetShield(); };
$('#bShieldBase').onclick = placeShieldBase;
$('#bShieldOn').onclick = () => setShield(true);
$('#bShieldOff').onclick = () => setShield(false);
$('#shieldBox').ontoggle = renderJetShield;
$('#shieldGuideOn').onchange = renderJetShield;

// 煙・火花の点（parts/back/jetshield.js の fxpoint。issue 1024、モデレーター なおぴおさん 2026-11-20 #要望用「煙や火花のエフェクトを発生させる
// アイテムを追加してほしい」「それらを作動させる条件付け(移動中、ブースト中、特定の形態中など)を出来るようにしてほしい」）：形の無い点。
// 置いたパーツの item.fx = { k: 種類, w: 出す時, n: 量, s: 大きさ }（jetshield.js fxOf）。向きは噴射口と同じく回転（rot）で、角度の欄と矢印のドラッグ。
// 書き出しは骨 fx_<n>（xsengine.js）、ゲームは自分のスキンだけで出す（client/src/models.ts fxPts、world.ts）
function isFx(it) { return !!byId[it?.part]?.fx; }
function addFx(k) {
  if (busy()) return;
  const box = new THREE.Box3();
  items.forEach((it, i) => { if (!isJet(it) && !isFx(it) && groups[i] && holderOf(it) === torsoJ.inner) box.expandByObject(groups[i]); });
  const n = items.filter(isFx).length, side = n % 2 ? -1 : 1;
  const at = box.isEmpty() ? [0, 2.25, -0.3] : [0, box.getCenter(new THREE.Vector3()).y + 0.1, box.min.z - 0.02];
  addItems([{ part: 'fxpoint', mov: [round(side * (0.08 + 0.04 * Math.floor(n / 2)), 4), round(at[1], 4), round(at[2], 4)], rot: [-20, 0, 0], scal: [1, 1, 1], fx: fxOf({ fx: { k } }) }]); pickLast(1);
  note(`${FX_KINDS[k]}を出す点を 1 つ足しました。水色の矢印が出す向き。種類・量・大きさ・出す時は「煙・火花」の欄で`);
}
function setFx(patch) {
  const it = items[selected]; if (!isFx(it)) return;
  it.fx = fxOf({ fx: { ...fxOf(it), ...patch } }); save(); renderFx();
}
function renderFx() {
  const fl = $('#fxList'); if (!fl) return;
  const own = items.map((it, i) => [it, i]).filter(([it]) => isFx(it));
  fl.innerHTML = '';
  own.forEach(([it, i], k) => {
    const f = fxOf(it), d = document.createElement('div'); d.className = picked.includes(i) ? 'sel' : '';
    const b = it.bone ? BONE_PICK.find(([x]) => x === it.bone)?.[1] ?? it.bone : '胴', side = ['arm', 'fore', 'leg', 'shin', 'foot'].includes(it.bone) ? (sideOf(it) === 'l' ? '・左' : '・右') : '';
    d.innerHTML = `<span>${FX_KINDS[f.k]} ${k + 1}（${b}${side}、${f.w.map(w => FX_WHEN[w]).join('・')}）</span><b class="x" title="外す">×</b>`;
    d.onclick = e => { if (e.target.classList.contains('x')) { items.splice(i, 1); selected = -1; picked = []; rebuild(); save(); return; } selectOne(i); };
    fl.appendChild(d);
  });
  fl.hidden = !own.length;
  $('#fxInfo').innerHTML = own.length ? `煙・火花の点 <b>${own.length} 個</b>${own.length > 8 ? '（ゲームに書き出すのは先に置いた 8 個まで）' : ''}。水色の矢印が出す向き` : 'まだありません。下のボタンで、煙か火花を出す点を置く';
  const it = items[selected], on = selected >= 0 && isFx(it) && picked.length <= 1;
  $('#fxSel').hidden = !on;
  if (!on) return;
  const f = fxOf(it), ks = $('#fxKind');
  if (!ks.options.length) ks.innerHTML = Object.entries(FX_KINDS).map(([v, t]) => `<option value="${v}">${t}</option>`).join('');
  ks.value = f.k;
  if (document.activeElement !== $('#fxN')) $('#fxN').value = f.n;
  if (document.activeElement !== $('#fxS')) $('#fxS').value = f.s;
  const wb = $('#fxWhen');
  if (!wb.children.length) wb.innerHTML = Object.entries(FX_WHEN).map(([v, t]) => `<label class="chk" style="display:inline-flex;margin-right:6px"><input type="checkbox" data-w="${v}">${t}</label>`).join('');
  for (const c of wb.querySelectorAll('input')) c.checked = f.w.includes(c.dataset.w);
  const [y, p] = jetAngles(it);
  if (document.activeElement !== $('#fxYaw')) $('#fxYaw').value = y;
  if (document.activeElement !== $('#fxPitch')) $('#fxPitch').value = p;
}
$('#bFxSmoke').onclick = () => addFx('smoke');
$('#bFxSpark').onclick = () => addFx('spark');
$('#fxBox').ontoggle = renderFx;
$('#fxKind').onchange = e => setFx({ k: e.target.value });
$('#fxN').onchange = e => setFx({ n: parseFloat(e.target.value) });
$('#fxS').onchange = e => setFx({ s: parseFloat(e.target.value) });
$('#fxWhen').onchange = e => {
  // （「ずっと」はほかを含むので、ずっとを入れるとほかは外れ、ほかを入れるとずっとは外れる。1 つも選ばないと、ずっと）
  const t = e.target?.dataset?.w;
  if (t && e.target.checked) for (const c of $('#fxWhen').querySelectorAll('input')) if (c !== e.target && (t === 'always' || c.dataset.w === 'always')) c.checked = false;
  const w = [...$('#fxWhen').querySelectorAll('input:checked')].map(c => c.dataset.w);
  setFx({ w: w.length ? w : ['always'] });
};
for (const id of ['fxYaw', 'fxPitch']) $('#' + id).oninput = () => {
  if (selected < 0 || !isFx(items[selected])) return;
  const y = parseFloat($('#fxYaw').value), p = parseFloat($('#fxPitch').value);
  if (!Number.isFinite(y) || !Number.isFinite(p)) return;
  setJetAngles(selected, y, p); fillFields(); save();
};

// opt.form（2〜）：その形態の形（v2-forms.js bakeForm。色は形態 1 のまま：三角形の並びを変えない）も、形態 1 と同じ骨・床・高さで書き出す（out.form）。
// ゲームで能力の間だけ姿を替える機体（client/src/models.ts axisMorph、AXIS の間のブルーフェイト1号機）の、替えた後の模型
async function exportGame(id, onStep, opt = {}) { return onEngine(() => exportGame0(id, onStep, opt)); }
async function exportGame0(id, onStep, opt = {}) {
  const X = await editorWorker();
  const w = await (await fetch(`./samples/weapons-${id[0] === 'b' ? 'b' : 'a'}.json`)).json();
  const own = ownsWeapon();   // 自由な機体が自分の武器を持っている
  const held = own || clawHands() ? [] : w.parts, purges = hasPurge(unitDoc());   // （置いたパーツの item.purge と、パーツエディタのブロックの pc.purge）
  // パージで外れる部品・ロマン砲変形の部品（撃ち切ると外れる・出る）があれば、先にそれを除いた体の骨・床を測る
  // （外れる・出る部品は床・関節を決めない：xsengine.js buildGameModel の opt.body。アルトゴッジョの前腕のハンドミサイルユニットは足より下まで垂れる）
  let body = null;
  if (purges || kept().some(it => it.roman)) {
    X.load({ parts: held, ai: '', role: id.replace(/^[ab]_/, '') });
    const bare = purgedDoc(unitDoc());
    await X.applyUnit({ ...bare, items: bare.items.filter(it => !it.roman) }, { weaponHand: w.hand_r });
    body = (await X.exportNow(id, true, { height: true })).frame;
  }
  X.load({ parts: held, ai: '', role: id.replace(/^[ab]_/, '') });
  const applied = await X.applyUnit(structuredClone(unitDoc()), { weaponHand: w.hand_r });
  const chk = await X.checkAsync(id, onStep), { frame, ...out } = await X.exportNow(id, true, { height: !!body || opt.form > 1, body });
  // パージで外れる部品（item.purge、issue #745）があれば、それを除いた姿（外れた後）も、付けた姿と同じ骨・床・高さで書き出す。
  // ゲームでは増加装甲の 2 機（shared/data.ts PLATE）だけが、付けた姿（PLATE_MODEL）と外れた姿（modelOf）の 2 つの模型を使う
  let purged = null;
  if (purges) {
    X.load({ parts: held, ai: '', role: id.replace(/^[ab]_/, '') });
    await X.applyUnit(purgedDoc(unitDoc()), { weaponHand: w.hand_r });
    purged = (await X.exportNow(id, true, { frame })).glb;
  }
  let form = null;
  if (opt.form > 1) {
    X.load({ parts: held, ai: '', role: id.replace(/^[ab]_/, '') });
    await X.applyUnit(bakeForm(unitDoc(), opt.form, blockBox, { shape: true }), { weaponHand: w.hand_r });
    form = (await X.exportNow(id, true, { frame, formWhen: formWhenOf(adj), formKind: formKindOf(adj, 2) })).glb;   // （変形の種類：issue 1036。ゲームは 'flyUp' の時に倒さない：issue 1201）   // （ゲームで形態 2 になる時：模型の xs 節の extras）
  }
  return { ...out, purged, form, floating: chk.floating, loose: chk.loose, depths: chk.depths, weapons: applied.weapons, own };
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
  box.textContent = '書き出しています…';
  try {
    // 形態 2 のある機体は、その姿も同じ骨・床・高さで <id>_form2.glb に書き出す（ゲームの自分のスキンで、AXIS の間・飛行形態の間その姿へ動く。issue 951）
    const r = await exportGame(id, stepNote(box, '書き出しています…つながりと関節を調べています'), formCount() > 1 ? { form: 2 } : {});
    const bin = atob(r.glb), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([u8], { type: 'model/gltf-binary' })); a.download = `${id}.glb`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    if (r.purged) {   // パージで外れた姿（印の付いた部品を除いた姿）：もう 1 つのファイル
      const pb = atob(r.purged), p8 = new Uint8Array(pb.length); for (let i = 0; i < pb.length; i++) p8[i] = pb.charCodeAt(i);
      await new Promise(ok => setTimeout(ok, 400));   // （続けて 2 つ落とすと、ブラウザが 2 つ目を止めることがある）
      const b = document.createElement('a'); b.href = URL.createObjectURL(new Blob([p8], { type: 'model/gltf-binary' })); b.download = `${id}_purged.glb`; b.click(); setTimeout(() => URL.revokeObjectURL(b.href), 2000);
    }
    if (r.form) {   // 形態 2 の姿：もう 1 つのファイル
      const fb = atob(r.form), f8 = new Uint8Array(fb.length); for (let i = 0; i < fb.length; i++) f8[i] = fb.charCodeAt(i);
      await new Promise(ok => setTimeout(ok, 400));
      const b = document.createElement('a'); b.href = URL.createObjectURL(new Blob([f8], { type: 'model/gltf-binary' })); b.download = `${id}_form2.glb`; b.click(); setTimeout(() => URL.revokeObjectURL(b.href), 2000);
    }
    const ok = (v, lim) => (v <= lim ? '✓' : '✗');
    box.innerHTML = `<b>${id}.glb を書き出しました</b>（${(u8.length / 1048576).toFixed(1)} MB）<br>`
      + `つながり ${r.floating.length ? `✗ 離れている部品 ${r.floating.length} 組` : '✓'} ／ 関節 ${r.loose.length ? `✗ ${r.loose.length} 個の動きで外れる・めり込む` : '✓'}<br>`
      + `三角形 ${r.report.tris.map((t, i) => `${t.toLocaleString()} ${ok(t, GAME_LIMIT[i])}`).join(' / ')}（近く・中・遠く）、描画 ${r.report.calls[0]} 回 ${ok(r.report.calls[0], 5)}、骨 ${r.report.bones.length} 本<br>`
      + `炎の出る噴射口 ${r.report.jets} 個（${r.report.ownJets ? '置いた噴射口' : '部品の噴射口'}）、盾 ${r.report.shield ? `あり（三角形 ${r.report.shield.tris.toLocaleString()}）` : 'なし（ゲームのいつもの盾）'}<br>`
      + (r.purged ? `パージで外れた姿 ${id}_purged.glb も書き出しました（「パージで外れる」の部品 ${purgeCount().items} 個${purgeCount().blocks ? `・ブロック ${purgeCount().blocks} 個` : ''}を除いた姿。ゲームでパージできる機体で、外れた後の姿に使う）<br>` : '')
      + (r.form ? `形態 2 の姿 ${id}_form2.glb も書き出しました（ゲームの自分のスキンで ${id}.glb と一緒に選ぶと、AXIS の間・飛行形態の間その姿になる）<br>` : '')
      + skinStepsHtml(id, { purged: !!r.purged, form: !!r.form, bad: r.floating.length > 0 || r.loose.length > 0 })
      + [...r.floating.slice(0, 4).map(f => '離れている：' + esc(f)), ...r.loose.slice(0, 4).map(esc)].map(t => `<span style="color:var(--warn)">${t}</span><br>`).join('')
      + `<span class="hint">（開発者向け）ゲームの標準の形にするには public/models/${id}.glb に置き、出す前のテスト 3 つ（docs/models.md）を通す。手持ちの武器は${id[0] === 'b' ? ' GIO' : '連合'}の強襲のもの</span>`;
  } catch (e) { box.textContent = '書き出せませんでした：' + (e?.message ?? e); }
};
// ---- 書き出した .glb を、ゲームで自分のスキンにする手順（日本語と English）----
// [テスター アズキトギさん 2026-11-20 #色々なツールへの要望「自分で作った機体エディタのモデルってどうやってスキンとして使うんですか？」、
//  ポッチャさんの答え「エクオンの設定のその他の方にぶち込む」「たまに骨の設定が間違ってる場合があるんで」; 依頼主 2026-11-20「あのスレッドの内容は手厚く」]
// 書き出しの後に出し、「ゲームでスキンにするには？」でも書き出さずに出す。ゲームの側の同じ手順は client/src/settingsui.ts の skinhelp
const KIND_EN = { raid: 'Raid', heavy: 'Heavy', support: 'Support', sniper: 'Sniper', artillery: 'Artillery (tracks)', artillery_leg: 'Artillery (legs)' };
function skinStepsHtml(id, o = {}) {
  const ja = $('#gameId').selectedOptions[0]?.textContent ?? id, role = id.replace(/^[ab]_/, ''), en = `${id[0] === 'b' ? 'GIO' : 'Union'} ${KIND_EN[role] ?? role}`;
  const more = [o.purged && `${id}_purged.glb`, o.form && `${id}_form2.glb`].filter(Boolean);
  const k = t => `<kbd>${t}</kbd>`;
  return `<div class="skinsteps"><b class="sk-h">ゲームで自分のスキンにする</b><ol>`
    + `<li><span>${k('書き出す')}で <b>${id}.glb</b> ができる</span></li>`
    + `<li><span>ゲームの ${k('設定')} → ${k('その他')}</span></li>`
    + `<li><span>${k('機体')}で「${ja}」の XS を選ぶ</span></li>`
    + `<li><span>${k('.glb を選ぶ')}で ${id}.glb を入れる</span></li>`
    + `<li><span>次の出撃から自分の XS が着る</span></li></ol>`
    + (more.length ? `<p class="sk-one">${more.join('・')} も Ctrl で一緒に選ぶ</p>` : '')
    + `<p class="sk-one">※ 自分の画面だけ。ほかの人には見えません</p>`
    + (o.bad ? `<p class="sk-one sk-warn">✗ があります → ${k('チェックだけする')}で直してから</p>` : '')
    + `<details><summary>注意を見る</summary><ul>`
    + `<li><b>ほかの人には見えない</b><br>このブラウザの自分の画面だけ。みんなに見せるなら${k('みんなの機体')}へ</span></li>`
    + `<li><b>種別が違うと崩れる</b><br>部品がめり込む・浮く。✗ の出た機体も崩れる</span></li>`
    + `<li><b>崩れた時・戻す時</b><br>種別を合わせ、✗ を直して書き出し直す<br>ゲームの${k('外す')}で標準の見た目へ</li></ul></details>`
    + `<details><summary>English</summary><ol>`
    + `<li><span>${k('書き出す')} (Export) makes <b>${id}.glb</b></span></li>`
    + `<li><span>In the game: ${k('Settings')} → ${k('Other')}</span></li>`
    + `<li><span>Under ${k('XS')}, pick a "${en}" XS</span></li>`
    + `<li><span>${k('Choose .glb')} and pick ${id}.glb</span></li>`
    + `<li><span>From your next launch your XS wears it</span></li></ol>`
    + `<p class="sk-one">Only on your own screen: no one else sees it.</p></details></div>`;
}
$('#bSkinHow').onclick = () => {
  if (shipKind()) { $('#gameOut').textContent = '艦は、自分のスキンにできません（XS の種別を選ぶと手順が出ます）'; return; }
  $('#gameOut').innerHTML = skinStepsHtml($('#gameId').value);
};
/** チェックだけ：つながりと関節を調べて、結果をぜんぶ出す（ファイルは作らない） */
$('#bCheck').onclick = async () => {
  if (busy()) return;
  const id = $('#gameId').value, box = $('#gameOut'), esc2 = t => String(t).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
  box.textContent = '調べています…';
  try {
    const X = await editorWorker();
    if (shipKind()) {   // 艦：つながりだけ（関節は無い）
      X.load({ parts: [], ai: '', role: shipKind() });
      await X.applyUnit(structuredClone(unitDoc()));
      const c = X.connect('部品');
      box.innerHTML = `<b>艦として調べました</b><div style="white-space:pre-line${c.ok ? '' : ';color:var(--warn)'}">${esc2(c.text)}</div>`;
      return;
    }
    await loadForCheck(X, id, unitDoc());
    const r = await X.reportAsync(id, stepNote(box, '調べています…')); window.__lastCheck = r;   // （確かめる道具が、めり込みの深さ r.depths を読む）
    const line = (t, ok) => `<div style="white-space:pre-line${ok ? '' : ';color:var(--warn)'}">${esc2(t)}</div>`;
    box.innerHTML = `<b>${$('#gameId').selectedOptions[0].textContent} として調べました</b>${line(r.conn, r.connOk)}${line(r.joint, r.jointOk)}`;
    // めり込む組があれば：置いたパーツを少しずらす・縮めて直すボタン（issue #264。v2-autofix.js）
    if (r.detail.pairs.some(p => fixable(p.a) || fixable(p.b))) {
      const bar = document.createElement('div'); bar.className = 'bar';
      bar.innerHTML = '<button class="small acc" id="bAutoFix" title="めり込むパーツを、少しずらす・縮める（形は変えない。左右の対は両方）。直した後にもう一度調べて、通るまで繰り返す。Ctrl+Z で直す前に戻る">めり込みを自動で直す</button>';
      box.appendChild(bar);
      $('#bAutoFix').onclick = () => runAutoFix(id, box);
    }
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
/** 関節のチェックの前に：機体をチェックの部品にする（手持ちの武器が無ければ、陣営の強襲の銃とバズーカを右手に持たせる） */
const checkWeapons = {};   // （陣営ごとの銃とバズーカ：自動の直しは何十回も読み込むので、1 度だけ取ってくる）
async function loadForCheck(X, id, doc) {
  const f = id[0] === 'b' ? 'b' : 'a', w = structuredClone(checkWeapons[f] ??= await (await fetch(`./samples/weapons-${f}.json`)).json());
  const own = ownsWeapon();
  X.load({ parts: own || clawHands() ? [] : w.parts, ai: '', role: id.replace(/^[ab]_/, '') });
  await X.applyUnit(structuredClone(doc), { weaponHand: w.hand_r });
}
// ---- めり込みを自動で直す（issue #264、テスター るぅてしぁさん 2026-11-06「自分じゃ直せないので、良い感じに調節してくれる機能が欲しい」）----
// 置いたパーツの位置・大きさ・付ける骨だけを変える（形は変えない）。直し方の決まりは v2-autofix.js。直した後は Ctrl+Z の 1 回で直す前に戻る
// 動かさないパーツ：手持ちの武器（ゲームが持たせる物）、機体まるごとの部品（機体エディタ 1 の機体：動かすと全部が動く）、頭の殻（頭の置き方そのものが変わる）、下の FIX_CORE
// 体の芯（胸・背中・腹・腰の殻）と腕・脚の区間のパーツ（上腕・前腕・太もも・すね：長さは骨格が決め、ずらすと関節から離れて見える）も動かさない：相手の小さい方を動かす
const FIX_CORE = new Set(['頭蓋', '胸', '背中', '腹', '腰', '上腕', '前腕', '太もも', 'すね']);
const fixable = i => { const it = kept()[i], def = it && byId[it.part]; return !!def && def.tab !== 'weapon' && !(def.free && !def.tab) && !FIX_CORE.has(def.cat); };
async function runAutoFix(id, box) {
  if (busy()) return;
  const X = await editorWorker(), base = unitDoc(), hash = docHash(), orig = kept(), { k } = headPlaceIn(orig, adj);
  const sideWord = it => (it.mov[0] > 1e-3 ? '（左）' : it.mov[0] < -1e-3 ? '（右）' : '');
  const info = i => ({ name: (it => `${byId[it.part]?.name ?? '?'}${sideWord(it)}`)(orig[i]), head: isHead(orig[i].part), k, movable: fixable(i), bone: canPickBone(orig[i]) });
  const docOf = list => ({ ...base, items: list });
  const btn = $('#bAutoFix'); if (btn) btn.disabled = true;
  try {
    const res = await autoFix({
      items: orig.map(it => structuredClone(it)), info,
      check: async list => { await loadForCheck(X, id, docOf(list)); return X.reportAsync(id); },
      probe: async (list, only) => { await loadForCheck(X, id, docOf(list)); return X.probe(id, only); },
      onStep: t => { box.textContent = t; },
    });
    window.__lastFix = res; window.__lastCheck = res.after;
    if (docHash() !== hash) { box.textContent = '直している間に機体が変わったので、直した結果は入れませんでした。もう一度押してください。'; return; }
    for (const [i, it] of res.items.entries()) { orig[i].mov = it.mov; orig[i].scal = it.scal; if (it.bone) orig[i].bone = it.bone; else delete orig[i].bone; }
    if (res.changes.length) { histAt = 0; rebuild(); save(); }
    const e = t => String(t).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
    const dir = (v, c) => (Math.abs(v) < 0.005 ? '' : `${[['左', '右'], ['上', '下'], ['前', '後ろ']][c][v > 0 ? 0 : 1]}へ ${Math.abs(v).toFixed(2)} m`);
    const li = list => list.map(t => `<div>・${e(t)}</div>`).join('');
    box.innerHTML = `<b>${res.changes.length ? 'めり込みを自動で直しました（Ctrl+Z で直す前に戻る）' : '直せる所がありませんでした（機体は変えていません）'}</b>`
      + (res.fixed.length ? `<div>直った組 ${res.fixed.length}：</div>${li(res.fixed.map(f => `${f.pair} — ${f.how}`))}` : '')
      + (res.changes.length ? `<div>変えたパーツ：</div>${li(res.changes.map(c => `${c.name}：${[...c.move.map(dir).filter(Boolean), ...(Math.abs(c.scale - 1) > 1e-3 ? [`${c.scale} 倍`] : []), ...(c.bone ? [`付ける骨 ${c.bone}`] : [])].join('・')}`))}` : '')
      + (res.failed.length ? `<div style="color:var(--warn)">直せなかった組 ${res.failed.length}：</div><div style="color:var(--warn)">${li(res.failed.map(f => `${f.pair}（${f.depth.toFixed(2)} m）— ${f.why}`))}</div>` : '')
      + `<div style="white-space:pre-line${res.after.jointOk ? '' : ';color:var(--warn)'}">${e(res.after.joint)}</div>`
      + `<div style="white-space:pre-line${res.after.connOk ? '' : ';color:var(--warn)'}">${e(res.after.conn)}</div>`
      + '<span class="hint">直したのは置き方（位置・大きさ・付ける骨）だけ。見た目が気に入らなければ Ctrl+Z で戻し、自分でずらしてください</span>';
  } catch (err) { box.textContent = '直せませんでした：' + (err?.message ?? err); }
}
/** 持っている武器だけを、武器のモデルとして書き出す（w_<陣営>_<形の名前>.glb：骨なし・メートル・握る所が原点・長さは -Z。docs/model-delivery-design.md）。
 *  機体の腕の長さや置いた向きには関係なく、その武器を作ったときの形のまま出す */
// 「武器を作る」（v2-weapon.js）で置いた点（def.wpts）と、形態 2（変形する武器）も入れる：形態 2 はブロックの形態を焼き込んだ部品（出さないブロックは
// 縮めて残す：同じ並びの三角形）を xsengine.js buildWeapon の opt.form2 に渡し、模型の中の動き（モーフ）と点 muzzle_2・blade_tip_2・grip_2 になる
/** 武器の文書 { parts, hand_r, points, form2 }（samples/w_<陣営>_<形の名前>.json と同じ形。tools/exportweapon.ts・tools/sharewpn.ts もこれを使う） */
function weaponDoc(def) {
  // 塗りは今の機体の塗り（機体の「書き出す」と同じ）：役で塗るブロック（発光など）を、エディタに見えている色で出す。
  // 2026-11-21 までは塗り無し（paint: null）で、役のブロックがブロック自身の色（白など）で出て、ゲームで発光が白くなっていた（issue 1066）
  const doc = d => ({ items: [{ part: d.id, mov: [0, 0, 0], rot: [0, 0, 0], scal: [1, 1, 1] }], adj: { ...ADJ0 }, paint, userParts: {} });
  const { parts } = unitParts(doc(def), { shaped: true });
  const wp = bench?.pointsOf(def) ?? {};
  let form2 = null;
  if (formsUsed([def]) > 1) {
    const baked = bakeForm({ userParts: { [def.id]: def } }, 2, blockBox, { shape: true, shrinkHidden: true }).userParts[def.id];
    const keep = byId[def.id];
    byId[def.id] = { ...def, pieces: baked.pieces };
    try { form2 = { parts: unitParts(doc(def), { shaped: true }).parts, hand: wp.hand2, points: wp.points2 }; } finally { byId[def.id] = keep; }
  }
  return { parts, hand_r: (def.hand ?? [0, 0, 0]).slice(), points: wp.points, form2 };
}
async function exportWeaponGlb(def, name) {
  const X = await editorWorker(), d = weaponDoc(def);
  X.load({ parts: d.parts, ai: '', role: '' });
  return X.exportWeapon(d.hand_r, { points: d.points, form2: d.form2 });
}
$('#bWeaponGlb').onclick = async () => {
  if (busy()) return;
  const box = $('#gameOut'), it = kept().find(x => byId[x.part]?.tab === 'weapon'), def = it && byId[it.part];
  if (!def) { box.textContent = '武器を持っていません。左の「武器」のタブで、書き出す武器を持たせてください'; return; }
  // （空なら「武器を作る」の元の武器 def.wbase：ゲームの設定の「自分の武器のスキン」がファイルの名前からその形に入れる、issue 1020）
  const shape = ($('#weaponShape').value.trim() || def.wbase || def.shape || '').replace(/[^a-z0-9_]/gi, '').toLowerCase();
  if (!shape) { box.textContent = '形の名前（半角の英数字と _。例 heat_axe）を入れてください。ゲームの武器のデータの「held」と同じ名前'; return; }
  const file = `w_${def.faction === 'a' || def.faction === 'b' ? def.faction : $('#gameId').value[0] === 'b' ? 'b' : 'a'}_${shape}.glb`;   // （陣営は「武器を作る」の陣営、無ければ書き出しの機体の陣営）
  box.textContent = '書き出しています…';
  try {
    const r = await exportWeaponGlb(def, shape), p = r.report;
    const bin = atob(r.glb), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([u8], { type: 'model/gltf-binary' })); a.download = file; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    box.innerHTML = `<b>${file} を書き出しました</b>（${(u8.length / 1024).toFixed(0)} KB）<br>握る所から先まで ${p.len.toFixed(2)} m・後ろへ ${p.behind.toFixed(2)} m、三角形 ${p.tris.toLocaleString()}、描画 ${p.calls} 回${p.muzzle ? '、弾の出る所あり' : ''}<br>`
        + (p.form2 ? (p.form2.ok ? '形態 2（変形）：動きとして入りました<br>' : `<span style="color:var(--warn)">形態 2（変形）：動きにできませんでした（${p.form2.why}）。削る部品が形態 2 で動くと、形が変わって動きにできません</span><br>`) : '')
      + `<span class="hint">自分の画面だけで使うには：ゲームの設定の「自分のスキン」→「自分の武器のスキン」の「武器の .glb を選ぶ」でこのファイルを入れる（形の名前 ${shape} の武器が、次の出撃から自分の XS の手でこの見た目になる。ほかの人には見えない。当たり・性能・弾の出る所は今の武器のまま）。`
      + `みんなのゲームに入れるのは、作品を「みんなの機体」に投稿して採用された時（運営が tools/sharewpn.ts で取り込む）</span>`;
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
  showForms(formRoots(), 1, 1, 1, formMat); placeItemForms(null);   // （小さな絵は形態 1）
  flamesHidden = true; flameTick(0);   // （炎の見本は写さない）
  renderer.render(scene, camera);
  flamesHidden = false;
  showFormNow();
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
/** 開く機体の JSON の自分のパーツが、このブラウザの自分のパーツと同じ id で中身が違う時：ブラウザの方を残し、ファイルの方を空いている id
 *  （同じ元の名前の次の番号）に付け替えて入れる（機体の items の part も付け替える）。パーツの id は作った人のブラウザごとの番号（u·元·n）で、
 *  ほかの人の作品やゲームの見本と重なる。今までは開いた方に入れ替わり、自分のほかの機体のパーツが消えた [テスター WonD さん 2026-11-23
 *  #色々なツールへの要望「機体エディタの一部パーツがニャーノの物に置き換わってしまいました…すね（ホバー）・脚部増加装甲」]。中身が同じならそのまま。
 *  付け替えた数を返す */
function adoptUserParts(d) {
  const up = d?.userParts; if (!up) return 0;
  const same = (a, b) => a.name === b.name && JSON.stringify(a.pieces) === JSON.stringify(b.pieces);
  const moved = {};
  for (const [key, def] of Object.entries(up)) {
    if (!def?.id || !Array.isArray(def.pieces)) continue;
    const had = byId[def.id];
    if (!had || !had.user || had === def || same(had, def)) continue;
    const base = def.id.replace(/·\d+$/, '');
    // (前に同じ中身で付け替えて入れた自分のパーツがあれば、それを使う：開くたびに増えない)
    const kept = Object.values(userParts).find((u) => u.id !== def.id && u.id.startsWith(`${base}·`) && same(u, def));
    let n = 1, id = kept?.id;
    if (!id) do id = `${base}·${n++}`; while (byId[id] || up[id] || Object.values(moved).includes(id));
    moved[def.id] = id;
    delete up[key]; up[id] = { ...def, id };
  }
  const ids = Object.keys(moved);
  if (!ids.length) return 0;
  const list = Array.isArray(d) ? d : d.items;
  for (const it of list ?? []) if (moved[it.part]) it.part = moved[it.part];
  note(`この機体の自分のパーツ ${ids.length} 個が、このブラウザの自分のパーツと同じ番号で中身が違ったので、ブラウザの方を残し、この機体の方を別の番号で入れました（${ids.map((i) => up[moved[i]].name).join('・')}）`);
  return ids.length;
}
/** 機体の JSON（全身）を今の機体にする */
function openDoc(d, name = '', id = '') {
  const list = Array.isArray(d) ? d : d.items;
  if (!Array.isArray(list)) throw new Error('機体の JSON の形が違います');
  adoptUserParts(d); registerUnit(d); for (const def of Object.values(d.userParts ?? {})) if (def?.id && byId[def.id] === def) userParts[def.id] = def;
  persistUser(); renderCatalog(); showTab(tab);
  adj = { ...ADJ0, ...(d.adj ?? {}) };
  paint = loadPaint(d.paint); showPaint();
  items = tidy(list); selected = -1; resetForms();
  const fixed = toNewBody(items, adj); showAdj();   // 前の頭身の機体は新しい頭身へ（保存してある方は、保存し直すまで前のまま）
  unitName = name || d.name || ''; saveId = id; savedHash = '';
  rebuild(); save();
  if (id) { savedHash = fixed ? '' : docHash(); persist(); showUnitName(); }
}
const safeName = n => String(n || '機体').replace(/[\\/:*?"<>|]/g, '_');
function saveFile(doc = unitDoc(), name = `${safeName(unitName)}.xsunit.json`) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(doc, null, 1)], { type: 'application/json' })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  note(`${name} を書き出しました（ブラウザのダウンロードの場所に入ります）`);
}
/** 機体の JSON に入っている自分のパーツを、カタログに入れる */
function takeUserParts(d) { adoptUserParts(d); registerUnit(d); for (const def of Object.values(d.userParts ?? {})) if (def?.id && byId[def.id] === def) userParts[def.id] = def; persistUser(); renderCatalog(); showTab(tab); }
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
// 「名前を付けて保存」で開いた時は、上書きのボタンを出さず、いつも新しい機体として残す（issue 744）
let saveAsMode = false, svFind = '';
/** 同じ名前の保存の id（前後の空白を除いて全く同じ名前。大文字・小文字・全角半角は区別する。いくつもあれば新しい方）。無ければ '' */
const sameNameId = (s, name) => Object.keys(s).filter(id => String(s[id].name ?? '').trim() === name).sort((a, b) => (s[b].at ?? '').localeCompare(s[a].at ?? ''))[0] ?? '';
function renderSaves() {
  const s = readSaves(), ids = Object.keys(s).sort((a, b) => (s[b].at ?? '').localeCompare(s[a].at ?? '')), box = $('#saveBox .box');
  const asNew = saveAsMode || !(saveId && s[saveId]);
  const day = t => { const d = new Date(t); return Number.isNaN(+d) ? '' : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
  box.innerHTML = `<div class="top"><b>機体の保存と読み込み</b><button id="svClose">閉じる（Esc）</button></div>
    <h2>今の機体${unitName ? `：${esc(unitName)}` : ''}${dirty() ? '<span class="hint">　● 保存していない変更がある</span>' : ''}</h2>
    <div class="now"><input type="text" id="svName" placeholder="機体の名前" value="${esc(unitName)}">
      ${!asNew ? `<button id="svOver" class="acc" title="保存してある「${esc(s[saveId].name)}」を、今の機体で置き換える">上書き保存</button><button id="svNew" title="今の機体を、別の機体として新しく保存する（元の保存は残る）">別の機体として保存</button>` : '<button id="svNew" class="acc" title="今の機体を、この名前で新しい機体として保存する（元の保存は残る。同じ名前があれば、置き換えるか別に残すかを聞く）">名前を付けて保存</button>'}
      <button id="svFile" title="今の機体を .json のファイルにする（別のパソコン・ブラウザへ持っていく、手元に残す）">ファイルに保存</button>
      <button id="svOpenFile" title="ファイル（.json）から機体を開く。画面にファイルを落としても開く">ファイルから開く</button>
      <button id="svGlb" title="Blender や 3D 生成 AI で作った .glb を読み込んで、機体にする（骨に合わせて曲がるスキン。部位ごとに切り分ける）">GLB を読み込む</button>
      <button id="svRig" title="パソコンの AI（Claude Code など）に Blender で骨を付けてもらう頼み方を出す">AI に骨を付けてもらう</button></div>
    <div class="hint" style="margin-top:4px" id="svRoom">保存はこのブラウザの中に残ります（ブラウザのデータを消すと無くなる）。大事な機体は「ファイルに保存」でも残してください</div>
    <h2>保存した機体 <span class="hint" id="svCount">${ids.length} 体</span>${ids.length ? `<input type="text" class="svfind" id="svFind" placeholder="名前で絞り込む" title="名前にこの文字が入っている機体だけを並べる" value="${esc(svFind)}">` : ''}</h2>
    ${ids.length ? `<div class="svcells">${ids.map(id => `<div class="svcell ${id === saveId ? 'cur' : ''}" data-id="${id}"><img src="${s[id].thumb ?? ''}" alt="" title="開く"><div class="nm" title="${esc(s[id].name)}">${esc(s[id].name)}</div><div class="hint">${day(s[id].at)}${id === saveId ? '・今の機体' : ''}</div>
      <div class="bar"><button class="small acc" data-act="open">開く</button><button class="small" data-act="file" title="この機体を .json のファイルにする">ファイルへ</button><button class="small" data-act="del">消す</button></div></div>`).join('')}</div>` : '<div class="hint">まだありません。上の「名前を付けて保存」で、今の機体がここに並びます</div>'}`;
  renderE1(box);
  Store.room().then(r => { const el = $('#svRoom'); if (r?.quota && el) el.textContent += `　今このサイトで使っている量：${(r.used / 1048576).toFixed(1)} MB（このブラウザでは ${r.quota > 1073741824 ? `${(r.quota / 1073741824).toFixed(0)} GB` : `${Math.round(r.quota / 1048576)} MB`} くらいまで入る）`; });
  const nameNow = () => $('#svName').value.trim();
  const needName = () => { if (nameNow()) return true; note('機体の名前を入れてください', true); $('#svName').focus(); return false; };
  $('#svClose').onclick = () => { $('#saveBox').hidden = true; };
  $('#svNew').onclick = async () => {
    if (!needName()) return;
    const dup = sameNameId(s, nameNow());   // 同じ名前があれば、置き換えるか別に残すかを聞く
    const id = dup && confirm(`同じ名前の「${nameNow()}」があります。\n「OK」で置き換え、「キャンセル」で別の機体として残します`) ? dup : '';
    if (await saveUnit(nameNow(), id)) { saveAsMode = false; renderSaves(); }
  };
  if ($('#svOver')) $('#svOver').onclick = async () => { if (needName() && await saveUnit(nameNow(), saveId)) renderSaves(); };
  $('#svFile').onclick = () => { if (nameNow()) { unitName = nameNow(); persist(); showUnitName(); } saveFile(); };
  $('#svOpenFile').onclick = () => $('#unitFile').click();
  $('#svGlb').onclick = () => $('#unitFile').click();
  $('#svRig').onclick = showRigRequest;
  $('#svName').onkeydown = e => { if (e.key === 'Enter') ($('#svOver') ?? $('#svNew')).click(); };
  // 名前で絞り込む（並びは日時の新しい順のまま。大文字・小文字は区別しない）
  const find = () => {
    const q = svFind.trim().toLowerCase(); let n = 0;
    for (const cell of box.querySelectorAll('.svcell[data-id]')) { const on = !q || String(s[cell.dataset.id]?.name ?? '').toLowerCase().includes(q); cell.style.display = on ? '' : 'none'; if (on) n++; }
    $('#svCount').textContent = q ? `${ids.length} 体のうち ${n} 体` : `${ids.length} 体`;
  };
  if ($('#svFind')) $('#svFind').oninput = e => { svFind = e.target.value; find(); };
  find();
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
const openSaves = async (asNew = false) => { if (busy()) return false; saveAsMode = asNew; await Store.reload(); renderSaves(); $('#saveBox').hidden = false; return true; };
$('#bOpen').onclick = () => openSaves();
$('#bSaveAs').onclick = async () => { if (!await openSaves(true)) return; const el = $('#svName'); el.focus(); el.select(); note('名前を入れて「名前を付けて保存」を押してください（元の保存はそのまま残ります）'); };
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
    [...new Set(list.map(d => d.cat))].filter(cat => tplOf(list, cat, false)).map(cat => ({ group, cat, id: tplOf(list, cat, false).id })).filter(s => canAsk(s.id))),
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
const xsRole = () => { const r = $('#gameId').value.replace(/^[ab]_/, ''); return ROLES[r] ? r : ''; };
/** 武器だけの作品（置いたパーツが手持ちの武器だけ、「武器を作る」）ならその武器の作ったパーツ、違えば null */
const weaponOnly = () => { const only = kept(); return only.length && only.every(it => byId[it.part]?.tab === 'weapon') ? byId[only[0].part] : null; };
const SHARE = initShare({
  busy, okToLeave, kinds: { ...ROLES, weapon: '武器' }, doc: postDoc, name: () => unitName, thumb: () => unitThumb(),
  // 武器だけの作品（置いたパーツが手持ちの武器だけ、「武器を作る」）は用途「weapon」で出す：みんなの機体の「武器」のタブに並び、
  // ゲームの「みんなの機体からスキンを選ぶ」（XS のスキン）には出ない（issue 1102）
  role: () => weaponOnly() ? 'weapon' : xsRole(),
  xsRole: () => xsRole(),
  problem: () => {
    if (shipKind()) return '艦は「みんなの機体」にはまだ投稿できません。';
    if (!kept().length) return 'パーツが無いので投稿できません。';
    const text = JSON.stringify(postDoc());
    if (text.includes('"kind":"mesh"')) return '取り込んだ形（.glb）の入った機体は投稿できません。';
    if (text.length > 4000000) return `機体のデータが大きすぎます（${Math.round(text.length / 1000)} KB。4000 KB まで）。自分で作ったパーツの形のデータが入るので、作ったパーツを減らしてください。`;
    return '';
  },
  // つながりと関節（「チェックだけする」と同じ調べ方）
  check: async onStep => {
    // 武器だけの作品（置いたパーツが手持ちの武器だけ、「武器を作る」）：機体のつながり・関節ではなく、武器として書き出して点と形態 2 を見る
    const wdef = weaponOnly();
    if (wdef) {
      const r = await onEngine(() => exportWeaponGlb(wdef, 'check')), p = r.report;
      const lines = [`武器だけの作品として調べました：握りから先まで ${p.len.toFixed(2)} m・三角形 ${p.tris.toLocaleString()}`,
        p.muzzle ? '銃口の点 ✓' : '銃口の点なし（格闘の武器なら要りません）',
        ...(p.form2 ? [p.form2.ok ? '形態 2（変形）✓' : `形態 2（変形）✗ ${p.form2.why}`] : [])];
      return { ok: !p.form2 || p.form2.ok, text: lines.join(String.fromCharCode(10)) };
    }
    const id = $('#gameId').value, X = await editorWorker();
    const w = await (await fetch(`./samples/weapons-${id[0] === 'b' ? 'b' : 'a'}.json`)).json();
    const own = ownsWeapon();
    X.load({ parts: own || clawHands() ? [] : w.parts, ai: '', role: id.replace(/^[ab]_/, '') });
    await X.applyUnit(structuredClone(unitDoc()), { weaponHand: w.hand_r });
    const r = await X.reportAsync(id, onStep);
    return { ok: r.ok, text: `${$('#gameId').selectedOptions[0].textContent} として調べました\n${r.conn}\n${r.joint}` };
  },
  openUnit: (doc, title) => { openDoc(doc, title); note(`「${title}」を開きました（このブラウザにはまだ保存していません。「保存」で残せます）`); },
  openScene: (parts, title, role, ai) => { const def = openE1(parts, title, role); if (ai) { def.ai = ai; persistUser(); } },
});
$('#bShare').onclick = () => { if (!busy()) SHARE.open(); };
// ?share：開いたときに「みんなの機体」の一覧を出す（ゲームのロビーのコミュニティから直接開く入口、issue #259）
if (new URLSearchParams(location.search).has('share')) SHARE.open();
// ---- ゲームのスキンにする（issue #259 の 2）：?skin=<id>&as=<種別>&reply=<ゲームのページの origin> で、ゲームのページの中の見えない窓として開かれる。
// みんなの機体のその 1 つを開き、「ゲーム用に書き出す」と同じ exportGame で .glb を作って、親のページ（ゲーム）へ postMessage で渡す。
// 渡す物：{ xsskin: 'step', done, total } 関節を調べている途中 → { xsskin: 'glb', glb (ArrayBuffer), purged (ArrayBuffer、「パージで外れる」の部品が
// ある時だけ：それを除いた姿、ゲームはパージの後にこちらを着る), form (ArrayBuffer、形態 2 がある時だけ：その姿), title, floating, loose } か { xsskin: 'error', error }
if (SKIN_MODEL && window.parent !== window) (async () => {
  const q = new URLSearchParams(location.search), as = q.get('as') ?? '', to = q.get('reply') ?? '';
  const send = (m, tr) => { try { window.parent.postMessage(m, /^https?:\/\/[^/]+$/.test(to) ? to : '*', tr); } catch { /* the game's page went */ } };
  try {
    if (!/^[ab]_(raid|heavy|support|sniper|artillery_leg|artillery)$/.test(as)) throw new Error('この種別の機体は書き出せません。');
    const r = await (await fetch(`${SHARE.central}/api/models/${encodeURIComponent(SKIN_MODEL)}`)).json();
    const title = String(r.model?.title ?? '');
    if (r.unit) openDoc(r.unit, title);
    else if (Array.isArray(r.scene)) openE1(r.scene, title, r.model?.role ?? '');
    else throw new Error(r.error || 'この機体は開けません（形が分かりません）。');
    if (JSON.stringify(unitDoc()).includes('"kind":"mesh"')) for (let i = 0; i < 300 && !kept().every(it => (byId[it.part]?.pieces ?? []).every(pc => pc.kind !== 'mesh' || MESHES.has(pc.mesh))); i++) await new Promise(ok => setTimeout(ok, 100));
    // 形態 2 のある機体は、その姿も同じ骨・床・高さで焼いて渡す（form）：ゲームは AXIS の間（変形できる XS は飛行形態の間）その姿へ動かす（issue 932）
    const out = await exportGame(as, (done, total) => send({ xsskin: 'step', done, total }), formCount() > 1 ? { form: 2 } : {});
    const bytes = (b64) => { const bin = atob(b64), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return u8.buffer; };
    const glb = bytes(out.glb), purged = out.purged ? bytes(out.purged) : undefined, form = out.form ? bytes(out.form) : undefined;
    send({ xsskin: 'glb', glb, purged, form, title, floating: out.floating.length, loose: out.loose.length }, [glb, ...purged ? [purged] : [], ...form ? [form] : []]);
  } catch (e) { send({ xsskin: 'error', error: String(e?.message ?? e) }); }
})();
$('#bFire').onclick = () => testFire(null);
renderForms();
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
const BUILD = '5ee8415';
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
  // ゲームの今の形（tools/xs-models/units の写し samples/game-units.json、tools/genunitsamples.ts が作る）を陣営・兵科で分けて並べる（issue #676）
  const gu = document.createElement('div');
  gu.innerHTML = '<h2>見本の機体：ゲームの今の形 <span class="hint">ゲームで使っている形。型違いの機体の多くは、ここの形に色だけ変えて出ている</span></h2><div id="svGameUnits"><span class="hint">読み込み中…</span></div>';
  box.appendChild(gu);
  fetch('./samples/game-units.json').then(r => r.json()).then(d => {
    const el = gu.querySelector('#svGameUnits'); if (!el.isConnected) return;
    const groups = [];
    for (const s of d.samples) { const k = `${s.factionName}・${s.roleName}`; let g = groups.find(x => x.k === k); if (!g) groups.push(g = { k, list: [] }); g.list.push(s); }
    el.innerHTML = groups.map(g => `<h3 class="hint">${esc(g.k)}</h3><div class="svcells">${g.list.map(s => `<div class="svcell" data-gu="${d.samples.indexOf(s)}"><div class="nm" title="${esc(s.name)}">${esc(s.name)}</div><div class="hint" title="${esc(s.note)}">${s.note ? esc(s.note) : `部品 ${s.doc.items.length} 個`}</div><div class="bar"><button class="small acc" data-act="unit">機体として開く</button></div></div>`).join('')}</div>`).join('');
    for (const cell of el.querySelectorAll('[data-gu]')) {
      const s = d.samples[+cell.dataset.gu];
      cell.querySelector('[data-act=unit]').onclick = () => {
        if (busy() || !okToLeave(`「${s.name}」を開きます`)) return;
        try { openDoc(structuredClone(s.doc), s.name); $('#saveBox').hidden = true; note(`「${s.name}」を開きました（このブラウザにはまだ保存していません。「保存」で残せます）`); } catch (e) { note('開けません：' + e.message, true); }
      };
    }
  }).catch(() => { const el = gu.querySelector('#svGameUnits'); if (el) el.innerHTML = '<span class="hint">ゲームの形を読めませんでした</span>'; });
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
// （テスターの作品から取り込んだ武器は samples/w-index.json：tools/sharewpn.ts が足す）
const W_TAKEN = await fetch('./samples/w-index.json').then(r => (r.ok ? r.json() : []), () => []).catch(() => []);
for (const file of ['w_a_machine_gun', 'w_b_machine_gun', 'w_a_beam_rifle', 'w_a_beam_rifle_f1', 'w_b_beam_rifle', 'w_a_beam_shotgun', 'w_b_beam_shotgun', 'w_a_charge_rifle', 'w_b_charge_rifle', 'w_a_bazooka', 'w_b_bazooka', 'w_a_sniper_rifle', 'w_b_sniper_rifle', 'w_a_charge_sniper', 'w_b_charge_sniper', 'w_a_beam_sniper', 'w_b_beam_sniper', 'w_a_repair_torch', 'w_b_repair_torch', 'w_a_knife', 'w_b_knife', 'w_a_saber', 'w_b_saber', 'w_a_aqua_beam', 'w_b_aqua_beam', 'w_a_harpoon', 'w_b_harpoon', 'w_a_aqua_charge', 'w_b_aqua_charge', 'w_a_aqua_missile', 'w_b_aqua_missile', 'w_b_heat_axe', ...W_TAKEN]) {
  try {
    const w = await (await fetch(`./samples/${file}.json`)).json();
    // テスターの作品から取り込んだ武器（tools/sharewpn.ts）：作品の武器の自分のパーツ（形態・点のまま）を src に持つ
    if (w.src?.pieces) registerUser({ ...w.src, id: `w·${file.slice(2)}`, name: w.name, cat: WEAPON_CAT, user: false, free: true, half: 'free', tab: 'weapon', hand: w.hand_r, shape: w.shape, faction: w.faction });
    else registerUser({ ...freeDef(`w·${file.slice(2)}`, w.name, w.parts, { tab: 'weapon', from: 'sample' }), cat: WEAPON_CAT, user: false, hand: w.hand_r, shape: w.shape, faction: w.faction });
  } catch (e) { console.warn('weapon', file, e); }
}
// ゲームにもうある武器の模型そのまま（issue 1101：samples/gw-index.json、tools/gameweaponparts.ts。上のブロックの形の元が無い物）。
// 取り込んだ形のブロック 1 つ（形は選んだ時に模型から作る：meshparts.js gameWeaponMesh）。握る所が原点なので def.hand は [0, 0, 0]
// （置くと seatWeapons が今の右手へ動かす。見本の武器 samples/w_*.json の hand_r と同じ）
for (const w of (await fetch('./samples/gw-index.json').then(r => (r.ok ? r.json() : null), () => null).catch(() => null))?.weapons ?? []) {
  const id = `w·gw·${w.file.slice(2)}`;
  if (byId[id]) continue;
  registerUser({ ...freeDef(id, w.name, [{ name: `${w.name}・模型`, kind: 'mesh', mesh: `${GW_PREFIX}${w.file}.${w.v}`, bone: 'fore', color: '#ffffff', metal: 0.4, rough: 0.5, pos: [0, 0, 0] }], { tab: 'weapon', from: 'game' }),
    cat: WEAPON_CAT, user: false, hand: [0, 0, 0], shape: w.shape, faction: w.faction });
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
window.__asm = { bodyType: { apply: k => applyBodyType(BODY_TYPES[k]), neckBaseY, adj: () => adj }, exportWeaponGlb, weaponDoc, ship: { kind: () => shipKind(), open: openShip, exportShip, guides: () => guideGroup.children.length, shipPart }, saves: { store: Store, stored, readSaves, saveUnit, openFile, dirty, name: () => unitName, id: () => saveId, openE1, takeHead, e1Sources, importGlb }, MESHES, renderer, scene, camera, orbit, root, items: () => items, groups: () => groups, paint: () => paint, editorParts, exportGame, crossCuts: async () => { const X = await editorWorker(); await X.applyUnit(structuredClone(unitDoc())); return X.crossCuts(); }, reCuts: async () => { const X = await editorWorker(); await X.applyUnit(structuredClone(unitDoc())); return X.reCuts(); }, unitDoc: () => unitDoc(), pe: PE, gizmo, select, selectOne, picked: () => picked, pivot, groupPicked, ungroupPicked, userParts, byId, jointMark };
// ?unit=<機体ファイル（この画面からの相対パス）>：開いたときにその機体を読み込む（試作を見せる用。&save=<名前> を付けると「つづきから」の保存を別の場所にする）
{
  const u = new URLSearchParams(location.search).get('unit');
  if (u && /^[\w./-]+\.json$/.test(u) && !u.includes('..')) fetch(u, { cache: 'reload' }).then(r => (r.ok ? r.text() : Promise.reject(new Error(String(r.status))))).then(t => { $('#paste').value = t; $('#bApply').click(); }).catch(e => note(`機体ファイルを読めません：${u}（${e.message}）`, true));
}
