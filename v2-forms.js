// 機体エディタ Ver2 の「形態」（変形の見た目、issue #145。依頼主 2026-11-06：エディタと「みんなの機体」の中だけ、戦場では変形しない）。
// 形態 1 は今までどおりの形（書き出す形・関節のチェック・小さな絵もこれ）。形態 2 からは、ブロックごとに
//   pc.forms[n] = { hide?: true（この形態では出さない）, color?: '#rrggbb', p?: [x, y, z]（ずらす。パーツの座標）, r?: [x, y, z]（回す。度、ブロックの真ん中で） }
// を持つ（書いていないブロックは形態 1 と同じ）。形態の数は、使っているブロックのいちばん大きい n（と、足しただけでまだ使っていない分）。
// 切り替えは FORM_MS かけて、位置・向き・色を間でつなぎ、出す／出さないは大きさで（出さない側は 0 まで縮む）。
// 画面の形（v2.js が作るメッシュ。userData.pc がブロック）に重ねるだけで、ブロックの形・置き方のデータは変えない。
import * as THREE from 'three';

export const FORM_MAX = 4;
export const FORM_MS = 700;
// 置いたパーツごとの「移る時の遅れ」（issue #813、テスター ポッチャさん「形態を移行する際、部品ごとにディレイをかけられるようにしてほしい」）：
//   item.formDelay（ミリ秒、0〜FORM_DELAY_MAX）。形態を切り替えると、そのパーツ（中のブロックの形態も）はこの分だけ待ってから FORM_MS かけて移る。
//   行きも帰りも同じ遅れ。書いていないパーツは 0（今までどおり、すぐ移る）
export const FORM_DELAY_MAX = 3000;
/** 置いたパーツ it の移る時の遅れ（ミリ秒） */
export const formDelayOf = it => Math.max(0, Math.min(FORM_DELAY_MAX, Math.round(+it?.formDelay || 0)));
/** 置いたパーツの並びの、切り替えにかかる時間（いちばん遅いパーツが移り終えるまで。ミリ秒） */
export const formSpanOf = items => FORM_MS + Math.max(0, ...items.map(formDelayOf));
const D = Math.PI / 180;

/** ブロック pc の形態 n の見た目（形態 1 と同じなら null） */
export const formOf = (pc, n) => (n > 1 && pc?.forms?.[n]) || null;
/** パーツの並び defs のブロックが使っている形態の数（1〜FORM_MAX） */
export function formsUsed(defs) {
  let n = 1;
  for (const def of defs) for (const pc of def?.pieces ?? []) for (const k of Object.keys(pc.forms ?? {})) if (+k > n && +k <= FORM_MAX) n = +k;
  return n;
}
/** 置いたパーツ（items）が使っている形態の数（1〜FORM_MAX）。置いたパーツの形態は item.forms（下の itemFormDelta） */
export const itemFormsUsed = items => formsUsed([{ pieces: items }]);
/** 形態 n の見た目を書き換える（空になったら消す：データに形態 1 と同じ物を残さない）。置いたパーツ（item.forms）にも使う */
export function setForm(pc, n, change) {
  const f = { ...(pc.forms?.[n] ?? {}), ...change };
  for (const k of Object.keys(f)) if (f[k] == null || f[k] === false || (Array.isArray(f[k]) && f[k].every(v => !v))) delete f[k];
  const all = { ...(pc.forms ?? {}) };
  if (Object.keys(f).length) all[n] = f; else delete all[n];
  if (Object.keys(all).length) pc.forms = all; else delete pc.forms;
}

const ease = t => t * t * (3 - 2 * t);
const _q = new THREE.Quaternion(), _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _e = new THREE.Euler();
const _c = new THREE.Vector3(), _mid = new THREE.Vector3(), _v = new THREE.Vector3(), _w = new THREE.Vector3(), _col = new THREE.Color(), _cb = new THREE.Color();
/** 形態 n の値（ミラーの写しは左右を返す）：{ p: Vector3, q: Quaternion, s: 0|1, color: string|null } */
function look(pc, n, mirrored, q) {
  const f = formOf(pc, n), p = f?.p ?? [0, 0, 0], r = f?.r ?? [0, 0, 0];
  q.setFromEuler(_e.set(r[0] * D, (mirrored ? -r[1] : r[1]) * D, (mirrored ? -r[2] : r[2]) * D, 'XYZ'));
  return { p: new THREE.Vector3(mirrored ? -p[0] : p[0], p[1], p[2]), s: f?.hide ? 0 : 1, color: f?.color ?? null };
}
/** ミラーの写しか（ミラーのブロックは、写しが 1 つおきに入る：partgeo.js instances） */
const mirroredMesh = o => !!o.userData.pc?.mirror && (o.userData.inst ?? 0) % 2 === 1;

// ---- 置いたパーツ 1 つごとの形態（issue #810：右の「置いたパーツ」で選んだパーツ単体の形態）----
//   item.forms[n] = { hide?: true（この形態では出さない）, noFlame?: true（噴射口・炎の点：この形態では炎を出さない。下の itemFlame）, p?: [x, y, z]（ずらす。右の「位置」と同じ 左右・上下・前後）, r?: [x, y, z]（回す。度、パーツの原点で・パーツの向きの軸で） }
// ブロックの形態（pc.forms）の上に重なる（ブロックが動いた形のまま、パーツごと動く）。色はブロックの形態で変える
/**
 * 置いたパーツ it の、形態 view.from → view.to の途中 view.t（0〜1）のずれ（形態 1 のまま・形態の無いパーツは null）
 * { p: Vector3（位置に足す）, q: Quaternion（向きの後ろに掛ける）, s: 拡大に掛ける数（出さない形態へ 0 まで縮む） }
 */
export function itemFormDelta(it, view) {
  if (!it?.forms || !view || (view.from === 1 && view.to === 1)) return null;
  const k = ease(Math.min(1, Math.max(0, view.t))), qb = new THREE.Quaternion(), q = new THREE.Quaternion();
  const a = look(it, view.from, false, q), b = look(it, view.to, false, qb);
  return { p: a.p.lerp(b.p, k), q: q.slerp(qb, k), s: Math.max(a.s + (b.s - a.s) * k, 1e-4) };
}
// 噴射口の部品・炎の点（parts/back/jetshield.js）は、形態ごとに炎を出さない事もできる（issue #812、テスター ポッチャさん
// 「噴射口のエフェクトも形態ごとにONOFFさせてほしい」）：item.forms[n].noFlame = true。形態 1 はゲームに書き出す形なので、いつも出す。
// 炎はエディタの見本（v2.js flameTick）だけで、戦場では変形しないので、ゲームの炎は今までどおり
/** 置いたパーツ it の炎の出方（0 出さない〜1 出す）：形態 view.from → view.to の途中 view.t。形態 1 のまま（view が null）は 1 */
export function itemFlame(it, view) {
  if (!view) return 1;
  const on = n => (formOf(it, n)?.noFlame ? 0 : 1), a = on(view.from), b = on(view.to);
  return a + (b - a) * ease(Math.min(1, Math.max(0, view.t)));
}
/** 左右反転の写し（xsasm-random.js mirrorOf）の形態：ずらすの左右と、回すの y・z を逆に（位置・回転の写し方と同じ） */
export function mirrorForms(forms) {
  const out = {};
  for (const [n, f] of Object.entries(forms ?? {})) out[n] = { ...f, ...(f.p ? { p: [-f.p[0], f.p[1], f.p[2]] } : {}), ...(f.r ? { r: [f.r[0], -f.r[1], -f.r[2]] } : {}) };
  return out;
}

/** メッシュ o の形態 1 の置き方を覚える（作った時・置き直した時に呼ぶ） */
export function keepBase(o) { o.userData.fb = { p: o.position.clone(), q: o.quaternion.clone(), s: o.scale.clone(), m: o.material }; }

/**
 * roots の中のメッシュを、形態 from → to の途中 t（0〜1）の見た目にする。baseMat(o)：塗りの材質（色を変える時はその写しに色を入れる）
 * 形態 1 のまま（from = to = 1）なら、覚えた置き方と塗りの材質に戻すだけ
 */
export function showForms(roots, from, to, t, baseMat) {
  const k = ease(Math.min(1, Math.max(0, t)));
  for (const root of roots) root.traverse(o => {
    if (!o.isMesh || !o.userData.pc) return;
    const fb = o.userData.fb ?? (keepBase(o), o.userData.fb), pc = o.userData.pc;
    const plain = !pc.forms || (from === 1 && to === 1);
    if (plain) {
      if (o.userData.formed) { o.position.copy(fb.p); o.quaternion.copy(fb.q); o.scale.copy(fb.s); o.material = baseMat(o); o.userData.formed = false; }
      return;
    }
    const mir = mirroredMesh(o), a = look(pc, from, mir, _qa), b = look(pc, to, mir, _qb);
    const sc = a.s + (b.s - a.s) * k;
    _q.copy(_qa).slerp(_qb, k);
    // ブロックの真ん中（形の箱の中心）で回す：置き方 fb のまま真ん中 C へ、そこから回した・縮めた形を戻す
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    o.geometry.boundingBox.getCenter(_c);
    const C = _mid.copy(_c).multiply(fb.s).applyQuaternion(fb.q).add(fb.p);
    o.quaternion.copy(fb.q).multiply(_q);
    o.scale.copy(fb.s).multiplyScalar(Math.max(sc, 1e-4));
    o.position.copy(C).add(_w.copy(a.p).lerp(b.p, k)).sub(_v.copy(_c).multiply(o.scale).applyQuaternion(o.quaternion));
    // 色：どちらかの形態が色を変えるとき、このメッシュだけの材質の写しに間の色を入れる
    const m0 = baseMat(o);
    if (a.color || b.color) {
      const own = o.userData.formMat?.userData.from === m0 ? o.userData.formMat : (o.userData.formMat = Object.assign(m0.clone(), { userData: { from: m0 } }));
      _col.set(a.color ?? m0.color); _cb.set(b.color ?? m0.color); own.color.copy(_col.lerp(_cb, k));
      if (m0.emissive && m0.emissiveIntensity > 0 && m0.emissive.getHex()) own.emissive.copy(own.color);
      o.material = own;
    } else o.material = m0;
    o.userData.formed = true;
  });
}
