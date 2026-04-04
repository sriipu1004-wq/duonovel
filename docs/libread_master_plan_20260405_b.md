# LIB read 親チャット正史メモ 2026-04-05 b

更新日: 2026-04-05
用途: 親チャットで固めた方針・優先順位・運用ルールの統合正史ファイル
配置: `docs/libread_master_plan_20260405_b.md`
扱い:
- 以後の正史参照は、**まずこのファイルを優先**する
- `docs/libread_master_plan_20260405_a.md` は直前版の参考履歴として残してよい
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
  - `/read` 到達時に series view event を保存
  - 実際の朗読再生開始時に recording play event を保存
- popularity集計接続MVP
  - `src/lib/popularity.ts` を新設
  - likes / bookmarks / views / narration plays を series 単位で current / period 集計できる helper を追加
  - search の `provisionalPopularityScore` を views 込み popularity score へ接続
  - 総合人気6棚を、更新日ベース寄りから「その期間で獲得した popularity 値順」寄りへ前進
  - narration-popular 用の series 単位 narration count 基盤を helper 側に準備

---

## 2. 現時点の canonical source
- tag canonical source = `series.tags`
- genre canonical source = `series.genres`
- likes current total = 既存取得可能
- bookmarks current total = 既存取得可能
- series views canonical event source = `series_view_events`
- narration plays canonical event source = `recording_play_events`
- popularity 集計 helper = `src/lib/popularity.ts`
- `play_logs` は popularity source ではなく resume source

---

## 3. 現時点で前進したこと
- current total として
  - likes
  - bookmarks
  - views
  - narration plays
  を helper から series 単位で取得できる状態になった
- period popularity として
  - 指定期間内 likes
  - 指定期間内 bookmarks
  - 指定期間内 views
  - 指定期間内 narration plays
  を helper から series 単位で取得できる方向に寄った
- search 人気順は views 込み popularity score ベースへ前進した
- 総合人気6棚は、日間 / 週間 / 月間 / 四半期 / 年間 / 累計 の popularity ベースへ前進した
- narration-popular は未実装だが、series 単位 canonical source 集計の土台はできた

---

## 4. まだ未完のこと
- narration-popular タブ本実装
- 期間人気の厳密化
- 不正増加対策強化
- likes / bookmarks の created_at 不在環境で period 集計をどう扱うかの最終整理
- current total / period popularity の高速化や集計最適化

---

## 5. stash に関する扱い
- popularity集計接続MVP の同期時、`EpisodePlayback.tsx` の別系統未整理差分は stash 退避した
- 現在の stash 情報
  - `stash@{0}: On main: temp episodeplayback before popularity sync`
  - `stash@{1}: On main: temp-episodes-new-after-bgm-report`
- repo/main 自体は clean だが、ローカルには別系統の stash が残っている
- 今後の子チャットでは、**popularity 系の継続と EpisodePlayback 系 stash 回収を同じ差分に混ぜない**

---

## 6. 次の判断

### 6-1. 最優先
**narration-popular本実装MVP**

### 理由
- `recording_play_events` と series 単位 narration count 基盤がすでに入った
- `src/lib/popularity.ts` により search との接続土台もある
- 次は placeholder のまま止めていた narration-popular を UI 棚へつなぐのが自然
- 今の流れなら、visible な改善としても分かりやすい

### 6-2. 第二候補
**期間人気本実装MVP**
- likes / bookmarks の period 厳密化
- created_at 有無での挙動整理
- search での期間 popularity 表示の精度改善

### 6-3. 第三候補
**不正増加対策MVP**
- session 単位重複抑制の強化
- user / session / time window ベースの整理
- popularity event table の abuse 耐性向上

---

## 7. 「見せる前提」優先順位
1. **SHOW-CORE**
   - 外向きUI整備 / 試作の見える化
   - narration-popular本実装MVP
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
   - 期間人気厳密化
   - 不正増加対策
   - repo / policy 整理

---

## 8. コード差し込みの厳格ルール
- 必ず repo 実体を確認して、前後の形に厳密に合わせる
- 差し込み位置が曖昧なら、部分差し込みではなく丸ごと置換用の完成コードを優先する
- 貼り付けた時に sibling 要素の列・インデントが1つでも崩れるコードは不合格扱いにする
- JSX の兄弟要素は同じ深さなら同じ字下げで揃える
- 部分差し込みで列ズレの危険がある時は、必ず親の開始タグから閉じタグまで含めた完成ブロックを出す
- 見た目上「たまたま動くかも」で済ませず、貼る前から整形済みの完成コードを出す

---

## 9. このファイルの扱い
- 親チャットで方針や優先順位が更新されたら、このファイル系統も更新する
- ユーザーが改善点・変更点を送ったら、原則このファイルへ統合する
- 子チャットへ前提を渡す時は、このファイルの内容を正史として扱う
- チャット本文だけで持たず、repo 内ファイルも基準にする
- 以後の正史参照は、原則このファイルを最新基準とする