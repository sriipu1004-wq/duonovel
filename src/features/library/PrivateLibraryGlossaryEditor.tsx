"use client";

import { useMemo, useState } from "react";
import {
  LANGUAGE_REGISTRY,
  getSupportedLanguage,
  type SupportedLanguageTag,
} from "@/lib/translation/languageRegistry";

export type PrivateLibraryGlossaryTerm = {
  id: string;
  source_language: SupportedLanguageTag;
  target_language: SupportedLanguageTag;
  source_term: string;
  target_term: string;
  is_locked: boolean;
  updated_at: string;
};

type Props = {
  workId: string;
  sourceLanguage: SupportedLanguageTag;
  initialTerms: PrivateLibraryGlossaryTerm[];
};

export default function PrivateLibraryGlossaryEditor({
  workId,
  sourceLanguage,
  initialTerms,
}: Props) {
  const targetLanguages = useMemo(
    () =>
      (Object.keys(LANGUAGE_REGISTRY) as SupportedLanguageTag[]).filter(
        (language) => language !== sourceLanguage
      ),
    [sourceLanguage]
  );
  const [targetLanguage, setTargetLanguage] = useState<SupportedLanguageTag>(
    targetLanguages[0] ?? "ja"
  );
  const [sourceTerm, setSourceTerm] = useState("");
  const [targetTerm, setTargetTerm] = useState("");
  const [terms, setTerms] = useState(initialTerms);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const visibleTerms = terms
    .filter((term) => term.target_language === targetLanguage)
    .sort((left, right) =>
      Number(right.is_locked) - Number(left.is_locked) ||
      left.source_term.localeCompare(right.source_term)
    );

  async function saveTerm() {
    if (!sourceTerm.trim() || !targetTerm.trim() || saving) return;
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch(
        `/api/library/works/${encodeURIComponent(workId)}/glossary`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sourceTerm: sourceTerm.trim(),
            targetTerm: targetTerm.trim(),
            targetLanguage,
          }),
        }
      );
      const payload = (await response.json()) as {
        ok?: boolean;
        term?: PrivateLibraryGlossaryTerm;
        message?: string;
      };
      if (!response.ok || !payload.ok || !payload.term) {
        setMessage(payload.message || "用語を保存できませんでした。");
        return;
      }
      setTerms((current) => [
        ...current.filter((term) => term.id !== payload.term?.id),
        payload.term as PrivateLibraryGlossaryTerm,
      ]);
      setSourceTerm("");
      setTargetTerm("");
      setMessage("用語を固定しました。次回以降の対訳で優先します。");
    } catch {
      setMessage("通信が中断されました。");
    } finally {
      setSaving(false);
    }
  }

  async function deleteTerm(term: PrivateLibraryGlossaryTerm) {
    const response = await fetch(
      `/api/library/works/${encodeURIComponent(workId)}/glossary/${encodeURIComponent(term.id)}`,
      { method: "DELETE" }
    );
    if (response.ok) {
      setTerms((current) => current.filter((candidate) => candidate.id !== term.id));
    } else {
      setMessage("用語を削除できませんでした。");
    }
  }

  return (
    <div className="grid gap-6">
      <div className="grid gap-4 rounded-[24px] border border-black/10 bg-neutral-50 p-5 sm:grid-cols-2">
        <label className="grid gap-2 sm:col-span-2">
          <span className="text-sm text-neutral-700">対訳言語</span>
          <select
            value={targetLanguage}
            onChange={(event) =>
              setTargetLanguage(event.target.value as SupportedLanguageTag)
            }
            className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm"
          >
            {targetLanguages.map((language) => (
              <option key={language} value={language}>
                {getSupportedLanguage(language).nativeLabel}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2">
          <span className="text-sm text-neutral-700">原文の用語</span>
          <input
            value={sourceTerm}
            maxLength={120}
            onChange={(event) => setSourceTerm(event.target.value)}
            placeholder="人物名・地名・技能名など"
            className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm"
          />
        </label>
        <label className="grid gap-2">
          <span className="text-sm text-neutral-700">固定する訳</span>
          <input
            value={targetTerm}
            maxLength={200}
            onChange={(event) => setTargetTerm(event.target.value)}
            placeholder="以後使う表記"
            className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm"
          />
        </label>
        <div className="flex justify-end sm:col-span-2">
          <button
            type="button"
            disabled={!sourceTerm.trim() || !targetTerm.trim() || saving}
            onClick={saveTerm}
            className="rounded-full bg-black px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            {saving ? "保存中…" : "この訳を固定"}
          </button>
        </div>
        {message ? (
          <p className="text-xs leading-6 text-neutral-600 sm:col-span-2">
            {message}
          </p>
        ) : null}
      </div>

      <div className="grid gap-2">
        {visibleTerms.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-black/15 px-4 py-8 text-center text-sm text-neutral-500">
            この言語の用語はまだありません。対訳時に候補が自動追加されます。
          </p>
        ) : (
          visibleTerms.map((term) => (
            <div
              key={term.id}
              className="flex items-center justify-between gap-4 rounded-2xl border border-black/10 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-black">
                  {term.source_term} → {term.target_term}
                </p>
                <p className="mt-1 text-[11px] text-neutral-500">
                  {term.is_locked ? "ユーザー固定" : "対訳から自動作成"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void deleteTerm(term)}
                className="shrink-0 rounded-full border border-black/10 px-3 py-1.5 text-xs text-neutral-600 hover:bg-neutral-50"
              >
                削除
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
