"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type BilingualActionBridgeProps = {
  enabled: boolean;
  onEnable: () => void;
};

function findPrimaryReaderActions(): HTMLElement | null {
  const candidates = Array.from(
    document.querySelectorAll<HTMLElement>("main span, main a")
  );

  const narrationBadge = candidates.find((node) => {
    const text = node.textContent?.trim() ?? "";
    return (
      text === "ブラウザ読み上げ" ||
      text === "朗読停止中" ||
      text.startsWith("人の朗読:")
    );
  });

  const row = narrationBadge?.parentElement;
  return row instanceof HTMLElement ? row : null;
}

export default function BilingualActionBridge({
  enabled,
  onEnable,
}: BilingualActionBridgeProps) {
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!enabled) {
      setHost(null);
      return;
    }

    let currentHost: HTMLElement | null = null;

    function ensureHost() {
      const row = findPrimaryReaderActions();

      if (!row) {
        if (currentHost && !currentHost.isConnected) {
          currentHost = null;
          setHost(null);
        }
        return;
      }

      const existing = row.querySelector<HTMLElement>(
        ":scope > [data-bilingual-action-host='true']"
      );

      if (existing) {
        if (currentHost !== existing) {
          currentHost = existing;
          setHost(existing);
        }
        return;
      }

      const nextHost = document.createElement("span");
      nextHost.dataset.bilingualActionHost = "true";
      nextHost.style.display = "contents";
      row.appendChild(nextHost);

      currentHost = nextHost;
      setHost(nextHost);
    }

    ensureHost();

    const observer = new MutationObserver(ensureHost);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      if (currentHost?.isConnected) currentHost.remove();
      currentHost = null;
    };
  }, [enabled]);

  if (!enabled || !host) return null;

  return createPortal(
    <button
      type="button"
      onClick={onEnable}
      className="rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-medium text-black transition hover:bg-sky-100"
    >
      英語対訳をオン
    </button>,
    host
  );
}
