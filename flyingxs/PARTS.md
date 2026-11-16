# 空を飛ぶ XS：部位ごとに作る時の決まり

体を部位ごとのスレッドで並行して作る。組み上げは `node out/flyingxs/assemble.mjs <出力.json>`。

## 分け方（1 部位 = 1 ファイル = 1 スレッド）

| 部位 | ファイル | 中身 |
|---|---|---|
| 頭 | `parts/head.mjs` | 兜・とさか・目の溝・モノアイ・口の箱・縦の板・首 |
| 胴と背中 | `parts/torso.mjs` | 胸（通気口・五角形の板）・腹・腰・股・動力パイプ・背中のランドセル・LWC の受け 2 つ・背中の噴射口 |
| 肩と腕 | `parts/arms.mjs` | 肩の装甲（外の筒・下のとげ）・上腕・ひじ・前腕・手（拳） |
| 脚 | `parts/legs.mjs` | 股関節・太もも・ひざ・すね（外のひれ）・ふくらはぎの噴射口・足 |
| LWC | `lwc/`（別の機体ファイル） | 飛行ユニット。体とは別 |

自分の部位のファイル以外は書かない。ほかの部位の物が要る時（付け根の位置など）は、そのファイルを読むだけ。

## 座標

- 機体エディタ Ver2 の単位。背 3（= 18 m）、足の裏 y = 0、+y が上、+z が前、+x が機体の左。
- Tripo の形 `flying-xs-body.glb` は背 1.0（足の裏 0）なので、3 倍すると同じ座標になる。
- 左右のある物は −x の側だけ作り、ブロックの `mirror: true` で写す（`out/amphib1/build.mjs` と同じ）。

## 部品

- ブロックの書き方は `out/flyingxs/body.xsunit.json` と `out/amphib1/build.mjs` の `block` を見る（kind：`hull`・`loft`・`bellows`・`extrude` など、`bone`、`mirror`、`glow`）。
- 名前に骨の役目の言葉を入れる（頭・胴・腰・肩・上腕・前腕・手・太もも・すね・足・背中）。手は「手」「手の甲」だけ。噴射口は「…噴射口の殻」「…噴射口ののど」（`out/amphib1/import-procedure.md` 4 章）。
- 色：装甲 `#78877f`、骨組み `#292e31`、光 `#ff3038`。
- 作り方の目安：形は Tripo の形の頂点から凸の塊を当てる（`xs-editor/xsasm-lib.js` の `planesFromPoints`）。凹みは塊を分けて残す。正本の絵 `ref/body-3view-D1.png` と並べて同じ物に見えること。
- 三角形の割り当て（近距離、目安）：頭 2,500・胴と背中 5,000・肩と腕 4,000・脚 3,500。

## 撮る・見る

- 組み上げ：`node out/flyingxs/assemble.mjs out/flyingxs/<名>/unit.json`（自分の部位だけなら名前を足す）。
- 撮る：エディタは :8831 で出ている（落ちていたら `python -m http.server 8831 --bind 127.0.0.1 --directory xs-editor` をリポジトリの直下で）。`node out/flyingxs/shots.mjs <unit.json> <出力の頭>`（エディタの描画を正面・横・後ろ・上・斜め・頭の上・頭の正面で撮る）。Blender で GLB を写した絵は向きがずれるので使わない。
- 並べる：`python cmp.py <フォルダ>`（out/flyingxs で動かす）（フォルダの ed_front・ed_side・ed_back を正本の下に並べる）。
- 書き出しの確かめ：`node out/flyingxs/exportglb.mjs b_flyxs <unit.json> <出力.glb>`（浮いた部品・関節・三角形）。

## レビュー

レビュアー：`local_001e1263-9d98-42ea-a5bd-5981c99052c8`（SendMessage）。絵は、自分の部位を全体の中に置いた絵（ほかの部位は今ある物で）と、部位に寄った絵を送る。最初の行に部位の名前を書く。

## 指摘の受け取り方（2026-11-14 追記）

レビュアーは送信の上限で止まることがあるので、指摘はファイルに書く：
`C:\Users\nakam\AppData\Local\Claude-Data\claude_pzs8sxrjxfjjc\side-session-notes\local_ef373c11-f2da-49f4-bd98-148ffe198a0a\review-<部位>-<回>.md`
絵を送ったら、返事を待たずにこのフォルダを見て、自分の部位の新しい review ファイルが出たら読んで直す。

## 見本は Tripo の形（2026-11-14 依頼主の指摘で変更）

ズゴッキオの時と同じく、見比べる見本は **Tripo の 3D の形**。2D の絵（D1）は外形の確かめだけに使う。
- 2 枚組を作る：`node pairshots.mjs flying-xs-body.glb pair/tripo`（済み）と、自分の組みを `node assemble.mjs <dir>/unit.json` → `node pairshots.mjs <dir>/unit.json <dir>/mine`、`pair/tripo_*` を `<dir>` に写して `python pair.py <dir>`。
- できる物：`<dir>/pair_<部位>.png`（full・head・torso・arm・legs）。左＝Tripo、右＝組んだ物。正面・横・後ろ・斜め。同じカメラ・同じ明かり・エディタの目印は隠す。
- 外形の線だけで合格にしない。装甲の板の丸み・膨らみ・段・継ぎ目・厚み・関節の機械の見え方を、左の Tripo に寄せる。
