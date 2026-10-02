// 「AI で作る」：チャット AI に機体を作ってもらう画面（7 段階）。1 文章か画像か → 2 使う AI → 3 頼み方をコピー → 4 AI に送る（見本の動き）→
// 5 答えを貼る → 6 チラ見（読み込む前に見る）→ 7 確かめる（つながり・関節）→「この機体にする」で、はじめて機体になる。
// 確かめて問題があれば、直してもらう文章（結果と今の機体の JSON）をコピーして同じ会話に貼り、返ってきた答えを貼るとすぐ確かめ直す。
// 機体エディタ 1（index.html）の同じ画面を移したもの（段階・文言・見本の動き・答えの読み取りは同じ。tools/_genai.py が 1 回だけ写した）。
// AI の機体は「この機体にする」まで候補のままで、今の機体には触らない：チラ見と確かめるは xsengine.js が候補を直接見る。
// 「パーツ 1 つ」も作れる（1 で選ぶ）：部位を決めて、その部位用の頼み方（仕様 ai-part.md と、収める範囲・つなぎ目・部位ごとの決まり）を渡し、
// 返ってきたブロックを自分のパーツ（★）としてカタログに入れる。機体は変えない。
// ctx（v2.js が渡す）：{ take(list, name, role, ai) 候補を機体にする（今の機体を置き換える前の確認も）, busy(),
//   partSlots() 部位の選択肢 [{ group, cat, id }], partInfo(id) → { cat, text 頼み方に入れる文章, box { lo, hi } },
//   partView(list, id) → [{ geo, color, metal, rough, glow }], partCheck(list, id) → { ok, text }, takePart(list, name, id, ai) }
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { XS, ROLES } from './xsengine.js';
import { AiTextError, parseAiText, checkAiParts, modelJson } from './aiparts.js';

const AI_CSS = `
#aiBox { --accent: #f0a93b; --panel2: #252a33; position: fixed; inset: 0; background: rgba(0,0,0,.6); display: grid; place-items: center; z-index: 25; padding: 16px; }
#aiBox[hidden] { display: none; }
#aiBox .gbox { width: min(900px, 100%); min-height: min(640px, 88vh); max-height: 92vh; overflow-y: auto; background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 24px 28px; }
#aiBox .ghead { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
#aiBox .ghead h1 { margin: 0; font-size: 20px; }
#aiBox button, #aiBox a.abtn { font-size: 15px; padding: 10px 12px; }
#aiBox #aClose { font-size: 13px; padding: 6px 10px; }
#aiBox .seg { display: flex; gap: 4px; margin: 6px 0; }
#aiBox .seg button { flex: 1; }
#aiBox .seg button.on, #aiBox .stcard.on { border-color: var(--accent); }
#aiBox .seg button.on { background: var(--accent); color: #1a1a1a; font-weight: 600; }
#aiBox .stgrid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 10px; margin: 8px 0 0; }
#aiBox .stcard { display: flex; flex-direction: column; gap: 6px; text-align: left; background: var(--panel2); border: 1px solid var(--line); border-radius: 10px; padding: 20px; white-space: normal; }
#aiBox button.stcard:hover:not(:disabled) { border-color: var(--accent); }
#aiBox .stcard b { font-size: 18px; }
#aiBox .stcard span { color: var(--dim); font-size: 14px; }
#aiBox h2 { font-size: 17px; margin: 18px 0 8px; color: var(--text); letter-spacing: .02em; }
#aiBox .hint { font-size: 15px; margin: 10px 0; white-space: pre-line; }
#aiBox .hint select { width: auto; font-size: 14px; }
#aiBox .hint span { font-size: 12.5px; }
#aiBox textarea { width: 100%; background: var(--panel2); color: var(--text); border: 1px solid var(--line); border-radius: 5px; padding: 6px; font: 14px/1.4 ui-monospace, Consolas, monospace; resize: vertical; }
#aiBox .astep[hidden] { display: none; }
#aNav { display: flex; gap: 6px; margin: 4px 0 16px; }
#aiBox #aNav button { flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px; font-size: 15px;
  background: transparent; border: none; border-bottom: 3px solid var(--line); border-radius: 0; color: var(--dim); padding: 10px 4px; }
#aNav button b { width: 24px; height: 24px; border-radius: 50%; display: grid; place-items: center; font-size: 13px; background: var(--panel2); flex: none; }
#aNav button.done { color: var(--text); border-bottom-color: #7ee2a8; }
#aNav button.done b { background: #2f5a45; color: #b8f5d2; }
#aNav button.cur { color: var(--accent); border-bottom-color: var(--accent); font-weight: 600; }
#aNav button.cur b { background: var(--accent); color: #1a1a1a; }
#aNav button:disabled { opacity: 1; cursor: default; }
#aNav button span { white-space: nowrap; }
#aNav button[hidden] { display: none; }
@media (max-width: 760px) { #aNav button:not(.cur) span { display: none; } #aNav button.cur { flex: 4; } #aiBox .gbox { padding: 16px; } }
#aPeek { position: relative; height: min(52vh, 460px); border-radius: 10px; overflow: hidden; background: #0b0d11; margin-top: 8px; }
#aPeek canvas { display: block; width: 100%; height: 100%; touch-action: none; }
#aPeek .apeekbar { position: absolute; left: 10px; right: 10px; top: 10px; display: flex; gap: 12px; align-items: center; justify-content: space-between; color: var(--dim); font-size: 13px; pointer-events: none; }
#aPeek .apeekbar label { pointer-events: auto; color: var(--text); display: flex; gap: 6px; align-items: center; white-space: nowrap; }
#aPeek select { width: auto; font-size: 14px; }
#aiBox .seg[hidden], #aiBox .seg button[hidden] { display: none; }
#aiBox .askip { justify-content: flex-end; }
#aReopen a { color: var(--accent); }
#aiBox.aside { place-items: center start; }
#aiBox.aside #aNav button:not(.cur) span { display: none; }
#aiBox.aside #aNav button.cur { flex: 4; }
#aiBox .askip button { flex: none; font-size: 13px; padding: 6px 14px; }
#aWhich { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 8px 0; }
#aWhich .stcard { align-items: center; text-align: center; justify-content: center; min-height: 72px; }
.ademo svg { display: block; width: 100%; max-height: 260px; background: #0b0d11; border-radius: 10px; margin-top: 10px; }
#aiBox .acap { color: var(--accent); font-size: 17px; font-weight: 600; min-height: 1.4em; text-align: center; margin: 12px 0 0; }
#aiBox .anote { color: var(--text); }
#aiBox .aafter .abtn { font-size: 17px; padding: 12px 18px; }
#aiBox a.abtn { display: inline-block; text-align: center; background: var(--accent); color: #1a1a1a; border-radius: 6px; padding: 10px 18px; text-decoration: none; font-weight: 600; }
#aiBox a.abtn[hidden] { display: none; }
#aMsg.ng, #aAskMsg.ng, #aCheckMsg.ng { color: #ff9b9b; }
#aMsg.ok, #aAskMsg.ok, #aCheckMsg.ok, #aSendNote.ok { color: #7ee2a8; }
`;
const AI_HTML = `<div id="aiBox" hidden>
  <div class="gbox">
    <div class="ghead"><h1 id="aTitle">AIで作る</h1><button id="aClose">閉じる Esc</button></div>
    <nav id="aNav"><button><b>1</b><span>作り方</span></button><button><b>2</b><span>使う AI</span></button><button><b>3</b><span>頼み方</span></button><button><b>4</b><span>AI に送る</span></button><button><b>5</b><span>答えを貼る</span></button><button><b>6</b><span>チラ見</span></button><button><b>7</b><span>確かめる</span></button></nav>
    <section class="astep">
      <h2>1. 何を作りますか？</h2>
      <div class="seg" id="aWhat"><button data-what="unit" class="on">機体まるごと</button><button data-what="part">パーツ 1 つ</button></div>
      <p class="hint" id="aSlotRow" hidden><label>部位 <select id="aSlot"></select></label> <span>（できたパーツは、カタログのその部位に ★ で入ります。今の機体は変わりません）</span></p>
      <h2 class="asub">どうやって作りますか？</h2>
      <div class="stgrid" id="aMode">
        <button class="stcard" data-mode="text"><b>文章で作る</b><span>作りたい機体を言葉で伝えて、AI に作ってもらいます</span></button>
        <button class="stcard" data-mode="image"><b>画像で作る</b><span>絵や写真を AI に見せて、似た機体を作ってもらいます</span></button>
      </div>
    </section>
    <section class="astep" hidden>
      <h2>2. どの AI を使いますか？</h2>
      <div id="aWhich"><button class="stcard" data-ai="chatgpt"><b>ChatGPT</b></button><button class="stcard" data-ai="claude"><b>Claude</b></button><button class="stcard" data-ai="deepseek"><b>DeepSeek</b></button><button class="stcard" data-ai="gemini"><b>Gemini</b></button><button class="stcard" data-ai="grok"><b>Grok</b></button><button class="stcard" data-ai="other"><b>そのほか</b><span>新しいタブを開くだけです</span></button></div>
    </section>
    <section class="astep" hidden>
      <h2>3. 頼み方をコピーする</h2>
      <p class="hint" id="aWishLabel"></p>
      <textarea id="aWish" rows="3"></textarea>
      <p class="hint" id="aRoleRow"><label>用途 <select id="aRole"></select></label> <span>（決めておくと、その用途に要るもの（狙撃銃・大砲など）も頼み、確かめるときはその機体に起こる動きだけを調べます）</span></p>
      <div class="seg"><button id="aCopyFull" class="on">頼み方をコピー</button></div>
      <textarea id="aManual" rows="6" readonly hidden></textarea>
      <div id="aAskMsg" class="hint"></div>
      <div class="seg" id="aManualNext" hidden><button id="aManualGo" class="on">コピーしたら 次へ</button></div>
    </section>
    <section class="astep" hidden>
      <h2>4. AI に送る</h2>
      <p class="hint" id="aSendNote"></p>
      <div id="aSend">
        <p class="hint acap"></p>
        <div class="ademo"></div>
        <div class="seg askip"><button id="aSkip" hidden>見本をとばす</button></div>
        <div class="aafter" hidden>
          <p class="hint anote"></p>
          <div class="seg"><a class="abtn" target="_blank" rel="noopener"></a><button class="areplay">もう一度見る</button><button id="aGo5" class="on anext">AI が答えたら 次へ</button></div>
        </div>
      </div>
    </section>
    <section class="astep" hidden>
      <h2>5. AI の答えを貼り付ける</h2>
      <p class="hint">AI の答えをまるごとコピーしてから、</p>
      <div class="seg" id="aReadRow"><button id="aRead" class="on">コピーした答えを貼る</button></div>
      <p class="hint" id="aOrPaste">または、下の欄に貼り付けてください。</p>
      <textarea id="aJson" rows="5" placeholder="AI の答えをまるごと貼り付けてください"></textarea>
      <div class="seg"><button id="aLoad">読み込む</button></div>
      <div id="aMsg" class="hint"></div>
      <p class="hint" id="aReopen" hidden>AI の画面を閉じてしまったときは： <a target="_blank" rel="noopener"></a></p>
      <div class="seg"><button id="aErrOpen" class="on" hidden></button><button id="aErrOn" hidden>このまま次へ</button></div>
    </section>
    <section class="astep" hidden>
      <h2 id="aPeekHead">6. チラ見 ― AI が作った機体を見てみる</h2>
      <div id="aPeek"><div class="apeekbar"><label>ポーズ <select id="aPeekPose"></select></label><span>ドラッグで回す ・ ホイールで拡大</span></div></div>
      <p class="hint" id="aPeekNote"></p>
      <div class="seg"><button id="aGo7" class="on">次へ（確かめる）</button></div>
    </section>
    <section class="astep" hidden>
      <h2>7. ちゃんと組み立てられているか確かめる</h2>
      <p class="hint" id="aCheckNote">まだ読み込んではいません。確かめてから、この機体にするかを決めます。</p>
      <div class="seg"><button id="aCheck" class="on">確かめる</button></div>
      <div id="aCheckMsg" class="hint"></div>
      <div class="seg" id="aUseRow" hidden><button id="aAttach" hidden>離れている部品をくっつける</button><button id="aFixOpen" hidden></button><button id="aUse" class="on">この機体にする</button></div>
    </section>
  </div>
</div>`;

export function initAi(ctx) {
  const st = document.createElement('style'); st.textContent = AI_CSS; document.head.appendChild(st);
  const holder = document.createElement('div'); holder.innerHTML = AI_HTML; document.body.appendChild(holder.firstElementChild);
  const $ = s => document.querySelector(s);
  // ai.md lives next to the page; a local copy (localhost / file) points the AI at the public one it can reach
  const SPEC_URL = /^(localhost|127\.|\[::1\])/.test(location.hostname) || location.protocol === 'file:'
    ? 'https://n416.github.io/xs-editor/ai.md' : new URL('ai.md', location.href).href;
  // 用途（3 で選ぶ）：頼み方に入り、確かめるときの動きを決める。'' = 未定（全部の動きを調べる）
  $('#aRole').innerHTML = '<option value="">未定（全部の動きを調べる）</option>' + Object.entries(ROLES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
  const aiRole = () => $('#aRole').value;
  const checkId = () => (aiRole() ? `a_${aiRole()}` : '');
  // 何を作るか：'unit' 機体まるごと ／ 'part' パーツ 1 つ（aiSlot：その部位のひな形のパーツの id）
  let aiWhat = 'unit', aiSlot = '';
  const isPart = () => aiWhat === 'part';
  {
    const groups = {};
    for (const s of ctx.partSlots()) (groups[s.group] ||= []).push(s);
    $('#aSlot').innerHTML = '<option value="">部位を選ぶ…</option>' + Object.entries(groups).map(([g, list]) => `<optgroup label="${g}">${list.map(s => `<option value="${s.id}">${s.cat}</option>`).join('')}</optgroup>`).join('');
  }
  function setWhat(what, slot = aiSlot) {
    const changed = what !== aiWhat || slot !== aiSlot;
    aiWhat = what; aiSlot = slot;
    for (const b of $('#aWhat').children) b.classList.toggle('on', b.dataset.what === what);
    $('#aSlotRow').hidden = what !== 'part'; $('#aSlot').value = slot;
    $('#aRoleRow').hidden = what === 'part';
    const tip = $('#aSlotRow span'); tip.style.color = '';
    tip.textContent = slot ? '（できたパーツは、カタログのその部位に ★ で入ります。今の機体は変わりません）' : '（頼める部位：上半身・腕・下半身・脚の装甲。頭・背中・関節そのものは、まだ頼めません）';
    const [mt, mi] = [...$('#aMode').children].map(b => b.querySelector('span'));
    mt.textContent = what === 'part' ? '作りたいパーツを言葉で伝えて、AI に作ってもらいます' : '作りたい機体を言葉で伝えて、AI に作ってもらいます';
    mi.textContent = what === 'part' ? '絵や写真を AI に見せて、その部分に似たパーツを作ってもらいます' : '絵や写真を AI に見せて、似た機体を作ってもらいます';
    $('#aPeekHead').textContent = `${aiPasteOnly ? 2 : 6}. チラ見 ― AI が作った${what === 'part' ? 'パーツ' : '機体'}を見てみる`;
    $('#aPeekHead').dataset.t = `6. チラ見 ― AI が作った${what === 'part' ? 'パーツ' : '機体'}を見てみる`;
    if (changed) { aiCandidate = null; aiReached = 1; resetAsk(); loadSpec(); showStep(1); }
  }

  async function copyText(t) {
    try { await navigator.clipboard.writeText(t); return true; } catch {
      const ta = document.createElement('textarea');
      ta.value = t; document.body.appendChild(ta); ta.select();
      let ok = false; try { ok = document.execCommand('copy'); } catch { /* no clipboard */ }
      ta.remove(); return ok;
    }
  }
  const say = (el, text, cls = '') => { const e = $(el); e.textContent = text; e.className = 'hint' + (cls ? ' ' + cls : ''); };
  // 1 starts with a choice: made from words, or from a picture the user pastes into the AI next to the request
  // Seven steps, one on screen at a time, with a navigator on top: 1 made from words or from a picture, 2 which
  // chat AI, 3 copying the request, 4 sending it in that AI (an animated example, then the button that opens it),
  // 5 pasting the answer, 6 a look at the model (チラ見), 7 checking it; only この機体にする there loads it.
  // そのほか only opens an empty tab to go to the AI from
  const AI_SERVICES = { chatgpt: ['ChatGPT', 'https://chatgpt.com/'], claude: ['Claude', 'https://claude.ai/new'],
    deepseek: ['DeepSeek', 'https://chat.deepseek.com/'], gemini: ['Gemini', 'https://gemini.google.com/app'],
    grok: ['Grok', 'https://grok.com/'], other: ['使っている AI', 'about:blank'] };
  const AI_SERVICE_KEY = 'xs-part-editor-ai-service';
  let aiMode = null, aiService = (() => { try { return localStorage.getItem(AI_SERVICE_KEY); } catch { return null; } })();
  if (!(aiService in AI_SERVICES)) aiService = null;
  const byImage = () => aiMode === 'image';
  const PHONE = /iPhone|iPad|Android/.test(navigator.userAgent);
  // The example of what to do in the chat AI: a plain chat window (no real service's look). On a computer the
  // picture is dragged in and the text pasted from the right-click menu; on a phone the picture comes from the ＋
  // button and the text is pasted by a long press. The button that opens the AI comes after it: a browser only
  // opens a tab straight from a click, not when an animation ends.
  const PIC = (x, y, w, h, c1 = '#f0a93b', c2 = '#6fb3d9') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="#3a4250"/>`
    + `<circle cx="${x + w * .25}" cy="${y + h * .3}" r="${h * .1}" fill="${c1}"/>`
    + `<path d="M${x + 3} ${y + h - 3} L${x + w * .4} ${y + h * .45} L${x + w * .6} ${y + h * .7} L${x + w * .75} ${y + h * .58} L${x + w - 3} ${y + h - 3} Z" fill="${c2}"/>`;
  const DEMO_SVG = `<svg viewBox="${PHONE ? '160 0 400 250' : '0 0 560 250'}" role="img" aria-label="チャット AI での操作の見本">
    <g class="dFile">${PIC(30, 70, 84, 66)}<text x="72" y="156" font-size="11" fill="#b9c1cc" text-anchor="middle">機体の画像</text></g>
    <rect x="170" y="10" width="380" height="232" rx="12" fill="#101318" stroke="#3a4250"/>
    <circle cx="188" cy="24" r="4" fill="#3a4250"/><circle cx="202" cy="24" r="4" fill="#3a4250"/><circle cx="216" cy="24" r="4" fill="#3a4250"/>
    <text x="360" y="28" font-size="11" fill="#6c7584" text-anchor="middle">チャット AI の画面</text>
    <g class="dBubble" opacity="0"><rect x="300" y="48" width="236" height="96" rx="12" fill="#2b3340"/>
      <g class="dBubbleImg">${PIC(312, 58, 52, 40)}</g>
      <rect x="312" y="106" width="210" height="8" rx="4" fill="#5c6778"/><rect x="312" y="122" width="170" height="8" rx="4" fill="#5c6778"/></g>
    <rect x="185" y="190" width="350" height="38" rx="19" fill="#1d2128" stroke="#4a5260"/>
    <circle cx="205" cy="209" r="11" fill="#2b3340"/><path d="M205 203 V215 M199 209 H211" stroke="#b9c1cc" stroke-width="2" stroke-linecap="round"/>
    <text class="dPh" x="224" y="214" font-size="13" fill="#6c7584">メッセージを入力</text>
    <g class="dChip" opacity="0">${PIC(222, 196, 34, 26)}</g>
    <text class="dText" x="224" y="214" font-size="13" fill="#e3e7ee" opacity="0">XS部品エディタ用の人型ロボット（XS）の…</text>
    <circle class="dSend" cx="515" cy="209" r="13" fill="#4a5260"/><path d="M515 216 V203 M509 208 L515 202 L521 208" stroke="#e3e7ee" stroke-width="2.2" fill="none" stroke-linecap="round"/>
    <g class="dPick" opacity="0"><rect x="185" y="92" width="200" height="90" rx="10" fill="#1d2128" stroke="#4a5260"/>
      <text x="200" y="112" font-size="12" fill="#b9c1cc">写真を選ぶ</text>${PIC(200, 122, 50, 46)}${PIC(258, 122, 50, 46, '#4a5260', '#4a5260')}</g>
    <g class="dMenu" opacity="0"><rect x="330" y="92" width="130" height="94" rx="8" fill="#252a33" stroke="#4a5260"/>
      <text x="344" y="112" font-size="12" fill="#6c7584">元に戻す</text><text x="344" y="134" font-size="12" fill="#e3e7ee">切り取り</text>
      <text x="344" y="156" font-size="12" fill="#e3e7ee">コピー</text>
      <rect class="dMenuHi" x="334" y="164" width="122" height="20" rx="4" fill="#f0a93b" opacity="0"/><text x="344" y="178" font-size="12" fill="#e3e7ee">貼り付け</text></g>
    <g class="dPaste" opacity="0"><rect x="290" y="142" width="100" height="32" rx="8" fill="#252a33" stroke="#4a5260"/>
      <text x="340" y="163" font-size="14" fill="#e3e7ee" text-anchor="middle">ペースト</text></g>
    <circle class="dRing" cx="0" cy="0" r="14" fill="none" stroke="#f0a93b" stroke-width="3" opacity="0"/>
    <g class="dCursor">${PHONE ? '<circle r="11" fill="rgba(255,255,255,.55)" stroke="#fff" stroke-width="2"/>'
      : '<path d="M0 0 L0 20 L5 15 L9 24 L13 22 L9 13 L16 13 Z" fill="#fff" stroke="#111" stroke-width="1.2"/>'}</g>
  </svg>`;
  let demoRun = 0;
  async function playDemo(withImage) {
    const box = $('#aSend');
    const run = ++demoRun, live = () => run === demoRun && aiStep === 4 && !$('#aiBox').hidden;
    const stage = box.querySelector('.ademo');
    stage.innerHTML = DEMO_SVG;
    const g = c => stage.querySelector('.' + c), cur = g('dCursor');
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const anim = (el, kf, ms) => el.animate(kf, { duration: ms, fill: 'forwards', easing: 'ease-in-out' }).finished;
    const at = (x, y) => `translate(${x}px, ${y}px)`;
    let cx = 150, cy = 230;
    const move = async (x, y, ms, extra = []) => {
      const from = at(cx, cy); cx = x; cy = y;
      await Promise.all([anim(cur, [{ transform: from }, { transform: at(x, y) }], ms),
        ...extra.map(([el, dx, dy]) => anim(el, [{ transform: 'translate(0px, 0px)' }, { transform: at(dx, dy) }], ms))]);
    };
    const tap = (ms = 380) => anim(g('dRing'), [{ transform: `${at(cx, cy)} scale(.3)`, opacity: 1 }, { transform: `${at(cx, cy)} scale(1.4)`, opacity: 0 }], ms);
    const cap = t => { box.querySelector('.acap').textContent = t; };
    const show = (el, on, ms = 250) => anim(el, [{ opacity: on ? 0 : 1 }, { opacity: on ? 1 : 0 }], ms);
    box.querySelector('.aafter').hidden = true;
    $('#aSkip').hidden = false;
    g('dFile').style.display = withImage && !PHONE ? '' : 'none';
    g('dBubbleImg').style.display = withImage ? '' : 'none';
    cur.style.transform = at(cx, cy);
    const afterChip = () => { g('dText').setAttribute('x', 264); g('dPh').setAttribute('x', 264); };
    let n = 1;
    if (withImage && PHONE) {
      cap(`${n++}. 入力欄の「＋」を押して、機体の画像を選ぶ`);
      await move(205, 209, 800); if (!live()) return;
      await tap(); await show(g('dPick'), true); await wait(400); if (!live()) return;
      await move(225, 145, 700); if (!live()) return;
      await tap(); await Promise.all([show(g('dPick'), false, 200), show(g('dChip'), true)]); afterChip();
      await wait(700); if (!live()) return;
    } else if (withImage) {
      cap(`${n++}. 機体の画像を、チャット AI の画面にドラッグ＆ドロップする`);
      await move(70, 100, 700); if (!live()) return;
      await wait(250);
      await move(252, 205, 1300, [[g('dFile'), 182, 105]]); if (!live()) return;
      await Promise.all([show(g('dFile'), false, 200), show(g('dChip'), true)]); afterChip();
      await wait(700); if (!live()) return;
    }
    if (PHONE) {
      cap(`${n++}. 入力欄を長押しして、「ペースト」を押す`);
      await move(340, 212, 800); if (!live()) return;
      await tap(1100); await show(g('dPaste'), true, 200); await wait(300); if (!live()) return;
      await move(340, 160, 500); if (!live()) return;
      await tap(); await Promise.all([show(g('dPaste'), false, 150), show(g('dPh'), false, 150), show(g('dText'), true, 300)]);
    } else {
      cap(`${n++}. 入力欄を右クリックして、「貼り付け」を選ぶ`);
      await move(335, 212, 800); if (!live()) return;
      await tap(); await show(g('dMenu'), true, 200); await wait(400); if (!live()) return;
      await move(372, 176, 600); if (!live()) return;
      await show(g('dMenuHi'), true, 150); await wait(250); await tap();
      await Promise.all([show(g('dMenu'), false, 150), show(g('dPh'), false, 150), show(g('dText'), true, 300)]);
    }
    await wait(900); if (!live()) return;
    cap(`${n++}. 送信ボタンを押す`);
    await move(515, 209, 900); if (!live()) return;
    await tap();
    g('dSend').setAttribute('fill', '#f0a93b');
    await Promise.all([show(g('dText'), false, 200), show(g('dChip'), false, 200), show(g('dBubble'), true, 400)]);
    await wait(900); if (!live()) return;
    demoDone();
  }
  // the end of the example, reached by watching it or by とばす
  function demoDone() {
    demoRun++;
    $('#aSend .acap').textContent = '';
    $('#aSkip').hidden = true;
    $('#aSend .aafter').hidden = false;
    $('#aSend .aafter').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  // step 4, after anything was copied for the AI: the example, then the button that opens the chosen AI; "the AI
  // answered" appears once that button has been used. Going on to 5 clears the previous answer.
  let sendImage = false;
  // On a computer the AI opens in a window of its own on the right half of the screen and the dialog moves to the
  // left, so both stay in sight: a page cannot bring another tab forward later, and the AI's site cuts the link to
  // the window it opened. A phone opens a tab as usual.
  let aiSide = false;
  function openAiWindow(url) {
    if (PHONE) return false;
    const w = Math.floor(screen.availWidth / 2), h = screen.availHeight;
    const left = (screen.availLeft ?? 0) + screen.availWidth - w, top = screen.availTop ?? 0;
    window.open(url, '_blank', `popup,noopener,width=${w},height=${h},left=${left},top=${top}`);
    aiSide = true; placeAiBox();
    return true;
  }
  // the dialog keeps to the part of this window left of the screen's middle
  function placeAiBox() {
    $('#aiBox').classList.toggle('aside', aiSide);
    const room = (screen.availLeft ?? 0) + screen.availWidth / 2 - window.screenX - (window.outerWidth - window.innerWidth);
    $('#aiBox .gbox').style.width = aiSide ? `${Math.round(Math.max(360, Math.min(900, room - 32, innerWidth - 32)))}px` : '';
  }
  window.addEventListener('resize', () => { if (aiSide) placeAiBox(); });
  function showHandoff(kind, note) {
    sendImage = kind === 'ask' && byImage();
    const [name, url] = AI_SERVICES[aiService] ?? AI_SERVICES.other;
    const other = aiService === 'other' || !(aiService in AI_SERVICES);
    const box = $('#aSend'), a = box.querySelector('a.abtn');
    a.href = url; a.textContent = other ? (PHONE ? '新しいタブを開く' : '新しい窓を開く') : `${name} を開く`;
    box.querySelector('.anote').textContent = PHONE
      ? (other ? '新しいタブで使っている AI を開き、今の見本のとおりにしてください。' : `${name} が新しいタブで開きます。今の見本のとおりにしてください。`)
      : (other ? '画面の右半分に新しい窓が開きます。そこで使っている AI を開き、今の見本のとおりにしてください。'
        : `${name} が画面の右半分に開きます。今の見本のとおりにしてください。`);
    $('#aGo5').hidden = true;
    a.onclick = e => { $('#aGo5').hidden = false; if (openAiWindow(url)) e.preventDefault(); };
    say('#aSendNote', note, 'ok');
    if (kind === 'ask') { aiCandidate = null; aiFixing = false; }
    aiReached = 4;
    showStep(4);
    playDemo(sendImage);
  }
  $('#aSend .areplay').onclick = () => playDemo(sendImage);
  $('#aSkip').onclick = demoDone;
  $('#aGo5').onclick = () => {
    $('#aJson').value = ''; $('#aMsg').textContent = ''; $('#aErrOpen').hidden = $('#aErrOn').hidden = true;
    showStep(5); $('#aJson').focus();
  };

  const aSteps = [...document.querySelectorAll('#aiBox .astep')], aNav = [...$('#aNav').children];
  let aiStep = 1, aiReached = 1;
  // AI の機体は「この機体にする」まで候補（aiCandidate：{ list 部品, ai, name }）。今の機体には触らない
  let aiCandidate = null;
  let pasteHeld = null;   // 「AI の答えを貼る」だけの画面で開いたとき：{ role } 元の機体の用途
  function showStep(n) {
    aiStep = n; aiReached = Math.max(aiReached, n);
    aSteps.forEach((s, i) => { s.hidden = i + 1 !== n; });
    if (n === 6 && aiCandidate) startPeek(); else stopPeek();
    const part = aiCandidate?.what === 'part';
    if (n === 6 && !aiPasteOnly) $('#aPeekNote').textContent = part ? '水色の枠が、このパーツを収める範囲です。まだカタログには入れていません。気に入らなければ、上の「3 頼み方」から頼み直せます。' : 'まだ読み込んではいません。気に入らなければ、上の「3 頼み方」から頼み直せます。';
    if (n === 7) $('#aCheckNote').textContent = part ? 'まだカタログには入れていません。確かめてから、入れるかを決めます。' : 'まだ読み込んではいません。確かめてから、この機体にするかを決めます。';
    aNav.forEach((b, i) => {
      const k = i + 1;
      b.classList.toggle('cur', k === n); b.classList.toggle('done', k !== n && k <= aiReached);
      b.disabled = k === n || k > aiReached;
    });
  }
  aNav.forEach((b, i) => { b.onclick = () => { showStep(i + 1); if (i + 1 === 4) playDemo(sendImage); }; });
  // steps 1 and 2 are choices that move on by themselves; a different choice starts the request (3) over
  for (const b of $('#aWhat').children) b.onclick = () => setWhat(b.dataset.what);
  $('#aSlot').onchange = e => setWhat('part', e.target.value);
  for (const b of $('#aMode').children) b.onclick = () => {
    if (isPart() && !aiSlot) { $('#aSlot').focus(); $('#aSlotRow span').textContent = '← 先に、作るパーツの部位を選んでください'; $('#aSlotRow span').style.color = '#ff9b9b'; return; }
    if (aiMode !== b.dataset.mode) { aiMode = b.dataset.mode; aiReached = 2; resetAsk(); }
    for (const o of $('#aMode').children) o.classList.toggle('on', o.dataset.mode === aiMode);
    showStep(2);
  };
  for (const b of $('#aWhich').children) b.onclick = () => {
    if (aiService !== b.dataset.ai || aiReached < 3) { aiService = b.dataset.ai; aiReached = 3; resetAsk(); }
    try { localStorage.setItem(AI_SERVICE_KEY, aiService); } catch { /* storage blocked */ }
    showStep(3); $('#aWish').focus();
  };
  function resetAsk() {
    for (const o of $('#aWhich').children) o.classList.toggle('on', o.dataset.ai === aiService);   // last time's AI stays marked
    $('#aWishLabel').textContent = byImage() ? 'ひとこと添えるなら（なくてもかまいません）' : isPart() ? `どんな${partCat()}を作りたいですか？` : 'どんな機体を作りたいですか？';
    $('#aWish').placeholder = byImage() ? (isPart() ? '例：画像の肩の部分だけを' : '例：色は赤と黒に') : isPart() ? '例：大きく張り出した角ばった形。上面に放熱スリット、外側に重ねた板' : '例：肩が大きい重装型。色は緑と白。背中に大きなブースター';
    $('#aAskMsg').textContent = ''; $('#aManual').hidden = true; $('#aManualNext').hidden = true;
  }
  const asked = () => showHandoff('ask', 'コピーしました。チャット AI では、次のように操作します。');
  $('#aManualGo').onclick = asked;
  const copied = ok => ok ? 'コピーしました。' : 'コピーできませんでした（ブラウザがクリップボードを許可していません）。';

  // チラ見：候補を、この画面の中の小さな 3D で見る（マウスか指で回す）。形と姿勢は xsengine.js が出す（確かめるときと同じ関節）
  let peek = null;
  function peekShow() {
    const { group } = peek;
    for (const o of [...group.children]) { o.geometry.dispose(); o.material.dispose(); group.remove(o); }
    $('#aPeekPose').parentElement.style.display = aiCandidate.what === 'part' ? 'none' : '';
    if (aiCandidate.what === 'part') {   // パーツ：その形だけ（置く前の、パーツの中の座標）と、収める範囲の枠
      for (const v of ctx.partView(aiCandidate.list, aiCandidate.slot))
        group.add(new THREE.Mesh(v.geo, new THREE.MeshStandardMaterial({ color: v.color, metalness: (v.metal ?? 0.5) * 0.5, roughness: v.rough ?? 0.5, ...(v.glow ? { emissive: v.color, emissiveIntensity: 0.85 } : {}) })));
      const { lo, hi } = ctx.partInfo(aiCandidate.slot).box;
      const frame = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2])), new THREE.LineBasicMaterial({ color: 0x5fd8ff, transparent: true, opacity: 0.6 }));
      frame.position.set((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2);
      group.add(frame);
      return;
    }
    XS.load({ parts: aiCandidate.list, ai: aiCandidate.ai, role: aiRole() });
    const pose = $('#aPeekPose').value || '待機', n = XS.frames(pose);
    for (const v of XS.view(pose, n ? n - 1 : 0)) {
      const mat = new THREE.MeshStandardMaterial({ color: v.color, metalness: v.metal * 0.5, roughness: v.rough,
        ...(v.glow ? { emissive: v.color, emissiveIntensity: 0.85 } : {}), ...(v.opacity != null ? { transparent: true, opacity: v.opacity, depthWrite: false } : {}) });
      const m = new THREE.Mesh(v.geo, mat);
      if (v.matrix) { m.matrixAutoUpdate = false; m.matrix.copy(v.matrix); }
      group.add(m);
    }
  }
  function startPeek() {
    if (!peek) {
      const r = new THREE.WebGLRenderer({ antialias: true });
      r.setPixelRatio(Math.min(devicePixelRatio, 2));
      r.toneMapping = THREE.ACESFilmicToneMapping;
      $('#aPeek').prepend(r.domElement);
      const scene = new THREE.Scene(); scene.background = new THREE.Color(0x0b0d11);
      scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x30343c, 1.5));
      const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(3, 7, 5); scene.add(sun);
      const rim = new THREE.DirectionalLight(0x88aaff, 1.0); rim.position.set(-4, 3, -5); scene.add(rim);
      const grid = new THREE.GridHelper(10, 40, 0x39414d, 0x262b33); scene.add(grid);
      const group = new THREE.Group(); scene.add(group);
      const cam = new THREE.PerspectiveCamera(35, 1, 0.05, 100);
      const ctl = new OrbitControls(cam, r.domElement); ctl.enableDamping = true;
      peek = { r, cam, ctl, scene, group, grid, on: false, shown: null };
      for (const k of XS.poses()) $('#aPeekPose').add(new Option(k, k));
      $('#aPeekPose').onchange = () => peekShow();
    }
    const { r, cam, ctl, scene, group } = peek;
    if (peek.shown !== aiCandidate) {
      peek.shown = aiCandidate;
      $('#aPeekPose').value = '待機';
      peek.grid.visible = aiCandidate.what !== 'part';
      peekShow();
      const box = new THREE.Box3().setFromObject(group);
      if (!box.isEmpty()) {
        const c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
        cam.position.copy(c).add(new THREE.Vector3(0.55, 0.2, 1).normalize().multiplyScalar(Math.max(size.x, size.y, size.z) * 2));
        ctl.target.copy(c); ctl.update();
      }
    }
    if (peek.on) return;
    peek.on = true;
    r.setAnimationLoop(() => {
      const el = $('#aPeek'), w = el.clientWidth, h = el.clientHeight;
      if (!w || !h) return;
      const s = r.getSize(new THREE.Vector2());
      if (s.x !== w || s.y !== h) { r.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); }
      ctl.update(); r.render(scene, cam);
    });
  }
  function stopPeek() { if (peek?.on) { peek.r.setAnimationLoop(null); peek.on = false; } }
  $('#aGo7').onclick = () => {
    showStep(7);
  };
  // what a role needs from the AI's model, beyond the spec's general rules
  const ROLE_ASK = {
    sniper: '（右手に長い狙撃銃「狙撃銃」、頭に大きなセンサー）',
    artillery: '（足の代わりに左右の「キャタピラ」と車体。肩に「大砲の付け根」と「大砲」2 本。上半身は車体の上で一回転する）',
    artillery_leg: '（肩に「大砲の付け根」と「大砲」2 本。迫撃では右ひざをつき、砲身を真上近くまで上げる）',
  };
  const partCat = () => (aiSlot ? ctx.partInfo(aiSlot).cat : 'パーツ');
  const partAsk = spec => `XS部品エディタ用の、人型ロボット（XS）のパーツのデータを作ってください。\n${spec}\n\n## 今回作るパーツ\n\n${ctx.partInfo(aiSlot).text}\n\n${byImage()
    ? `添付した画像を見て、この部位（${partCat()}）のパーツを、この仕様で作ってください。画像のその部分の形をできるだけ似せてください（色は上の「色の役」で）。${$('#aWish').value.trim() ? `\n追加の希望: ${$('#aWish').value.trim()}` : ''}`
    : `作りたいパーツ: ${$('#aWish').value.trim() || '（おまかせ）'}`}\n\n仕様どおりの JSON を 1 つだけ出力してください。"ai" にはあなた自身のサービス名とモデル名を書いてください。`;
  const askText = spec => isPart() ? partAsk(spec) : `XS部品エディタ用の人型ロボット（XS）の機体データを作ってください。\n${spec}\n\n${byImage()
    ? `添付した画像の機体を、この仕様で作ってください。見た目（形・色・大きさのバランス）をできるだけ似せてください。${$('#aWish').value.trim() ? `\n追加の希望: ${$('#aWish').value.trim()}` : ''}`
    : `作りたい機体: ${$('#aWish').value.trim() || '（おまかせ）'}`}${ROLES[aiRole()] ? `\n用途: ${ROLES[aiRole()]}${ROLE_ASK[aiRole()] ?? ''}` : ''}\n\n仕様どおりの JSON を 1 つだけ出力してください。"ai" にはあなた自身のサービス名とモデル名を書いてください。`;
  // The spec is fetched when the screen opens: Safari only lets a click write the clipboard if nothing is awaited
  // before it, so the copy itself must not wait for the network. A 404 page must never be passed off as the spec.
  const specs = {}, specLoadings = {};   // 仕様書：機体は ai.md、パーツは ai-part.md
  const fetchSpec = url => fetch(url, { cache: 'no-cache' }).then(r => (r.ok ? r.text() : Promise.reject(new Error(r.status))))
    .then(t => (t.startsWith('# XS部品エディタ') ? t : Promise.reject(new Error('not the spec'))));
  function loadSpec() {
    const k = aiWhat, f = k === 'part' ? 'ai-part.md' : 'ai.md';
    if (specs[k]) return Promise.resolve(specs[k]);
    return (specLoadings[k] ??= fetchSpec(f).catch(() => fetchSpec(SPEC_URL.replace(/ai\.md$/, f)))
      .then(t => (specs[k] = t), () => { specLoadings[k] = null; return null; }));
  }
  const fullAsk = md => askText('以下が仕様書です。\n\n' + md);
  // last resort: show the text so it can be selected and copied by hand
  function showManualCopy(text) {
    const ta = $('#aManual');
    ta.value = text; ta.hidden = false; ta.focus(); ta.select();
    say('#aAskMsg', PHONE ? '自動でコピーできませんでした。下の欄を長押しして「すべてを選択」→「コピー」でコピーしてください。'
      : '自動でコピーできませんでした。下の欄の全文が選ばれているので、右クリックして「コピー」を選んでください。', 'ng');
    $('#aManualNext').hidden = false;
  }
  $('#aCopyFull').onclick = async () => {
    $('#aManual').hidden = true;
    if (specs[aiWhat]) {   // already here: write straight away, still inside the click
      const text = fullAsk(specs[aiWhat]);
      if (await copyText(text)) asked(); else showManualCopy(text);
      return;
    }
    // not loaded yet: Safari accepts a clipboard item whose content is still on its way
    if (window.ClipboardItem && navigator.clipboard?.write) {
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'text/plain': loadSpec().then(md => {
          if (!md) throw new Error('no spec');
          return new Blob([fullAsk(md)], { type: 'text/plain' });
        }) })]);
        asked(); return;
      } catch { /* fall through */ }
    }
    const md = await loadSpec();
    if (!md) { say('#aAskMsg', '頼み方を読み込めませんでした。通信を確かめて、もう一度押してください。', 'ng'); return; }
    showManualCopy(fullAsk(md));
  };

  let importErrors = '';
  // Fixing is one click and one paste: the fix request is copied, to be pasted into the same conversation with the
  // AI (opening the AI's page again would start a new one that knows nothing of the model); 5 waits for the answer,
  // and pasting it loads it and goes straight to the check (no example, no チラ見 on the way).
  let aiFixing = false;
  // copy while the click is still being handled
  function copyNow(text) {
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length);
    let ok = false; try { ok = document.execCommand('copy'); } catch { /* not allowed */ }
    ta.remove();
    navigator.clipboard?.writeText(text).catch(() => {});
    return ok;
  }
  // a button that copies `text()` and waits in 5 for the fixed answer; a link opens the AI again only in case its
  // tab was closed
  function fixButton(btn, text) {
    const [name, url] = AI_SERVICES[aiService] ?? AI_SERVICES.other;
    const other = aiService === 'other' || !(aiService in AI_SERVICES);
    btn.textContent = '直してもらう文章をコピー';
    btn.onclick = () => {
      if (!copyNow(text())) { say(aiStep === 5 ? '#aMsg' : '#aCheckMsg', copied(false), 'ng'); return; }
      aiFixing = true;
      clearAnswer(); showStep(5);
      const who = other ? ' AI ' : ` ${name} `;
      say('#aMsg', 'コピーしました。' + (aiSide ? `右に開いている${who}の会話に、そのまま貼り付けて送ってください。`
        : PHONE ? `ブラウザのタブの一覧から${who}のタブに戻り、さっきの会話にそのまま貼り付けて送ってください。`
        : `さっきの${who}の会話に戻って、そのまま貼り付けて送ってください。`)
        + `\n返ってきた答えをまるごとコピーして、${canRead ? '「コピーした答えを貼る」を押す' : '下の欄に貼り付ける'}と、自動で確かめます。`, 'ok');
      const a = $('#aReopen a');
      $('#aReopen').hidden = other;
      if (!other) {
        a.href = url; a.textContent = `${name} を開く（新しい会話になります）`;
        a.onclick = e => { if (openAiWindow(url)) e.preventDefault(); };
      }
    };
  }
  // 5: the answer becomes the candidate (nothing is loaded yet) and 6 shows it; a pasted answer is read at once
  function loadAnswer() {
    let model;
    $('#aErrOn').hidden = true; $('#aErrOpen').hidden = true;
    try { model = parseAiText($('#aJson').value); } catch (e) {
      const forAi = e instanceof AiTextError && !e.message.startsWith('貼り付けたのは');
      importErrors = forAi ? e.message : '';
      if (forAi) { fixButton($('#aErrOpen'), () => `${fixHead()}\n\n【読み込めなかった理由】\n${importErrors}`); $('#aErrOpen').hidden = false; }
      // a broken JSON is for the AI to fix: the parser's wording goes into the copied text, not on screen
      say('#aMsg', e.message.startsWith('JSON の書き方') ? 'AI の答えをうまく読めませんでした。下のボタンで AI に出し直してもらえます。' : e.message, 'ng');
      return;
    }
    const { ok, errors } = checkAiParts(model.parts.slice(0, 400));
    if (model.parts.length > 400) errors.push(`部品が ${model.parts.length} 個あります。400 個までしか読み込めません。`);
    importErrors = errors.join('\n');
    if (importErrors) { fixButton($('#aErrOpen'), () => `${fixHead()}\n\n【読み込めなかった理由】\n${importErrors}`); $('#aErrOpen').hidden = false; }
    if (!ok.length) { say('#aMsg', '使える部品がありません。下のボタンで AI に直してもらえます。', 'ng'); return; }
    // the AI names itself in the JSON ("ai"); the name can be corrected when posting
    aiCandidate = { list: ok, ai: String(model.ai ?? '').trim().slice(0, 40), name: String(model.name ?? '').trim().slice(0, 40), what: aiPasteOnly ? 'unit' : aiWhat, slot: aiSlot };
    aiReached = 5;
    $('#aCheckMsg').textContent = ''; $('#aUseRow').hidden = true;
    if (errors.length) {
      say('#aMsg', `部品 ${ok.length} 個を使えます。${errors.length} 個の部品は使えませんでした。\n下のボタンで AI に直してもらうか、このまま次へ進んでください。`, 'ng');
      $('#aErrOn').hidden = false;
      return;
    }
    $('#aMsg').textContent = '';
    goOn();
  }
  // after a fix the check comes right away; a first answer is looked at first
  function goOn() {
    if (!aiFixing) { showStep(6); return; }
    aiFixing = false; aiReached = 7;
    showStep(7); runCheck();
  }
  $('#aLoad').onclick = loadAnswer;
  // reads the answer the user copied in the AI, instead of clicking into the box and pasting (the browser asks
  // once whether the page may read the clipboard)
  const canRead = !!navigator.clipboard?.readText;
  $('#aReadRow').hidden = !canRead;
  $('#aOrPaste').textContent = canRead ? 'または、下の欄に貼り付けてください。' : '下の欄に貼り付けてください。';
  $('#aRead').onclick = async () => {
    let t;
    try { t = await navigator.clipboard.readText(); } catch {
      say('#aMsg', 'クリップボードを読めませんでした（ブラウザが許可していません）。下の欄に貼り付けてください。', 'ng'); return;
    }
    if (!t.trim()) { say('#aMsg', 'クリップボードが空です。AI の答えをコピーしてから押してください。', 'ng'); return; }
    $('#aJson').value = t; loadAnswer();
  };
  $('#aJson').addEventListener('paste', () => setTimeout(loadAnswer, 0));
  $('#aErrOn').onclick = goOn;
  const partFix = (results, list, ai) => `機体エディタで、パーツを確かめた結果です。指摘された所を直して、パーツ全体の JSON をもう一度出力してください（差分ではなく全体）。\n仕様: ${SPEC_URL.replace(/ai\.md$/, 'ai-part.md')}\n座標はパーツの中の座標で、1 単位 = 6 m、+Y が上、+Z が正面、+X が機体の左です。\n\n## 今回作るパーツ\n\n${ctx.partInfo(aiCandidate.slot).text}\n\n【確かめた結果】\n${results}\n\n【今のパーツ】\n\`\`\`json\n${modelJson(list, ai, 'xs-editor-part')}\n\`\`\``;
  const fixHead = () => aiCandidate?.what === 'part' || (isPart() && !aiPasteOnly) ? `機体エディタで、パーツを読み込んだ結果です。指摘されたブロックを直して、パーツ全体の JSON をもう一度出力してください（差分ではなく全体）。\n仕様: ${SPEC_URL.replace(/ai\.md$/, 'ai-part.md')}` : `機体エディタで確かめた結果です。指摘された部品の位置や大きさを直して、機体全体の JSON をもう一度出力してください（差分ではなく全体）。\n仕様: ${SPEC_URL}\n座標は 1 単位 = 6 m、+Y が上、+Z が正面、+X が機体の左です。`;
  // a check report for the AI: what to do, what was found, and the model it was found in (as it is now: it may differ
  // from the AI's last answer, moved by くっつける)
  const fixReport = (results, list, ai) => `${fixHead()}\n下の「今の機体」を元に直してください（前に出した JSON から変わっていることがあります）。\n\n${results}\n\n【今の機体】\n\`\`\`json\n${modelJson(list, ai)}\n\`\`\``;
  // 7: checks whether the parts are connected and the joints bend cleanly, on the candidate; the report itself is
  // only copied for the AI when something needs fixing. この機体にする is the one place the model is taken.
  let fixText = '', attachNote = '', lastCheck = null;
  function runCheck() {
    $('#aUseRow').hidden = true;
    if (!aiCandidate?.list.some(p => (p.op ?? 'add') === 'add' && !p.blockout)) { say('#aCheckMsg', '確かめる部品がありません。', 'ng'); return; }
    say('#aCheckMsg', '確かめています…（少しかかります）');
    setTimeout(async () => {
      try {
        await XS.ready();
        if (aiCandidate.what === 'part') {   // パーツ：ブロックがつながっているか、収める範囲に入っているか
          const r = lastCheck = ctx.partCheck(aiCandidate.list, aiCandidate.slot);
          fixText = partFix(r.text, aiCandidate.list, aiCandidate.ai);
          say('#aCheckMsg', (r.ok ? '問題ありません。カタログに入れますか？' : '直したほうがよい所が見つかりました。\nAI に直してもらうか、このままカタログに入れるかを選んでください。') + `\n\n${r.text}`, r.ok ? 'ok' : 'ng');
          $('#aFixOpen').hidden = r.ok; $('#aAttach').hidden = true;
          if (!r.ok) fixButton($('#aFixOpen'), () => fixText);
          $('#aUse').textContent = r.ok ? 'このパーツをカタログに入れる' : 'このままカタログに入れる';
          $('#aUseRow').hidden = false;
          return;
        }
        XS.load({ parts: aiCandidate.list, ai: aiCandidate.ai, role: aiRole() });
        const r = lastCheck = XS.report(checkId());
        fixText = fixReport(`【つながりチェック】\n${r.conn}\n\n【関節チェック】\n${r.joint}`, XS.doc().parts, aiCandidate.ai);
        say('#aCheckMsg', attachNote + (r.ok ? '問題ありません。この機体にしますか？'
          : '離れている部品や、動かすとぶつかる所が見つかりました。\nAI に直してもらうか、このままこの機体にするかを選んでください。') + (r.ok ? '' : `\n\n${r.connOk ? '' : r.conn + '\n'}${r.jointOk ? '' : r.joint}`), r.ok ? 'ok' : 'ng');
        attachNote = '';
        $('#aFixOpen').hidden = r.ok;
        $('#aAttach').hidden = r.connOk;
        if (!r.ok) fixButton($('#aFixOpen'), () => fixText);
        $('#aUse').textContent = r.ok ? 'この機体にする' : 'このままこの機体にする';
        $('#aUseRow').hidden = false;
      } catch (e) { say('#aCheckMsg', '確かめられませんでした：' + (e?.message ?? e), 'ng'); }
    }, 30);
  }
  $('#aCheck').onclick = runCheck;
  // floating parts are moved onto the body here, without asking the AI; the candidate keeps the moved parts
  $('#aAttach').onclick = () => {
    $('#aUseRow').hidden = true;
    say('#aCheckMsg', 'くっつけています…');
    setTimeout(() => {
      XS.load({ parts: aiCandidate.list, ai: aiCandidate.ai, role: aiRole() });
      const n = XS.attach();
      aiCandidate = { ...aiCandidate, list: XS.doc().parts };
      attachNote = `${n} 個の部品を動かしてくっつけました。\n`;
      runCheck();
    }, 30);
  };
  $('#aUse').onclick = async () => {
    const c = aiCandidate, pasteOnly = aiPasteOnly;
    if (c.what === 'part') ctx.takePart(c.list, c.name, c.slot, c.ai);
    else if (!ctx.take(c.list, c.name, aiRole(), c.ai)) return;   // (the user kept the unit that was there)
    closeAi();
    if (!pasteOnly) { aiCandidate = null; aiReached = 3; showStep(3); }
  };
  let aiPasteOnly = false, aiWizard = null;
  function setPasteOnly(on) {
    aiPasteOnly = on;
    $('#aTitle').textContent = on ? 'AI の答えを貼る' : 'AIで作る';
    aNav.forEach((b, i) => { b.hidden = on && i < 4; b.querySelector('b').textContent = on ? i - 3 : i + 1; });
    aSteps.forEach((s, i) => {
      const h = s.querySelector('h2');
      h.dataset.t ??= h.textContent;
      h.textContent = on && i >= 4 ? h.dataset.t.replace(/^\d+/, i - 3) : h.dataset.t;
    });
    $('#aPeekNote').textContent = on ? 'まだ読み込んではいません。気に入らなければ、閉じれば今の機体のままです。'
      : 'まだ読み込んではいません。気に入らなければ、上の「3 頼み方」から頼み直せます。';
  }
  setPasteOnly(false);
  function clearAnswer() {
    $('#aReopen').hidden = true;
    $('#aJson').value = ''; $('#aMsg').textContent = ''; $('#aErrOpen').hidden = $('#aErrOn').hidden = true;
    $('#aCheckMsg').textContent = ''; $('#aUseRow').hidden = true;
  }
  function openAiPaste(held) {
    if (!$('#aiBox').hidden) return;
    pasteHeld = held ?? null;
    aiWizard = { step: aiStep, reached: aiReached, cand: aiCandidate, json: $('#aJson').value };
    aiCandidate = null; aiReached = 5;
    clearAnswer(); setPasteOnly(true);
    $('#aiBox').hidden = false;
    showStep(5); $('#aJson').focus();
  }
  function openAi() {
    if (ctx.busy()) return;
    $('#aiBox').hidden = false; loadSpec();
    showStep(aiStep);
    if (aiStep === 4) playDemo(sendImage);
  }
  // closing never keeps the AI's model: the unit that was there stays as it is
  function closeAi() {
    aiFixing = false; demoRun++; stopPeek();
    $('#aiBox').hidden = true;
    if (aiPasteOnly) {
      setPasteOnly(false); clearAnswer();
      ({ step: aiStep, reached: aiReached, cand: aiCandidate } = aiWizard);
      $('#aJson').value = aiWizard.json; aiWizard = null;
      if (pasteHeld) { $('#aRole').value = pasteHeld.was; pasteHeld = null; }
    }
  }
  $('#aClose').onclick = closeAi;
  { let down = false; const el = $('#aiBox');   // the dark backdrop closes it - only when the press also started there
    el.addEventListener('pointerdown', e => { down = e.target === el; });
    el.addEventListener('click', e => { if (down && e.target === el) closeAi(); down = false; }); }
  document.addEventListener('keydown', e => { if ($('#aiBox').hidden) return; e.stopPropagation(); if (e.key === 'Escape') closeAi(); }, true);
  resetAsk();
  return {
    open: openAi,
    /** 部位（ひな形のパーツの id）を決めて、パーツを作る画面として開く */
    openPart: id => { if (ctx.busy()) return; setWhat('part', id || aiSlot); openAi(); },
    /** 「AI の答えを貼る」だけの画面（貼る → チラ見 → 確かめる）。role：その機体の用途 */
    openPaste: (role = '') => { if (ctx.busy()) return; const was = $('#aRole').value; openAiPaste({ was }); $('#aRole').value = role; },
    /** 今の機体（機体エディタの部品の並び）の確かめた結果を、AI に直してもらう文章にする */
    fixText: (results, list, ai) => fixReport(results, list, ai),
    copy: copyText,
    active: () => !$('#aiBox').hidden,
  };
}
