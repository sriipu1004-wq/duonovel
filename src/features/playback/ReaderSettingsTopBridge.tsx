"use client";

import { useEffect } from "react";

function forcePageTop(): void {
  if (typeof window === "undefined") return;

  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
}

export default function ReaderSettingsTopBridge() {
  useEffect(() => {
    function handleClick(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const settingsButton = target.closest<HTMLButtonElement>(
        'button[aria-label="設定"]'
      );

      if (!settingsButton) return;

      forcePageTop();

      window.requestAnimationFrame(() => {
        forcePageTop();
        window.requestAnimationFrame(forcePageTop);
      });

      window.setTimeout(forcePageTop, 0);
    }

    document.addEventListener("click", handleClick, true);

    return () => {
      document.removeEventListener("click", handleClick, true);
    };
  }, []);

  return null;
}
