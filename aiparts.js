// 「AI で作る」の中身のうち、画面を持たない所：AI の答え（文章）から機体の JSON を取り出す、その部品が作れる形かを調べる、
// 今の機体を AI に渡す形（仕様 ai.md の形）の JSON にする。機体エディタ 1（index.html）の同じ処理を取り出したもの。
import { DEFAULTS, BONE_CHOICES, PIVOT_CHOICES } from './xsengine.js';

// The AI's answer, as pasted: the JSON may sit in a code block or between sentences, come in two messages
// (「続き」), be cut off, or carry what chat AIs like to add: comments, trailing commas, curly quotes, True/None.
export class AiTextError extends Error {}
// JS-ish text -> JSON text: strings are kept (single quotes become double), comments dropped, then outside
// strings: trailing commas, bare keys and Python literals fixed
function lenientJson(src) {
  src = src.replace(/[“”＂]/g, '"').replace(/[‘’]/g, "'").replace(/ |　/g, ' ');
  const strs = [];
  let out = '';
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === "'") {
      let j = i + 1, s = '';
      while (j < src.length && src[j] !== c) { if (src[j] === '\\') { s += src[j] + (src[j + 1] ?? ''); j += 2; } else s += src[j++]; }
      if (c === "'") s = s.replace(/\\'/g, "'").replace(/"/g, '\\"');
      out += `\u0000${strs.push('"' + s.replace(/\n/g, '\\n') + '"') - 1}\u0000`;
      i = j;
    } else if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; out += '\n'; }
    else if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? src.length : e + 1; }
    else out += c;
  }
  out = out.replace(/,(\s*[}\]])/g, '$1')
    .replace(/([{,]\s*)([A-Za-z_$][\w$]*)\s*:/g, '$1"$2":')
    .replace(/\bTrue\b/g, 'true').replace(/\bFalse\b/g, 'false').replace(/\bNone\b/g, 'null');
  return out.replace(/\u0000(\d+)\u0000/g, (_, k) => strs[k]);
}
// from `start` (a '{'), where its matching '}' is, or -1 when the text ends first (cut off)
function closingBrace(t, start) {
  let depth = 0, q = null;
  for (let i = start; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '\\') i++; else if (c === q) q = null; continue; }
    if (c === '"' || c === '“' || c === '”') q = c === '“' ? '”' : c;
    else if (c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') { if (--depth === 0) return i; }
  }
  return -1;
}
export function parseAiText(text) {
  // the request this screen copies (or the spec itself) pasted back here instead of the AI's answer
  if (/人型ロボット（XS）の(機体|パーツの)データを作ってください|# XS部品エディタ：AI向けの(機体|パーツ)データ仕様/.test(text))
    throw new AiTextError('貼り付けたのは、AI に渡す「頼み方」です。この文章を ChatGPT などの AI に貼り付けて送り、AI が返してきた答え（JSON）をここに貼ってください。');
  const blocks = [...text.matchAll(/```[a-zA-Z]*\s*\n?([\s\S]*?)(?:```|$)/g)].map(m => m[1]).filter(b => /[{[]/.test(b));
  const bare = text.replace(/```[a-zA-Z]*/g, '');
  const candidates = [...blocks];
  if (blocks.length > 1) candidates.push(blocks.join('\n'));   // one answer split over two messages
  // outside code blocks: every '{' that opens an object holding "parts", then a bare list of parts
  let cutOff = false;
  for (const m of bare.matchAll(/\{/g)) {
    const end = closingBrace(bare, m.index);
    if (end < 0) { if (/parts/.test(bare.slice(m.index))) cutOff = true; break; }
    const s = bare.slice(m.index, end + 1);
    if (/["']?parts["']?\s*:/.test(s)) { candidates.push(s); break; }
  }
  const a = bare.indexOf('['), z = bare.lastIndexOf(']');
  if (a >= 0 && z > a) candidates.push(bare.slice(a, z + 1));
  let firstError = null;
  for (const c of candidates) {
    for (const src of [c, lenientJson(c)]) {
      let data;
      try { data = JSON.parse(src); } catch (e) { firstError ??= { e, src }; continue; }
      const model = Array.isArray(data) ? { parts: data } : Array.isArray(data?.samples) ? data.samples[0] : data;
      if (Array.isArray(model?.parts)) return model;
    }
  }
  if (!candidates.length && !cutOff) throw new AiTextError('JSON が見つかりません。AI の答えの { から } までを、まるごと貼り付けてください。');
  if (cutOff || (firstError && /end of|Unterminated|Unexpected end/i.test(firstError.e.message)))
    throw new AiTextError('AI の答えが途中で切れています（最後の } まで届いていません）。AI の答えが長すぎて止まったときに起きます。AI に「部品の数を 80 個くらいに減らして、JSON 全体を 1 回で出して」と頼んでください。続きを出してもらった場合は、1 回目と 2 回目の答えを続けて貼り付けても読めます。');
  if (!firstError) throw new AiTextError('"parts"（部品の一覧）がありません。');
  // show where it broke, so it can be handed back to the AI
  const pos = Number(/position (\d+)/.exec(firstError.e.message)?.[1] ?? -1);
  const near = pos >= 0 ? `\n問題の場所の近く: …${firstError.src.slice(Math.max(0, pos - 60), pos + 40).replace(/\s+/g, ' ')}…` : '';
  throw new AiTextError(`JSON の書き方に誤りがあって読めません（${firstError.e.message}）。${near}`);
}
const RANGES = { depth: [0.001, 20], bevel: [0, 5], bevelSegs: [1, 8], corner: [0, 5], cornerSegs: [1, 8], taper: [0.05, 3],
  tiltY: [-10, 10], ridge: [0, 10], segments: [3, 64], arrayCount: [1, 16], metal: [0, 1], rough: [0, 1] };
// keeps the parts the editor can build; every rejected one gets a reason the AI can fix
export function checkAiParts(list) {
  const ok = [], errors = [], unknown = new Set();
  list.forEach((p, i) => {
    const bad = m => { errors.push(`${i + 1} 番目の部品${typeof p?.name === 'string' ? `「${p.name}」` : ''}: ${m}`); };
    if (!p || typeof p !== 'object' || Array.isArray(p)) return bad('{ } のオブジェクトではありません');
    for (const k of Object.keys(p)) if (!(k in DEFAULTS) && k !== 'gun') unknown.add(k);
    const kind = p.kind ?? 'extrude';
    if (kind !== 'extrude' && kind !== 'lathe' && kind !== 'hull') return bad(`kind は "extrude" か "lathe"（か、頭ジェネレーターの "hull"）です（${JSON.stringify(p.kind)}）`);
    if (p.op !== undefined && p.op !== 'add' && p.op !== 'sub') return bad(`op は "add" か "sub" です（${JSON.stringify(p.op)}）`);
    if (kind === 'hull') {
      const pl = p.planes;
      if (!Array.isArray(pl) || pl.length < 4 || pl.length > 96 || !pl.every(q => Array.isArray(q) && (q.length === 4 || q.length === 5) && q.every(Number.isFinite))) return bad('planes は [[nx, ny, nz, d, 面取り?], ...] の 4〜96 個の数値の組です');
    } else {
    const pts = p.pts, need = kind === 'extrude' ? 3 : 2;
    if (!Array.isArray(pts) || !pts.every(q => Array.isArray(q) && q.length === 2 && q.every(Number.isFinite))) return bad('pts は [[x, y], ...] の数値の組の一覧です');
    if (pts.length < need || pts.length > 128) return bad(`pts の点が ${pts.length} 個です（${need}〜128 個）`);
    }
    for (const [k, [lo, hi]] of Object.entries(RANGES))
      if (p[k] !== undefined && !(Number.isFinite(p[k]) && p[k] >= lo && p[k] <= hi)) return bad(`${k} は ${lo}〜${hi} の数値です（${JSON.stringify(p[k])}）`);
    for (const k of ['pos', 'rot', 'scl', 'arrayStep'])
      if (p[k] !== undefined && !(Array.isArray(p[k]) && p[k].length === 3 && p[k].every(Number.isFinite))) return bad(`${k} は [x, y, z] の 3 つの数値です`);
    if (p.color !== undefined && !/^#[0-9a-fA-F]{6}$/.test(p.color)) return bad(`color は "#rrggbb" の形です（${JSON.stringify(p.color)}）`);
    if (p.bone !== undefined && !(p.bone in BONE_CHOICES)) return bad(`bone は ${Object.keys(BONE_CHOICES).join(' / ')} のどれかです`);
    if (p.pivot !== undefined && !(p.pivot in PIVOT_CHOICES)) return bad(`pivot は ${Object.keys(PIVOT_CHOICES).join(' / ')} のどれかです`);
    for (const k of ['mirror', 'blockout', 'team', 'gun']) if (p[k] !== undefined && typeof p[k] !== 'boolean') return bad(`${k} は true か false です`);
    if (p.glow !== undefined && p.glow !== null && typeof p.glow !== 'boolean') return bad('glow は true か false です');
    for (const k of ['side', 'top']) {
      const v = p[k];
      if (v === undefined || v === null) continue;
      if (kind !== 'extrude') return bad(`${k} は押し出し（extrude）の部品だけに使えます`);
      if (!Array.isArray(v) || !v.every(q => Array.isArray(q) && q.length === 2 && q.every(Number.isFinite)) || v.length < 3 || v.length > 128)
        return bad(`${k} は [[${k === 'side' ? 'z, y' : 'x, z'}], ...] の 3〜128 個の数値の組です`);
    }
    ok.push({ ...p, name: String(p.name ?? '部品').slice(0, 60) });
  });
  return { ok, errors, unknown: [...unknown] };
}

/** The model in the spec's format, for the AI to fix (parts: the engine's document). Values equal to the defaults are
 *  left out and numbers rounded, one part per line. */
export function modelJson(parts, ai = '', format = 'xs-editor-model') {
  const round = v => (typeof v === 'number' ? Math.round(v * 1e4) / 1e4 : Array.isArray(v) ? v.map(round) : v);
  const lines = parts.filter(p => p.kind !== 'mesh' && p.kind !== 'tri').map(d => {
    const out = { name: d.name };
    for (const k of Object.keys(DEFAULTS)) {
      if (k === 'name') continue;
      const v = round(d[k] ?? DEFAULTS[k]);
      if (k === 'pts' ? d.kind !== 'hull' : JSON.stringify(v) !== JSON.stringify(DEFAULTS[k])) out[k] = v;
    }
    return '    ' + JSON.stringify(out);
  });
  const head = { format, version: 1, ai: ai || undefined };
  return JSON.stringify(head, null, 2).replace(/\n}$/, `,\n  "parts": [\n${lines.join(',\n')}\n  ]\n}`);
}
