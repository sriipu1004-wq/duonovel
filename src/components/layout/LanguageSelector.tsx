"use client";

import { usePathname, useRouter } from "next/navigation";
import { UI_LOCALES, uiLocaleLabel, type UiLocale } from "@/i18n/config";
import { writeUiLocaleCookie } from "@/i18n/uiLocaleCookie";
import { localizePath } from "@/i18n/navigation";
import { useCommonDictionary, useUiLocale } from "@/i18n/UiLocaleProvider";

export default function LanguageSelector() {
  const locale = useUiLocale();
  const dictionary = useCommonDictionary();
  const pathname = usePathname();
  const router = useRouter();

  function selectLocale(nextLocale: UiLocale) {
    writeUiLocaleCookie(nextLocale);
    const suffix = typeof window === "undefined"
      ? ""
      : `${window.location.search}${window.location.hash}`;
    router.push(localizePath(`${pathname}${suffix}`, nextLocale));
  }

  return (
    <div className="flex shrink-0 items-center gap-1" aria-label={dictionary.language}>
      {UI_LOCALES.map((item) => (
        <button
          key={item}
          type="button"
          onClick={() => selectLocale(item)}
          aria-pressed={locale === item}
          className={`min-h-9 rounded-full px-2.5 text-xs font-medium transition sm:px-3 ${
            locale === item
              ? "bg-black text-white"
              : "border border-black/10 bg-white text-neutral-600 hover:bg-neutral-50 hover:text-black"
          }`}
        >
          {uiLocaleLabel(item)}
        </button>
      ))}
    </div>
  );
}
