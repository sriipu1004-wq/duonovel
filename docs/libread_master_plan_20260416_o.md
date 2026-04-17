# LIB read 親チャット正史メモ 2026-04-16 o

更新日: 2026-04-16
配置: `docs/libread_master_plan_20260416_o.md`

## 今回の更新
- `アカウント作成規約・同意導線MVP` を完了扱いにした
- 子23の正式報告に基づき、login / signup / register の役割分離、register での基本同意、auth metadata を使った同意 state 保持、callback route の受け皿まで main 反映済みとして扱う
- 次の優先順位は `新規作成導線強化MVP` に繰り上がる
- 子23は signup / auth / legal 系の同分野なので、そのまま続投でよい

## この更新の根拠
- `src/lib/auth/accountSignupConsent.ts` を新設し、同意 version・入力正規化・metadata builder・登録完了判定の共通ロジックを整理したと報告されている
- `/login` はログイン専用、`/signup` は登録方法の入口、`/register` は最終的なユーザー登録画面として役割分離したと報告されている
- `Google / Apple` 用の受け皿と `email` 登録用の同意 UI を `register` へ寄せ、`/auth/callback` を追加したと報告されている
- local HEAD と origin/main HEAD は `b8c7fb91123408eb21ae0c62109ef6e900a03a9c` で一致、working tree clean と報告済み

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

## アカウント作成規約・同意導線の現到達点
- signup 時の基本同意は、ログイン後前提の専用 consent table ではなく、今後 OAuth にも流用しやすいよう `auth user_metadata` に持たせる方針で固定
- 使用している主な metadata key
  - `account_signup_consent_version`
  - `account_terms_version`
  - `account_privacy_version`
  - `account_public_profile_ack`
  - `account_public_content_ack`
  - `account_enforcement_ack`
  - `account_signup_consented_at`
  - `account_registration_method`
  - `account_registration_completed`
  - `account_registration_completed_at`
  - `display_name_candidate`
  - `account_birthdate`
  - `account_gender`
- `register` 画面で基本同意を取り、メール導線では email / password / username / birthdate / gender / 同意を入力する構成に到達
- `Google / Apple` については実 provider 接続前でも、最終的に `register` に寄せる route / page / metadata 構成まで整備済み
- auth 画面全体を白黒基調 + 薄青 + 灰の公開導線トーンへ寄せた

## 現在も残る注意点
- Google provider の Supabase 側実設定と本番疎通確認は未実施
- Apple provider の Supabase 側実設定と本番疎通確認は未実施
- users table 側で birthdate / gender をどう永続化するかの本設計は未完
- signup / register 以外のオンボーディング強化は未着手
- `contact` の実運用連絡先が仮なら差し替えが必要
- サーバー運用・スケーリング方針は未整理
- 軽量化・快適化MVPは未着手
- 広告掲載準備が未着手
- 公開直前の全体最終確認は未実施

## 公開前の全体優先順位
1. `新規作成導線強化MVP`
2. `サーバー運用・スケーリング方針MVP`
3. `軽量化・快適化MVP`
4. `広告掲載準備MVP`
5. `公開直前 全体最終確認MVP`

## 今の親チャット判断
- `アカウント作成規約・同意導線MVP` は完了扱いでよい
- 次は `新規作成導線強化MVP`
- その次が `サーバー運用・スケーリング方針MVP`
- その次が `軽量化・快適化MVP`
- その後に `広告掲載準備MVP`
- 最後に `公開直前 全体最終確認MVP`
- 子23はこのまま続行でよい

## 子チャット運用メモ
- 分野の被る子チャットがあれば、それを優先して使う
- なるべく新規子チャットを作らない
- 子20, 子21, 子22 は使わない
- 子23 は signup / auth / legal 系で継続使用可
- 実ファイルの実際のコード位置・実インデント・前後文脈を確認してから、そのまま貼り付けられる完成コードを出す
- 説明用に左へ寄せたコードは出さない

## コード差し込みルール
- 実ファイルの該当箇所を確認してから、その位置にそのまま貼れる字下げで出す
- 差し込み位置が危険なら丸ごと置換用コードを優先する
- sibling の列・インデントが崩れるコードは不合格
