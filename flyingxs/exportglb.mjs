// amphib1 の機体ファイルを機体エディタ Ver2 で開き、「ゲーム用に書き出す」（window.__asm.exportGame）で .glb にする（headless の Chrome）。
//   node exportglb.mjs <id> <機体ファイル> <出力.glb>     エディタは http://127.0.0.1:8831/v2.html
import { createRequire } from 'node:module'; import { readFileSync, writeFileSync } from 'node:fs';
import { takeLock } from './heavylock.mjs';
const puppeteer = createRequire('C:/Users/nakam/ex-online/package.json')('puppeteer-core');
const [id, unitFile, out] = process.argv.slice(2);
const freeLock = await takeLock('flyingxs-export-' + process.pid);
const br = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await br.newPage(); await p.setViewport({ width: 1280, height: 800 });
p.on('pageerror', e => console.log('ERR', e.message));
p.setDefaultTimeout(600000);
await p.evaluateOnNewDocument(`window.__waitMs = ${+(process.env.WAIT ?? 1000)}`); await p.goto('http://127.0.0.1:8831/v2.html'); await p.waitForFunction('window.__asm?.saves?.openFile');
const r = await p.evaluate(async (text, id) => {
  window.confirm = () => true;
  await window.__asm.saves.openFile(new File([text], 'body.xsunit.json'));
  await new Promise(r => setTimeout(r, +(window.__waitMs ?? 1000)));
  const r = await window.__asm.exportGame(id);
  return { glb: r.glb, floating: r.floating, loose: r.loose, report: r.report };
}, readFileSync(unitFile, 'utf8'), id);
writeFileSync(out, Buffer.from(r.glb, 'base64'));
writeFileSync(out.replace(/\.glb$/, '.export.json'), JSON.stringify({ floating: r.floating, loose: r.loose, report: r.report }, null, 1));
console.log('glb', out, Buffer.from(r.glb, 'base64').length, 'floating', r.floating.length, 'loose', r.loose.length, 'tris', JSON.stringify(r.report.tris), 'height', r.report.height);
await br.close(); freeLock();
