// PC 全体で重い物を 1 本ずつにする札（out/heavy.lock）。30 分より古い札は消してよい（memory の決まり）。
import fs from 'node:fs';
const LOCK = 'C:/Users/nakam/ex-online/out/heavy.lock';
export async function takeLock(who) {
  for (;;) {
    try { fs.writeFileSync(LOCK, `${who} ${new Date().toISOString()}\n`, { flag: 'wx' }); break; }
    catch { try { if (Date.now() - fs.statSync(LOCK).mtimeMs > 30 * 60e3) fs.unlinkSync(LOCK); } catch {} await new Promise(r => setTimeout(r, 2000)); }
  }
  const free = () => { try { if (fs.readFileSync(LOCK, 'utf8').startsWith(who + ' ')) fs.unlinkSync(LOCK); } catch {} };
  process.on('exit', free); process.on('SIGINT', () => { free(); process.exit(1); });
  return free;
}
