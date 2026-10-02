// 「みんなの機体」：ゲームの中央サーバーに投稿された機体を見る・開く・イイネ・通報、自分の機体を投稿・上書き・削除する画面。
// ゲームのアカウントでログインする（合言葉のトークンはこのブラウザに残る）。サーバーが返した文字は、ぜんぶ textContent で出す。
// 投稿するのは機体の JSON（Ver2 の形：置いたパーツ・寸法・色・作ったパーツ）と小さな絵。取り込んだ形（.glb）の入った機体と艦は投稿できない。
// 機体エディタ 1 から投稿された機体（部品の並び）は、「機体エディタの部品でできた機体」として開く。
// ctx（v2.js が渡す）：{ busy(), okToLeave(what), doc() 今の機体の JSON, name() 今の機体の名前, problem() 投稿できない理由（無ければ ''）,
//   check() → Promise<{ ok, text }> つながりと関節, role() 用途（raid など）, thumb() 小さな絵（JPEG の data URL）,
//   openUnit(doc, title) Ver2 の機体を開く, openScene(parts, title, role, ai) 機体エディタ 1 の機体を開く, kinds 用途の名前 }
const CENTRAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? (new URLSearchParams(location.search).get('central') || 'http://localhost:8787') : 'https://ex-online-central.tobira-sys.workers.dev';
const TOKEN_KEY = 'xs_token';
// （Ver2 の機体を受け取れない前のサーバーは、unit を読まずにこう答える）
const OLD_SERVER = /部品は1〜|変更する内容がありません/;

const CSS = `
#shareBox { position: fixed; inset: 0; background: rgba(10, 12, 15, .82); z-index: 22; display: flex; align-items: center; justify-content: center; }
#shareBox[hidden] { display: none; }
#shareBox .box { width: min(1040px, 94vw); max-height: 90vh; overflow: auto; background: var(--panel); border: 1px solid #3d6a9c; border-radius: 10px; padding: 14px 16px; }
#shareBox .top { display: flex; gap: 8px; align-items: center; }
#shareBox .top b { flex: 1; font-size: 14px; }
#shareBox .bar2 { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin: 8px 0; }
#shareBox .bar2 input { width: 200px; }
#shareBox .who { color: var(--text); }
#shareBox select { width: auto; }
#shareBox .tabs2 button.on { border-color: var(--acc); color: var(--acc); }
#shareBox .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 10px; }
#shareBox .card { border: 1px solid var(--line); border-radius: 8px; padding: 6px; display: flex; flex-direction: column; gap: 4px; background: #181b20; }
#shareBox .card .th { position: relative; aspect-ratio: 4 / 3; background: #0f1114; border-radius: 5px; overflow: hidden; }
#shareBox .card .th img { width: 100%; height: 100%; object-fit: contain; display: block; }
#shareBox .card .rank { position: absolute; left: 4px; top: 4px; background: #f0a93b; color: #1a1a1a; font-weight: 700; border-radius: 10px; padding: 0 7px; }
#shareBox .card .nm { font-weight: 600; overflow-wrap: anywhere; }
#shareBox .card .meta { color: var(--dim); font-size: 11px; overflow-wrap: anywhere; }
#shareBox .card .meta.warn { color: var(--warn); }
#shareBox .card .btns { display: flex; flex-wrap: wrap; gap: 4px; margin-top: auto; }
#shareBox .card button.liked { color: #ff7a9a; border-color: #ff7a9a; }
#shareBox .sep { grid-column: 1 / -1; color: var(--dim); border-top: 1px solid var(--line); padding-top: 6px; }
#shareBox .foot { display: flex; gap: 8px; align-items: center; margin-top: 8px; }
#shareBox #shNote { flex: 1; }
#shareBox #shCheck { white-space: pre-line; margin: 4px 0; }
`;
const HTML = `<div class="box">
  <div class="top"><b>みんなの機体</b><button id="shClose">閉じる（Esc）</button></div>
  <div class="bar2" id="shAuth"></div>
  <div class="bar2"><input type="text" id="shTitle" placeholder="機体名（40 文字まで）" maxlength="40"><input type="text" id="shAi" placeholder="使った AI（なければ空欄）" maxlength="40"><button id="shUpload" class="acc" title="今の機体を、だれでも見られる所に出す（つながりと関節を調べて、問題が無いときだけ）">今の機体を投稿</button></div>
  <div class="hint" id="shCheck" hidden></div>
  <div class="bar2 tabs2"><button data-tab="rank" class="on">月間ランキング</button><select id="shMonth"></select><button data-tab="new">新着</button><button data-tab="likes">イイネ順</button><button data-tab="mine">自分の機体</button></div>
  <div class="grid" id="shGrid"></div>
  <div class="foot"><span class="hint" id="shNote"></span><button id="shMore" hidden>もっと見る</button></div>
  <p class="hint">投稿・イイネには XS オンラインのアカウントでログインする。月間ランキングは、その月に集まったイイネの数で並べる（日本時間）。原作の固有名詞を使った機体名や、ふさわしくない機体は通報してください。</p>
</div>`;

export function initShare(ctx) {
  const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
  const box = document.createElement('div'); box.id = 'shareBox'; box.hidden = true; box.innerHTML = HTML; document.body.appendChild(box);
  const $ = s => box.querySelector(s);
  const share = { tab: 'rank', page: 0, me: null, ranked: new Set(), restShown: false, seq: 0 };
  const getTok = () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } };
  const setTok = t => { try { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); } catch { /* storage unavailable */ } };
  async function central(path, method = 'GET', body) {
    const headers = { 'Content-Type': 'application/json' }, tok = getTok();
    if (tok) headers.Authorization = `Bearer ${tok}`;
    let res;
    try { res = await fetch(CENTRAL + path, { method, headers, body: body ? JSON.stringify(body) : undefined }); }
    catch { throw new Error('サーバーに接続できません。ネットワークを確認してください。'); }
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && tok) { setTok(null); share.me = null; renderAuth(); }
    if (!res.ok) throw new Error(data.error ?? `エラー (${res.status})`);
    return data;
  }
  const sNote = (t, warn) => { const n = $('#shNote'); n.textContent = t; n.style.color = warn ? 'var(--warn)' : ''; };
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  const close = () => { box.hidden = true; };

  function renderAuth() {
    const a = $('#shAuth'); a.innerHTML = '';
    if (share.me) {
      const out = el('button', '', 'ログアウト');
      out.onclick = () => { setTok(null); share.me = null; renderAuth(); loadShare(); };
      a.append(el('span', 'who', `ログイン中：${share.me.name}`), out);
      return;
    }
    const mail = el('input'); mail.type = 'email'; mail.placeholder = 'メールアドレス'; mail.autocomplete = 'username';
    const pass = el('input'); pass.type = 'password'; pass.placeholder = 'パスワード'; pass.autocomplete = 'current-password';
    const go = el('button', 'acc', 'ログイン');
    go.onclick = async () => {
      try { const r = await central('/api/login', 'POST', { email: mail.value, password: pass.value }); setTok(r.token); await loadMe(); await loadShare(); sNote('ログインしました。'); }
      catch (e) { sNote(e.message, true); }
    };
    pass.onkeydown = e => { if (e.key === 'Enter') go.click(); };
    const reg = el('a', 'hint', 'アカウントを作る'); reg.href = CENTRAL + '/'; reg.target = '_blank'; reg.rel = 'noopener';
    a.append(mail, pass, go, reg);
  }
  async function loadMe() {
    if (!getTok()) { share.me = null; renderAuth(); return; }
    try { share.me = (await central('/api/me')).user; } catch { share.me = null; }
    renderAuth();
  }
  // この 12 か月（日本時間。サーバーのランキングと同じ区切り）
  function fillMonths() {
    const sel = $('#shMonth');
    if (sel.options.length) return;
    const now = new Date(Date.now() + 9 * 3600_000);
    for (let i = 0; i < 12; i++) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      sel.add(new Option(i === 0 ? `今月（${d.getUTCMonth() + 1}月）` : `${d.getUTCFullYear()}年${d.getUTCMonth() + 1}月`, `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`));
    }
    sel.onchange = () => setTab('rank');
  }
  function setTab(tab) {
    share.tab = tab;
    box.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
    return loadShare();
  }
  box.querySelectorAll('[data-tab]').forEach(b => { b.onclick = () => setTab(b.dataset.tab); });

  async function loadShare(append = false) {
    const grid = $('#shGrid');
    if (!append) { share.page = 0; grid.innerHTML = ''; }
    $('#shMore').hidden = true;
    if (share.tab === 'mine' && !share.me) { sNote('自分の機体を見るにはログインしてください。'); return; }
    sNote('読み込み中…');
    // （読み込みの途中でタブを替えたら、前の読み込みの結果は捨てる：同じ機体が 2 回並ばない）
    const seq = ++share.seq, late = () => seq !== share.seq;
    try {
      if (share.tab === 'rank') {
        // ランキングに出るのは、その月にイイネの付いた機体だけ。今月は、その後ろにほかの機体を新しい順で続ける（イイネの無い機体も見つけられる）
        const thisMonth = $('#shMonth').selectedIndex === 0;
        if (!append) {
          const r = await central(`/api/models/ranking?month=${$('#shMonth').value}`);
          if (late()) return;
          for (const m of r.models) grid.appendChild(card(m));
          share.ranked = new Set(r.models.map(m => m.id)); share.restShown = false;
          if (!thisMonth) { sNote(r.models.length ? '' : 'この月のイイネはありません。'); return; }
        }
        const n = await central(`/api/models?sort=new&page=${share.page}`);
        if (late()) return;
        const rest = n.models.filter(m => !share.ranked.has(m.id));
        if (rest.length && !share.restShown) { grid.appendChild(el('div', 'sep', share.ranked.size ? 'ランキング外の機体（新しい順）' : '今月はまだイイネがありません。新しい順に並べています')); share.restShown = true; }
        for (const m of rest) grid.appendChild(card(m));
        $('#shMore').hidden = !n.more;
        sNote(grid.children.length ? '' : 'まだ機体がありません。');
        return;
      }
      const r = await central(`/api/models?sort=${share.tab === 'likes' ? 'likes' : 'new'}&page=${share.page}${share.tab === 'mine' ? '&mine=1' : ''}`);
      if (late()) return;
      for (const m of r.models) grid.appendChild(card(m));
      $('#shMore').hidden = !r.more;
      sNote(r.models.length || append ? '' : 'まだ機体がありません。');
    } catch (e) { if (late()) return; sNote(e.message === '見つかりません。' ? 'みんなの機体は準備中です（サーバーがまだ対応していません）。' : e.message, true); }
  }
  $('#shMore').onclick = () => { share.page++; loadShare(true); };

  /** 今の機体を投稿できるか調べる：できなければ理由を出して null、できれば送る中身 */
  async function ready(what) {
    if (!share.me) { sNote(`${what}するにはログインしてください。`, true); return null; }
    if (ctx.busy()) { sNote('パーツエディタを閉じてから、もう一度押してください。', true); return null; }
    const why = ctx.problem();
    if (why) { sNote(why, true); return null; }
    const out = $('#shCheck'); out.hidden = false; out.style.color = ''; out.textContent = 'つながりと関節を調べています…（10〜20 秒）';
    await new Promise(r => setTimeout(r, 30));
    let c;
    try { c = await ctx.check(); } catch (e) { out.textContent = '調べられませんでした：' + (e?.message ?? e); out.style.color = 'var(--warn)'; return null; }
    out.textContent = c.text; out.style.color = c.ok ? '' : 'var(--warn)';
    if (!c.ok) { sNote(`つながりチェックと関節チェックの両方が OK になってから${what}してください。`, true); return null; }
    return { unit: ctx.doc(), ai: $('#shAi').value.trim().slice(0, 40), role: ctx.role(), thumb: ctx.thumb() };
  }

  function card(m) {
    const c = el('div', 'card'), th = el('div', 'th'), img = el('img');
    img.alt = ''; img.loading = 'lazy'; img.src = `${CENTRAL}/api/models/${encodeURIComponent(m.id)}/thumb?v=${m.updated_at}`;
    th.appendChild(img);
    if (m.rank) th.appendChild(el('span', 'rank', String(m.rank)));
    c.append(th, el('div', 'nm', m.title));
    c.appendChild(el('div', 'meta', `${m.author} ・ ${new Date(m.created_at).toLocaleDateString('ja-JP')} ・ ${m.part_count} 部品` + (ctx.kinds[m.role] ? ` ・ ${ctx.kinds[m.role]}` : '') + (m.month_likes ? ` ・ この月 ${m.month_likes} イイネ` : '')));
    if (m.ai) c.appendChild(el('div', 'meta', `AI: ${m.ai}`));
    if (m.hidden) c.appendChild(el('div', 'meta warn', '通報により非表示中（管理者が確認します）'));
    const btns = el('div', 'btns');
    const button = (label, fn, cls) => { const b = el('button', cls || '', label); b.onclick = fn; btns.appendChild(b); return b; };
    button('開く', () => openShared(m), 'acc');
    const heart = button(`♥ ${m.like_count}`, async () => {
      if (!share.me) { sNote('イイネするにはログインしてください。', true); return; }
      try {
        const r = await central(`/api/models/${m.id}/like`, m.liked ? 'DELETE' : 'POST');
        m.liked = r.liked; m.like_count = r.likes;
        heart.textContent = `♥ ${m.like_count}`; heart.classList.toggle('liked', m.liked);
      } catch (e) { sNote(e.message, true); }
    }, m.liked ? 'liked' : '');
    if (m.mine) {
      heart.disabled = true; heart.title = '自分の機体にはイイネできません';
      button('上書き', async () => {
        const body = await ready('上書き');
        if (!body || !confirm(`「${m.title}」を今の機体で上書きしますか？`)) return;
        try { await central(`/api/models/${m.id}`, 'PUT', body); await loadShare(); sNote(`「${m.title}」を上書きしました。`); }
        catch (e) { sNote(OLD_SERVER.test(e.message) ? 'サーバーが、機体エディタ Ver2 の機体の投稿にまだ対応していません（サーバーの更新待ち）。' : e.message, true); }
      });
      button('削除', async () => {
        if (!confirm(`「${m.title}」を削除しますか？\n集まったイイネも消えます。元に戻せません。`)) return;
        try { await central(`/api/models/${m.id}`, 'DELETE'); c.remove(); sNote(`「${m.title}」を削除しました。`); }
        catch (e) { sNote(e.message, true); }
      });
    } else button('通報', async () => {
      if (!share.me) { sNote('通報するにはログインしてください。', true); return; }
      const reason = prompt(`「${m.title}」を通報します。理由を書いてください（原作の固有名詞、ふさわしくない形 など）`);
      if (reason === null) return;
      try { await central(`/api/models/${m.id}/report`, 'POST', { reason }); sNote('通報しました。ありがとうございます。'); }
      catch (e) { sNote(e.message, true); }
    });
    c.appendChild(btns);
    return c;
  }

  async function openShared(m) {
    if (ctx.busy()) { sNote('パーツエディタを閉じてから、もう一度押してください。', true); return; }
    try {
      const r = await central(`/api/models/${m.id}`);
      if (!ctx.okToLeave(`「${m.title}」を開きます`)) return;
      if (r.unit) ctx.openUnit(r.unit, m.title);
      else if (Array.isArray(r.scene)) ctx.openScene(r.scene, m.title, r.model?.role ?? '', r.model?.ai ?? '');
      else throw new Error('この機体は開けません（形が分かりません）。');
      close();
    } catch (e) { sNote(e.message, true); }
  }

  $('#shUpload').onclick = async () => {
    const title = $('#shTitle').value.trim();
    if (!title) { sNote('機体名を入れてください。', true); return; }
    const body = await ready('投稿');
    if (!body || !confirm(`「${title}」を公開します。\nだれでも見られるようになります。よろしいですか？`)) return;
    try {
      await central('/api/models', 'POST', { title, ...body });
      $('#shTitle').value = '';
      await setTab('mine');
      sNote(`「${title}」を投稿しました。`);
    } catch (e) { sNote(OLD_SERVER.test(e.message) ? 'サーバーが、機体エディタ Ver2 の機体の投稿にまだ対応していません（サーバーの更新待ち）。' : e.message, true); }
  };
  $('#shClose').onclick = close;
  box.addEventListener('pointerdown', e => { if (e.target === box) close(); });
  addEventListener('keydown', e => { if (e.key === 'Escape' && !box.hidden) { e.stopPropagation(); close(); } }, true);

  return {
    async open() {
      box.hidden = false; fillMonths(); sNote(''); $('#shCheck').hidden = true;
      if (!$('#shTitle').value) $('#shTitle').value = ctx.name().slice(0, 40);
      await loadMe();
      await loadShare();
    },
    active: () => !box.hidden,
    central: CENTRAL,
  };
}
