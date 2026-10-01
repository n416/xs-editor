// 動力パイプをランダムに作る（組み立て画面の「動力パイプをランダムに」）。押すたびに通り道・ふくらみ・太さ・輪の数を選び、
// 左右 1 組の動力パイプを作る。作ったパイプはカタログの部品ではなく、置いた部品に作り方（gen）を持たせ、そこから形を作り直す。
//   胸から頭へ（胴の骨）：胸の上の前の角から、外と前へふくらんで頭の下の左右へ。原点は胸の下端の中心（y 2.1）
//   胸から背中へ（胴の骨）：胸の前の下の外の角から、脇の下を回って背中へ。ふつうは横で x 0.31 より内
//   肩から腕へ（腕の骨）：肩関節の球の前下の外寄りから、前へふくらんで上腕の前の外へ。原点は肩関節の中心（x ±0.45・y 2.5）、+x 側の 1 本
// 管は当たり判定なし（parts/pipe.js）なので、4 割は大きく張り出す（big）：頭へは外と前へ大きな輪、背中へは横 x 0.44 まで出て下がり、
// 腕へは前へ大きくふくらんで上腕の下のほうへ。止まった姿勢で肩アーマーや上腕を突き抜けない範囲（腕を振ると重なる）
import { bellows, fitting } from '../pipe.js';

const bez = (a, b, c, n) => Array.from({ length: n + 1 }, (_, i) => { const t = i / n, p = (1 - t) ** 2, q = 2 * t * (1 - t), r = t * t; return [0, 1, 2].map(k => p * a[k] + q * b[k] + r * c[k]); });
const mx = p => [-p[0], p[1], p[2]];
const ROUTE_NAME = { head: '胸から頭へ', back: '胸から背中へ', arm: '肩から腕へ' };

/** 作り方 gen から部品の形（カタログの部品と同じ形）を作る */
export function pipeDef(gen) {
  const { route, rr, n } = gen, rc = rr * 0.76, name = `動力パイプ（${ROUTE_NAME[route]}${gen.big ? '・大きく張り出す' : ''}・ランダム）`;
  const id = `pipegen·${gen.key}`;
  if (route === 'arm') {
    const path = bez(gen.a, gen.b, gen.c, n);
    const pieces = [...bellows(path, '動力パイプ', rr, rc), fitting(path[0], '動力パイプの受け（肩）', rr * 0.9, [0.03, -0.04, 0.02], 0.45),
      fitting(path[n], '動力パイプの受け（腕）', rr * 0.9, [gen.c[0], gen.c[1], 0], 0.4)].map(pc => ({ ...pc, bone: 'arm', pivot: 'none' }));
    return { id, name, cat: '肩の動力パイプ', size: [0.2, 0.3, 0.2], pieces };
  }
  const pieces = [1, -1].flatMap(s => {
    const S = p => (s > 0 ? p : mx(p)), t = s > 0 ? '+x' : '−x';
    if (route === 'head') {
      const path = bez(S(gen.a), S(gen.b), S(gen.c), n);
      return [...bellows(path, `動力パイプ（${t}）`, rr, rc), fitting(path[0], `動力パイプの受け（胸・${t}）`, rr * 0.9, S([gen.a[0] - 0.05, gen.a[1] - 0.08, gen.a[2] - 0.08]), 0.4),
        fitting(path[n], `動力パイプの受け（頭・${t}）`, rr * 0.9, S([0.03, gen.c[1], 0.05]), 0.4)];
    }
    // 胸から背中へ：前（a 0）から後ろ（a ≈ π）へ、横を回る
    const path = Array.from({ length: n + 1 }, (_, i) => {
      const a = Math.PI * 0.95 * i / n;
      return S([gen.x0 + gen.out * Math.sin(a), gen.y0 - gen.droop * Math.sin(a), gen.zr * Math.cos(a) - 0.01]);
    });
    return [...bellows(path, `動力パイプ（${t}）`, rr, rc), fitting(path[0], `動力パイプの受け（前・${t}）`, rr * 0.9, S([0.1, path[0][1], 0.1]), 0.35),
      fitting(path[n], `動力パイプの受け（後ろ・${t}）`, rr * 0.9, S([0.1, path[n][1], -0.1]), 0.35)];
  });
  return { id, name, cat: '胴の動力パイプ', size: [0.6, 0.25, 0.4], pieces };
}

/** ランダムな作り方。rnd は 0〜1 の乱数 */
export function randomPipeGen(rnd = Math.random) {
  const r = (a, b) => a + (b - a) * rnd(), pick = l => l[Math.floor(rnd() * l.length)];
  const route = pick(['head', 'back', 'arm']), rr = Math.round(r(0.018, 0.036) * 1000) / 1000, key = Math.floor(rnd() * 1e9).toString(36);
  if (rnd() < 0.4) {
    const big = true;
    if (route === 'head') return { route, big, rr, n: Math.round(r(8, 10)), key, a: [r(0.17, 0.22), r(0.5, 0.54), r(0.11, 0.15)], b: [r(0.3, 0.38), r(0.63, 0.7), r(0.24, 0.32)], c: [r(0.08, 0.12), r(0.66, 0.71), r(0.1, 0.15)] };
    if (route === 'back') { const x0 = r(0.17, 0.2); return { route, big, rr, n: Math.round(r(9, 12)), key, x0, out: r(0.36 - x0, 0.44 - x0), y0: r(0.25, 0.3), droop: r(0.05, 0.12), zr: r(0.2, 0.235) }; }
    return { route, big, rr, n: Math.round(r(7, 9)), key, a: [r(0.03, 0.045), r(-0.1, -0.08), r(0.055, 0.07)], b: [r(0.09, 0.14), r(-0.3, -0.24), r(0.2, 0.26)], c: [r(0.12, 0.14), r(-0.42, -0.36), r(0.08, 0.09)] };
  }
  if (route === 'head') {
    const a = [r(0.15, 0.23), r(0.5, 0.54), r(0.1, 0.16)], c = [r(0.08, 0.12), r(0.66, 0.71), r(0.1, 0.15)];
    const b = [r(0.22, 0.28), r(0.62, 0.69), r(0.16, 0.23)];
    return { route, rr, n: Math.round(r(6, 9)), key, a, b, c };
  }
  if (route === 'back') { const x0 = r(0.17, 0.2); return { route, rr, n: Math.round(r(7, 10)), key, x0, out: r(0.06, Math.max(0.065, 0.305 - rr - x0)), y0: r(0.25, 0.32), droop: r(0.02, 0.08), zr: r(0.19, 0.22) }; }
  return { route, rr, n: Math.round(r(5, 8)), key, a: [r(0.03, 0.045), r(-0.1, -0.08), r(0.055, 0.07)], b: [r(0.05, 0.09), r(-0.22, -0.17), r(0.13, 0.17)], c: [r(0.11, 0.135), r(-0.34, -0.27), r(0.08, 0.09)] };
}
