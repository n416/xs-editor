// 肩関節（胴の骨 torso、腕はこの中心のまわりに回る）：骨格図の shoulder（x ±0.45・y 2.5）。原点はその中心、+x 側の 1 個（反対側は鏡像で置く）。
// 腕は前後に 212°（投げ）、内へ 71°・外へ 28° まで回るので、関節は球（どの向きに回しても形が変わらない）。胸の横から軸受けが出て球を支える。
// 上腕と肩アーマー（腕の骨）は球の表面に重ねて付き、回っても球から離れない。
// 種類：球・つば付きの軸受け（軸受けの胸の側につば）
import { XL, XH, prismX, ellipsoid, piece, DARK } from '../../xsasm-lib.js';

const J = { color: DARK, bone: 'torso' };
const ball = r => piece('肩関節', ellipsoid([r, r, r], [0, 0, 0], 12, [-60, -30, 0, 30, 60, -85, 85]), { ...J, pivot: 'arm' });
const socket = (r, x0 = -0.165) => piece('肩の軸受け', [...prismX(r, 8, 22.5), XL(x0), XH(-0.085)], { ...J, pivot: 'none' });   // 球の表面の少し中まで（中空の肩アーマーの殻が回っても入らないよう、球の外へ出る長さは短く）
export default [
  { id: 'shoulderjoint', name: '肩関節（球）', cat: '肩関節', size: [0.27, 0.2, 0.2], pieces: [ball(0.1), socket(0.07)] },
  { id: 'shoulderjointdrum', name: '肩関節（つば付きの軸受け）', cat: '肩関節', size: [0.27, 0.22, 0.22],
    pieces: [ball(0.1), socket(0.07, -0.17), piece('軸受けのつば', [...prismX(0.095, 12, 15), XL(-0.17), XH(-0.152)], { ...J, pivot: 'none' })] },
];
