# LIB read 親チャット正史メモ 2026-04-07 c

更新日: 2026-04-07
用途: 親チャットで固めた方針・優先順位・運用ルールの統合正史ファイル
配置: `docs/libread_master_plan_20260407_c.md`
扱い:
- 以後の正史参照は、**まずこのファイルを優先**する
- `docs/libread_master_plan_20260407_b.md` は直前版の参考履歴として残してよい
- 正史更新が必要な時は、正史ファイルと更新内容を吟味して新しい正史ファイルを作り直す方式を使ってよい
- 古い正史ファイルは量が増えた時点でまとめて削除してよい

---

## 1. 直近の判断更新
- `VOICEVOX Nemo works反映差分調査MVP` の報告を受理する
- 原因特定は完了と扱う
- 主因は2本に切れた
  1. 同名 `VOICEVOX Nemo / ノーマル` の `reader_id` 分裂
  2. episode 7〜9 が `is_published = false`
- 追加で、7〜9 は予約投稿到達後も投稿済みに変わっていない可能性が高い
- そのため、いまの主ブロッカーは **Nemo works 反映単体ではなく、予約投稿公開状態不達 + reader_id 分裂の複合** とする

---

## 2. 現在地の要約
- VOICEVOX Nemo 系でここまで到達済み
  - 手動生成
  - storage 保存
  - recordings 登録
  - `/read` 再生
  - 同一話の再生成上書き
  - 発音辞書土台
  - 本文同期土台
  - 非同期自動生成導線
- `read` 側はかなり動く
- 現在の主ブロッカーは `works/[seriesId]` 朗読者欄 / 公開朗読件数への自動生成反映不全

---

## 3. 調査で確定したこと

### 3-1. recordings 実測
- `VOICEVOX Nemo / ノーマル` row は 9件
- 全件同一 `series_id`
- 全件 `is_public = true`
- 全件 `reader_name = VOICEVOX Nemo / ノーマル`
- `reader_user_id` は全件 `NULL`
- `reader_id` は2種類に分裂
  - `8823cff6-0a1d-4bc5-85d7-efa43f6630c3` が 7件
  - `fd558cf9-c941-497a-b2c3-dff5cf58dddc` が 2件

### 3-2. env 実測
- `VOICEVOX_NEMO_AUTOGEN_USER_ID = 8823cff6-0a1d-4bc5-85d7-efa43f6630c3`

### 3-3. episodes join 実測
- episode 1〜6 は `is_published = true`
- episode 7〜9 は `is_published = false`

### 3-4. ここから分かること
- `row 未保存`
- `is_public false`
- `series_id 不一致`
- `reader_user_id 分裂`
は主因ではない
- 主因は
  1. `reader_id` 分裂
  2. `is_published` 未反映
- 後者は **予約投稿不達の可能性が高い**

---

## 4. いま未完のこと
- 予約投稿到達後に `is_published` を `true` にする処理の場所
- 自動朗読生成が非公開 episode に対して走る条件
- `reader_id` を保存側で統一するか表示側で吸収するか
- 既存 row の backfill 要否
- 漢字読みミス
- 本文と朗読位置の正確な同期ハイライト
- 作品条件に応じた自動生成トリガーの最終整理
- 間の強さの更なる微調整余地

---

## 5. 直近の優先順位

### 最優先
**予約投稿公開状態不達調査MVP**
- 予約投稿到達後も `is_published` が `true` にならない原因を特定する
- 公開状態更新処理の場所
- 実行条件
- ジョブ / フック / cron 相当の有無
- 予約到達後も投稿済みに変わらない現象の再確認
をやる

### 2位
**VOICEVOX Nemo works反映修正MVP**
- `reader_id` 分裂をどう扱うか決める
- 保存側で統一するか
- `works` 表示側で吸収するか
- 既存 row の backfill をやるか
を切る

### 3位
**VOICEVOX Nemo 発音辞書MVP**
- 漢字読みミス、固有名詞、当て字、作品固有の読みを修正できるようにする
- 最初は UI なしでもよい
- まずはコード側定義 or JSON 定義で差し込める形にする
- 優先順位は `episode個別 > series共通 > 全体共通`
- 将来 UI を足す前提で、辞書適用関数は分離しておく

### 4位
**VOICEVOX Nemo 本文同期MVP**
- 朗読中に「いま読んでいる箇所」を正しく強調表示できるようにする
- chunk 単位 timing を生成し、`read` と `EpisodePlayback` で同期表示を行う

### 5位
**VOICEVOX Nemo 自動生成トリガーMVP**
- 品質改善後に入る
- works 反映不全と公開状態不達を解消してから進める

### 6位
**VOICEVOX Nemo 間 / 演出微調整MVP**

### 7位
**再生UX改善候補**
- 次話自動再生
- 連続再生時の朗読切替保持
- 朗読者固定再生
- 同一 reader のまま続けて聞く導線

---

## 6. 公開前の全体優先順位（現時点）

### 1位 完了
**SHOW-CORE: search微調整MVP**

### 2位
**FOUNDATION / SHOW-DEMO: 予約投稿公開状態不達調査MVP**
- 作品公開フロー側の主不具合を先に特定する

### 3位
**SHOW-DEMO / FOUNDATION: VOICEVOX Nemo works反映修正MVP**

### 4位
**SHOW-DEMO: VOICEVOX Nemo 発音辞書MVP**

### 5位
**SHOW-DEMO: VOICEVOX Nemo 本文同期MVP**

### 6位
**SHOW-DEMO / FOUNDATION: VOICEVOX Nemo 自動生成トリガーMVP**

### 7位
**SHOW-DEMO: VOICEVOX Nemo 間 / 演出微調整MVP**

### 8位
**SHOW-DEMO: 著作権切れ作品の初期サンプル投入MVP**
- works 反映と公開状態が安定してから進める方が自然

### 9位
**SHOW-CORE: 読むページ / ホームの外向き印象調整MVP**

### 10位
**SHOW-PRELAUNCH: 事前集客ページ整備MVP**

### 11位
**SHOW-CORE / SHOW-PRELAUNCH: 公開route制限MVP**
- 事前集客ページを作って公開面の最小セットが揃った直後に入れる
- 外部へ見せ始める直前に実施する

### 12位
**MONETIZE-PRELAUNCH: 広告掲載準備MVP**

### 後回しでよいもの
- 朗読タグ語彙固定MVP
- 朗読視聴人気 genre 5棚化MVP
- 期間人気本実装MVP
- 不正増加対策MVP
- popularity 深掘り全般
- Google TTS 実装本体（保留中）
- VOICEPEAK 実装本体（現時点では主軸外）

---

## 7. 今の親チャット判断
- `VOICEVOX Nemo works反映差分調査MVP` は受理
- ただし次は `works` 反映修正へ一直線ではなく、**予約投稿公開状態不達調査MVP** を先にやる
- 理由は、episode 7〜9 の `is_published = false` が `works` 反映不全の主因の片方であり、Nemo 以外にも波及する可能性があるため
- その後に **VOICEVOX Nemo works反映修正MVP** をやる
- その次に **VOICEVOX Nemo 発音辞書MVP** に戻る

---

## 8. 子チャット運用の補足
- 分野の被る子チャットがあれば、それを優先して使う
- なるべく新規子チャットを作らない
- ただし今回はユーザー判断で子13を打ち切っているため、新規子チャットにしてよい
- 新規子チャットを切る時は、必ず前提文を付ける

---

## 9. コード差し込みの厳格ルール
- 必ず repo 実体を確認して、前後の形に厳密に合わせる
- 差し込み位置が曖昧なら、部分差し込みではなく丸ごと置換用の完成コードを優先する
- 貼り付けた時に sibling 要素の列・インデントが1つでも崩れるコードは不合格扱いにする
- JSX の兄弟要素は同じ深さなら同じ字下げで揃える
- 部分差し込みで列ズレの危険がある時は、必ず親の開始タグから閉じタグまで含めた完成ブロックを出す
- 見た目上「たまたま動くかも」で済ませず、貼る前から整形済みの完成コードを出す

---

## 10. このファイルの扱い
- 親チャットで方針や優先順位が更新されたら、このファイル系統も更新する
- ユーザーが改善点・変更点を送ったら、原則このファイルへ統合する
- 子チャットへ前提を渡す時は、このファイルの内容を正史として扱う
- チャット本文だけで持たず、repo 内ファイルも基準にする
- 以後の正史参照は、原則このファイルを最新基準とする