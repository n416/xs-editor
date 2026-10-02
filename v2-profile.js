// 断面を描く画面（パーツエディタの押し出し・回転体）。機体エディタ（index.html）の断面の画面と同じ操作：
//   点をドラッグ ・ 辺を押して点を足す ・ 点をダブルクリックで消す ・ 何もない所をドラッグで動かす ・ ホイールで拡大縮小
// o = {
//   pts()            いまの点の並び [[x, y], ...]（この並びをそのまま書き換える）
//   closed           閉じた形（押し出し）。false は回転体の右半分（両端は軸へつながる）
//   outline()        塗って見せる輪郭（角の面取りを掛けた後）。回転体は右半分の閉じた輪郭
//   box()            点線で見せる範囲 [x0, x1, y0, y1]（横・上の断面で、パーツの範囲）。無ければ null
//   flipY            上から見た図（下が前）
//   sub              引くブロック（赤で塗る）
//   snap()           グリッドに合わせるか
//   marks            図に書く言葉 [[text, 'tl' | 'tr' | 'bl' | 'br'], ...]
//   onChange()       点が変わった（ドラッグ中も）
//   onCommit()       操作が終わった（元に戻すの 1 区切り）
//   onGrid(snap, major)  グリッドの刻みが変わった（表示用）
// }
export function profileEditor(canvas, o) {
  const ctx = canvas.getContext('2d');
  let size = 0, drag = -1, hover = -1, pan = null, view = { cx: 0, cy: 0, span: 1 }, moved = false;
  const up = o.flipY ? -1 : 1;
  const niceStep = x => { const k = Math.pow(10, Math.floor(Math.log10(x))); return [1, 2, 5, 10].map(m => m * k).find(v => v >= x * 0.999); };
  const grid = () => { const major = niceStep(view.span / 5); return { major, minor: major / 5, snap: major / 10 }; };
  const toCanvas = ([x, y]) => { const s = size / view.span; return [size / 2 + (x - view.cx) * s, size / 2 - (y - view.cy) * s * up]; };
  const toWorld = ([px, py]) => { const s = size / view.span; return [view.cx + (px - size / 2) / s, view.cy - (py - size / 2) / s * up]; };
  function fit() {
    const pts = o.pts(), b = o.box?.();
    const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]);
    if (b) { xs.push(b[0], b[1]); ys.push(b[2], b[3]); }
    if (!o.closed) { const r = Math.max(...xs); xs.push(0, -0.25 * r); }
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    view = { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, span: Math.max(x1 - x0, y1 - y0, 0.002) * 1.4 };
  }
  const outOfView = () => { const m = view.span * 0.47; return o.pts().some(([x, y]) => Math.abs(x - view.cx) > m || Math.abs(y - view.cy) > m); };
  function snapPt([x, y]) {
    if (o.snap?.()) { const g = grid().snap; x = Math.round(x / g) * g; y = Math.round(y / g) * g; }
    if (!o.closed) x = Math.max(0, x);
    return [+x.toFixed(5), +y.toFixed(5)];
  }
  function hitPoint(m) { let best = -1, bd = 9; o.pts().forEach((q, i) => { const c = toCanvas(q), d = Math.hypot(c[0] - m[0], c[1] - m[1]); if (d < bd) { bd = d; best = i; } }); return best; }
  function edges() {
    const pts = o.pts(), e = [];
    if (o.closed) for (let i = 0; i < pts.length; i++) e.push([i, pts[i], pts[(i + 1) % pts.length]]);
    else { e.push([-1, [0, pts[0][1]], pts[0]]); for (let i = 0; i < pts.length - 1; i++) e.push([i, pts[i], pts[i + 1]]); e.push([pts.length - 1, pts[pts.length - 1], [0, pts[pts.length - 1][1]]]); }
    return e;
  }
  function hitEdge(m) {
    for (const [index, a, b] of edges()) {
      const A = toCanvas(a), B = toCanvas(b), dx = B[0] - A[0], dy = B[1] - A[1], L = dx * dx + dy * dy;
      if (L < 1) continue;
      const t = Math.max(0, Math.min(1, ((m[0] - A[0]) * dx + (m[1] - A[1]) * dy) / L));
      if (t < 0.05 || t > 0.95) continue;
      if (Math.hypot(A[0] + dx * t - m[0], A[1] + dy * t - m[1]) < 6) return { index };
    }
    return null;
  }
  function draw() {
    if (!size) return;
    ctx.clearRect(0, 0, size, size);
    const g = grid(), [wx0, wy1] = toWorld([0, 0]), [wx1, wy0] = toWorld([size, size]);
    ctx.lineWidth = 1;
    for (let i = Math.floor(Math.min(wx0, wx1) / g.minor); i <= Math.ceil(Math.max(wx0, wx1) / g.minor); i++) { const [cx] = toCanvas([i * g.minor, 0]); ctx.strokeStyle = i % 5 === 0 ? '#252b34' : '#191d23'; ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, size); ctx.stroke(); }
    for (let i = Math.floor(Math.min(wy0, wy1) / g.minor); i <= Math.ceil(Math.max(wy0, wy1) / g.minor); i++) { const [, cy] = toCanvas([0, i * g.minor]); ctx.strokeStyle = i % 5 === 0 ? '#252b34' : '#191d23'; ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(size, cy); ctx.stroke(); }
    o.onGrid?.(+g.snap.toPrecision(3), +g.major.toPrecision(3));
    const [ox, oy] = toCanvas([0, 0]);
    ctx.strokeStyle = '#3c4552'; ctx.beginPath(); ctx.moveTo(ox, 0); ctx.lineTo(ox, size); ctx.moveTo(0, oy); ctx.lineTo(size, oy); ctx.stroke();
    ctx.fillStyle = '#8b97a8'; ctx.font = '11px system-ui';
    if (!o.closed) ctx.fillText('回転軸', ox + 4, 12);
    for (const [text, where] of o.marks ?? []) { const w = ctx.measureText(text).width; ctx.fillText(text, where[1] === 'r' ? size - w - 6 : 6, where[0] === 't' ? 14 : size - 8); }
    const b = o.box?.();
    if (b) { const a = toCanvas([b[0], b[2]]), c = toCanvas([b[1], b[3]]); ctx.setLineDash([5, 4]); ctx.strokeStyle = '#5d6878'; ctx.strokeRect(Math.min(a[0], c[0]), Math.min(a[1], c[1]), Math.abs(c[0] - a[0]), Math.abs(c[1] - a[1])); ctx.setLineDash([]); }
    const fill = o.sub ? 'rgba(255,107,107,.18)' : 'rgba(240,169,59,.18)', stroke = o.sub ? '#ff8b8b' : '#f0a93b';
    const path = poly => { ctx.beginPath(); poly.forEach((q, i) => { const c = toCanvas(q); i ? ctx.lineTo(...c) : ctx.moveTo(...c); }); ctx.closePath(); };
    const loop = o.outline();
    if (!o.closed) { path(loop.map(([x, y]) => [-x, y])); ctx.fillStyle = 'rgba(255,255,255,.04)'; ctx.fill(); }
    path(loop); ctx.fillStyle = o.dim ? 'rgba(255,255,255,.04)' : fill; ctx.fill(); ctx.strokeStyle = stroke; ctx.lineWidth = 1.5; ctx.stroke();
    const pts = o.pts();
    ctx.setLineDash([3, 3]); ctx.strokeStyle = '#7d8796'; ctx.lineWidth = 1; ctx.beginPath();
    pts.forEach((q, i) => { const c = toCanvas(q); i ? ctx.lineTo(...c) : ctx.moveTo(...c); });
    if (o.closed) ctx.closePath();
    ctx.stroke(); ctx.setLineDash([]);
    pts.forEach((q, i) => {
      const [cx, cy] = toCanvas(q), hot = i === drag || i === hover;
      ctx.beginPath(); ctx.arc(cx, cy, hot ? 6 : 4.5, 0, Math.PI * 2); ctx.fillStyle = hot ? '#ffffff' : '#dfe5ee'; ctx.fill(); ctx.strokeStyle = '#15181d'; ctx.lineWidth = 1.5; ctx.stroke();
    });
  }
  const resize = () => { const s = canvas.clientWidth; if (!s) return; size = s; canvas.width = canvas.height = Math.round(s * devicePixelRatio); ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0); draw(); };
  const ro = new ResizeObserver(resize); ro.observe(canvas);
  const local = e => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  canvas.onpointerdown = e => {
    const m = local(e);
    let i = hitPoint(m);
    if (i < 0) { const ed = hitEdge(m); if (ed) { i = Math.max(0, ed.index + 1); o.pts().splice(i, 0, snapPt(toWorld(m))); moved = true; } }
    if (i >= 0) { drag = i; canvas.setPointerCapture(e.pointerId); o.onChange(); draw(); }
    else { pan = { m, cx: view.cx, cy: view.cy }; canvas.setPointerCapture(e.pointerId); canvas.style.cursor = 'grabbing'; }
  };
  canvas.onpointermove = e => {
    const m = local(e);
    if (drag >= 0) { o.pts()[drag] = snapPt(toWorld(m)); moved = true; o.onChange(); draw(); }
    else if (pan) { const k = view.span / size; view.cx = pan.cx - (m[0] - pan.m[0]) * k; view.cy = pan.cy + (m[1] - pan.m[1]) * k * up; draw(); }
    else { const h = hitPoint(m); canvas.style.cursor = h >= 0 ? 'grab' : hitEdge(m) ? 'copy' : 'default'; if (h !== hover) { hover = h; draw(); } }
  };
  canvas.onpointerup = () => {
    pan = null; canvas.style.cursor = 'default';
    if (drag >= 0) { drag = -1; if (outOfView()) fit(); draw(); if (moved) { moved = false; o.onCommit(); } }
  };
  canvas.onwheel = e => {
    e.preventDefault();
    const m = local(e), before = toWorld(m);
    view.span = Math.min(20, Math.max(0.002, view.span * Math.exp(e.deltaY * 0.0015)));
    const after = toWorld(m);
    view.cx += before[0] - after[0]; view.cy += before[1] - after[1];
    draw();
  };
  canvas.ondblclick = e => {
    const i = hitPoint(local(e)), min = o.closed ? 3 : 1;
    if (i >= 0 && o.pts().length > min) { o.pts().splice(i, 1); hover = -1; o.onChange(); draw(); o.onCommit(); }
  };
  fit(); resize();
  return { draw, fit: () => { fit(); draw(); }, dispose: () => ro.disconnect() };
}
