import { UI_LOCALE_COOKIE, type UiLocale } from "@/i18n/config";

// Client-only: persists the chosen UI locale. Kept outside components so the
// React Compiler lint (react-hooks/immutability) does not flag the global write.
export function writeUiLocaleCookie(locale: UiLocale): void {
  document.cookie = `${UI_LOCALE_COOKIE}=${locale}; Path=/; Max-Age=31536000; SameSite=Lax`;
}
