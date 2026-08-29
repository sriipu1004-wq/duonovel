# LIB read 月額500円サブスク設定

この実装はStripe Checkout、Stripe Customer Portal、署名検証済みWebhook、Supabaseの有料権限を使う。Checkoutは、Stripe設定と特定商取引法の必須表示がすべて揃うまで自動的に停止する。

## 1. Supabase

`supabase/migrations/20260829120000_add_stripe_subscriptions.sql` を全体実行する。

このmigrationは次を追加する。

- Stripe顧客・契約・Webhook処理履歴
- 月間AI原価予約（1加入者あたり月300円相当）
- 個人本棚の章を削除した際の単語解説cache削除

## 2. Stripe Product / Price

Stripeで商品を1件作成し、Priceを次の条件で作る。

- 通貨: JPY
- 金額: 500円
- 税込価格: `tax_behavior=inclusive`
- 課金間隔: 1か月
- 種類: recurring

Customer Portalでは、支払い方法の変更、請求履歴、契約の解約を有効にする。解約は即時ではなく、支払済み期間の終了時に停止する設定にする。

Checkoutの利用規約同意を表示できるよう、Stripe Dashboardの公開事業情報、利用規約URL、プライバシーポリシーURLも設定する。

## 3. Webhook

Endpoint:

`https://www.syosetu-libread.com/api/billing/webhook`

購読イベント:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`

Webhook署名シークレットを `STRIPE_WEBHOOK_SECRET` に設定する。

## 4. Vercel環境変数

まずPreviewにはStripe test modeの値を設定し、実決済確認後にProductionをlive modeへ切り替える。

```text
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_ID=
NEXT_PUBLIC_SITE_URL=https://www.syosetu-libread.com
LIBREAD_BILLING_CHECKOUT_ENABLED=true

LIBREAD_LEGAL_SELLER_NAME=
LIBREAD_LEGAL_RESPONSIBLE_PERSON=
LIBREAD_LEGAL_ADDRESS=
LIBREAD_LEGAL_PHONE=
LIBREAD_LEGAL_SUPPORT_EMAIL=
```

販売事業者名、責任者、住所、電話番号は実在する正確な情報を設定する。未設定の項目が1つでもある場合、`/subscription` は表示できるがCheckoutは開始しない。

緊急時はStripe設定を消さず、`LIBREAD_BILLING_CHECKOUT_ENABLED=false` にして新規契約だけを停止する。既存加入者のCustomer PortalとWebhookは継続する。

## 5. 動作確認

1. 無料利用者で `/subscription` を開く。
2. 料金・自動更新・解約条件へ同意し、Stripe test cardで契約する。
3. Webhook後にサブスク利用中となることを確認する。
4. AI物語10回/日、対訳30回/日、単語解説の日次回数制限なしを確認する。
5. Customer Portalから解約し、期間終了までは有料権限が残ることを確認する。
6. `customer.subscription.deleted` 後に無料権限へ戻ることを確認する。
7. 契約中のテストアカウントを削除し、Stripe契約が先に停止することを確認する。

本番公開前に、実際の500円決済を1件行い、領収書、カード明細、Webhook、解約、返金時の連絡手順まで通しで確認する。
