// 取り込んだ形（GLB）：読み込み・三角形を減らす・骨への割り当て・関節の球での切り分け・切り口をふさぐ・ブロックの部品への変換・関節と切り分けの画面（3 面図）。
// 機体エディタ（index.html。捨てる予定）の同じ処理を、機体エディタ Ver2 用に移したもの（tools/_genmesh.py が index.html から写して作る。処理の中身は同じ）。
// 形とテクスチャは大きいので IndexedDB（xs-editor-meshes。機体エディタと同じ置き場）に id で入れ、部品（ブロック）は id だけを持つ。
// 部品（ブロック）の持つもの：kind 'mesh'、mesh（形の id）、rig（骨が回る点）、joints（関節の球）、regions（手で骨に付けた所）、wings、fromBones、mid、
// 置き方は tf { p, r（度）, s }（機体エディタの部品のままなら pos・rot（ラジアン）・scl）。
// HOST：使う側（v2.js）が渡す { note(text, warn), loaded(id), changed(part), closed(part) }
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { E1 } from './freeparts.js';

let HOST = {};
export function setMeshHost(h) { HOST = h; }
const $ = s => document.querySelector(s);
const DEG = Math.PI / 180;
const posOf = p => p.tf?.p ?? p.pos ?? [0, 0, 0];
const rotOf = p => (p.tf ? (p.tf.r ?? [0, 0, 0]).map(v => v * DEG) : (p.rot ?? [0, 0, 0]).slice());
const sclOf = p => (p.tf?.s ?? p.scl ?? [1, 1, 1]).slice();
const matOf = p => new THREE.Matrix4().compose(new THREE.Vector3(...posOf(p)), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotOf(p))), new THREE.Vector3(...sclOf(p)));
const JT_VIEWS = { front: { eye: [0, 0, 1], right: [1, 0, 0] }, side: { eye: [1, 0, 0], right: [0, 0, -1] }, back: { eye: [0, 0, -1], right: [-1, 0, 0] } };

// ======== 読み込み（index.html「imported meshes」） ========
export const MESHES = new Map();          // id -> { geo, lod1, tex, texId }
const MESH_DB = 'xs-editor-meshes';
function meshDb() {
  return new Promise((ok, ng) => {
    const r = indexedDB.open(MESH_DB, 1);
    r.onupgradeneeded = () => { r.result.createObjectStore('mesh'); r.result.createObjectStore('tex'); };
    r.onsuccess = () => ok(r.result); r.onerror = () => ng(r.error);
  });
}
async function dbPut(store, key, value) {
  const db = await meshDb();
  await new Promise((ok, ng) => { const t = db.transaction(store, 'readwrite'); t.objectStore(store).put(value, key); t.oncomplete = ok; t.onerror = () => ng(t.error); });
}
async function dbGet(store, key) {
  const db = await meshDb();
  return new Promise((ok, ng) => { const r = db.transaction(store).objectStore(store).get(key); r.onsuccess = () => ok(r.result); r.onerror = () => ng(r.error); });
}
const meshGeo = (m, index) => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(m.pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(m.nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(m.uv, 2));
  if (m.skinI) {   // a skinned import: up to 4 bones per vertex (indices into IMPORT_BONES) and their weights
    g.setAttribute('skinIndex', new THREE.BufferAttribute(m.skinI, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(m.skinW, 4));
  }
  g.setIndex(new THREE.BufferAttribute(index, 1));
  g.computeBoundingBox();
  return g;
};
const textureCache = new Map();    // texture id -> Promise<THREE.Texture>
function textureOf(texId) {
  if (!texId) return Promise.resolve(null);
  if (!textureCache.has(texId)) textureCache.set(texId, dbGet('tex', texId).then(async blob => {
    if (!blob) return null;
    const t = new THREE.Texture(await createImageBitmap(blob, { imageOrientation: 'none' }));
    t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.userData.mimeType = 'image/jpeg'; t.needsUpdate = true;
    return t;
  }));
  return textureCache.get(texId);
}
// Where a texture is darkest over a small patch (so the spot is a colour, not a seam): the uv the caps of cut pieces take.
function darkestSpot(tex) {
  const img = tex?.image;
  if (!img) return [0, 0];
  const N = 64, cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const x = cv.getContext('2d', { willReadFrequently: true });
  x.drawImage(img, 0, 0, N, N);
  const d = x.getImageData(0, 0, N, N).data, lum = i => d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11;
  let best = [0.5, 0.5], bl = Infinity;
  for (let py = 1; py < N - 1; py++) for (let px = 1; px < N - 1; px++) {
    let sum = 0, hi = 0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const l = lum((py + j) * N + px + i); sum += l; hi = Math.max(hi, l); }
    if (hi - sum / 9 > 12) continue;   // not a flat patch
    if (sum < bl) { bl = sum; best = [(px + 0.5) / N, (py + 0.5) / N]; }   // (flipY off: v runs down the image)
  }
  return best;
}
const meshLoading = new Set();
export function ensureMeshes(ids) {
  for (const id of ids) {
    if (!id || MESHES.has(id) || meshLoading.has(id)) continue;
    meshLoading.add(id);
    dbGet('mesh', id).then(async m => {
      if (!m) return;
      const geo = meshGeo(m, m.index), lod1 = meshGeo(m, m.lod1), tex = await textureOf(m.texId);
      MESHES.set(id, { geo, lod1, base: geo, baseLod1: lod1, tex, texId: m.texId, darkUV: darkestSpot(tex) });
      HOST.loaded?.(id);
    }).catch(() => {}).finally(() => meshLoading.delete(id));
  }
}
const MESH_PLACEHOLDER = new THREE.BoxGeometry(0.1, 0.1, 0.1).toNonIndexed();
export function meshGeometry(p) {
  const m = MESHES.get(p.mesh);
  if (!m) { ensureMeshes([p.mesh]); return MESH_PLACEHOLDER; }
  return p._lod ? m.lod1 : m.geo;
}

// Where each triangle goes: the nearest bone of a standard figure 3 units tall (front +Z, +X = the XS's left),
// measured from the capsule of each bone. What rides on the body rather than the limbs stays on the torso / hips:
// anything well behind the back above the knees (wings, packs), anything above the shoulders off the centre line
// (shoulder tops, wing tips), and anything far from every limb (hip guns, big fins).
const FIGURE = [
  ['head', 'head', [0, 2.7, 0], [0, 2.95, 0], 0.13],
  ['torso', 'torso', [0, 2.0, 0], [0, 2.6, 0], 0.26],
  ['hips', 'hips', [0, 1.72, 0], [0, 1.95, 0], 0.2],
  ['arm', '上腕', [0.42, 2.55, 0], [0.5, 2.02, 0], 0.1],
  ['fore', '前腕・手', [0.5, 1.98, 0], [0.53, 1.25, 0], 0.1],
  ['leg', '太もも', [0.2, 1.8, 0], [0.28, 1.05, 0], 0.13],
  ['shin', 'すね・足', [0.29, 1.0, 0], [0.32, 0.03, 0.05], 0.14],
];
const FIGURE_NAME = { head: '頭', torso: '胴', hips: '腰', wing: '翼' };
// where each bone turns (x for the left side; the right is mirrored): neck, waist, hip root, shoulder, elbow, hip, knee
const FIGURE_PIVOT = { head: [0, 2.66, 0], torso: [0, 1.98, 0], hips: [0, 1.84, 0], arm: [0.42, 2.55, 0], fore: [0.5, 2.0, 0], leg: [0.2, 1.84, 0], shin: [0.29, 1.02, 0], wing: [0.22, 2.4, -0.3] };
// The bones an import is skinned to, and each vertex's weights: the wings (behind the back off the centre line, or
// above the shoulders behind them) go wholly on their wing; everything else on the nearest bones of the figure,
// measured from each bone's capsule, blended smoothly where two meet (a joint bends the surface instead of tearing it).
export const IMPORT_BONES = ['hips', 'torso', 'head', 'arm_l', 'arm_r', 'forearm_l', 'forearm_r', 'leg_l', 'leg_r', 'shin_l', 'shin_r', 'wing_l', 'wing_r'];
const IMPORT_PARENT = { torso: 'hips', head: 'torso', arm_l: 'torso', arm_r: 'torso', forearm_l: 'arm_l', forearm_r: 'arm_r', leg_l: 'hips', leg_r: 'hips', shin_l: 'leg_l', shin_r: 'leg_r', wing_l: 'torso', wing_r: 'torso' };
const BLEND = 0.035;   // how wide the blend across a joint is (units; the figure is 3 tall)
function weightsAt(x, y, z, a = new THREE.Vector3(), b = new THREE.Vector3(), q = new THREE.Vector3(), seg = new THREE.Line3(), c = new THREE.Vector3()) {
  const wing = x > 0 ? 'wing_l' : 'wing_r';
  if ((z < -0.28 && y > 1.1 && Math.abs(x) > 0.18) || (y > 2.58 && Math.abs(x) > 0.24 && z < -0.12)) return [[IMPORT_BONES.indexOf(wing), 1]];
  const ds = [];
  for (const [group, , p0, p1, r] of FIGURE) {
    const center = group === 'head' || group === 'torso' || group === 'hips', sx = center ? 1 : Math.sign(x) || 1;
    seg.set(a.set(p0[0] * sx, p0[1], p0[2]), b.set(p1[0] * sx, p1[1], p1[2]));
    const name = center ? group : `${group === 'fore' ? 'forearm' : group}_${sx > 0 ? 'l' : 'r'}`;
    ds.push([IMPORT_BONES.indexOf(name), seg.closestPointToPoint(q.set(x, y, z), true, c).distanceTo(q) - r]);
  }
  // blend only across a real joint: the nearest bone with its parent or children (a thigh beside the hand must
  // not follow the arm, or turning the upper body drags the legs along)
  const best = ds.reduce((m, d) => (d[1] < m[1] ? d : m)), bn = IMPORT_BONES[best[0]];
  const near = new Set([bn, IMPORT_PARENT[bn], ...IMPORT_BONES.filter(n => IMPORT_PARENT[n] === bn)]);
  const dmin = best[1];
  const w = ds.filter(([k]) => near.has(IMPORT_BONES[k])).map(([k, d]) => [k, Math.exp(-(d - dmin) / BLEND)]).sort((m, n) => n[1] - m[1]).slice(0, 3).filter(([, v]) => v > 0.03);
  const sum = w.reduce((t, [, v]) => t + v, 0);
  return w.map(([k, v]) => [k, v / sum]);
}
function skinWeights(pos) {
  const n = pos.length / 3, skinI = new Uint16Array(n * 4), skinW = new Float32Array(n * 4);
  for (let v = 0; v < n; v++) weightsAt(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]).forEach(([k, w], i) => { skinI[v * 4 + i] = k; skinW[v * 4 + i] = w; });
  return { skinI, skinW };
}

// .glb -> one indexed mesh (position, normal, uv) in editor space: 3 units tall, feet at 0, centred; its colour map
async function readModel(buf) {
  const gltf = await new GLTFLoader().parseAsync(buf, '');
  gltf.scene.updateMatrixWorld(true);
  const list = [];
  let map = null;
  // only the nearest level of detail: a game .glb also carries lighter copies (_lod1, _lod2: boxes) of the same XS
  gltf.scene.traverse(o => { if (o.isMesh && !/lod[12]$/i.test(o.name.replace(/[^a-z0-9]/gi, ''))) { list.push(o); map ??= [o.material].flat().find(m => m.map)?.map ?? null; } });
  if (!list.length) throw new Error('形（メッシュ）が入っていません');
  // a model made for the game faces -Z (its right hand on +X, docs/models.md); glTF and the editor face +Z
  const hand = gltf.scene.getObjectByName('hand_r'), turn = !!hand && hand.getWorldPosition(new THREE.Vector3()).x > 0;
  // a model already rigged (Blender: an armature with automatic weights, bones named as docs/models.md) keeps its
  // weights: each vertex's bones by name onto IMPORT_BONES (other bones fall to the torso), and the bones' positions
  const boneKey = n => n.toLowerCase().replace(/[^a-z0-9]/g, '');
  const known = Object.fromEntries(IMPORT_BONES.map((n, i) => [boneKey(n), i]));
  const rigged = list.some(o => o.isSkinnedMesh && o.skeleton?.bones.some(b => boneKey(b.name) in known));
  const pos = [], nor = [], uv = [], index = [], skinI = [], skinW = [];
  const pivots = {};
  if (rigged) for (const o of list) if (o.isSkinnedMesh) for (const b of o.skeleton.bones) {
    const k = known[boneKey(b.name)];
    if (k !== undefined) pivots[IMPORT_BONES[k]] ??= b.getWorldPosition(new THREE.Vector3());
  }
  for (const o of list) {
    const g = o.geometry, base = pos.length / 3, nm = new THREE.Matrix3().getNormalMatrix(o.matrixWorld), v = new THREE.Vector3();
    const P = g.attributes.position, N = g.attributes.normal, T = g.attributes.uv;
    const SI = rigged && o.isSkinnedMesh ? g.attributes.skinIndex : null, SW = SI ? g.attributes.skinWeight : null;
    const toImport = SI ? o.skeleton.bones.map(b => known[boneKey(b.name)] ?? IMPORT_BONES.indexOf('torso')) : null;
    for (let i = 0; i < P.count; i++) {
      if (rigged) for (let k = 0; k < 4; k++) {
        skinI.push(SI ? toImport[SI.getComponent(i, k)] ?? 1 : k ? 0 : IMPORT_BONES.indexOf('torso'));
        skinW.push(SI ? SW.getComponent(i, k) : k ? 0 : 1);
      }
      v.fromBufferAttribute(P, i).applyMatrix4(o.matrixWorld); pos.push(v.x, v.y, v.z);
      if (N) { v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize(); nor.push(v.x, v.y, v.z); } else nor.push(0, 1, 0);
      uv.push(T ? T.getX(i) : 0, T ? T.getY(i) : 0);
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) index.push(base + g.index.getX(i));
    else for (let i = 0; i < P.count; i++) index.push(base + i);
  }
  const P = new Float32Array(pos), box = new THREE.Box3().setFromArray(P), s = 3 / Math.max(1e-6, box.max.y - box.min.y);
  const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2;
  const k = turn ? -1 : 1, N = new Float32Array(nor);
  for (let i = 0; i < P.length; i += 3) { P[i] = (P[i] - cx) * s * k; P[i + 1] = (P[i + 1] - box.min.y) * s; P[i + 2] = (P[i + 2] - cz) * s * k; N[i] *= k; N[i + 2] *= k; }
  const rig = rigged ? Object.fromEntries(Object.entries(pivots).map(([n, p]) => [n, [(p.x - cx) * s * k, (p.y - box.min.y) * s, (p.z - cz) * s * k]])) : null;
  return { pos: P, nor: N, uv: new Float32Array(uv), index: new Uint32Array(index), map,
    skinI: rigged ? new Uint16Array(skinI) : null, skinW: rigged ? new Float32Array(skinW) : null, rig };
}
// the colour map as a JPEG no larger than 2048 (the game's limit)
async function textureBlob(map) {
  if (!map?.image) return null;
  const img = map.image, k = Math.min(1, 2048 / Math.max(img.width, img.height));
  const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return new Promise(ok => c.toBlob(ok, 'image/jpeg', 0.9));
}
// the triangles of one region as a compact mesh in its own frame (centred on its box)
function regionMesh(src, tris) {
  const remap = new Map(), pos = [], nor = [], uv = [], index = [], skinI = [], skinW = [];
  for (const t of tris) for (let k = 0; k < 3; k++) {
    const v = src.index[t * 3 + k];
    let n = remap.get(v);
    if (n === undefined) {
      n = remap.size; remap.set(v, n); pos.push(src.pos[v * 3], src.pos[v * 3 + 1], src.pos[v * 3 + 2]); nor.push(src.nor[v * 3], src.nor[v * 3 + 1], src.nor[v * 3 + 2]); uv.push(src.uv[v * 2], src.uv[v * 2 + 1]);
      if (src.skinI) for (let k = 0; k < 4; k++) { skinI.push(src.skinI[v * 4 + k]); skinW.push(src.skinW[v * 4 + k]); }
    }
    index.push(n);
  }
  return { pos: new Float32Array(pos), nor: new Float32Array(nor), uv: new Float32Array(uv), index: new Uint32Array(index), skinI: src.skinI ? new Uint16Array(skinI) : null, skinW: src.skinW ? new Float32Array(skinW) : null };
}
export async function importModel(file) {
  const note = m => HOST.note?.(m);
  note(`「${file.name}」を読み込んでいます…`);
  const { MeshoptSimplifier: S } = await import('https://cdn.jsdelivr.net/npm/meshoptimizer@0.22.0/meshopt_simplifier.module.js');
  await S.ready;
  const src = await readModel(await file.arrayBuffer());
  const inTris = src.index.length / 3;
  note(`三角形 ${inTris.toLocaleString()} 個を減らしています…`);
  await new Promise(r => setTimeout(r, 30));
  // LOD0 within the game's 30,000 (a little under); LOD1 about 5,000 over all the parts
  const simplify = (index, n) => (index.length / 3 <= n ? index : S.simplify(index, src.pos, 3, n * 3, 0.05, [])[0]);
  const lod0 = simplify(src.index, 27000), lod1 = simplify(lod0, 4500);
  const texId = 't' + Date.now().toString(36);
  const blob = await textureBlob(src.map);
  if (blob) await dbPut('tex', texId, blob);
  // one mesh: LOD0 and LOD1 on their own vertices, centred on the model's box; weights from the rest shape
  const tris = idx => [...Array(idx.length / 3).keys()];
  const m = regionMesh({ ...src, index: lod0 }, tris(lod0)), l = regionMesh({ ...src, index: lod1 }, tris(lod1));
  const wm = m.skinI ? { skinI: m.skinI, skinW: m.skinW } : skinWeights(m.pos), wl = l.skinI ? { skinI: l.skinI, skinW: l.skinW } : skinWeights(l.pos);
  const c = new THREE.Box3().setFromArray(m.pos).getCenter(new THREE.Vector3());
  for (const a of [m.pos, l.pos]) for (let i = 0; i < a.length; i += 3) { a[i] -= c.x; a[i + 1] -= c.y; a[i + 2] -= c.z; }
  const join = (A, B, T) => { const o = new T(A.length + B.length); o.set(A); o.set(B, A.length); return o; };
  const base = m.pos.length / 3;
  const id = 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  await dbPut('mesh', id, {
    pos: join(m.pos, l.pos, Float32Array), nor: join(m.nor, l.nor, Float32Array), uv: join(m.uv, l.uv, Float32Array),
    index: m.index, lod1: new Uint32Array(l.index.map(i => i + base)), texId: blob ? texId : null,
    skinI: join(wm.skinI, wl.skinI, Uint16Array), skinW: join(wm.skinW, wl.skinW, Float32Array),
  });
  // where each bone turns, in the part's frame
  const rig = {};
  for (const name of IMPORT_BONES) {
    const group = name.replace(/_[lr]$/, '').replace('forearm', 'fore'), sx = name.endsWith('_r') ? -1 : 1, pv = FIGURE_PIVOT[group];
    const p = src.rig?.[name] ?? [pv[0] * sx, pv[1], pv[2]];   // a rigged model's own bones, else the standard figure
    rig[name] = [p[0] - c.x, p[1] - c.y, p[2] - c.z].map(v => +v.toFixed(5));
  }
  const usesWings = [...wm.skinI].some(k => IMPORT_BONES[k]?.startsWith('wing'));
  // the right hand (where the game puts the saber's grip and the grenade): the lower end of what rides on forearm_r
  const fr = IMPORT_BONES.indexOf('forearm_r'), ys = [];
  for (let v = 0; v < m.pos.length / 3; v++) if (wm.skinI[v * 4] === fr && wm.skinW[v * 4] > 0.6) ys.push(v);
  if (ys.length) {
    const lo = Math.min(...ys.map(v => m.pos[v * 3 + 1])), hi = Math.max(...ys.map(v => m.pos[v * 3 + 1])), cut = lo + 0.15 * (hi - lo);
    const hand = new THREE.Vector3(); let n = 0;
    for (const v of ys) if (m.pos[v * 3 + 1] <= cut) { hand.add(new THREE.Vector3(m.pos[v * 3], m.pos[v * 3 + 1], m.pos[v * 3 + 2])); n++; }
    rig.hand_r = hand.multiplyScalar(1 / n).toArray().map(v => +v.toFixed(5));   // m.pos is already centred
  }
  if (!usesWings) { delete rig.wing_l; delete rig.wing_r; }
  const made = [{ ...E1, name: '取り込んだ形', kind: 'mesh', mesh: id, bone: 'torso', rig, color: '#c8ccd4', metal: 0.3, rough: 0.6, pos: c.toArray().map(v => +v.toFixed(5)), fromBones: src.skinI ? true : null }];
  return { made, inTris, outTris: lod0.length / 3, usesWings, rigged: !!src.skinI };
}

// ======== 関節の球と切り分け（index.html「joints and cuts」） ========
const JOINT_DEFS = [   // joint, the bone it turns, default centre (figure: 3 tall, front +Z, +X = left), radius, where the bone points
  ['neck', 'head', [0, 2.64, 0], 0.16], ['waist', 'torso', [0, 2.0, 0], 0.3],
  ['shoulder_l', 'arm_l', [0.42, 2.52, 0], 0.2], ['elbow_l', 'forearm_l', [0.5, 1.98, 0], 0.16],
  ['hip_l', 'leg_l', [0.2, 1.8, 0], 0.2], ['knee_l', 'shin_l', [0.28, 1.04, 0.02], 0.2],
  ['wing_l', 'wing_l', [0.24, 2.4, -0.3], 0.22],
];
const JOINT_NAME = { neck: '首', waist: '腰（胴の下）', shoulder: '肩', elbow: 'ひじ', hip: '股関節', knee: 'ひざ', wing: '翼の付け根' };
const jointList = wings => {
  const out = [];
  for (const [n, bone, p, r] of JOINT_DEFS) {
    if (n.startsWith('wing') && !wings) continue;
    if (n.endsWith('_l')) {
      out.push([n, bone, p, r]);
      out.push([n.replace(/_l$/, '_r'), bone.replace(/_l$/, '_r'), [-p[0], p[1], p[2]], r]);
    } else out.push([n, bone, p, r]);
  }
  return out;
};
const V3 = a => new THREE.Vector3(...a);
// the way each joint's bone points (the disc is square to it)
function jointAxis(J, n) {
  const s = n.endsWith('_r') ? '_r' : '_l', sx = s === '_r' ? -1 : 1;
  const d = (a, b) => (J[a] && J[b] ? V3(J[b].p).sub(V3(J[a].p)).normalize() : null);
  switch (n.replace(/_[lr]$/, '')) {
    case 'neck': case 'waist': return new THREE.Vector3(0, 1, 0);
    case 'shoulder': case 'elbow': return d('shoulder' + s, 'elbow' + s) ?? new THREE.Vector3(0.15 * sx, -1, 0).normalize();
    case 'hip': case 'knee': return d('hip' + s, 'knee' + s) ?? new THREE.Vector3(0.1 * sx, -1, 0).normalize();
    case 'wing': return new THREE.Vector3(0.55 * sx, -0.65, -0.52).normalize();
  }
  return new THREE.Vector3(0, 1, 0);
}
// the default seeds: a point well inside each bone's part, from the joints
function jointSeeds(J) {
  const P = n => V3(J[n].p), out = [];
  const add = (bone, v) => out.push({ p: v.toArray(), bone });
  add('head', P('neck').add(new THREE.Vector3(0, 0.2, 0.03)));
  add('torso', P('neck').lerp(P('waist'), 0.45).add(new THREE.Vector3(0, 0, 0.12)));
  add('hips', P('waist').lerp(P('hip_l').lerp(P('hip_r'), 0.5), 0.6).add(new THREE.Vector3(0, 0, 0.1)));
  for (const s of ['l', 'r']) {
    const sh = P('shoulder_' + s), el = P('elbow_' + s), hp = P('hip_' + s), kn = P('knee_' + s);
    add('arm_' + s, sh.clone().lerp(el, 0.55));
    add('forearm_' + s, el.clone().add(el.clone().sub(sh).multiplyScalar(0.6)));
    add('leg_' + s, hp.clone().lerp(kn, 0.5));
    add('shin_' + s, kn.clone().add(kn.clone().sub(hp).multiplyScalar(0.6)));
    if (J['wing_' + s]) for (const k of [0.6, 1.0]) add('wing_' + s, P('wing_' + s).add(jointAxis(J, 'wing_' + s).multiplyScalar(k)));   // two points out along the wing
  }
  return out;
}
// every LOD0 vertex's bone (index into IMPORT_BONES), from the joints and seeds; also what went wrong
// a lasso's points are in its view's plane: [along the view's right, height]; it goes right through the view
const viewUV = (view, x, y, z) => { const r = JT_VIEWS[view].right; return [x * r[0] + z * r[2], y]; };
function inPoly(pts, u, v) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [ui, vi] = pts[i], [uj, vj] = pts[j];
    if ((vi > v) !== (vj > v) && u < (uj - ui) * (v - vi) / (vj - vi) + ui) inside = !inside;
  }
  return inside;
}
// lassos in one view join (drawn with Shift); those of different views meet
function inLassos(lassos, x, y, z) {
  const views = new Set(lassos.map(l => l.view));
  for (const view of views) {
    const [u, v] = viewUV(view, x, y, z);
    if (!lassos.some(l => l.view === view && inPoly(l.pts, u, v))) return false;
  }
  return true;
}
// inside all of a region's lassos and none of its cut-outs (drawn with Alt)
const inRegion = (rg, x, y, z) => rg.lassos.length > 0 && inLassos(rg.lassos, x, y, z) && !(rg.subs ?? []).some(l => inPoly(l.pts, ...viewUV(l.view, x, y, z)));
// The mesh's faces and which faces meet along each edge (corners welded by position), for picking plates.
function meshTopo(entry) {
  if (entry.topo) return entry.topo;
  const g = entry.base, P = g.attributes.position.array, I = g.index.array, F = I.length / 3;
  let n0 = 0; for (let i = 0; i < I.length; i++) if (I[i] + 1 > n0) n0 = I[i] + 1;
  const weld = new Int32Array(n0), keys = new Map();
  for (let v = 0; v < n0; v++) { const k = `${Math.round(P[v * 3] * 2e3)},${Math.round(P[v * 3 + 1] * 2e3)},${Math.round(P[v * 3 + 2] * 2e3)}`; if (!keys.has(k)) keys.set(k, keys.size); weld[v] = keys.get(k); }
  const fn = new Float32Array(F * 3), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let f = 0; f < F; f++) {
    a.fromArray(P, I[f * 3] * 3); b.fromArray(P, I[f * 3 + 1] * 3); c.fromArray(P, I[f * 3 + 2] * 3);
    b.sub(a); c.sub(a); b.cross(c).normalize(); fn[f * 3] = b.x; fn[f * 3 + 1] = b.y; fn[f * 3 + 2] = b.z;
  }
  const edges = new Map(), vf = Array.from({ length: keys.size }, () => []), adj = Array.from({ length: F }, () => []);
  for (let f = 0; f < F; f++) for (let e = 0; e < 3; e++) {
    const u = weld[I[f * 3 + e]], w = weld[I[f * 3 + (e + 1) % 3]];
    vf[u].push(f);
    const k = u < w ? u * 1e7 + w : w * 1e7 + u;
    const list = edges.get(k);
    if (list) { for (const g2 of list) { adj[f].push(g2); adj[g2].push(f); } list.push(f); } else edges.set(k, [f]);
  }
  return (entry.topo = { n0, weld, fn, vf, adj, F, cache: new Map() });
}
// the plate under a pick: from the face at the picked point, across every edge where the surface bends less than the
// pick's angle; the result marks LOD0 vertices
function plateMask(entry, pk) {
  const T = meshTopo(entry), key = JSON.stringify(pk);
  if (T.cache.has(key)) return T.cache.get(key);
  const P = entry.base.attributes.position.array, I = entry.base.index.array;
  let best = 0, bd = Infinity;
  for (let v = 0; v < T.n0; v++) { const d = (P[v * 3] - pk.p[0]) ** 2 + (P[v * 3 + 1] - pk.p[1]) ** 2 + (P[v * 3 + 2] - pk.p[2]) ** 2; if (d < bd) { bd = d; best = v; } }
  let seed = -1, sd = -2;
  for (const f of T.vf[T.weld[best]]) { const d = T.fn[f * 3] * pk.n[0] + T.fn[f * 3 + 1] * pk.n[1] + T.fn[f * 3 + 2] * pk.n[2]; if (d > sd) { sd = d; seed = f; } }
  const cos = Math.cos(pk.a * Math.PI / 180), inF = new Uint8Array(T.F), stack = [seed], selW = new Uint8Array(T.vf.length);
  if (seed >= 0) inF[seed] = 1;
  while (stack.length) {
    const f = stack.pop();
    for (let k = 0; k < 3; k++) selW[T.weld[I[f * 3 + k]]] = 1;
    for (const g of T.adj[f]) if (!inF[g] && T.fn[f * 3] * T.fn[g * 3] + T.fn[f * 3 + 1] * T.fn[g * 3 + 1] + T.fn[f * 3 + 2] * T.fn[g * 3 + 2] >= cos) { inF[g] = 1; stack.push(g); }
  }
  const mask = new Uint8Array(T.n0);
  for (let v = 0; v < T.n0; v++) mask[v] = selW[T.weld[v]];
  if (T.cache.size > 200) T.cache.clear();
  T.cache.set(key, mask);
  return mask;
}
// every face's plate: faces joined across edges where the surface bends less than the angle
function platesOf(entry, angle) {
  const T = meshTopo(entry), key = 'plates' + angle;
  if (T.cache.has(key)) return T.cache.get(key);
  const cos = Math.cos(angle * Math.PI / 180), id = new Int32Array(T.F).fill(-1);
  let n = 0;
  for (let s0 = 0; s0 < T.F; s0++) {
    if (id[s0] >= 0) continue;
    const stack = [s0]; id[s0] = n;
    while (stack.length) {
      const f = stack.pop();
      for (const g of T.adj[f]) if (id[g] < 0 && T.fn[f * 3] * T.fn[g * 3] + T.fn[f * 3 + 1] * T.fn[g * 3 + 1] + T.fn[f * 3 + 2] * T.fn[g * 3 + 2] >= cos) { id[g] = n; stack.push(g); }
    }
    n++;
  }
  const r = { id, n };
  T.cache.set(key, r);
  return r;
}
// a vertex mask widened or narrowed to whole plates: a plate is in when at least half its faces' corners are
function snapToPlates(entry, raw, angle) {
  const T = meshTopo(entry), I = entry.base.index.array, { id, n } = platesOf(entry, angle);
  const inC = new Uint32Array(n), all = new Uint32Array(n);
  for (let f = 0; f < T.F; f++) for (let k = 0; k < 3; k++) { all[id[f]]++; if (raw[I[f * 3 + k]]) inC[id[f]]++; }
  const selW = new Uint8Array(T.vf.length);
  for (let f = 0; f < T.F; f++) if (inC[id[f]] * 2 >= all[id[f]] && inC[id[f]] > 0) for (let k = 0; k < 3; k++) selW[T.weld[I[f * 3 + k]]] = 1;
  const out = new Uint8Array(T.n0);
  for (let v = 0; v < T.n0; v++) out[v] = selW[T.weld[v]];
  return out;
}
// a region over the LOD0 vertices: (in its lassos, or on a picked plate) and not cut out (Alt lasso, Alt click);
// with snap (an angle) its lassos take and cut out whole plates
function regionMask(entry, rg) {
  const T = meshTopo(entry), B = entry.base.attributes.position.array, out = new Uint8Array(T.n0);
  const or = list => { const m = new Uint8Array(T.n0); for (const pk of list ?? []) { const pm = plateMask(entry, pk); for (let v = 0; v < T.n0; v++) m[v] |= pm[v]; } return m; };
  const picked = or(rg.picks), unpicked = or(rg.unpicks);
  let inL = new Uint8Array(T.n0), inS = new Uint8Array(T.n0);
  for (let v = 0; v < T.n0; v++) {
    const x = B[v * 3], y = B[v * 3 + 1], z = B[v * 3 + 2];
    if (rg.lassos?.length && inLassos(rg.lassos, x, y, z)) inL[v] = 1;
    if ((rg.subs ?? []).some(l => inPoly(l.pts, ...viewUV(l.view, x, y, z)))) inS[v] = 1;
  }
  if (rg.snap) { inL = snapToPlates(entry, inL, rg.snap); if (rg.subs?.length) inS = snapToPlates(entry, inS, rg.snap); }
  for (let v = 0; v < T.n0; v++) out[v] = (picked[v] || inL[v]) && !inS[v] && !unpicked[v] ? 1 : 0;
  return out;
}
function cutAssign(entry, J, regions, fromBones = false) {
  const g = entry.base, P = g.attributes.position.array, I = g.index.array;
  let n0 = 0; for (let i = 0; i < I.length; i++) if (I[i] + 1 > n0) n0 = I[i] + 1;
  // weld corners that share a position (texture seams split them)
  const weld = new Int32Array(n0), keys = new Map();
  for (let v = 0; v < n0; v++) { const k = `${Math.round(P[v * 3] * 2e3)},${Math.round(P[v * 3 + 1] * 2e3)},${Math.round(P[v * 3 + 2] * 2e3)}`; if (!keys.has(k)) keys.set(k, keys.size); weld[v] = keys.get(k); }
  const parent = new Int32Array(keys.size).map((_, i) => i);
  const find = x => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  const discs = Object.entries(J).map(([n, j]) => ({ c: V3(j.p), n: jointAxis(J, n), r: j.r }));
  const a = new THREE.Vector3(), b = new THREE.Vector3(), q = new THREE.Vector3();
  const cuts = (u, w) => {
    a.fromArray(P, u * 3); b.fromArray(P, w * 3);
    for (const d of discs) {
      const da = q.subVectors(a, d.c).dot(d.n), db = q.subVectors(b, d.c).dot(d.n);
      if (da * db > 0 || da === db) continue;
      q.lerpVectors(a, b, da / (da - db));
      if (q.distanceTo(d.c) <= d.r) return true;
    }
    return false;
  };
  for (let t = 0; t < I.length; t += 3) for (let e = 0; e < 3; e++) {
    const u = I[t + e], w = I[t + (e + 1) % 3];
    if (!cuts(u, w)) { const ru = find(weld[u]), rw = find(weld[w]); if (ru !== rw) parent[ru] = rw; }
  }
  // each bone spreads from its seeds along the surface (the discs are walls): a vertex goes to the bone that reaches
  // it first, so a stray join (a gun touching a leg) does not hand the rest of one part to another
  const W = keys.size, adj = Array.from({ length: W }, () => []), pw = new Float32Array(W * 3);
  for (let v = 0; v < n0; v++) { const w = weld[v]; pw[w * 3] = P[v * 3]; pw[w * 3 + 1] = P[v * 3 + 1]; pw[w * 3 + 2] = P[v * 3 + 2]; }
  for (let t = 0; t < I.length; t += 3) for (let e = 0; e < 3; e++) {
    const u = I[t + e], w = I[t + (e + 1) % 3];
    if (!cuts(u, w)) { const a1 = weld[u], b1 = weld[w]; if (a1 !== b1) { adj[a1].push(b1); adj[b1].push(a1); } }
  }
  const nearestW = p => { let best = 0, bd = Infinity; for (let w = 0; w < W; w++) { const d = (pw[w * 3] - p[0]) ** 2 + (pw[w * 3 + 1] - p[1]) ** 2 + (pw[w * 3 + 2] - p[2]) ** 2; if (d < bd) { bd = d; best = w; } } return best; };
  const dist = new Float32Array(W).fill(Infinity), owner = new Int8Array(W).fill(-1);
  const heap = [];   // [d, w, bone] binary heap
  const push = x => { heap.push(x); let i = heap.length - 1; while (i) { const p2 = (i - 1) >> 1; if (heap[p2][0] <= heap[i][0]) break; [heap[p2], heap[i]] = [heap[i], heap[p2]]; i = p2; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  // where a bone may spread from the figure's seeds: on its own side of its joints (below the knee for the shin, above
  // it for the thigh), near each joint (within 2.5 radii of the line through it). A disc alone leaves a gap round its
  // edge on a thick fused mesh, and a whole thigh can leak through it.
  const side = [];   // per bone: [centre, axis, +1 = the far side / -1 = the near side, reach]
  const zone = (bone, n, sgn) => { if (J[n]) (side[IMPORT_BONES.indexOf(bone)] ??= []).push([V3(J[n].p), jointAxis(J, n), sgn, J[n].r * 2.5]); };
  zone('head', 'neck', 1); zone('torso', 'waist', 1); zone('hips', 'waist', -1);
  for (const s of ['l', 'r']) {
    zone('arm_' + s, 'shoulder_' + s, 1); zone('arm_' + s, 'elbow_' + s, -1); zone('forearm_' + s, 'elbow_' + s, 1);
    zone('leg_' + s, 'hip_' + s, 1); zone('leg_' + s, 'knee_' + s, -1); zone('shin_' + s, 'knee_' + s, 1);
    zone('wing_' + s, 'wing_' + s, 1);
  }
  const allowed = (b, x) => {
    for (const [c, n, sgn, R] of side[b] ?? []) {
      q.set(pw[x * 3] - c.x, pw[x * 3 + 1] - c.y, pw[x * 3 + 2] - c.z);
      const along = q.dot(n);
      if (along * sgn < 0 && q.lengthSq() - along * along < R * R) return false;
    }
    return true;
  };
  // what was given to a bone by hand (inside all of a region's lassos) is that bone's, exactly; a later region wins
  const edge = (w, x) => Math.hypot(pw[x * 3] - pw[w * 3], pw[x * 3 + 1] - pw[w * 3 + 1], pw[x * 3 + 2] - pw[w * 3 + 2]);
  const hand = new Uint8Array(W);
  for (const rg of regions) {
    const b = IMPORT_BONES.indexOf(rg.bone), m = regionMask(entry, rg), was = hand.slice();
    for (let v = 0; v < n0; v++) { const w = weld[v]; if (m[v] && !(rg.skip && was[w])) { owner[w] = b; hand[w] = 1; } }
  }
  // a shape imported with bones of its own (rigged in Blender, by hand or by an AI): the rest keeps the bone it came
  // with (each corner's heaviest), so fixing a few pieces by hand leaves everything else as it was
  const SI = entry.base.attributes.skinIndex, SW = entry.base.attributes.skinWeight;
  if (fromBones && SI && SW) for (let v = 0; v < n0; v++) {
    const w = weld[v];
    if (owner[w] >= 0) continue;
    let best = 0; for (let k = 1; k < 4; k++) if (SW.getComponent(v, k) > SW.getComponent(v, best)) best = k;
    owner[w] = SI.getComponent(v, best);
  }
  // the rest: each bone spreads from the figure's seeds, round what was given by hand
  for (const sd of jointSeeds(J)) push([0, nearestW(sd.p), IMPORT_BONES.indexOf(sd.bone)]);
  const done = new Uint8Array(W);
  for (let w = 0; w < W; w++) if (owner[w] >= 0) done[w] = 1;
  while (heap.length) {
    const [d, w, b] = pop();
    if (done[w]) continue;
    done[w] = 1; owner[w] = b; dist[w] = d;
    for (const x of adj[w]) if (!done[x] && allowed(b, x)) push([d + edge(w, x), x, b]);
  }
  // pieces no seed reaches (cut off by walls, or loose bits): the bone of the nearest reached vertex
  const reached = []; for (let w = 0; w < W; w++) if (owner[w] >= 0) reached.push(w);
  const bone = new Int8Array(n0), byHand = new Uint8Array(n0);
  for (let v = 0; v < n0; v++) byHand[v] = hand[weld[v]];
  const lost = new Map();
  for (let v = 0; v < n0; v++) { const w = weld[v]; if (owner[w] >= 0) bone[v] = owner[w]; else (lost.get(find(w)) || lost.set(find(w), []).get(find(w))).push(v); }
  for (const list of lost.values()) {
    let bestB = IMPORT_BONES.indexOf('torso'), bd = Infinity;
    for (let i = 0; i < list.length; i += Math.max(1, Math.floor(list.length / 30))) for (let j = 0; j < reached.length; j += 5) {
      const u = list[i], w = reached[j], d = (P[u * 3] - pw[w * 3]) ** 2 + (P[u * 3 + 1] - pw[w * 3 + 1]) ** 2 + (P[u * 3 + 2] - pw[w * 3 + 2]) ** 2;
      if (d < bd) { bd = d; bestB = owner[w]; }
    }
    for (const v of list) bone[v] = bestB;
  }
  const conflicts = [];
  return { bone, n0, byHand, conflicts: [...conflicts] };
}
export const BONE_LABEL = { hips: '腰', torso: '胴', head: '頭', arm_l: '上腕（左）', arm_r: '上腕（右）', forearm_l: '前腕（左）', forearm_r: '前腕（右）', leg_l: '太もも（左）', leg_r: '太もも（右）', shin_l: 'すね（左）', shin_r: 'すね（右）', foot_l: '足（左）', foot_r: '足（右）', wing_l: '翼（左）', wing_r: '翼（右）', skirt_front_l: '前スカート（左）', skirt_front_r: '前スカート（右）', skirt_back_l: '後ろスカート（左）', skirt_back_r: '後ろスカート（右）' };
const BONE_COLOR = { hips: '#e0503c', torso: '#e8d24a', head: '#f4f4f4', arm_l: '#3c8cff', arm_r: '#2a5fb0', forearm_l: '#2fe0e0', forearm_r: '#1a9a9a', leg_l: '#55d155', leg_r: '#2f8a2f', shin_l: '#a6e05a', shin_r: '#6b9a2f', foot_l: '#e0e05a', foot_r: '#9a9a2f', wing_l: '#c060e0', wing_r: '#8a3aa8', skirt_front_l: '#e0903c', skirt_front_r: '#a8642a', skirt_back_l: '#e07aa0', skirt_back_r: '#a8506e' };
// the part's joints (from its rig, else the standard figure)
export function ensureJoints(p) {
  if (p.joints) return p.joints;
  const J = {}, c = V3(posOf(p)).clone();   // the part's frame is its centre at import: joints are relative to pos
  const wings = p.wings ?? !!(p.rig && p.rig.wing_l);
  for (const [n, bone, def, r] of jointList(wings)) {
    const fromRig = p.rig?.[bone] ?? null;
    J[n] = { p: fromRig ? fromRig.slice() : [def[0] - c.x, def[1] - c.y, def[2] - c.z].map(v => +v.toFixed(4)), r };
  }
  p.wings = wings;
  return (p.joints = J);
}
// Every piece torn off along a cut is closed: the edges where a bone's faces now end but the shape went on (its faces
// meet another bone's there) are walked into loops, and each loop is capped with a fan from its middle, facing out. So a
// bent joint shows a solid end, not a hollow shell. Holes the shape had before the cut are left as they were.
function capCuts(entry, idx, faceBone, src, pos, nor, uv, si, from, out) {
  const T = meshTopo(entry), W = T.weld, K = 1e7;
  const rep = new Int32Array(T.vf.length).fill(-1);
  for (let v = 0; v < T.n0; v++) if (rep[W[v]] < 0) rep[W[v]] = v;
  // each directed edge (as its faces run) and the bones of the faces it belongs to
  const dir = new Map();
  for (let t = 0; t < idx.length; t += 3) {
    const b = faceBone(t / 3), w = [W[idx[t]], W[idx[t + 1]], W[idx[t + 2]]];
    for (let k = 0; k < 3; k++) {
      const u = w[k], v = w[(k + 1) % 3];
      if (u === v) continue;
      const key = u * K + v, list = dir.get(key);
      if (list) list.push(b); else dir.set(key, [b]);
    }
  }
  // a bone's open edges: its face runs u -> v and none of its own faces runs back v -> u. A cut edge (another bone's face
  // runs back) or the rim of a hole the shape had anyway: a loop is walked through both, so a cut that meets such a
  // hole still closes, but only a loop with a cut edge in it is capped
  const next = new Map(), cut = new Set();   // bone -> Map(u -> [v]); 'bone:u:v' of the cut edges
  for (const [key, bones] of dir) {
    const u = Math.floor(key / K), v = key % K, back = dir.get(v * K + u);
    for (const b of new Set(bones)) {
      if (back?.includes(b)) continue;
      const m = next.get(b) ?? next.set(b, new Map()).get(b);
      (m.get(u) ?? m.set(u, []).get(u)).push(v);
      if (back) cut.add(`${b}:${u}:${v}`);
    }
  }
  const P = src.position, a = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  for (const [b, m] of next) {
    for (const start of [...m.keys()]) {
      while (m.get(start)?.length) {
        const loop = [start];
        let cur = m.get(start).pop(), cuts = cut.has(`${b}:${start}:${cur}`) ? 1 : 0;
        while (cur !== start && loop.length < 4000) {
          loop.push(cur);
          const outs = m.get(cur);
          if (!outs?.length) { cur = -1; break; }
          const nx = outs.pop();
          if (cut.has(`${b}:${cur}:${nx}`)) cuts++;
          cur = nx;
        }
        if (cur !== start || loop.length < 3 || !cuts) continue;   // an open run (a tangle at a non-manifold corner), or an old hole: leave it
        c.set(0, 0, 0);
        for (const w of loop) c.add(a.fromBufferAttribute(P, rep[w]));
        c.divideScalar(loop.length);
        // the cap faces out: against the way the piece's own faces run round the loop
        n.set(0, 0, 0);
        for (let i = 0; i < loop.length; i++) {
          e1.fromBufferAttribute(P, rep[loop[(i + 1) % loop.length]]).sub(c); e2.fromBufferAttribute(P, rep[loop[i]]).sub(c);
          n.add(e1.cross(e2));
        }
        if (n.lengthSq() < 1e-12) continue;
        n.normalize();
        // a big twisted loop (a ragged border between bones, not a clean cut round a limb) would take a big dark sheet
        // that sticks out when the joint bends: better left open (the figure is 3 tall; a clean cut round a limb or the
        // waist is under 0.5 from its middle, or about flat)
        let reach = 0, off = 0;
        for (const w of loop) { a.fromBufferAttribute(P, rep[w]).sub(c); reach = Math.max(reach, a.length()); off = Math.max(off, Math.abs(a.dot(n))); }
        if (reach > 0.5 && off > 0.5 * reach) continue;
        // flat across the loop seen along its normal, cut into triangles that do not overlap (ear clipping), in one dark
        // colour (the texture's darkest spot), so the end reads as a closed block, not a smear
        const t = Math.abs(n.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
        t.sub(n.clone().multiplyScalar(t.dot(n))).normalize();
        const bt = new THREE.Vector3().crossVectors(n, t);
        const flat = loop.map(w => { a.fromBufferAttribute(P, rep[w]).sub(c); return new THREE.Vector2(a.dot(t), a.dot(bt)); });
        let tris;
        try { tris = THREE.ShapeUtils.triangulateShape(flat, []); } catch { tris = []; }
        const base = pos.length / 3, [du, dv] = entry.darkUV ?? [0, 0];
        for (const w of loop) { const v = rep[w]; pos.push(P.getX(v), P.getY(v), P.getZ(v)); nor.push(n.x, n.y, n.z); uv.push(du, dv); si.push(b, 0, 0, 0); from.push(v); }
        if (tris.length !== loop.length - 2) {
          // the loop crosses itself seen flat (a twisted cut): a fan from its middle still closes it
          const mid = pos.length / 3;
          pos.push(c.x, c.y, c.z); nor.push(n.x, n.y, n.z); uv.push(du, dv); si.push(b, 0, 0, 0); from.push(rep[loop[0]]);
          for (let i = 0; i < loop.length; i++) out.push(mid, base + (i + 1) % loop.length, base + i);
          continue;
        }
        for (const [i, j, k] of tris) {
          // each triangle turned to face along n
          e1.fromBufferAttribute(P, rep[loop[j]]).sub(a.fromBufferAttribute(P, rep[loop[i]]));
          e2.fromBufferAttribute(P, rep[loop[k]]).sub(a);
          if (e1.cross(e2).dot(n) >= 0) out.push(base + i, base + j, base + k); else out.push(base + i, base + k, base + j);
        }
      }
    }
  }
}
// ---- an imported shape turned into the editor's own parts. Each bone's surface is split into lumps made of whole
// plates (faces between creases, as the joint tool's plates), grouped by where they are, which way they face and their
// colour (k-means over the plates, about `target` lumps in all). Each lump becomes an extruded part turned to the lump's
// own axes (its longest and thinnest directions; set on the figure's axes when within 15 degrees of them), a box as big
// as the lump along those axes, coloured by the texture under it, on the lump's bone.
export async function meshToBlocks(p, target = 100) {
  const entry = MESHES.get(p.mesh);
  if (!entry) return;
  if (p.joints) applyJoints(p); else if (!entry.geo.attributes.skinIndex) { ensureJoints(p); applyJoints(p); }
  const g = entry.geo, P = g.attributes.position, SI = g.attributes.skinIndex, UV = g.attributes.uv, I = g.index.array;
  const { id: plateOf } = platesOf(entry, 35), F0 = entry.base.index.count / 3;   // (the split mesh keeps the unsplit mesh's faces first, in order; caps come after)
  const M = matOf(p), v = new THREE.Vector3();
  const world = new Float32Array(P.count * 3);
  for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i).applyMatrix4(M); world[i * 3] = v.x; world[i * 3 + 1] = v.y; world[i * 3 + 2] = v.z; }
  // the head is kept as it was (the face is what a robot is known by; boxes lose it): what is above the neck joint and
  // within one and a half times its radius of it (move or size the neck's sphere in the joint tool to change what is kept)
  const Jn = p.joints?.neck ?? (p.rig?.head ? { p: p.rig.head, r: 0.16 } : null);
  const neck = Jn ? V3(Jn.p).applyMatrix4(M) : null, HR = (Jn?.r ?? 0.16) * 1.5;
  const inHead = (x, y, z) => !!neck && y > neck.y && Math.hypot(x - neck.x, z - neck.z) < HR;
  const faceInHead = (pos, idx, t) => { const c3 = [0, 1, 2].map(k => (pos[idx[t] * 3 + k] + pos[idx[t + 1] * 3 + k] + pos[idx[t + 2] * 3 + k]) / 3); return inHead(...c3); };
  let pix = null;
  const TW = 256, img = entry.tex?.image;
  if (img) {
    const cv = document.createElement('canvas'); cv.width = cv.height = TW;
    const x = cv.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0, TW, TW);
    pix = x.getImageData(0, 0, TW, TW).data;
  }
  // plates (per bone): area, centre, facing, colour, faces
  const plates = new Map();   // key bone:plate -> plate
  let total = 0;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  for (let t = 0; t < Math.min(I.length, F0 * 3); t += 3) {
    a.fromArray(world, I[t] * 3); b.fromArray(world, I[t + 1] * 3); c.fromArray(world, I[t + 2] * 3);
    n.subVectors(b, a).cross(c.clone().sub(a));
    const area = n.length() / 2;
    if (area < 1e-9 || faceInHead(world, I, t)) continue;
    n.normalize();
    const bone = IMPORT_BONES[SI.getX(I[t])] ?? 'torso', key = bone + ':' + plateOf[t / 3];
    let pl = plates.get(key);
    if (!pl) plates.set(key, pl = { bone, a: 0, c: [0, 0, 0], n: [0, 0, 0], col: [0, 0, 0], faces: [] });
    pl.a += area; pl.faces.push(t);
    pl.c[0] += (a.x + b.x + c.x) / 3 * area; pl.c[1] += (a.y + b.y + c.y) / 3 * area; pl.c[2] += (a.z + b.z + c.z) / 3 * area;
    pl.n[0] += n.x * area; pl.n[1] += n.y * area; pl.n[2] += n.z * area;
    if (pix) {
      const u = (UV.getX(I[t]) + UV.getX(I[t + 1]) + UV.getX(I[t + 2])) / 3, w = (UV.getY(I[t]) + UV.getY(I[t + 1]) + UV.getY(I[t + 2])) / 3;
      const o = (Math.min(TW - 1, Math.max(0, Math.floor(w * TW))) * TW + Math.min(TW - 1, Math.max(0, Math.floor(u * TW)))) * 4;
      pl.col[0] += pix[o] * area; pl.col[1] += pix[o + 1] * area; pl.col[2] += pix[o + 2] * area;
    }
    total += area;
  }
  const byBone = new Map();
  for (const pl of plates.values()) {
    pl.c = pl.c.map(x => x / pl.a); const nl = Math.hypot(...pl.n) || 1; pl.n = pl.n.map(x => x / nl); pl.col = pl.col.map(x => x / pl.a / 255);
    (byBone.get(pl.bone) ?? byBone.set(pl.bone, []).get(pl.bone)).push(pl);
  }
  // the feature a plate is grouped by: where it is (figure units, 3 tall), which way it faces, its colour
  const WN = 0.25, WC = 0.6;
  const feat = pl => [pl.c[0], pl.c[1], pl.c[2], pl.n[0] * WN, pl.n[1] * WN, pl.n[2] * WN, pl.col[0] * WC, pl.col[1] * WC, pl.col[2] * WC];
  const d2 = (m, q) => { let s2 = 0; for (let i = 0; i < m.length; i++) s2 += (m[i] - q[i]) ** 2; return s2; };
  // 3 x 3 symmetric eigen vectors (Jacobi), columns sorted by eigen value, largest first
  const eigen = A => {
    const m = A.map(r => r.slice()), V = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    for (let sweep = 0; sweep < 20; sweep++) for (const [p0, q] of [[0, 1], [0, 2], [1, 2]]) {
      if (Math.abs(m[p0][q]) < 1e-12) continue;
      const th = (m[q][q] - m[p0][p0]) / (2 * m[p0][q]), t2 = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), cs = 1 / Math.sqrt(t2 * t2 + 1), sn = t2 * cs;
      for (let k = 0; k < 3; k++) { const x = m[k][p0], y = m[k][q]; m[k][p0] = cs * x - sn * y; m[k][q] = sn * x + cs * y; }
      for (let k = 0; k < 3; k++) { const x = m[p0][k], y = m[q][k]; m[p0][k] = cs * x - sn * y; m[q][k] = sn * x + cs * y; }
      for (let k = 0; k < 3; k++) { const x = V[k][p0], y = V[k][q]; V[k][p0] = cs * x - sn * y; V[k][q] = sn * x + cs * y; }
    }
    return [0, 1, 2].sort((i, j) => m[j][j] - m[i][i]).map(i => new THREE.Vector3(V[0][i], V[1][i], V[2][i]).normalize());
  };
  const SNAP = Math.cos(22 * Math.PI / 180);
  const group = bone => bone.replace(/_[lr]$/, '').replace('forearm', 'fore');
  // each bone's frame: a limb (arm, forearm, leg, shin, wing) along its length (its surface's longest direction), the front
  // kept as near +Z as it can; the body, the hips and the head on the figure's own axes
  const boneFrame = (bone, list) => {
    const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
    if (!/arm|leg|shin|wing/.test(bone)) return [X, Y, Z];
    let wsum = 0; const m = new THREE.Vector3();
    for (const pl of list) { m.addScaledVector(new THREE.Vector3(...pl.c), pl.a); wsum += pl.a; }
    m.divideScalar(wsum);
    const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (const pl of list) { const d = [pl.c[0] - m.x, pl.c[1] - m.y, pl.c[2] - m.z]; for (let r = 0; r < 3; r++) for (let s3 = 0; s3 < 3; s3++) C[r][s3] += d[r] * d[s3] * pl.a; }
    const L = eigen(C)[0];
    if (L.dot(Y) < 0) L.negate();
    const f = Math.abs(L.dot(Z)) > 0.9 ? X.clone() : Z.clone();
    f.sub(L.clone().multiplyScalar(f.dot(L))).normalize();
    return [new THREE.Vector3().crossVectors(L, f).normalize(), L, f];
  };
  const made = [];
  for (const [bone, list] of byBone) {
    const frame = boneFrame(bone, list), limb = /arm|leg|shin|wing/.test(bone);
    // the body's plates are set on the figure's axes more readily than a limb's (a chest is built square)
    const snap = limb ? SNAP : Math.cos(35 * Math.PI / 180);
    const area = list.reduce((s2, pl) => s2 + pl.a, 0);
    // the head is small but it is the face: three times its share of lumps, six at least
    const k = Math.max(1, Math.min(list.length, bone === 'head' ? Math.max(6, Math.round(target * area / total * 3)) : Math.round(target * area / total)));
    // a core: a dark box on the bone's frame inside its surface, so the gaps between the plates show no background
    {
      const vs = [];
      for (const pl of list) for (const t of pl.faces) for (let q = 0; q < 3; q++) { const vi = I[t + q]; vs.push(new THREE.Vector3(world[vi * 3], world[vi * 3 + 1], world[vi * 3 + 2])); }
      const lc = vs.map(q => frame.map(ax => q.dot(ax)));
      const rng = i => { const s3 = lc.map(q => q[i]).sort((m, o) => m - o), cut = Math.floor(s3.length * 0.12); return [s3[cut], s3[s3.length - 1 - cut]]; };
      const r = [0, 1, 2].map(rng), sz = r.map(([l, h]) => Math.max(0.02, (h - l) * 0.8)), cm = r.map(([l, h]) => (l + h) / 2);
      if (vs.length && Math.min(...sz) > 0.03) {
        const ctr = frame[0].clone().multiplyScalar(cm[0]).addScaledVector(frame[1], cm[1]).addScaledVector(frame[2], cm[2]);
        const e = new THREE.Euler().setFromRotationMatrix(new THREE.Matrix4().makeBasis(...frame));
        const w = sz[0] / 2, h = sz[1] / 2;
        made.push({ ...E1, name: `${BONE_LABEL[bone] ?? bone}・芯`, kind: 'extrude', pts: [[-w, -h], [w, -h], [w, h], [-w, h]].map(q => q.map(x => +x.toFixed(4))),
          depth: +sz[2].toFixed(4), pos: ctr.toArray().map(x => +x.toFixed(4)), rot: [e.x, e.y, e.z].map(x => +x.toFixed(4)), scl: [1, 1, 1],
          bevel: 0, bevelSegs: 1, corner: +Math.min(0.03, Math.min(...sz) * 0.2).toFixed(4), color: '#34383f', metal: 0.4, rough: 0.7, bone: group(bone) });
      }
    }
    // (a plate counts by the square root of its size: a detailed place, many small plates, as a face, draws lumps too)
    // the bone's surface in its separate pieces (plates sharing a corner are one piece): each piece gets its own lumps,
    // by the square root of its size, so a small piece (a head beside a backpack on the same bone) is not swallowed
    const key = vi => `${Math.round(world[vi * 3] * 1e4)},${Math.round(world[vi * 3 + 1] * 1e4)},${Math.round(world[vi * 3 + 2] * 1e4)}`;
    const up = list.map((_, i) => i), root = i => { while (up[i] !== i) i = up[i] = up[up[i]]; return i; };
    const owner = new Map();
    list.forEach((pl, i) => { for (const t of pl.faces) for (let q = 0; q < 3; q++) { const kk = key(I[t + q]), o = owner.get(kk); if (o === undefined) owner.set(kk, i); else up[root(o)] = root(i); } });
    const pieces = new Map();
    list.forEach((pl, i) => (pieces.get(root(i)) ?? pieces.set(root(i), []).get(root(i))).push(pl));
    const pcs = [...pieces.values()].map(ps => ({ ps, a: ps.reduce((s2, pl) => s2 + pl.a, 0) }));
    const sq = pcs.reduce((s2, pc) => s2 + Math.sqrt(pc.a), 0);
    const lumps = [];
    for (const { ps, a: pa } of pcs) {
      const kp = Math.max(1, Math.min(ps.length, Math.round(k * Math.sqrt(pa) / sq)));
      const fs = ps.map(feat);
      // seeds: the biggest plate, then the farthest (weighted by size) each time
      const cent = [fs[ps.reduce((bi, pl, i) => (pl.a > ps[bi].a ? i : bi), 0)].slice()];
      while (cent.length < kp) { let far = 0, fd = -1; fs.forEach((f, i) => { const d = Math.min(...cent.map(q => d2(q, f))) * Math.sqrt(ps[i].a); if (d > fd) { fd = d; far = i; } }); cent.push(fs[far].slice()); }
      const lab = new Int32Array(ps.length);
      for (let it = 0; it < 15; it++) {
        fs.forEach((f, i) => { let bi = 0, bd = Infinity; cent.forEach((q, j) => { const d = d2(q, f); if (d < bd) { bd = d; bi = j; } }); lab[i] = bi; });
        const sum = Array.from({ length: kp }, () => new Array(10).fill(0));
        fs.forEach((f, i) => { const q = sum[lab[i]], w = Math.sqrt(ps[i].a); for (let d = 0; d < 9; d++) q[d] += f[d] * w; q[9] += w; });
        sum.forEach((q, j) => { if (q[9] > 0) cent[j] = q.slice(0, 9).map(x => x / q[9]); });
      }
      for (let j = 0; j < kp; j++) { const m = ps.filter((_, i) => lab[i] === j); if (m.reduce((s2, pl) => s2 + pl.a, 0) > total * 0.001) lumps.push(m); }   // (a crumb is left out)
    }
    for (let j = 0; j < lumps.length; j++) {
      const mine = lumps[j];
      const pts = [];
      for (const pl of mine) for (const t of pl.faces) for (let q = 0; q < 3; q++) { const vi = I[t + q]; pts.push(new THREE.Vector3(world[vi * 3], world[vi * 3 + 1], world[vi * 3 + 2])); }
      const mean = pts.reduce((s2, q) => s2.add(q), new THREE.Vector3()).divideScalar(pts.length);
      const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
      for (const q of pts) { const d = [q.x - mean.x, q.y - mean.y, q.z - mean.z]; for (let r = 0; r < 3; r++) for (let s3 = 0; s3 < 3; s3++) C[r][s3] += d[r] * d[s3]; }
      // the lump's own axes: x along its length, y across, z through its thinnest (the extrusion)
      const [ex, ey] = eigen(C), ez = new THREE.Vector3().crossVectors(ex, ey).normalize();
      ey.crossVectors(ez, ex).normalize();
      // axes near the bone's own (within SNAP) are set on them: the length first, then across
      const nearAxis = (d, not) => {
        let best = null, bd = -1;
        for (const w of frame) { const u = w.clone(); if (not && Math.abs(u.dot(not)) > 0.5) continue; const k2 = Math.abs(d.dot(u)); if (k2 > bd) { bd = k2; best = u.multiplyScalar(Math.sign(d.dot(u)) || 1); } }
        return bd > snap ? best : null;
      };
      const sx = nearAxis(ex);
      if (sx) { ex.copy(sx); ey.sub(ex.clone().multiplyScalar(ey.dot(ex))).normalize(); }
      const sy = nearAxis(ey, ex);
      if (sy) { ey.copy(sy); ex.sub(ey.clone().multiplyScalar(ex.dot(ey))).normalize(); }
      ez.crossVectors(ex, ey).normalize();
      const R = new THREE.Matrix4().makeBasis(ex, ey, ez);
      const loc = pts.map(q => { const d = q.clone().sub(mean); return [d.dot(ex), d.dot(ey), d.dot(ez)]; });
      // a box: the lump's extent along its axes, a few stray corners (a thin spike) left out
      const qt = i => { const s3 = loc.map(q => q[i]).sort((m, o) => m - o), cut = Math.floor(s3.length * 0.06); return [s3[cut], s3[s3.length - 1 - cut]]; };
      const [lo, hi] = [0, 1, 2].map(qt).reduce((r, [l, h]) => (r[0].push(l), r[1].push(h), r), [[], []]);
      // a lump that mostly faces one way is a plate of armour, not a solid: the box keeps to its outer side, only as thick
      // as a plate (a quarter of its width, at most), instead of filling the curve behind it
      const nrm = new THREE.Vector3(), aw = mine.reduce((s2, pl) => s2 + pl.a, 0);
      for (const pl of mine) nrm.addScaledVector(new THREE.Vector3(...pl.n), pl.a / aw);
      if (nrm.length() > 0.6) {
        const ax = [ex, ey, ez], ti = [0, 1, 2].reduce((bi, i) => (Math.abs(nrm.dot(ax[i])) > Math.abs(nrm.dot(ax[bi])) ? i : bi), 0);
        const others = [0, 1, 2].filter(i => i !== ti).map(i => hi[i] - lo[i]);
        const th = Math.max(0.03, Math.min(...others) * 0.25);
        if (hi[ti] - lo[ti] > th) { if (nrm.dot(ax[ti]) > 0) lo[ti] = hi[ti] - th; else hi[ti] = lo[ti] + th; }
      }
      const mid = lo.map((l, i) => (l + hi[i]) / 2), size = hi.map((h, i) => Math.max(0.01, h - lo[i]));
      if (Math.max(...size) < 0.02) continue;
      const ctr = mean.clone().add(ex.clone().multiplyScalar(mid[0])).add(ey.clone().multiplyScalar(mid[1])).add(ez.clone().multiplyScalar(mid[2]));
      // a box from below the neck that rises in front of the face is cut down to the neck's height
      if (neck) {
        const ax = [ex, ey, ez], top = ctr.y + ax.reduce((s2, u, i) => s2 + Math.abs(u.y) * size[i] / 2, 0);
        if (ctr.y < neck.y && top > neck.y && Math.hypot(ctr.x - neck.x, ctr.z - neck.z) < HR * 2.5) {
          const i = [0, 1, 2].reduce((bi, q) => (Math.abs(ax[q].y) > Math.abs(ax[bi].y) ? q : bi), 0);
          const cut = Math.min(size[i] * 0.8, (top - neck.y) / Math.abs(ax[i].y));
          size[i] -= cut; ctr.addScaledVector(ax[i], -Math.sign(ax[i].y) * cut / 2);
        }
      }
      const r0 = Math.min(...size);
      const e = new THREE.Euler().setFromRotationMatrix(R);
      const colr = [0, 1, 2].map(i => mine.reduce((s2, pl) => s2 + pl.col[i] * pl.a, 0) / mine.reduce((s2, pl) => s2 + pl.a, 0));
      const hex = pix ? '#' + colr.map(x => Math.round(Math.min(1, Math.max(0, x)) * 255).toString(16).padStart(2, '0')).join('') : '#c8ccd4';
      const w = size[0] / 2, h = size[1] / 2;
      made.push({ ...E1, name: `${BONE_LABEL[bone] ?? bone}・${j + 1}`, kind: 'extrude', pts: [[-w, -h], [w, -h], [w, h], [-w, h]].map(q => q.map(x => +x.toFixed(4))),
        depth: +size[2].toFixed(4), pos: ctr.toArray().map(x => +x.toFixed(4)), rot: [e.x, e.y, e.z].map(x => +x.toFixed(4)), scl: [1, 1, 1],
        bevel: +Math.min(0.02, r0 * 0.15).toFixed(4), bevelSegs: 1, corner: +Math.min(0.03, r0 * 0.2).toFixed(4), color: hex, metal: 0.3, rough: 0.6, bone: group(bone) });
    }
  }
  if (!made.length) return null;
  // the kept head: its own mesh (LOD0 and LOD1), on the imported bones as before
  if (neck && entry.geo.attributes.skinIndex) {
    const rec = await dbGet('mesh', p.mesh);
    const Mp = matOf(p);
    const wpos = new Float32Array(rec.pos.length);
    for (let i = 0; i < rec.pos.length; i += 3) { v.fromArray(rec.pos, i).applyMatrix4(Mp); wpos[i] = v.x; wpos[i + 1] = v.y; wpos[i + 2] = v.z; }
    const keep = idx => [...Array(idx.length / 3).keys()].filter(t => faceInHead(wpos, idx, t * 3));
    const t0 = keep(rec.index), t1 = keep(rec.lod1);
    if (t0.length) {
      const m = regionMesh(rec, t0), l = regionMesh({ ...rec, index: rec.lod1 }, t1.length ? t1 : t0);
      const join = (A, B, T) => { const o = new T(A.length + B.length); o.set(A); o.set(B, A.length); return o; };
      const id = 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      await dbPut('mesh', id, {
        pos: join(m.pos, l.pos, Float32Array), nor: join(m.nor, l.nor, Float32Array), uv: join(m.uv, l.uv, Float32Array),
        index: m.index, lod1: new Uint32Array(l.index.map(i => i + m.pos.length / 3)), texId: rec.texId,
        skinI: join(m.skinI, l.skinI, Uint16Array), skinW: join(m.skinW, l.skinW, Float32Array),
      });
      made.unshift({ ...E1, name: '頭（元の形）', kind: 'mesh', mesh: id, bone: p.bone, rig: p.rig, pos: posOf(p).slice(), rot: rotOf(p), scl: sclOf(p),
        color: p.color, metal: p.metal, rough: p.rough, fromBones: true });
    }
  }
  return made;
}

// cut, paint and store: the skin (LOD0 and LOD1), the rig and the right hand; rebuild the view
export function applyJoints(p) {
  const entry = MESHES.get(p.mesh);
  if (!entry) return { conflicts: [] };
  const J = p.joints, res = cutAssign(entry, J, p.regions ?? [], !!p.fromBones);
  const g = entry.base, P = g.attributes.position.array, N = g.attributes.position.count;
  const vb = new Int8Array(N);   // every vertex's bone (LOD0 from the cut, LOD1 from the nearest LOD0 vertex)
  for (let v = 0; v < res.n0; v++) vb[v] = res.bone[v];
  // LOD1 vertices (after the LOD0 ones): the bone of the nearest LOD0 vertex, found on a coarse grid
  const cell = 0.05, grid = new Map(), key = (x, y, z) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
  for (let v = 0; v < res.n0; v++) { const k = key(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]); (grid.get(k) || grid.set(k, []).get(k)).push(v); }
  for (let v = res.n0; v < N; v++) {
    const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
    let best = 0, bd = Infinity;
    for (let r = 0; r < 4 && bd === Infinity; r++)
      for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) for (let k = -r; k <= r; k++)
        for (const w of grid.get(`${Math.floor(x / cell) + i},${Math.floor(y / cell) + j},${Math.floor(z / cell) + k}`) ?? []) {
          const d = (P[w * 3] - x) ** 2 + (P[w * 3 + 1] - y) ** 2 + (P[w * 3 + 2] - z) ** 2;
          if (d < bd) { bd = d; best = w; }
        }
    vb[v] = res.bone[best];
  }
  // each triangle wholly on one bone (most of its corners'): corners shared by triangles of two bones are doubled, so
  // where parts move apart the seam opens like a joint instead of a sheet stretching across
  // LOD0: every plate (faces between creases, as the tool's plates) wholly on the bone most of its corners are on, so an
  // armour plate the cut passes through is not torn in two when the joint bends
  const { id: plate, n: nPlates } = platesOf(entry, 35), I0 = g.index.array, votes = new Uint32Array(nPlates * 16);
  for (let f = 0; f < I0.length / 3; f++) for (let k = 0; k < 3; k++) votes[plate[f] * 16 + vb[I0[f * 3 + k]]]++;
  const plateBone = new Int8Array(nPlates);
  for (let q = 0; q < nPlates; q++) { let best = 0; for (let b = 1; b < 16; b++) if (votes[q * 16 + b] > votes[q * 16 + best]) best = b; plateBone[q] = best; }
  const split = (index, faceBone) => {
    const src = g.attributes, idx = index.array, map = new Map(), pos = [], nor = [], uv = [], si = [], out = [], from = [];
    for (let t = 0; t < idx.length; t += 3) {
      const a = vb[idx[t]], b = vb[idx[t + 1]], c = vb[idx[t + 2]], bone = faceBone ? faceBone(t / 3) : a === b || a === c ? a : b === c ? b : a;
      for (let k = 0; k < 3; k++) {
        const v = idx[t + k], key = v * 32 + bone;
        let n = map.get(key);
        if (n === undefined) {
          n = map.size; map.set(key, n);
          pos.push(src.position.getX(v), src.position.getY(v), src.position.getZ(v));
          nor.push(src.normal.getX(v), src.normal.getY(v), src.normal.getZ(v));
          uv.push(src.uv.getX(v), src.uv.getY(v));
          si.push(bone, 0, 0, 0); from.push(v);
        }
        out.push(n);
      }
    }
    if (faceBone) capCuts(entry, idx, faceBone, src, pos, nor, uv, si, from, out);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(si.map((x, i) => (i % 4 ? 0 : 1)), 4));
    geo.setIndex(out);
    geo.computeBoundingBox();
    geo.userData.from = Int32Array.from(from);   // each vertex's vertex in the unsplit mesh
    return geo;
  };
  entry.geo = split(g.index, f => plateBone[plate[f]]);
  entry.byHand = res.byHand;
  entry.lod1 = split(entry.baseLod1.index);
  // the rig: each bone turns at its joint; the hips between the two hip joints
  const rig = {};
  for (const [n, bone] of jointList(p.wings)) rig[bone] = J[n].p.slice();
  rig.hips = V3(J.hip_l.p).lerp(V3(J.hip_r.p), 0.5).toArray();
  // the right hand (where the game puts its weapons): past the elbow by the upper arm's length. Not the lowest point of
  // what rides on the forearm: a long gun held in the hand would put the hand at the gun's muzzle
  const sh = V3(J.shoulder_r.p), el = V3(J.elbow_r.p);
  rig.hand_r = el.clone().add(el.clone().sub(sh)).toArray().map(v => +v.toFixed(4));
  p.rig = rig;
  HOST.changed?.(p);
  return res;
}


// ======== AI に骨を付けてもらう：パソコンの AI に渡す頼み方 ========
export function rigRequest(wings) {
  const bones = [
    '| hips | 腰（骨盤）。しゃがむ・歩くときに上下する | なし（いちばん上） | 左右の股関節の真ん中 |',
    '| torso | 胴（胸から上）。前後に傾き、左右にひねる | hips | 腰のくびれ（胸の下、ひねる所） |',
    '| head | 頭（アンテナ・角・顔を含む） | torso | 首の付け根 |',
    '| arm_l / arm_r | 上腕（肩の装甲を含む） | torso | 肩の球（腕が回る中心） |',
    '| forearm_l / forearm_r | 前腕（ひじから先。手と、手に持った武器・腕に付いた盾を含む） | arm_l / arm_r | ひじ |',
    '| leg_l / leg_r | 太もも | hips | 股関節 |',
    '| shin_l / shin_r | すね（ひざから足首まで） | leg_l / leg_r | ひざ |',
    '| foot_l / foot_r（任意） | 足（足首から下）。ゲームが足の裏を地面と平行に保つ。無ければ足はすねと一緒に傾く | shin_l / shin_r | 足首 |',
    ...(wings ? ['| wing_l / wing_r | 背中の左右の翼（羽・翼の付け根の装甲） | torso | 翼の付け根（開くときに回る中心） |'] : []),
  ];
  return `添付した人型ロボットの 3D モデル（.glb）に、Blender を使って骨を付けてください。ゲーム「XS オンライン」の自分の機体の見た目（スキン）にします。Blender はこのパソコンに入っています。画面を使わず、Blender をコマンド（blender -b -P スクリプト.py）で動かして作業してください（Blender が見つからなければ、入っている場所を私に聞いてください）。

## ファイル
- 元のモデル：添付した .glb。書き換えないでください。
- できたモデル：「元の名前_骨付き.glb」として、元のモデルと同じフォルダ（分からなければ私が受け取れる場所）に書き出してください。

## 骨（アーマチュア）
骨の名前は次のとおりにしてください（ゲームとエディタはこの名前で骨を探します）。骨の付け根（ヘッド）の位置が、そこで曲がる中心です。骨の向き（テール）は自由です。
| 骨の名前 | 動かす所 | 親 | 付け根（ヘッド）の位置 |
|---|---|---|---|
${bones.join('\n')}
${wings ? '' : '背中の翼の骨は要りません（翼のような部品があれば torso に付けてください）。\n'}
まずモデルの寸法と形を調べて、上の各関節の位置をモデルに合わせて決めてください（左右は対称に。_l がロボット自身の左）。

## 部品の付け方（大事）
- ロボットなので、関節の間の装甲の塊は、1 本の骨にまるごと（重み 1.0 で）付けます。1 つの頂点を 2 本の骨に分けてなめらかに曲げる付け方（自動のウェイト）はしないでください。
- 1 枚の装甲の板を、途中で 2 本の骨に分けないでください。境目は板と板のすき間（溝）で分けます。
- 手に持った銃や剣は、持っている腕の前腕（forearm）に付けます。腕に付いた盾も前腕です。腰のスカートの装甲は hips、腰から下げた武器は hips に付けます。
- 3D 生成 AI で作ったモデルは、全体が 1 つにつながった面になっていることがあります。その場合は、骨の境目にあたる所で面を切り離し、切り口に開いた穴を面でふさいで、各部品を閉じた塊にしてください。こうしないと、曲げたときに面が引き伸ばされたり、中の空洞が見えたりします。

## 確かめ方（書き出す前に必ず）
1. 部品ごとに骨で色分けした絵を、正面・横・後ろから（正射影で）描き、どの部品がどの骨に付いたか確かめてください。
2. 次の姿勢を付けて絵を描き、面が引き伸ばされていないか、部品が裂けて中の空洞が見えていないか、体から離れて浮いた部品がないかを確かめてください。
   - 歩き：左の太ももを前へ 0.5 rad、右を後ろへ 0.5 rad、右のすねを後ろへ 0.6 rad 曲げる
   - しゃがみ：両方の太ももを前へ 0.9 rad、両方のすねを後ろへ 1.5 rad、胴を後ろへ 0.2 rad
   - ひねり：胴を左右に 1.5 rad ひねる
   - 構え：右の上腕を前へ 1.45 rad 上げる、左の上腕を前へ 1.3 rad 上げる
${wings ? '   - 翼を開く：左右の翼を外へ 0.5 rad 開いて、後ろへ 0.25 rad 上げる\n' : ''}3. おかしい所があれば、付け方か切り離し方を直して、もう一度確かめてください。直らない所があれば、最後にどこがおかしいかを教えてください。

## 書き出し
- 形式：glTF バイナリ（.glb）。「+Y Up」オン、「スキニング」オン、アニメーションはなし。テクスチャ（色の画像）は元のモデルのものをそのまま .glb に入れてください。
- 三角形が 20 万を超えるときは、形が崩れない程度に減らしてから書き出してください（読み込むエディタが 2.7 万まで減らします）。
- 大きさ・向き・位置は元のままで構いません（エディタが全高 3・足元・正面を合わせます）。

## 終わったら
できたファイルの場所と、各骨の付け根の位置、確かめた姿勢でおかしい所が残っていないかを教えてください。
そのファイルは「機体エディタ Ver2」の「開く → GLB を読み込む」で読み込みます。`;
}


// ======== 関節と切り分けの画面（3 面図） ========
const JT_CSS = `
#jointTool { position: fixed; inset: 0; background: rgba(0,0,0,.6); display: grid; place-items: center; z-index: 30; padding: 12px; }
#jointTool[hidden] { display: none; }
#jointTool .gbox { width: min(1400px, 100%); max-height: 96vh; display: flex; flex-direction: column; background: var(--panel); border: 1px solid #3d6a9c; border-radius: 10px; padding: 12px 14px; }
#jointTool .ghead { display: flex; align-items: center; gap: 10px; }
#jointTool .ghead h1 { font-size: 14px; margin: 0; flex: 1; }
#jointTool label.check { display: inline-flex; gap: 5px; align-items: center; }
#jointTool select, #jointTool input[type=range] { width: auto; }
.jtbar { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin: 6px 0 8px; }
.jtviews { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; height: calc(96vh - 230px); min-height: 320px; }
.jtview { position: relative; background: #14171c; border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
.jtview canvas { position: absolute; inset: 0; width: 100%; height: 100%; touch-action: none; }
.jtview b { position: absolute; left: 8px; top: 6px; font-size: 12px; color: var(--dim); pointer-events: none; }
#jtNote { color: var(--dim); font-size: 12px; }
`;
const JT_HTML = `<div id="jointTool" hidden>
  <div class="gbox">
    <div class="ghead"><h1>関節と切り分け</h1><button id="jtClose">閉じる</button></div>
    <p class="hint">部品を選んで骨に付けます。形をクリックすると、そこから折れ目（溝）までの板を 1 枚選びます（Shift＋クリックで足す、Alt＋クリックで外す。区切りの細かさは「折れ目」）。図の上をドラッグして部品を囲むと、その囲みは図の奥まで貫通します。別の図でも囲むと、両方の囲みが重なるところだけになります（例：正面で盾を囲み、横でも盾を囲む）。Shift を押しながら囲むと囲みを足し、Alt を押しながら囲むとそこを選択から外します。選ばれたところは白く光ります。よければ「付ける」（Enter）。右クリックで囲みをやめます。ホイールで拡大・縮小、右ドラッグで表示を動かせます。付けた部品は隠れるので、奥の部品も囲めます。
      球（関節）は曲がる中心です。中心の点をドラッグで動かし、縁の四角で大きさを変えます（Alt を押しながらだと片側だけ）。左右の球は、正面・後ろの図の縦の点線（上の ◆ をドラッグで動かせる）を軸に鏡写しで動きます。囲んでいないところは球の位置で分けます。間違えたら Ctrl+Z（やり直しは Ctrl+Y）。</p>
    <div class="jtbar"><label>付ける骨 <select id="jtBone"></select></label>
      <button id="jtApply">囲んだところを付ける（Enter）</button><button id="jtCancel">囲みをやめる</button>
      <label title="クリックで選ぶ板の区切り：小さいほど細かく区切り、大きいほど広く選びます">折れ目 <input type="range" id="jtAngle" min="10" max="80" value="35"> <span id="jtAngleV">35°</span></label>
      <label class="check" title="囲みに半分以上入った板をまるごと選び、半分未満の板は選びません（板の区切りは「折れ目」）"><input type="checkbox" id="jtSnap" checked> 囲みは板ごと</label>
      <label class="check"><input type="checkbox" id="jtHide" checked> 付けた部品を隠す</label>
      <label class="check"><input type="checkbox" id="jtWings"> 翼あり</label>
      <button id="jtView">表示を元に戻す</button><button id="jtReset">球を標準の位置に戻す</button><button id="jtClearRegions">付けたのを全部消す</button>
      <button id="jtSaveCut" title="関節の球と、囲んで付けた部品を小さなファイルにします（同じ形を取り込んだ別のブラウザで読み込めます）">切り分けを書き出す</button><button id="jtLoadCut">切り分けを読み込む</button>
      <input type="file" id="jtCutFile" accept=".json,application/json" hidden>
      <span id="jtNote"></span></div>
    <div class="jtviews">
      <div class="jtview" data-v="front"><canvas></canvas><canvas class="ov"></canvas><b>正面</b></div>
      <div class="jtview" data-v="side"><canvas></canvas><canvas class="ov"></canvas><b>横（左が前）</b></div>
      <div class="jtview" data-v="back"><canvas></canvas><canvas class="ov"></canvas><b>後ろ</b></div>
    </div>
  </div>
</div>`;
let ui = null;
function buildUI() {
  const st = document.createElement('style'); st.textContent = JT_CSS; document.head.appendChild(st);
  const holder = document.createElement('div'); holder.innerHTML = JT_HTML; document.body.appendChild(holder.firstElementChild);
let jt = null;   // { part, views: [{ el, v, renderer, scene, cam, ov }], mesh, drag }
function openJointTool(p) {
  const entry = MESHES.get(p.mesh);
  if (!entry) return;
  ensureJoints(p);
  $('#jtBone').innerHTML = IMPORT_BONES.filter(b => p.wings || !b.startsWith('wing')).map(b => `<option value="${b}">${BONE_LABEL[b]}</option>`).join('');
  $('#jtWings').checked = !!p.wings;
  $('#jointTool').hidden = false;
  const box = new THREE.Box3().setFromBufferAttribute(entry.geo.attributes.position);
  const views = [...document.querySelectorAll('.jtview')].map(el => {
    const [gl, ov] = el.querySelectorAll('canvas');
    const renderer = new THREE.WebGLRenderer({ canvas: gl, antialias: true });
    renderer.setPixelRatio(devicePixelRatio);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x404850, 2.2));
    const dl = new THREE.DirectionalLight(0xffffff, 1.2); dl.position.set(...JT_VIEWS[el.dataset.v].eye.map(x => x * 5 + 1)); scene.add(dl);
    return { el, v: el.dataset.v, renderer, scene, cam: new THREE.OrthographicCamera(), ov };
  });
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true }));
  for (const vw of views) vw.scene.add(mesh.clone());
  jt = { part: p, views, g: null, box, drag: null, pending: {}, subs: [], picks: [], unpicks: [], zoom: 1, cy: null, du: {}, q: [], qPos: 0 };
  for (const vw of views) hookView(vw);
  jtUpdate();
  addEventListener('resize', jtDraw);
}
function closeJointTool() {
  if (!jt) return;
  const p0 = jt.part;
  for (const vw of jt.views) vw.renderer.dispose();
  jt = null;
  $('#jointTool').hidden = true;
  removeEventListener('resize', jtDraw);
  HOST.closed?.(p0);
}
$('#jtClose').onclick = closeJointTool;
$('#jtWings').onchange = e => { const p = jt.part; p.wings = e.target.checked; p.joints = null; p.rig = { ...p.rig, wing_l: undefined, wing_r: undefined }; if (!p.wings) { delete p.rig.wing_l; delete p.rig.wing_r; } ensureJoints(p); openJointTool(p); };
$('#jtReset').onclick = () => jtChange(() => { const p = jt.part; p.joints = null; const r = p.rig; p.rig = null; ensureJoints(p); p.rig = r; jtUpdate(); });
$('#jtClearRegions').onclick = () => jtChange(() => { jt.part.regions = null; jt.pending = {}; jt.subs = []; jtUpdate(); });
$('#jtView').onclick = () => { jt.zoom = 1; jt.cy = null; jt.du = {}; jtDraw(); };
$('#jtApply').onclick = () => jtApply();
// the cut as a file: the spheres and the regions (in the part's frame, so they fit the same shape imported elsewhere)
$('#jtSaveCut').onclick = () => {
  const p = jt.part, data = { kind: 'xs-editor-cut', version: 1, joints: p.joints, regions: p.regions ?? [], wings: !!p.wings, mid: p.mid ?? 0 };
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
  a.download = `${p.name || 'cut'}-切り分け.json`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
$('#jtLoadCut').onclick = () => $('#jtCutFile').click();
$('#jtCutFile').onchange = async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  let d;
  try { d = JSON.parse(await file.text()); } catch { d = null; }
  if (d?.kind !== 'xs-editor-cut' || !d.joints) { HOST.note?.('切り分けのファイルとして読めませんでした', true); return; }
  const p = jt.part;
  if (!!d.wings !== !!p.wings) { p.wings = !!d.wings; $('#jtWings').checked = p.wings; }
  jtChange(() => { p.joints = d.joints; p.mid = d.mid || null; p.regions = d.regions?.length ? d.regions : null; jt.pending = {}; jt.subs = []; jtUpdate(); });
};
$('#jtCancel').onclick = () => jtChange(jtClear);
const jtClear = () => { jt.pending = {}; jt.subs = []; jt.picks = []; jt.unpicks = []; jtRecolor(); };
const jtDrawn = () => ({ lassos: Object.entries(jt.pending).flatMap(([view, list]) => list.map(pts => ({ view, pts }))), subs: jt.subs, picks: jt.picks, unpicks: jt.unpicks,
  snap: $('#jtSnap').checked ? +$('#jtAngle').value : undefined });
$('#jtSnap').onchange = () => jtRecolor();
const jtAny = d => d.lassos.length > 0 || d.picks.length > 0;
$('#jtAngle').oninput = e => {   // the angle of the plates being picked (not of those already given)
  $('#jtAngleV').textContent = e.target.value + '°';
  for (const pk of [...jt.picks, ...jt.unpicks]) pk.a = +e.target.value;
  jtRecolor();
};
$('#jtHide').onchange = () => jtRecolor();
// the lassos drawn so far go to the chosen bone as one region
function jtApply() {
  const d = jtDrawn(), { lassos, subs, picks, unpicks, snap } = d;
  if (!jtAny(d)) return;
  jtChange(() => {
    (jt.part.regions ??= []).push({ bone: $('#jtBone').value, lassos, subs: subs.length ? subs : undefined,
      picks: picks.length ? picks : undefined, unpicks: unpicks.length ? unpicks : undefined, snap: lassos.length || subs.length ? snap : undefined, skip: $('#jtHide').checked });
    jt.pending = {}; jt.subs = []; jt.picks = []; jt.unpicks = [];
    jtUpdate();
  });
}
// Undo / redo inside the tool: one queue of steps, both the lassos being drawn (drawn, added with Shift, cut out with
// Alt, let go) and what changes the part (giving to a bone, moving a sphere), each a step of the editor's history.
// A step keeps the lassos before and after it, so undoing "give" brings back the lassos it took.
// 道具の中の元に戻す・やり直す：囲み（描く・足す・外す・やめる）と、部品を変える操作（骨に付ける・球を動かす）を 1 つの列で持つ
const selSnap = () => structuredClone({ pending: jt.pending, subs: jt.subs, picks: jt.picks, unpicks: jt.unpicks });
const selSet = sn => { const c = structuredClone(sn); jt.pending = c.pending; jt.subs = c.subs; jt.picks = c.picks; jt.unpicks = c.unpicks; };
const partSnap = () => JSON.stringify({ joints: jt.part.joints, regions: jt.part.regions ?? null, wings: !!jt.part.wings, mid: jt.part.mid ?? null });
function jtChange(fn) {
  const before = selSnap(), was = partSnap();
  fn();
  const now = partSnap(), after = selSnap(), global = now !== was;
  if (!global && JSON.stringify(before) === JSON.stringify(after)) return;
  jt.q.splice(jt.qPos); jt.q.push({ global, part: [was, now], sel: [before, after] }); jt.qPos = jt.q.length;
}
function jtStep(s) { Object.assign(jt.part, JSON.parse(s)); jtUpdate(); }
function jtUndo() {
  if (!jt.qPos) return;
  const step = jt.q[--jt.qPos];
  if (step.global) jtStep(step.part[0]);
  selSet(step.sel[0]); jtRecolor();
}
function jtRedo() {
  if (jt.qPos >= jt.q.length) return;
  const step = jt.q[jt.qPos++];
  if (step.global) jtStep(step.part[1]);
  selSet(step.sel[1]); jtRecolor();
}
const jtHandle = (px, py, rr) => [px + rr * 0.7071, py + rr * 0.7071];   // the size handle: low right on the circle
function jtUpdate() {
  applyJoints(jt.part);
  const src = MESHES.get(jt.part.mesh).geo, g = new THREE.BufferGeometry();
  // the split mesh (its own copy: the poses move the part's), coloured by bone
  g.setAttribute('position', src.attributes.position.clone()); g.setAttribute('normal', src.attributes.normal.clone());
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(src.attributes.position.count * 3), 3));
  jt.g?.dispose(); jt.g = g;
  for (const vw of jt.views) vw.scene.children.forEach(o => { if (o.isMesh) o.geometry = jt.g; });
  jtRecolor();
}
// colours (bone; what the lassos now take lit up) and which triangles show (those given by hand hidden, if asked)
function jtRecolor() {
  const entry = MESHES.get(jt.part.mesh), src = entry.geo, from = src.userData.from, si = src.attributes.skinIndex;
  const B = entry.base.attributes.position.array, hand = entry.byHand, hide = $('#jtHide').checked, c = new THREE.Color();
  const drawn = jtDrawn(), any = jtAny(drawn);
  const sel = new Uint8Array(hand.length);
  let nSel = 0;
  if (any) { const m = regionMask(entry, drawn); for (let v = 0; v < hand.length; v++) if (m[v] && !(hide && hand[v])) { sel[v] = 1; nSel++; } }
  const col = jt.g.attributes.color, white = new THREE.Color('#ffffff');
  for (let v = 0; v < si.count; v++) {
    c.set(BONE_COLOR[IMPORT_BONES[si.getX(v)]] ?? '#888');
    if (sel[from[v]]) c.lerp(white, 0.75);
    else if (any) c.multiplyScalar(0.45);
    col.setXYZ(v, c.r, c.g, c.b);
  }
  col.needsUpdate = true;
  const I = src.index.array, keep = [];
  for (let t = 0; t < I.length; t += 3) if (!(hide && hand[from[I[t]]] && hand[from[I[t + 1]]] && hand[from[I[t + 2]]])) keep.push(I[t], I[t + 1], I[t + 2]);
  jt.g.setIndex(keep);
  const views = Object.keys(jt.pending).map(v => ({ front: '正面', side: '横', back: '後ろ' })[v]);
  const what = [views.length ? `囲み ${views.join('・')}` : '', drawn.picks.length ? `板 ${drawn.picks.length} 枚` : '',
    drawn.subs.length || drawn.unpicks.length ? `外す ${drawn.subs.length + drawn.unpicks.length}` : ''].filter(Boolean).join('、');
  $('#jtNote').textContent = any
    ? `選択：${what}（${nSel.toLocaleString()} 点）。よければ「付ける」。`
    : '色が付く骨です。付けたい部品をクリックか囲みで選んでください。閉じたら「姿勢」で曲がり方を確かめられます。';
  jtDraw();
}
// view frame: world <-> canvas px
function jtFrame(vw) {
  const r = vw.el.getBoundingClientRect(), b = jt.box, size = b.getSize(new THREE.Vector3()), c = b.getCenter(new THREE.Vector3());
  const span = Math.max(size.y, Math.max(size.x, size.z) * r.height / r.width) * 1.08, s = r.height / span * jt.zoom;
  const V = JT_VIEWS[vw.v], right = V3(V.right);
  // the views zoom together and keep one height; each can be moved sideways on its own
  c.addScaledVector(right, jt.du[vw.v] ?? 0); if (jt.cy != null) c.y = jt.cy;
  return { r, s, c, right, up: new THREE.Vector3(0, 1, 0), eye: V3(V.eye),
    toPx: p => [r.width / 2 + V3(p).sub(c).dot(right) * s, r.height / 2 - (p[1] - c.y) * s],
    uvToPx: ([u, v]) => [r.width / 2 + (u - c.dot(right)) * s, r.height / 2 - (v - c.y) * s],
    pxToUV: ([px, py]) => [+((px - r.width / 2) / s + c.dot(right)).toFixed(4), +(c.y - (py - r.height / 2) / s).toFixed(4)],
    // a canvas point moves a world point within the view's plane
    move: (p, dx, dy) => V3(p).addScaledVector(right, dx / s).add(new THREE.Vector3(0, -dy / s, 0)).toArray().map(v => +v.toFixed(4)) };
}
function jtDraw() {
  if (!jt) return;
  for (const vw of jt.views) {
    const f = jtFrame(vw), w = f.r.width, h = f.r.height;
    vw.renderer.setSize(w, h, false);
    const cam = vw.cam, hw = w / 2 / f.s, hh = h / 2 / f.s;
    Object.assign(cam, { left: -hw, right: hw, top: hh, bottom: -hh, near: 0.01, far: 50 });
    cam.position.copy(f.c).addScaledVector(f.eye, 10); cam.up.set(0, 1, 0); cam.lookAt(f.c); cam.updateProjectionMatrix();
    vw.renderer.render(vw.scene, cam);
    const ov = vw.ov; ov.width = w * devicePixelRatio; ov.height = h * devicePixelRatio;
    const x = ov.getContext('2d'); x.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0); x.clearRect(0, 0, w, h);
    if (vw.v !== 'side') {   // the centre line and its handle
      const [lx] = f.toPx([jt.part.mid ?? 0, 0, 0]);
      x.strokeStyle = 'rgba(120,200,255,.8)'; x.lineWidth = 1; x.setLineDash([5, 5]);
      x.beginPath(); x.moveTo(lx, 0); x.lineTo(lx, h); x.stroke(); x.setLineDash([]);
      x.fillStyle = 'rgb(120,200,255)'; x.beginPath(); x.moveTo(lx, 9); x.lineTo(lx + 7, 16); x.lineTo(lx, 23); x.lineTo(lx - 7, 16); x.closePath(); x.fill();
    }
    for (const [n, j] of Object.entries(jt.part.joints)) {
      const [px, py] = f.toPx(j.p), rr = j.r * f.s;
      x.strokeStyle = jt.drag?.n === n ? '#ffd24a' : 'rgba(255,255,255,.85)'; x.lineWidth = 1.5;
      x.beginPath(); x.arc(px, py, rr, 0, Math.PI * 2); x.stroke();
      // the cut: the disc seen from this view (its trace through the centre)
      const ax = jointAxis(jt.part.joints, n), perp = new THREE.Vector3().crossVectors(ax, f.eye);
      if (perp.lengthSq() > 1e-4) {
        perp.normalize();
        const e = V3(j.p).addScaledVector(perp, j.r), e2 = V3(j.p).addScaledVector(perp, -j.r);
        const [ax1, ay1] = f.toPx(e.toArray()), [ax2, ay2] = f.toPx(e2.toArray());
        x.strokeStyle = 'rgba(255,90,90,.95)'; x.lineWidth = 2; x.beginPath(); x.moveTo(ax1, ay1); x.lineTo(ax2, ay2); x.stroke();
      }
      x.fillStyle = '#fff'; x.beginPath(); x.arc(px, py, 3.5, 0, Math.PI * 2); x.fill();
      const [hx, hy] = jtHandle(px, py, rr); x.fillRect(hx - 3.5, hy - 3.5, 7, 7);
      x.font = '11px system-ui'; x.fillText(JOINT_NAME[n.replace(/_[lr]$/, '')] + (n.endsWith('_l') ? '左' : n.endsWith('_r') ? '右' : ''), px + 6, py - 6);
    }
    // this view's lasso (done, or being drawn)
    const outline = (loop, color) => {
      if (!(loop?.length > 1)) return;
      x.strokeStyle = color; x.lineWidth = 2; x.setLineDash([6, 4]);
      x.beginPath(); loop.forEach(([px, py], i) => (i ? x.lineTo(px, py) : x.moveTo(px, py))); x.closePath(); x.stroke(); x.setLineDash([]);
    };
    for (const pts of jt.pending[vw.v] ?? []) outline(pts.map(f.uvToPx), '#ffd24a');
    for (const l of jt.subs) if (l.view === vw.v) outline(l.pts.map(f.uvToPx), '#ff6b6b');
    if (jt.drag?.mode === 'lasso' && jt.drag.vw === vw) outline(jt.drag.pts, jt.drag.sub ? '#ff6b6b' : '#ffd24a');
    for (const [list, color] of [[jt.picks, '#ffd24a'], [jt.unpicks, '#ff6b6b']]) for (const pk of list) {
      const [px, py] = f.toPx(pk.p);
      x.fillStyle = color; x.strokeStyle = '#000'; x.lineWidth = 1.5; x.beginPath(); x.arc(px, py, 4, 0, Math.PI * 2); x.fill(); x.stroke();
    }
  }
}
function hookView(vw) {
  const ov = vw.ov;
  const at = e => { const r = ov.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const hit = m => {
    const f = jtFrame(vw);
    // only the centre dot moves a sphere and only its square handle sizes it: the rest of the view draws lassos (the
    // circles overlap too much for their whole edge to be a handle)
    let best = null, bd = 9;
    if (vw.v !== 'side') { const [lx] = f.toPx([jt.part.mid ?? 0, 0, 0]), d = Math.hypot(lx - m[0], 16 - m[1]); if (d < bd) { bd = d; best = { n: null, mode: 'mid' }; } }
    for (const [n, j] of Object.entries(jt.part.joints)) {
      const [px, py] = f.toPx(j.p), [hx, hy] = jtHandle(px, py, j.r * f.s);
      const d = Math.hypot(px - m[0], py - m[1]), dh = Math.hypot(hx - m[0], hy - m[1]);
      if (d < bd) { bd = d; best = { n, mode: 'move' }; }
      if (dh < bd) { bd = dh; best = { n, mode: 'size' }; }
    }
    return best;
  };
  ov.oncontextmenu = e => e.preventDefault();
  ov.onpointerdown = e => {
    const m = at(e);
    try { ov.setPointerCapture(e.pointerId); } catch { /* a pointer no longer down */ }
    if (e.button === 1 || e.button === 2) { e.preventDefault(); jt.drag = { mode: 'pan', vw, m, m0: m, right: e.button === 2 }; return; }
    if (e.button !== 0) return;
    const h = !e.shiftKey && hit(m);
    if (h?.mode === 'mid') { jt.drag = { mode: 'mid', vw }; return; }
    if (h) { jt.drag = { ...h, vw, m, p: jt.part.joints[h.n].p.slice(), r: jt.part.joints[h.n].r }; jtDraw(); return; }
    jt.drag = { mode: 'lasso', vw, pts: [m], sub: e.altKey, add: e.shiftKey };
  };
  ov.onwheel = e => {   // zoom about the point under the cursor
    e.preventDefault();
    const m = at(e), f = jtFrame(vw), [u, v] = f.pxToUV(m);
    jt.zoom = Math.min(20, Math.max(1, jt.zoom * (e.deltaY < 0 ? 1.2 : 1 / 1.2)));
    if (jt.zoom === 1) { jt.cy = null; jt.du = {}; jtDraw(); return; }
    const f2 = jtFrame(vw), base = f2.c.dot(f2.right) - (jt.du[vw.v] ?? 0);
    jt.du[vw.v] = u - (m[0] - f2.r.width / 2) / f2.s - base;
    jt.cy = v + (m[1] - f2.r.height / 2) / f2.s;
    jtDraw();
  };
  ov.onpointermove = e => {
    const m = at(e);
    if (!jt?.drag || jt.drag.vw !== vw) { const h = hit(m); ov.style.cursor = h ? (h.mode === 'size' ? 'nwse-resize' : h.mode === 'mid' ? 'ew-resize' : 'grab') : 'crosshair'; return; }
    const d = jt.drag;
    if (d.mode === 'mid') {   // the centre line: a point's x in the part is its view coordinate along the view's right
      const f = jtFrame(vw), [u] = f.pxToUV(m);
      jt.part.mid = +(u * f.right.x).toFixed(4);
      jtDraw(); return;
    }
    if (d.mode === 'pan') {
      const f = jtFrame(vw);
      jt.du[vw.v] = (jt.du[vw.v] ?? 0) - (m[0] - d.m[0]) / f.s;
      jt.cy = f.c.y + (m[1] - d.m[1]) / f.s;
      d.m = m; jtDraw(); return;
    }
    if (d.mode === 'lasso') {
      const last = d.pts[d.pts.length - 1];
      if (Math.hypot(m[0] - last[0], m[1] - last[1]) >= 3) d.pts.push(m);
      jtDraw(); return;
    }
    const f = jtFrame(vw), j = jt.part.joints[d.n];
    if (d.mode === 'move') j.p = f.move(d.p, m[0] - d.m[0], m[1] - d.m[1]);
    else { const [px, py] = f.toPx(j.p); j.r = +Math.max(0.03, Math.hypot(m[0] - px, m[1] - py) / f.s).toFixed(3); }
    // left and right move together, mirrored
    const twin = d.n.endsWith('_l') ? d.n.replace(/_l$/, '_r') : d.n.endsWith('_r') ? d.n.replace(/_r$/, '_l') : null;
    if (twin && jt.part.joints[twin] && !e.altKey) jt.part.joints[twin] = { p: [+(2 * (jt.part.mid ?? 0) - j.p[0]).toFixed(4), j.p[1], j.p[2]], r: j.r };
    jtDraw();
  };
  ov.onpointerup = ov.onpointercancel = () => {
    const d = jt?.drag;
    if (!d) return;
    jt.drag = null;
    if (d.mode === 'pan') {   // a right click that did not move lets go of the lassos
      if (d.right && Math.hypot(d.m[0] - d.m0[0], d.m[1] - d.m0[1]) < 4) jtChange(jtClear);
      return;
    }
    if (d.mode === 'lasso') {   // a lasso replaces this view's (with Shift it adds to them, with Alt it cuts out)
      const [x0, y0] = d.pts[0], moved = Math.max(...d.pts.map(([x, y]) => Math.hypot(x - x0, y - y0)));
      if (moved < 5) {   // a click: the plate under it (Shift adds, Alt takes away, else it starts a new selection)
        const r = ov.getBoundingClientRect(), ray = new THREE.Raycaster();
        ray.setFromCamera(new THREE.Vector2(x0 / r.width * 2 - 1, -y0 / r.height * 2 + 1), vw.cam);
        const hitM = ray.intersectObjects(vw.scene.children.filter(o => o.isMesh), false)[0];
        if (hitM?.face) jtChange(() => {
          const pk = { p: hitM.point.toArray().map(v => +v.toFixed(4)), n: hitM.face.normal.toArray().map(v => +v.toFixed(3)), a: +$('#jtAngle').value };
          if (d.sub) jt.unpicks.push(pk);
          else if (d.add) jt.picks.push(pk);
          else { jt.pending = {}; jt.subs = []; jt.picks = [pk]; jt.unpicks = []; }
        });
        jtRecolor(); return;
      }
      if (d.pts.length >= 3) jtChange(() => {
        const pts = d.pts.map(jtFrame(vw).pxToUV);
        if (d.sub) jt.subs.push({ view: vw.v, pts });
        else if (d.add) (jt.pending[vw.v] ??= []).push(pts);
        else { jt.pending[vw.v] = [pts]; jt.subs = jt.subs.filter(l => l.view !== vw.v); }
      });
      jtRecolor(); return;
    }
    jtChange(() => { jtUpdate(); });
  };
}


  document.addEventListener('keydown', e => {
    if (!jt) return;
    if (e.target.tagName === 'INPUT' && e.target.type !== 'checkbox' && e.target.type !== 'range') return;
    e.stopPropagation();
    if (e.key === 'Escape') closeJointTool();
    else if (e.key === 'Enter') { e.preventDefault(); jtApply(); }
    else if (e.key.toLowerCase() === 'z' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); e.shiftKey ? jtRedo() : jtUndo(); }
    else if (e.key.toLowerCase() === 'y' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); jtRedo(); }
  }, true);
  return { open: openJointTool, close: closeJointTool, active: () => !!jt };
}
/** 関節と切り分けの画面を開く（取り込んだ形のブロック p。形が読み込まれていること） */
export function openJoints(p) { ui ??= buildUI(); ui.open(p); }
export const jointsOpen = () => !!ui?.active();
/** 形の読み込みを待つ */
export function meshReady(id, ms = 20000) {
  ensureMeshes([id]);
  return new Promise(ok => { const t0 = Date.now(), tick = () => (MESHES.has(id) ? ok(true) : Date.now() - t0 > ms ? ok(false) : setTimeout(tick, 100)); tick(); });
}
