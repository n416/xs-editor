// 機体エディタ Ver2 の機体（置いたパーツ・寸法の調整・塗り・自分のパーツ）→ 機体エディタ（index.html）の部品。
// Ver2 の画面（v2.js）・機体エディタ（ゲーム用の書き出し）・画面なしの道具（tools/bodyxs.ts）が同じものを使う。
//   機体の JSON：{ format: 'xs-unit', version: 2, items: [{ part, mov, rot, scal }], adj, paint, userParts: { id: def } }
//   頭のパーツは id に「h·」が付く（頭の組み立てのカタログ。頭の座標で持ち、headPlace で首の上へ縮めて置く）
//   自分のパーツ（id が u· で始まる。頭は h·u·）は、カタログのパーツと同じ形の def に { user, half, base } を足したもの
import { byId, halfOf as halfOf0, bodyParts, ADJ0 } from './bodyparts.js';
import { LOWER, lowerById } from './parts/lower/index.js';
import { UPPER, upperById } from './parts/upper/index.js';
import { BACK, backById } from './parts/back/index.js';
import { ARM, armById } from './parts/arm/index.js';
import { LEG, legById } from './parts/leg/index.js';
import { PARTS as HEAD_RAW, byId as headRawById } from './xsasm-parts.js';
import { rotMatrix } from './xsasm.js';
import { shapesOf, isSub, freeShapes } from './partgeo.js';
import { freeParts } from './freeparts.js';
import * as THREE from 'three';
import { headDims, faceOf } from './xsasm-random.js';
import { colorOf, roleOf } from './paint.js';
import { makeSheet } from './xsbody.js';

const S = makeSheet();
export const HP = 'h·';
/** 頭のパーツ（id に h· を付けたもの）。目次 byId にも入れる */
export const HEAD = HEAD_RAW.map(d => ({ ...d, id: HP + d.id }));
for (const d of HEAD) byId[d.id] = d;
byId[HP + 'boxhelm'] = byId[HP + 'headshell'];   // 消した殻（角ばった頭）を持つ機体は、「頭の殻」として読む（xsasm-parts.js）
export const isHead = id => String(id).startsWith(HP);
export const rawHead = it => ({ ...it, part: it.part.slice(HP.length) });
export const asHead = it => ({ ...it, part: HP + it.part });
/** どの部分か。自由な部品（def.free）は 'free'、頭まるごと（def.tab = 'head'）は 'head' */
export const halfOf = id => (isHead(id) ? 'head' : byId[id]?.free ? byId[id].tab ?? 'free' : halfOf0(id));
/** 自由な部品（機体エディタの形式の機体・頭まるごと）の目次 */
export const FREE = [], freeById = {};

// ---- 自分のパーツを目次に入れる・外す ----
const LISTS = { free: [FREE, freeById], lower: [LOWER, lowerById], upper: [UPPER, upperById], back: [BACK, backById], arm: [ARM, armById], leg: [LEG, legById] };
export function registerUser(def) {
  byId[def.id] = def;
  if (def.half === 'head') {   // 頭：頭の組み立ての目次（h· の無い id）にも入れる。ブロックの並びは同じものを指す
    if (!HEAD.includes(def)) HEAD.push(def);
    const raw = def.id.slice(HP.length);
    if (!headRawById[raw]) { const r = { ...def, id: raw }; headRawById[raw] = r; HEAD_RAW.push(r); }
  } else { const [list, map] = LISTS[def.half] ?? LISTS.lower; if (!list.includes(def)) list.push(def); map[def.id] = def; }
}
export function unregisterUser(id) {
  const def = byId[id]; if (!def?.user) return;
  delete byId[id];
  if (def.half === 'head') { const raw = id.slice(HP.length), r = headRawById[raw]; delete headRawById[raw]; for (const [list, o] of [[HEAD, def], [HEAD_RAW, r]]) { const k = list.indexOf(o); if (k >= 0) list.splice(k, 1); } }
  else { const [list, map] = LISTS[def.half] ?? LISTS.lower; delete map[id]; const k = list.indexOf(def); if (k >= 0) list.splice(k, 1); }
}

/** 頭の殻（部位「頭蓋」）の置いたパーツ。無ければ null */
export const headShell = items => items.find(it => isHead(it.part) && byId[it.part]?.cat === '頭蓋') ?? null;
/**
 * 頭の置き方：頭の殻の高さが 0.3（骨格図の頭）× 頭の大きさ になるよう縮め、あごの下の端を首の付け根の少し上（＋首の長さ）へ、
 * 前後の真ん中を体の中心（＋頭の前後）へ。殻が無ければ、標準の殻の大きさで。戻り値 { k, at }：体の座標 = at + k · 頭の座標
 * 底が「頭の殻」より低い殻（バイザーの頭）は、殻の face.lift の分だけ上へ置く：同じ高さに置くと立ち襟の中に沈み、歩いて頭を起こすと後頭部が襟の後ろにめり込んだ
 */
export function headPlace(items, adj = ADJ0) {
  const shell = headShell(items), H = headDims(shell ? rawHead(shell) : { mov: [0, 0, -0.125], scal: [3, 3.1, 2.2] }), k = 0.3 / H.h * (adj.headK ?? 1);
  const lift = shell ? (faceOf(rawHead(shell).part).lift ?? 0) * H.sh : 0;
  return { k, at: [0, S.neck.y + 0.02 + (adj.up ?? 0) + (adj.neck ?? 0) - k * (H.chin - lift), (adj.headZ ?? 0) - k * (H.front + H.back) / 2] };
}

/**
 * 機体 → { parts: 機体エディタの部品（頭は骨 head、体は bodyParts のとおり。色は塗りの色）, anchors: { neck, hand_r }, head: 頭のパーツがあるか }。
 * paint.team：差し色（ビビッドを使っていないとき）をゲームの陣営色にする（白で「陣営色で塗る」）
 */
export function unitParts(doc, { shaped = false } = {}) {
  // 手持ちの武器（def.tab = 'weapon'）は、部品の並びのいちばん前へ：武器の「引く」部品（銃口の穴など）は自分より前の部品だけを削るので、体を削らない
  // 自分のモデルとして書き出す武器（def.shape：ゲームでの形の名前。ヒートアックスなど）は、機体のモデルに入れない（shaped: true のときだけ入れる：その武器だけを書き出すとき）
  const all = (doc.items ?? []).filter(it => byId[it.part] && (shaped || !byId[it.part].shape)), held = it => byId[it.part].tab === 'weapon';
  const items = [...all.filter(held), ...all.filter(it => !held(it))], adj = { ...ADJ0, ...(doc.adj ?? {}) }, paint = doc.paint ?? null;
  const team = !!paint?.team && !(paint.vivid?.colors?.length);
  const paintOf = (pc, def) => (team && roleOf(pc) === 'accent' ? { color: '#f2f2f2', team: true } : { color: colorOf(pc, def.cat, paint) });
  const { k, at } = headPlace(items, adj);
  const head = items.filter(it => isHead(it.part)).flatMap(it => {
    // 頭の組み立て（xsasm.js の placeItem）と同じ置き方。形は partgeo.js の shapesOf（パーツエディタで作った形は三角形で）
    // 首は胴に付く（骨 torso。首当ては頭の後ろを包むので、頭と一緒に動く）。ゲームは歩くとき、胴が前へ傾いた分だけ頭を起こす：首まで頭と一緒に回すと、首の付け根が背中の板にめり込む。
    // 首の上端の「段」（pivot が head のブロック）が頭の回転の中心になる
    const def = byId[it.part], onBody = def.cat === '首', mov = it.mov.map((v, i) => at[i] + k * v), scal = it.scal.map(v => v * k), R = rotMatrix(it.rot ?? [0, 0, 0]), e = new THREE.Euler().setFromRotationMatrix(R, 'XYZ');
    return shapesOf(def).map(({ pc, shape }) => {
      const off = new THREE.Vector3(pc.pos[0] * scal[0], pc.pos[1] * scal[1], pc.pos[2] * scal[2]).applyMatrix4(R), { pos, ...rest } = pc;
      return { ...rest, name: `頭・${it.name ?? def.name}・${pc.name}`, ...shape, pos: [mov[0] + off.x, mov[1] + off.y, mov[2] + off.z], rot: [e.x, e.y, e.z], scl: scal.slice(),
        bone: onBody ? 'torso' : 'head', pivot: onBody && pc.pivot === 'head' ? 'head' : 'none', gun: false, glow: !!pc.glow, noHit: !!pc.noHit, ...paintOf(pc, def) };
    });
  });
  const body = bodyParts(items.filter(it => !isHead(it.part)), adj, null);
  // 体の色：bodyParts の部品は、置いたパーツの順・ブロックの順に並ぶ
  let n = 0;
  for (const it of items.filter(x => !isHead(x.part))) { const def = byId[it.part]; if (def.free) { n += freeParts(def, it, freeShapes).length; continue; } for (const pc of def.pieces) if (!isSub(pc)) Object.assign(body.parts[n++], paintOf(pc, def)); }
  const nW = items.filter(held).reduce((a, it) => a + freeParts(byId[it.part], it, freeShapes).length, 0);
  return { parts: [...body.parts.slice(0, nW), ...head, ...body.parts.slice(nW)], anchors: body.anchors, head: head.length > 0 || items.some(it => byId[it.part]?.free) };
}
/** 機体の JSON を読む前に：入っている自分のパーツを目次に入れる（もう入っている id はそのまま） */
export function registerUnit(doc) { for (const def of Object.values(doc.userParts ?? {})) if (def?.id && Array.isArray(def.pieces) && !byId[def.id]) registerUser(def); }
