// 機体エディタ Ver2 の「形態」（変形の見た目、issue #145。依頼主 2026-11-06：エディタと「みんなの機体」の中だけ、戦場では変形しない）。
// 形態 1 は今までどおりの形（書き出す形・関節のチェック・小さな絵もこれ）。形態 2 からは、ブロックごとに
//   pc.forms[n] = { hide?: true（この形態では出さない）, color?: '#rrggbb', p?: [x, y, z]（ずらす。パーツの座標）, r?: [x, y, z]（回す。度、ブロックの真ん中で） }
// を持つ（書いていないブロックは形態 1 と同じ）。形態の数は、使っているブロックのいちばん大きい n（と、足しただけでまだ使っていない分）。
// 切り替えは FORM_MS かけて、位置・向き・色を間でつなぎ、出す／出さないは大きさで（出さない側は 0 まで縮む）。
// 画面の形（v2.js が作るメッシュ。userData.pc がブロック）に重ねるだけで、ブロックの形・置き方のデータは変えない。
import * as THREE from 'three';

export const FORM_MAX = 4;
export const FORM_MS = 700;
const D = Math.PI / 180;

/** ブロック pc の形態 n の見た目（形態 1 と同じなら null） */
export const formOf = (pc, n) => (n > 1 && pc?.forms?.[n]) || null;
/** パーツの並び defs のブロックが使っている形態の数（1〜FORM_MAX） */
export function formsUsed(defs) {
  let n = 1;
  for (const def of defs) for (const pc of def?.pieces ?? []) for (const k of Object.keys(pc.forms ?? {})) if (+k > n && +k <= FORM_MAX) n = +k;
  return n;
}
/** 形態 n の見た目を書き換える（空になったら消す：データに形態 1 と同じ物を残さない） */
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
