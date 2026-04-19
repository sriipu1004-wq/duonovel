# LIB read 親チャット正史メモ 2026-04-19 a

更新日: 2026-04-19
配置: `docs/libread_master_plan_20260419_a.md`

## 今回の更新
- `新規作成導線強化MVP` を完了扱いとして正式反映
- `サーバー運用・スケーリング方針MVP` も完了扱いとして正式反映
- これにより、公開前の残優先順位を整理し直した
- 子23 は signup / auth 系、子24 は infra / scaling 系として到達済み扱いにした

## この更新の根拠
### 新規作成導線強化MVP
- 子23の正式報告で、email-only 前提の新規作成導線が main へ同期完了している
- `login / signup / register / auth/callback / confirmed / mypage settings / account delete` まで成立
- local HEAD と origin/main HEAD は `1bf7412d5d619daf1840f4a1a37ac9a039bccda2` で一致、working tree clean と報告済み

### サーバー運用・スケーリング方針MVP
- 子24の正式報告で、公開主要導線 `/` `/search` `/works/[seriesId]` `/read/[seriesId]/[episodeNumber]` の read 最適化、payload 縮小、popularity summary 化、audio 再生負荷軽減まで main 同期完了している
- 0.5倍速開始不具合と自動朗読マーカー異常も修正済み
- local HEAD と origin/main HEAD は `f499540b2b483a8f39747b399e7735623a0d757e` で一致、working tree clean と報告済み

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

## 新規作成導線強化の現到達点
- 認証方式は当面 email-only に固定
- login はメールログイン専用に整理
- signup は register へ寄せる互換導線に整理
- register はメール登録専用に整理
- callback は email confirm 前提の flow に寄せた
- confirm 後は `/confirmed` を挟んで自動遷移する flow を追加
- 表示名は `users.display_name` を正史としつつ `auth.user_metadata.display_name` にも同期
- mypage に settings カードと account delete UI / route を追加
- 確認メール送信元と日本語テンプレは Supabase Dashboard 側設定で対応する前提に整理

## サーバー運用・スケーリング方針の現到達点
- public route の read 最適化、payload 縮小、cached helper 化を実施
- `select("*")` を必要列 select + fallback へ整理
- popularity を raw event 全読みから `series_popularity_daily` summary 参照へ変更
- reactions / bookmarks / views / narration plays を日次集計する trigger を追加
- `EpisodePlayback` を直音声優先 / segment fallback に変更
- playback rate 永続保存による 0.5 倍速固定を除去
- generated timing 判定を修正し、自動朗読マーカー異常を解消
- 静かな初期公開・小規模流入なら現状構成で公開してよい、という運用判断まで固定

## 現在も残る注意点
- `contact` の実運用連絡先が仮なら差し替えが必要
- asset immutable 化の最終整理は未実施
- segment を生成時点で事前結合する運用は未実施
- 監視導線の UI 化は未着手
- ホスティング / Supabase プラン余裕の定量確認は未実施
- 既存録音の `reader_name` など焼き込み済み表示名の一括更新は未実施
- `birthdate` / `gender` の users table 正式保持設計は未完
- SMTP 長期運用方針の再判断、CAPTCHA、Auth rate limits 最終調整は未実施

## 公開前の全体優先順位
1. `軽量化・快適化MVP`
2. `広告掲載準備MVP`
3. `公開直前 全体最終確認MVP`

## 今の親チャット判断
- `新規作成導線強化MVP` は完了扱いでよい
- `サーバー運用・スケーリング方針MVP` も完了扱いでよい
- 次は `軽量化・快適化MVP`
- その次が `広告掲載準備MVP`
- 最後に `公開直前 全体最終確認MVP`

## 子チャット運用メモ
- 分野の被る子チャットがあれば、それを優先して使う
- なるべく新規子チャットを作らない
- 子20, 子21, 子22 は使わない
- 子23 は signup / auth / legal 系で使用済み
- 子24 は infra / scaling 系で使用済み
- 次差分は performance / rendering / asset 運用寄りなので、新しい子チャットへ切ってよい
- 実ファイルの実際のコード位置・実インデント・前後文脈を確認してから、そのまま貼り付けられる完成コードを出す
- 説明用に左へ寄せたコードは出さない

## コード差し込みルール
- 実ファイルの該当箇所を確認してから、その位置にそのまま貼れる字下げで出す
- 差し込み位置が危険なら丸ごと置換用コードを優先する
- sibling の列・インデントが崩れるコードは不合格
