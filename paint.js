// 機体の塗り（機体エディタ Ver2）。パーツは色ではなく「役」を持ち、色は機体が 1 組だけ持つ。
//   役：main 主装甲・sub 副装甲・frame フレームと関節・accent 差し色・glow 発光
//   塗り paint = { pal: { main, sub, frame, accent, glow }, type, vivid: { colors: [色…], on: { パーツの部位名: 何番目の色 } } }
//   ビビッド：数色の鮮やかな色。on に入っている部位のパーツは主装甲をその色で塗り、差し色のブロックはビビッドの色を使う。
// 役は、いまのカタログのブロックの色から決める（部品を作る道具の 5 色：明るい装甲・暗い装甲・黒・差し色・発光。ほかの色は明るさと鮮やかさで振り分ける）。
// 光（エフェクト：光っていて当たり判定のないブロック）と透けるブロックは、塗りの対象にしない（自分の色のまま）。
// [独自] 型・色の範囲・検査の数字は、ここで決めた値。

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export function hexToHsl(hex) {
  const n = parseInt(hex.slice(1), 16), r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (d < 1e-9) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
export function hslToHex(h, s, l) {
  h = ((h % 360) + 360) % 360; s = clamp(s, 0, 1); l = clamp(l, 0, 1);
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return '#' + [r, g, b].map(v => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('');
}
const hueGap = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

export const ROLE_LABEL = { main: '主装甲', sub: '副装甲', frame: 'フレーム・関節', accent: '差し色', glow: '発光' };
const KNOWN = { '#c3c9d2': 'main', '#6b727d': 'sub', '#23262c': 'frame', '#b8483e': 'accent', '#ffd257': 'glow' };
const roleCache = new Map();
/** ブロックの役。塗らないブロック（光・透けるもの）は null */
export function roleOf(pc) {
  if ((pc.glow && pc.noHit) || pc.opacity != null) return null;
  if (pc.glow) return 'glow';
  const c = String(pc.color ?? '#c3c9d2').toLowerCase();
  if (KNOWN[c]) return KNOWN[c];
  if (!roleCache.has(c)) { const [, s, l] = hexToHsl(c); roleCache.set(c, s > 0.38 && l > 0.2 ? 'accent' : l > 0.58 ? 'main' : l > 0.24 ? 'sub' : 'frame'); }
  return roleCache.get(c);
}

/** 塗る前の色（部品を作る道具の色そのまま） */
export const DEFAULT_PAINT = () => ({ type: '', pal: { main: '#c3c9d2', sub: '#6b727d', frame: '#23262c', accent: '#b8483e', glow: '#ffd257' }, lock: {}, vivid: { colors: [], on: {} } });

const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
/** ブロック pc（部位 cat のパーツの中）の色 */
export function colorOf(pc, cat, paint) {
  const role = roleOf(pc);
  if (!role || !paint) return pc.color ?? '#c3c9d2';
  const v = paint.vivid ?? { colors: [], on: {} }, n = v.colors.length;
  if (role === 'main' && n && v.on[cat] != null && v.colors[v.on[cat]]) return v.colors[v.on[cat]];
  if (role === 'accent' && n) return v.colors[v.on[cat] != null ? (v.on[cat] + 1) % n : hash(cat) % n];   // ビビッドで塗った部位の差し色は、別のビビッドの色
  return paint.pal[role] ?? pc.color;
}

// ---- いい感じに塗る：型を選び、その型の決まりの中で色を振る ----
const GLOWS = ['#7dff9a', '#ff6ad5', '#ffd257', '#6ff0ff', '#ff5a4a', '#b08bff'];
/** 型：[名前, 重み, 作り方 (rnd, between) → { main: [h,s,l], sub: [h,s,l] }] */
const TYPES = [
  ['白い試作機', 3, (r, B) => { const h = r() < 0.7 ? B(200, 245) : B(0, 360); return { main: [B(190, 250), B(0.02, 0.1), B(0.84, 0.92)], sub: [h, B(0.4, 0.68), B(0.26, 0.4)] }; }],
  ['量産機', 3, (r, B) => { const h = [B(70, 115), B(34, 52), B(198, 222), B(8, 24)][Math.floor(r() * 4)], l = B(0.38, 0.54); return { main: [h, B(0.12, 0.3), l], sub: [h + B(-14, 14), B(0.1, 0.26), l - B(0.16, 0.22)] }; }],
  ['敵役', 2, (r, B) => { const h = r() < 0.6 ? B(330, 390) : B(250, 300), l = B(0.17, 0.28); return { main: [h, B(0.25, 0.55), l], sub: [h + B(-22, 22), B(0.15, 0.4), l + B(0.2, 0.3)] }; }],
  // 単色・2 色は、全身が色付きになるので鮮やかさを抑える（鮮やかな色はビビッドで小さく入れる）
  ['単色', 1.5, (r, B) => { const h = B(0, 360), l = B(0.42, 0.58); return { main: [h, B(0.16, 0.36), l], sub: [h + B(-6, 6), B(0.16, 0.34), l - B(0.2, 0.27)] }; }],
  ['2 色', 1.5, (r, B) => { const h = B(0, 360); return { main: [h, B(0.18, 0.38), B(0.5, 0.64)], sub: [h + (r() < 0.5 ? 1 : -1) * B(28, 45), B(0.22, 0.45), B(0.24, 0.36)] }; }],
  ['灰色の実戦機', 3, (r, B) => { const h = B(195, 235), l = B(0.55, 0.7); return { main: [h, B(0.03, 0.12), l], sub: [h, B(0.06, 0.16), l - B(0.24, 0.32)] }; }],
];
/**
 * 塗りの色の組をランダムに作る。prev の lock に入っている役は prev の色のまま。ビビッドは触らない。
 * 検査：主装甲と副装甲の明るさの差が 0.15 以上、主装甲とフレームの差が 0.12 以上（合わなければ振り直す）
 */
export function randomPalette(rnd = Math.random, prev = null) {
  const B = (a, b) => a + rnd() * (b - a), lock = prev?.lock ?? {};
  const total = TYPES.reduce((a, t) => a + t[1], 0);
  for (let tries = 0; tries < 40; tries++) {
    let k = rnd() * total, type = TYPES[0];
    for (const t of TYPES) { k -= t[1]; if (k <= 0) { type = t; break; } }
    const { main, sub } = type[2](rnd, B);
    const frame = [main[0], B(0.04, 0.12), B(0.12, 0.19)];
    if (Math.abs(main[2] - sub[2]) < 0.15 || Math.abs(main[2] - frame[2]) < 0.12) continue;
    // 差し色：主装甲から色相を大きく離して鮮やかに。発光：主装甲と色相が近すぎないもの
    const accent = [main[0] + B(140, 220), B(0.7, 0.9), B(0.48, 0.57)];
    const glows = GLOWS.filter(g => main[1] < 0.2 || hueGap(hexToHsl(g)[0], main[0]) > 50);
    const pal = { main: hslToHex(...main), sub: hslToHex(...sub), frame: hslToHex(...frame), accent: hslToHex(...accent), glow: glows[Math.floor(rnd() * glows.length)] ?? GLOWS[0] };
    for (const role of Object.keys(pal)) if (lock[role] && prev?.pal?.[role]) pal[role] = prev.pal[role];
    return { type: type[0], pal, lock: { ...lock }, vivid: prev?.vivid ?? { colors: [], on: {} } };
  }
  return prev ?? DEFAULT_PAINT();
}

// ---- ビビッドを差す：数色の鮮やかな色を選び、どの部位に塗るかを選ぶ ----
/** 塗る候補の部位（面積が小さめで、目を引く所）。同じ組の部位は同じ色になる */
const ZONES = [[4, '胸'], [4, '肩アーマー'], [3, '腰', '前掛け'], [3, '前スカート'], [1, '横スカート'], [3, 'ひざ当て'], [4, '足'], [2, '前腕'], [1, '手'], [1, 'トサカ'], [1, 'あご', 'マスク'], [2, 'バックパック', '翼'], [1, 'すね'], [1, '腹']];   // [重み, 部位名…]。頭の殻は塗らない（顔の印象を変えない）
const yellowish = h => { const x = ((h % 360) + 360) % 360; return x > 40 && x < 70; };
const greenish = h => { const x = ((h % 360) + 360) % 360; return x >= 70 && x < 165; };
/**
 * ビビッドの色（1〜3 色）と塗る部位をランダムに。cats：いま機体にある部位名の並び。mainHue：主装甲の色相（かぶらないように）。
 * 3 色のときは 4 割で赤・青・黄の組。塗る部位は 1 色につき 1〜2 組で、合わせて 4 組まで
 */
export function randomVivid(rnd = Math.random, cats = [], mainHsl = [0, 0, 0.8]) {
  const B = (a, b) => a + rnd() * (b - a);
  const n = (() => { const k = rnd(); return k < 0.3 ? 1 : k < 0.72 ? 2 : 3; })();
  let hues;
  if (n === 3 && rnd() < 0.4) hues = [B(352, 368), B(214, 232), B(44, 52)];
  else { const h0 = B(0, 360); hues = n === 1 ? [h0] : n === 2 ? [h0, h0 + B(120, 200)] : [h0, h0 + B(105, 135), h0 + B(225, 255)]; }
  // 主装甲が色付きなら、近い色相は離す
  if (mainHsl[1] > 0.2) hues = hues.map(h => (hueGap(h, mainHsl[0]) < 40 ? h + 70 : h));
  const colors = hues.map(h => (greenish(h) ? hslToHex(h, B(0.6, 0.8), B(0.34, 0.42)) : hslToHex(h, B(0.82, 0.96), yellowish(h) ? B(0.52, 0.58) : B(0.44, 0.54))));
  // 部位は重みを付けて順に選ぶ（胸・肩・腰・足・ひざ当てなど、よく色を入れる所が先に出やすい）
  const pool = ZONES.map(([w, ...z]) => [w, z.filter(c => cats.includes(c))]).filter(([, z]) => z.length), zones = [];
  while (pool.length) { let k = rnd() * pool.reduce((a, p) => a + p[0], 0), i = 0; for (; i < pool.length - 1; i++) { k -= pool[i][0]; if (k <= 0) break; } zones.push(pool.splice(i, 1)[0][1]); }
  const on = {};
  let used = 0;
  colors.forEach((c, k) => { const m = Math.min(zones.length - used, n === 1 ? 2 + Math.floor(rnd() * 2) : 1 + Math.floor(rnd() * 2), 4 - used); for (let i = 0; i < m; i++) for (const cat of zones[used++]) on[cat] = k; });
  return { colors, on };
}
