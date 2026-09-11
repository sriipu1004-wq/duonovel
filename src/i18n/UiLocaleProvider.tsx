"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { UiLocale } from "./config";
import { commonDictionaries } from "./dictionaries/common";

const UiLocaleContext = createContext<UiLocale>("ja");

export function UiLocaleProvider({ locale, children }: { locale: UiLocale; children: ReactNode }) {
  return <UiLocaleContext.Provider value={locale}>{children}</UiLocaleContext.Provider>;
}

export function useUiLocale(): UiLocale {
  return useContext(UiLocaleContext);
}

export function useCommonDictionary() {
  return commonDictionaries[useUiLocale()];
}
