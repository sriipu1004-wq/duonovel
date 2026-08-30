import type { Metadata } from "next";
import Link from "next/link";
import SubscriptionActionButton from "@/features/billing/SubscriptionActionButton";
import { getBillingSubscriptionSummary } from "@/lib/billing/billing.server";
import {
  isPaidSubscriptionReady,
  isStripeConfigured,
  LIBREAD_SUBSCRIPTION_PRICE_JPY,
} from "@/lib/billing/billingConfig";
import { isSubscriber } from "@/lib/aiUsage/aiUsage.server";
import { createClient } from "@/lib/supabase/server";
import { isOfficialAccountEmail } from "@/lib/auth/officialAccount";

export const metadata: Metadata = {
  title: "サブスク | LIB read",
  description:
    "LIB readの月額680円サブスク。単語解説無制限、次話対訳の先読み、AI生成上限の拡大に対応します。",
};

type PageProps = {
  searchParams: Promise<{ checkout?: string }>;
};

const comparisons = [
  {
    label: "AI物語生成",
    free: "対訳生成と共通で1日3回",
    subscriber: "1日10回まで",
  },
  {
    label: "対訳生成",
    free: "AI物語生成と共通で1日3回",
    subscriber: "1日30回まで",
  },
  {
    label: "単語解説",
    free: "1日20回まで",
    subscriber: "日次回数制限なし",
  },
  {
    label: "次話の対訳",
    free: "次話へ移動後に生成",
    subscriber: "読書50%で次の1話を先読み",
  },
  {
    label: "朗読",
    free: "画面を開いて再生",
    subscriber: "バックグラウンド再生・次話自動再生",
  },
  {
    label: "個人本棚・読書進捗",
    free: "最大3作品",
    subscriber: "最大20作品",
  },
];

function formatDate(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

export default async function SubscriptionPage({ searchParams }: PageProps) {
  const { checkout } = await searchParams;
  const supabase = await createClient();
  const authResult = await supabase.auth.getUser();
  const user = authResult.data.user ?? null;
  const officialAccount = isOfficialAccountEmail(user?.email);
  const [subscriber, billingSummary] = user
    ? await Promise.all([
        isSubscriber(user.id),
        getBillingSubscriptionSummary(user.id),
      ])
    : [false, null];
  const billingReady = isPaidSubscriptionReady();
  const currentPeriodEnd = formatDate(billingSummary?.currentPeriodEnd ?? null);
  const shouldManageExistingContract = Boolean(
    billingSummary &&
      ["active", "trialing", "past_due", "unpaid", "paused", "incomplete"].includes(
        billingSummary.status
      )
  );
  const currentPlanLabel = subscriber
    ? officialAccount
      ? "運営アカウント・有料機能有効"
      : "サブスク利用中"
    : shouldManageExistingContract
      ? "支払い・契約状態の確認が必要"
      : "無料プラン";

  return (
    <main className="min-h-screen bg-white text-black">
      <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-5 text-sm text-neutral-500">
          <Link href="/" className="hover:text-black">TOP</Link>
          <span className="mx-2">/</span>
          <span className="text-neutral-700">サブスク</span>
        </div>

        {checkout === "success" ? (
          <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm leading-7 text-emerald-900">
            決済を受け付けました。Stripeからの決済完了通知後に有料機能へ切り替わります。反映されない場合は数秒後に再読み込みしてください。
          </div>
        ) : checkout === "canceled" ? (
          <div className="mb-6 rounded-2xl border border-black/10 bg-neutral-50 px-5 py-4 text-sm leading-7 text-neutral-700">
            決済はキャンセルされ、請求は発生していません。
          </div>
        ) : null}

        <section className="overflow-hidden rounded-[32px] border border-black/10 bg-neutral-950 text-white shadow-sm">
          <div className="grid gap-8 px-6 py-10 sm:px-10 lg:grid-cols-[1.35fr_0.85fr] lg:items-center">
            <div>
              <p className="text-xs tracking-[0.22em] text-sky-300">LIB READ SUBSCRIPTION</p>
              <h1 className="mt-4 text-3xl font-bold leading-tight sm:text-4xl">
                長編を、次の1話まで止まらず読む。
              </h1>
              <p className="mt-5 max-w-2xl text-sm leading-8 text-neutral-300 sm:text-base">
                単語解説を回数を気にせず使い、読書中に次話の対訳を1話だけ準備します。AI物語と対訳生成の1日上限も拡大します。
              </p>
              <div className="mt-6 flex items-end gap-2">
                <span className="text-4xl font-bold">
                  {LIBREAD_SUBSCRIPTION_PRICE_JPY.toLocaleString("ja-JP")}円
                </span>
                <span className="pb-1 text-sm text-neutral-300">/ 月（税込）</span>
              </div>
              <p className="mt-2 text-xs leading-6 text-neutral-400">
                申込日に課金され、毎月同日に自動更新されます。いつでも解約できます。
              </p>
            </div>

            <div className="rounded-[24px] border border-white/15 bg-white/10 p-5">
              <p className="text-xs tracking-[0.18em] text-neutral-300">CURRENT PLAN</p>
              <p className="mt-2 text-xl font-semibold">
                {currentPlanLabel}
              </p>
              {subscriber && currentPeriodEnd ? (
                <p className="mt-3 text-xs leading-6 text-neutral-300">
                  {billingSummary?.cancelAtPeriodEnd
                    ? `${currentPeriodEnd}まで利用可能（更新停止済み）`
                    : `次回更新日 ${currentPeriodEnd}`}
                </p>
              ) : null}
              <div className="mt-5">
                {officialAccount ? (
                  <span className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/20 bg-white/10 px-5 py-2.5 text-sm font-semibold text-white">
                    Stripe契約は不要です
                  </span>
                ) : shouldManageExistingContract ? (
                  <SubscriptionActionButton mode="portal" billingReady={isStripeConfigured()} />
                ) : user ? (
                  <SubscriptionActionButton mode="checkout" billingReady={billingReady} />
                ) : (
                  <Link
                    href="/login?next=%2Fsubscription"
                    className="inline-flex min-h-11 items-center justify-center rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-neutral-100"
                  >
                    ログインして申し込む
                  </Link>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="mt-8 rounded-[28px] border border-black/10 bg-white p-5 shadow-sm sm:p-7">
          <p className="text-xs tracking-[0.2em] text-neutral-500">PLAN</p>
          <h2 className="mt-2 text-2xl font-semibold">無料版との違い</h2>
          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[620px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-black/10 text-neutral-500">
                  <th className="px-3 py-3 font-medium">機能</th>
                  <th className="px-3 py-3 font-medium">無料</th>
                  <th className="px-3 py-3 font-medium text-black">月額680円</th>
                </tr>
              </thead>
              <tbody>
                {comparisons.map((item) => (
                  <tr key={item.label} className="border-b border-black/10 last:border-0">
                    <th className="px-3 py-4 font-medium text-black">{item.label}</th>
                    <td className="px-3 py-4 text-neutral-600">{item.free}</td>
                    <td className="px-3 py-4 font-medium text-black">{item.subscriber}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-8 rounded-[28px] border border-sky-200 bg-sky-50 px-5 py-7 sm:px-8">
          <h2 className="text-xl font-semibold">契約と解約</h2>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-7 text-neutral-700">
            <li>クレジットカード情報はStripeが処理し、LIB readでは保持しません。</li>
            <li>解約すると次回更新が止まり、支払済み期間の終了までは有料機能を利用できます。</li>
            <li>アカウント削除時は、継続請求を防ぐためStripe契約を先に停止します。</li>
          </ul>
          <div className="mt-5 flex flex-wrap gap-4 text-sm">
            <Link href="/terms" className="underline underline-offset-4">利用規約</Link>
            <Link href="/privacy" className="underline underline-offset-4">プライバシーポリシー</Link>
            <Link href="/commercial-transactions" className="underline underline-offset-4">特定商取引法に基づく表記</Link>
          </div>
        </section>
      </div>
    </main>
  );
}
