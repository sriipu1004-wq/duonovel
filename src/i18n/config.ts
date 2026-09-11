export const UI_LOCALES = ["ja", "en", "ko"] as const;

export type UiLocale = (typeof UI_LOCALES)[number];

export const DEFAULT_UI_LOCALE: UiLocale = "ja";
export const UI_LOCALE_HEADER = "x-libread-ui-locale";
export const UI_LOCALE_COOKIE = "libread-ui-locale";

export function isUiLocale(value: string | null | undefined): value is UiLocale {
  return UI_LOCALES.includes(value as UiLocale);
}

export function getUiLocaleFromPathname(pathname: string): UiLocale {
  if (pathname === "/en" || pathname.startsWith("/en/")) return "en";
  if (pathname === "/ko" || pathname.startsWith("/ko/")) return "ko";
  return DEFAULT_UI_LOCALE;
}

export function stripUiLocalePrefix(pathname: string): string {
  if (pathname === "/en" || pathname === "/ko") return "/";
  if (pathname.startsWith("/en/") || pathname.startsWith("/ko/")) {
    return pathname.slice(3) || "/";
  }
  return pathname || "/";
}

export function uiLocaleLabel(locale: UiLocale): string {
  if (locale === "en") return "English";
  if (locale === "ko") return "한국어";
  return "日本語";
}
