"use client";

import { useEffect, useState } from "react";
import {
  LANGUAGE_REGISTRY,
  parseSupportedLanguageTag,
  type SupportedLanguageTag,
} from "@/lib/translation/languageRegistry";

const PENDING_CREATE_SOURCE_LANGUAGE_KEY =
  "duonovel:pending-source-language-create";

const SOURCE_LANGUAGE_OPTIONS = Object.keys(
  LANGUAGE_REGISTRY
) as SupportedLanguageTag[];

type Props = {
  seriesId?: string | null;
  initialLanguage?: SupportedLanguageTag | null;
  confirmed?: boolean;
};

export default function SourceLanguageWorkspaceBridge({
  seriesId,
  initialLanguage = null,
  confirmed = false,
}: Props) {
  const [language, setLanguage] = useState<SupportedLanguageTag>(
    initialLanguage ?? "ja"
  );
  const [savedLanguage, setSavedLanguage] = useState<SupportedLanguageTag | null>(
    confirmed ? initialLanguage : null
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!initialLanguage) return;
    setLanguage(initialLanguage);
    setSavedLanguage(confirmed ? initialLanguage : null);
  }, [confirmed, initialLanguage, seriesId]);

  useEffect(() => {
    function handleApplied(event: Event) {
      const detail = (event as CustomEvent<{ language?: unknown }>).detail;
      const applied = parseSupportedLanguageTag(detail?.language);
      if (!applied) return;
      setLanguage(applied);
      setSavedLanguage(applied);
      setMessage("保存済み");
    }

    window.addEventListener("libread:source-language-applied", handleApplied);
    return () =>
      window.removeEventListener("libread:source-language-applied", handleApplied);
  }, []);

  useEffect(() => {
    if (seriesId) return;

    function rememberCreateSelection(event: Event) {
      if (!(event.target instanceof HTMLFormElement)) return;
      window.sessionStorage.setItem(
        PENDING_CREATE_SOURCE_LANGUAGE_KEY,
        JSON.stringify({
          language,
          startedAt: Date.now(),
          sourcePath: window.location.pathname,
        })
      );
    }

    document.addEventListener("submit", rememberCreateSelection, true);
    return () => document.removeEventListener("submit", rememberCreateSelection, true);
  }, [language, seriesId]);

  async function persistLanguage(nextLanguage: SupportedLanguageTag) {
    setLanguage(nextLanguage);
    setMessage("");
    if (!seriesId || saving) return;
    if (nextLanguage === savedLanguage) return;

    setSaving(true);
    try {
      const response = await fetch(
        `/api/series/${encodeURIComponent(seriesId)}/source-language`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ language: nextLanguage }),
        }
      );
      const payload = (await response.json()) as {
        ok?: boolean;
        language?: unknown;
        message?: string;
      };
      const saved = parseSupportedLanguageTag(payload.language);
      if (!response.ok || !payload.ok || !saved) {
        setLanguage(savedLanguage ?? nextLanguage);
        setMessage(payload.message || "原文言語を更新できませんでした。");
        return;
      }
      setLanguage(saved);
      setSavedLanguage(saved);
      setMessage("保存済み");
    } catch {
      setLanguage(savedLanguage ?? nextLanguage);
      setMessage("原文言語を更新できませんでした。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mx-auto mb-6 w-full max-w-5xl px-4 sm:px-6">
      <div className="rounded-[28px] border border-black/10 bg-white p-5 shadow-sm">
        <p className="text-xs tracking-[0.18em] text-neutral-500">
          SOURCE LANGUAGE
        </p>
        <h2 className="mt-2 text-lg font-semibold text-black">作品の原文言語</h2>
        <p className="mt-2 text-sm leading-7 text-neutral-600">
          UIの表示言語とは別です。この作品が最初に書かれた言語を指定します。
        </p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <select
            value={language}
            disabled={saving}
            onChange={(event) => {
              const next = parseSupportedLanguageTag(event.target.value);
              if (next) void persistLanguage(next);
            }}
            className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black outline-none transition focus:border-sky-300 disabled:opacity-60 sm:max-w-sm"
          >
            {SOURCE_LANGUAGE_OPTIONS.map((tag) => {
              const item = LANGUAGE_REGISTRY[tag];
              return (
                <option key={tag} value={tag}>
                  {item.nativeLabel} / {item.label}
                </option>
              );
            })}
          </select>
          {seriesId && !savedLanguage ? (
            <button
              type="button"
              disabled={saving}
              onClick={() => void persistLanguage(language)}
              className="rounded-full bg-black px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
            >
              この言語を原文言語として確定
            </button>
          ) : null}
        </div>
        {seriesId && !savedLanguage ? (
          <p className="mt-3 text-xs leading-6 text-amber-700">
            既存作品の推定値です。内容を確認して確定してください。
          </p>
        ) : null}
        {message ? (
          <p
            className={`mt-3 text-xs ${
              message === "保存済み" ? "text-emerald-700" : "text-red-700"
            }`}
          >
            {message}
          </p>
        ) : null}
      </div>
    </section>
  );
}
