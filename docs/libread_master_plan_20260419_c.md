# LIB read 親チャット正史メモ 2026-04-19 c

更新日: 2026-04-19
配置: `docs/libread_master_plan_20260419_c.md`

## 今回の更新
- 子25の正式報告に基づき、`軽量化・快適化MVP` を完了扱いにした
- 子25では
  - 公開主要導線 `/` `/works/[seriesId]` `/read/[seriesId]/[episodeNumber]` の初段軽量化
  - `/search` の棚生成軽量化
  まで完了したものとして扱う
- これにより、公開前の残優先順位を整理し直した
- 次に着手する本命は `広告掲載準備MVP` とする

## この更新の根拠
### 軽量化・快適化MVP 初段
- `src/app/page.tsx` でホーム録音集計を表示対象 seriesId ベースへ絞る変更を反映
- `src/lib/publicWorks.ts` で recording aggregate を seriesId 指定対応へ変更
- `src/lib/publicRead.ts` で read ページ用 recordings 取得を narrow select 優先へ変更
- `src/app/works/[seriesId]/page.tsx` で目次タブ表示時の不要な全話録音取得を条件付きへ変更
- `src/app/read/[seriesId]/[episodeNumber]/page.tsx` で Nemo 朗読以外の timing asset fetch を停止
- local HEAD と origin/main HEAD は `598e75ef6f84e7d46a5c50ecba675551c7770a84` で一致、working tree clean と報告済み

### 検索棚生成軽量化MVP
- `src/app/search/page.tsx` のみを対象に、安全な計算削減を先行したと報告されている
- `selectedPopularityMap` を `order === "popular"` の時だけ生成するよう変更
- overall / latest / weekly-new / narration の棚生成を active tab 時だけに限定
- latest / weekly-new の placeholder 生成も必要時だけに限定
- weekly-new 用の補助計算を必要時だけに限定
- results 一覧側では optional chaining で `selectedPopularityMap` 非生成時でも安全に動くよう整理
- local HEAD と origin/main HEAD は `079fdb094ba50c7bca5394d3559f058a6c208da7` で一致、working tree clean と報告済み

## 現時点の到達済み
- `search微調整MVP`
- `予約投稿公開状態不達調査MVP`
- `予約投稿公開判定統一MVP`
- VOICEVOX Nemo の手動生成 / storage 保存 / recordings 登録 / `/read` 再生 / 同一話再生成上書き / 非同期自動生成導線
- `VOICEVOX Nemo works反映修正MVP 〜 長文時の自動分割保存MVP 〜 再生UI/朗読者欄/続きを読む導線改善`
- `公開必須ページMVP`
- `FAQ・使い方・取り扱い説明MVP`
- `運営状況・お知らせMVP`
- `VOICEVOX Nemo発音辞書MVP`
- `VOICEVOX Nemo 自動生成トリガーMVP`（ユーザー報告ベース）
- `予約投稿物理状態遷移MVP`（ユーザー報告ベース）
- `VOICEVOX Nemo 本文追尾・文クリック精度改善MVP`（ユーザー報告ベース）
- `VOICEVOX Nemo間・演出微調整MVP`
- `一般ユーザー朗読導線 仕様固定MVP`
- `一般ユーザー朗読録音・アップロードMVP`
- `音声保存形式整理MVP`
- `人力朗読本文同期MVP`
- `人力朗読追尾精度改善MVP`
- `朗読管理トップ公開UI調整MVP`
- `朗読制作ページ公開UI調整MVP`
- `朗読状態表示・自動朗読修正MVP`
- `著作権切れ作品の初期サンプル投入MVP`（進行開始・一部実投入済み）
- `readページ フッター / 栞 / 設定永続化整理MVP`
- `投入済みサンプル作品の整理方針固定`
- `投入済みサンプル作品データ補正MVP`
- `読むページ / ホームの外向き印象調整MVP`（ユーザー報告ベース）
- `著作権切れ作品向け朗読投稿開放MVP`（ユーザー報告ベース）
- `朗読投稿規約・同意導線MVP`
- `事前集客ページ整備MVP`
- `公開route制限MVP`
- `アカウント作成規約・同意導線MVP`
- `新規作成導線強化MVP`
- `サーバー運用・スケーリング方針MVP`
- `軽量化・快適化MVP`

## 軽量化・快適化MVP の現到達点
- 公開主要導線 `/` `/works/[seriesId]` `/read/[seriesId]/[episodeNumber]` の初段軽量化を反映済み
- `/search` の棚生成軽量化を反映済み
- 無駄取得削減、不要棚生成削減、不要 popularity 計算削減まで main へ同期完了
- 子25は完了扱いでよい

## 現在も残る注意点
- `src/lib/popularity.ts` 側での更なる使い回し最適化余地あり
- popularity dataset 自体の取得粒度見直し余地あり
- `EpisodePlayback.tsx` 側の更なる描画 / 計算最適化余地あり
- asset immutable 化の最終整理は未実施
- segment fallback / assembled audio 周辺の追加最適化余地あり
- 監視導線の UI 化は未着手
- ホスティング / Supabase プラン余裕の定量確認は未実施
- `contact` の実運用連絡先が仮なら差し替えが必要

## 公開前の全体優先順位
1. `広告掲載準備MVP`
2. `公開直前 全体最終確認MVP`

## 今の親チャット判断
- 子25は完了扱いでよい
- 次に着手する本命は `広告掲載準備MVP`
- その後に `公開直前 全体最終確認MVP`
- 追加軽量化をやるとしても、以後は helper 層や playback 側の後段最適化として別差分で扱う

## 子チャット運用メモ
- 分野の被る子チャットがあれば、それを優先して使う
- なるべく新規子チャットを作らない
- 子20, 子21, 子22 は使わない
- 子23 は signup / auth / legal 系で使用済み
- 子24 は infra / scaling 系で使用済み
- 子25 は performance / rendering / asset 運用系で使用済み
- 次差分は広告掲載準備なので、新しい子チャットへ切ってよい
- 実ファイルの実際のコード位置・実インデント・前後文脈を確認してから、そのまま貼り付けられる完成コードを出す
- 説明用に左へ寄せたコードは出さない

## コード差し込みルール
- 実ファイルの該当箇所を確認してから、その位置にそのまま貼れる字下げで出す
- 差し込み位置が危険なら丸ごと置換用コードを優先する
- sibling の列・インデントが崩れるコードは不合格
