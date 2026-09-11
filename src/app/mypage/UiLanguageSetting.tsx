"use client";

import { usePathname } from "next/navigation";
import { UI_LOCALES, UI_LOCALE_COOKIE, uiLocaleLabel, type UiLocale } from "@/i18n/config";
import { localizePath } from "@/i18n/navigation";
import { useUiLocale } from "@/i18n/UiLocaleProvider";

const labels = {
  ja: {
    title: "表示言語",
    body: "LIB read のメニュー、設定、検索などのUI言語を変更する。作品本文の言語や対訳先は変わらない。",
    current: "現在の表示言語",
  },
  en: {
    title: "Interface language",
    body: "Change the language used by LIB read menus, settings, search and other interface elements. This does not change a work's language or translation target.",
    current: "Current interface language",
  },
  ko: {
    title: "표시 언어",
    body: "LIB read의 메뉴, 설정, 검색 등 인터페이스 언어를 변경합니다. 작품 본문의 언어나 번역 대상 언어는 바뀌지 않습니다.",
    current: "현재 표시 언어",
  },
} as const;

export default function UiLanguageSetting() {
  const locale = useUiLocale();
  const pathname = usePathname();
  const text = labels[locale];

  function selectLocale(nextLocale: UiLocale) {
    document.cookie = `${UI_LOCALE_COOKIE}=${nextLocale}; Path=/; Max-Age=31536000; SameSite=Lax`;
    const suffix = `${window.location.search}${window.location.hash}`;
    const nextPath = localizePath(`${pathname}${suffix}`, nextLocale);
    window.location.assign(nextPath);
  }

  return (
    <section className="rounded-[28px] border border-black/10 bg-white p-5 shadow-sm">
      <p className="text-xs tracking-[0.18em] text-neutral-500">LANGUAGE</p>
      <h2 className="mt-2 text-xl font-semibold text-black">{text.title}</h2>
      <p className="mt-3 text-sm leading-7 text-neutral-600">{text.body}</p>

      <div className="mt-5 rounded-[24px] border border-black/10 bg-neutral-50 p-4">
        <p className="text-xs text-neutral-500">{text.current}: {uiLocaleLabel(locale)}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {UI_LOCALES.map((item) => {
            const active = item === locale;
            return (
              <button
                key={item}
                type="button"
                aria-pressed={active}
                onClick={() => selectLocale(item)}
                className={[
                  "rounded-full border px-4 py-2 text-sm font-medium transition",
                  active
                    ? "border-black bg-black text-white"
                    : "border-black/10 bg-white text-neutral-700 hover:bg-neutral-100 hover:text-black",
                ].join(" ")}
              >
                {uiLocaleLabel(item)}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
