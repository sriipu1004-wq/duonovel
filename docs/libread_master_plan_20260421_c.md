# LIB read 親チャット正史メモ 2026-04-21 c

更新日: 2026-04-21
配置: `docs/libread_master_plan_20260421_c.md`

## 今回の更新
- `自動朗読運用基盤MVP` を完了扱いにした
- global backlog を `nemo_generation_queue` に積み、pending を実際に消化できる半自動運用まで main 反映済みとして扱う
- 旧作品が自動朗読対象外に見える状態は解消済みと整理した
- 朗読未選択時の停止徹底、文クリック時の自動追尾ズレ軽減、旧 multipart 朗読再生互換の土台も今回の到達点に含める
- ただし完全自動運用は未完了で、現状は `Nemo Engine 起動 + dev server 起動 + /mypage を開いている` 条件が必要と明記する

## この更新の根拠
- `supabase/migrations/20260421183000_add_nemo_generation_queue.sql` で queue 基盤を追加
- `src/lib/recording/nemoGenerationQueue.ts` を追加
- `src/lib/recording/nemoAutoGeneration.ts` に backfill seed / pending claim / completed / failed 更新 / stale 再回収 / bulk lookup chunk 化を追加
- `src/app/api/recordings/nemo-autogen-backfill/route.ts` と `src/app/api/recordings/nemo-autogen-run-pending/route.ts` を追加
- `src/app/mypage/NemoAutogenBackfillRunner.tsx` と `src/app/mypage/page.tsx` で、公式朗読アカウント時のみ `/mypage` 上で定期 backfill + pending 1件消化を回す半自動運用を追加
- `src/lib/recording/nemoPlaybackCompatibility.ts` を追加し、旧 multipart 朗読再生互換の土台を追加
- `src/features/playback/EpisodePlayback.tsx` と `src/app/read/[seriesId]/[episodeNumber]/page.tsx` で文クリック時の表示位置基準改善、朗読未選択時の停止徹底を反映
- local HEAD と origin/main HEAD は `6d094f96373a6864ac38efcaa6e7f013237b63b1` で一致、working tree clean と報告済み

## 現時点の到達済み
- `公開route制限MVP`
- `アカウント作成規約・同意導線MVP`
- `新規作成導線強化MVP`
- `サーバー運用・スケーリング方針MVP`
- `軽量化・快適化MVP`
- `広告掲載準備MVP`
- `公開直前 全体最終確認MVP`
- `自動朗読更新権限・再生成判定MVP`
- `自動朗読運用基盤MVP`
- そのほか、朗読・検索・案内ページ・公開面整備の関連MVP群は既報どおり完了扱い

## 自動朗読運用基盤MVP の現到達点
- backlog を `nemo_generation_queue` に積み、pending を実際に消化できる状態まで到達
- 旧作品が自動朗読対象外に見える問題を解消
- `/mypage` を公式朗読アカウントで開いている間、Console 手動実行なしで backfill seed と pending 消化が進む半自動運用を追加
- 旧 multipart 朗読を読むための再生互換土台を追加
- 文クリック時の自動追尾ズレを改善
- 朗読未選択時の `再生開始` 表示を削除し、停止状態を徹底
- 実数確認として `missing_nemo_episode_count` は 414 → 390 まで減少したと報告済み

## 現在も残る注意点
- `/mypage` を開かなくても進む完全自動化は未実施
- PC を閉じても進む常駐 worker / cron 化は未実施
- 再生成 UI ボタン化は未実施
- `seriesId + episodeNumber` だけで再生成できる専用 route は未実施
- queue 監視 / 手動再試行用の管理 UI は未実施
- 追尾精度のさらなる詰めは未実施
- old multipart 旧データ再生互換の最終評価は未実施
- `contact` の実運用連絡先差し替え、本番広告タグ、ads.txt、CMP / 同意導線、広告審査前の最終法務・表示整合確認は未対応のまま

## 親チャットで再判定する次候補
1. `自動朗読完全自動運用化MVP`
   - `/mypage` を開かなくても進む常駐 worker / cron 化
   - PC を閉じても進む実運用化
2. `自動朗読再生成UI・管理UIMVP`
   - 再生成 UI ボタン
   - queue 監視
   - 手動再試行
3. `ルビ辞書継承・自動追尾精度改善MVP`
   - ルビ語の再出時読み継承
   - 後半でズレる自動追尾マーカー精度改善
4. `旧multipart再生互換最終評価MVP`
   - 旧データ互換の最終評価と必要なら追加補修
5. `広告本番接続・法務仕上げMVP`
   - 実連絡先差し替え
   - 本番広告タグ
   - ads.txt
   - CMP / 同意導線

## 次の優先順位
1. `自動朗読完全自動運用化MVP`
2. `自動朗読再生成UI・管理UIMVP`
3. `ルビ辞書継承・自動追尾精度改善MVP`
4. `旧multipart再生互換最終評価MVP`
5. `広告本番接続・法務仕上げMVP`

## 今の親チャット判断
- `自動朗読運用基盤MVP` は完了扱いでよい
- 次に着手する本命は `自動朗読完全自動運用化MVP`
- その次が `自動朗読再生成UI・管理UIMVP`
- その次が `ルビ辞書継承・自動追尾精度改善MVP`
- 広告本番接続と法務仕上げはその後でもよい

## 子チャット運用メモ
- 子20, 子21, 子22 は使わない
- 子23 は signup / auth / legal 系で使用済み
- 子24 は infra / scaling 系で使用済み
- 子25 は performance / rendering / asset 運用系で使用済み
- 子26 は広告掲載準備で使用済み
- 子27 は公開前最終確認で使用済み
- 子28 は自動朗読更新権限・再生成判定で使用済み
- 子29 は自動朗読運用基盤で使用済み
- 次差分は朗読自動運用の完全自動化寄りなので、新しい子チャットへ切ってよい

## コード差し込みルール
- 実ファイルの該当箇所を確認してから、その位置にそのまま貼れる字下げで出す
- 差し込み位置が危険なら丸ごと置換用コードを優先する
- sibling の列・インデントが崩れるコードは不合格
