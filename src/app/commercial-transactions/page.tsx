import type { Metadata } from "next";
import Link from "next/link";
import {
  getLegalSellerDetails,
  hasCompleteLegalSellerDetails,
  LIBREAD_SUBSCRIPTION_PRICE_JPY,
} from "@/lib/billing/billingConfig";
import {
  getCreditPackCatalog,
  isCreditPurchaseEnabled,
} from "@/lib/billing/creditPackCatalog";

export const metadata: Metadata = {
  title: "特定商取引法に基づく表記 | LIB read",
  description: "LIB readの有料サービスに関する法定表示です。",
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2 border-b border-black/10 py-4 last:border-0 sm:grid-cols-[13rem_1fr]">
      <dt className="text-sm font-medium text-neutral-700">{label}</dt>
      <dd className="text-sm leading-7 text-neutral-700">{children}</dd>
    </div>
  );
}

export default function CommercialTransactionsPage() {
  const details = getLegalSellerDetails();
  const complete = hasCompleteLegalSellerDetails();
  const missing = "公開前に設定";
  const creditPacks = getCreditPackCatalog();
  const creditSalesEnabled = isCreditPurchaseEnabled();

  return (
    <main className="min-h-screen bg-white text-black">
      <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
        <header>
          <p className="text-xs tracking-[0.2em] text-neutral-500">LEGAL</p>
          <h1 className="mt-3 text-3xl font-bold">特定商取引法に基づく表記</h1>
          <p className="mt-3 text-sm leading-7 text-neutral-600">
            LIB readの月額サブスクリプションおよび、販売が有効な場合の買い切りクレジットに関する販売条件です。
          </p>
          <div className="mt-4 flex flex-wrap gap-4 text-sm">
            <Link href="/subscription" className="underline underline-offset-4">サブスクへ戻る</Link>
            <Link href="/terms" className="underline underline-offset-4">利用規約</Link>
            <Link href="/privacy" className="underline underline-offset-4">プライバシーポリシー</Link>
          </div>
        </header>

        {!complete ? (
          <div className="mt-7 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm leading-7 text-red-800">
            販売事業者の氏名・住所・電話番号等が未設定です。この状態では決済を開始できません。
          </div>
        ) : null}

        <dl className="mt-7 rounded-[28px] border border-black/10 bg-white px-5 shadow-sm sm:px-7">
          <Row label="販売事業者">{details.sellerName || missing}</Row>
          <Row label="運営責任者">{details.responsiblePerson || missing}</Row>
          <Row label="所在地">{details.address || missing}</Row>
          <Row label="電話番号">{details.phone || missing}</Row>
          <Row label="メールアドレス">{details.supportEmail || missing}</Row>
          <Row label="販売価格">
            <div>Premium：月額{LIBREAD_SUBSCRIPTION_PRICE_JPY.toLocaleString("ja-JP")}円（税込）</div>
            {creditSalesEnabled && creditPacks.length > 0 ? (
              <ul className="mt-2 list-disc pl-5">
                {creditPacks.map((pack) => (
                  <li key={pack.id}>
                    {pack.credits}クレジット：{pack.displayPriceJpy.toLocaleString("ja-JP")}円（税込）
                  </li>
                ))}
              </ul>
            ) : null}
          </Row>
          <Row label="販売価格以外の負担">
            サービス利用に必要なインターネット接続料金および通信料金は利用者の負担です。
          </Row>
          <Row label="支払方法">Stripeを利用したクレジットカード決済</Row>
          <Row label="支払時期">
            Premiumは申込時に初回料金を決済し、以後は申込日を基準として毎月自動更新時に決済します。
            {creditSalesEnabled ? " クレジットは購入手続時に1回決済します。" : ""}
          </Row>
          <Row label="サービス提供時期">
            決済の完了確認後、直ちに対象の有料機能または購入クレジットを利用できます。
          </Row>
          <Row label="契約期間・自動更新">
            Premiumは1か月単位の契約で、利用者が解約するまで毎月自動更新されます。買い切りクレジットは自動更新されません。
          </Row>
          {creditSalesEnabled && creditPacks.length > 0 ? (
            <Row label="クレジット有効期限">
              {creditPacks.map((pack, index) => (
                <span key={pack.id}>
                  {index > 0 ? " / " : ""}
                  {pack.credits}クレジット：購入日から{pack.expiresInDays}日
                </span>
              ))}
            </Row>
          ) : null}
          <Row label="解約方法">
            PremiumはLIB readのサブスクページにある「契約・支払いを管理」から、次回更新前に解約できます。解約後も支払済み期間の終了までは有料機能を利用できます。買い切りクレジットに継続契約の解約手続はありません。
          </Row>
          <Row label="返金・キャンセル">
            デジタルサービスの性質上、提供開始後の利用者都合による日割り返金または使用済みサービスの返金は行いません。ただし、法令上必要な場合または重複請求等が確認された場合を除きます。クレジット購入が返金または支払取消しとなった場合は、当該購入に対応するクレジットを残高から差し引くことがあります。
          </Row>
          <Row label="クレジット利用条件">
            クレジットはLIB read内の対象となる公開話の翻訳解放にのみ利用でき、現金への換金、他ユーザーへの譲渡、作者報酬への転換はできません。1クレジットで1話・1翻訳言語を解放し、同じ利用者による解放済み翻訳の再読では追加クレジットを消費しません。
          </Row>
          <Row label="動作環境">
            JavaScript、CookieおよびWeb Storageを利用できる最新版のChrome、Safari、Edge等のブラウザ。読み上げ機能はブラウザと端末の音声合成機能に依存します。
          </Row>
          <Row label="利用上限">
            公開翻訳の新規解放にはプランに応じた日次上限があります。AI翻訳・単語解説などAIを新規に呼び出す操作には月間AI利用上限と不正利用防止策が適用されます。購入クレジットはこれらのAI処理原価上限を解除するものではありません。
          </Row>
        </dl>
      </div>
    </main>
  );
}
