"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

type Props = {
  children: ReactNode;
};

const STATUS_HEADINGS = new Set(["作品状態", "Work status", "작품 상태"]);

/**
 * WriteSeriesForm owns the series-state card while translation settings are
 * loaded by the server page. This portal keeps those server-loaded tools inside
 * the existing state card without coupling their data loading to the form.
 */
export default function SeriesStatusPortal({ children }: Props) {
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    function findTarget() {
      const heading = Array.from(document.querySelectorAll<HTMLElement>("p")).find(
        (node) => STATUS_HEADINGS.has(node.textContent?.trim() ?? "")
      );
      const nextTarget = heading?.closest<HTMLElement>("div.rounded-2xl") ?? null;
      if (nextTarget) setTarget(nextTarget);
    }

    findTarget();
    const observer = new MutationObserver(findTarget);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  if (!target) return null;

  return createPortal(
    <div
      data-series-status-translation-tools
      className="mt-4 grid gap-4 border-t border-black/10 pt-4"
    >
      {children}
    </div>,
    target
  );
}
