"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { UI_LOCALES, UI_LOCALE_COOKIE, uiLocaleLabel, type UiLocale } from "@/i18n/config";
import { localizePath } from "@/i18n/navigation";
import { useCommonDictionary, useUiLocale } from "@/i18n/UiLocaleProvider";

export default function LanguageSelector() {
  const locale = useUiLocale();
  const dictionary = useCommonDictionary();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  function selectLocale(nextLocale: UiLocale) {
    document.cookie = `${UI_LOCALE_COOKIE}=${nextLocale}; Path=/; Max-Age=31536000; SameSite=Lax`;
    const query = searchParams.toString();
    const current = `${pathname}${query ? `?${query}` : ""}`;
    router.push(localizePath(current, nextLocale));
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
