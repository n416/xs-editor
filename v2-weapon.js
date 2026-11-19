// 機体エディタ Ver2 の「武器を作る」（依頼主 2026-11-19「はい」、テスター ポッチャさんの #画像アップロードの要望。案：武器づくりの案）。
// 左の「武器」のタブのいちばん上の欄。持っている武器（def.tab = 'weapon'）について：
//   ・武器だけを見る：体と頭を隠し、武器を真ん中に寄せて見る（見た目だけ。保存・書き出しは変わらない）
//   ・元の武器：どのゲームの武器の見た目か（def.wbase。samples/weapon-shapes.json の形の名前）。今のゲームの形を点線の箱で重ねる（長さの目安）
//   ・点：握り・銃口・刃の根元・刃の先を、印で見せ、つまみで動かす。形態ごとに持つ（形態 2 は変形する武器：スピアのロッド ⇔ サイズ）
//       def.hand：形態 1 の握り（前から：その武器を作ったときの右手の中心。動かすと武器が手の中で動く）
//       def.wpts = { 1: { muzzle?, tip?, base? }, 2: { hand?, muzzle?, tip?, base? } }（パーツの座標＝def.hand と同じ座標）
//     置いていない点は、今までどおり部品の名前で決まる（「マズル」「銃口」の部品の真ん中・「柄」「刃先」「先端」の端）
//   書き出し（v2.js exportWeaponGlb → xsengine.js buildWeapon の opt.points・opt.form2）が点と形態 2 を武器の模型に入れる
// 座標：パーツの座標は機体の座標（全高 3。1 は 6 m）。武器の模型は m で握る所が原点、長さは −Z（xsengine.js buildWeapon の at）
import * as THREE from 'three';

const U = 6;   // 1 の長さ（m）：xsengine.js UNIT_M
const KEYS = [['hand', '握り', 0xe0412f], ['muzzle', '銃口', 0xe8b400], ['base', '刃の根元', 0x2fa8e0], ['tip', '刃の先', 0x7a5cff]];
const LEN_WARN = 0.15;   // [独自] 今のゲームの形の長さと、これより違えば知らせる（格闘の当たりの届きは変わらないため）
let SHAPES = null;
const shapesP = fetch('./samples/weapon-shapes.json').then(r => r.json()).then(j => (SHAPES = j.shapes)).catch(() => (SHAPES = []));

/**
 * ctx：{ gizmo, orbit, camera, items(), groups(), byId, form()（今の形態）, own(i)（i 番目の置いたパーツの武器を自分のパーツにして def を返す）,
 *        persist()（自分のパーツを残す）, save(), rebuild(), note(text), side()（'a' / 'b'：書き出す陣営） }
 */
export function makeWeaponBench(ctx) {
  let only = false, show = true, markers = null, dragKey = null, dragForm = 1;
  const wIndex = () => ctx.items().findIndex(it => ctx.byId[it.part]?.tab === 'weapon');
  const formN = () => Math.min(2, Math.max(1, ctx.form()));
  const defNow = () => { const i = wIndex(); return i >= 0 ? ctx.byId[ctx.items()[i].part] : null; };
  /** 形態 n の点 k（置いていなければ null）。形態 2 の握りは、置いていなければ形態 1 の握り */
  const pointOf = (def, n, k) => (k === 'hand' ? (n === 2 ? def.wpts?.[2]?.hand ?? def.hand : def.hand) : def.wpts?.[n]?.[k]) ?? null;
  /** 部品の名前で決まる銃口（「マズル」「銃口」の足すブロックの描いた形の真ん中。書き出し xsengine.js weaponPoints と同じ決め方）。点を置いていない時の印 */
  const autoMuzzle = () => {
    const g = ctx.groups()[wIndex()];
    if (!g) return null;
    const h = holderOf(g), bb = new THREE.Box3(), inv = new THREE.Matrix4();
    h.updateWorldMatrix(true, true); inv.copy(h.matrixWorld).invert();
    for (const t of holders(g)) t.traverse(o => {
      const pc = o.userData.pc;
      if (!o.isMesh || !pc || pc.op === 'sub' || pc.blockout || !/マズル|銃口/.test(pc.name ?? '')) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      bb.union(o.geometry.boundingBox.clone().applyMatrix4(inv.clone().multiply(o.matrixWorld)));
    });
    return bb.isEmpty() ? null : bb.getCenter(new THREE.Vector3()).toArray();
  };
  const shapeOf = def => SHAPES?.find(s => s.shape === (def.wbase ?? def.shape)) ?? null;
  const sideOf = def => (def.faction === 'b' || def.faction === 'a' ? def.faction : ctx.side());
  /** 置いた武器の組と、骨ごとの入れ物（部品に付ける骨のある武器は、ブロックが前腕などの入れ物に入る：v2.js groupOf の extra） */
  const holders = g => [g, ...(g.userData.extra?.values() ?? [])];
  /** 印を付ける入れ物：武器のブロックがいちばん多く入っている物（腕を動かしても武器と一緒に動く） */
  const holderOf = g => { let best = g, most = -1; for (const t of holders(g)) { let n = 0; t.traverse(o => { if (o.isMesh && o.userData.pc) n++; }); if (n > most) { most = n; best = t; } } return best; };

  // ---- 印と点線の箱（置いた武器の組の子：武器と一緒に動く） ----
  function clear() {
    if (markers) { if (ctx.gizmo.object?.userData.wpt) ctx.gizmo.detach(); markers.parent?.remove(markers); markers.traverse(o => { o.geometry?.dispose(); o.material?.dispose?.(); }); markers = null; }
  }
  function draw() {
    clear();
    const i = wIndex(), g = ctx.groups()[i];
    if (i < 0 || !g || !show) return;
    const def = ctx.byId[ctx.items()[i].part], n = formN();
    if (dragKey && dragForm !== n) dragKey = null;   // （別の形態へ移った：その形態の点はつままない）
    markers = new THREE.Group(); markers.name = 'weapon-bench'; markers.renderOrder = 999;
    for (const [k, , col] of KEYS) {
      const p = pointOf(def, n, k) ?? (k === 'muzzle' ? autoMuzzle() : null);
      if (!p) continue;
      const placed = k === 'hand' || !!def.wpts?.[n]?.[k];
      const m = new THREE.Mesh(new THREE.SphereGeometry(k === 'hand' ? 0.03 : 0.022, 16, 12), new THREE.MeshBasicMaterial({ color: col, depthTest: false, transparent: true, opacity: placed ? 0.95 : 0.45, wireframe: !placed }));
      m.position.set(...p); m.renderOrder = 999; m.userData.wpt = k; m.raycast = () => {};
      markers.add(m);
      if (k === 'hand') {   // 握り：手の大きさの目安の輪（手の甲の向きは機体の外 −x）
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.006, 8, 24), new THREE.MeshBasicMaterial({ color: col, depthTest: false, transparent: true, opacity: 0.7 }));
        ring.rotation.x = Math.PI / 2; ring.renderOrder = 999; ring.raycast = () => {}; m.add(ring);
      }
    }
    // 今のゲームの形の点線の箱（形態 1 の握りに合わせて）と、その銃口
    const sh = shapeOf(def), sd = sh && (sh[sideOf(def)] ?? sh.a ?? sh.b), h = def.hand;
    if (sd && h) {
      const toPart = ([mx, my, mz]) => [h[0] - mx / U, h[1] + mz / U, h[2] + my / U];
      const a = toPart(sd.min), b = toPart(sd.max), bb = new THREE.Box3(new THREE.Vector3(...a.map((v, k) => Math.min(v, b[k]))), new THREE.Vector3(...a.map((v, k) => Math.max(v, b[k]))));
      const geo = new THREE.EdgesGeometry(new THREE.BoxGeometry(...bb.getSize(new THREE.Vector3()).toArray()));
      const line = new THREE.LineSegments(geo, new THREE.LineDashedMaterial({ color: 0x2f5fd0, dashSize: 0.02, gapSize: 0.014, depthTest: false, transparent: true, opacity: 0.8 }));
      line.computeLineDistances(); line.position.copy(bb.getCenter(new THREE.Vector3())); line.renderOrder = 998; line.raycast = () => {};
      markers.add(line);
      if (sd.muzzle) { const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.014), new THREE.MeshBasicMaterial({ color: 0x2f5fd0, depthTest: false, transparent: true, opacity: 0.8, wireframe: true })); c.position.set(...toPart(sd.muzzle)); c.renderOrder = 998; c.raycast = () => {}; markers.add(c); }
    }
    holderOf(g).add(markers);
    if (dragKey) { const m = markers.children.find(o => o.userData.wpt === dragKey); if (m) ctx.gizmo.attach(m); }
  }
  /** 武器だけを見る：ほかの置いたパーツの組を隠し、武器を真ん中に */
  function hideOthers() {
    if (!only) return;
    const wi = wIndex();
    ctx.groups().forEach((g, i) => { if (i === wi) return; g.visible = false; for (const e of g.userData.extra?.values() ?? []) e.visible = false; });
  }
  function frame() {
    const g = ctx.groups()[wIndex()];
    if (!g) return;
    const bb = new THREE.Box3();
    for (const t of holders(g)) { t.updateWorldMatrix(true, true); t.traverse(o => { if (o.isMesh && o.userData.pc) bb.expandByObject(o); }); }
    if (bb.isEmpty()) return;
    // 横から（武器の長さが見える向き）、武器の外接球が画面に入る距離へ
    const c = bb.getCenter(new THREE.Vector3()), r = Math.max(0.1, bb.getSize(new THREE.Vector3()).length() / 2);
    const dist = r / Math.sin(ctx.camera.fov * Math.PI / 360) * 1.4;
    ctx.orbit.target.copy(c); ctx.camera.position.copy(c).add(new THREE.Vector3(-0.85, 0.25, 0.45).normalize().multiplyScalar(dist));
    ctx.camera.updateMatrixWorld(); ctx.orbit.update();
  }

  // ---- 欄 ----
  let el = null;
  /** 握りから先まで（m）：刃の先を置いていれば握りから刃の先まで、無ければ握りから下（武器の長さの向き −y）の端まで */
  function lengthOf(def) {
    const g0 = ctx.groups()[wIndex()];
    if (!g0 || !def.hand) return null;
    const g = holderOf(g0);
    const tip = pointOf(def, 1, 'tip');
    if (tip) return Math.hypot(...tip.map((v, k) => v - def.hand[k])) * U;
    let minY = Infinity;
    g.updateWorldMatrix(true, true);
    const inv = g.matrixWorld.clone().invert(), v = new THREE.Vector3();
    g.traverse(o => { if (!o.isMesh || !o.userData.pc) return; const pos = o.geometry.attributes.position; if (!pos) return; const M = inv.clone().multiply(o.matrixWorld); for (let i = 0; i < pos.count; i += 3) { v.fromBufferAttribute(pos, i).applyMatrix4(M); if (v.y < minY) minY = v.y; } });
    return Number.isFinite(minY) ? (def.hand[1] - minY) * U : null;
  }
  function render() {
    if (!el) return;
    const def = defNow(), n = formN();
    if (!def) { el.innerHTML = '<b>武器を作る</b><div class="hint">下の一覧から武器を押して持たせるか、「新しい武器を作る」で作ると、ここで点を置ける</div>'; return; }
    const sh = shapeOf(def), sd = sh && (sh[sideOf(def)] ?? sh.a ?? sh.b), len = lengthOf(def), want = sd ? -sd.min[2] : null;
    const opts = (SHAPES ?? []).map(s => `<option value="${s.shape}" ${s.shape === (def.wbase ?? def.shape) ? 'selected' : ''}>${s.name}（${s.count}）</option>`).join('');
    const warn = len && want && Math.abs(len - want) > want * LEN_WARN;
    // 向き：腕を下ろした姿勢で、銃口（無ければ刃の先）は握りより下（−y）。上にあると、ゲームでは後ろ向きに構える
    const mz = pointOf(def, 1, 'muzzle') ?? autoMuzzle() ?? pointOf(def, 1, 'tip'), upside = mz && def.hand && mz[1] > def.hand[1];
    const row = ([k, label, col]) => {
      const p = pointOf(def, n, k), placed = k === 'hand' ? true : !!def.wpts?.[n]?.[k];
      const auto = !placed && k === 'muzzle' && autoMuzzle() ? '部品の名前で' : !placed && k === 'tip' ? '形の端' : !placed && k === 'base' ? '握り' : '';
      return `<div class="row" style="align-items:center;gap:4px"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#${col.toString(16).padStart(6, '0')}"></span>`
        + `<span style="flex:1">${label}${placed && p ? '' : `<span class="hint">（${auto || 'なし'}）</span>`}</span>`
        + `<button class="small ${dragKey === k && dragForm === n ? 'acc' : ''}" data-wgrab="${k}" title="つまみで動かす（もう一度押すとやめる）">${placed ? 'つまむ' : '置く'}</button>`
        + (k !== 'hand' && placed ? `<button class="small" data-wdrop="${k}" title="この点を外す（部品の名前・形の端に戻る）">外す</button>` : '') + '</div>';
    };
    el.innerHTML = `<b>武器を作る</b>`
      + `<label class="chk" style="display:flex;gap:6px;align-items:center;white-space:nowrap"><input type="checkbox" id="wOnly" ${only ? 'checked' : ''}>武器だけを見る</label><label class="chk" style="display:flex;gap:6px;align-items:center;white-space:nowrap"><input type="checkbox" id="wShow" ${show ? 'checked' : ''}>点と目安を出す</label>`
      + `<div class="row" style="gap:4px"><label style="flex:none">元の武器</label><select id="wBase" style="flex:1;min-width:0" title="どのゲームの武器の見た目にするか。今のゲームの形を点線の箱で重ねる"><option value="">（選ぶ）</option>${opts}</select></div>`
      + `<div class="row" style="gap:4px"><label style="flex:none">陣営</label><select id="wSide"><option value="a" ${sideOf(def) === 'a' ? 'selected' : ''}>連合</option><option value="b" ${sideOf(def) === 'b' ? 'selected' : ''}>GIO</option></select></div>`
      + `<div class="hint">点（形態 ${n}${ctx.form() > 2 ? '。形態 3 からは形態 2 の点' : ''}）：</div>` + KEYS.map(row).join('')
      + `<div class="hint">長さ：握りから先まで ${len ? len.toFixed(2) + ' m' : '—'}${want ? `（今のゲームの形 ${want.toFixed(2)} m）` : ''}${warn ? ` <b style="color:var(--warn)">長さが今の形と大きく違います。${sh.kind === 'melee' ? '格闘の当たりの届きは今のままです' : '射程・当たりは今のままです'}</b>` : ''}</div>`
      + (upside ? '<div class="hint"><b style="color:var(--warn)">銃口が握りより上にあります。腕を下ろした姿勢では、銃口を下へ向けて作ります（このままでは、ゲームで後ろ向きに構えます）</b></div>' : '')
      + `<div class="hint">形態 2 は変形する武器（モードで形が変わる武器）：右の「形態」で形態を足し、パーツエディタでブロックの形態 2 の位置・向き・出す／出さないを決める。形態 2 を見ている間に置いた点は形態 2 の点。書き出しは右の「持っている武器だけを書き出す」</div>`;
    el.querySelector('#wOnly').onchange = e => { only = e.target.checked; ctx.rebuild(); if (only) frame(); };
    el.querySelector('#wShow').onchange = e => { show = e.target.checked; if (!show) dragKey = null; draw(); };
    el.querySelector('#wBase').onchange = e => { const d = ctx.own(wIndex()); if (!d) return; d.wbase = e.target.value || undefined; ctx.persist(); ctx.save(); draw(); render(); };
    el.querySelector('#wSide').onchange = e => { const d = ctx.own(wIndex()); if (!d) return; d.faction = e.target.value; ctx.persist(); ctx.save(); draw(); render(); };
    for (const b of el.querySelectorAll('[data-wgrab]')) b.onclick = () => grab(b.dataset.wgrab);
    for (const b of el.querySelectorAll('[data-wdrop]')) b.onclick = () => { const d = ctx.own(wIndex()); if (!d) return; delete d.wpts?.[formN()]?.[b.dataset.wdrop]; tidy(d); dragKey = null; ctx.persist(); ctx.save(); ctx.rebuild(); };
  }
  const tidy = d => { for (const n of [1, 2]) if (d.wpts?.[n] && !Object.keys(d.wpts[n]).length) delete d.wpts[n]; if (d.wpts && !Object.keys(d.wpts).length) delete d.wpts; };
  /** 点 k をつまみに付ける（無ければ、今の形の真ん中あたりに置いてから） */
  function grab(k) {
    if (dragKey === k && dragForm === formN()) { dragKey = null; ctx.gizmo.detach(); render(); return; }
    const d = ctx.own(wIndex()); if (!d) return;
    const n = formN();
    if (k !== 'hand' && !d.wpts?.[n]?.[k]) {
      const start = (k === 'muzzle' ? autoMuzzle() : null) ?? pointOf(d, n, k) ?? (k === 'base' ? d.hand : null) ?? [d.hand[0], d.hand[1] - (k === 'tip' ? 0.5 : 0.25), d.hand[2]];
      d.wpts = { ...(d.wpts ?? {}), [n]: { ...(d.wpts?.[n] ?? {}), [k]: start.map(v => +v.toFixed(4)) } };
      ctx.persist();
    }
    if (k === 'hand' && n === 2 && !d.wpts?.[2]?.hand) d.wpts = { ...(d.wpts ?? {}), 2: { ...(d.wpts?.[2] ?? {}), hand: d.hand.slice() } };
    dragKey = k; dragForm = n; show = true;
    ctx.rebuild();
  }

  return {
    /** 武器のタブのいちばん上に入れる欄の器 */
    mount(container) { el = container; shapesP.then(render); render(); },
    /** v2.js の rebuild の後：印を描き直し、武器だけを見るなら他を隠す */
    afterRebuild() { hideOthers(); draw(); render(); },
    /** つまみが動いた（印を動かしている時は true を返す：v2.js の置いたパーツの処理をしない） */
    onGizmo() {
      const o = ctx.gizmo.object;
      if (!o?.userData.wpt) return false;
      const d = defNow(), n = formN(), k = o.userData.wpt, p = o.position.toArray().map(v => +v.toFixed(4));
      if (k === 'hand' && n === 1) return true;   // （形態 1 の握りは、離した時に武器ごと動かす：onDragEnd）
      if (k === 'hand') d.wpts[2].hand = p; else d.wpts[n][k] = p;
      render();
      return true;
    },
    /** つまみを離した。印を動かしていたら true */
    onDragEnd() {
      const o = ctx.gizmo.object;
      if (!o?.userData.wpt) return false;
      const i = wIndex(), it = ctx.items()[i], d = defNow(), k = o.userData.wpt;
      if (k === 'hand' && formN() === 1) {
        // 形態 1 の握りを動かした：武器の握る所が変わる。手の位置は同じなので、武器をその分だけ逆へ動かす（置いたパーツの mov、回していない武器として）
        const p = o.position.toArray().map(v => +v.toFixed(4)), dl = p.map((v, j) => v - d.hand[j]);
        d.hand = p; it.mov = it.mov.map((v, j) => v - dl[j]);
      }
      ctx.persist(); ctx.save(); ctx.rebuild();
      return true;
    },
    isDragging: () => !!dragKey,
    /** 書き出しの点（形態 1）と形態 2 の点・握り */
    pointsOf: def => ({ points: def.wpts?.[1] ?? null, points2: def.wpts?.[2] ?? null, hand2: def.wpts?.[2]?.hand ?? null }),
  };
}
