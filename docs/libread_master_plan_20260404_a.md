# LIB read 親チャット正史メモ 2026-04-04 a

更新日: 2026-04-04
用途: 親チャットで固めた方針・優先順位・運用ルールの統合正史ファイル
配置: `docs/libread_master_plan_20260404_a.md`
扱い:
- 以後の正史参照は、**まずこのファイルを優先**する
- `docs/libread_master_plan_20260402_d.md` は直前版の参考履歴として残してよい
- 正史更新が必要な時は、正史ファイルと更新内容を吟味して新しい正史ファイルを作り直す方式を使ってよい
- 古い正史ファイルは量が増えた時点でまとめて削除してよい

---

## 1. 正式名称
- サービス正式名称は **LIB read（ライブリード）**
- 旧暫定名「デュオノベル」は過去差分や旧文面に残っている場合があるが、新規作業では **LIB read** を正式名称として扱う

---

## 2. 直近の受理済み差分

### 2-1. 公開検索導線本実装MVP
- `/search` を公開検索ページとして本実装
- 公開トップの `さらに表示` を `/search` に寄せた
- ヘッダーの `作品を探す` を `/search` に寄せた
- 作品カードのタグ押下を `/search?tag=...` に寄せた

### 2-2. 公開検索大型拡張MVP
- 公開検索の上部操作 UI を整理
- selected filters の見せ方を整理
- client-side navigation 化でスクロール巻き戻りを抑制
- 総合人気6棚の外形を追加
- genre 仮表示を追加
- ただし popularity と genre は一部仮置きのまま

### 2-3. genre canonical整備MVP
- `series.genres text[]` を canonical source とする migration を追加
- `writeShared.ts` に `getSeriesGenres()` を追加
- 作品ジャンル管理画面を追加
- workspace から `ジャンル管理へ` 入れる導線を追加
- `/` と `/works/[seriesId]` の tag 表示 helper から genre fallback を外し、tag canonical を `series.tags` に限定
- `/search` で genre 実データ参照の土台を追加
- genre 候補が未保存時に消えないよう fallback を復旧

---

## 3. canonical source の確定

### 3-1. tag
- tag canonical source は **`series.tags`**

### 3-2. genre
- genre canonical source は **`series.genres`**
- write / search の両方で使う authoritative source として扱う

### 3-3. popularity 周辺の現状
- likes current total は取得可能
- bookmarks current total は取得可能
- `play_logs` は popularity 用イベントログではなく resume state 保存
- true period popularity は現行 repo では不可能寄り
- 閲覧数 canonical source は未確定
- 朗読視聴数 canonical source は未確定

---

## 4. 検索大型仕様の現時点の判断

### 4-1. すでに前へ進められるもの
- genre 3件選択
- tag 無制限
- selected filter UI
- genre / tag 候補 UI
- もっと見るの条件付き遷移
- genre 実データを使った検索絞り込み
- genre 5棚の本実装準備

### 4-2. まだ基盤不足で仮置き扱いのもの
- 閲覧数込み popularity
- true period popularity
- 朗読視聴人気の真の算出
- genre 別 popularity 棚の厳密集計

---

## 5. 次の判断

### 5-1. 次に切るタスク
**公開検索本実装MVP_後編**

### 5-2. その理由
- genre canonical が通ったので、検索UIの visible な要求を次に進められる
- popularity はまだ基盤不足だが、genre 実データを使う部分は先に前進できる
- いま popularity 基盤にすぐ行くより、先に genre 実装を検索本体へ通した方が SHOW-CORE の完成度が上がる

### 5-3. 後編で優先する内容
- `/search` の genre 候補と selected genres を `series.genres` 実データ前提へ寄せる
- genre 5棚の placeholder を実データベースへ置き換える
- 新着更新順 / 週間新作おすすめ順 の genre 棚を実データ化する
- 朗読視聴人気順は、朗読タグ付き判定元と popularity source が未確定なら、そこで止めて再判定材料を返す
- popularity 基盤が未確定な箇所は仮ロジックのまま広げない

### 5-4. その次に切るタスク
**popularity 基盤整備MVP**
- 閲覧数 canonical source
- 朗読視聴数 canonical source
- true period popularity に必要な時系列保存
- `総合ポイント = 閲覧数 * 1/100 + いいね数 + ブックマーク数 * 1/3` を真に計算する基盤

---

## 6. 「見せる前提」優先順位
1. **SHOW-CORE**
   - 外向きUI整備 / 試作の見える化
   - 公開検索本実装MVP_後編
2. **SHOW-DEMO**
   - 朗読と演出の見せ場強化
   - Google TTS 自動朗読生成
   - 著作権切れ作品の初期サンプル投入
3. **SHOW-PRELAUNCH**
   - 事前集客ページ
4. **MONETIZE-PRELAUNCH**
   - 広告掲載準備
5. **SHOW-BETA**
   - 小さくβ公開するための安定化
6. **MONETIZE-BETA**
   - 広告掲載と計測の実運用準備
7. **FOUNDATION**
   - popularity 基盤整備
   - repo / policy 整理

---

## 7. コード差し込みの厳格ルール
- 必ず repo 実体を確認して、前後の形に厳密に合わせる
- 差し込み位置が曖昧なら、部分差し込みではなく丸ごと置換用の完成コードを優先する
- 貼り付けた時に sibling 要素の列・インデントが1つでも崩れるコードは不合格扱いにする
- JSX の兄弟要素は同じ深さなら同じ字下げで揃える
- 部分差し込みで列ズレの危険がある時は、必ず親の開始タグから閉じタグまで含めた完成ブロックを出す
- 見た目上「たまたま動くかも」で済ませず、貼る前から整形済みの完成コードを出す

---

## 8. このファイルの扱い
- 親チャットで方針や優先順位が更新されたら、このファイル系統も更新する
- ユーザーが改善点・変更点を送ったら、原則このファイルへ統合する
- 子チャットへ前提を渡す時は、このファイルの内容を正史として扱う
- チャット本文だけで持たず、repo 内ファイルも基準にする
- 以後の正史参照は、原則このファイルを最新基準とする