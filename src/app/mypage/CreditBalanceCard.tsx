"use client";

import Link from "next/link";
import { useState } from "react";
import { useUiLocale } from "@/i18n/UiLocaleProvider";
import { localizePath } from "@/i18n/navigation";

type PublicCreditPack = {
  id: string;
  credits: number;
  displayPriceJpy: number;
  expiresInDays: number;
};

type Props = {
  balance: number;
  packs: PublicCreditPack[];
  purchaseEnabled: boolean;
  showStoreLink?: boolean;
};

const COPY = {
  ja: {
    eyebrow: "CREDITS",
    title: "クレジット",
    balance: (value: number) => `クレジット: ${value}`,
    description: "公開作品の翻訳で、本日の利用枠を超えた話を1話・1翻訳言語ごとに解放できる。解放済みの話は再読無料。",
    store: "クレジットを購入",
    buy: "クレジットを購入",
    terms: "価格・有効期限・返金条件を確認した",
    legal: "販売条件・利用規約を確認",
    expiry: (days: number) => `購入日から${days}日`,
    processing: "決済画面を準備中…",
  },
  en: {
    eyebrow: "CREDITS",
    title: "Credits",
    balance: (value: number) => `Credits: ${value}`,
    description: "Use credits to unlock public episode translations after your included daily usage. An unlocked episode/language can be reread without another charge.",
    store: "Buy credits",
    buy: "Buy credits",
    terms: "I reviewed the price, expiry, and refund terms",
    legal: "Review sale terms and Terms of Service",
    expiry: (days: number) => `${days} days from purchase`,
    processing: "Opening checkout…",
  },
  ko: {
    eyebrow: "CREDITS",
    title: "크레딧",
    balance: (value: number) => `크레딧: ${value}`,
    description: "오늘 포함된 이용 횟수를 초과한 공개 작품 번역을 화·번역 언어별로 잠금 해제할 수 있습니다. 잠금 해제한 번역은 다시 읽어도 추가 차감되지 않습니다.",
    store: "크레딧 구매",
    buy: "크레딧 구매",
    terms: "가격, 유효기간, 환불 조건을 확인했습니다",
    legal: "판매 조건 및 이용약관 확인",
    expiry: (days: number) => `구매일로부터 ${days}일`,
    processing: "결제 화면 준비 중…",
  },
} as const;

export default function CreditBalanceCard({
  balance,
  packs,
  purchaseEnabled,
  showStoreLink = true,
}: Props) {
  const locale = useUiLocale();
  const copy = COPY[locale];
  const [accepted, setAccepted] = useState(false);
  const [busyPackId, setBusyPackId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function buy(packId: string) {
    if (!accepted || busyPackId) return;
    setBusyPackId(packId);
    setError("");
    try {
      const response = await fetch("/api/billing/credits/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packId, accepted: true }),
      });
      const payload = (await response.json()) as { ok?: boolean; url?: string; error?: string };
      if (!response.ok || !payload.ok || !payload.url) {
        setError(payload.error || "credit_checkout_failed");
        return;
      }
      window.location.assign(payload.url);
    } catch {
      setError("credit_checkout_failed");
    } finally {
      setBusyPackId(null);
    }
  }

  return (
    <section id="credits" className="scroll-mt-6 rounded-[28px] border border-black/10 bg-white p-5 shadow-sm">
      <p className="text-xs tracking-[0.18em] text-neutral-500">{copy.eyebrow}</p>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-black">{copy.title}</h2>
          <p className="mt-2 text-2xl font-semibold text-black">{copy.balance(balance)}</p>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-neutral-600">{copy.description}</p>
        </div>
        {showStoreLink ? (
          <Link
            href={localizePath("/credits", locale)}
            className="rounded-full bg-black px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-neutral-800"
          >
            {copy.store}
          </Link>
        ) : null}
      </div>

      {!showStoreLink && purchaseEnabled && packs.length > 0 ? (
        <div className="mt-5">
          <div className="flex flex-wrap gap-3 text-sm text-neutral-600">
            <Link href="/commercial-transactions" className="underline underline-offset-4">
              {copy.legal}
            </Link>
            <Link href="/terms" className="underline underline-offset-4">
              Terms
            </Link>
          </div>
          <label className="mt-3 flex items-start gap-2 text-sm text-neutral-700">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(event) => setAccepted(event.target.checked)}
              className="mt-1"
            />
            <span>{copy.terms}</span>
          </label>
          <div className="mt-4 flex flex-wrap gap-3">
            {packs.map((pack) => (
              <button
                key={pack.id}
                type="button"
                disabled={!accepted || busyPackId !== null}
                onClick={() => void buy(pack.id)}
                className="rounded-2xl border border-black/10 px-4 py-3 text-left transition hover:bg-neutral-50 disabled:opacity-50"
              >
                <span className="block text-sm font-semibold text-black">
                  {pack.credits} credits · ¥{pack.displayPriceJpy.toLocaleString("ja-JP")}
                </span>
                <span className="mt-1 block text-xs text-neutral-500">
                  {busyPackId === pack.id ? copy.processing : copy.expiry(pack.expiresInDays)}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
    </section>
  );
}
