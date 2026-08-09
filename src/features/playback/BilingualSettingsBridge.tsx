"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type BilingualSettingsBridgeProps = {
  enabled: boolean;
  onEnable: () => void;
};

function findDisplaySettingsSection(): HTMLElement | null {
  const sections = Array.from(document.querySelectorAll<HTMLElement>("main section"));

  for (const section of sections) {
    const labels = Array.from(section.querySelectorAll<HTMLElement>("p"));
    if (labels.some((label) => label.textContent?.trim() === "DISPLAY")) {
      return section;
    }
  }

  return null;
}

export default function BilingualSettingsBridge({
  enabled,
  onEnable,
}: BilingualSettingsBridgeProps) {
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!enabled) {
      setHost(null);
      return;
    }

    let currentHost: HTMLElement | null = null;

    function ensureHost() {
      const section = findDisplaySettingsSection();

      if (!section) {
        if (currentHost && !currentHost.isConnected) {
          currentHost = null;
          setHost(null);
        }
        return;
      }

      const existing = section.querySelector<HTMLElement>(
        "[data-bilingual-settings-host='true']"
      );

      if (existing) {
        if (currentHost !== existing) {
          currentHost = existing;
          setHost(existing);
        }
        return;
      }

      const nextHost = document.createElement("div");
      nextHost.dataset.bilingualSettingsHost = "true";
      const heading = section.querySelector("h3");

      if (heading?.nextSibling) {
        section.insertBefore(nextHost, heading.nextSibling);
      } else {
        section.appendChild(nextHost);
      }

      currentHost = nextHost;
      setHost(nextHost);
    }

    ensureHost();

    const observer = new MutationObserver(() => {
      ensureHost();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => {
      observer.disconnect();
      if (currentHost?.isConnected) {
        currentHost.remove();
      }
      currentHost = null;
    };
  }, [enabled]);

  if (!enabled || !host) {
    return null;
  }

  return createPortal(
    <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-black/10 bg-white p-4">
      <div>
        <p className="text-sm text-neutral-700">英語対訳</p>
        <p className="mt-1 text-xs leading-6 text-neutral-500">
          日本語と英語を上下に分け、対応する文を連動して読めます。
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        <span className="rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-medium text-black">
          オフ
        </span>
        <button
          type="button"
          onClick={onEnable}
          className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50"
        >
          オン
        </button>
      </div>
    </div>,
    host
  );
}
