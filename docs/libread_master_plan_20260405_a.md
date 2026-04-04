# LIB read 親チャット正史メモ 2026-04-05 a

更新日: 2026-04-05
用途: 親チャットで固めた方針・優先順位・運用ルールの統合正史ファイル
配置: `docs/libread_master_plan_20260405_a.md`
扱い:
- 以後の正史参照は、**まずこのファイルを優先**する
- `docs/libread_master_plan_20260404_a.md` は直前版の参考履歴として残してよい
- 正史更新が必要な時は、正史ファイルと更新内容を吟味して新しい正史ファイルを作り直す方式を使ってよい
- 古い正史ファイルは量が増えた時点でまとめて削除してよい

---

## 1. 直近の受理済み差分
- genre canonical整備MVP
  - `series.genres` を canonical source に確定
- 公開検索本実装MVP_後編
  - latest / weekly-new の genre 実データ棚を本実装
  - narration-popular は基盤未確定のため placeholder 維持
- popularity基盤整備MVP
  - `series_view_events` を新設
  - `recording_play_events` を新設
  - `src/lib/popularityEvents.ts` を追加
  - `/read` 到達時に series view event を保存
  - 実際の朗読再生開始時に recording play event を保存
  - `play_logs` は resume state 専用のまま維持

---

## 2. 現時点の canonical source
- tag canonical source = `series.tags`
- genre canonical source = `series.genres`
- likes current total = 既存取得可能
- bookmarks current total = 既存取得可能
- series views canonical event source = `series_view_events`
- narration plays canonical event source = `recording_play_events`
- `play_logs` は popularity source ではなく resume source

---

## 3. 現時点でできること / まだできないこと

### 3-1. できること
- views / narration plays の event source を保存開始できる
- likes / bookmarks / views / narration plays を将来的な popularity 集計へ接続する前提ができた
- true period popularity 用の時系列保存の入口ができた

### 3-2. まだ未完のこと
- event table から current total / period popularity を引く helper
- search 側の `provisionalPopularityScore` 置き換え
- narration-popular 棚の本実装
- views の重みを総合ポイントへ接続
- 不正増加対策の強化
- 閲覧数 * 1/100 + いいね + ブックマーク * 1/3 の本計算

---

## 4. 次に切るべきタスク

### 最優先
**popularity集計接続MVP**

### 目的
- event table から current total と period popularity を引く helper を作る
- search 側の暫定 popularity を本集計へ差し替える
- narration-popular を series 単位へ寄せるための接続点を作る

### この次にやること
- `series_view_events` / `recording_play_events` 集計 helper
- likes / bookmarks との合算 helper
- search page の popularity 計算差し替え
- narration-popular の最小本実装可否判定

---

## 5. 「見せる前提」優先順位
1. **SHOW-CORE**
   - 外向きUI整備 / 試作の見える化
   - 公開検索の popularity 本接続
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
   - repo / policy 整理

---

## 6. コード差し込みの厳格ルール
- 必ず repo 実体を確認して、前後の形に厳密に合わせる
- 差し込み位置が曖昧なら、部分差し込みではなく丸ごと置換用の完成コードを優先する
- 貼り付けた時に sibling 要素の列・インデントが1つでも崩れるコードは不合格扱いにする
- JSX の兄弟要素は同じ深さなら同じ字下げで揃える
- 部分差し込みで列ズレの危険がある時は、必ず親の開始タグから閉じタグまで含めた完成ブロックを出す
- 見た目上「たまたま動くかも」で済ませず、貼る前から整形済みの完成コードを出す

---

## 7. このファイルの扱い
- 親チャットで方針や優先順位が更新されたら、このファイル系統も更新する
- ユーザーが改善点・変更点を送ったら、原則このファイルへ統合する
- 子チャットへ前提を渡す時は、このファイルの内容を正史として扱う
- チャット本文だけで持たず、repo 内ファイルも基準にする
- 以後の正史参照は、原則このファイルを最新基準とする