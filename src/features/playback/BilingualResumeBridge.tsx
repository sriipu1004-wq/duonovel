"use client";

import { useEffect } from "react";

type BilingualResumeBridgeProps = {
  segmentIndex: number | null;
  restoreToken: number;
};

export default function BilingualResumeBridge({
  segmentIndex,
  restoreToken,
}: BilingualResumeBridgeProps) {
  useEffect(() => {
    if (segmentIndex === null || segmentIndex < 0) return;

    let restored = false;

    function restore() {
      if (restored) return true;

      const targets = Array.from(
        document.querySelectorAll<HTMLElement>('main article span[role="button"]')
      );
      const target = targets[segmentIndex];

      if (!target) return false;

      restored = true;
      target.click();

      window.requestAnimationFrame(() => {
        target.scrollIntoView({ block: "center", behavior: "auto" });
        window.requestAnimationFrame(() => {
          target.scrollIntoView({ block: "center", behavior: "auto" });
        });
      });

      return true;
    }

    if (restore()) return;

    const observer = new MutationObserver(() => {
      if (restore()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    const timeout = window.setTimeout(() => observer.disconnect(), 3000);

    return () => {
      observer.disconnect();
      window.clearTimeout(timeout);
    };
  }, [segmentIndex, restoreToken]);

  return null;
}
