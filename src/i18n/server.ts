import { headers } from "next/headers";
import { DEFAULT_UI_LOCALE, isUiLocale, UI_LOCALE_HEADER, type UiLocale } from "./config";

export async function getUiLocale(): Promise<UiLocale> {
  const requestHeaders = await headers();
  const value = requestHeaders.get(UI_LOCALE_HEADER);
  return isUiLocale(value) ? value : DEFAULT_UI_LOCALE;
}
