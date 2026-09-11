"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { UiLocale } from "./config";
import { commonDictionaries } from "./dictionaries/common";
import ReaderUiLocaleBridge from "./ReaderUiLocaleBridge";
import SiteUiLocaleBridge from "./SiteUiLocaleBridge";
import AuthoringUiLocaleBridge from "./AuthoringUiLocaleBridge";
import SearchLanguageFilterPortal from "@/components/search/SearchLanguageFilterPortal";

const UiLocaleContext = createContext<UiLocale>("ja");

export function UiLocaleProvider({ locale, children }: { locale: UiLocale; children: ReactNode }) {
  return (
    <UiLocaleContext.Provider value={locale}>
      {children}
      <SiteUiLocaleBridge locale={locale} />
      <AuthoringUiLocaleBridge locale={locale} />
      <ReaderUiLocaleBridge locale={locale} />
      <SearchLanguageFilterPortal />
    </UiLocaleContext.Provider>
  );
}

export function useUiLocale(): UiLocale {
  return useContext(UiLocaleContext);
}

export function useCommonDictionary() {
  return commonDictionaries[useUiLocale()];
}
