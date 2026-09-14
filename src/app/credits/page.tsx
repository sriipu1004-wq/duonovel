import Link from "next/link";
import { requireLoggedInUser } from "@/lib/auth/requireLoggedInUser";
import { getUiLocale } from "@/i18n/server";
import CreditBalanceCard from "@/app/mypage/CreditBalanceCard";
import { getAuthenticatedCreditBalance } from "@/lib/translation/publicTranslationCredits.server";
import {
  getCreditPackCatalog,
  isCreditPurchaseEnabled,
} from "@/lib/billing/creditPackCatalog";

type PageProps = {
  searchParams: Promise<{ credit_checkout?: string }>;
};

const COPY = {
  ja: {
    eyebrow: "CREDIT STORE",
    title: "クレジット購入",
    lead: "公開作品の翻訳で本日の利用枠を使い切った後、1クレジットで1話・1翻訳言語を解放できます。",
    rule1: "同じ話・同じ翻訳言語は、一度解放すれば再読で追加消費しません。",
    rule2: "Free / Premium の本日の利用枠が残っている場合は、購入クレジットより先に利用枠を使います。",
    rule3: "購入クレジットには各パック記載の有効期限があります。現金化・譲渡はできません。",
    success: "決済を受け付けました。Stripeからの決済完了通知後、残高へ反映されます。",
    canceled: "決済はキャンセルされました。クレジットは追加されていません。",
    mypage: "マイページへ戻る",
    legal: "販売条件を見る",
  },
  en: {
    eyebrow: "CREDIT STORE",
    title: "Buy credits",
    lead: "After using today's included public translations, 1 credit unlocks 1 episode in 1 translation language.",
    rule1: "Once an episode/language is unlocked, rereading it does not consume another credit.",
    rule2: "If your Free or Premium included allowance remains, it is used before purchased credits.",
    rule3: "Purchased credits expire as shown for each pack and cannot be cashed out or transferred.",
    success: "Your payment was received. The balance updates after Stripe confirms the completed payment.",
    canceled: "Checkout was canceled. No credits were added.",
    mypage: "Back to My Page",
    legal: "View sale terms",
  },
  ko: {
    eyebrow: "CREDIT STORE",
    title: "크레딧 구매",
    lead: "오늘 포함된 공개 번역 이용 횟수를 모두 사용한 뒤, 1크레딧으로 1화·1번역 언어를 잠금 해제할 수 있습니다.",
    rule1: "같은 화·같은 번역 언어는 한 번 잠금 해제하면 다시 읽어도 추가 차감되지 않습니다.",
    rule2: "Free / Premium 포함 이용 횟수가 남아 있으면 구매 크레딧보다 먼저 사용됩니다.",
    rule3: "구매 크레딧에는 각 팩에 표시된 유효기간이 있으며 현금화·양도할 수 없습니다.",
    success: "결제가 접수되었습니다. Stripe의 결제 완료 확인 후 잔액에 반영됩니다.",
    canceled: "결제가 취소되었습니다. 크레딧은 추가되지 않았습니다.",
    mypage: "마이페이지로 돌아가기",
    legal: "판매 조건 보기",
  },
} as const;

export default async function CreditsPage({ searchParams }: PageProps) {
  await requireLoggedInUser("/credits");
  const locale = await getUiLocale();
  const copy = COPY[locale];
  const params = await searchParams;
  const balance = await getAuthenticatedCreditBalance();

  let purchaseEnabled = false;
  let publicPacks: Array<{
    id: string;
    credits: number;
    displayPriceJpy: number;
    expiresInDays: number;
  }> = [];

  if (balance !== null) {
    try {
      purchaseEnabled = isCreditPurchaseEnabled();
      publicPacks = getCreditPackCatalog().map((pack) => ({
        id: pack.id,
        credits: pack.credits,
        displayPriceJpy: pack.displayPriceJpy,
        expiresInDays: pack.expiresInDays,
      }));
    } catch (error) {
      console.error("[credit-store-catalog]", error);
    }
  }

  return (
    <main className="min-h-screen bg-white text-black">
      <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-center gap-4 text-sm text-neutral-600">
          <Link href="/mypage" className="underline underline-offset-4">
            {copy.mypage}
          </Link>
          <Link href="/commercial-transactions" className="underline underline-offset-4">
            {copy.legal}
          </Link>
        </div>

        <header className="mt-7">
          <p className="text-xs tracking-[0.2em] text-neutral-500">{copy.eyebrow}</p>
          <h1 className="mt-3 text-3xl font-bold">{copy.title}</h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-neutral-600">{copy.lead}</p>
        </header>

        <div className="mt-6 grid gap-3 rounded-[28px] border border-black/10 bg-neutral-50 p-5 text-sm leading-7 text-neutral-700">
          <p>{copy.rule1}</p>
          <p>{copy.rule2}</p>
          <p>{copy.rule3}</p>
        </div>

        {params.credit_checkout === "success" ? (
          <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm leading-7 text-emerald-800">
            {copy.success}
          </div>
        ) : params.credit_checkout === "canceled" ? (
          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm leading-7 text-amber-800">
            {copy.canceled}
          </div>
        ) : null}

        <div className="mt-6">
          <CreditBalanceCard
            balance={balance ?? 0}
            packs={publicPacks}
            purchaseEnabled={purchaseEnabled}
          />
        </div>
      </div>
    </main>
  );
}
