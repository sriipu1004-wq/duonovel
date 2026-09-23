"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useUiLocale } from "@/i18n/UiLocaleProvider";
import { LANGUAGE_REGISTRY, type SupportedLanguageTag } from "@/lib/translation/languageRegistry";

type SourceSegment = { id: string; sourceText: string };
type DraftSegment = { id: string; translatedText: string };

type Props = {
  episodeId: string;
  sourceLanguage: SupportedLanguageTag;
  targetLanguage: SupportedLanguageTag;
  readHref: string;
  workHref: string;
  seriesTitle: string;
  episodeTitle: string;
};

const copy = {
  ja: {
    eyebrow: "HUMAN TRANSLATION",
    title: "自分で翻訳を作る",
    privateNote: "ここで作る翻訳は自分のアカウント専用です。他の読者には公開されず、AI翻訳の共有キャッシュも上書きしません。",
    source: "原文",
    translation: "自分の翻訳",
    placeholder: "この文の翻訳を入力",
    loading: "翻訳エディタを準備中…",
    loadError: "翻訳エディタを読み込めませんでした。",
    save: "保存してReaderで使う",
    saving: "保存中…",
    saved: "保存しました。Readerではこの人力翻訳を優先して表示します。",
    saveError: "翻訳を保存できませんでした。",
    complete: "すべての文を翻訳してください。",
    reader: "Readerで確認",
    work: "作品ページへ",
  },
  en: {
    eyebrow: "HUMAN TRANSLATION",
    title: "Create your own translation",
    privateNote: "This translation is private to your account. It is not published to other readers and does not overwrite the shared AI translation cache.",
    source: "Source",
    translation: "Your translation",
    placeholder: "Translate this segment",
    loading: "Preparing the translation editor…",
    loadError: "Could not load the translation editor.",
    save: "Save and use in Reader",
    saving: "Saving…",
    saved: "Saved. Reader will prefer your human translation for this language.",
    saveError: "Could not save your translation.",
    complete: "Translate every segment before saving.",
    reader: "Open in Reader",
    work: "Work page",
  },
  ko: {
    eyebrow: "HUMAN TRANSLATION",
    title: "직접 번역 만들기",
    privateNote: "여기서 만든 번역은 본인 계정 전용입니다. 다른 독자에게 공개되지 않으며 공유 AI 번역 캐시를 덮어쓰지 않습니다.",
    source: "원문",
    translation: "내 번역",
    placeholder: "이 문장의 번역을 입력",
    loading: "번역 편집기를 준비하는 중…",
    loadError: "번역 편집기를 불러오지 못했습니다.",
    save: "저장하고 Reader에서 사용",
    saving: "저장 중…",
    saved: "저장했습니다. Reader에서는 이 사람 번역을 우선 표시합니다.",
    saveError: "번역을 저장하지 못했습니다.",
    complete: "저장하기 전에 모든 문장을 번역하세요.",
    reader: "Reader에서 확인",
    work: "작품 페이지",
  },
} as const;

export default function ManualEpisodeTranslationEditor({
  episodeId,
  sourceLanguage,
  targetLanguage,
  readHref,
  workHref,
  seriesTitle,
  episodeTitle,
}: Props) {
  const locale = useUiLocale();
  const t = copy[locale];
  const [sourceSegments, setSourceSegments] = useState<SourceSegment[]>([]);
  const [segments, setSegments] = useState<DraftSegment[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [saved, setSaved] = useState(false);

  const endpoint = useMemo(
    () =>
      `/api/human-translations/${encodeURIComponent(episodeId)}?targetLanguage=${encodeURIComponent(targetLanguage)}`,
    [episodeId, targetLanguage]
  );

  useEffect(() => {
    let active = true;
    setLoading(true);
    setMessage("");

    void fetch(endpoint, { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json()) as {
          ok?: boolean;
          sourceSegments?: SourceSegment[];
          translatedSegments?: DraftSegment[];
        };
        if (!active) return;
        if (!response.ok || !payload.ok || !Array.isArray(payload.sourceSegments)) {
          setMessage(t.loadError);
          return;
        }

        const existing = new Map(
          (payload.translatedSegments ?? []).map((segment) => [
            segment.id,
            segment.translatedText,
          ])
        );
        setSourceSegments(payload.sourceSegments);
        setSegments(
          payload.sourceSegments.map((segment) => ({
            id: segment.id,
            translatedText: existing.get(segment.id) ?? "",
          }))
        );
      })
      .catch(() => {
        if (active) setMessage(t.loadError);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [endpoint, t.loadError]);

  async function saveTranslation() {
    if (saving) return;
    if (
      segments.length !== sourceSegments.length ||
      segments.some((segment) => !segment.translatedText.trim())
    ) {
      setMessage(t.complete);
      setSaved(false);
      return;
    }

    setSaving(true);
    setMessage("");
    setSaved(false);

    try {
      const response = await fetch(endpoint, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          segments: segments.map((segment) => ({
            id: segment.id,
            translatedText: segment.translatedText.trim(),
          })),
        }),
      });
      const payload = (await response.json()) as { ok?: boolean };
      if (!response.ok || !payload.ok) {
        setMessage(t.saveError);
        return;
      }
      setSaved(true);
      setMessage(t.saved);
    } catch {
      setMessage(t.saveError);
    } finally {
      setSaving(false);
    }
  }

  const sourceLabel = LANGUAGE_REGISTRY[sourceLanguage].nativeLabel;
  const targetLabel = LANGUAGE_REGISTRY[targetLanguage].nativeLabel;

  return (
    <main className="min-h-screen bg-[#f5f5f5] text-black">
      <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
        <p className="text-xs tracking-[0.2em] text-neutral-500">{t.eyebrow}</p>
        <h1 className="mt-2 text-3xl font-bold">{t.title}</h1>
        <p className="mt-2 text-sm text-neutral-500">
          {seriesTitle} / {episodeTitle}
        </p>
        <p className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm leading-7 text-sky-950">
          {t.privateNote}
        </p>

        <div className="mt-5 flex flex-wrap gap-2 text-xs text-neutral-600">
          <span className="rounded-full border border-black/10 bg-white px-3 py-1.5">
            {t.source}: {sourceLabel}
          </span>
          <span className="rounded-full border border-black/10 bg-white px-3 py-1.5">
            {t.translation}: {targetLabel}
          </span>
        </div>

        {loading ? (
          <p className="mt-8 text-sm text-neutral-600">{t.loading}</p>
        ) : (
          <div className="mt-6 grid gap-4">
            {sourceSegments.map((source, index) => (
              <section
                key={source.id}
                className="grid gap-3 rounded-[24px] border border-black/10 bg-white p-4 sm:grid-cols-2"
              >
                <div>
                  <p className="text-[11px] tracking-[0.16em] text-neutral-500">
                    {t.source}
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-neutral-900">
                    {source.sourceText}
                  </p>
                </div>
                <label className="block">
                  <span className="text-[11px] tracking-[0.16em] text-neutral-500">
                    {t.translation}
                  </span>
                  <textarea
                    value={segments[index]?.translatedText ?? ""}
                    onChange={(event) => {
                      const value = event.target.value;
                      setSaved(false);
                      setSegments((current) =>
                        current.map((segment, currentIndex) =>
                          currentIndex === index
                            ? { ...segment, translatedText: value }
                            : segment
                        )
                      );
                    }}
                    placeholder={t.placeholder}
                    className="mt-2 min-h-28 w-full resize-y rounded-2xl border border-black/10 bg-neutral-50 px-3 py-3 text-sm leading-7 outline-none focus:border-sky-300"
                  />
                </label>
              </section>
            ))}
          </div>
        )}

        {message ? (
          <p
            role={saved ? undefined : "alert"}
            className={[
              "mt-5 text-sm",
              saved ? "text-emerald-700" : "text-rose-700",
            ].join(" ")}
          >
            {message}
          </p>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={loading || saving || sourceSegments.length === 0}
            onClick={() => void saveTranslation()}
            className="rounded-full bg-black px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? t.saving : t.save}
          </button>
          <Link
            href={readHref}
            className="rounded-full border border-black/10 bg-white px-5 py-3 text-sm text-neutral-700"
          >
            {t.reader}
          </Link>
          <Link
            href={workHref}
            className="rounded-full border border-black/10 bg-white px-5 py-3 text-sm text-neutral-700"
          >
            {t.work}
          </Link>
        </div>
      </div>
    </main>
  );
}
