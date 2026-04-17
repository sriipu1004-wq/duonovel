# LIB read 親チャット正史メモ 2026-04-16 p

更新日: 2026-04-16
配置: `docs/libread_master_plan_20260416_p.md`

## 今回の更新
- `新規作成導線強化MVP` を完了扱いにした
- 子23の正式報告に基づき、email-only 前提で register / callback / users 同期 / confirm 後導線 / account settings / account delete まで main 反映済みとして扱う
- Google / Apple provider の実接続は今回は範囲外とし、受け皿と metadata 構成まで到達済みとして整理する
- 次の優先順位は `サーバー運用・スケーリング方針MVP` に繰り上がる
- 子23は signup / auth 系の続きではあるが、次差分は infra / 運用設計寄りなので、新規子チャットへ切り替えてよい

## この更新の根拠
- `src/lib/auth/accountSignupConsent.ts` と `src/lib/auth/syncPublicUserProfile.ts` の整備
- `/login` を email-only ログイン専用へ整理
- `/signup` を `register` へ寄せる互換導線へ整理
- `/register` をメール登録専用に整理
- `/auth/callback` を email confirm 前提の flow に寄せ、`/confirmed` を追加して自然な確認後遷移へ変更
- `users.display_name` を正史としつつ `auth.user_metadata.display_name` にも同期する構成へ整理
- mypage に `AccountSettingsCard` と account delete route を追加
- local HEAD と origin/main HEAD は `1bf7412d5d619daf1840f4a1a37ac9a039bccda2` で一致、working tree clean と報告済み

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

## 新規作成導線強化の現到達点
- 認証方式は当面 email-only に固定
- Google / Apple は今回使わない方針に切り替え
- login はメールログイン専用に整理
- signup は register へ寄せる互換導線に整理
- register はメール登録専用に整理
- callback は email confirm 前提の flow に寄せた
- confirm 後は `/confirmed` を一度挟んで自動遷移する flow を追加
- 表示名は `users.display_name` を正史としつつ `auth.user_metadata.display_name` にも同期
- mypage に settings カードと account delete UI / route を追加
- 確認メール送信元と日本語テンプレは Supabase Dashboard 側設定で対応する前提に整理

## 現在も残る注意点
- 既存録音の `reader_name` など焼き込み済み表示名の一括更新は未実施
- `birthdate` / `gender` を users table に正式保持するかの本設計は未完
- 確認メール送信基盤を Gmail SMTP から将来 transaction mail 向けサービスへ移すかの判断が必要
- CAPTCHA を入れるかどうか未決
- Auth rate limits の最終調整は未実施
- `contact` の実運用連絡先が仮なら差し替えが必要
- サーバー運用・スケーリング方針は未整理
- 軽量化・快適化MVPは未着手
- 広告掲載準備が未着手
- 公開直前の全体最終確認は未実施

## 公開前の全体優先順位
1. `サーバー運用・スケーリング方針MVP`
2. `軽量化・快適化MVP`
3. `広告掲載準備MVP`
4. `公開直前 全体最終確認MVP`

## 今の親チャット判断
- `新規作成導線強化MVP` は完了扱いでよい
- 次は `サーバー運用・スケーリング方針MVP`
- その次が `軽量化・快適化MVP`
- その次が `広告掲載準備MVP`
- 最後に `公開直前 全体最終確認MVP`
- signup / auth 系の追加残件は、必要なら別差分で切る

## 子チャット運用メモ
- 分野の被る子チャットがあれば、それを優先して使う
- なるべく新規子チャットを作らない
- 子20, 子21, 子22 は使わない
- 子23 は signup / auth / legal 系で継続使用可
- 次差分は infra / 性能 / 運用設計寄りなので、新しい子チャットへ切ってよい
- 実ファイルの実際のコード位置・実インデント・前後文脈を確認してから、そのまま貼り付けられる完成コードを出す
- 説明用に左へ寄せたコードは出さない

## コード差し込みルール
- 実ファイルの該当箇所を確認してから、その位置にそのまま貼れる字下げで出す
- 差し込み位置が危険なら丸ごと置換用コードを優先する
- sibling の列・インデントが崩れるコードは不合格
