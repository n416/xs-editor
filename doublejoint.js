// 2 重関節（ひじ・ひざ）：ゲームは前腕・すねを 1 つの点（ひじ E・ひざ K）のまわりに回すだけ（forearm・shin の回転 q）。
// 2 重関節では、上と下の間に「中間の節」（骨 elbow・knee）があり、上の軸 P1（中心の up 上）と下の軸 P2（中心の down 下）で曲がる。
// 外からは 2 重に見せない：上の軸は上の部品（上腕・太もも）の装甲の中、下の軸は下の部品（前腕・すね）の装甲の中に入り、節は装甲の
// すき間からしか見えない。そのために、q を「ねじり」と「曲げ」に分けて、骨を次のように動かす（ここで決める）。
//   q = S · T（T：縦の軸のまわりのねじり、S：横の軸 a のまわりの曲げ θ。下の部品の先は S だけで決まる）
//   ・roll：上の部品の筒（骨 armroll）。縦の軸のまわりに ρ 回る（上腕が肩の下で回る）。ρ は、曲げの軸 a が筒の横（x）に合う向き
//          ＝節の「曲がる側」が下の部品の先の向く横の向きに合う向き。だから筒の中では、節はいつも同じ向き（前後）に曲がる
//   ・link：節。上の軸 P1 のまわりに回る。2 本の軸は同時には曲がらない：先に体から遠い側の軸 P2 だけが曲がり（節は上の部品に付いたまま、
//          下の部品だけが回る）、P2 が曲がり切ったら（first：ひじ 78°・ひざ 82°）、残りを体に近い側の軸 P1 が曲げる（節と下の部品が一緒に回る）。
//          だから節の回転は a のまわりに max(0, θ − first) と ρ
//   ・body：下の部品の装甲（骨 forebody）。下の軸 P2 で節につながり、曲げの全部 S と ρ（ねじり T は入れない）。節に対しても、いつも同じ
//          向きに曲がる
//   ・fore：下の部品の先（手首から先。ゲームの骨 forearm・shin）。向きは q のまま（ゲームと同じ）。body とは軸のまわりのねじりだけ違う
//          （手首で回る）。位置は 1 点で回すより少しずれる（曲がる軸が中心 C ではなく P1・P2 なので）
//   ひざはゲームで前後にしか曲がらないので、ρ は 0 で、body = fore（太もも・すねの骨のまま）。
//   ほとんどまっすぐ（θ < 0.25）のときは、ρ を θ に比例して小さくする（曲げはじめに上腕の筒がくるっと回らないよう）
// xs-editor/lowerasm.js（組み立て画面）と tools/lowergen/joint.mjs（関節チェック）が使う。座標はエディタの向き（+z が前）
import * as THREE from 'three';

/** 軸の位置 [up, down, first]（P1 = 中心 + up、P2 = 中心 − down、縦。first = 先に曲がる下の軸 P2 が曲がり切る角度、ラジアン）。ひざは正座で折りたためるよう軸の間が長く（0.2：太ももの裏 0.09 とふくらはぎ 0.11 が
 *  重ならない）、太ももが短く見えないよう、ほとんどすねの側に置く */
export const ELBOW_AXES = [0.05, 0.05, 78 * Math.PI / 180], KNEE_AXES = [0.04, 0.16, 82 * Math.PI / 180];
/** 曲がる向き（立った姿勢で、下の部品の先が倒れていく横の向き）：ひじは前、ひざは後ろ */
export const BEND = { elbow: new THREE.Vector3(0, 0, 1), knee: new THREE.Vector3(0, 0, -1) };
const DOWN = new THREE.Vector3(0, -1, 0), Y = new THREE.Vector3(0, 1, 0);
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * q（親の骨の中での下の部品の回転、THREE.Quaternion）と中心 C（THREE.Vector3、親の骨の座標）、軸の位置 [up, down, first] から、
 *   roll：上の部品の筒の回転（C を通る縦の軸のまわり）
 *   link：節の回転（linkAt = P1 のまわり）
 *   body：下の部品の装甲の回転、bodyAt：その入れ物（C のまわりに回す入れ物）の位置
 *   fore：下の部品の先の回転（= q）、foreAt：その入れ物（C のまわりに回す入れ物）の位置
 */
export function doubleJoint(q, C, [up, down, first = Infinity], bend) {
  const v = DOWN.clone().applyQuaternion(q), theta = Math.acos(Math.max(-1, Math.min(1, -v.y)));
  const flat = Math.hypot(v.x, v.z) > 1e-9;
  const rho = flat ? wrap(Math.atan2(v.x, v.z) - Math.atan2(bend.x, bend.z)) * Math.min(1, theta / 0.25) : 0;
  const axis = flat ? new THREE.Vector3().crossVectors(DOWN, v).normalize() : new THREE.Vector3(1, 0, 0);   // このまわりに回すと、下向きが v へ倒れる
  const roll = new THREE.Quaternion().setFromAxisAngle(Y, rho);
  const link = new THREE.Quaternion().setFromAxisAngle(axis, Math.max(0, theta - first)).multiply(roll);   // 先に下の軸だけが曲がる。曲がり切ってから、上の軸で節が回る
  const body = new THREE.Quaternion().setFromAxisAngle(axis, theta).multiply(roll);
  const P1 = C.clone().add(new THREE.Vector3(0, up, 0)), P2 = C.clone().add(new THREE.Vector3(0, -down, 0));
  const P2to = P1.clone().add(P2.clone().sub(P1).applyQuaternion(link));
  // 下の部品：x → R(x − P2) + P2to。C のまわりに回す入れ物なら、位置を P2to + R(C − P2) に
  const at = R => P2to.clone().add(C.clone().sub(P2).applyQuaternion(R));
  return { roll, link, linkAt: P1, body, bodyAt: at(body), fore: q.clone(), foreAt: at(q) };
}

/**
 * 足首：足（骨 foot）は、すねの下の端の横の軸（足首）のまわりに回る。ゲームの動き（poses.json）に足首の回転は無いので、ここで決める：
 * 足の裏が地面と平行になる向きへ回す（太ももとすねの前後の回転を打ち消す）。回る範囲は、つま先を下げる向きへ down・上げる向きへ up
 * （ラジアン）まで。裾が足を覆うすねは [0, 0]（足首は動かない）。[独自]
 * legX・shinX はゲームの骨の回転 x（太ももは前へ上げると正、すねは曲げると負）。戻り値もゲームの向き（負でつま先が下がる）
 */
export const ANKLE_RANGE = [0.8, 0.45];
export const ankleAngle = (legX, shinX, [down, up] = ANKLE_RANGE) => Math.max(-down, Math.min(up, -(legX + shinX)));
