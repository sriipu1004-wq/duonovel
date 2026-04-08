# LIB read 親チャット正史メモ 2026-04-07 b

更新日: 2026-04-07
用途: 親チャットで固めた方針・優先順位・運用ルールの統合正史ファイル
配置: `docs/libread_master_plan_20260407_b.md`
扱い:
- 以後の正史参照は、**まずこのファイルを優先**する
- `docs/libread_master_plan_20260407_a.md` は直前版の参考履歴として残してよい
- 正史更新が必要な時は、正史ファイルと更新内容を吟味して新しい正史ファイルを作り直す方式を使ってよい
- 古い正史ファイルは量が増えた時点でまとめて削除してよい

---

## 1. 直近の判断更新
- `VOICEVOX Nemo非同期自動生成MVP` の報告を受理する
- VOICEVOX Nemo 系で、以下は到達済みと扱う
  - 手動生成
  - storage 保存
  - recordings 登録
  - `/read` 再生
  - 同一話の再生成上書き
  - 発音辞書土台
  - 本文同期土台
  - 非同期自動生成導線
- ただし現在の最大ブロッカーは、**自動生成した朗読が `works/[seriesId]` の朗読者欄と公開朗読件数へ反映されないこと** とする
- そのため、優先順位は一時的に「発音辞書MVP」より前に、**works反映差分調査MVP** を置く

---

## 2. VOICEVOX Nemo 現在地

### 2-1. 到達済み
- VOICEVOX Nemo の手動生成導線は active のまま維持
- 生成、storage 保存、`recordings` 登録、`/read` 再生、句点ごとの間改善までは通過済み
- 非同期自動生成導線は page render 同期実行から外し、裏実行へ寄せた
- `EpisodePlayback` へ `generatedSentenceTimings` を渡し、本文同期土台を有効化した
- `read` 側では最新 recording を拾うようになり、古いデモ音声優先は解消方向へ進んだ

### 2-2. 今の最大未解決
- 自動生成した朗読が `works/[seriesId]` の朗読者欄へ反映されない
- 公開朗読件数へ自動生成分が乗らない
- 手動 Nemo は `works` 側へ出るが、自動生成 Nemo だけ出ない
- したがって、まずは **手動 Nemo row と自動生成 Nemo row の DB 実測差分確認** が最優先

### 2-3. 次チャットで最優先でやること
- 推測ではなく、Supabase 実測で手動 row / 自動生成 row を比較する
- 少なくとも次の列を並べて比較する
  - `id`
  - `series_id`
  - `episode_id`
  - `reader_id`
  - `reader_name`
  - `audio_storage_path`
  - `is_public`
  - `description`
  - `reader_comment`
  - `tags`
  - `created_at`
- その差分を見て
  - `works` 集計条件
  - `buildReaderCards`
  - `takeover update payload`
  のどこがズレているかを確定する

---

## 3. いま未完のこと
- 自動生成 Nemo の `works` 朗読者欄反映
- 自動生成 Nemo の公開朗読件数反映
- 手動 row と自動生成 row の DB 保存差の特定
- `popularityEvents` の赤エラー（別件）
- 通常朗読保存の non-blocking 化
- `approval_required` の承認直後フック
- queue / worker の本格化
- 漢字読みミス
- 本文と朗読位置の正確な同期ハイライト
- 作品条件に応じた自動生成トリガーの最終整理
- 間の強さの更なる微調整余地

---

## 4. 直近の音声系優先順位

### 最優先
**VOICEVOX Nemo works反映差分調査MVP**
- 自動生成 row と手動 row の DB 実測比較をやる
- `works` 朗読者欄 / 公開朗読件数へ乗らない原因を特定する
- まずは調査専用で切る

### 2位
**VOICEVOX Nemo works反映修正MVP**
- 上記差分原因が分かった後で、`works` 集計条件 / `buildReaderCards` / save payload のズレを修正する

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
- 低品質音声の量産を避けるため、works 反映修正・発音辞書・本文同期の後に置く

### 6位
**VOICEVOX Nemo 間 / 演出微調整MVP**

### 7位
**再生UX改善候補**
- 次話自動再生
- 連続再生時の朗読切替保持
- 朗読者固定再生
- 同一 reader のまま続けて聞く導線

---

## 5. 公開前の全体優先順位（現時点）

### 1位 完了
**SHOW-CORE: search微調整MVP**

### 2位
**SHOW-DEMO / FOUNDATION: VOICEVOX Nemo works反映差分調査MVP**
- 現在の主ブロッカー解消を最優先にする

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
- works 反映と初期品質が安定してから進める方が自然

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

## 6. 公開route制限MVP の位置づけ
- 公開route制限MVP は、事前集客ページを作って公開面の最小セットが揃った直後に入れる
- 事前集客ページを作る前に入れるのではなく、外部へ見せ始める直前に入れる

---

## 7. 今の親チャット判断
- `VOICEVOX Nemo非同期自動生成MVP` の報告は受理
- ただし次は品質改善へ一直線ではなく、**works 反映不全の原因特定を最優先** にする
- 子13はここで打ち切りでよい
- 新しい子チャットは、**VOICEVOX Nemo works反映差分調査MVP** として切るのが安全
- そこで DB 実測差分確認と `works` 集計 / 表示の原因特定に限定する

---

## 8. 子チャット運用の補足
- 分野の被る子チャットがあれば、それを優先して使う
- なるべく新規子チャットを作らない
- ただし今回はユーザー判断で子13を打ち切るため、新規子チャットにしてよい
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