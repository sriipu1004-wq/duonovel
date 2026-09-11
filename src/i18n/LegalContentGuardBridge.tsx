"use client";

import { useLayoutEffect } from "react";
import { usePathname } from "next/navigation";
import { stripUiLocalePrefix } from "./config";

const JAPANESE_SOURCE_PATHS = new Set([
  "/terms",
  "/privacy",
  "/commercial-transactions",
  "/record/terms",
]);

export default function LegalContentGuardBridge() {
  const pathname = usePathname();

  useLayoutEffect(() => {
    const route = stripUiLocalePrefix(pathname);
    if (!JAPANESE_SOURCE_PATHS.has(route)) return;

    const main = document.querySelector("main");
    if (!(main instanceof HTMLElement)) return;

    const alreadyProtected = main.hasAttribute("data-no-ui-localize");
    main.setAttribute("data-no-ui-localize", "true");

    return () => {
      if (!alreadyProtected) main.removeAttribute("data-no-ui-localize");
    };
  }, [pathname]);

  return null;
}
