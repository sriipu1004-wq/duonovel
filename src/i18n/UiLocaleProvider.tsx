"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { UiLocale } from "./config";
import { commonDictionaries } from "./dictionaries/common";
import LegalContentGuardBridge from "./LegalContentGuardBridge";
import PublicWorkLanguagePriorityBridge from "./PublicWorkLanguagePriorityBridge";
import ReaderUiLocaleBridge from "./ReaderUiLocaleBridge";
import SiteUiLocaleBridgeGate from "./SiteUiLocaleBridgeGate";
import AuthoringUiLocaleBridge from "./AuthoringUiLocaleBridge";
import SearchTagUiLocaleBridge from "./SearchTagUiLocaleBridge";
import AuthoringTagLocalePortal from "./AuthoringTagLocalePortal";
import AuthoringGenreLocalePortal from "./AuthoringGenreLocalePortal";
import RecordUiLocaleBridge from "./RecordUiLocaleBridge";

const UiLocaleContext = createContext<UiLocale>("ja");

export function UiLocaleProvider({ locale, children }: { locale: UiLocale; children: ReactNode }) {
  return (
    <UiLocaleContext.Provider value={locale}>
      {children}
      <LegalContentGuardBridge />
      <PublicWorkLanguagePriorityBridge locale={locale} />
      <SiteUiLocaleBridgeGate locale={locale} />
      <AuthoringUiLocaleBridge locale={locale} />
      <ReaderUiLocaleBridge locale={locale} />
      <SearchTagUiLocaleBridge locale={locale} />
      <AuthoringTagLocalePortal locale={locale} />
      <AuthoringGenreLocalePortal locale={locale} />
      <RecordUiLocaleBridge locale={locale} />
    </UiLocaleContext.Provider>
  );
}

export function useUiLocale(): UiLocale {
  return useContext(UiLocaleContext);
}

export function useCommonDictionary() {
  return commonDictionaries[useUiLocale()];
}
