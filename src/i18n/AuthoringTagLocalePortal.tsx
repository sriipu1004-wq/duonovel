"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { useUiLocale } from "./UiLocaleProvider";
import { stripUiLocalePrefix } from "./config";
import {
  canonicalizeTagList,
  getKnownTagOptions,
  localizeTagList,
} from "./tagLabels";

const copy = {
  ja: {
    help: "既存タグは全言語で共通です。表示名だけUI言語に切り替わります。",
    placeholder: "1行1タグ\n例: 異世界\nダークファンタジー",
  },
  en: {
    help: "Existing tags are shared across languages. Only their displayed labels change.",
    placeholder: "One tag per line\ne.g. Isekai\nDark fantasy",
  },
  ko: {
    help: "기존 태그는 모든 언어에서 공통으로 사용됩니다. 표시명만 UI 언어에 맞게 바뀝니다.",
    placeholder: "한 줄에 태그 하나\n예: 이세계\n다크 판타지",
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

export default function AuthoringTagLocalePortal() {
  const pathname = usePathname();
  const locale = useUiLocale();
  const route = stripUiLocalePrefix(pathname);
  const active = route.startsWith("/write/series/");
  const [source, setSource] = useState<HTMLTextAreaElement | null>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [displayValue, setDisplayValue] = useState("");
  const knownOptions = useMemo(() => getKnownTagOptions(locale), [locale]);

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
        if (placeholder.includes("1行1タグ")) return true;
        const containerText = item.parentElement?.textContent ?? "";
        return /(^|\s)(タグ|Tags|태그)(\s|$)/u.test(containerText);
      });

      if (!textarea) {
        attempts += 1;
        if (attempts < 40) window.setTimeout(attach, 100);
        return;
      }

      foundSource = textarea;
      const slot = document.createElement("div");
      slot.dataset.libreadLocalizedTagEditor = "true";
      textarea.insertAdjacentElement("afterend", slot);
      foundHost = slot;
      textarea.style.display = "none";
      setSource(textarea);
      setHost(slot);
      setDisplayValue(localizeTagList(parseLines(textarea.value), locale).join("\n"));
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
    const canonical = canonicalizeTagList(parseLines(nextDisplay));
    setNativeTextareaValue(source!, canonical.join("\n"));
  }

  function addKnownTag(canonical: string) {
    const current = canonicalizeTagList(parseLines(source!.value));
    const exists = current.some((item) => item === canonical);
    const next = exists
      ? current.filter((item) => item !== canonical)
      : [...current, canonical];
    setNativeTextareaValue(source!, next.join("\n"));
    setDisplayValue(localizeTagList(next, locale).join("\n"));
  }

  const selectedCanonical = new Set(canonicalizeTagList(parseLines(source.value)));
  const text = copy[locale];

  return createPortal(
    <div className="mt-3">
      <textarea
        value={displayValue}
        onChange={(event) => commitDisplayedValue(event.target.value)}
        onBlur={() =>
          setDisplayValue(
            localizeTagList(
              canonicalizeTagList(parseLines(source.value)),
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
              onClick={() => addKnownTag(option.canonical)}
              className={[
                "rounded-full border px-3 py-1.5 text-xs transition",
                selected
                  ? "border-sky-300 bg-sky-50 text-black"
                  : "border-black/10 bg-white text-neutral-700 hover:border-sky-200 hover:bg-sky-50",
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
