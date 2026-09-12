"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useUiLocale } from "@/i18n/UiLocaleProvider";
import { readerDictionaries } from "@/i18n/dictionaries/reader";

type Props = {
  available: boolean;
  visible: boolean;
  onVisibleChange: (visible: boolean) => void;
};

function findDisplaySettingsSection(): HTMLElement | null {
  const explicit = document.querySelector<HTMLElement>("[data-reader-display-settings='true']");
  if (explicit) return explicit;
  return Array.from(document.querySelectorAll<HTMLElement>("main section")).find(
    (section) => section.querySelector<HTMLElement>(":scope > p")?.textContent?.trim() === "DISPLAY"
  ) ?? null;
}

export default function BilingualSettingsBridge({ available, visible, onVisibleChange }: Props) {
  const dictionary = readerDictionaries[useUiLocale()];
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!available) return;
    let currentHost: HTMLElement | null = null;
    function ensureHost() {
      const section = findDisplaySettingsSection();
      if (!section) return;
      const existing = section.querySelector<HTMLElement>(":scope > [data-bilingual-settings-host='true']");
      if (existing) {
        if (currentHost !== existing) { currentHost = existing; setHost(existing); }
        return;
      }
      const nextHost = document.createElement("div");
      nextHost.dataset.bilingualSettingsHost = "true";
      section.appendChild(nextHost);
      currentHost = nextHost;
      setHost(nextHost);
    }
    ensureHost();
    const observer = new MutationObserver(ensureHost);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      if (currentHost?.isConnected) currentHost.remove();
    };
  }, [available]);

  if (!available || !host) return null;
  const chip = (active: boolean) => [
    "rounded-full border px-4 py-2 text-sm font-medium transition",
    active ? "border-sky-200 bg-sky-50 text-black" : "border-black/10 bg-white text-neutral-700 hover:bg-neutral-50",
  ].join(" ");

  return createPortal(
    <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-black/10 bg-white p-4">
      <div>
        <p className="text-sm text-neutral-700">{dictionary.translationFeatureTitle}</p>
        <p className="mt-1 text-xs leading-6 text-neutral-500">{dictionary.translationFeatureHelp}</p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        <button type="button" onClick={() => onVisibleChange(true)} className={chip(visible)}>
          {dictionary.showTranslationFeature}
        </button>
        <button type="button" onClick={() => onVisibleChange(false)} className={chip(!visible)}>
          {dictionary.hideTranslationFeature}
        </button>
      </div>
    </div>,
    host
  );
}
