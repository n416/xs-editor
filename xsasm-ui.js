// 頭の組み立ての画面：カタログから部品を選び、mov・rot・scal で置く（DoGA の Parts Assembler と同じ考え方）。
// 3D は three.js。置いた部品は { part, name, mov, rot, scal } の並びで、localStorage に自動保存する。
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { PARTS, byId } from './xsasm-parts.js';
import { assemble, placeItem, parseFsc, fromDoga, toFscText, rotMatrix } from './xsasm.js';
import { randomHead, mirrorOf, headDims, fitScale, placementsFor } from './xsasm-random.js';
import { buildHull, hullReach } from './hull.js';

const $ = s => document.querySelector(s);
const D = Math.PI / 180;
const DOGA_TO_MINE = { rb02: 'facemask', rb01: 'headshell', rb03: 'jawblock', f204: 'fin', s207: 'crest' };
const SAVE_KEY = 'xsasm.v1';   // Ctrl+Z で元に戻す、Ctrl+Y（か Ctrl+Shift+Z）でやり直す

// ---- 見本：ユーザーが DoGA で組んだ頭と同じ置き方（qaqa.FSC）を自分の部品で ----
const SAMPLE = [
  { part: 'headshell', mov: [0, 0, -0.125], rot: [0, 0, 0], scal: [3.1, 3.2, 2.2] },
  { part: 'facemask', mov: [0, 0, 0], rot: [0, 0, 0], scal: [1, 1, 1] },
  { part: 'jawblock', mov: [0, -0.175, -0.175], rot: [10, -180, 0], scal: [2.2, 1.2, 1.3] },
  { part: 'fin', mov: [0.3, 0.175, 0], rot: [-20, 10, -110], scal: [1, 1, 1] },
  { part: 'fin', mov: [-0.3, 0.175, 0], rot: [-20, -10, 110], scal: [-1, 1, 1] },
  { part: 'crest', mov: [0, 0.3, 0.025], rot: [20, 0, 0], scal: [1, 1, 0.6] },
];

let items = [];
let selected = -1;

// ---- 3D ----
const canvas = $('#view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x14161a);
const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
camera.position.set(1.1, 0.7, 2.0);
const orbit = new OrbitControls(camera, canvas);
orbit.target.set(0, 0.1, 0);
scene.add(new THREE.HemisphereLight(0xdde4f0, 0x1a1c22, 0.9));
const key = new THREE.DirectionalLight(0xffffff, 1.4); key.position.set(1.2, 2, 1.6); scene.add(key);
const fill = new THREE.DirectionalLight(0x8fb3ff, 0.5); fill.position.set(-1.5, 0.5, -1); scene.add(fill);
scene.add(new THREE.GridHelper(2, 20, 0x2c3038, 0x22252b));
const root = new THREE.Group(); scene.add(root);
const gizmo = new TransformControls(camera, canvas);
gizmo.setSize(0.8);
gizmo.addEventListener('dragging-changed', e => { orbit.enabled = !e.value; if (!e.value) save(); });
gizmo.addEventListener('objectChange', () => { if (selected >= 0) { readBackFromGroup(items[selected], gizmo.object); fillFields(); updateHeight(); } });
scene.add(gizmo);

const GEO = new Map();   // 部品 id + piece 名 → 形（部品ごとの座標）
function pieceGeometry(partId, pc) {
  const k = partId + '·' + pc.name;
  if (!GEO.has(k)) {
    const h = buildHull(pc.planes, { bevel: pc.bevel ?? 0, bevelSegs: pc.bevelSegs ?? 1, reach: hullReach(pc.planes) });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(h.positions, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(h.normals, 3));
    GEO.set(k, g);
  }
  return GEO.get(k);
}
const MATS = new Map();
function material(pc) {
  const k = (pc.color ?? '#c3c9d2') + (pc.glow ? 'g' : '');
  if (!MATS.has(k)) MATS.set(k, new THREE.MeshStandardMaterial({ color: pc.color ?? '#c3c9d2', metalness: pc.glow ? 0 : 0.45, roughness: pc.glow ? 0.35 : 0.5, flatShading: true, emissive: pc.glow ? new THREE.Color(pc.color) : new THREE.Color(0), emissiveIntensity: pc.glow ? 0.9 : 0, side: THREE.DoubleSide }));
  return MATS.get(k);
}
/** 置いた部品 1 個 → three の Group（部品の座標のまま子を並べ、Group に mov・rot・scal を持たせる） */
function groupOf(item, index) {
  const def = byId[item.part];
  const g = new THREE.Group();
  g.userData.index = index;
  for (const pc of def.pieces) {
    const m = new THREE.Mesh(pieceGeometry(def.id, pc), material(pc));
    m.position.set(...(pc.pos ?? [0, 0, 0]));
    m.userData.index = index;
    g.add(m);
  }
  applyToGroup(item, g);
  return g;
}
function applyToGroup(item, g) {
  g.position.set(...item.mov);
  g.quaternion.setFromRotationMatrix(rotMatrix(item.rot));
  g.scale.set(...item.scal);
}
function readBackFromGroup(item, g) {
  item.mov = g.position.toArray().map(v => round(v, 4));
  const e = new THREE.Euler().setFromQuaternion(g.quaternion, 'YXZ');   // Ry·Rx·Rz：この組み立ての回転の順
  item.rot = [round(e.x / D, 1), round(e.y / D, 1), round(e.z / D, 1)];
  item.scal = g.scale.toArray().map(v => round(v, 3));
}
const round = (v, n) => Math.round(v * 10 ** n) / 10 ** n;

function rebuild() {
  while (root.children.length) root.remove(root.children[0]);
  items.forEach((it, i) => root.add(groupOf(it, i)));
  if (selected >= 0 && selected < items.length) gizmo.attach(root.children[selected]); else gizmo.detach();
  renderList();
  fillFields();
  updateHeight();
}
function bounds() {
  const b = new THREE.Box3();
  root.updateMatrixWorld(true);
  root.traverse(o => { if (o.isMesh) { o.geometry.computeBoundingBox(); b.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld)); } });
  return b;
}
function updateHeight() {
  const b = bounds();
  const k = +$('#expScale').value || 1;
  $('#expHeight').textContent = b.isEmpty() ? '' : `${(b.getSize(new THREE.Vector3()).y * k).toFixed(3)}（1 = 6 m。XS の頭は 0.3 くらい）`;
}

function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== w * renderer.getPixelRatio() || canvas.height !== h * renderer.getPixelRatio()) { renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
}
function tick() { resize(); orbit.update(); renderer.render(scene, camera); requestAnimationFrame(tick); }

// クリックで選ぶ
const ray = new THREE.Raycaster();
let downAt = null;
canvas.addEventListener('pointerdown', e => { downAt = [e.clientX, e.clientY]; });
/** 新しい部品の置き方：「ランダムに組む」と同じ決め方で、目安の真ん中に置く（向き・位置・倍率とも）。左右の対の部品は右だけ置く
 *  （左は「鏡像で増やす」）。頭の殻がなければ中心。同じ部品が同じ所にあれば横へずらす */
function placeNew(partId) {
  const shell = items.find(it => byId[it.part]?.cat === '頭蓋');
  const it = shell ? placementsFor(partId, shell, () => 0.5)[0] : { part: partId, mov: [0, 0, 0], rot: [0, 0, 0], scal: [1, 1, 1] };
  it.mov = it.mov.map(v => round(v, 4)); it.rot = it.rot.map(v => round(v, 1)); it.scal = it.scal.map(v => round(v, 3));
  const same = o => o.part === it.part && o.mov.every((v, i) => Math.abs(v - it.mov[i]) < 1e-6);
  for (let k = 0; k < 20 && items.some(same); k++) it.mov[0] = round(it.mov[0] + 0.1, 4);
  return it;
}
canvas.addEventListener('pointerup', e => {
  if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 4 || gizmo.dragging) { downAt = null; return; }
  downAt = null;
  const r = canvas.getBoundingClientRect();
  ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
  const hits = ray.intersectObjects(root.children, true);
  select(hits.length ? hits[0].object.userData.index : -1);
});
document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
  if (e.key === 'w') gizmo.setMode('translate'); else if (e.key === 'e') gizmo.setMode('rotate'); else if (e.key === 'r') gizmo.setMode('scale');
  else if (e.key === 'Delete' && selected >= 0) removeSelected();
});
for (const b of document.querySelectorAll('#gizmo button')) b.onclick = () => gizmo.setMode(b.dataset.mode);

// ---- 一覧と欄 ----
function select(i) { selected = i; if (i >= 0) gizmo.attach(root.children[i]); else gizmo.detach(); renderList(); fillFields(); }
function renderList() {
  const el = $('#items');
  el.innerHTML = '';
  items.forEach((it, i) => {
    const d = document.createElement('div');
    d.className = i === selected ? 'sel' : '';
    d.innerHTML = `<span>${i + 1}. ${it.name ?? byId[it.part]?.name ?? it.part}</span>`;
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
  const it = items[selected]; const v = parseFloat($('#' + id).value);
  if (!Number.isFinite(v)) return;
  it[k][j] = v; applyToGroup(it, root.children[selected]); updateHeight(); save();
};
$('#fName').oninput = () => { if (selected >= 0) { items[selected].name = $('#fName').value; renderList(); save(); } };

function addItem(it) { items.push(it); selected = items.length - 1; rebuild(); save(); }
function removeSelected() { if (selected < 0) return; items.splice(selected, 1); selected = Math.min(selected, items.length - 1); rebuild(); save(); }
$('#bDel').onclick = removeSelected;
$('#bDup').onclick = () => { if (selected < 0) return; const it = structuredClone(items[selected]); it.mov = [it.mov[0] + 0.05, it.mov[1], it.mov[2]]; addItem(it); };
$('#bMirror').onclick = () => {
  if (selected < 0) return;
  addItem(mirrorOf(structuredClone(items[selected])));   // x = 0 の面で折り返す：位置の x、縦軸と前後軸まわりの回転、拡大の x を反転
};

// ---- カタログ（部品ごとに小さな絵） ----
// 小さな絵は 1 つの描画器を使い回す（部品ごとに WebGL を作るとブラウザの上限に当たる）
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
  const g = groupOf({ part: def.id, mov: [0, 0, 0], rot: [0, 0, 0], scal: [1, 1, 1] }, -1);
  thumbScene.add(g);
  const b = new THREE.Box3().setFromObject(g);
  const c = b.getCenter(new THREE.Vector3()), size = b.getSize(new THREE.Vector3()).length();
  const cam = new THREE.PerspectiveCamera(30, w / h, 0.01, 100);
  cam.position.copy(c).add(new THREE.Vector3(0.62, 0.36, 0.7).multiplyScalar(size * 2.2));
  cam.lookAt(c);
  thumbR.render(thumbScene, cam);
  cv.getContext('2d').drawImage(thumbR.domElement, 0, 0);
  thumbScene.remove(g);
}
function renderCatalog() {
  const el = $('#catalog');
  el.innerHTML = '';
  const cats = [...new Set(PARTS.map(p => p.cat))];
  for (const cat of cats) {
    const h = document.createElement('h2'); h.textContent = cat; el.appendChild(h);
    const grid = document.createElement('div'); grid.className = 'cat'; el.appendChild(grid);
    for (const def of PARTS.filter(p => p.cat === cat && !p.retired)) {
      const b = document.createElement('button');
      const cv = document.createElement('canvas'); b.appendChild(cv);
      const s = document.createElement('span'); s.textContent = def.name; b.appendChild(s);
      b.title = def.name;
      b.onclick = () => addItem(placeNew(def.id));
      grid.appendChild(b);
      try { thumbnail(def, cv); } catch (e) { console.warn('thumbnail', def.id, e); }
    }
  }
}

// ---- 保存・読み込み・書き出し ----
// ---- 元に戻す（Ctrl+Z）・やり直す（Ctrl+Y）：置いたものの並びを丸ごと覚える ----
const hist = [];
let histPos = -1, histAt = 0;
function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify({ items, selected })); } catch {} }
function save() {
  persist();
  const snap = JSON.stringify(items);
  if (hist[histPos] === snap) return;
  const now = Date.now();
  if (now - histAt < 400 && histPos >= 0) hist[histPos] = snap;      // 欄の連打やつまみの続きは 1 つに
  else { hist.length = histPos + 1; hist.push(snap); histPos = hist.length - 1; if (hist.length > 100) { hist.shift(); histPos--; } }
  histAt = now;
}
function restore(pos) {
  if (pos < 0 || pos >= hist.length) return;
  histPos = pos; histAt = 0;
  items = JSON.parse(hist[pos]); selected = -1; rebuild(); persist();
  note(`${pos + 1} / ${hist.length}`);
}
const undo = () => restore(histPos - 1), redo = () => restore(histPos + 1);
function load() { try { const d = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null'); if (d && Array.isArray(d.items)) { items = d.items.filter(it => byId[it.part]); selected = -1; return true; } } catch {} return false; }
function readPasted(text) {
  text = text.trim();
  if (!text) return;
  if (text.startsWith('[') || text.startsWith('{')) {
    const d = JSON.parse(text);
    const list = Array.isArray(d) ? d : d.items;
    if (!Array.isArray(list)) throw new Error('組み立て JSON の形が違います');
    items = list.filter(it => byId[it.part]).map(it => ({ part: it.part, name: it.name, mov: it.mov ?? [0, 0, 0], rot: it.rot ?? [0, 0, 0], scal: it.scal ?? [1, 1, 1] }));
  } else if (/\bmov\s*\(/.test(text)) {
    const list = parseFsc(text);
    items = list.map(it => { const id = DOGA_TO_MINE[it.obj.toLowerCase()] ?? (byId[it.obj] ? it.obj : null); return id ? fromDoga(it, id) : null; }).filter(Boolean);
    if (!items.length) throw new Error('.FSC に読める部品がありませんでした');
  } else throw new Error('組み立て JSON か .FSC を貼ってください');
  selected = -1; rebuild(); save();
}
$('#bApply').onclick = () => { try { readPasted($('#paste').value); note('読みました'); } catch (e) { note('読めません：' + e.message, true); } };
$('#bCopyAsm').onclick = () => copy(JSON.stringify(items, null, 1), '組み立て JSON をコピーしました');
$('#bCopyParts').onclick = () => {
  const k = +$('#expScale').value || 1;
  const scaled = items.map(it => ({ ...it, mov: it.mov.map(v => v * k), scal: it.scal.map(v => v * k) }));
  const parts = assemble(scaled).map(p => ({ ...p, bone: 'head' }));
  copy(JSON.stringify(parts), `部品 JSON をコピーしました（${parts.length} 個）。機体エディタの「AI に描いてもらう」の貼り付け欄に貼ってください`);
};
$('#expScale').oninput = updateHeight;
async function copy(text, msg) { try { await navigator.clipboard.writeText(text); note(msg); } catch { $('#paste').value = text; note('クリップボードに書けないので、読み込み欄に出しました'); } }
function note(s, warn) { const el = $('#note'); el.textContent = s; el.style.color = warn ? 'var(--warn)' : 'var(--dim)'; clearTimeout(note.t); note.t = setTimeout(() => { el.textContent = ''; }, 4000); }

$('#bNew').onclick = () => { items = []; selected = -1; rebuild(); save(); };
$('#bSample').onclick = () => { items = structuredClone(SAMPLE); selected = -1; rebuild(); save(); };

// ---- ランダムに組む（xsasm-random.js） ----
$('#bRandom').onclick = () => { items = randomHead(); selected = -1; rebuild(); save(); };

// ---- 起動 ----
renderCatalog();
if (!load()) items = structuredClone(SAMPLE);
rebuild();
save();
tick();
