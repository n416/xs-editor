// 重装の頭（高いドーム）：依頼主が Ver2 で組んだ頭（2026-10-05 に貼ってもらった部品の並び）を、頭蓋のカタログに 1 つの殻として入れたもの。
// 中身は 重装の頭（目なし）を縦 1.4 倍・前後 1.36 倍に伸ばしたものに、あご（見本 A）と モノアイ（目だけ）を、置かれていたとおりに付けたもの。
// 形は作り直していない：元の部品の面を、置かれていた倍率・回転・位置で写すだけ。首は別の部品のまま（見本「重装の頭（高いドーム…）」には首も入っている）
import { movePl, rotXAt } from '../xsasm-lib.js';
import heavy from './heavyhelm.js';
import mono from './monoeye.js';
import china from './china.js';

const S0 = [3, 3.1, 2.2], M0 = [0, 0, -0.125];   // 殻の標準の置き方（この部品はこれで置かれる）
/** 面の並びを、軸ごとに s 倍する */
const scalePl = (planes, s) => planes.map(p => { const n = [p[0] / s[0], p[1] / s[1], p[2] / s[2]], l = Math.hypot(...n); return [n[0] / l, n[1] / l, n[2] / l, p[3] / l, ...(p.length > 4 ? [p[4]] : [])]; });
/** 置いた部品（倍率 scal → 横軸まわりに rx 度 → 位置 mov）の面を、標準の置き方の殻の座標へ */
const bake = (def, { mov, rx = 0, scal }) => def.pieces.map(pc => ({ ...pc,
  planes: scalePl(movePl(rotXAt(scalePl(pc.planes, scal), -rx), mov.map((v, i) => v - M0[i])), S0.map(v => 1 / v)) }));
const by = (list, id) => [list].flat().find(d => d.id === id);

const KY = 4.338 / 3.1, KZ = 3 / 2.2, F = by(heavy, 'heavyhelmplain').face;
const shell = bake(by(heavy, 'heavyhelmplain'), { mov: M0, scal: [3, 4.338, 3] });
const chin = bake(china, { mov: [-0.0063, -0.2349, 0.0919], rx: 24, scal: [5.766, 4.764, 4.329] });
const eye = bake(by(mono, 'monoeyelens'), { mov: [0, 0.0573, 0.1279], scal: [2.919, 2.631, 1.509] }).map(pc => ({ ...pc, name: 'モノアイの' + pc.name }));

const tallheavyhelmplain = {
  id: 'tallheavyhelmplain', name: '重装の頭（高いドームと錣・目なし）', cat: '頭蓋', size: [0.26, 0.18 * KY, 0.3 * KZ],
  face: { eye: [F.eye[0] * KY, F.eye[1] * KZ], mouth: [F.mouth[0] * KY, F.mouth[1] * KZ, F.mouth[2]], under: [F.under[0] * KY, F.under[1] * KY / KZ], brow: [F.brow[0] * KY, F.brow[1] * KZ], lift: F.lift * KY },
  pieces: [...shell, ...chin],
};
const tallheavyhelm = { ...tallheavyhelmplain, id: 'tallheavyhelm', name: '重装の頭（高いドームと錣・モノアイ）', pieces: [...shell, ...chin, ...eye] };
export default [tallheavyhelm, tallheavyhelmplain];
