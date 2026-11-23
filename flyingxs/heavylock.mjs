// PC 全体で重い物を 1 本ずつにする札（out/heavy.lock）。決まりは tools/heavylock.ts と同じ（tsx を通さない .mjs の道具のための写し）：
// 札は「名前 PID 時刻」。持ち主の PID が死んだ札・30 分より古い札は取り直せる。リリースの予約（heavy.reserve、置いた PID が生きていて
// 30 分より新しい物）がある間は新しく取らない。持っている間に予約が来ても譲る仕組みはここには無い（長く回す物は
// `npx tsx tools/heavylock.ts <名前> -- node <この道具>` で回す：そちらは譲る）。
import fs from 'node:fs';
const LOCK = process.env.HEAVY_LOCK ?? 'C:/Users/nakam/ex-online/out/heavy.lock';
const RESERVE = process.env.HEAVY_RESERVE ?? LOCK.replace(/heavy\.lock$/, 'heavy.reserve');
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
const reserved = () => { try { const r = JSON.parse(fs.readFileSync(RESERVE, 'utf8')); return typeof r.pid === 'number' && Date.now() - fs.statSync(RESERVE).mtimeMs <= 30 * 60e3 && alive(r.pid); } catch { return false; } };
const stale = () => { try { const m = /^\S+ (?:pid )?(\d{2,7})(?=\s|$)/.exec(fs.readFileSync(LOCK, 'utf8').trim()); return Date.now() - fs.statSync(LOCK).mtimeMs > 30 * 60e3 || (!!m && !alive(Number(m[1]))); } catch { return false; } };
const parentHolds = () => { try { const o = Number(process.env.HEAVY_LOCK_OWNER); return !!o && fs.readFileSync(LOCK, 'utf8').trim().split(' ')[1] === String(o) && alive(o); } catch { return false; } };
export async function takeLock(who) {
  if (parentHolds()) return () => {};
  const mine = `${who} ${process.pid} ${new Date().toISOString()}`;
  for (;;) {
    if (!reserved()) {
      try { fs.writeFileSync(LOCK, `${mine}\n`, { flag: 'wx' }); if (!reserved()) break; fs.unlinkSync(LOCK); }
      catch { try { if (stale()) fs.unlinkSync(LOCK); } catch {} }
    }
    await new Promise(r => setTimeout(r, 2000));
  }
  const beat = setInterval(() => { try { if (fs.readFileSync(LOCK, 'utf8').trim() === mine) { const n = new Date(); fs.utimesSync(LOCK, n, n); } } catch {} }, 30e3); beat.unref();
  const free = () => { clearInterval(beat); try { if (fs.readFileSync(LOCK, 'utf8').trim() === mine) fs.unlinkSync(LOCK); } catch {} };
  process.on('exit', free); process.on('SIGINT', () => { free(); process.exit(1); });
  return free;
}
