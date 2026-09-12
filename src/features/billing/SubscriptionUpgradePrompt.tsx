"use client";

import Link from "next/link";
import { useUiLocale } from "@/i18n/UiLocaleProvider";
import { billingPromptDictionaries } from "@/i18n/dictionaries/billingPrompt";
import { localizePath } from "@/i18n/navigation";

type SubscriptionUpgradePromptProps = {
  compact?: boolean;
  className?: string;
};

export default function SubscriptionUpgradePrompt({
  compact = false,
  className = "",
}: SubscriptionUpgradePromptProps) {
  const locale = useUiLocale();
  const dictionary = billingPromptDictionaries[locale];

  return (
    <div
      className={`${compact ? "px-3 py-2" : "px-4 py-3"} rounded-2xl border border-sky-200 bg-sky-50 text-sm leading-6 text-sky-950 ${className}`}
    >
      {dictionary.exhausted}{" "}
      <Link
        href={localizePath("/subscription", locale)}
        className="font-semibold underline underline-offset-4"
      >
        {dictionary.viewSubscription}
      </Link>
    </div>
  );
}
