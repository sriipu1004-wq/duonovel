"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { stripUiLocalePrefix, type UiLocale } from "./config";
import {
  canonicalizeGenreList,
  getKnownGenreOptions,
  localizeGenreList,
} from "./genreLabels";

const copy = {
  ja: {
    help: "ジャンルは全言語で共通です。表示名だけUI言語に切り替わります。",
    placeholder: "1行1ジャンル\n例: ファンタジー\n恋愛",
  },
  en: {
    help: "Genres are shared across languages. Only their displayed labels change.",
    placeholder: "One genre per line\ne.g. Fantasy\nRomance",
  },
  ko: {
    help: "장르는 모든 언어에서 공통으로 사용됩니다. 표시명만 UI 언어에 맞게 바뀝니다.",
    placeholder: "한 줄에 장르 하나\n예: 판타지\n로맨스",
  },
} as const;

function setNativeTextareaValue(element: HTMLTextAreaElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value"
  );
  descriptor?.set?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

function parseLines(value: string): string[] {
  return value
    .split(/[\n,、]/u)
    .map((item) => item.trim())
    .filter(Boolean);
}

export default function AuthoringGenreLocalePortal({ locale }: { locale: UiLocale }) {
  const pathname = usePathname();
  const route = stripUiLocalePrefix(pathname);
  const active = route.startsWith("/write/series/");
  const [source, setSource] = useState<HTMLTextAreaElement | null>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [displayValue, setDisplayValue] = useState("");
  const knownOptions = useMemo(() => getKnownGenreOptions(locale), [locale]);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let attempts = 0;
    let foundSource: HTMLTextAreaElement | null = null;
    let foundHost: HTMLElement | null = null;

    const attach = () => {
      if (cancelled) return;
      const textareas = Array.from(document.querySelectorAll("textarea"));
      const textarea = textareas.find((item) => {
        const placeholder = item.getAttribute("placeholder") ?? "";
        if (placeholder.includes("1行1ジャンル")) return true;
        const containerText = item.parentElement?.textContent ?? "";
        return /(^|\s)(ジャンル|Genres|장르)(\s|$)/u.test(containerText);
      });

      if (!textarea) {
        attempts += 1;
        if (attempts < 40) window.setTimeout(attach, 100);
        return;
      }

      foundSource = textarea;
      const slot = document.createElement("div");
      slot.dataset.libreadLocalizedGenreEditor = "true";
      textarea.insertAdjacentElement("afterend", slot);
      foundHost = slot;
      textarea.style.display = "none";
      setSource(textarea);
      setHost(slot);
      setDisplayValue(localizeGenreList(parseLines(textarea.value), locale).join("\n"));
    };

    attach();
    return () => {
      cancelled = true;
      setSource(null);
      setHost(null);
      if (foundSource) foundSource.style.display = "";
      if (foundHost?.isConnected) foundHost.remove();
    };
  }, [active, locale, pathname]);

  if (!active || !source || !host) return null;

  function commitDisplayedValue(nextDisplay: string) {
    setDisplayValue(nextDisplay);
    const canonical = canonicalizeGenreList(parseLines(nextDisplay));
    setNativeTextareaValue(source!, canonical.join("\n"));
  }

  function addKnownGenre(canonical: string) {
    const current = canonicalizeGenreList(parseLines(source!.value));
    const exists = current.includes(canonical);
    const next = exists
      ? current.filter((item) => item !== canonical)
      : [...current, canonical];
    setNativeTextareaValue(source!, next.join("\n"));
    setDisplayValue(localizeGenreList(next, locale).join("\n"));
  }

  const selectedCanonical = new Set(canonicalizeGenreList(parseLines(source.value)));
  const text = copy[locale];

  return createPortal(
    <div className="mt-3">
      <textarea
        value={displayValue}
        onChange={(event) => commitDisplayedValue(event.target.value)}
        onBlur={() =>
          setDisplayValue(
            localizeGenreList(
              canonicalizeGenreList(parseLines(source.value)),
              locale
            ).join("\n")
          )
        }
        rows={3}
        placeholder={text.placeholder}
        className="w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm leading-7 text-black outline-none placeholder:text-neutral-400"
      />
      <p className="mt-2 text-xs leading-5 text-neutral-500">{text.help}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {knownOptions.map((option) => {
          const selected = selectedCanonical.has(option.canonical);
          return (
            <button
              key={option.canonical}
              type="button"
              aria-pressed={selected}
              onClick={() => addKnownGenre(option.canonical)}
              className={[
                "rounded-full border px-3 py-1.5 text-xs transition",
                selected
                  ? "border-violet-300 bg-violet-50 text-black"
                  : "border-black/10 bg-white text-neutral-700 hover:border-violet-200 hover:bg-violet-50",
              ].join(" ")}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>,
    host
  );
}
