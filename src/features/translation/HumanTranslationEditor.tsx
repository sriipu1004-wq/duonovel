"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useUiLocale } from "@/i18n/UiLocaleProvider";
import { localizePath } from "@/i18n/navigation";
import {
  getSupportedLanguage,
  PUBLIC_TRANSLATION_TARGET_LANGUAGES,
  type PublicTranslationTargetLanguage,
  type SupportedLanguageTag,
} from "@/lib/translation/languageRegistry";
import type { TranslationSegment } from "@/lib/translation/translationPayload";

type HumanStatus = "draft" | "published" | "withdrawn";
type LoadPayload = {
  ok?: boolean;
  error?: string;
  translationId?: string;
  status?: HumanStatus;
  sourceHash?: string;
  sourceLanguage?: SupportedLanguageTag;
  targetLanguage?: PublicTranslationTargetLanguage;
  segments?: TranslationSegment[];
  humanPermissionOpen?: boolean;
  stale?: boolean;
  publishedAt?: string | null;
};

type Props = {
  seriesId: string;
  episodeId: string;
  episodeNumber: number;
  seriesTitle: string;
  episodeTitle: string;
  sourceLanguage: SupportedLanguageTag;
  initialTargetLanguage: PublicTranslationTargetLanguage;
};

const COPY = {
  ja: {
    eyebrow: "HUMAN TRANSLATION",
    title: "人による翻訳",
    translatorOnly: "AIは使用せず、あなたが入力した翻訳だけを保存・公開します。",
    loading: "翻訳エディタを準備中…",
    unavailable: "この作品では現在、人による翻訳を新規作成できません。",
    sourceUpdated: "原文が更新されています。完全一致した原文segmentだけ旧訳を引き継ぎました。変更部分を確認してください。",
    permissionClosed: "作者が人による翻訳の新規作成・公開を停止しています。既存下書きの保存はできますが、新しく公開できません。",
    target: "翻訳先",
    source: "原文",
    translation: "翻訳",
    placeholder: "このsegmentの翻訳を入力",
    save: "下書き保存",
    saving: "保存中…",
    saved: "下書きを保存しました。",
    publish: "公開",
    publishing: "公開中…",
    withdraw: "公開を取り下げ",
    withdrawing: "取り下げ中…",
    withdrawn: "公開を取り下げました。",
    published: "公開しました。",
    incomplete: "公開するにはすべてのsegmentに翻訳を入力してください。",
    identity: "公開表示名を設定してから公開してください。",
    rights: "自分が作成した翻訳であり、公開する権利を持っています。",
    rightsRequired: "公開前に権利確認へチェックしてください。",
    back: "Readerへ戻る",
    unsaved: "未保存の入力があります。移動しますか？",
    error: "処理に失敗しました。入力内容を保持したまま、もう一度お試しください。",
    statusDraft: "下書き",
    statusPublished: "公開中",
    statusWithdrawn: "取り下げ済み",
  },
  en: {
    eyebrow: "HUMAN TRANSLATION",
    title: "Human translation",
    translatorOnly: "Only the translation you enter is saved or published. This workflow does not use AI generation.",
    loading: "Preparing the translation editor…",
    unavailable: "New Human translations are not currently allowed for this work.",
    sourceUpdated: "The original text has changed. Only exact source-segment matches were carried over. Review the changed sections.",
    permissionClosed: "The author has stopped new Human translation creation and publishing. Existing drafts can still be saved, but cannot be newly published.",
    target: "Translate to",
    source: "Original",
    translation: "Translation",
    placeholder: "Enter your translation for this segment",
    save: "Save draft",
    saving: "Saving…",
    saved: "Draft saved.",
    publish: "Publish",
    publishing: "Publishing…",
    withdraw: "Withdraw publication",
    withdrawing: "Withdrawing…",
    withdrawn: "Publication withdrawn.",
    published: "Published.",
    incomplete: "Every source segment needs a translation before publishing.",
    identity: "Set a public display name before publishing.",
    rights: "I created this translation and have the right to publish it.",
    rightsRequired: "Confirm the rights statement before publishing.",
    back: "Back to Reader",
    unsaved: "You have unsaved changes. Leave this page?",
    error: "The action failed. Your input is still here; please try again.",
    statusDraft: "Draft",
    statusPublished: "Published",
    statusWithdrawn: "Withdrawn",
  },
  ko: {
    eyebrow: "HUMAN TRANSLATION",
    title: "사람 번역",
    translatorOnly: "AI 생성 없이 직접 입력한 번역만 저장·공개합니다.",
    loading: "번역 편집기 준비 중…",
    unavailable: "현재 이 작품은 새로운 사람 번역 작성을 허용하지 않습니다.",
    sourceUpdated: "원문이 변경되었습니다. 원문 segment가 완전히 일치한 기존 번역만 이어받았습니다. 변경된 부분을 확인하세요.",
    permissionClosed: "작가가 새로운 사람 번역의 작성·공개를 중지했습니다. 기존 초안 저장은 가능하지만 새로 공개할 수는 없습니다.",
    target: "번역 언어",
    source: "원문",
    translation: "번역",
    placeholder: "이 segment의 번역 입력",
    save: "초안 저장",
    saving: "저장 중…",
    saved: "초안을 저장했습니다.",
    publish: "공개",
    publishing: "공개 중…",
    withdraw: "공개 철회",
    withdrawing: "철회 중…",
    withdrawn: "공개를 철회했습니다.",
    published: "공개했습니다.",
    incomplete: "공개하려면 모든 segment에 번역을 입력해야 합니다.",
    identity: "공개 표시 이름을 설정한 뒤 공개하세요.",
    rights: "직접 만든 번역이며 공개할 권리가 있습니다.",
    rightsRequired: "공개 전에 권리 확인에 체크하세요.",
    back: "Reader로 돌아가기",
    unsaved: "저장하지 않은 입력이 있습니다. 이동할까요?",
    error: "처리에 실패했습니다. 입력 내용은 유지되어 있으니 다시 시도하세요.",
    statusDraft: "초안",
    statusPublished: "공개 중",
    statusWithdrawn: "철회됨",
  },
} as const;

export default function HumanTranslationEditor(props: Props) {
  const locale = useUiLocale();
  const copy = COPY[locale];
  const [targetLanguage, setTargetLanguage] = useState(props.initialTargetLanguage);
  const [translationId, setTranslationId] = useState<string | null>(null);
  const [segments, setSegments] = useState<TranslationSegment[]>([]);
  const [status, setStatus] = useState<HumanStatus>("draft");
  const [stale, setStale] = useState(false);
  const [humanPermissionOpen, setHumanPermissionOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"save" | "publish" | "withdraw" | null>(null);
  const [message, setMessage] = useState("");
  const [messageIsError, setMessageIsError] = useState(false);
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [dirty, setDirty] = useState(false);
  const translationsRef = useRef<Record<string, string>>({});

  const readerHref = useMemo(
    () =>
      localizePath(
        `/read/${props.seriesId}/${props.episodeNumber}?readingMode=bilingual&bilingual=1&sourceLanguage=${encodeURIComponent(props.sourceLanguage)}&targetLanguage=${encodeURIComponent(targetLanguage)}`,
        locale
      ),
    [locale, props.episodeNumber, props.seriesId, props.sourceLanguage, targetLanguage]
  );

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setMessage("");
    setTranslationId(null);
    void (async () => {
      try {
        const response = await fetch("/api/human-translations/draft", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            episodeId: props.episodeId,
            targetLanguage,
          }),
        });
        const payload = (await response.json().catch(() => null)) as LoadPayload | null;
        if (cancelled) return;
        if (!response.ok || !payload?.ok || !payload.translationId || !Array.isArray(payload.segments)) {
          setMessage(payload?.error === "human_translation_permission_closed" ? copy.unavailable : copy.error);
          setMessageIsError(true);
          setLoading(false);
          return;
        }
        const nextTranslations: Record<string, string> = {};
        for (const segment of payload.segments) {
          nextTranslations[segment.id] = segment.translatedText ?? "";
        }
        translationsRef.current = nextTranslations;
        setTranslationId(payload.translationId);
        setSegments(payload.segments);
        setStatus(payload.status ?? "draft");
        setStale(payload.stale === true);
        setHumanPermissionOpen(payload.humanPermissionOpen !== false);
        setDirty(false);
        setLoading(false);
      } catch {
        if (!cancelled) {
          setMessage(copy.error);
          setMessageIsError(true);
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [copy.error, copy.unavailable, props.episodeId, targetLanguage]);

  function translationsSnapshot() {
    return { ...translationsRef.current };
  }

  async function saveDraft(showSuccess = true): Promise<boolean> {
    if (!translationId || busy) return false;
    setBusy("save");
    setMessage("");
    try {
      const response = await fetch(`/api/human-translations/${encodeURIComponent(translationId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ translations: translationsSnapshot() }),
      });
      const payload = (await response.json().catch(() => null)) as { ok?: boolean } | null;
      if (!response.ok || !payload?.ok) {
        setMessage(copy.error);
        setMessageIsError(true);
        return false;
      }
      setDirty(false);
      setStale(false);
      if (showSuccess) {
        setMessage(copy.saved);
        setMessageIsError(false);
      }
      return true;
    } catch {
      setMessage(copy.error);
      setMessageIsError(true);
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function publish() {
    if (!translationId || busy) return;
    if (!rightsConfirmed) {
      setMessage(copy.rightsRequired);
      setMessageIsError(true);
      return;
    }
    const translations = translationsSnapshot();
    if (segments.some((segment) => !(translations[segment.id] ?? "").trim())) {
      setMessage(copy.incomplete);
      setMessageIsError(true);
      return;
    }

    const saved = await saveDraft(false);
    if (!saved) return;

    setBusy("publish");
    setMessage("");
    try {
      const response = await fetch(
        `/api/human-translations/${encodeURIComponent(translationId)}/publish`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rightsConfirmed: true }),
        }
      );
      const payload = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!response.ok || !payload?.ok) {
        setMessage(
          payload?.error === "public_display_name_required"
            ? copy.identity
            : payload?.error === "incomplete_translation"
              ? copy.incomplete
              : payload?.error === "human_translation_permission_closed"
                ? copy.permissionClosed
                : copy.error
        );
        setMessageIsError(true);
        return;
      }
      setStatus("published");
      setMessage(copy.published);
      setMessageIsError(false);
      setDirty(false);
    } catch {
      setMessage(copy.error);
      setMessageIsError(true);
    } finally {
      setBusy(null);
    }
  }

  async function withdraw() {
    if (!translationId || busy) return;
    setBusy("withdraw");
    setMessage("");
    try {
      const response = await fetch(
        `/api/human-translations/${encodeURIComponent(translationId)}/withdraw`,
        { method: "POST" }
      );
      const payload = (await response.json().catch(() => null)) as { ok?: boolean } | null;
      if (!response.ok || !payload?.ok) {
        setMessage(copy.error);
        setMessageIsError(true);
        return;
      }
      setStatus("withdrawn");
      setMessage(copy.withdrawn);
      setMessageIsError(false);
    } catch {
      setMessage(copy.error);
      setMessageIsError(true);
    } finally {
      setBusy(null);
    }
  }

  function changeTarget(next: PublicTranslationTargetLanguage) {
    if (next === targetLanguage || next === props.sourceLanguage) return;
    if (dirty && !window.confirm(copy.unsaved)) return;
    const url = new URL(window.location.href);
    url.searchParams.set("targetLanguage", next);
    window.location.href = `${url.pathname}${url.search}`;
  }

  const statusLabel =
    status === "published"
      ? copy.statusPublished
      : status === "withdrawn"
        ? copy.statusWithdrawn
        : copy.statusDraft;

  return (
    <main className="min-h-screen bg-white text-black">
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <header className="rounded-[28px] border border-black/10 bg-white p-5 shadow-sm sm:p-7">
          <p className="text-xs tracking-[0.18em] text-neutral-500">{copy.eyebrow}</p>
          <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold sm:text-3xl">{copy.title}</h1>
              <p className="mt-2 text-sm text-neutral-600">{props.seriesTitle}</p>
              <p className="text-sm text-neutral-500">{props.episodeTitle}</p>
            </div>
            <span className="rounded-full border border-black/10 bg-neutral-50 px-3 py-1.5 text-xs text-neutral-700">
              {statusLabel}
            </span>
          </div>
          <p className="mt-4 text-sm leading-7 text-neutral-600">{copy.translatorOnly}</p>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 rounded-full border border-black/10 px-3 py-2 text-sm">
              <span>{copy.target}</span>
              <select
                value={targetLanguage}
                onChange={(event) => changeTarget(event.target.value as PublicTranslationTargetLanguage)}
                className="bg-transparent font-medium outline-none"
              >
                {PUBLIC_TRANSLATION_TARGET_LANGUAGES.map((language) => (
                  <option key={language} value={language} disabled={language === props.sourceLanguage}>
                    {getSupportedLanguage(language).nativeLabel}
                  </option>
                ))}
              </select>
            </label>
            <Link
              href={readerHref}
              onClick={(event) => {
                if (dirty && !window.confirm(copy.unsaved)) event.preventDefault();
              }}
              className="rounded-full border border-black/10 px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
            >
              {copy.back}
            </Link>
          </div>

          {stale ? (
            <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900">
              {copy.sourceUpdated}
            </p>
          ) : null}
          {!humanPermissionOpen ? (
            <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900">
              {copy.permissionClosed}
            </p>
          ) : null}
          {message ? (
            <p className={`mt-4 text-sm ${messageIsError ? "text-red-700" : "text-emerald-700"}`}>
              {message}
            </p>
          ) : null}
        </header>

        {loading ? (
          <div className="mt-6 rounded-[28px] border border-black/10 bg-neutral-50 p-8 text-center text-sm text-neutral-600">
            {copy.loading}
          </div>
        ) : translationId ? (
          <>
            <section className="mt-6 grid gap-4">
              {segments.map((segment, index) => (
                <article key={segment.id} className="rounded-[24px] border border-black/10 bg-white p-4 sm:p-5">
                  <p className="text-xs text-neutral-400">#{index + 1}</p>
                  <div className="mt-3 grid gap-4 md:grid-cols-2">
                    <div>
                      <p className="text-xs font-medium text-neutral-500">{copy.source}</p>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-neutral-900">
                        {segment.sourceText}
                      </p>
                    </div>
                    <label className="block">
                      <span className="text-xs font-medium text-neutral-500">{copy.translation}</span>
                      <textarea
                        defaultValue={segment.translatedText}
                        rows={Math.max(3, Math.min(10, Math.ceil(segment.sourceText.length / 36)))}
                        placeholder={copy.placeholder}
                        onInput={(event) => {
                          translationsRef.current[segment.id] = event.currentTarget.value;
                          setDirty(true);
                          setMessage("");
                        }}
                        className="mt-2 w-full resize-y rounded-2xl border border-black/10 bg-white px-3 py-3 text-sm leading-7 outline-none focus:border-sky-300"
                      />
                    </label>
                  </div>
                </article>
              ))}
            </section>

            <section className="sticky bottom-3 z-20 mt-6 rounded-[24px] border border-black/10 bg-white/95 p-4 shadow-lg backdrop-blur">
              <label className="flex items-start gap-3 text-sm leading-6 text-neutral-700">
                <input
                  type="checkbox"
                  checked={rightsConfirmed}
                  onChange={(event) => setRightsConfirmed(event.target.checked)}
                  className="mt-1"
                />
                <span>{copy.rights}</span>
              </label>
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={() => void saveDraft()}
                  className="rounded-full border border-black/10 bg-white px-5 py-2.5 text-sm font-medium disabled:opacity-50"
                >
                  {busy === "save" ? copy.saving : copy.save}
                </button>
                <button
                  type="button"
                  disabled={Boolean(busy) || !humanPermissionOpen}
                  onClick={() => void publish()}
                  className="rounded-full bg-black px-5 py-2.5 text-sm font-medium text-white disabled:opacity-40"
                >
                  {busy === "publish" ? copy.publishing : copy.publish}
                </button>
                {status === "published" ? (
                  <button
                    type="button"
                    disabled={Boolean(busy)}
                    onClick={() => void withdraw()}
                    className="rounded-full border border-red-200 bg-white px-5 py-2.5 text-sm font-medium text-red-700 disabled:opacity-50"
                  >
                    {busy === "withdraw" ? copy.withdrawing : copy.withdraw}
                  </button>
                ) : null}
              </div>
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}
