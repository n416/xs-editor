// 頭ジェネレーターの画面（部品エディタに組み込む）。
// 3D の表示はエディタの画面をそのまま使う：作った部品を仮に置いて見せ、「機体に付ける」で確定、「閉じる」で元に戻す。
// エディタ側は openHeadGen(api) を呼ぶ。api は index.html が渡す（部品の追加・削除・骨の判定・範囲・保存など）。
import { SLOTS, STYLE_AXES, PALETTES, PRESETS, randomSpec, randomSlot, normalizeSpec, buildHead, makeRng, toModelJson, seedFromText } from './xshead.js';

const CSS = `
#hgPanel { position: absolute; left: 12px; top: 52px; width: 400px; max-height: calc(100% - 64px); z-index: 6; display: flex; flex-direction: column; }
#hgPanel[hidden] { display: none; }
#hgPanel .hgbody { overflow-y: auto; padding: 4px 2px 6px; }
#hgPanel h2 { font-size: 13px; margin: 10px 0 4px; color: var(--dim); font-weight: 600; }
#hgPanel .hgrow { display: grid; grid-template-columns: 96px 1fr 40px; align-items: center; gap: 6px; margin: 3px 0; font-size: 12px; }
#hgPanel .hgrow label { color: var(--dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#hgPanel .hgrow output { text-align: right; color: var(--dim); font-variant-numeric: tabular-nums; }
#hgPanel .hgslot { border: 1px solid var(--line); border-radius: 8px; padding: 6px 8px; margin: 6px 0; background: var(--panel2); }
#hgPanel .hgslot.locked { border-color: #7a6a2a; }
#hgPanel .hghead { display: flex; align-items: center; gap: 6px; }
#hgPanel .hghead b { flex: 1; font-size: 12px; font-weight: 600; }
#hgPanel .hghead select { width: 150px; }
#hgPanel .hghead button { padding: 2px 7px; font-size: 12px; }
#hgPanel .hghead label { font-size: 11px; color: var(--dim); display: flex; align-items: center; gap: 2px; white-space: nowrap; }
#hgPanel .hgparams { margin-top: 4px; }
#hgPanel .hgparams[hidden] { display: none; }
#hgPanel .hgfoot { display: flex; flex-wrap: wrap; gap: 4px; padding-top: 6px; border-top: 1px solid var(--line); }
#hgPanel .hgfoot button { flex: 1; white-space: nowrap; }
#hgPanel .hgtop { display: flex; gap: 4px; align-items: center; flex-wrap: wrap; }
#hgPanel .hgtop input[type=text] { width: 90px; }
#hgPanel textarea { width: 100%; height: 70px; background: var(--panel2); color: var(--text); border: 1px solid var(--line); border-radius: 5px; font: 11px/1.3 monospace; }
#hgPanel .hgnote { font-size: 11px; color: var(--dim); margin: 2px 0 6px; }
`;

let panel = null, api = null, st = null;

export function openHeadGen(editorApi) {
  api = editorApi;
  if (!panel) { panel = build(); document.body.appendChild(panel); }
  if (st) return;   // already open
  const seed = (Math.random() * 0xffffffff) >>> 0;
  st = { spec: randomSpec(seed), locks: new Set(), previewIds: [], hidden: [], replace: true, base: findPlacement(), nudge: { scale: 1, dy: 0, dz: 0 }, timer: 0 };
  hideExistingHead();
  panel.hidden = false;
  renderAll();
  preview();
  const c = st.base.pos;
  api.look([c[0], c[1], c[2]], 1.2 * st.base.scale);
}

function closeHeadGen(keep) {
  if (!st) return;
  clearTimeout(st.timer);
  if (keep) {
    st.hidden = [];   // the old head stays removed (this is the swap)
    api.commit();
  } else {
    api.removeIds(st.previewIds);
    restoreHidden();
    api.refresh();
  }
  st = null;
  panel.hidden = true;
}

// ---- where the head goes: the parts already on the head bone, or the rough head block, or the standard body ----
function findPlacement() {
  const list = api.parts().filter(p => !p.blockout && p.op === 'add' && api.bone(p) === 'head' && !/^首/.test(p.name));
  const box = unionBounds(list);
  if (box) {
    const w = box.max[0] - box.min[0], h = box.max[1] - box.min[1];
    const scale = Math.max(0.5, Math.min(2, ((w / 0.26) + (h / 0.3)) / 2));
    return { pos: [ (box.min[0] + box.max[0]) / 2, (box.min[1] + box.max[1]) / 2, (box.min[2] + box.max[2]) / 2 ], scale, from: 'head' };
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
function placement() {
  const b = st.base, n = st.nudge;
  return { pos: [b.pos[0], b.pos[1] + n.dy, b.pos[2] + n.dz], scale: b.scale * n.scale };
}

// ---- the old head: hidden while the new one is shown (put back on close, dropped on commit) ----
function hideExistingHead() {
  if (!st.replace || st.hidden.length) return;
  const all = api.parts();
  const targets = all.map((p, i) => [p, i]).filter(([p]) => !p.blockout && api.bone(p) === 'head');
  st.hidden = targets.map(([p, i]) => ({ index: i, data: api.serialize(p) }));
  api.removeIds(targets.map(([p]) => p.id));
}
function restoreHidden() {
  for (const h of st.hidden.sort((a, b) => a.index - b.index)) api.insertAt(h.index, h.data);
  st.hidden = [];
}

// ---- preview: build the parts and put them in the scene ----
function preview() {
  if (!st) return;
  clearTimeout(st.timer);
  st.timer = setTimeout(() => {
    if (!st) return;
    const { parts } = buildHead(st.spec, placement());
    api.removeIds(st.previewIds);
    st.previewIds = api.add(parts);
    api.refresh();
    const n = panel.querySelector('#hgCount');
    if (n) n.textContent = `${parts.length} 部品（種 ${st.spec.seed}）`;
  }, 60);
}

// ---- the panel ----
function build() {
  const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
  const el = document.createElement('div');
  el.id = 'hgPanel'; el.className = 'pop'; el.hidden = true;
  el.innerHTML = `
    <div class="pophead"><h2 style="margin:0;font-size:14px">頭ジェネレーター</h2><span id="hgCount" class="hgnote" style="margin:0 auto 0 8px"></span><button id="hgClose" title="仮に置いた頭を消して、元の頭に戻す">閉じる</button></div>
    <div class="hgbody">
      <div class="hgtop">
        <label class="hgnote" style="margin:0">種</label><input type="text" id="hgSeed" title="同じ種からは同じ頭ができる。文字でもよい">
        <button id="hgRoll" class="on" title="固定していないスロットをまとめて引き直す">🎲 全部ランダム</button>
        <button id="hgRollStyle" title="雰囲気（鋭さなど）と配色も引き直す">雰囲気も</button>
        <button id="hgRef" title="描き方の参考図に寄せた決まった頭から始める">参考例</button>
      </div>
      <div class="hgnote">スロットごとに「固定」を入れると、全部ランダムでもそのスロットは変わりません。</div>
      <h2>雰囲気</h2>
      <div id="hgStyle"></div>
      <div class="hgrow"><label>配色</label><select id="hgPalette"></select><span></span></div>
      <div class="hgrow"><label>陣営色にする所</label><select id="hgTeam"><option value="accent">差し色の部品</option><option value="main">主装甲</option><option value="none">なし</option></select><span></span></div>
      <h2>置き場所</h2>
      <div id="hgPlace"></div>
      <label class="check" style="font-size:12px"><input type="checkbox" id="hgReplace" checked> 今の頭の部品（頭の骨に付くもの）を隠して入れ替える</label>
      <h2>部位</h2>
      <div id="hgSlots"></div>
      <h2>仕様（JSON）</h2>
      <div class="hgnote">この文字列を保存しておくと、同じ頭をまた作れます。</div>
      <textarea id="hgSpec" spellcheck="false"></textarea>
      <div class="seg"><button id="hgSpecCopy">コピー</button><button id="hgSpecApply">貼った仕様を使う</button></div>
    </div>
    <div class="hgfoot">
      <button id="hgCommit" class="on" title="仮に置いた部品をそのまま機体の部品にする（元に戻すで戻せる）">この頭を機体に付ける</button>
      <button id="hgCopy" title="部品の一覧を「AIで作る」の JSON としてコピー">部品 JSON をコピー</button>
    </div>`;
  el.querySelector('#hgClose').onclick = () => closeHeadGen(false);
  el.querySelector('#hgCommit').onclick = () => closeHeadGen(true);
  el.querySelector('#hgCopy').onclick = async () => {
    const { parts } = buildHead(st.spec, placement());
    try { await navigator.clipboard.writeText(JSON.stringify(toModelJson(parts, `生成した頭 ${st.spec.seed}`), null, 1)); api.ask('部品の JSON をコピーしました。', { cancel: null }); } catch { api.ask('コピーできませんでした（ブラウザの許可）。', { cancel: null }); }
  };
  el.querySelector('#hgRoll').onclick = () => reroll(false);
  el.querySelector('#hgRollStyle').onclick = () => reroll(true);
  el.querySelector('#hgRef').onclick = () => { st.spec = normalizeSpec(PRESETS.ref); renderAll(); preview(); };
  el.querySelector('#hgSeed').onchange = e => { const v = e.target.value.trim(); const seed = /^\d+$/.test(v) ? (Number(v) >>> 0) : seedFromText(v); applySeed(seed, false); };
  el.querySelector('#hgPalette').onchange = e => { st.spec.palette = e.target.value; syncSpecText(); preview(); };
  el.querySelector('#hgTeam').onchange = e => { st.spec.team = e.target.value; syncSpecText(); preview(); };
  el.querySelector('#hgReplace').onchange = e => { st.replace = e.target.checked; if (st.replace) hideExistingHead(); else restoreHidden(); preview(); };
  el.querySelector('#hgSpecCopy').onclick = async () => { try { await navigator.clipboard.writeText(JSON.stringify(st.spec)); } catch { /* blocked */ } };
  el.querySelector('#hgSpecApply').onclick = () => {
    try { st.spec = normalizeSpec(JSON.parse(el.querySelector('#hgSpec').value)); renderAll(); preview(); } catch { api.ask('仕様の JSON が読めませんでした。', { cancel: null }); }
  };
  const pal = el.querySelector('#hgPalette');
  for (const p of PALETTES) { const o = document.createElement('option'); o.value = p.key; o.textContent = p.label; pal.appendChild(o); }
  return el;
}

function reroll(styleToo) {
  const seed = (Math.random() * 0xffffffff) >>> 0;
  applySeed(seed, styleToo);
}
function applySeed(seed, styleToo) {
  const keep = {};
  for (const k of st.locks) keep[k] = st.spec.slots[k];
  const opts = { keep };
  if (!styleToo) { opts.style = { ...st.spec.style }; opts.palette = st.spec.palette; opts.team = st.spec.team; opts.glow = st.spec.slots.camera.p.glow; }
  st.spec = randomSpec(seed, opts);
  renderAll(); preview();
}

function renderAll() {
  panel.querySelector('#hgSeed').value = String(st.spec.seed);
  panel.querySelector('#hgPalette').value = st.spec.palette;
  panel.querySelector('#hgTeam').value = st.spec.team;
  panel.querySelector('#hgReplace').checked = st.replace;
  // style axes
  const sd = panel.querySelector('#hgStyle'); sd.innerHTML = '';
  for (const ax of STYLE_AXES) sd.appendChild(row(ax.label, st.spec.style[ax.key], v => { st.spec.style[ax.key] = v; syncSpecText(); preview(); }, ax.hint));
  // placement
  const pd = panel.querySelector('#hgPlace'); pd.innerHTML = '';
  pd.appendChild(row('大きさ', (st.nudge.scale - 0.6) / 0.9, v => { st.nudge.scale = 0.6 + v * 0.9; preview(); }, '', v => (0.6 + v * 0.9).toFixed(2) + '×'));
  pd.appendChild(row('高さ', (st.nudge.dy + 0.15) / 0.3, v => { st.nudge.dy = v * 0.3 - 0.15; preview(); }, '', v => (v * 0.3 - 0.15).toFixed(2)));
  pd.appendChild(row('前後', (st.nudge.dz + 0.1) / 0.2, v => { st.nudge.dz = v * 0.2 - 0.1; preview(); }, '', v => (v * 0.2 - 0.1).toFixed(2)));
  const note = document.createElement('div'); note.className = 'hgnote';
  note.textContent = st.base.from === 'head' ? '今の頭の部品の位置と大きさに合わせています。' : st.base.from === 'rough' ? '「あたり・頭」の位置と大きさに合わせています。' : '標準の体型の頭の位置（高さ 2.87）に置いています。';
  pd.appendChild(note);
  // slots
  const sl = panel.querySelector('#hgSlots'); sl.innerHTML = '';
  for (const slot of SLOTS) sl.appendChild(slotBox(slot));
  syncSpecText();
}
function syncSpecText() { panel.querySelector('#hgSpec').value = JSON.stringify(st.spec); }

function row(label, value01, onChange, hint = '', fmt = v => Math.round(v * 100)) {
  const d = document.createElement('div'); d.className = 'hgrow';
  const l = document.createElement('label'); l.textContent = label; if (hint) l.title = hint;
  const i = document.createElement('input'); i.type = 'range'; i.min = 0; i.max = 1000; i.value = Math.round(value01 * 1000);
  const o = document.createElement('output'); o.textContent = fmt(value01);
  i.oninput = () => { const v = Number(i.value) / 1000; o.textContent = fmt(v); onChange(v); };
  d.append(l, i, o);
  return d;
}
function choiceRow(label, def, value, onChange) {
  const d = document.createElement('div'); d.className = 'hgrow';
  const l = document.createElement('label'); l.textContent = label;
  const s = document.createElement('select');
  if (def.key === 'glow') { s.remove(); const c = document.createElement('input'); c.type = 'color'; c.value = value; c.oninput = () => onChange(c.value); d.append(l, c, document.createElement('span')); return d; }
  for (const [k, t] of def.choices) { const o = document.createElement('option'); o.value = k; o.textContent = t; s.appendChild(o); }
  s.value = value; s.onchange = () => onChange(s.value);
  d.append(l, s, document.createElement('span'));
  return d;
}
function slotBox(slot) {
  const box = document.createElement('div'); box.className = 'hgslot' + (st.locks.has(slot.key) ? ' locked' : '');
  const head = document.createElement('div'); head.className = 'hghead';
  const b = document.createElement('b'); b.textContent = slot.label;
  const sel = document.createElement('select');
  for (const t of slot.types) { const o = document.createElement('option'); o.value = t.key; o.textContent = t.label; sel.appendChild(o); }
  sel.value = st.spec.slots[slot.key].type;
  sel.onchange = () => { st.spec.slots[slot.key].type = sel.value; syncSpecText(); preview(); };
  const dice = document.createElement('button'); dice.textContent = '🎲'; dice.title = 'この部位だけ引き直す';
  dice.onclick = () => { const rng = makeRng((Math.random() * 0xffffffff) >>> 0); const s = randomSlot(slot, rng, st.spec.style, st.spec.slots.camera.p.glow); if (slot.key === 'camera') s.p.glow = st.spec.slots.camera.p.glow; st.spec.slots[slot.key] = s; refreshSlot(slot, box); preview(); };
  const lock = document.createElement('label'); const lc = document.createElement('input'); lc.type = 'checkbox'; lc.checked = st.locks.has(slot.key);
  lc.onchange = () => { if (lc.checked) st.locks.add(slot.key); else st.locks.delete(slot.key); box.classList.toggle('locked', lc.checked); };
  lock.append(lc, '固定');
  const more = document.createElement('button'); more.textContent = '…'; more.title = '数値を見せる／隠す';
  head.append(b, sel, dice, lock, more);
  const params = document.createElement('div'); params.className = 'hgparams'; params.hidden = true;
  more.onclick = () => { params.hidden = !params.hidden; more.classList.toggle('on', !params.hidden); };
  box.append(head, params);
  fillParams(slot, params);
  return box;
}
function fillParams(slot, params) {
  params.innerHTML = '';
  const sp = st.spec.slots[slot.key];
  for (const def of slot.params) {
    if (def.choices) params.appendChild(choiceRow(def.label, def, sp.p[def.key], v => { sp.p[def.key] = v; syncSpecText(); preview(); }));
    else params.appendChild(row(def.label, sp.p[def.key], v => { sp.p[def.key] = Math.round(v * 1e4) / 1e4; syncSpecText(); preview(); }));
  }
}
function refreshSlot(slot, box) {
  box.querySelector('select').value = st.spec.slots[slot.key].type;
  fillParams(slot, box.querySelector('.hgparams'));
  syncSpecText();
}
