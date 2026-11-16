// 機体ファイルを機体エディタ Ver2 で開き、エディタの描画そのものを 6 方向から撮る（headless の Chrome）。
//   node shots.mjs <機体ファイル> <出力の頭>     エディタは http://127.0.0.1:8831/v2.html
// 撮る物：front（+z から）、side（+x から：正本の横の絵と同じく機首が左）、back（−z から）、top、threeq（斜め前）、headtop（頭を上から寄って）
import { createRequire } from 'node:module'; import { readFileSync, writeFileSync } from 'node:fs';
import { takeLock } from './heavylock.mjs';
const puppeteer = createRequire('C:/Users/nakam/ex-online/package.json')('puppeteer-core');
const [unitFile, out] = process.argv.slice(2);
const freeLock = await takeLock('flyingxs-shots-' + process.pid);
const br = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await br.newPage(); await p.setViewport({ width: 900, height: 1100 });
p.on('pageerror', e => console.log('ERR', e.message));
p.setDefaultTimeout(600000);
await p.goto('http://127.0.0.1:8831/v2.html'); await p.waitForFunction('window.__asm?.saves?.openFile');
const shots = await p.evaluate(async (text) => {
  window.confirm = () => true;
  const A = window.__asm;
  await A.saves.openFile(new File([text], 'unit.json'));
  await new Promise(r => setTimeout(r, 1500));
  const { renderer, scene, camera, orbit, root } = A;
  // 機体の外形（見える物だけ）
  const box = { min: [1e9, 1e9, 1e9], max: [-1e9, -1e9, -1e9] };
  root.updateMatrixWorld(true);
  root.traverse(o => { if (!o.isMesh || !o.visible || !o.geometry) return; o.geometry.computeBoundingBox(); const b = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld); for (let i = 0; i < 3; i++) { box.min[i] = Math.min(box.min[i], b.min.getComponent(i)); box.max[i] = Math.max(box.max[i], b.max.getComponent(i)); } });
  const c = box.min.map((v, i) => (v + box.max[i]) / 2), H = box.max[1] - box.min[1];
  const res = {};
  renderer.setPixelRatio(1); renderer.setSize(800, 1000, false);
  // 画角 2°（平行に近い投影）。20° だと奥の物（兜のとさかの頂）が低く小さく写り、正本と重ねて比べられなかった（頭のスレッドが測った、11/14）
  const FOV = 2, T = Math.tan(FOV / 2 * Math.PI / 180);
  camera.near = 1; camera.far = 2000;
  const take = (name, dir, at, dist, fov = FOV) => {
    const l = Math.hypot(...dir); const d = dir.map(x => x / l);
    camera.fov = fov; camera.aspect = renderer.domElement.width / renderer.domElement.height; camera.updateProjectionMatrix();
    camera.position.set(at[0] + d[0] * dist, at[1] + d[1] * dist, at[2] + d[2] * dist);
    camera.up.set(0, 1, 0); if (Math.abs(d[1]) > 0.99) camera.up.set(0, 0, -1);
    orbit.target.set(...at); camera.lookAt(...at); orbit.update(); camera.updateMatrixWorld();
    renderer.render(scene, camera);
    res[name] = renderer.domElement.toDataURL('image/png');
  };
  const far = H / (2 * T) * 1.12;
  take('front', [0, 0, 1], c, far);
  take('side', [1, 0, 0], c, far);
  take('back', [0, 0, -1], c, far);
  take('top', [0, 1, 0], c, far);
  take('threeq', [0.75, 0.35, 1], c, far);
  const head = [c[0], box.max[1] - H * 0.07, c[2]];
  take('headtop', [0, 1, 0], head, H * 0.12 / T);
  take('headfront', [0, 0, 1], head, H * 0.12 / T);
  return { res, box, H };
}, readFileSync(unitFile, 'utf8'));
for (const [k, v] of Object.entries(shots.res)) writeFileSync(`${out}_${k}.png`, Buffer.from(v.split(',')[1], 'base64'));
console.log('box', JSON.stringify(shots.box), 'H', shots.H);
await br.close(); freeLock();
