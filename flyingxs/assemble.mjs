// 部位ごとのファイル（out/flyingxs/parts/*.mjs）の部品を 1 つの機体ファイル（xs-unit）にまとめる。
//   node assemble.mjs <出力.json> [部位の名前 ...]     部位を書かなければ parts/ の全部
// 部位のファイルは `export const pieces = [...]`（機体エディタ Ver2 のブロックの並び。座標の決まりは PARTS.md）。
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const [out, ...only] = process.argv.slice(2);
const dir = path.join(here, 'parts');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.mjs')).filter(f => !only.length || only.includes(f.replace(/\.mjs$/, '')));
const pieces = [];
for (const f of files.sort()) {
  const m = await import(pathToFileURL(path.join(dir, f)).href + '?t=' + Date.now());
  const list = typeof m.pieces === 'function' ? await m.pieces() : m.pieces;
  for (const p of list) pieces.push(p);
  console.error(`${f}: ${list.length}`);
}
const unit = {
  format: 'xs-unit', version: 2, name: '空を飛ぶ XS（部位を組み合わせ）',
  items: [{ part: 'u·flyingxs_body', mov: [0, 0, 0], rot: [0, 0, 0], scal: [1, 1, 1] }], adj: {},
  paint: { type: '', pal: { main: '#78877f', sub: '#78877f', frame: '#292e31', accent: '#78877f', glow: '#ff3038' }, lock: {}, vivid: { colors: [], on: {} } },
  userParts: { 'u·flyingxs_body': { id: 'u·flyingxs_body', name: '空を飛ぶ XS の体', cat: '自由な機体', size: [1, 1, 1], user: true, free: true, half: 'free', tab: 'upper', pieces } },
};
fs.writeFileSync(out, JSON.stringify(unit));
console.error(`pieces ${pieces.length} -> ${out}`);
