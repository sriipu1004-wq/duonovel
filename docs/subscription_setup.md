# LIB read 月額680円サブスク設定

この実装はStripe Checkout、Stripe Customer Portal、署名検証済みWebhook、Supabaseの有料権限を使う。Checkoutは、Stripe設定と特定商取引法の必須表示がすべて揃うまで自動的に停止する。

## 1. Supabase

以下を上から順に、それぞれファイル全体実行する。

1. `supabase/migrations/20260829120000_add_stripe_subscriptions.sql`
2. `supabase/migrations/20260829130000_limit_free_private_library_works.sql`

このmigrationは次を追加する。

- Stripe顧客・契約・Webhook処理履歴
- 月間AI原価予約（1加入者あたり月300円相当）
- 個人本棚の章を削除した際の単語解説cache削除
- 無料ユーザーの個人本棚を3作品、有料ユーザーを20作品に制限
- 新規取り込みの対訳単位を最大6,000文字に制限

## 2. Stripe Product / Price

Stripeで商品を1件作成し、Priceを次の条件で作る。

- 通貨: JPY
- 金額: 680円
- 税込価格: `tax_behavior=inclusive`
- 課金間隔: 1か月
- 種類: recurring

Stripe Priceの金額は作成後に変更できない。500円のPriceを既に作成している場合はそれをアーカイブし、同じ商品へ680円の新しいPriceを追加する。Vercelの`STRIPE_PRICE_ID`は新しい680円Priceの`price_...`へ差し替える。

Customer Portalでは、支払い方法の変更、請求履歴、契約の解約を有効にする。解約は即時ではなく、支払済み期間の終了時に停止する設定にする。

Checkoutの利用規約同意を表示できるよう、Stripe Dashboardの公開事業情報、利用規約URL、プライバシーポリシーURLも設定する。

## 3. Webhook

Test modeのPreview Endpoint:

`https://nextjs-git-feat-private-library-d4d8f7-sriipu1004-wqs-projects.vercel.app/api/billing/webhook`

Live modeのProduction Endpoint:

`https://www.syosetu-libread.com/api/billing/webhook`

購読イベント:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`

TestとLiveは別々のWebhook署名シークレットになる。それぞれ対応するVercel環境の`STRIPE_WEBHOOK_SECRET`へ設定する。

## 4. Vercel環境変数

まずPreviewへStripe test modeの値だけを設定する。

```text
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID=price_...（test modeの680円Price）
LIBREAD_BILLING_CHECKOUT_ENABLED=true

LIBREAD_LEGAL_SELLER_NAME=
LIBREAD_LEGAL_RESPONSIBLE_PERSON=
LIBREAD_LEGAL_ADDRESS=
LIBREAD_LEGAL_PHONE=
LIBREAD_LEGAL_SUPPORT_EMAIL=
```

Previewで全テストが成功した後、ProductionにはLive modeの別の値を設定する。

```text
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID=price_...（live modeの680円Price）
NEXT_PUBLIC_SITE_URL=https://www.syosetu-libread.com
LIBREAD_BILLING_CHECKOUT_ENABLED=false

LIBREAD_LEGAL_SELLER_NAME=
LIBREAD_LEGAL_RESPONSIBLE_PERSON=
LIBREAD_LEGAL_ADDRESS=
LIBREAD_LEGAL_PHONE=
LIBREAD_LEGAL_SUPPORT_EMAIL=
```

Productionは最初に`LIBREAD_BILLING_CHECKOUT_ENABLED=false`のままdeployし、公開ページ・法定表示・Live webhookを確認してから`true`へ切り替える。

販売事業者名、責任者、住所、電話番号は実在する正確な情報を設定する。未設定の項目が1つでもある場合、`/subscription` は表示できるがCheckoutは開始しない。

`NEXT_PUBLIC_SITE_URL`はProduction環境だけに正式ドメインを設定する。Vercel Previewでは設定を省略でき、決済後は開いていたPreviewへ戻る。Preview環境へ正式ドメインを上書きしない。

日本の個人事業として提供する場合は、次のように設定する。値そのものはGitHubへcommitせず、Vercelの暗号化された環境変数にだけ保存する。

- `LIBREAD_LEGAL_SELLER_NAME`: 戸籍上の氏名または登記された商号
- `LIBREAD_LEGAL_RESPONSIBLE_PERSON`: 本人の戸籍上の氏名
- `LIBREAD_LEGAL_ADDRESS`: 現在も日本の事業連絡先として機能する完全な住所
- `LIBREAD_LEGAL_PHONE`: 利用者から確実に連絡を受けられる番号
- `LIBREAD_LEGAL_SUPPORT_EMAIL`: 継続して確認する問い合わせ先

海外へ一時滞在している間も、日本住所で郵便を受領でき、電話・メールへ対応できる体制を用意する。マイナンバー、カード画像、本人確認書類はサイトや環境変数へ保存しない。

緊急時はStripe設定を消さず、`LIBREAD_BILLING_CHECKOUT_ENABLED=false` にして新規契約だけを停止する。既存加入者のCustomer PortalとWebhookは継続する。

## 5. 動作確認

1. 無料利用者で `/subscription` を開く。
2. 料金・自動更新・解約条件へ同意し、Stripe test cardで契約する。
3. Webhook後にサブスク利用中となることを確認する。
4. AI物語10回/日、対訳30回/日、単語解説の日次回数制限なしを確認する。
5. Customer Portalから解約し、期間終了までは有料権限が残ることを確認する。
6. `customer.subscription.deleted` 後に無料権限へ戻ることを確認する。
7. 契約中のテストアカウントを削除し、Stripe契約が先に停止することを確認する。

本番公開前に、実際の680円決済を1件行い、領収書、カード明細、Webhook、解約、返金時の連絡手順まで通しで確認する。
