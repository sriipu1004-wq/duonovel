"use client";

import Link from "next/link";
import { useState } from "react";
import { useUiLocale } from "@/i18n/UiLocaleProvider";
import { subscriptionDictionaries } from "@/i18n/dictionaries/subscription";
import { localizePath } from "@/i18n/navigation";

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
  const locale = useUiLocale();
  const dictionary = subscriptionDictionaries[locale];
  const [accepted, setAccepted] = useState(false);
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function openBilling() {
    if (pending) return;
    if (mode === "checkout" && !accepted) {
      setErrorMessage(dictionary.acceptRequired);
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
          body: JSON.stringify({ accepted, locale }),
        }
      );
      const payload = (await response.json()) as BillingResponse;
      if (!response.ok || !payload.ok || !payload.url) {
        throw new Error(payload.message || dictionary.openBillingFailed);
      }
      window.location.assign(payload.url);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : dictionary.openBillingFailed
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
          {pending ? dictionary.openingPortal : dictionary.manageBilling}
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
          {dictionary.acceptBilling}{" "}
          <Link href={localizePath("/terms", locale)} className="underline underline-offset-4">
            {dictionary.terms}
          </Link>
          {" · "}
          <Link href={localizePath("/commercial-transactions", locale)} className="underline underline-offset-4">
            {dictionary.commercial}
          </Link>
        </span>
      </label>
      <button
        type="button"
        onClick={() => void openBilling()}
        disabled={pending || !billingReady || !accepted}
        className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? dictionary.openingCheckout : dictionary.startPaid}
      </button>
      {!billingReady ? (
        <p className="mt-3 text-xs leading-6 text-amber-200">
          {dictionary.billingNotReady}
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
