// 頭の組み立て（部品を置いて頭を組む）を部品エディタに組み込む画面。
// 3D の表示はエディタの画面をそのまま使う：組んだ頭を機体の頭の位置に仮に置いて見せ、「この頭を機体に付ける」で確定、「閉じる」で元に戻す。
// エディタ側は openHeadAsm(api) を呼ぶ。api は index.html が渡す（部品の追加・削除・骨の判定・範囲・保存など）。
// 組み立て（items）は { part, mov, rot, scal } の並び（xsasm.js）。置き方の目安は xsasm-random.js と共通。
import * as THREE from 'three';
import { PARTS, byId } from './xsasm-parts.js';
import { assemble, parseFsc, fromDoga, rotMatrix } from './xsasm.js';
import { randomHead, mirrorOf, placementsFor } from './xsasm-random.js';
import { buildHull, hullReach } from './hull.js';

const CSS = `
#haPanel { position: absolute; left: 12px; top: 52px; width: 420px; max-height: calc(100% - 64px); z-index: 6; display: flex; flex-direction: column; }
#haPanel[hidden] { display: none; }
#haPanel .habody { overflow-y: auto; padding: 4px 2px 6px; }
#haPanel h2 { font-size: 12px; margin: 8px 0 4px; color: var(--dim); font-weight: 600; }
#haPanel .hacat { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; }
#haPanel .hacat button { padding: 3px; display: flex; flex-direction: column; align-items: center; gap: 1px; font-size: 11px; line-height: 1.2; }
#haPanel .hacat canvas { width: 84px; height: 56px; background: #0f1114; border-radius: 4px; }
#haPanel .haitems { display: flex; flex-direction: column; gap: 2px; }
#haPanel .haitems > div { display: flex; align-items: center; gap: 4px; padding: 2px 6px; border-radius: 4px; cursor: pointer; font-size: 12px; }
#haPanel .haitems > div.sel { background: #2b4a6f; }
#haPanel .haitems > div span { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#haPanel .harow { display: grid; grid-template-columns: 40px 1fr 1fr 1fr; align-items: center; gap: 4px; margin: 3px 0; font-size: 12px; }
#haPanel .harow label { color: var(--dim); }
#haPanel .harow input { width: 100%; box-sizing: border-box; }
#haPanel .hafoot { display: flex; flex-wrap: wrap; gap: 4px; padding-top: 6px; border-top: 1px solid var(--line); }
#haPanel .hafoot button { flex: 1; white-space: nowrap; }
#haPanel .hatop { display: flex; gap: 4px; align-items: center; flex-wrap: wrap; }
#haPanel .hanote { font-size: 11px; color: var(--dim); margin: 2px 0 6px; }
#haPanel textarea { width: 100%; height: 60px; box-sizing: border-box; background: var(--panel2); color: var(--text); border: 1px solid var(--line); border-radius: 5px; font: 11px/1.3 monospace; }
#haPanel .hadeg { display: grid; grid-template-columns: 60px 1fr 40px; align-items: center; gap: 6px; margin: 3px 0; font-size: 12px; }
#haPanel .hadeg label { color: var(--dim); }
#haPanel .hadeg output { text-align: right; color: var(--dim); font-variant-numeric: tabular-nums; }
`;
const D = Math.PI / 180;
const DOGA_TO_MINE = { rb02: 'facemask', rb01: 'headshell', rb03: 'jawblock', f204: 'fin', s207: 'crest' };
const SAMPLE = [
  { part: 'headshell', mov: [0, 0, -0.125], rot: [0, 0, 0], scal: [3.1, 3.2, 2.2] },
  { part: 'facemask', mov: [0, 0, 0], rot: [0, 0, 0], scal: [1, 1, 1] },
  { part: 'jawblock', mov: [0, -0.175, -0.175], rot: [10, -180, 0], scal: [2.2, 1.2, 1.3] },
  { part: 'fin', mov: [0.3, 0.175, 0], rot: [-20, 10, -110], scal: [1, 1, 1] },
  { part: 'fin', mov: [-0.3, 0.175, 0], rot: [-20, -10, 110], scal: [-1, 1, 1] },
  { part: 'crest', mov: [0, 0.3, 0.025], rot: [20, 0, 0], scal: [1, 1, 0.6] },
];
const SAVE_KEY = 'xsasm.editor.v1';
const round = (v, n) => Math.round(v * 10 ** n) / 10 ** n;

let panel = null, api = null, st = null;

export function openHeadAsm(editorApi) {
  api = editorApi;
  if (!panel) { panel = build(); document.body.appendChild(panel); }
  if (st) return;
  let items = null;
  try { const d = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null'); if (d && Array.isArray(d.items)) items = d.items.filter(it => byId[it.part]); } catch {}
  st = { items: items && items.length ? items : structuredClone(SAMPLE), selected: -1, previewIds: [], hidden: [], base: findPlacement(), nudge: { scale: 1, dy: 0, dz: 0 }, timer: 0 };
  hideExistingHead();
  panel.hidden = false;
  renderList();
  preview();
  const c = st.base.pos;
  api.look([c[0], c[1], c[2]], 1.2 * st.base.scale);
}

function closeHeadAsm(keep) {
  if (!st) return;
  clearTimeout(st.timer);
  if (keep) { st.hidden = []; api.commit(); }   // 古い頭は消したまま（入れ替え）
  else { api.removeIds(st.previewIds); restoreHidden(); api.refresh(); }
  st = null;
  panel.hidden = true;
}

// ---- 頭の置き場所：今の頭の骨の部品の範囲、なければ あたり・頭、なければ標準の位置（頭ジェネレーターと同じ） ----
function findPlacement() {
  const list = api.parts().filter(p => !p.blockout && p.op === 'add' && api.bone(p) === 'head' && !/^首/.test(p.name));
  const box = unionBounds(list);
  if (box) {
    const w = box.max[0] - box.min[0], h = box.max[1] - box.min[1];
    const scale = Math.max(0.5, Math.min(2, ((w / 0.26) + (h / 0.3)) / 2));
    return { pos: [(box.min[0] + box.max[0]) / 2, (box.min[1] + box.max[1]) / 2, (box.min[2] + box.max[2]) / 2], scale, from: 'head' };
  }
  const rough = api.parts().filter(p => p.blockout && /頭/.test(p.name));
  const rb = unionBounds(rough);
  if (rb) return { pos: [(rb.min[0] + rb.max[0]) / 2, (rb.min[1] + rb.max[1]) / 2, (rb.min[2] + rb.max[2]) / 2], scale: Math.max(0.5, Math.min(2, (rb.max[0] - rb.min[0]) / 0.26)), from: 'rough' };
  return { pos: [0, 2.87, 0.01], scale: 1, from: 'default' };
}
function unionBounds(list) {
  let out = null;
  for (const p of list) {
    const b = api.bounds(p);
    if (!b) continue;
    if (!out) out = { min: b.min.slice(), max: b.max.slice() };
    else for (let i = 0; i < 3; i++) { out.min[i] = Math.min(out.min[i], b.min[i]); out.max[i] = Math.max(out.max[i], b.max[i]); }
  }
  return out;
}
function hideExistingHead() {
  if (st.hidden.length) return;
  const all = api.parts();
  const targets = all.map((p, i) => [p, i]).filter(([p]) => !p.blockout && api.bone(p) === 'head');
  st.hidden = targets.map(([p, i]) => ({ index: i, data: api.serialize(p) }));
  api.removeIds(targets.map(([p]) => p.id));
}
function restoreHidden() {
  for (const h of st.hidden.sort((a, b) => a.index - b.index)) api.insertAt(h.index, h.data);
  st.hidden = [];
}

// ---- 組んだ頭の大きさ（部品の座標での範囲）：hull を組んで測る ----
const GEO = new Map();
function pieceGeometry(partId, pc) {
  const k = partId + '·' + pc.name;
  if (!GEO.has(k)) { const h = buildHull(pc.planes, { bevel: pc.bevel ?? 0, bevelSegs: pc.bevelSegs ?? 1, reach: hullReach(pc.planes) }); const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(h.positions, 3)); g.computeBoundingBox(); GEO.set(k, g); }
  return GEO.get(k);
}
function assemblyBox(items) {
  const box = new THREE.Box3();
  for (const it of items) {
    const def = byId[it.part]; if (!def) continue;
    const m = new THREE.Matrix4().compose(new THREE.Vector3(...it.mov), new THREE.Quaternion().setFromRotationMatrix(rotMatrix(it.rot)), new THREE.Vector3(...it.scal));
    for (const pc of def.pieces) { const b = pieceGeometry(def.id, pc).boundingBox.clone(); b.translate(new THREE.Vector3(...(pc.pos ?? [0, 0, 0]))); box.union(b.applyMatrix4(m)); }
  }
  return box;
}
/** 組み立て → 機体に置く部品（頭の高さを今の頭に合わせ、中心を頭の位置へ） */
function placedParts() {
  const items = st.items;
  const box = assemblyBox(items);
  if (box.isEmpty()) return [];
  const size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  const k = (0.3 * st.base.scale * st.nudge.scale) / Math.max(1e-6, size.y);
  const base = [st.base.pos[0], st.base.pos[1] + st.nudge.dy, st.base.pos[2] + st.nudge.dz];
  const moved = items.map(it => ({ ...it, mov: [base[0] + k * (it.mov[0] - c.x), base[1] + k * (it.mov[1] - c.y), base[2] + k * (it.mov[2] - c.z)], scal: it.scal.map(v => v * k) }));
  return assemble(moved).map(p => ({ ...p, bone: 'head' }));
}
function preview() {
  if (!st) return;
  clearTimeout(st.timer);
  st.timer = setTimeout(() => {
    if (!st) return;
    const parts = placedParts();
    api.removeIds(st.previewIds);
    st.previewIds = api.add(parts);
    api.refresh();
    const n = panel.querySelector('#haCount');
    if (n) n.textContent = `${st.items.length} 個の部品（${parts.length} 部品）`;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify({ items: st.items })); } catch {}
  }, 60);
}

// ---- 置く・直す ----
function placeNew(partId) {
  const shell = st.items.find(it => byId[it.part]?.cat === '頭蓋');
  const it = shell ? placementsFor(partId, shell, () => 0.5)[0] : { part: partId, mov: [0, 0, 0], rot: [0, 0, 0], scal: [1, 1, 1] };
  it.mov = it.mov.map(v => round(v, 4)); it.rot = it.rot.map(v => round(v, 1)); it.scal = it.scal.map(v => round(v, 3));
  const same = o => o.part === it.part && o.mov.every((v, i) => Math.abs(v - it.mov[i]) < 1e-6);
  for (let k = 0; k < 20 && st.items.some(same); k++) it.mov[0] = round(it.mov[0] + 0.1, 4);
  return it;
}
function addItem(it) { st.items.push(it); st.selected = st.items.length - 1; renderList(); preview(); }
function removeSelected() { if (st.selected < 0) return; st.items.splice(st.selected, 1); st.selected = Math.min(st.selected, st.items.length - 1); renderList(); preview(); }
function select(i) { st.selected = i; renderList(); }

// ---- 画面 ----
const FIELDS = { mx: ['mov', 0, 0.01], my: ['mov', 1, 0.01], mz: ['mov', 2, 0.01], rx: ['rot', 0, 5], ry: ['rot', 1, 5], rz: ['rot', 2, 5], sx: ['scal', 0, 0.1], sy: ['scal', 1, 0.1], sz: ['scal', 2, 0.1] };
function build() {
  const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
  const el = document.createElement('div');
  el.id = 'haPanel'; el.className = 'pop'; el.hidden = true;
  el.innerHTML = `
    <div class="pophead"><h2 style="margin:0;font-size:14px">頭の組み立て</h2><span id="haCount" class="hanote" style="margin:0 auto 0 8px"></span><button id="haClose" title="仮に置いた頭を消して、元の頭に戻す">閉じる</button></div>
    <div class="habody">
      <div class="hatop">
        <button id="haRandom" title="頭の殻を置いて、部位ごとに部品を選んで組む">ランダムに組む</button>
        <button id="haSample" title="DoGA で組んだ頭と同じ置き方">見本</button>
        <button id="haNew">新しく</button>
      </div>
      <p class="hanote">カタログを押すと、その部位の決まった所に置く（左右の対は右だけ。左は「鏡像で増やす」）。位置は部品の座標（頭の殻の幅が 0.19 ほど）。機体には今の頭の大きさに合わせて置く</p>
      <h2>置き場所（機体の頭に対して）</h2>
      <div class="hadeg"><label>大きさ</label><input type="range" id="haScale" min="0.5" max="2" step="0.05" value="1"><output id="haScaleO">1.00</output></div>
      <div class="hadeg"><label>上下</label><input type="range" id="haDy" min="-0.2" max="0.2" step="0.005" value="0"><output id="haDyO">0.000</output></div>
      <div class="hadeg"><label>前後</label><input type="range" id="haDz" min="-0.2" max="0.2" step="0.005" value="0"><output id="haDzO">0.000</output></div>
      <h2>置いた部品</h2>
      <div id="haItems" class="haitems"></div>
      <div id="haSel" hidden>
        <div class="harow"><label>位置</label><input type="number" step="0.01" id="ha_mx"><input type="number" step="0.01" id="ha_my"><input type="number" step="0.01" id="ha_mz"></div>
        <div class="harow"><label>回転</label><input type="number" step="5" id="ha_rx"><input type="number" step="5" id="ha_ry"><input type="number" step="5" id="ha_rz"></div>
        <div class="harow"><label>拡大</label><input type="number" step="0.1" id="ha_sx"><input type="number" step="0.1" id="ha_sy"><input type="number" step="0.1" id="ha_sz"></div>
        <p class="hanote">回転は度。先に z（前後軸まわり）、次に x（横軸）、最後に y（縦軸）。拡大の x を負にすると左右の鏡像</p>
        <div class="hatop"><button id="haMirror">鏡像で増やす</button><button id="haDup">複製</button><button id="haDel">消す</button></div>
      </div>
      <h2>部品カタログ</h2>
      <div id="haCatalog"></div>
      <h2>組み立ての読み書き</h2>
      <textarea id="haPaste" placeholder="組み立て JSON、または DoGA の .FSC の中身を貼る"></textarea>
      <div class="hatop"><button id="haApply">貼ったものを読む</button><button id="haCopyAsm">組み立て JSON をコピー</button></div>
    </div>
    <div class="hafoot">
      <button id="haCommit" class="on" title="仮に置いた頭をそのまま機体の部品にする（元の頭は消える。元に戻すで戻せる）">この頭を機体に付ける</button>
      <button id="haCopyParts" title="機体に置いた形の部品 JSON（AI に描いてもらう の形式）">部品 JSON をコピー</button>
    </div>`;
  el.querySelector('#haClose').onclick = () => closeHeadAsm(false);
  el.querySelector('#haCommit').onclick = () => closeHeadAsm(true);
  el.querySelector('#haRandom').onclick = () => { st.items = randomHead(); st.selected = -1; renderList(); preview(); };
  el.querySelector('#haSample').onclick = () => { st.items = structuredClone(SAMPLE); st.selected = -1; renderList(); preview(); };
  el.querySelector('#haNew').onclick = () => { st.items = []; st.selected = -1; renderList(); preview(); };
  el.querySelector('#haMirror').onclick = () => { if (st.selected >= 0) addItem(mirrorOf(structuredClone(st.items[st.selected]))); };
  el.querySelector('#haDup').onclick = () => { if (st.selected >= 0) { const it = structuredClone(st.items[st.selected]); it.mov[0] += 0.05; addItem(it); } };
  el.querySelector('#haDel').onclick = removeSelected;
  for (const [id, [k, j]] of Object.entries(FIELDS)) el.querySelector('#ha_' + id).oninput = e => { if (st.selected < 0) return; const v = parseFloat(e.target.value); if (!Number.isFinite(v)) return; st.items[st.selected][k][j] = v; preview(); };
  for (const [id, key, digits] of [['haScale', 'scale', 2], ['haDy', 'dy', 3], ['haDz', 'dz', 3]]) el.querySelector('#' + id).oninput = e => { st.nudge[key] = +e.target.value; el.querySelector('#' + id + 'O').textContent = (+e.target.value).toFixed(digits); preview(); };
  el.querySelector('#haApply').onclick = () => { try { readPasted(el.querySelector('#haPaste').value); } catch (e) { api.ask('読めません：' + e.message, { cancel: null }); } };
  el.querySelector('#haCopyAsm').onclick = async () => { try { await navigator.clipboard.writeText(JSON.stringify(st.items, null, 1)); api.ask('組み立て JSON をコピーしました。', { cancel: null }); } catch { el.querySelector('#haPaste').value = JSON.stringify(st.items, null, 1); } };
  el.querySelector('#haCopyParts').onclick = async () => { const parts = placedParts(); try { await navigator.clipboard.writeText(JSON.stringify(parts)); api.ask(`部品 JSON をコピーしました（${parts.length} 個）。`, { cancel: null }); } catch { api.ask('コピーできませんでした（ブラウザの許可）。', { cancel: null }); } };
  renderCatalog(el.querySelector('#haCatalog'));
  return el;
}
function renderList() {
  const el = panel.querySelector('#haItems');
  el.innerHTML = '';
  st.items.forEach((it, i) => {
    const d = document.createElement('div');
    d.className = i === st.selected ? 'sel' : '';
    d.innerHTML = `<span>${i + 1}. ${it.name ?? byId[it.part]?.name ?? it.part}</span>`;
    d.onclick = () => select(i);
    el.appendChild(d);
  });
  const sel = panel.querySelector('#haSel');
  sel.hidden = st.selected < 0;
  if (st.selected >= 0) for (const [id, [k, j]] of Object.entries(FIELDS)) panel.querySelector('#ha_' + id).value = st.items[st.selected][k][j];
}
function readPasted(text) {
  text = text.trim();
  if (!text) return;
  let items;
  if (text.startsWith('[') || text.startsWith('{')) {
    const d = JSON.parse(text); const list = Array.isArray(d) ? d : d.items;
    if (!Array.isArray(list)) throw new Error('組み立て JSON の形が違います');
    items = list.filter(it => byId[it.part]).map(it => ({ part: it.part, name: it.name, mov: it.mov ?? [0, 0, 0], rot: it.rot ?? [0, 0, 0], scal: it.scal ?? [1, 1, 1] }));
  } else if (/\bmov\s*\(/.test(text)) {
    items = parseFsc(text).map(it => { const id = DOGA_TO_MINE[it.obj.toLowerCase()] ?? (byId[it.obj] ? it.obj : null); return id ? fromDoga(it, id) : null; }).filter(Boolean);
    if (!items.length) throw new Error('.FSC に読める部品がありませんでした');
  } else throw new Error('組み立て JSON か .FSC を貼ってください');
  st.items = items; st.selected = -1; renderList(); preview();
}

// ---- カタログの小さな絵：1 つの描画器を使い回す ----
let thumbR = null, thumbScene = null;
const MATS = new Map();
function material(pc) {
  const k = (pc.color ?? '#c3c9d2') + (pc.glow ? 'g' : '');
  if (!MATS.has(k)) MATS.set(k, new THREE.MeshStandardMaterial({ color: pc.color ?? '#c3c9d2', metalness: pc.glow ? 0 : 0.45, roughness: pc.glow ? 0.35 : 0.5, flatShading: true, emissive: pc.glow ? new THREE.Color(pc.color) : new THREE.Color(0), emissiveIntensity: pc.glow ? 0.9 : 0, side: THREE.DoubleSide }));
  return MATS.get(k);
}
function thumbnail(def, cv) {
  const w = 168, h = 112;
  cv.width = w; cv.height = h;
  if (!thumbR) {
    thumbR = new THREE.WebGLRenderer({ canvas: document.createElement('canvas'), antialias: true, alpha: true, preserveDrawingBuffer: true });
    thumbR.setSize(w, h, false);
    thumbScene = new THREE.Scene();
    thumbScene.add(new THREE.HemisphereLight(0xdde4f0, 0x1a1c22, 0.9));
    const k = new THREE.DirectionalLight(0xffffff, 1.3); k.position.set(1, 2, 1.5); thumbScene.add(k);
  }
  const g = new THREE.Group();
  for (const pc of def.pieces) { const m = new THREE.Mesh(pieceGeometry(def.id, pc), material(pc)); m.position.set(...(pc.pos ?? [0, 0, 0])); g.add(m); }
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
function renderCatalog(root) {
  root.innerHTML = '';
  for (const cat of [...new Set(PARTS.map(p => p.cat))]) {
    const h = document.createElement('h2'); h.textContent = cat; root.appendChild(h);
    const grid = document.createElement('div'); grid.className = 'hacat'; root.appendChild(grid);
    for (const def of PARTS.filter(p => p.cat === cat)) {
      const b = document.createElement('button'); b.title = def.name;
      const cv = document.createElement('canvas'); b.appendChild(cv);
      const s = document.createElement('span'); s.textContent = def.name; b.appendChild(s);
      b.onclick = () => { if (st) addItem(placeNew(def.id)); };
      grid.appendChild(b);
      try { thumbnail(def, cv); } catch (e) { console.warn('thumbnail', def.id, e); }
    }
  }
}
