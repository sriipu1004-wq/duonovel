"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { useUiLocale } from "@/i18n/UiLocaleProvider";
import { stripUiLocalePrefix } from "@/i18n/config";
import {
  CONTENT_LANGUAGE_FILTER_COOKIE,
  CONTENT_LANGUAGES,
  contentLanguageLabel,
  parseContentLanguageList,
  type ContentLanguage,
} from "@/i18n/contentLanguage";

type Counts = Record<ContentLanguage, number>;

const copy = {
  ja: {
    title: "作品の言語",
    help: "複数選択可。未選択なら全言語を表示。",
    more: "さらに表示",
    close: "閉じる",
  },
  en: {
    title: "Work language",
    help: "Select multiple languages. No selection shows all languages.",
    more: "Show more",
    close: "Show less",
  },
  ko: {
    title: "작품 언어",
    help: "여러 언어를 선택할 수 있습니다. 미선택 시 모든 언어를 표시합니다.",
    more: "더 보기",
    close: "접기",
  },
} as const;

function readSelectedLanguages(): ContentLanguage[] {
  if (typeof document === "undefined") return [];
  const cookie = document.cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${CONTENT_LANGUAGE_FILTER_COOKIE}=`));
  if (!cookie) return [];
  return parseContentLanguageList(decodeURIComponent(cookie.slice(cookie.indexOf("=") + 1)));
}

function writeSelectedLanguages(languages: ContentLanguage[]) {
  if (languages.length === 0) {
    document.cookie = `${CONTENT_LANGUAGE_FILTER_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
    return;
  }
  document.cookie = `${CONTENT_LANGUAGE_FILTER_COOKIE}=${encodeURIComponent(languages.join(","))}; Path=/; Max-Age=2592000; SameSite=Lax`;
}

function findOrderColumn(section: Element): HTMLElement | null {
  const heading = Array.from(section.querySelectorAll("p")).find(
    (item) => item.textContent?.trim() === "ORDER"
  );
  return heading?.parentElement ?? null;
}

export default function SearchLanguageFilterPortal() {
  const pathname = usePathname();
  const locale = useUiLocale();
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [counts, setCounts] = useState<Counts>({ ja: 0, en: 0, ko: 0, other: 0 });
  const [selected, setSelected] = useState<ContentLanguage[]>([]);
  const [expanded, setExpanded] = useState(false);
  const route = stripUiLocalePrefix(pathname);
  const active = route === "/search" || route === "/search/saved";

  useEffect(() => {
    if (!active) {
      setHost(null);
      return;
    }

    setSelected(readSelectedLanguages());
    let cancelled = false;
    let attempts = 0;

    const attach = () => {
      if (cancelled) return;
      const sections = Array.from(document.querySelectorAll("main section"));
      const orderColumn = sections.map(findOrderColumn).find(Boolean) ?? null;
      if (orderColumn) {
        let slot = orderColumn.querySelector<HTMLElement>("[data-libread-language-filter-slot]");
        if (!slot) {
          slot = document.createElement("div");
          slot.dataset.libreadLanguageFilterSlot = "true";
          slot.className = "mt-5";
          orderColumn.appendChild(slot);
        }
        setHost(slot);
        return;
      }
      attempts += 1;
      if (attempts < 30) window.setTimeout(attach, 100);
    };

    attach();
    return () => {
      cancelled = true;
    };
  }, [active, pathname]);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    void fetch("/api/public/work-language-counts", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload: { counts?: Partial<Counts> }) => {
        if (cancelled || !payload.counts) return;
        setCounts({
          ja: Number(payload.counts.ja ?? 0),
          en: Number(payload.counts.en ?? 0),
          ko: Number(payload.counts.ko ?? 0),
          other: Number(payload.counts.other ?? 0),
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [active]);

  const orderedLanguages = useMemo(() => {
    const preferred = locale as ContentLanguage;
    const items = CONTENT_LANGUAGES.filter(
      (language) => language !== "other" || counts.other > 0
    );
    return [...items].sort((a, b) => {
      if (a === preferred && b !== preferred) return -1;
      if (b === preferred && a !== preferred) return 1;
      if (counts[b] !== counts[a]) return counts[b] - counts[a];
      return CONTENT_LANGUAGES.indexOf(a) - CONTENT_LANGUAGES.indexOf(b);
    });
  }, [counts, locale]);

  if (!active || !host) return null;

  const visibleLanguages = expanded ? orderedLanguages : orderedLanguages.slice(0, 5);
  const text = copy[locale];

  function toggle(language: ContentLanguage) {
    const next = selected.includes(language)
      ? selected.filter((item) => item !== language)
      : [...selected, language];
    setSelected(next);
    writeSelectedLanguages(next);
    window.location.reload();
  }

  return createPortal(
    <div className="border-t border-black/10 pt-4">
      <p className="text-[11px] tracking-[0.18em] text-neutral-500">{text.title}</p>
      <p className="mt-1.5 text-xs leading-6 text-neutral-500">{text.help}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {visibleLanguages.map((language) => {
          const activeLanguage = selected.includes(language);
          return (
            <button
              key={language}
              type="button"
              aria-pressed={activeLanguage}
              onClick={() => toggle(language)}
              className={[
                "inline-flex items-center rounded-full border px-3 py-1.5 text-xs transition",
                activeLanguage
                  ? "border-sky-300 bg-sky-50 text-black"
                  : "border-black/10 bg-white text-neutral-700 hover:border-sky-200 hover:bg-sky-50",
              ].join(" ")}
            >
              <span>{contentLanguageLabel(language, locale)}</span>
              <span className="ml-1.5 text-[10px] text-neutral-400">{counts[language]}</span>
            </button>
          );
        })}
      </div>
      {orderedLanguages.length > 5 ? (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="mt-2 text-xs text-neutral-500 underline decoration-black/20 underline-offset-4 transition hover:text-black"
        >
          {expanded ? text.close : text.more}
        </button>
      ) : null}
    </div>,
    host
  );
}
