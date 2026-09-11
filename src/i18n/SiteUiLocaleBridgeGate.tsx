"use client";

import { usePathname } from "next/navigation";
import type { UiLocale } from "./config";
import { stripUiLocalePrefix } from "./config";
import SiteUiLocaleBridge from "./SiteUiLocaleBridge";

const NATIVE_LOCALIZED_PREFIXES = ["/generate"] as const;

export default function SiteUiLocaleBridgeGate({ locale }: { locale: UiLocale }) {
  const pathname = usePathname();
  const route = stripUiLocalePrefix(pathname);

  if (
    NATIVE_LOCALIZED_PREFIXES.some(
      (prefix) => route === prefix || route.startsWith(`${prefix}/`)
    )
  ) {
    return null;
  }

  return <SiteUiLocaleBridge locale={locale} />;
}
