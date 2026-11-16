// Tripo の形（.glb）か組んだ機体（xs-unit の .json）を機体エディタ Ver2 で開き、同じカメラ・同じ明かりで部位ごとに撮る。
//   node pairshots.mjs <.glb か .json> <出力の頭> [--flipz]
//   撮る物：部位（全身・頭・胴・肩と腕・脚）× 向き（正面・横・後ろ・斜め）。画角 2°（平行に近い投影）。
//   部位の範囲は、機体の外形の箱に対する割合で決める（Tripo と組んだ物で同じ割合）。
//   --flipz：前が −z の形（Tripo の形）を、組んだ物と同じ向きに撮る（カメラを y の軸で 180° 回す）。
// 札：PC 全体で 1 本ずつ（heavylock.mjs）。
import { createRequire } from 'node:module'; import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { takeLock } from '../heavylock.mjs';
const puppeteer = createRequire('C:/Users/nakam/ex-online/package.json')('puppeteer-core');
const [src, out] = process.argv.slice(2);
const FLIPZ = process.argv.includes('--flipz');
const freeLock = await takeLock('flyingxs-pair-' + process.pid);
const br = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await br.newPage(); await p.setViewport({ width: 900, height: 1100 });
p.on('pageerror', e => console.log('ERR', e.message));
p.setDefaultTimeout(900000);
await p.goto('http://127.0.0.1:8831/v2.html'); await p.waitForFunction('window.__asm?.saves?.openFile');
const isGlb = /\.glb$/i.test(src);
const b64 = readFileSync(src).toString('base64');
const res = await p.evaluate(async (b64, isGlb, name, FLIPZ, FIX) => {
  window.confirm = () => true;
  const A = window.__asm;
  const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  if (isGlb) { const def = await A.saves.importGlb(new File([bin], name)); if (!def) return { err: '取り込めませんでした' }; }
  else await A.saves.openFile(new File([new TextDecoder().decode(bin)], name));
  await new Promise(r => setTimeout(r, 2500));
  const { renderer, scene, camera, orbit, root } = A;
  // エディタの目印（骨の箱・格子）を隠す：線の物と透けた物
  scene.traverse(o => { if (o.isLineSegments || o.isLine || o.isGridHelper) o.visible = false; if (o.isMesh && o.material && !Array.isArray(o.material) && o.material.transparent && o.material.opacity < 0.5) o.visible = false; });
  const box = { min: [1e9, 1e9, 1e9], max: [-1e9, -1e9, -1e9] };
  root.updateMatrixWorld(true);
  root.traverse(o => { if (!o.isMesh || !o.visible || !o.geometry) return; o.geometry.computeBoundingBox(); const b = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld); for (let i = 0; i < 3; i++) { box.min[i] = Math.min(box.min[i], b.min.getComponent(i)); box.max[i] = Math.max(box.max[i], b.max.getComponent(i)); } });
  if (FIX) { box.min = FIX.min; box.max = FIX.max; }
  const H = box.max[1] - box.min[1], cx = (box.min[0] + box.max[0]) / 2, cz = (box.min[2] + box.max[2]) / 2, y0 = box.min[1];
  renderer.setPixelRatio(1); renderer.setSize(800, 800, false);
  const FOV = 2, T = Math.tan(FOV / 2 * Math.PI / 180); camera.near = 1; camera.far = 5000; camera.fov = FOV; camera.aspect = 1; camera.updateProjectionMatrix();
  const zs = FLIPZ ? -1 : 1;
  const DIRS = { front: [0, 0, 1], threeq: [0.75, 0.35, 1], top: [0, 1, 0.0001] };
  // 部位：中心（外形の箱に対する割合：x は幅の半分に対する割合、y は背に対する割合）と、写す高さ（背に対する割合）
  const W = Math.max(box.max[0] - cx, cx - box.min[0]);
  const REG = { full: [0, 0.5, 1.08], head: [0, 0.9, 0.24], face: [0, 0.912, 0.12] };
  const shots = {};
  for (const [rk, [fx, fy, sz]] of Object.entries(REG)) {
    const at = [cx + fx * W, y0 + fy * H, cz], half = sz * H / 2;
    for (const [dk, d0] of Object.entries(DIRS)) {
      const d = [d0[0] * zs, d0[1], d0[2] * zs], l = Math.hypot(...d), u = d.map(x => x / l), dist = half / T;
      camera.position.set(at[0] + u[0] * dist, at[1] + u[1] * dist, at[2] + u[2] * dist);
      camera.up.set(0, dk === 'top' ? 0 : 1, dk === 'top' ? zs : 0); orbit.target.set(...at); camera.lookAt(...at); orbit.update(); camera.updateMatrixWorld();
      renderer.render(scene, camera);
      shots[`${rk}_${dk}`] = renderer.domElement.toDataURL('image/png');
    }
  }
  return { shots, box, H };
}, b64, isGlb, path.basename(src), FLIPZ, process.env.FIXBOX ? JSON.parse(process.env.FIXBOX) : null);
if (res.err) { console.log(res.err); process.exit(1); }
for (const [k, v] of Object.entries(res.shots)) writeFileSync(`${out}_${k}.png`, Buffer.from(v.split(',')[1], 'base64'));
console.log('box', JSON.stringify(res.box), 'H', res.H);
await br.close(); freeLock();
