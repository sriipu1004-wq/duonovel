"use client";

import Link from "next/link";
import { useState } from "react";

type SubscriptionActionButtonProps = {
  mode: "checkout" | "portal";
  billingReady: boolean;
};

type BillingResponse = {
  ok?: boolean;
  url?: string;
  message?: string;
};

export default function SubscriptionActionButton({
  mode,
  billingReady,
}: SubscriptionActionButtonProps) {
  const [accepted, setAccepted] = useState(false);
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function openBilling() {
    if (pending) return;
    if (mode === "checkout" && !accepted) {
      setErrorMessage("料金・自動更新・解約条件を確認してください。");
      return;
    }

    setPending(true);
    setErrorMessage("");
    try {
      const response = await fetch(
        mode === "checkout" ? "/api/billing/checkout" : "/api/billing/portal",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accepted }),
        }
      );
      const payload = (await response.json()) as BillingResponse;
      if (!response.ok || !payload.ok || !payload.url) {
        throw new Error(payload.message || "決済画面を開けませんでした。");
      }
      window.location.assign(payload.url);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "決済画面を開けませんでした。"
      );
      setPending(false);
    }
  }

  if (mode === "portal") {
    return (
      <div>
        <button
          type="button"
          onClick={() => void openBilling()}
          disabled={pending || !billingReady}
          className="inline-flex min-h-11 items-center justify-center rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "契約管理を開いています…" : "契約・支払いを管理"}
        </button>
        {errorMessage ? (
          <p role="alert" className="mt-3 text-xs leading-6 text-red-200">
            {errorMessage}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div>
      <label className="flex cursor-pointer items-start gap-3 text-left text-xs leading-6 text-neutral-300">
        <input
          type="checkbox"
          checked={accepted}
          onChange={(event) => setAccepted(event.target.checked)}
          className="mt-1 h-4 w-4 shrink-0 accent-sky-400"
        />
        <span>
          月額680円（税込）の自動更新、解約後は現在の利用期限まで利用できること、
          <Link href="/terms" className="underline underline-offset-4">
            利用規約
          </Link>
          ・
          <Link href="/commercial-transactions" className="underline underline-offset-4">
            特定商取引法に基づく表記
          </Link>
          を確認しました。
        </span>
      </label>
      <button
        type="button"
        onClick={() => void openBilling()}
        disabled={pending || !billingReady || !accepted}
        className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "決済画面を開いています…" : "月額680円で始める"}
      </button>
      {!billingReady ? (
        <p className="mt-3 text-xs leading-6 text-amber-200">
          現在は決済情報と法定表示の設定待ちです。設定完了まで請求は発生しません。
        </p>
      ) : null}
      {errorMessage ? (
        <p role="alert" className="mt-3 text-xs leading-6 text-red-200">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
