// 頭の組み立て：カタログの部品を mov（位置）・rot（回転）・scal（拡大。負で鏡像）で置く。
// 置き方は DoGA の Parts Assembler と同じ考え方で、1 個の部品 = { part: カタログ id, mov, rot, scal }。
//   mov  [x, y, z]  エディタ座標（x 右・y 上・z 前）
//   rot  [rx, ry, rz] 度。先に rz（前後軸まわり＝ロール）、次に rx（横軸まわり＝ピッチ）、最後に ry（縦軸まわり＝ヨー）
//   scal [sx, sy, sz] 倍率。sx = -1 で左右の鏡像
// 置いた結果はエディタの部品（kind hull）の並びになる。切り取りは使わないので順番は自由。
import * as THREE from 'three';
import { byId } from './xsasm-parts.js';

const D = Math.PI / 180;
export const rotMatrix = rot => new THREE.Matrix4().makeRotationY(rot[1] * D).multiply(new THREE.Matrix4().makeRotationX(rot[0] * D)).multiply(new THREE.Matrix4().makeRotationZ(rot[2] * D));

/** 1 個の置いた部品 → エディタの部品の並び */
export function placeItem(item, catalog = byId) {
  const def = catalog[item.part];
  if (!def) throw new Error('no part ' + item.part);
  const mov = item.mov ?? [0, 0, 0], rot = item.rot ?? [0, 0, 0], scal = item.scal ?? [1, 1, 1];
  const R = rotMatrix(rot);
  const e = new THREE.Euler().setFromRotationMatrix(R, 'XYZ');
  const label = item.name ?? def.name;
  return def.pieces.map(pc => {
    const off = new THREE.Vector3(pc.pos[0] * scal[0], pc.pos[1] * scal[1], pc.pos[2] * scal[2]).applyMatrix4(R);
    const { pos, ...rest } = pc;
    return { ...rest, name: `頭・${label}・${pc.name}`, planes: pc.planes.map(p => p.slice()), pos: [mov[0] + off.x, mov[1] + off.y, mov[2] + off.z], rot: [e.x, e.y, e.z], scl: scal.slice() };
  });
}
export function assemble(items, catalog = byId) { return items.flatMap(it => placeItem(it, catalog)); }

/** DoGA の .FSC を読む：{ obj, file, mov, rot, scal } の並び（DoGA 座標のまま。x 前・y 横・z 上） */
export function parseFsc(text) {
  const items = [];
  const re = /\{\s*mov\s*\(\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*\)\s*rotz\s*\(\s*([-\d.]+)\s*\)\s*roty\s*\(\s*([-\d.]+)\s*\)\s*rotx\s*\(\s*([-\d.]+)\s*\)\s*scal\s*\(\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*\)\s*obj\s+(\S+)\s*(?:\/\*\s*"?([^"*]+?)"?\s*\*\/)?/g;
  let m;
  while ((m = re.exec(text))) items.push({ obj: m[10], file: (m[11] ?? '').trim(), mov: [+m[1], +m[2], +m[3]], rotx: +m[6], roty: +m[5], rotz: +m[4], scal: [+m[7], +m[8], +m[9]] });
  return items;
}
/** DoGA の置き方 → この組み立ての置き方（DoGA の x 前・y 横・z 上 を、x 右・y 上・z 前 に読み替える。unit は DoGA の 1 をエディタの何にするか） */
export function fromDoga(it, part, unit = 0.0005) {
  return { part, mov: [it.mov[1] * unit, it.mov[2] * unit, it.mov[0] * unit], rot: [it.roty, it.rotz, it.rotx], scal: [it.scal[1], it.scal[2], it.scal[0]] };
}
/** この組み立ての置き方 → DoGA 風の書き出し（.FSC と同じ書き方） */
export function toFscText(items, unit = 0.0005) {
  const f = v => (Math.round(v * 1000) / 1000).toString();
  return 'fram\n{\n' + items.map(it => {
    const mov = it.mov ?? [0, 0, 0], rot = it.rot ?? [0, 0, 0], scal = it.scal ?? [1, 1, 1];
    return `{\tmov ( ${f(mov[2] / unit)} ${f(mov[0] / unit)} ${f(mov[1] / unit)} ) rotz ( ${f(rot[1])} ) roty ( ${f(rot[0])} ) rotx ( ${f(rot[2])} )\n\tscal ( ${f(scal[2])} ${f(scal[0])} ${f(scal[1])} ) obj ${it.part}\n}`;
  }).join('\n') + '\n}\n';
}
