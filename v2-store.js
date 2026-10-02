// 機体エディタ Ver2 の、このブラウザの中の置き場（保存した機体・作ったパーツ）。
// 前は localStorage に入れていた。localStorage はサイト全体で 5 MB ほどしか入らず、戦艦 1 隻（部品 1146 個）で 0.66 MB 使う
// （保存した機体に 1 つ、作ったパーツに 1 つ入るので、数隻で入らなくなった）。だから IndexedDB（データベース xsv2、表 kv）に置く。
// IndexedDB はディスクの空きに応じて、ずっと多く入る。
//
// 使い方は localStorage と同じ「名前 → 文字列」。読むのは待たずに済むよう、開いたときに全部を手元（mem）へ読んでおき、
// 書くときは手元を書き換えてから IndexedDB へ送る（送り終わったかどうかは、返す Promise で分かる）。
//   await Store.open()            開く。前の置き場（localStorage の xsv2.saves・xsv2.userparts）に残っていれば、こちらへ移して消す
//   Store.get(key) → 文字列か undefined      Store.keys(prefix) → その頭で始まる名前の並び
//   Store.set(key, text) → Promise<boolean>   Store.del(key) → Promise<boolean>   （false：書けなかった。手元も元に戻す）
//   await Store.reload()          もう一度ぜんぶ読む（ほかのタブで保存したものを見るため）
//   Store.where() → 'indexeddb' か 'localstorage'
// IndexedDB が使えないブラウザ（開けない・止められている）では、前と同じ localStorage に置く（入る量も前と同じ）。
//
// 名前の決まり：保存した機体は 1 体ごとに 'save:<id>'（中身は { name, at, thumb, doc } の JSON）、作ったパーツは 'userparts'（{ id: パーツ } の JSON）。

const DB = 'xsv2', TABLE = 'kv';
const OLD_SAVES = 'xsv2.saves', OLD_USER = 'xsv2.userparts';
export const SAVE_PRE = 'save:', USER_KEY = 'userparts';
const mem = new Map();
let db = null;

const req = r => new Promise((ok, ng) => { r.onsuccess = () => ok(r.result); r.onerror = () => ng(r.error); });
function openDb() {
  return new Promise((ok, ng) => {
    let r;
    try { r = indexedDB.open(DB, 1); } catch (e) { ng(e); return; }
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(TABLE)) r.result.createObjectStore(TABLE); };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => ng(r.error);
    r.onblocked = () => ng(new Error('blocked'));
  });
}
/** 1 回の書き込み（置く・消す）。終わったら true、できなかったら false */
function write(fn) {
  return new Promise(done => {
    let t;
    try { t = db.transaction(TABLE, 'readwrite'); fn(t.objectStore(TABLE)); } catch { done(false); return; }
    t.oncomplete = () => done(true);
    t.onerror = t.onabort = () => done(false);
  });
}
async function readAll() {
  const t = db.transaction(TABLE, 'readonly').objectStore(TABLE);
  const [keys, vals] = await Promise.all([req(t.getAllKeys()), req(t.getAll())]);
  mem.clear();
  keys.forEach((k, i) => { if (typeof vals[i] === 'string') mem.set(String(k), vals[i]); });
}
const ls = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); return true; } catch { return false; } }, del: k => { try { localStorage.removeItem(k); } catch { /* 止められている */ } } };

/** localStorage に置くとき（IndexedDB が使えない）：前と同じ 2 つの名前に、手元の中身をまとめて書く */
function writeLocal() {
  const saves = {};
  for (const [k, v] of mem) if (k.startsWith(SAVE_PRE)) { try { saves[k.slice(SAVE_PRE.length)] = JSON.parse(v); } catch { /* 壊れた 1 体は飛ばす */ } }
  return ls.set(OLD_SAVES, JSON.stringify(saves)) && (mem.has(USER_KEY) ? ls.set(OLD_USER, mem.get(USER_KEY)) : (ls.del(OLD_USER), true));
}
function readLocal() {
  mem.clear();
  try { for (const [id, rec] of Object.entries(JSON.parse(ls.get(OLD_SAVES) ?? '{}') ?? {})) mem.set(SAVE_PRE + id, JSON.stringify(rec)); } catch { /* 壊れている */ }
  const u = ls.get(OLD_USER);
  if (u) mem.set(USER_KEY, u);
}
/** 前の置き場（localStorage）に残っているものを IndexedDB へ移す。移し終えたものだけ、前の置き場から消す */
async function moveOld() {
  let moved = 0;
  const oldSaves = ls.get(OLD_SAVES);
  if (oldSaves) {
    let all = {}, ok = true;
    try { all = JSON.parse(oldSaves) ?? {}; } catch { all = {}; }
    for (const [id, rec] of Object.entries(all)) {
      if (mem.has(SAVE_PRE + id)) continue;   // （こちらに同じ id があれば、こちらが新しい）
      const text = JSON.stringify(rec);
      if (await write(t => t.put(text, SAVE_PRE + id))) { mem.set(SAVE_PRE + id, text); moved++; } else ok = false;
    }
    if (ok) ls.del(OLD_SAVES);
  }
  const oldUser = ls.get(OLD_USER);
  if (oldUser) {
    // こちらにもあれば、こちらに無いパーツだけを足す
    let text = oldUser;
    if (mem.has(USER_KEY)) { try { text = JSON.stringify({ ...JSON.parse(oldUser), ...JSON.parse(mem.get(USER_KEY)) }); } catch { text = mem.get(USER_KEY); } }
    if (text === mem.get(USER_KEY) || await write(t => t.put(text, USER_KEY))) { mem.set(USER_KEY, text); ls.del(OLD_USER); moved++; }
  }
  return moved;
}

export const Store = {
  /** 開いて、ぜんぶ手元へ読む。→ { where, moved（前の置き場から移した数） } */
  async open() {
    try { db = await openDb(); await readAll(); } catch (e) { console.warn('IndexedDB を使えないので、localStorage に置きます', e); db = null; readLocal(); return { where: 'localstorage', moved: 0 }; }
    db.onversionchange = () => { db.close(); db = null; };
    return { where: 'indexeddb', moved: await moveOld() };
  },
  where: () => (db ? 'indexeddb' : 'localstorage'),
  get: key => mem.get(key),
  keys: (prefix = '') => [...mem.keys()].filter(k => k.startsWith(prefix)),
  async set(key, text) {
    const had = mem.has(key), before = mem.get(key);
    mem.set(key, text);
    const ok = db ? await write(t => t.put(text, key)) : writeLocal();
    if (!ok && mem.get(key) === text) { if (had) mem.set(key, before); else mem.delete(key); }   // （その間に書き直されていなければ、元に戻す）
    return ok;
  },
  async del(key) {
    if (!mem.has(key)) return true;
    const before = mem.get(key);
    mem.delete(key);
    const ok = db ? await write(t => t.delete(key)) : writeLocal();
    if (!ok && !mem.has(key)) mem.set(key, before);
    return ok;
  },
  async reload() { try { if (db) await readAll(); else readLocal(); } catch (e) { console.warn('置き場を読み直せませんでした', e); } },
  /** 使っている量と入る量（バイト。ブラウザが教えてくれるときだけ） */
  async room() { try { const e = await navigator.storage.estimate(); return { used: e.usage ?? 0, quota: e.quota ?? 0 }; } catch { return null; } },
};
