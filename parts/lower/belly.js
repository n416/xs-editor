// 腰の関節：縦の柱。上半身はこの中心（骨格図の belly、y 2.0）のまわりに回る（回転の中心）。原点はその中心。
// 腰（hips 骨）の部品。下端は腰の帯に差し込み、上端は胸の下に入る。腹（上半身の部品）が帯まで下りてくるので、外からは見えない。
// 種類：12 角柱に輪 1 本・蛇腹（細い輪を重ねる）・前に装甲（胸が前へ傾いても当たらない高さまで）
import { YH, YL, ZL, both, P, prismY, piece, DARK } from '../../xsasm-lib.js';
import { crown, steps } from './shape.js';

const B = { color: DARK, bone: 'hips' };
const core = r => piece('腹', [...prismY(r, 12, 15), YL(-0.165), YH(0.14)], { ...B, pivot: 'torso' });
const ring = (name, r, y0, y1) => piece(name, [...prismY(r, 12, 0), YL(y0), YH(y1)], { ...B, pivot: 'none' });
export default [
  { id: 'belly', name: '腰の関節', cat: '腰の関節', size: [0.28, 0.305, 0.28], pieces: [core(0.125), ring('腹の輪', 0.138, 0.0, 0.03)] },
  { id: 'bellybellows', name: '腰の関節（蛇腹）', cat: '腰の関節', size: [0.28, 0.305, 0.28],
    pieces: [core(0.11), ...[0, 1, 2].map(i => ring(`蛇腹 ${i + 1}`, 0.138, -0.045 + i * 0.024, -0.031 + i * 0.024))] },   // 輪は帯の上（y −0.05）から、胸が傾いても届かない高さ（y 0.02）までに並べる
  { id: 'bellyarmor', name: '腰の関節（前に装甲）', cat: '腰の関節', size: [0.28, 0.305, 0.32],
    pieces: [core(0.125), ring('腹の輪', 0.138, -0.01, 0.02),
      piece('腹の装甲', [...crown('z', 1, (x, y) => 0.165 - 1.5 * x * x - 1.5 * (y + 0.03) ** 2, steps(-0.09, 0.09, 4), steps(-0.1, 0.03, 3)),
        ZL(0.1), YL(-0.1), YH(0.03), ...both(P([1, 0, 0.5], [0.09, 0, 0.13])), P([0, 1, 1.2], [0, 0.03, 0.15])])] },
];
