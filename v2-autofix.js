// 機体エディタ Ver2：関節のチェックで出た「めり込む」を、ボタン 1 つで直す（issue #264、テスター るぅてしぁさん 2026-11-06
// 「問題が出る姿勢の警告が出た時、自分じゃ直せないので、良い感じに調節してくれる機能が欲しい」）。
// 外の AI やサービスは使わない。エディタの中の決まりだけで直す：
//   - 直すのは、置いたパーツの置き方（位置・大きさ・付ける骨）だけ。パーツの形（ブロック）は変えない（docs/xs-parts-lessons.md：形を勝手に作り替えない）
//   - めり込む 2 つのうち、小さい方から動かす（胸・背中の殻より、ひじの覆い・首当て）。左右の対のパーツは、鏡に映して同じだけ動かす
//   - 試す順：めり込みから離れる向きへ少しずつずらす → 少し縮める → ずらして縮める → 上下・前後・左右へずらす → 付ける骨を相手の骨にする。
//     いちばん小さな変えで、その組のめり込みが消えるものを取る（消えなければ、いちばん浅くなるもの）
//   - 取らない変え：つながりが切れる（離れる部品が増える）、動かすと外れる部品が増える、立った姿勢で相手の中に入る
//     （関節のチェックは「立った姿勢でもう重なっている組」を数えないので、中へ入れて警告を消すのはごまかし）、ほかのめり込みが深くなる
//   - 上限：ずらすのは 0.15 m（ゲームの m、全高 18 m）とそのパーツの大きさの 15 % の小さい方まで、縮めるのは 0.85 倍まで。見た目が変わるほどは動かさない
//   - 1 組を直すたびに、全部の姿勢・全部のパーツでもう一度調べる。前より悪ければ、その変えを戻す。めり込みが無くなるか、良くならなくなるか、4 回りで終わる
// 何を見て「めり込む」と出すかは xsengine.js の jointSteps（ゲームの動きのコマごとに、別々に動く 2 つの部品が、立った姿勢では
// 離れていたのに、重なりの深さが全高の 1/300（約 6 cm）を超える組）

const STEPS = [0.03, 0.06, 0.1, 0.15];         // ずらす量（ゲームの m）[独自]
const SHRINK = [0.95, 0.9, 0.85];             // 縮める倍率 [独自]
// ずらす上限：0.15 m とパーツの大きさの 15 % の小さい方 [独自]。0.3 m まで許すと、丸い肩アーマーが外へ 0.29 m 出て、胸との間に
// 黒い肩関節が見え、機体の見た目が変わった（2026-11-07 の確かめの絵）。そこまで動かさないと消えない組は「直せなかった」と出す
const MOVE_MAX = 0.15, MOVE_PART = 0.15;
const ROUNDS = 4;
const AXES = [[0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1], [1, 0, 0], [-1, 0, 0]];
const AXIS_WORD = ['上', '下', '前', '後ろ', '左', '右'];   // （エディタの座標：+y 上、+z 前、+x 機体の左）

const r4 = v => Math.round(v * 1e4) / 1e4;
const keyOf = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
const groupBone = b => String(b ?? '').replace(/_(l|r|front_l|front_r|back_l|back_r)$/, '');

/**
 * items：置いたパーツ（写しを渡す。直した後の並びを返す）。
 * check(items)：全部の姿勢の関節のチェック（XS.reportAsync の結果）。probe(items, only)：only の番号のパーツだけの関節のチェック（XS.probe）。
 * info(i) → { name, head: 頭のパーツか（頭の座標で置く）, k: 頭の縮尺, movable: 動かしてよいか, bone: 付ける骨を選べるか }。onStep(text)：進み具合
 * → { items, fixed: [{ pair, how }], failed: [{ pair, why }], changes: [{ i, name, move: [x, y, z] ゲームの m, scale, bone }], before, after }
 */
export async function autoFix({ items, check: check0, probe: probe0, info, onStep = () => {} }) {
  const orig = items.map(it => structuredClone(it));
  // 何回・何秒調べたかと、試した変えごとの結果（log：確かめる道具が読む）
  const stats = { checks: 0, checkMs: 0, probes: 0, probeMs: 0 }, log = [];
  const timed = (f, n, ms) => async (...a) => { const t = performance.now(); try { return await f(...a); } finally { stats[n]++; stats[ms] += performance.now() - t; } };
  const check = timed(check0, 'checks', 'checkMs'), probe = timed(probe0, 'probes', 'probeMs');
  let rep = await check(items);
  const first = rep, firstPairs = groupsOf(rep);
  const H = rep.detail.H || 3, toGame = 18 / H;
  const failed = new Map(), how = new Map();
  for (let round = 0; round < ROUNDS; round++) {
    const groups = groupsOf(rep).filter(g => !failed.has(g.key));
    if (!groups.length) break;
    let better = false;
    for (const [gi, g] of groups.entries()) {
      if (!groupsOf(rep).some(x => x.key === g.key)) continue;   // （前の組を直したら、もう消えている）
      onStep(`直しています（${round + 1} 回り目、${gi + 1} / ${groups.length} 組：${g.label}）`);
      const keep = items.map(it => structuredClone(it));
      const r = await fixGroup(groupsOf(rep).find(x => x.key === g.key));
      if (!r.ok) { if (!how.has(g.key)) failed.set(g.key, r.why); continue; }
      // 1 組を直すごとに、全部の姿勢・全部のパーツで調べ直す。前より悪ければ、その変えを戻す
      onStep(`直しています（${round + 1} 回り目、${gi + 1} / ${groups.length} 組：全部の姿勢で調べ直しています）`);
      const next = await check(items);
      if (badness(next) < badness(rep) - 1e-6) { rep = next; how.set(g.key, r.how); better = true; }
      else { items.splice(0, items.length, ...keep); if (!how.has(g.key)) failed.set(g.key, 'その組は直せても、ほかの所のめり込み・外れが増える'); }
    }
    if (!better) break;
  }
  // 結果：直る前にあった組ごとに、直ったか・直せなかったか
  const left = new Map(groupsOf(rep).map(g => [g.key, g]));
  const fixed = [], fails = [];
  for (const g of firstPairs) {
    if (!left.has(g.key)) fixed.push({ pair: g.label, how: how.get(g.key) ?? 'ほかの組を直したら消えた' });
    else fails.push({ pair: g.label, depth: left.get(g.key).depth, why: failed.get(g.key) ?? (how.has(g.key) ? '浅くはなったが、消え切らない（上限の内）' : '直す回りが終わった') });
  }
  for (const g of left.values()) if (!firstPairs.some(f => f.key === g.key)) fails.push({ pair: g.label, depth: g.depth, why: '直す途中で新しく出た' });
  return { items, fixed, failed: fails, changes: changesOf(), before: first, after: rep, stats, log };

  // ---- 1 組を直す ----
  async function fixGroup(g) {
    const cands = [g.a, g.b].filter(i => i !== null && info(i)?.movable)
      .sort((x, y) => size(x) - size(y));
    if (!cands.length) return { ok: false, why: '動かせるパーツが無い（手持ちの武器・機体まるごとの部品どうし）' };
    const why = { float: 0, rest: 0, worse: 0, none: 0 };
    let bestPart = null;
    for (const m of cands) {
      const mate = partner(m), only = mate === null ? [m] : [m, mate];
      const base = await probe(items, only), baseBad = probeBad(base), baseDeep = pairDeep(base, g);
      const push = g.a === m ? g.pushA : g.pushB;
      const dead = new Set();   // （同じ並びの変えで離れたら、それより大きい変えは試さない）
      for (const act of actions(m, g, push)) {
        if (dead.has(act.series)) continue;
        const trial = applyAct(items, m, mate, act);
        const r = await probe(trial, only);
        const bad = guard(r, base), deep = pairDeep(r, g), b = probeBad(r);
        log.push({ pair: g.label, act: act.word(info(m).name, mate !== null), deep: +deep.toFixed(3), from: +baseDeep.toFixed(3), bad: bad || (b > baseBad + 1e-6 ? `worse ${(b - baseBad).toFixed(3)}` : '') });
        if (bad) { why[bad]++; if (bad === 'float' && act.series) dead.add(act.series); continue; }
        if (b > baseBad + 1e-6) { why.worse++; continue; }
        if (deep < 1e-9) { items.splice(0, items.length, ...trial); return { ok: true, how: act.word(info(m).name, mate !== null) }; }
        if (deep < baseDeep - 0.01 && (!bestPart || deep < bestPart.deep)) bestPart = { deep, trial, word: act.word(info(m).name, mate !== null) };
        why.none++;
      }
    }
    if (bestPart) { items.splice(0, items.length, ...bestPart.trial); return { ok: true, how: bestPart.word + '（浅くした）' }; }
    const top = Object.entries(why).sort((x, y) => y[1] - x[1])[0][0];
    return { ok: false, why: { float: 'ずらす・縮めると、つながりが切れる（部品が離れる）', rest: 'ずらすと、立った姿勢で相手の中に入ってしまう（警告を隠すだけになる）',
      worse: 'ずらすと、ほかのパーツとのめり込みが深くなる', none: `見た目が変わらない範囲（ずらす ${MOVE_MAX} m・パーツの大きさの ${MOVE_PART * 100} %、縮める ${SHRINK.at(-1)} 倍まで）では、めり込みが残る` }[top] };
  }
  function actions(m, g, push) {
    const out = [], d = size(m) * toGame, cap = Math.min(MOVE_MAX, MOVE_PART * d), nm = n => +n.toFixed(2);
    const dirWord = v => { const k = v.map(Math.abs).indexOf(Math.max(...v.map(Math.abs))); return [['左', '右'], ['上', '下'], ['前', '後ろ']][k][v[k] >= 0 ? 0 : 1]; };
    const both = s => (s ? '（左右とも）' : '');
    // 上限は、直す前の置き方から数える（何組も直す間に、同じパーツが少しずつ遠くへ行かないように）
    const k = info(m).head ? info(m).k : 1, used = Math.hypot(...items[m].mov.map((v, c) => (v - orig[m].mov[c]) * k * toGame));
    const shrunk = Math.abs(items[m].scal[0] / (orig[m].scal[0] || 1));
    const moves = STEPS.filter(s => s + used <= cap + 1e-9), shrinks = SHRINK.filter(f => f * shrunk >= SHRINK.at(-1) - 1e-9);
    // series：小さい順に並んだ同じ向きの変え（1 つで離れるなら、その先も離れるので試さない）
    if (push && Math.hypot(...push) > 0.5) for (const s of moves) out.push({ series: 'push', move: push.map(v => v * s / toGame), word: (n, s2) => `${n}を${dirWord(push)}へ ${nm(s)} m ずらした${both(s2)}` });
    for (const f of shrinks) out.push({ series: 'shrink', scale: f, word: (n, s2) => `${n}を ${f} 倍に縮めた${both(s2)}` });
    if (push && Math.hypot(...push) > 0.5) if (shrinks.includes(SHRINK[1])) for (const s of moves.slice(0, 2)) out.push({ series: 'push-shrink', move: push.map(v => v * s / toGame), scale: SHRINK[1], word: (n, s2) => `${n}を${dirWord(push)}へ ${nm(s)} m ずらし、${SHRINK[1]} 倍に縮めた${both(s2)}` });
    for (const [k, ax] of AXES.entries()) if (!push || ax.reduce((d, v, c) => d + v * push[c], 0) < 0.95) for (const s of moves.slice(1)) out.push({ series: 'axis' + k, move: ax.map(v => v * s / toGame), word: (n, s2) => `${n}を${AXIS_WORD[k]}へ ${nm(s)} m ずらした${both(s2)}` });
    // 付ける骨：となりの骨（ひじの節の部品なら上腕か前腕）。となりの無い骨なら、相手の骨
    const other = groupBone(g.a === m ? g.bb : g.ba), mine = groupBone(g.a === m ? g.ba : g.bb);
    if (info(m).bone) for (const b of NEXT_BONE[mine] ?? [other]) if (b && b !== mine) out.push({ bone: b, word: (n, s2) => `${n}の付ける骨を「${BONE_WORD[b] ?? b}」にした${both(s2)}` });
    return out;
  }
  // 試した変えを捨てる理由：離れる部品・外れる部品が増える、立った姿勢で新しく中に入る
  function guard(r, base) {
    if (r.floating > base.floating) return 'float';
    if (r.offs.length > base.offs.length) return 'float';
    const had = new Map(base.restDeep.map(x => [x.la + '|' + x.lb, x.depth]));
    if (r.restDeep.some(x => !had.has(x.la + '|' + x.lb) || x.depth > had.get(x.la + '|' + x.lb) + 0.02)) return 'rest';
    return '';
  }
  function size(i) {
    const b = rep.detail.boxes[i] ?? first.detail.boxes[i];
    return b ? Math.max(b[1][0] - b[0][0], b[1][1] - b[0][1], b[1][2] - b[0][2]) : 1e9;
  }
  function partner(m) {
    const a = items[m];
    if (Math.abs(a.mov[0]) < 1e-3) return null;
    const j = items.findIndex((b, k) => k !== m && b.part === a.part && Math.abs(b.mov[0] + a.mov[0]) < 2e-3 && Math.abs(b.mov[1] - a.mov[1]) < 2e-3 && Math.abs(b.mov[2] - a.mov[2]) < 2e-3);
    return j >= 0 ? j : null;
  }
  function applyAct(list, m, mate, act) {
    const out = list.map(it => structuredClone(it));
    for (const [i, sx] of [[m, 1], ...(mate === null ? [] : [[mate, -1]])]) {
      const it = out[i], k = info(i).head ? info(i).k : 1;
      if (act.move) it.mov = it.mov.map((v, c) => r4(v + (c === 0 ? sx : 1) * act.move[c] / k));
      if (act.scale) it.scal = it.scal.map(v => r4(v * act.scale));
      if (act.bone) it.bone = act.bone;
    }
    return out;
  }
  // 変えたパーツごとに：ずらした量（ゲームの m、機体の左・上・前が +）、大きさの倍率、付ける骨
  function changesOf() {
    const out = [];
    for (const [i, it] of items.entries()) {
      const o = orig[i], k = info(i).head ? info(i).k : 1;
      const move = it.mov.map((v, c) => r4((v - o.mov[c]) * k * toGame)), scale = r4(it.scal[0] / (o.scal[0] || 1));
      if (move.some(v => Math.abs(v) > 1e-3) || Math.abs(scale - 1) > 1e-3 || it.bone !== o.bone) out.push({ i, name: info(i).name, move, scale, bone: it.bone !== o.bone ? it.bone : null });
    }
    return out;
  }
}

const NEXT_BONE = { elbow: ['arm', 'fore'], knee: ['leg', 'shin'], arm: ['elbow'], fore: ['elbow'], leg: ['knee'], shin: ['knee'] };
const BONE_WORD = { head: '頭', torso: '胴', hips: '腰', arm: '腕（肩〜ひじ）', elbow: 'ひじの節', fore: '前腕・手', leg: '太もも', knee: 'ひざの節', shin: 'すね', foot: '足', cannon: '大砲の砲身', wing: '翼', skirt: 'スカート' };

/** めり込む組を、置いたパーツの組ごとにまとめる（左右の両方の組は、ひとまとめにはしない：それぞれ直す） */
function groupsOf(rep) {
  const out = new Map();
  for (const p of rep.detail?.pairs ?? rep.pairs ?? []) {
    if (p.a === p.b) continue;
    const key = keyOf(p.a, p.b), g = out.get(key);
    if (!g || p.depth > g.depth) out.set(key, { key, a: p.a, b: p.b, ba: p.ba, bb: p.bb, depth: p.depth, pushA: p.pushA, pushB: p.pushB, label: `${p.la} ↔ ${p.lb}`, poses: p.poses });
  }
  return [...out.values()].sort((x, y) => y.depth - x.depth);
}
/** 全部の姿勢のチェックの悪さ：めり込む組の深さの和（m）＋外れる部品・離れる部品 1 つにつき 1 */
function badness(rep) { return (rep.detail?.pairs ?? []).reduce((s, p) => s + p.depth, 0) + (rep.detail?.offs ?? []).length + (rep.detail?.floating ?? 0); }
function probeBad(r) { return r.pairs.reduce((s, p) => s + p.depth, 0) + r.offs.length + r.floating; }
/** probe の結果の中の、その組（置いたパーツの組）のいちばん深いめり込み */
function pairDeep(r, g) { return r.pairs.filter(p => keyOf(p.a, p.b) === g.key).reduce((d, p) => Math.max(d, p.depth), 0); }
