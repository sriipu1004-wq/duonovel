"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
  hideGlobalLoadingFeedback,
  showGlobalLoadingFeedback,
} from "@/lib/client/loadingFeedback";
import {
  EFFECT_BACKGROUND_PRESETS,
  getBackgroundPresetMeta,
  parseEffectSettingsFromRow,
  serializeEffectSettingsForSave,
  type EffectBackgroundPreset,
  type EffectSettings,
} from "@/lib/effects/effectSettings";
import {
  pickText,
  type SeriesRow,
  type EpisodeRow,
  type RecordingPermissionMode,
  type SeriesPublicationStatus,
  type EpisodePostingStatus,
  type EpisodeStatusKind,
  getEpisodeNumber,
  getEpisodePostingStatus,
  getEpisodeStatusKind,
  getEpisodeStatusLabel,
  getSeriesPublicationStatus,
  getSeriesGenres,
  isEpisodeDraft,  
  isEpisodePosted,
  isEpisodePubliclyVisible,
  isEpisodeScheduled,
  isPublicSeries,
  isSeriesEpisodeCommentVisible,
  isSeriesReviewVisible,
  sortEpisodes,
} from "@/features/write/writeShared";

type Mode = "create" | "edit";
type StoryFormat = "short" | "long";

type WriteSeriesFormProps = {
  mode: Mode;
  currentUserId: string;
  series?: SeriesRow | null;
  episodes?: EpisodeRow[];
};

type SaveState = "idle" | "saving" | "success" | "error";

type SeriesStatusPanel =
  | "publication"
  | "format"
  | "reactions"
  | "display"
  | "genres"
  | "tags"
  | "recording"
  | null;

type BackgroundPresetSelectValue =
  "" | Exclude<EffectBackgroundPreset, null>;


const DISPLAY_BACKGROUND_COLOR_OPTIONS = [
  { value: "", label: "未設定", className: "bg-white text-neutral-700" },
  { value: "#ffffff", label: "白", className: "bg-white text-black" },
  { value: "#f7edd8", label: "生成り", className: "bg-[#f7edd8] text-[#2f2416]" },
  { value: "#eef5f7", label: "薄い青紙", className: "bg-[#eef5f7] text-[#1f2b33]" },
  { value: "#f2eadb", label: "しわ紙", className: "bg-[#f2eadb] text-[#2d261b]" },
  { value: "#dfc48c", label: "古紙", className: "bg-[#dfc48c] text-[#2d1d0f]" },
  { value: "#111827", label: "黒", className: "bg-[#111827] text-white" },
  { value: "#fef2f2", label: "薄赤", className: "bg-red-50 text-red-800" },
  { value: "#eff6ff", label: "薄青", className: "bg-blue-50 text-blue-800" },
  { value: "#f0fdf4", label: "薄緑", className: "bg-green-50 text-green-800" },
] as const;

const DISPLAY_FONT_FAMILY_OPTIONS = [
  { value: "", label: "未設定", style: {} },
  { value: "serif", label: "明朝系", style: { fontFamily: "serif" } },
  { value: "sans-serif", label: "ゴシック系", style: { fontFamily: "sans-serif" } },
  { value: "monospace", label: "等幅", style: { fontFamily: "monospace" } },
  { value: "'Yu Mincho', 'Hiragino Mincho ProN', serif", label: "游明朝", style: { fontFamily: "'Yu Mincho', 'Hiragino Mincho ProN', serif" } },
  { value: "'Yu Gothic', 'Hiragino Sans', sans-serif", label: "游ゴシック", style: { fontFamily: "'Yu Gothic', 'Hiragino Sans', sans-serif" } },
] as const;

const DISPLAY_FONT_SIZE_OPTIONS = [
  { value: "", label: "未設定", className: "text-sm" },
  { value: "14px", label: "小さめ", className: "text-sm" },
  { value: "16px", label: "標準", className: "text-base" },
  { value: "18px", label: "やや大きめ", className: "text-lg" },
  { value: "20px", label: "大きめ", className: "text-xl" },
  { value: "22px", label: "かなり大きめ", className: "text-2xl" },
] as const;

const DISPLAY_TEXT_COLOR_OPTIONS = [
  { value: "", label: "未設定", className: "text-neutral-700" },
  { value: "#111827", label: "黒", className: "text-[#111827]" },
  { value: "#2f2416", label: "濃茶", className: "text-[#2f2416]" },
  { value: "#1f2b33", label: "青黒", className: "text-[#1f2b33]" },
  { value: "#ef4444", label: "赤", className: "text-red-500" },
  { value: "#2563eb", label: "青", className: "text-blue-600" },
  { value: "#16a34a", label: "緑", className: "text-green-600" },
  { value: "#9333ea", label: "紫", className: "text-purple-600" },
  { value: "#ffffff", label: "白", className: "bg-neutral-900 text-white" },
] as const;


function buildSummaryValue(summary: string): Array<Record<string, string>> {
  const trimmed = summary.trim();

  return [
    { summary: trimmed, description: trimmed, catch_copy: trimmed },
    { summary: trimmed },
    { description: trimmed },
    { catch_copy: trimmed },
  ];
}

function getTitle(series?: SeriesRow | null): string {
  return pickText(series?.title);
}

function getSummary(series?: SeriesRow | null): string {
  return pickText(series?.summary, series?.description, series?.catch_copy);
}

function parseTags(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw
      .map((tag) => String(tag).trim())
      .filter((tag) => tag.length > 0);
  }

  if (typeof raw === "string" && raw.trim().length > 0) {
    return raw
      .split(/[\n,、]/)
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);
  }

  return [];
}

function toEditorValue(items: string[]): string {
  return items.join("\n");
}

function readObjectRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object") {
    return value as Record<string, unknown>;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    try {
      const parsed = JSON.parse(value);

      if (parsed && typeof parsed === "object") {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
  }

  return null;
}

function isAiGeneratedSeries(series?: SeriesRow | null): boolean {
  if (!series) {
    return false;
  }

  if (parseTags(series.tags).includes("AI生成")) {
    return true;
  }

  const settings = readObjectRecord(
    series.effect_settings ?? series["effectSettings"]
  );

  if (!settings) {
    return false;
  }

  return (
    settings.source === "time_fit_ai_story" ||
    settings.aiGenerated === true ||
    settings.authorName === "AI生成"
  );
}

function getStoryFormatFromSeries(series?: SeriesRow | null): StoryFormat {
  const settings = readObjectRecord(
    series?.effect_settings ?? series?.["effectSettings"]
  );

  if (settings?.storyFormat === "short" || settings?.storyFormat === "long") {
    return settings.storyFormat;
  }

  return isAiGeneratedSeries(series) ? "short" : "long";
}

function buildWorkspaceTags(
  raw: unknown,
  isAiGenerated: boolean
): string[] {
  const tags = parseTags(raw);

  if (!isAiGenerated) {
    return tags;
  }

  return ["AI生成", ...tags.filter((tag) => tag !== "AI生成")];
}

function preserveAiGeneratedAttribution(
  base: EffectSettings | null,
  series?: SeriesRow | null
): EffectSettings | null {
  if (!isAiGeneratedSeries(series)) {
    return base;
  }

  const original = readObjectRecord(
    series?.effect_settings ?? series?.["effectSettings"]
  );

  const rawEditorName =
    original?.editorName ?? original?.editor_name;

  const editorName =
    typeof rawEditorName === "string"
      ? rawEditorName.trim()
      : "";

  return {
    ...(original ?? {}),
    ...(base ?? {}),
    version: 1,
    source: "time_fit_ai_story",
    aiGenerated: true,
    authorName: "AI生成",
    ...(editorName ? { editorName } : {}),
  } as EffectSettings;
}

function preserveWorkspaceEffectSettings(
  base: EffectSettings | null,
  series: SeriesRow | null | undefined,
  storyFormat: StoryFormat
): EffectSettings | null {
  const preserved = preserveAiGeneratedAttribution(base, series);

  return {
    ...(preserved ?? {}),
    storyFormat,
  } as EffectSettings;
}

function normalizeRecordingPermissionMode(
  value: unknown
): RecordingPermissionMode {
  if (value === "open" || value === "closed") {
    return value;
  }

  return "closed";
}

function getRecordingPermissionLabel(
  mode: RecordingPermissionMode | null | undefined
): string {
  if (mode === "open") return "朗読許可";
  return "朗読不可";
}

function getSeriesPublicationLabel(
  status: SeriesPublicationStatus
): string {
  return status === "public" ? "公開" : "非公開";
}

function getEpisodePostingLabel(status: EpisodePostingStatus): string {
  if (status === "posted") return "投稿";
  if (status === "scheduled") return "予約投稿";
  return "下書き保存";
}

function getBackgroundPresetLabel(
  preset: BackgroundPresetSelectValue | EffectBackgroundPreset
): string {
  if (!preset) return "未設定";
  return getBackgroundPresetMeta(preset)?.label ?? "未設定";
}

function hasValidLocalDateTime(value: string): boolean {
  if (!value.trim()) {
    return false;
  }

  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime());
}

function buildEpisodeCreateHref(args: {
  seriesId: string;
  initialPostingStatus: EpisodePostingStatus;
  initialScheduledFor: string;
}): string {
  const query = new URLSearchParams();
  query.set("initialPostingStatus", args.initialPostingStatus);

  if (
    args.initialPostingStatus === "scheduled" &&
    args.initialScheduledFor.trim().length > 0
  ) {
    query.set("initialScheduledFor", args.initialScheduledFor);
  }

  const queryString = query.toString();
  return `/write/series/${args.seriesId}/episodes/new${
    queryString ? `?${queryString}` : ""
  }`;
}

function buildWorkspaceFields(args: {
  publicationStatus: SeriesPublicationStatus;
  reviewsEnabled: boolean;
  episodeCommentsEnabled: boolean;
  genres: string[];
  tags: string[];
  recordingPermissionMode: RecordingPermissionMode;
  effectSettings: EffectSettings | null;
}) {
  return {
    publication_status: args.publicationStatus,
    reviews_enabled: args.reviewsEnabled,
    episode_comments_enabled: args.episodeCommentsEnabled,
    genres: args.genres,
    tags: args.tags,
    recording_permission_mode: args.recordingPermissionMode,
    effect_settings: args.effectSettings,
  };
}

function getEpisodeBadgeClass(kind: EpisodeStatusKind): string {
  if (kind === "draft") {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }

  if (kind === "scheduled") {
    return "border-sky-200 bg-sky-50 text-sky-800";
  }

  if (kind === "scheduled_live") {
    return "border-cyan-200 bg-cyan-50 text-cyan-800";
  }

  return "border-emerald-200 bg-white text-emerald-800";
}

function StatusBadge({ state }: { state: SaveState }) {
  if (state === "saving") {
    return (
      <span className="rounded-full border border-sky-400/20 bg-sky-400/10 px-3 py-1 text-xs text-sky-200">
        保存中...
      </span>
    );
  }

  if (state === "success") {
    return (
      <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-200">
        保存済み
      </span>
    );
  }

  if (state === "error") {
    return (
      <span className="rounded-full border border-red-400/20 bg-red-400/10 px-3 py-1 text-xs text-red-200">
        保存失敗
      </span>
    );
  }

  return (
    <span className="rounded-full border border-black/10 bg-white/5 px-3 py-1 text-xs text-neutral-500">
      未保存
    </span>
  );
}

function StepCard({
  step,
  title,
  description,
}: {
  step: string;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-black/10 bg-white p-3">
      <p className="text-xs tracking-[0.18em] text-neutral-500">{step}</p>
      <p className="mt-2 text-sm font-semibold text-black">{title}</p>
      <p className="mt-2 text-sm leading-7 text-neutral-600">{description}</p>
    </div>
  );
}

function WorkspaceLinkCard({
  eyebrow,
  title,
  description,
  href,
  cta,
}: {
  eyebrow: string;
  title: string;
  description: string;
  href: string;
  cta: string;
}) {
  return (
    <article className="rounded-2xl border border-black/10 bg-white p-3">
      <p className="text-xs tracking-[0.18em] text-neutral-500">{eyebrow}</p>
      <h3 className="mt-2 text-lg font-semibold text-black">{title}</h3>
      <p className="mt-3 text-sm leading-7 text-neutral-600">{description}</p>

      <div className="mt-4">
        <Link
          href={href}
          className="inline-flex rounded-full border border-black/10 bg-white/5 px-4 py-2 text-sm text-neutral-800 transition hover:bg-neutral-50"
        >
          {cta}
        </Link>
      </div>
    </article>
  );
}

export default function WriteSeriesForm({
  mode,
  currentUserId,
  series,
  episodes = [],
}: WriteSeriesFormProps) {
  const router = useRouter();

  const isAiGenerated = isAiGeneratedSeries(series);
  const initialGenres = getSeriesGenres(series);
  const initialTags = isAiGenerated
    ? parseTags(series?.tags).filter((tag) => tag !== "AI生成")
    : parseTags(series?.tags);
  const initialRecordingPermissionMode = isAiGenerated
    ? "open"
    : mode === "create"
      ? "open"
      : normalizeRecordingPermissionMode(series?.recording_permission_mode);
  const initialEffectSettings = parseEffectSettingsFromRow(
    series?.effect_settings,
    series?.["effectSettings"]
  );
  const initialStoryFormat = getStoryFormatFromSeries(series);

  const [title, setTitle] = useState(getTitle(series));
  const [summary, setSummary] = useState(getSummary(series));
  const [publicationStatus, setPublicationStatus] =
    useState<SeriesPublicationStatus>(getSeriesPublicationStatus(series));
  const [reviewsEnabled, setReviewsEnabled] = useState(
    isSeriesReviewVisible(series)
  );
  const [episodeCommentsEnabled, setEpisodeCommentsEnabled] = useState(
    isSeriesEpisodeCommentVisible(series)
  );
  const [genreEditorValue, setGenreEditorValue] = useState(
    toEditorValue(initialGenres)
  );
  const [savedGenres, setSavedGenres] = useState(initialGenres);
  const [tagEditorValue, setTagEditorValue] = useState(
    toEditorValue(initialTags)
  );
  const [savedTags, setSavedTags] = useState(initialTags);
  const [recordingPermissionMode, setRecordingPermissionMode] =
    useState<RecordingPermissionMode>(initialRecordingPermissionMode);
  const [storyFormat, setStoryFormat] = useState<StoryFormat>(
    initialStoryFormat
  );
  const [
    savedRecordingPermissionMode,
    setSavedRecordingPermissionMode,
  ] = useState<RecordingPermissionMode>(initialRecordingPermissionMode);
  const [seriesBackgroundPreset, setSeriesBackgroundPreset] =
    useState<BackgroundPresetSelectValue>(
      (initialEffectSettings.backgroundPreset ?? "") as BackgroundPresetSelectValue
    );
  const [seriesBackgroundColor, setSeriesBackgroundColor] = useState(
    initialEffectSettings.backgroundColor ?? ""
  );
  const [seriesFontFamily, setSeriesFontFamily] = useState(
    initialEffectSettings.typography.fontFamily ?? ""
  );
  const [seriesFontSize, setSeriesFontSize] = useState(
    initialEffectSettings.typography.fontSize ?? ""
  );
  const [seriesTextColor, setSeriesTextColor] = useState(
    initialEffectSettings.typography.textColor ?? ""
  );

  const [initialPostingStatus, setInitialPostingStatus] =
    useState<EpisodePostingStatus>("draft");
  const [initialScheduledFor, setInitialScheduledFor] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [activeSeriesStatusPanel, setActiveSeriesStatusPanel] =
    useState<SeriesStatusPanel>(null);
  const [openDisplaySetting, setOpenDisplaySetting] = useState<
    "background" | "font" | "fontSize" | "textColor" | null
  >(null);

  const sortedEpisodes = sortEpisodes(episodes);
  const postedCount = sortedEpisodes.filter(isEpisodePosted).length;
  const scheduledCount = sortedEpisodes.filter(isEpisodeScheduled).length;
  const draftCount = sortedEpisodes.filter(isEpisodeDraft).length;
const publicVisibleCount = sortedEpisodes.filter(
  (episode) => isEpisodePubliclyVisible(episode)
).length;
  const latestEpisode =
    sortedEpisodes.length > 0 ? sortedEpisodes[sortedEpisodes.length - 1] : null;
  const latestDraft =
    [...sortedEpisodes].reverse().find((episode) => isEpisodeDraft(episode)) ??
    null;

  const nextStepHref =
    !series?.id
      ? null
      : sortedEpisodes.length === 0
        ? `/write/series/${series.id}/episodes/new`
        : latestDraft
          ? `/write/series/${series.id}/episodes/${latestDraft.id}`
          : `/write/series/${series.id}/episodes/new`;

  const nextStepLabel =
    !series?.id
      ? null
      : sortedEpisodes.length === 0
        ? "1話目を作る"
: latestDraft
  ? `下書き中の第${getEpisodeNumber(latestDraft)}話を開いて投稿へ進める`
          : latestEpisode
            ? `第${getEpisodeNumber(latestEpisode) + 1}話を追加する`
            : "話を追加する";

  const nextStepDescription =
    !series?.id
      ? null
      : sortedEpisodes.length === 0
        ? "まずはこの作品の最初の話を作る。"
: latestDraft
  ? "まだ下書きの話がある。本文編集を開いて、投稿または予約投稿へ切り替える。"
          : "予約投稿や投稿済みの流れを保ったまま次の話へ進む。";

  const tags = buildWorkspaceTags(tagEditorValue, isAiGenerated);
  const genres = parseTags(genreEditorValue);
  const recordingPermissionLabel = getRecordingPermissionLabel(
    recordingPermissionMode
  );
  const effectiveStoryFormat: StoryFormat = storyFormat;
  const publicSurfaceReady =
    !!series?.id &&
    isPublicSeries(series) &&
    publicVisibleCount > 0;
  const firstPublicEpisode = sortedEpisodes.find((episode) =>
    isEpisodePubliclyVisible(episode)
  );
  const firstPublicEpisodeNumber = firstPublicEpisode
    ? getEpisodeNumber(firstPublicEpisode)
    : 0;

  const seriesStatusItems: Array<{
    id: Exclude<SeriesStatusPanel, null>;
    label: string;
    value: string;
  }> = [
    {
      id: "publication",
      label: "公開状態",
      value: getSeriesPublicationLabel(publicationStatus),
    },
    {
      id: "format",
      label: "作品形式",
      value: effectiveStoryFormat === "short" ? "短編" : "長編",
    },
    {
      id: "reactions",
      label: "反応表示",
      value: [
        reviewsEnabled ? "レビュー表示" : "レビュー非表示",
        episodeCommentsEnabled ? "コメント表示" : "コメント非表示",
      ].join(" / "),
    },
    {
      id: "display",
      label: "表示設定",
      value:
        [
          getBackgroundPresetLabel(seriesBackgroundPreset),
          seriesFontFamily,
          seriesFontSize,
          seriesTextColor,
        ]
          .filter((item) => item && item !== "未設定")
          .join(" / ") || "未設定",
    },
    {
      id: "genres",
      label: "ジャンル",
      value: genres.length > 0 ? genres.join(" / ") : "未設定",
    },
    {
      id: "tags",
      label: "タグ",
      value: tags.length > 0 ? tags.join(" / ") : "未設定",
    },
    {
      id: "recording",
      label: "朗読許可",
      value: isAiGenerated
        ? "無条件許可（固定）"
        : recordingPermissionLabel,
    },
  ];

  function buildSeriesDisplayEffectSettings(): EffectSettings | null {
    return serializeEffectSettingsForSave({
      version: 1,
      backgroundPreset: seriesBackgroundPreset || null,
      backgroundColor: null,
      typography: {
        fontFamily: seriesFontFamily.trim() || null,
        fontSize: seriesFontSize.trim() || null,
        textColor: seriesTextColor.trim() || null,
        bold: initialEffectSettings.typography.bold,
        italic: initialEffectSettings.typography.italic,
      },
      inlineMarks: initialEffectSettings.inlineMarks,
      illustrations: initialEffectSettings.illustrations,
      sceneCues: initialEffectSettings.sceneCues,
      sentenceTimestamps: initialEffectSettings.sentenceTimestamps,
      notes: initialEffectSettings.notes,
    });
  }

  function resetSaveUi() {
    setSaveState("idle");
    setErrorMessage("");
    setSuccessMessage("");
  }

  async function handleCreate(destination: "episode" | "workspace") {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      hideGlobalLoadingFeedback();
      setSaveState("error");
      setErrorMessage("タイトルは必須。");
      setSuccessMessage("");
      return;
    }

    if (
      initialPostingStatus === "scheduled" &&
      !hasValidLocalDateTime(initialScheduledFor)
    ) {
      hideGlobalLoadingFeedback();
      setSaveState("error");
      setErrorMessage("予約投稿を選ぶ時は日時を入れる。");
      setSuccessMessage("");
      return;
    }

    setSaveState("saving");
    setErrorMessage("");
    setSuccessMessage("");

    const summaryVariants = buildSummaryValue(summary);
    const nextGenres = parseTags(genreEditorValue);
    const nextTags = buildWorkspaceTags(tagEditorValue, isAiGenerated);
    const workspaceFields = buildWorkspaceFields({
      publicationStatus,
      reviewsEnabled,
      episodeCommentsEnabled,
      genres: nextGenres,
      tags: nextTags,
      recordingPermissionMode: isAiGenerated
        ? "open"
        : recordingPermissionMode,
      effectSettings: preserveWorkspaceEffectSettings(
        buildSeriesDisplayEffectSettings(),
        series,
        effectiveStoryFormat
      ),
    });

    const payloads: Array<Record<string, unknown>> = summaryVariants.map(
      (summaryFields) => ({
        title: trimmedTitle,
        author_id: currentUserId,
        ...summaryFields,
        ...workspaceFields,
      })
    );

    payloads.push({
      title: trimmedTitle,
      author_id: currentUserId,
      ...workspaceFields,
    });

    let lastError = "作品作成に失敗した。";

    for (const payload of payloads) {
      const result = await supabase
        .from("series")
        .insert(payload)
        .select("id")
        .single();

      if (!result.error && result.data?.id) {
        hideGlobalLoadingFeedback();
        setSaveState("success");
        setSuccessMessage("作品を作成した。");

        router.push(
          destination === "episode"
            ? buildEpisodeCreateHref({
                seriesId: result.data.id,
                initialPostingStatus,
                initialScheduledFor,
              })
            : `/write/series/${result.data.id}`
        );
        router.refresh();
        return;
      }

      if (result.error) {
        lastError = result.error.message;
      }
    }

    hideGlobalLoadingFeedback();

    setSaveState("error");
    setErrorMessage(lastError);
  }

  async function handleUpdate() {
    if (!series?.id) {
      hideGlobalLoadingFeedback();
      setSaveState("error");
      setErrorMessage("作品IDが取れない。");
      setSuccessMessage("");
      return;
    }

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      hideGlobalLoadingFeedback();
      setSaveState("error");
      setErrorMessage("タイトルは必須。");
      setSuccessMessage("");
      return;
    }

    setSaveState("saving");
    setErrorMessage("");
    setSuccessMessage("");

    const summaryVariants = buildSummaryValue(summary);
    const nextGenres = parseTags(genreEditorValue);
    const nextTags = buildWorkspaceTags(tagEditorValue, isAiGenerated);
    const workspaceFields = buildWorkspaceFields({
      publicationStatus,
      reviewsEnabled,
      episodeCommentsEnabled,
      genres: nextGenres,
      tags: nextTags,
      recordingPermissionMode: isAiGenerated
        ? "open"
        : recordingPermissionMode,
      effectSettings: preserveWorkspaceEffectSettings(
        buildSeriesDisplayEffectSettings(),
        series,
        effectiveStoryFormat
      ),
    });

    const payloads: Array<Record<string, unknown>> = summaryVariants.map(
      (summaryFields) => ({
        title: trimmedTitle,
        author_id: currentUserId,
        ...summaryFields,
        ...workspaceFields,
      })
    );

    payloads.push({
      title: trimmedTitle,
      ...workspaceFields,
    });

    let lastError = "作品ワークスペースの保存に失敗した。";

    for (const payload of payloads) {
      const result = await supabase.from("series").update(payload).eq("id", series.id);

      if (!result.error) {
        setSavedGenres(nextGenres);
        setGenreEditorValue(toEditorValue(nextGenres));
        const nextEditableTags = isAiGenerated
          ? nextTags.filter((tag) => tag !== "AI生成")
          : nextTags;

        setSavedTags(nextEditableTags);
        setTagEditorValue(toEditorValue(nextEditableTags));
        setSavedRecordingPermissionMode(
          isAiGenerated ? "open" : recordingPermissionMode
        );

        hideGlobalLoadingFeedback();

        setSaveState("success");
        setSuccessMessage("作品ワークスペースを保存した。");
        router.refresh();
        return;
      }

      lastError = result.error.message;
    }

    hideGlobalLoadingFeedback();

    setSaveState("error");
    setErrorMessage(lastError);
  }

  async function handleSubmit(destination: "episode" | "workspace" = "workspace") {
    if (mode === "create") {
      await handleCreate(destination);
      return;
    }

    await handleUpdate();
  }

  const heading = mode === "create" ? "新規作成スペース" : "作品ワークスペース";
  const sub = "";

  return (
    <main className="min-h-screen bg-white text-black">
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-4 text-sm text-neutral-500">
          <span className="text-neutral-700">
            {heading}
          </span>
        </div>

        <section className="overflow-hidden rounded-[32px] border border-black/10 bg-white shadow-sm">
          <div className="border-b border-black/10 px-5 py-6 sm:px-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-3xl">
                <p className="text-xs tracking-[0.22em] text-neutral-500">
                  LIB READ WRITE WORKSPACE
                </p>
                <h1 className="mt-3 text-3xl font-bold text-black">{heading}</h1>
                {sub ? (
                  <p className="mt-3 text-sm leading-7 text-neutral-600">
                    {sub}
                  </p>
                ) : null}
              </div>
</div>

            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href="/write"
                className="rounded-full border border-black/10 bg-white/5 px-4 py-2.5 text-sm text-neutral-800 transition hover:bg-neutral-50"
              >
                作品ワークスペース一覧へ
              </Link>

              {series?.id && publicSurfaceReady ? (
                <Link
                  href={
                    effectiveStoryFormat === "short" && firstPublicEpisodeNumber > 0
                      ? `/read/${series.id}/${firstPublicEpisodeNumber}`
                      : `/works/${series.id}`
                  }
                  className="rounded-full border border-black/10 bg-white/5 px-4 py-2.5 text-sm text-neutral-800 transition hover:bg-neutral-50"
                >
                  {effectiveStoryFormat === "short"
                    ? "読む画面を見る"
                    : "作品ページ（目次）を見る"}
                </Link>
              ) : series?.id ? (
                <span className="rounded-full border border-black/10 bg-white/5 px-4 py-2.5 text-sm text-neutral-500">
                  まだ公開面に出ていない
                </span>
              ) : null}
            </div>
          </div>

          <div className="grid gap-6 px-5 py-6 sm:px-8">
            <section className="rounded-[28px] border border-black/10 bg-neutral-50 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs tracking-[0.18em] text-neutral-500">
                    SERIES CORE
                  </p>
                  <h2 className="mt-2 text-xl font-semibold text-black">
                    作品情報
                  </h2>
                </div>
              </div>

              <div className="mt-5 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
                <div className="grid gap-4">
                  <label className="grid gap-2">
                    <span className="text-sm text-neutral-700">作品タイトル</span>
                    <input
                      value={title}
                      onChange={(event) => {
                        setTitle(event.target.value);
                        resetSaveUi();
                      }}
                      placeholder="作品タイトル"
                      className="rounded-2xl border border-black/10 bg-white/5 px-3 py-2 text-sm text-black outline-none placeholder:text-neutral-500"
                    />
                  </label>

                  <label className="grid gap-2">
                    <span className="text-sm text-neutral-700">あらすじ</span>
                    <textarea
                      value={summary}
                      onChange={(event) => {
                        setSummary(event.target.value);
                        resetSaveUi();
                      }}
                      rows={8}
                      placeholder="作品の概要を書く"
                      className="rounded-2xl border border-black/10 bg-white/5 px-3 py-2 text-sm leading-7 text-black outline-none placeholder:text-neutral-500"
                    />
                  </label>

                  <div className="hidden">
                    <p className="text-sm font-semibold text-black">作品公開状態</p>

                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      {(["private", "public"] as SeriesPublicationStatus[]).map((status) => {
                        const active = publicationStatus === status;

                        return (
                          <label
                            key={status}
                            className={`rounded-2xl border px-4 py-4 ${
                              active
                                ? "border-sky-200 bg-sky-50"
                                : "border-black/10 bg-neutral-50"
                            }`}
                          >
                            <input
                              type="radio"
                              name="series-publication-status"
                              value={status}
                              checked={active}
                              onChange={() => {
                                setPublicationStatus(status);
                                resetSaveUi();
                              }}
                              className="sr-only"
                            />
                            <p className="text-sm font-semibold text-black">
                              {getSeriesPublicationLabel(status)}
                            </p>
                            <p className="mt-2 text-sm leading-7 text-neutral-600">
                              {status === "public"
                                ? "投稿済みまたは予約到達の話があれば、作品ごと公開面に出せる。"
                                : "作者ワークスペースでは見えるが、読者向け公開面には出さない。"}
                            </p>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {mode === "edit" || mode === "create" ? (
                    <div className="rounded-2xl border border-black/10 bg-sky-50/60 p-4">
                      <p className="text-sm font-semibold text-black">
                        作品状態
                      </p>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        {seriesStatusItems.map((item) => {
                          const active = activeSeriesStatusPanel === item.id;

                          return (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() =>
                                setActiveSeriesStatusPanel((current) =>
                                  current === item.id ? null : item.id
                                )
                              }
                              className={[
                                "rounded-2xl border px-3 py-3 text-left transition",
                                active
                                  ? "border-sky-200 bg-sky-50"
                                  : "border-black/10 bg-white hover:bg-neutral-50",
                              ].join(" ")}
                              aria-expanded={active}
                            >
                              <span className="block text-[11px] tracking-[0.16em] text-neutral-500">
                                {item.label}
                              </span>
                              <span className="mt-1 block text-sm font-semibold text-black">
                                {item.value}
                              </span>
                              <span className="mt-2 block text-xs text-neutral-500">
                                {active ? "閉じる" : "変更"}
                              </span>
                            </button>
                          );
                        })}
                      <div className={["mt-4 grid gap-4", activeSeriesStatusPanel ? "" : "hidden"].join(" ")}>
                        <div className={activeSeriesStatusPanel === "format" ? "rounded-2xl border border-black/10 bg-white p-3" : "hidden"}>
                          <p className="text-sm font-semibold text-black">
                            作品形式
                          </p>

                          {isAiGenerated ? (
                            <div className="mt-3 rounded-2xl border border-sky-200 bg-sky-50 px-3 py-3">
                              <p className="text-sm font-semibold text-black">
                                {effectiveStoryFormat === "short" ? "短編" : "長編"}（自動管理）
                              </p>
                              <p className="mt-1 text-xs leading-6 text-neutral-600">
                                AI生成作品は第1話だけの間は短編、続編生成に成功すると長編へ自動で切り替わる。この画面からは変更できない。
                              </p>
                            </div>
                          ) : (
                            <div className="mt-3 grid gap-2 sm:grid-cols-2">
                              {([
                                ["short", "短編", "作品ページ（目次）を作らず、読む画面へ直接公開する。あらすじは読む画面に表示する。"],
                                ["long", "長編", "作品ページ（目次）を作り、各話・朗読者・レビューなどを作品単位で表示する。"],
                              ] as const).map(([value, label, description]) => {
                                const active = effectiveStoryFormat === value;

                                return (
                                  <label
                                    key={value}
                                    className={[
                                      "cursor-pointer rounded-2xl border px-3 py-3 text-sm transition",
                                      active
                                        ? "border-sky-200 bg-sky-50 text-black"
                                        : "border-black/10 bg-white text-neutral-700 hover:bg-neutral-50",
                                    ].join(" ")}
                                  >
                                    <input
                                      type="radio"
                                      name="series-story-format"
                                      value={value}
                                      checked={active}
                                      onChange={() => {
                                        setStoryFormat(value);
                                        resetSaveUi();
                                      }}
                                      className="sr-only"
                                    />
                                    <span className="block font-semibold">{label}</span>
                                    <span className="mt-2 block text-xs leading-6 text-neutral-500">
                                      {description}
                                    </span>
                                  </label>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        <div className={activeSeriesStatusPanel === "publication" ? "rounded-2xl border border-black/10 bg-white p-3" : "hidden"}>
                          <p className="text-sm font-semibold text-black">
                            公開状態
                          </p>

                          <div className="mt-3 grid gap-2 sm:grid-cols-2">
                            {(["private", "public"] as SeriesPublicationStatus[]).map(
                              (status) => {
                                const active = publicationStatus === status;

                                return (
                                  <label
                                    key={status}
                                    className={[
                                      "cursor-pointer rounded-2xl border px-3 py-3 text-sm transition",
                                      active
                                        ? "border-sky-200 bg-sky-50 text-black"
                                        : "border-black/10 bg-white text-neutral-700 hover:bg-neutral-50",
                                    ].join(" ")}
                                  >
                                    <input
                                      type="radio"
                                      name="series-publication-status-inline"
                                      value={status}
                                      checked={active}
                                      onChange={() => {
                                        setPublicationStatus(status);
                                        resetSaveUi();
                                      }}
                                      className="sr-only"
                                    />
                                    {getSeriesPublicationLabel(status)}
                                  </label>
                                );
                              }
                            )}
                          </div>
                        </div>

                        <div className={activeSeriesStatusPanel === "reactions" ? "rounded-2xl border border-black/10 bg-white p-3" : "hidden"}>
                          <p className="text-sm font-semibold text-black">
                            反応表示
                          </p>

                          <div className="mt-3 grid gap-2 sm:grid-cols-2">
                            <label
                              className={[
                                "cursor-pointer rounded-2xl border px-3 py-3 text-sm transition",
                                reviewsEnabled
                                  ? "border-sky-200 bg-sky-50 text-black"
                                  : "border-black/10 bg-white text-neutral-700 hover:bg-neutral-50",
                              ].join(" ")}
                            >
                              <input
                                type="checkbox"
                                checked={reviewsEnabled}
                                onChange={(event) => {
                                  setReviewsEnabled(event.target.checked);
                                  resetSaveUi();
                                }}
                                className="sr-only"
                              />
                              レビュー
                              <span className="ml-2 text-xs text-neutral-500">
                                {reviewsEnabled ? "表示" : "非表示"}
                              </span>
                            </label>

                            <label
                              className={[
                                "cursor-pointer rounded-2xl border px-3 py-3 text-sm transition",
                                episodeCommentsEnabled
                                  ? "border-sky-200 bg-sky-50 text-black"
                                  : "border-black/10 bg-white text-neutral-700 hover:bg-neutral-50",
                              ].join(" ")}
                            >
                              <input
                                type="checkbox"
                                checked={episodeCommentsEnabled}
                                onChange={(event) => {
                                  setEpisodeCommentsEnabled(event.target.checked);
                                  resetSaveUi();
                                }}
                                className="sr-only"
                              />
                              コメント
                              <span className="ml-2 text-xs text-neutral-500">
                                {episodeCommentsEnabled ? "表示" : "非表示"}
                              </span>
                            </label>
                          </div>
                        </div>                        
                        <div className={activeSeriesStatusPanel === "display" ? "rounded-2xl border border-black/10 bg-white p-3" : "hidden"}>
                          <p className="text-sm font-semibold text-black">
                            表示設定
                          </p>

                          <div className="mt-3 grid gap-3">
                            <div className="rounded-2xl border border-black/10 bg-neutral-50">
                              <button
                                type="button"
                                onClick={() =>
                                  setOpenDisplaySetting((current) =>
                                    current === "background" ? null : "background"
                                  )
                                }
                                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                              >
                                <div className="min-w-0">
                                  <p className="text-xs tracking-[0.16em] text-neutral-500">
                                    エピソード全体の背景
                                  </p>
                                  <p className="mt-1 text-sm font-semibold text-black">
                                    {getBackgroundPresetLabel(seriesBackgroundPreset)}
                                  </p>
                                </div>

                                <div
                                  className="h-12 w-20 shrink-0 rounded-xl border border-black/10 bg-cover bg-center"
                                  style={{
                                    backgroundImage: seriesBackgroundPreset
                                      ? `url(${getBackgroundPresetMeta(seriesBackgroundPreset)?.assetPath})`
                                      : undefined,
                                    backgroundColor: seriesBackgroundPreset
                                      ? undefined
                                      : "#f5f5f5",
                                  }}
                                />
                              </button>

                              {openDisplaySetting === "background" ? (
                                <div className="grid gap-3 border-t border-black/10 p-4 sm:grid-cols-2 lg:grid-cols-3">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSeriesBackgroundPreset("");
                                      resetSaveUi();
                                    }}
                                    className={[
                                      "rounded-2xl border px-4 py-3 text-left text-sm transition",
                                      !seriesBackgroundPreset
                                        ? "border-sky-300 bg-sky-50 ring-2 ring-sky-100"
                                        : "border-black/10 bg-white hover:bg-neutral-50",
                                    ].join(" ")}
                                  >
                                    未設定
                                  </button>

                                  {EFFECT_BACKGROUND_PRESETS.map((preset) => (
                                    <button
                                      key={preset.value}
                                      type="button"
                                      onClick={() => {
                                        setSeriesBackgroundPreset(
                                          preset.value as BackgroundPresetSelectValue
                                        );
                                        resetSaveUi();
                                      }}
                                      className={[
                                        "overflow-hidden rounded-2xl border bg-white text-left transition hover:bg-neutral-50",
                                        seriesBackgroundPreset === preset.value
                                          ? "border-sky-300 ring-2 ring-sky-100"
                                          : "border-black/10",
                                      ].join(" ")}
                                    >
                                      <div
                                        className="h-20 w-full bg-cover bg-center"
                                        style={{
                                          backgroundImage: `url(${preset.assetPath})`,
                                        }}
                                      />
                                      <div className="px-4 py-3 text-sm font-semibold text-black">
                                        {preset.label}
                                      </div>
                                    </button>
                                  ))}
                                </div>
                              ) : null}
                            </div>

                            <div className="rounded-2xl border border-black/10 bg-neutral-50">
                              <button
                                type="button"
                                onClick={() =>
                                  setOpenDisplaySetting((current) =>
                                    current === "font" ? null : "font"
                                  )
                                }
                                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                              >
                                <div>
                                  <p className="text-xs tracking-[0.16em] text-neutral-500">
                                    文字フォント
                                  </p>
                                  <p className="mt-1 text-sm font-semibold text-black">
                                    {DISPLAY_FONT_FAMILY_OPTIONS.find((item) => item.value === seriesFontFamily)?.label ?? "未設定"}
                                  </p>
                                </div>
                              </button>

                              {openDisplaySetting === "font" ? (
                                <div className="grid gap-2 border-t border-black/10 p-4 sm:grid-cols-2 lg:grid-cols-3">
                                  {DISPLAY_FONT_FAMILY_OPTIONS.map((option) => (
                                    <button
                                      key={option.label}
                                      type="button"
                                      onClick={() => {
                                        setSeriesFontFamily(option.value);
                                        resetSaveUi();
                                      }}
                                      style={option.style}
                                      className={[
                                        "rounded-2xl border bg-white px-4 py-3 text-left text-sm transition",
                                        seriesFontFamily === option.value
                                          ? "border-sky-300 bg-sky-50 ring-2 ring-sky-100"
                                          : "border-black/10 hover:bg-neutral-50",
                                      ].join(" ")}
                                    >
                                      {option.label}
                                    </button>
                                  ))}
                                </div>
                              ) : null}
                            </div>

                            <div className="rounded-2xl border border-black/10 bg-neutral-50">
                              <button
                                type="button"
                                onClick={() =>
                                  setOpenDisplaySetting((current) =>
                                    current === "fontSize" ? null : "fontSize"
                                  )
                                }
                                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                              >
                                <div>
                                  <p className="text-xs tracking-[0.16em] text-neutral-500">
                                    文字の大きさ
                                  </p>
                                  <p className="mt-1 text-sm font-semibold text-black">
                                    {DISPLAY_FONT_SIZE_OPTIONS.find((item) => item.value === seriesFontSize)?.label ?? "未設定"}
                                  </p>
                                </div>
                              </button>

                              {openDisplaySetting === "fontSize" ? (
                                <div className="grid gap-2 border-t border-black/10 p-4 sm:grid-cols-2 lg:grid-cols-3">
                                  {DISPLAY_FONT_SIZE_OPTIONS.map((option) => (
                                    <button
                                      key={option.label}
                                      type="button"
                                      onClick={() => {
                                        setSeriesFontSize(option.value);
                                        resetSaveUi();
                                      }}
                                      className={[
                                        "rounded-2xl border bg-white px-4 py-3 text-left font-semibold transition",
                                        option.className,
                                        seriesFontSize === option.value
                                          ? "border-sky-300 bg-sky-50 ring-2 ring-sky-100"
                                          : "border-black/10 hover:bg-neutral-50",
                                      ].join(" ")}
                                    >
                                      {option.label}
                                    </button>
                                  ))}
                                </div>
                              ) : null}
                            </div>

                            <div className="rounded-2xl border border-black/10 bg-neutral-50">
                              <button
                                type="button"
                                onClick={() =>
                                  setOpenDisplaySetting((current) =>
                                    current === "textColor" ? null : "textColor"
                                  )
                                }
                                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                              >
                                <div>
                                  <p className="text-xs tracking-[0.16em] text-neutral-500">
                                    文字の色
                                  </p>
                                  <p className="mt-1 text-sm font-semibold text-black">
                                    {DISPLAY_TEXT_COLOR_OPTIONS.find((item) => item.value === seriesTextColor)?.label ?? "未設定"}
                                  </p>
                                </div>
                              </button>

                              {openDisplaySetting === "textColor" ? (
                                <div className="grid gap-2 border-t border-black/10 p-4 sm:grid-cols-2 lg:grid-cols-3">
                                  {DISPLAY_TEXT_COLOR_OPTIONS.map((option) => (
                                    <button
                                      key={option.label}
                                      type="button"
                                      onClick={() => {
                                        setSeriesTextColor(option.value);
                                        resetSaveUi();
                                      }}
                                      className={[
                                        "rounded-2xl border bg-white px-4 py-3 text-left text-sm font-semibold transition",
                                        option.className,
                                        seriesTextColor === option.value
                                          ? "border-sky-300 ring-2 ring-sky-100"
                                          : "border-black/10 hover:bg-neutral-50",
                                      ].join(" ")}
                                    >
                                      {option.label}
                                    </button>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </div>

                        <div className={activeSeriesStatusPanel === "genres" ? "rounded-2xl border border-black/10 bg-white p-3" : "hidden"}>
                          <p className="text-sm font-semibold text-black">
                            ジャンル
                          </p>

                          <textarea
                            value={genreEditorValue}
                            onChange={(event) => {
                              setGenreEditorValue(event.target.value);
                              resetSaveUi();
                            }}
                            rows={3}
                            placeholder={"1行1ジャンル\n例: ファンタジー\n恋愛"}
                            className="mt-3 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm leading-7 text-black outline-none placeholder:text-neutral-400"
                          />

                          <div className="mt-3 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setGenreEditorValue(toEditorValue(savedGenres));
                                resetSaveUi();
                              }}
                              className="rounded-full border border-black/10 bg-white px-3 py-1.5 text-xs text-neutral-700 transition hover:bg-neutral-50"
                            >
                              保存済みに戻す
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setGenreEditorValue("");
                                resetSaveUi();
                              }}
                              className="rounded-full border border-black/10 bg-white px-3 py-1.5 text-xs text-neutral-700 transition hover:bg-neutral-50"
                            >
                              空にする
                            </button>
                          </div>
                        </div>

                        <div className={activeSeriesStatusPanel === "tags" ? "rounded-2xl border border-black/10 bg-white p-3" : "hidden"}>
                          <p className="text-sm font-semibold text-black">
                            タグ
                          </p>

                          {isAiGenerated ? (
                            <div className="mt-3 rounded-2xl border border-sky-200 bg-sky-50 px-3 py-3">
                              <p className="text-sm font-semibold text-black">
                                固定タグ: AI生成
                              </p>
                              <p className="mt-1 text-xs leading-6 text-neutral-600">
                                AI生成作品であることを示すタグのため、削除・変更できない。
                              </p>
                            </div>
                          ) : null}

                          <textarea
                            value={tagEditorValue}
                            onChange={(event) => {
                              setTagEditorValue(event.target.value);
                              resetSaveUi();
                            }}
                            rows={3}
                            placeholder={"1行1タグ\n例: 異世界\nダークファンタジー"}
                            className="mt-3 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm leading-7 text-black outline-none placeholder:text-neutral-400"
                          />

                          <div className="mt-3 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setTagEditorValue(toEditorValue(savedTags));
                                resetSaveUi();
                              }}
                              className="rounded-full border border-black/10 bg-white px-3 py-1.5 text-xs text-neutral-700 transition hover:bg-neutral-50"
                            >
                              保存済みに戻す
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setTagEditorValue("");
                                resetSaveUi();
                              }}
                              className="rounded-full border border-black/10 bg-white px-3 py-1.5 text-xs text-neutral-700 transition hover:bg-neutral-50"
                            >
                              空にする
                            </button>
                          </div>
                        </div>

                        <div className={activeSeriesStatusPanel === "recording" ? "rounded-2xl border border-black/10 bg-white p-3" : "hidden"}>
                          <p className="text-sm font-semibold text-black">
                            朗読許可
                          </p>

                          {isAiGenerated ? (
                            <div className="mt-3 rounded-2xl border border-sky-200 bg-sky-50 px-3 py-3">
                              <p className="text-sm font-semibold text-black">
                                無条件許可（固定）
                              </p>
                              <p className="mt-1 text-xs leading-6 text-neutral-600">
                                AI生成作品は朗読許可を無条件許可として扱うため、この画面では変更できない。
                              </p>
                            </div>
                          ) : (
                            <>
                              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                                {(
                                  [
                                    ["open", "朗読許可"],
                                    ["closed", "朗読不可"],
                                    ["closed", "朗読不可"],
                                  ] as const
                                ).map(([value, label]) => {
                                  const active = recordingPermissionMode === value;

                                  return (
                                    <label
                                      key={value}
                                      className={[
                                        "cursor-pointer rounded-2xl border px-3 py-3 text-sm transition",
                                        active
                                          ? "border-sky-200 bg-sky-50 text-black"
                                          : "border-black/10 bg-white text-neutral-700 hover:bg-neutral-50",
                                      ].join(" ")}
                                    >
                                      <input
                                        type="radio"
                                        name="recording-permission-mode"
                                        value={value}
                                        checked={active}
                                        onChange={() => {
                                          setRecordingPermissionMode(value);
                                          resetSaveUi();
                                        }}
                                        className="sr-only"
                                      />
                                      {label}
                                    </label>
                                  );
                                })}
                              </div>

                              <button
                                type="button"
                                onClick={() => {
                                  setRecordingPermissionMode(
                                    savedRecordingPermissionMode
                                  );
                                  resetSaveUi();
                                }}
                                className="mt-3 rounded-full border border-black/10 bg-white px-3 py-1.5 text-xs text-neutral-700 transition hover:bg-neutral-50"
                              >
                                保存済みに戻す
                              </button>
                            </>
                          )}
                        </div>

                        <p className="text-xs leading-6 text-neutral-500">
                          変更は「作品ワークスペースを保存」で反映。
                        </p>
                      </div>                        
                      </div>
                    </div>
                  ) : null}                  

                  {mode === "create" ? (
                    <div className="rounded-2xl border border-black/10 bg-white p-3">
                      <p className="text-sm font-semibold text-black">
                        1話目の投稿状態
                      </p>
                      <p className="mt-2 text-sm leading-7 text-neutral-600">
                        作品作成の時点で、1話目を 投稿 / 予約投稿 / 下書き保存 のどれで始めるかを先に決める。
                        実際の本文は作品作成後に1話目ページで書く。
                      </p>

                      <div className="mt-4 grid gap-3">
                        {(["posted", "scheduled", "draft"] as EpisodePostingStatus[]).map(
                          (status) => {
                            const active = initialPostingStatus === status;

                            return (
                              <label
                                key={status}
                                className={`rounded-2xl border px-4 py-4 ${
                                  active
                                    ? "border-sky-200 bg-sky-50"
                                    : "border-black/10 bg-neutral-50"
                                }`}
                              >
                                <input
                                  type="radio"
                                  name="initial-posting-status"
                                  value={status}
                                  checked={active}
                                  onChange={() => {
                                    setInitialPostingStatus(status);
                                    if (status !== "scheduled") {
                                      setInitialScheduledFor("");
                                    }
                                    resetSaveUi();
                                  }}
                                  className="sr-only"
                                />
                                <p className="text-sm font-semibold text-black">
                                  {getEpisodePostingLabel(status)}
                                </p>
                                <p className="mt-2 text-sm leading-7 text-neutral-600">
                                  {status === "posted"
                                    ? "1話目を作成した時点で投稿済みとして扱う。"
                                    : status === "scheduled"
                                      ? "1話目は予約投稿として保存し、到達時刻で公開対象にする。"
                                      : "1話目は下書きとして保存し、作品ワークスペースから続けて書く。"}
                                </p>
                              </label>
                            );
                          }
                        )}
                      </div>

                      {initialPostingStatus === "scheduled" ? (
                        <label className="mt-4 grid gap-2">
                          <span className="text-sm text-neutral-700">
                            1話目の予約日時
                          </span>
                          <input
                            type="datetime-local"
                            value={initialScheduledFor}
                            onChange={(event) => {
                              setInitialScheduledFor(event.target.value);
                              resetSaveUi();
                            }}
                            className="rounded-2xl border border-black/10 bg-white/5 px-3 py-2 text-sm text-black outline-none"
                          />
                          <span className="text-xs leading-6 text-neutral-500">
                            ローカル時刻で入力。保存時に UTC へ変換して送る。
                          </span>
                        </label>
                      ) : null}
                    </div>
                  ) : null}

                  <div
                    className={
                      mode === "edit"
                        ? "hidden"
                        : "rounded-2xl border border-black/10 bg-white p-3"
                    }
                  >
                    <p className="text-sm font-semibold text-black">反応表示</p>
                    <p className="mt-2 text-sm leading-7 text-neutral-600">
                      作品ページのレビュー欄と、読む画面末尾のエピソードコメント欄を作品単位で出し分ける。
                    </p>

                    <div className="mt-4 grid gap-3">
                      <label className="flex items-start gap-3 rounded-2xl border border-black/10 bg-neutral-50 px-4 py-4">
                        <input
                          type="checkbox"
                          checked={reviewsEnabled}
                          onChange={(event) => {
                            setReviewsEnabled(event.target.checked);
                            resetSaveUi();
                          }}
                          className="mt-1 h-4 w-4 rounded border-white/20 bg-white/5"
                        />
                        <div>
                          <p className="text-sm font-semibold text-black">作品レビュー欄を表示</p>
                          <p className="mt-2 text-sm leading-7 text-neutral-600">
                            OFF の時は作品ページでレビュー欄を出さない。
                          </p>
                        </div>
                      </label>

                      <label className="flex items-start gap-3 rounded-2xl border border-black/10 bg-neutral-50 px-4 py-4">
                        <input
                          type="checkbox"
                          checked={episodeCommentsEnabled}
                          onChange={(event) => {
                            setEpisodeCommentsEnabled(event.target.checked);
                            resetSaveUi();
                          }}
                          className="mt-1 h-4 w-4 rounded border-white/20 bg-white/5"
                        />
                        <div>
                          <p className="text-sm font-semibold text-black">
                            エピソードコメント欄を表示
                          </p>
                          <p className="mt-2 text-sm leading-7 text-neutral-600">
                            OFF の時は読む画面末尾でコメント欄を出さない。
                          </p>
                        </div>
                      </label>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() =>
                        handleSubmit(mode === "create" ? "episode" : "workspace")
                      }
                      className="inline-flex items-center justify-center rounded-full bg-white px-4 py-2.5 text-sm font-semibold text-black transition hover:opacity-90"
                    >
                      {saveState === "saving"
                        ? "保存中..."
                        : mode === "create"
                          ? "作品を作成して1話目へ"
                          : "作品ワークスペースを保存"}
                    </button>

                    {mode === "create" ? (
                      <button
                        type="button"
                        onClick={() => handleSubmit("workspace")}
                        className="rounded-full border border-black/10 bg-white/5 px-4 py-2.5 text-sm text-neutral-800 transition hover:bg-neutral-50"
                      >
                        作品を作成してワークスペースへ
                      </button>
                    ) : null}
</div>

                  {errorMessage ? (
                    <div className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                      {errorMessage}
                    </div>
                  ) : null}

                  {successMessage ? (
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                      {successMessage}
                    </div>
                  ) : null}
                </div>

                <div className={mode === "edit" ? "hidden" : "mt-4 grid gap-3"}>
                  <div className="rounded-2xl border border-black/10 bg-white p-3">
                    <p className="text-xs tracking-[0.18em] text-neutral-500">
                      CURRENT STATE
                    </p>
                    <div className="mt-3 grid gap-3">
                      <div className="rounded-2xl border border-black/10 bg-neutral-50 px-3 py-2 text-sm text-neutral-700">
                        作品公開:{" "}
                        <span className="font-semibold text-black">
                          {getSeriesPublicationLabel(publicationStatus)}
                        </span>
                      </div>
                      <div className="rounded-2xl border border-black/10 bg-neutral-50 px-3 py-2 text-sm text-neutral-700">
                        読者向け表示:{" "}
                        <span className="font-semibold text-black">
                          {publicSurfaceReady
                            ? "表示中"
                            : publicationStatus === "public"
                              ? "公開待ち"
                              : "非表示"}
                        </span>
                      </div>
                      <div className="rounded-2xl border border-black/10 bg-neutral-50 px-3 py-2 text-sm text-neutral-700">
                        タグ:{" "}
                        <span className="font-semibold text-black">
                          {tags.length}件
                        </span>
                      </div>
                      <div className="rounded-2xl border border-black/10 bg-neutral-50 px-3 py-2 text-sm text-neutral-700">
                        ジャンル:{" "}
                        <span className="font-semibold text-black">
                          {genres.length}件
                        </span>
                      </div>
                      <div className="rounded-2xl border border-black/10 bg-neutral-50 px-3 py-2 text-sm text-neutral-700">
                        朗読許可:{" "}
                        <span className="font-semibold text-black">
                          {recordingPermissionLabel}
                        </span>
                      </div>
                      <div className="rounded-2xl border border-black/10 bg-neutral-50 px-3 py-2 text-sm text-neutral-700">
                        レビュー欄:{" "}
                        <span className="font-semibold text-black">
                          {reviewsEnabled ? "表示" : "非表示"}
                        </span>
                      </div>
                      <div className="rounded-2xl border border-black/10 bg-neutral-50 px-3 py-2 text-sm text-neutral-700">
                        コメント欄:{" "}
                        <span className="font-semibold text-black">
                          {episodeCommentsEnabled ? "表示" : "非表示"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {series?.id ? (
                    <div className="hidden">
                      <p className="text-xs tracking-[0.18em] text-neutral-500">
                        RELATED SETTINGS
                      </p>
                      <div className="mt-3 grid gap-3">
                        
                        <WorkspaceLinkCard
                          eyebrow="GENRES"
                          title="ジャンル管理"
                          description="作品genreの canonical source は series.genres。公開検索の genre 絞り込みや genre 棚の基準になる。"
                          href={`/write/series/${series.id}`}
                          cta="ジャンル管理へ"
                        />                        
                        <WorkspaceLinkCard
                          eyebrow="TAGS"
                          title="タグ管理"
                          description="作品タグは専用ページで編集する。ここでは状態だけ見せる。"
                          href={`/write/series/${series.id}`}
                          cta="タグ管理へ"
                        />
                        <WorkspaceLinkCard
                          eyebrow="RECORDING"
                          title="朗読許可管理"
                          description="第三者朗読の可否は専用ページで管理する。"
                          href={`/write/series/${series.id}`}
                          cta="朗読許可へ"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-black/10 bg-white p-3 text-sm leading-7 text-neutral-600">
                      まず作品を作成すると、タグ管理や朗読許可管理へ進めるようになる。
                    </div>
                  )}
                </div>
              </div>
            </section>

            {mode === "create" ? (
              <section className="rounded-[28px] border border-black/10 bg-neutral-50 p-5">
                <p className="text-xs tracking-[0.18em] text-neutral-500">FLOW</p>
                <h2 className="mt-2 text-xl font-semibold text-black">
                  初回作成フロー
                </h2>
                <div className="mt-4 grid gap-4 md:grid-cols-4">
                  <StepCard
                    step="STEP 1"
                    title="作品公開状態を決める"
                    description="まず作品全体を 公開 / 非公開 のどちらで持つか決める。"
                  />
                  <StepCard
                    step="STEP 2"
                    title="1話目の投稿状態を決める"
                    description="投稿 / 予約投稿 / 下書き保存 のどれで始めるか先に決める。"
                  />
                  <StepCard
                    step="STEP 3"
                    title="作品を作成して1話目へ進む"
                    description="作品作成後、そのまま1話目本文の作成へ入る。"
                  />
                  <StepCard
                    step="STEP 4"
                    title="ワークスペースで連続制作する"
                    description="下書きや予約投稿でもワークスペースに残り、次の話を続けて作れる。"
                  />
                </div>
              </section>
            ) : null}

            {series?.id ? (
              <section className="hidden">
                <div className="rounded-[28px] border border-black/10 bg-neutral-50 p-5">
                  <p className="text-xs tracking-[0.18em] text-neutral-500">EPISODES</p>
                  <p className="mt-2 text-3xl font-semibold text-black">
                    {sortedEpisodes.length}話
                  </p>
                  <p className="mt-2 text-sm text-neutral-600">
                    この作品に紐づく話数の合計
                  </p>
                </div>

                <div className="rounded-[28px] border border-black/10 bg-neutral-50 p-5">
                  <p className="text-xs tracking-[0.18em] text-neutral-500">POSTED</p>
                  <p className="mt-2 text-3xl font-semibold text-black">
                    {postedCount}話
                  </p>
                  <p className="mt-2 text-sm text-neutral-600">
                    投稿済みとして保存された話数
                  </p>
                </div>

                <div className="rounded-[28px] border border-black/10 bg-neutral-50 p-5">
                  <p className="text-xs tracking-[0.18em] text-neutral-500">SCHEDULED</p>
                  <p className="mt-2 text-3xl font-semibold text-black">
                    {scheduledCount}話
                  </p>
                  <p className="mt-2 text-sm text-neutral-600">
                    予約投稿として保存された話数
                  </p>
                </div>

                <div className="rounded-[28px] border border-black/10 bg-neutral-50 p-5">
                  <p className="text-xs tracking-[0.18em] text-neutral-500">DRAFT</p>
                  <p className="mt-2 text-3xl font-semibold text-black">
                    {draftCount}話
                  </p>
                  <p className="mt-2 text-sm text-neutral-600">
                    下書き保存の話数
                  </p>
                </div>
              </section>
            ) : null}

            {series?.id ? (
              <section className="grid gap-4">
                <div className="rounded-[28px] border border-black/10 bg-neutral-50 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs tracking-[0.18em] text-neutral-500">
                        EPISODE LIST
                      </p>
                      <h2 className="mt-2 text-xl font-semibold text-black">
                        この作品の話一覧
                      </h2>
                    </div>

                    <Link
                      href={`/write/series/${series.id}/episodes/new`}
                      className="rounded-full border border-black/10 bg-white/5 px-4 py-2.5 text-sm text-neutral-800 transition hover:bg-neutral-50"
                    >
                      話を追加
                    </Link>
                  </div>

                  <div className="mt-4 grid gap-3">
                    {sortedEpisodes.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-black/10 bg-white px-4 py-4 text-sm text-neutral-600">
                        まだ話はない。まずは1話目を作る。
                      </div>
                    ) : (
                      sortedEpisodes.map((episode) => {
                        const episodeNumber = getEpisodeNumber(episode);
                        const kind = getEpisodeStatusKind(episode);
                        const label = getEpisodeStatusLabel(episode);
                        const postingStatus = getEpisodePostingStatus(episode);

                        return (
                          <div
                            key={episode.id}
                            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-black/10 bg-white px-4 py-4"
                          >
                            <div>
                              <div className="flex flex-wrap items-center gap-3">
                                <p className="text-sm text-neutral-500">
                                  第{episodeNumber}話
                                </p>
                                <span
                                  className={`rounded-full border px-3 py-1 text-xs ${getEpisodeBadgeClass(
                                    kind
                                  )}`}
                                >
                                  {label}
                                </span>
                                {postingStatus === "scheduled" ? (
                                  <span className="text-xs text-neutral-500">
                                    時刻到達後に公開対象
                                  </span>
                                ) : null}
                              </div>

                              <p className="mt-2 text-base font-semibold text-black">
                                {pickText(episode.title) || `第${episodeNumber}話`}
                              </p>
                            </div>

                            <div className="ml-auto flex shrink-0 flex-wrap justify-end gap-3">
                           {postingStatus === "draft" ? (
                             <Link
                               href={`/write/series/${series.id}/episodes/${episode.id}`}
                               className="rounded-full border border-black/10 bg-white/5 px-4 py-2 text-sm text-neutral-800 transition hover:bg-neutral-50"
                             >
                               投稿 / 予約投稿へ
                             </Link>
                           ) : null}

                              <Link
                                href={`/write/series/${series.id}/episodes/${episode.id}`}
                                className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm text-neutral-800 transition hover:bg-neutral-50"
                              >
                                編集
                              </Link>

                              {episodeNumber > 0 && publicSurfaceReady && isEpisodePubliclyVisible(episode) ? (
                                <Link
                                  href={`/read/${series.id}/${episodeNumber}`}
                                  className="rounded-full border border-black/10 bg-white/5 px-4 py-2 text-sm text-neutral-800 transition hover:bg-neutral-50"
                                >
                                  読む
                                </Link>
                              ) : null}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                <div className="hidden">
                  <p className="text-xs tracking-[0.18em] text-neutral-500">NEXT STEP</p>
                  <h2 className="mt-2 text-xl font-semibold text-black">
                    この作品で次にやること
                  </h2>

                  {nextStepHref && nextStepLabel ? (
                    <>
                      <div className="mt-4 rounded-2xl border border-black/10 bg-white px-4 py-4">
                        <p className="text-base font-semibold text-black">
                          {nextStepLabel}
                        </p>
                        <p className="mt-2 text-sm leading-7 text-neutral-600">
                          {nextStepDescription}
                        </p>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <Link
                          href={nextStepHref}
                          className="rounded-full bg-white px-4 py-2.5 text-sm font-semibold text-black transition hover:opacity-90"
                        >
                          {nextStepLabel}
                        </Link>

                        <Link
                          href={`/write/series/${series.id}`}
                          className="rounded-full border border-black/10 bg-white/5 px-4 py-2.5 text-sm text-neutral-800 transition hover:bg-neutral-50"
                        >
                          既定演出設定ページ
                        </Link>
                      </div>
                    </>
                  ) : null}

                  <div className="mt-6 grid gap-3">
                    <div className="rounded-2xl border border-black/10 bg-white px-4 py-4">
                      <p className="text-sm font-semibold text-black">
                        作品公開状態はここで管理
                      </p>
                      <p className="mt-2 text-sm leading-7 text-neutral-600">
                        読者向け公開面に出すかどうかは、作品ワークスペース側で持つ。
                      </p>
                    </div>

                    <div className="rounded-2xl border border-black/10 bg-white px-4 py-4">
                      <p className="text-sm font-semibold text-black">
                        予約投稿と下書きもここに残る
                      </p>
                      <p className="mt-2 text-sm leading-7 text-neutral-600">
                        予約投稿や下書きでもワークスペースには即時表示し、そのまま次の話へ進める。
                      </p>
                    </div>

                    <div className="rounded-2xl border border-black/10 bg-white px-4 py-4">
                      <p className="text-sm font-semibold text-black">
                        読者向け公開は両条件が必要
                      </p>
                      <p className="mt-2 text-sm leading-7 text-neutral-600">
                        作品が公開で、かつ投稿済みまたは予約到達の話がある時だけ公開面に出る。
                      </p>
                    </div>
                  </div>
                </div>
              </section>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}
