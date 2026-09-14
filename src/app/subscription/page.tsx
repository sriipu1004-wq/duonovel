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
import { getUiLocale } from "@/i18n/server";
import { subscriptionDictionaries } from "@/i18n/dictionaries/subscription";
import { localizePath } from "@/i18n/navigation";
import type { UiLocale } from "@/i18n/config";

const SITE_URL = "https://www.syosetu-libread.com";

const pricingSeoCopy: Record<UiLocale, { title: string; description: string; summary: string; freeHeader: string; premiumHeader: string }> = {
  ja: {
    title: "料金・Free / Premiumプラン | LIB read",
    description: "LIB readの料金。Freeは¥0、Premiumは月額680円（JPY）。AI物語、公開作品の翻訳解放、個人本棚への取り込み回数と保存上限を比較できます。",
    summary: "Freeは¥0。Premiumは月額680円（税込・JPY）です。FreeではAI物語生成・公開作品の翻訳解放・個人本棚への取り込みが合計1日3回の共通枠です。PremiumではAI物語生成は1日10回、公開作品の翻訳解放は1日30回、個人本棚への取り込みは日次回数制限なしです。",
    freeHeader: "Free — ¥0",
    premiumHeader: "Premium — 月額680円",
  },
  en: {
    title: "Pricing: Free and Premium plans | LIB read",
    description: "LIB read pricing: Free is ¥0 and Premium is ¥680/month in JPY. Compare AI-story limits, public-translation unlocks, My Library imports, read-aloud, and library storage limits.",
    summary: "Free costs ¥0. Premium costs ¥680 per month in JPY. On Free, AI story generation, public-translation unlocks, and My Library imports share 3 uses per day. Premium provides up to 10 AI stories/day, 30 public-translation unlocks/day, and no daily count limit for library imports.",
    freeHeader: "Free — ¥0",
    premiumHeader: "Premium — ¥680/month (JPY)",
  },
  ko: {
    title: "요금: Free와 Premium 플랜 | LIB read",
    description: "LIB read 요금은 Free ¥0, Premium 월 ¥680(JPY)입니다. AI 이야기, 공개 작품 번역 잠금 해제, 개인 서재 가져오기, 읽어주기와 보관 한도를 비교할 수 있습니다.",
    summary: "Free는 ¥0, Premium은 월 ¥680(JPY)입니다. Free에서는 AI 이야기 생성·공개 작품 번역 잠금 해제·개인 서재 가져오기가 합산 하루 3회를 공유합니다. Premium은 AI 이야기 하루 10회, 공개 번역 하루 30회, 개인 서재 가져오기 일일 횟수 제한 없음입니다.",
    freeHeader: "Free — ¥0",
    premiumHeader: "Premium — 월 ¥680 (JPY)",
  },
};

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getUiLocale();
  const copy = pricingSeoCopy[locale];
  const canonical = localizePath("/subscription", locale);
  return {
    title: copy.title,
    description: copy.description,
    alternates: {
      canonical,
      languages: {
        ja: "/subscription",
        en: "/en/subscription",
        ko: "/ko/subscription",
        "x-default": "/subscription",
      },
    },
    robots: { index: true, follow: true },
    openGraph: {
      type: "website",
      locale: locale === "ja" ? "ja_JP" : locale === "ko" ? "ko_KR" : "en_US",
      siteName: "LIB read",
      url: canonical,
      title: copy.title,
      description: copy.description,
      images: ["/opengraph-image"],
    },
    twitter: {
      card: "summary_large_image",
      title: copy.title,
      description: copy.description,
      images: ["/opengraph-image"],
    },
  };
}

type PageProps = {
  searchParams: Promise<{ checkout?: string }>;
};

function formatDate(value: string | null, locale: UiLocale): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const dateLocale = locale === "ja" ? "ja-JP" : locale === "ko" ? "ko-KR" : "en-US";
  return new Intl.DateTimeFormat(dateLocale, {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

function formatPrice(locale: UiLocale): string {
  if (locale === "ja") {
    return `${LIBREAD_SUBSCRIPTION_PRICE_JPY.toLocaleString("ja-JP")}円`;
  }
  if (locale === "ko") {
    return `${LIBREAD_SUBSCRIPTION_PRICE_JPY.toLocaleString("ko-KR")}엔 (JPY)`;
  }
  return `¥${LIBREAD_SUBSCRIPTION_PRICE_JPY.toLocaleString("en-US")}`;
}

function buildPricingStructuredData(locale: UiLocale) {
  const copy = pricingSeoCopy[locale];
  const canonical = `${SITE_URL}${localizePath("/subscription", locale)}`;
  return {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "LIB read",
    url: canonical,
    operatingSystem: "Web",
    inLanguage: locale,
    description: copy.description,
    offers: [
      {
        "@type": "Offer",
        name: "Free",
        price: "0",
        priceCurrency: "JPY",
        description: copy.summary,
      },
      {
        "@type": "Offer",
        name: "Premium",
        price: String(LIBREAD_SUBSCRIPTION_PRICE_JPY),
        priceCurrency: "JPY",
        description:
          locale === "ja"
            ? "月額680円（税込）のPremiumプラン。"
            : locale === "ko"
              ? "월 ¥680의 Premium 플랜입니다."
              : "Premium plan for ¥680 per month.",
      },
    ],
  };
}

export default async function SubscriptionPage({ searchParams }: PageProps) {
  const locale = await getUiLocale();
  const dictionary = subscriptionDictionaries[locale];
  const seoCopy = pricingSeoCopy[locale];
  const structuredData = buildPricingStructuredData(locale);
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
  const currentPeriodEnd = formatDate(
    billingSummary?.currentPeriodEnd ?? null,
    locale
  );
  const shouldManageExistingContract = Boolean(
    billingSummary &&
      ["active", "trialing", "past_due", "unpaid", "paused", "incomplete"].includes(
        billingSummary.status
      )
  );
  const currentPlanLabel = subscriber
    ? officialAccount
      ? dictionary.officialPlan
      : dictionary.subscriberPlan
    : shouldManageExistingContract
      ? dictionary.paymentAttention
      : dictionary.freePlan;
  const homeHref = localizePath("/", locale);
  const loginHref = `${localizePath("/login", locale)}?next=${encodeURIComponent(
    localizePath("/subscription", locale)
  )}`;
  const jsonLd = (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
    />
  );

  if (subscriber) {
    return (
      <main className="min-h-screen bg-white text-black">
        {jsonLd}
        <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="mb-5 text-sm text-neutral-500">
            <Link href={homeHref} className="hover:text-black">TOP</Link>
            <span className="mx-2">/</span>
            <span className="text-neutral-700">{dictionary.contractStatus}</span>
          </div>

          {checkout === "success" ? (
            <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm leading-7 text-emerald-900">
              {dictionary.checkoutSuccessActive}
            </div>
          ) : null}

          <section className="rounded-[32px] border border-black/10 bg-neutral-950 px-6 py-9 text-white shadow-sm sm:px-10">
            <p className="text-xs tracking-[0.22em] text-sky-300">CURRENT PLAN</p>
            <h1 className="mt-4 text-3xl font-bold">{currentPlanLabel}</h1>
            <p className="mt-4 text-sm leading-7 text-neutral-300">
              {dictionary.paidFeaturesActive}
            </p>
            {currentPeriodEnd ? (
              <p className="mt-3 text-sm leading-7 text-neutral-300">
                {billingSummary?.cancelAtPeriodEnd
                  ? dictionary.availableUntil(currentPeriodEnd)
                  : dictionary.nextRenewal(currentPeriodEnd)}
              </p>
            ) : null}
            <div className="mt-6 flex flex-wrap gap-3">
              {!officialAccount && shouldManageExistingContract ? (
                <SubscriptionActionButton mode="portal" billingReady={isStripeConfigured()} />
              ) : null}
              <Link
                href={homeHref}
                className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/20 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                {dictionary.backHome}
              </Link>
            </div>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white text-black">
      {jsonLd}
      <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-5 text-sm text-neutral-500">
          <Link href={homeHref} className="hover:text-black">TOP</Link>
          <span className="mx-2">/</span>
          <span className="text-neutral-700">{dictionary.pageTitle}</span>
        </div>

        {checkout === "success" ? (
          <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm leading-7 text-emerald-900">
            {dictionary.checkoutSuccessPending}
          </div>
        ) : checkout === "canceled" ? (
          <div className="mb-6 rounded-2xl border border-black/10 bg-neutral-50 px-5 py-4 text-sm leading-7 text-neutral-700">
            {dictionary.checkoutCanceled}
          </div>
        ) : null}

        <section className="overflow-hidden rounded-[32px] border border-black/10 bg-neutral-950 text-white shadow-sm">
          <div className="grid gap-8 px-6 py-10 sm:px-10 lg:grid-cols-[1.35fr_0.85fr] lg:items-center">
            <div>
              <p className="text-xs tracking-[0.22em] text-sky-300">FREE / PREMIUM</p>
              <h1 className="mt-4 text-3xl font-bold leading-tight sm:text-4xl">
                {dictionary.heroTitle}
              </h1>
              <p className="mt-5 max-w-2xl text-sm leading-8 text-neutral-300 sm:text-base">
                {dictionary.heroDescription}
              </p>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-neutral-200">
                {seoCopy.summary}
              </p>
              <div className="mt-6 flex flex-wrap items-end gap-2">
                <span className="text-4xl font-bold">{formatPrice(locale)}</span>
                <span className="pb-1 text-sm text-neutral-300">{dictionary.perMonth}</span>
              </div>
              <p className="mt-2 text-xs leading-6 text-neutral-400">
                {dictionary.currencyNote}
              </p>
            </div>

            <div className="rounded-[24px] border border-white/15 bg-white/10 p-5">
              <p className="text-xs tracking-[0.18em] text-neutral-300">CURRENT PLAN</p>
              <p className="mt-2 text-xl font-semibold">{currentPlanLabel}</p>
              {subscriber && currentPeriodEnd ? (
                <p className="mt-3 text-xs leading-6 text-neutral-300">
                  {billingSummary?.cancelAtPeriodEnd
                    ? dictionary.availableUntil(currentPeriodEnd)
                    : dictionary.nextRenewal(currentPeriodEnd)}
                </p>
              ) : null}
              <div className="mt-5">
                {officialAccount ? (
                  <span className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/20 bg-white/10 px-5 py-2.5 text-sm font-semibold text-white">
                    {dictionary.noStripeNeeded}
                  </span>
                ) : shouldManageExistingContract ? (
                  <SubscriptionActionButton mode="portal" billingReady={isStripeConfigured()} />
                ) : user ? (
                  <SubscriptionActionButton mode="checkout" billingReady={billingReady} />
                ) : (
                  <Link
                    href={loginHref}
                    className="inline-flex min-h-11 items-center justify-center rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-neutral-100"
                  >
                    {dictionary.loginToSubscribe}
                  </Link>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="mt-8 rounded-[28px] border border-black/10 bg-white p-5 shadow-sm sm:p-7">
          <p className="text-xs tracking-[0.2em] text-neutral-500">PLAN</p>
          <h2 className="mt-2 text-2xl font-semibold">{dictionary.planDifference}</h2>
          <p className="mt-3 max-w-4xl text-sm leading-7 text-neutral-600">{seoCopy.summary}</p>
          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[620px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-black/10 text-neutral-500">
                  <th className="px-3 py-3 font-medium">{dictionary.feature}</th>
                  <th className="px-3 py-3 font-medium">{seoCopy.freeHeader}</th>
                  <th className="px-3 py-3 font-medium text-black">{seoCopy.premiumHeader}</th>
                </tr>
              </thead>
              <tbody>
                {dictionary.comparisons.map((item) => (
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
          <h2 className="text-xl font-semibold">{dictionary.contractTitle}</h2>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-7 text-neutral-700">
            {dictionary.contractItems.map((item) => <li key={item}>{item}</li>)}
          </ul>
          <div className="mt-5 flex flex-wrap gap-4 text-sm">
            <Link href="/terms" className="underline underline-offset-4">{dictionary.terms}</Link>
            <Link href="/privacy" className="underline underline-offset-4">{dictionary.privacy}</Link>
            <Link href="/commercial-transactions" className="underline underline-offset-4">{dictionary.commercial}</Link>
          </div>
        </section>
      </div>
    </main>
  );
}
