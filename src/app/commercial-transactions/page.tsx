import type { Metadata } from "next";
import Link from "next/link";
import {
  getLegalSellerDetails,
  hasCompleteLegalSellerDetails,
  LIBREAD_SUBSCRIPTION_PRICE_JPY,
} from "@/lib/billing/billingConfig";

export const metadata: Metadata = {
  title: "特定商取引法に基づく表記 | LIB read",
  description: "LIB readの有料サブスクリプションに関する法定表示です。",
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

  return (
    <main className="min-h-screen bg-white text-black">
      <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
        <header>
          <p className="text-xs tracking-[0.2em] text-neutral-500">LEGAL</p>
          <h1 className="mt-3 text-3xl font-bold">特定商取引法に基づく表記</h1>
          <p className="mt-3 text-sm leading-7 text-neutral-600">
            LIB readの月額サブスクリプションに関する販売条件です。
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
            月額{LIBREAD_SUBSCRIPTION_PRICE_JPY.toLocaleString("ja-JP")}円（税込）
          </Row>
          <Row label="販売価格以外の負担">
            サービス利用に必要なインターネット接続料金および通信料金は利用者の負担です。
          </Row>
          <Row label="支払方法">Stripeを利用したクレジットカード決済</Row>
          <Row label="支払時期">
            申込時に初回料金を決済し、以後は申込日を基準として毎月自動更新時に決済します。
          </Row>
          <Row label="サービス提供時期">
            初回決済の完了確認後、直ちに有料機能を利用できます。
          </Row>
          <Row label="契約期間・自動更新">
            1か月単位の契約です。利用者が解約するまで毎月自動更新されます。
          </Row>
          <Row label="解約方法">
            LIB readのサブスクページにある「契約・支払いを管理」から、次回更新前に解約できます。解約後も支払済み期間の終了までは有料機能を利用できます。
          </Row>
          <Row label="返金・キャンセル">
            デジタルサービスの性質上、提供開始後の利用者都合による日割り返金は行いません。ただし、法令上必要な場合または重複請求等が確認された場合を除きます。
          </Row>
          <Row label="動作環境">
            JavaScript、CookieおよびWeb Storageを利用できる最新版のChrome、Safari、Edge等のブラウザ。読み上げ機能はブラウザと端末の音声合成機能に依存します。
          </Row>
          <Row label="利用上限">
            AI物語生成・対訳生成には日次上限があります。単語解説は有料契約中の日次回数制限がありません。AIを新規に呼び出す操作には月間AI利用上限と不正利用防止策が適用されます。
          </Row>
        </dl>
      </div>
    </main>
  );
}
