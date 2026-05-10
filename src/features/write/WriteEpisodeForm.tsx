"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { decideNemoRegenerationByBody } from "@/lib/recording/nemoRegenerationDiff";
import {
  getEpisodeBody,
  getEpisodeNumber,
  getEpisodePostingStatus,
  getEpisodeScheduledForValue,
  getEpisodePostedAtValue,
  getEpisodeLastEditedAtValue,
  isEpisodePubliclyVisible,
  pickText,
  type EpisodePostingStatus,
  type EpisodeRow,
} from "@/features/write/writeShared";
import {
  hideGlobalLoadingFeedback,
  showGlobalLoadingFeedback,
} from "@/lib/client/loadingFeedback";
import {
  normalizeAozoraTextForLayout,
  renderTextWithAozoraRuby,
} from "@/features/effects/EffectPreviewRenderer";

type Mode = "create" | "edit";
type SaveState = "idle" | "saving" | "success" | "error";
type BodyViewMode = "edit" | "preview";

type WriteEpisodeFormProps = {
  mode: Mode;
  seriesId: string;
  episode?: EpisodeRow | null;
  initialEpisodeNumber: number;
  initialPostingStatus?: EpisodePostingStatus;
  initialScheduledFor?: string | null;
  previousEpisode?: EpisodeRow | null;
  effectSettingsPanel?: ReactNode;
};

type EpisodePayload = {
  series_id: string;
  episode_number: number;
  title: string;
  body: string;
  is_published: boolean;
  posting_status: EpisodePostingStatus;
  scheduled_for: string | null;
  posted_at: string | null;
  last_edited_at: string | null;
};

function formatDateTimeLocal(value?: string | null): string {
  if (!value) {
    return "";
  }

  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
    return value;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  const offsetMs = parsed.getTimezoneOffset() * 60 * 1000;
  return new Date(parsed.getTime() - offsetMs).toISOString().slice(0, 16);
}

function toIsoStringFromLocalInput(value: string): string | null {
  if (!value.trim()) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

function getPostingStatusLabel(status: EpisodePostingStatus): string {
  if (status === "posted") return "投稿";
  if (status === "scheduled") return "予約投稿";
  return "下書き保存";
}

function getPostingStatusDescription(status: EpisodePostingStatus): string {
  if (status === "posted") {
    return "作品が公開状態なら、そのまま読者向け公開対象に入る。";
  }

  if (status === "scheduled") {
    return "予約時刻までは公開面に出さず、到達後に公開対象へ入れる。";
  }

  return "作者ワークスペースだけに残し、続きを後で書ける状態にする。";
}

function createEpisodePayload(args: {
  seriesId: string;
  episodeNumber: number;
  title: string;
  body: string;
  postingStatus: EpisodePostingStatus;
  scheduledFor: string;
  mode: Mode;
  existingEpisode?: EpisodeRow | null;
}): EpisodePayload {
  const {
    seriesId,
    episodeNumber,
    title,
    body,
    postingStatus,
    scheduledFor,
    mode,
    existingEpisode,
  } = args;

  const nowIso = new Date().toISOString();
  const scheduledForIso =
    postingStatus === "scheduled"
      ? toIsoStringFromLocalInput(scheduledFor)
      : null;

  const existingPostedAt = existingEpisode
    ? getEpisodePostedAtValue(existingEpisode)
    : "";

  const existingLastEditedAt = existingEpisode
    ? getEpisodeLastEditedAtValue(existingEpisode)
    : "";

  const hadPublicVisibilityBefore =
    mode === "edit" && !!existingEpisode
      ? isEpisodePubliclyVisible(existingEpisode)
      : false;

  let postedAt: string | null = existingPostedAt || null;

  if (!postedAt && postingStatus === "posted") {
    postedAt = nowIso;
  }

  const lastEditedAt =
    mode === "edit" && hadPublicVisibilityBefore
      ? nowIso
      : existingLastEditedAt || null;

  return {
    series_id: seriesId,
    episode_number: episodeNumber,
    title,
    body,
    is_published: postingStatus === "posted",
    posting_status: postingStatus,
    scheduled_for: scheduledForIso,
    posted_at: postedAt,
    last_edited_at: lastEditedAt,
  };
}

function getNextButtonLabel(status: EpisodePostingStatus): string {
  return status === "scheduled"
    ? "予約保存して次の話へ"
    : "下書き保存して次の話へ";
}

function buildReaderPreviewParagraphs(value: string): string[] {
  const normalized = normalizeAozoraTextForLayout(value);

  if (!normalized.trim()) {
    return [];
  }

  return normalized
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);
}

export default function WriteEpisodeForm({
  mode,
  seriesId,
  episode,
  initialEpisodeNumber,
  initialPostingStatus = "draft",
  initialScheduledFor = null,
  previousEpisode = null,
  effectSettingsPanel = null,
}: WriteEpisodeFormProps) {
  const router = useRouter();

  const [episodeNumber, setEpisodeNumber] = useState(String(initialEpisodeNumber));
  const [title, setTitle] = useState(pickText(episode?.title));
  const [body, setBody] = useState(episode ? getEpisodeBody(episode) : "");
  const [postingStatus, setPostingStatus] = useState<EpisodePostingStatus>(
    mode === "edit" && episode
      ? getEpisodePostingStatus(episode)
      : initialPostingStatus
  );
  const [scheduledFor, setScheduledFor] = useState(
    formatDateTimeLocal(
      mode === "edit" && episode
        ? getEpisodeScheduledForValue(episode)
        : initialScheduledFor
    )
  );
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [showEffectSettingsPanel, setShowEffectSettingsPanel] = useState(false);
  const [bodyViewMode, setBodyViewMode] = useState<BodyViewMode>("edit");

  const parsedEpisodeNumber = Number(episodeNumber);
  const safeEpisodeNumber =
    Number.isFinite(parsedEpisodeNumber) && parsedEpisodeNumber > 0
      ? parsedEpisodeNumber
      : null;

  const previewEpisode: EpisodeRow = {
    id: episode?.id ?? "preview",
    episode_number: safeEpisodeNumber,
    posting_status: postingStatus,
    scheduled_for: toIsoStringFromLocalInput(scheduledFor),
    is_published: postingStatus === "posted",
  };

  const readHref =
    safeEpisodeNumber && isEpisodePubliclyVisible(previewEpisode)
      ? `/read/${seriesId}/${safeEpisodeNumber}`
      : null;

  const characterCount = body.length;
  const lineCount = body.length === 0 ? 0 : body.split(/\r?\n/).length;
  const readerPreviewParagraphs = buildReaderPreviewParagraphs(body);
  const currentEpisodeLabel =
    mode === "edit" && episode
      ? `第${getEpisodeNumber(episode)}話`
      : safeEpisodeNumber
        ? `第${safeEpisodeNumber}話`
        : "-";

  const isSaving = saveState === "saving";

  const previousEpisodeNumber = previousEpisode
  ? getEpisodeNumber(previousEpisode)
  : null;

const previousPostingStatus = previousEpisode
  ? getEpisodePostingStatus(previousEpisode)
  : null;

const previousScheduledForValue = previousEpisode
  ? getEpisodeScheduledForValue(previousEpisode)
  : "";

const previousScheduledForLocalValue = formatDateTimeLocal(
  previousScheduledForValue
);

const previousEpisodeBlocksPublishing = previousPostingStatus === "draft";

const scheduledBeforePreviousIsBlocked =
  postingStatus === "scheduled" &&
  previousPostingStatus === "scheduled" &&
  !!previousScheduledForValue &&
  !!toIsoStringFromLocalInput(scheduledFor) &&
  new Date(toIsoStringFromLocalInput(scheduledFor) as string).getTime() <
    new Date(previousScheduledForValue).getTime();

  function resetNotice() {
    setSaveState("idle");
    setErrorMessage("");
    setSuccessMessage("");
  }

  async function handleSubmit(
    destination: "workspace" | "next" = "workspace"
  ) {
    const trimmedTitle = title.trim();
    const trimmedBody = body.trim();

    if (!safeEpisodeNumber) {
      setSaveState("error");
      setErrorMessage("話数は1以上の数字で入れる。");
      setSuccessMessage("");
      return;
    }

    if (!trimmedTitle) {
      setSaveState("error");
      setErrorMessage("話タイトルは必須。");
      setSuccessMessage("");
      return;
    }

    if (postingStatus === "scheduled" && !toIsoStringFromLocalInput(scheduledFor)) {
      setSaveState("error");
      setErrorMessage("予約投稿を選ぶ時は日時を入れる。");
      setSuccessMessage("");
      return;
    }

if (previousEpisodeBlocksPublishing && postingStatus !== "draft") {
  setSaveState("error");
  setErrorMessage(
    previousEpisodeNumber
      ? `前の第${previousEpisodeNumber}話が下書きのため、この話はまだ投稿または予約投稿にできない。`
      : "前話が下書きのため、この話はまだ投稿または予約投稿にできない。"
  );
  setSuccessMessage("");
  return;
}

if (scheduledBeforePreviousIsBlocked) {
  setSaveState("error");
  setErrorMessage(
    previousEpisodeNumber
      ? `前の第${previousEpisodeNumber}話の予約時刻より前には設定できない。`
      : "前話の予約時刻より前には設定できない。"
  );
  setSuccessMessage("");
  return;
}    

    setSaveState("saving");
    setErrorMessage("");
    setSuccessMessage("");

    showGlobalLoadingFeedback(
      destination === "next"
        ? "作成中..."
        : mode === "create"
          ? "作成中..."
          : "保存中...",
      8000
    );

    const previousBody = episode ? getEpisodeBody(episode) : "";
    const regenerationDecision =
      mode === "edit"
        ? decideNemoRegenerationByBody({
            previousBody,
            nextBody: trimmedBody,
          })
        : decideNemoRegenerationByBody({
            previousBody: "",
            nextBody: trimmedBody,
          });

    const payload = createEpisodePayload({
      seriesId,
      episodeNumber: safeEpisodeNumber,
      title: trimmedTitle,
      body: trimmedBody,
      postingStatus,
      scheduledFor,
      mode,
      existingEpisode: episode ?? null,
    });

    if (mode === "create") {
      const result = await supabase
        .from("episodes")
        .insert(payload)
        .select("id")
        .single();

      if (!result.error && result.data?.id) {
        setSaveState("success");
        setSuccessMessage(
          regenerationDecision.shouldRegenerate
            ? "話を作成した。自動朗読は再生成対象。"
            : "話を作成した。自動朗読の再生成は不要。"
        );

        router.push(
          destination === "next"
            ? `/write/series/${seriesId}/episodes/new`
            : `/write/series/${seriesId}`
        );
        router.refresh();
        return;
      }

      hideGlobalLoadingFeedback();
      setSaveState("error");
      setErrorMessage(result.error?.message ?? "話作成に失敗した。");
      return;
    }

    const result = await supabase
      .from("episodes")
      .update(payload)
      .eq("id", episode?.id ?? "");

    if (!result.error) {
      setSaveState("success");
      setSuccessMessage(
        regenerationDecision.shouldRegenerate
          ? "話を保存した。自動朗読は再生成対象。"
          : "話を保存した。自動朗読の再生成は不要。"
      );

      if (destination === "next") {
        router.push(`/write/series/${seriesId}/episodes/new`);
      } else {
        router.refresh();
        hideGlobalLoadingFeedback();
      }

      router.refresh();
      return;
    }

    hideGlobalLoadingFeedback();
    setSaveState("error");
    setErrorMessage(result.error.message);
  }

  const heading = mode === "create" ? "新しい話を追加" : "話本文を編集";
  const effectsPanelId = "episode-effects-panel";

  return (
    <main className="min-h-screen bg-white text-black">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
        <div className="mb-3 text-sm text-neutral-500">
          <span className="text-neutral-700">本文編集</span>
        </div>

        <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[32px] border border-black/10 bg-white shadow-sm">
          <div className="border-b border-black/10 px-5 py-5 sm:px-8 sm:py-6">
            <p className="text-xs tracking-[0.22em] text-neutral-500">
              LIB READ EPISODE EDITOR
            </p>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
              <h1 className="text-3xl font-bold text-black">{heading}</h1>

              <Link
                href={`/write/series/${seriesId}`}
                className="rounded-full border border-black/10 bg-white px-5 py-3 text-sm text-neutral-800 transition hover:bg-neutral-50"
              >
                作品ワークスペースへ
              </Link>
            </div>
          </div>

          <div className="grid min-h-0 flex-1 gap-6 px-5 py-6 sm:px-8">
            <section className="rounded-[28px] border border-black/10 bg-white p-5">
              <div className="grid gap-5">
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-neutral-700">
                    話タイトル
                  </span>
                  <input
                    value={title}
                    onChange={(event) => {
                      setTitle(event.target.value);
                      resetNotice();
                    }}
                    placeholder="第1話 など"
                    className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black outline-none placeholder:text-neutral-400"
                  />
                </label>

                <section className="grid gap-3">
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <span className="text-sm font-semibold text-neutral-700">
                        本文
                      </span>
                      <p className="mt-1 text-xs text-neutral-500">
                        編集と読者プレビューを切り替えて確認できる。
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <div className="inline-flex rounded-2xl border border-black/10 bg-neutral-100 p-1 shadow-inner">
                        <button
                          type="button"
                          onClick={() => setBodyViewMode("edit")}
                          className={[
                            "rounded-xl px-4 py-2 text-sm font-semibold transition",
                            bodyViewMode === "edit"
                              ? "bg-black text-white shadow-sm"
                              : "text-neutral-700 hover:bg-white",
                          ].join(" ")}
                        >
                          編集
                        </button>

                        <button
                          type="button"
                          onClick={() => setBodyViewMode("preview")}
                          className={[
                            "rounded-xl px-4 py-2 text-sm font-semibold transition",
                            bodyViewMode === "preview"
                              ? "bg-sky-50 text-black shadow-sm ring-1 ring-sky-200"
                              : "text-neutral-700 hover:bg-white",
                          ].join(" ")}
                        >
                          読者プレビュー
                        </button>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <span className="rounded-full border border-black/10 bg-white px-3 py-1 text-xs text-neutral-600">
                          {characterCount}文字
                        </span>
                        <span className="rounded-full border border-black/10 bg-white px-3 py-1 text-xs text-neutral-600">
                          {lineCount}行
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="h-[560px] min-h-0 overflow-hidden rounded-[28px] border border-black/10 bg-white">
                    {bodyViewMode === "edit" ? (
                      <textarea
                        value={body}
                        onChange={(event) => {
                          setBody(event.target.value);
                          resetNotice();
                        }}
                        placeholder="本文を入力"
                        className="h-full min-h-0 w-full resize-none overflow-y-auto border-0 bg-white px-5 py-4 text-sm leading-8 text-black outline-none placeholder:text-neutral-400"
                      />
                    ) : (
                      <div className="h-full min-h-0 overflow-y-auto bg-neutral-50 px-4 py-5 sm:px-6">
                        {readerPreviewParagraphs.length > 0 ? (
                          <article className="mx-auto max-w-3xl space-y-7 rounded-[28px] border border-black/10 bg-white px-5 py-6 text-[15px] leading-8 text-neutral-900 shadow-sm sm:px-8 sm:py-8 sm:text-base">
                            {readerPreviewParagraphs.map((paragraph, index) => (
                              <p key={`reader-preview-${index}`} className="break-words">
                                {renderTextWithAozoraRuby(paragraph)}
                              </p>
                            ))}
                          </article>
                        ) : (
                          <div className="mx-auto max-w-3xl rounded-[28px] border border-dashed border-black/10 bg-white px-5 py-6 text-sm leading-7 text-neutral-500">
                            本文を入力すると、ここに読者表示に近い形のプレビューが出る。
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </section>

                <div className="flex flex-wrap gap-3">
                  {effectSettingsPanel ? (
                    <button
                      type="button"
                      onClick={() =>
                        setShowEffectSettingsPanel((current) => !current)
                      }
                      className="rounded-full border border-sky-200 bg-sky-50 px-5 py-3 text-sm font-semibold text-black transition hover:bg-sky-100"
                    >
                      {showEffectSettingsPanel
                        ? "演出編集を閉じる"
                        : "演出を追加"}
                    </button>
                  ) : null}
                </div>
              </div>
            </section>

            {effectSettingsPanel && showEffectSettingsPanel ? (
              <section id={effectsPanelId} className="scroll-mt-24">
                {effectSettingsPanel}
              </section>
            ) : null}

            <section className="rounded-[28px] border border-black/10 bg-neutral-50 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs tracking-[0.18em] text-neutral-500">
                    POSTING STATUS
                  </p>
                  <h2 className="mt-2 text-lg font-semibold text-black">
                    投稿状態
                  </h2>
                </div>

                <div className="rounded-full border border-black/10 bg-white px-3 py-1 text-xs text-neutral-600">
                  {currentEpisodeLabel}
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {(["posted", "scheduled", "draft"] as EpisodePostingStatus[]).map(
                  (status) => {
                    const active = postingStatus === status;
                    const disabled =
                      previousEpisodeBlocksPublishing && status !== "draft";

                    return (
                      <label
                        key={status}
                        className={[
                          "cursor-pointer rounded-2xl border px-4 py-3 text-sm transition",
                          active
                            ? "border-sky-200 bg-sky-50 text-black"
                            : "border-black/10 bg-white text-neutral-700 hover:bg-neutral-50",
                          disabled ? "cursor-not-allowed opacity-50" : "",
                        ].join(" ")}
                      >
                        <input
                          type="radio"
                          name="episode-posting-status"
                          value={status}
                          checked={active}
                          disabled={disabled}
                          onChange={() => {
                            setPostingStatus(status);
                            if (status !== "scheduled") {
                              setScheduledFor("");
                            }
                            resetNotice();
                          }}
                          className="sr-only"
                        />
                        {getPostingStatusLabel(status)}
                      </label>
                    );
                  }
                )}
              </div>

              {previousEpisodeBlocksPublishing ? (
                <div className="mt-4 rounded-2xl border border-amber-300/40 bg-amber-50 px-4 py-3 text-sm leading-7 text-amber-900">
                  {previousEpisodeNumber
                    ? `前の第${previousEpisodeNumber}話がまだ下書き。先にその話を投稿または予約投稿へ進めてから、この話を公開側へ動かす。`
                    : "前話がまだ下書き。先に前話を投稿または予約投稿へ進めてから、この話を公開側へ動かす。"}
                </div>
              ) : null}

              {postingStatus === "scheduled" ? (
                <label className="mt-4 grid gap-2">
                  <span className="text-sm font-semibold text-neutral-700">
                    予約日時
                  </span>
                  <input
                    type="datetime-local"
                    value={scheduledFor}
                    min={
                      previousPostingStatus === "scheduled"
                        ? previousScheduledForLocalValue
                        : undefined
                    }
                    onChange={(event) => {
                      setScheduledFor(event.target.value);
                      resetNotice();
                    }}
                    className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black outline-none"
                  />
                </label>
              ) : null}

              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => handleSubmit("workspace")}
                  disabled={isSaving}
                  className="rounded-full bg-black px-5 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSaving
                    ? "保存中..."
                    : mode === "create"
                      ? "作成して保存"
                      : "保存して続ける"}
                </button>

                {mode === "edit" && postingStatus === "draft" ? (
                  <button
                    type="button"
                    onClick={async () => {
                      setPostingStatus("posted");
                      await Promise.resolve();
                      await handleSubmit("workspace");
                    }}
                    disabled={isSaving || previousEpisodeBlocksPublishing}
                    className="rounded-full border border-black/10 bg-white px-5 py-3 text-sm text-neutral-800 transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    この下書きを投稿する
                  </button>
                ) : null}

                <Link
                  href={`/write/series/${seriesId}`}
                  className="rounded-full border border-black/10 bg-white px-5 py-3 text-sm text-neutral-800 transition hover:bg-neutral-50"
                >
                  ワークスペースへ戻る
                </Link>
              </div>

              {errorMessage ? (
                <div className="mt-4 rounded-2xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {errorMessage}
                </div>
              ) : null}

              {successMessage ? (
                <div className="mt-4 rounded-2xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  {successMessage}
                </div>
              ) : null}
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}