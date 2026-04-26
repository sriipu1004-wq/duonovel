import Link from "next/link";
import { notFound } from "next/navigation";
import PublicWorkBoardCard from "@/components/public/PublicWorkBoardCard";
import { supabase } from "@/lib/supabaseClient";
import { getCachedPublicBaseWorkCards } from "@/lib/publicWorks";
import ContinueReadingButton from "@/features/bookmark/ContinueReadingButton";
import FavoriteBookmarkButton from "@/features/bookmark/FavoriteBookmarkButton";
import SeriesReactionButton from "@/features/rating/SeriesReactionButton";
import SeriesReviewSection from "@/features/review/SeriesReviewSection";
import {
  getEpisodeNumber,
  getEpisodePostedAtValue,
  getEpisodeLastEditedAtValue,
  getSeriesPublicationStatus,
  getSeriesSummary,
  isEpisodePubliclyVisible,
  isSeriesReviewVisible,
  pickText,
  sortEpisodes,
  type EpisodeRow,
  type RecordingPermissionMode,
  type SeriesRow,
} from "@/features/write/writeShared";
import { NemoAutoGenerationBootstrap } from "@/components/recording/NemoAutoGenerationBootstrap";
import { createAdminClient } from "@/lib/supabase/admin";
import ReaderCardControls from "@/components/recording/ReaderCardControls";
import ContinueReadingEpisodeList from "@/components/works/ContinueReadingEpisodeList";
import WorkPagePrefetcher from "@/components/works/WorkPagePrefetcher";
import { resolveNemoAutoGenerationConfig } from "@/lib/recording/nemoAutoGeneration";
import ReaderSelectionBootstrap from "@/components/recording/ReaderSelectionBootstrap";
import PublicAdSlot from "@/components/ads/PublicAdSlot";
import { buildReaderAuthorHref } from "@/lib/readerAuthorHref";
import { createClient as createServerClient } from "@/lib/supabase/server";
import ReaderCardLikeButton from "@/components/recording/ReaderCardLikeButton";
import { fetchReaderCardLikeSnapshotMap } from "@/lib/readerCardLike";

type PageProps = {
  params: Promise<{ seriesId: string }>;
  searchParams?: Promise<{
    tab?: string;
    readerKey?: string;
    readerName?: string;
    range?: string;
  }>;
};

type UserRow = Record<string, unknown> & {
  id: string;
  display_name?: string | null;
  username?: string | null;
  pen_name?: string | null;
  name?: string | null;
};

type RecordingVoiceModelRow = {
  display_name?: string | null;
  name?: string | null;
  tags?: string[] | null;
};

type RecordingRow = Record<string, unknown> & {
  id: string;
  series_id?: string | null;
  seriesId?: string | null;
  reader_id?: string | null;
  reader_user_id?: string | null;
  readerUserId?: string | null;
  reader_name?: string | null;
  narrator_name?: string | null;
  display_name?: string | null;
  speaker_name?: string | null;
  description?: string | null;
  reader_comment?: string | null;
  tags?: string[] | string | null;
  like_count?: number | null;
  likes_count?: number | null;
  play_count?: number | null;
  plays_count?: number | null;
  is_public?: boolean | null;
  public?: boolean | null;
  allow_download?: boolean | null;
  episode_id?: string | null;
  episodeId?: string | null;
  audio_storage_path?: string | null;
  audioStoragePath?: string | null;
  voice_model_id?: string | null;
  voiceModelId?: string | null;
  voice_models?: RecordingVoiceModelRow | RecordingVoiceModelRow[] | null;
};

type ReaderCard = {
  readerKey: string;
  name: string;
  rank: number;
  tags: string[];
  description: string;
  totalLikes: number;
  totalPlays: number;
  recordingCount: number;
  allowDownload: boolean;
  demoAudioUrl: string;
};

type RelatedWorkCard = {
  seriesId: string;
  title: string;
  summary: string;
  authorName: string;
  authorId: string | null;
  firstEpisodeNumber: number | null;
  latestPostedLabel: string;
  tags: string[];
  latestPostedAtValue: number;
};

const adminSupabase = createAdminClient();

const WORK_PAGE_RECORDING_SELECT = `
  id,
  series_id,
  reader_id,
  reader_user_id,
  reader_name,
  narrator_name,
  display_name,
  speaker_name,
  description,
  reader_comment,
  tags,
  like_count,
  likes_count,
  play_count,
  plays_count,
  is_public,
  allow_download,
  episode_id,
  audio_storage_path,
  voice_model_id,
  created_at,
  voice_models (
    display_name,
    name,
    tags
  )
`;

function isPublicRecording(recording: RecordingRow): boolean {
  if (recording.is_public === false) return false;
  if (recording.public === false) return false;
  return true;
}

function getRecordingLikes(recording: RecordingRow): number {
  const raw = recording.like_count ?? recording.likes_count ?? 0;
  if (typeof raw === "number") return raw;
  const parsed = Number(raw);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function getRecordingPlays(recording: RecordingRow): number {
  const raw = recording.play_count ?? recording.plays_count ?? 0;
  if (typeof raw === "number") return raw;
  const parsed = Number(raw);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function parseTags(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw
      .map((tag) => String(tag).trim())
      .filter((tag) => tag.length > 0)
      .map((tag) => (tag.startsWith("#") ? tag : `#${tag}`));
  }

  if (typeof raw === "string" && raw.trim().length > 0) {
    return raw
      .split(/[,、\s]+/)
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0)
      .map((tag) => (tag.startsWith("#") ? tag : `#${tag}`));
  }

  return [];
}

function uniqueTags(tags: string[]): string[] {
  return Array.from(new Set(tags));
}

function getSyntheticReaderTags(name: string): string[] {
  if (name === "VOICEVOX Nemo / ノーマル") {
    return ["#自動朗読", "#女性", "#落ち着き"];
  }

  if (name === "Aivis コハク") {
    return ["#自動朗読", "#女の子", "#甘め"];
  }

  if (name === "Aivis まお") {
    return ["#自動朗読", "#女の子", "#小悪魔"];
  }

  if (name === "Aivis にせ") {
    return ["#自動朗読", "#男の子", "#優しめ"];
  }

  if (name === "Aivis 阿井田 茂") {
    return ["#自動朗読", "#男性", "#バリトン"];
  }  

  if (name.startsWith("Aivis ") || name.startsWith("VOICEVOX Nemo")) {
    return ["#自動朗読"];
  }

  return [];
}

function getRecordingVoiceModel(recording: RecordingRow): RecordingVoiceModelRow | null {
  const raw = recording.voice_models;

  if (Array.isArray(raw)) {
    return raw[0] ?? null;
  }

  return raw ?? null;
}

function getVoiceModelTags(recording: RecordingRow): string[] {
  const voiceModel = getRecordingVoiceModel(recording);
  const tags = voiceModel?.tags;

  if (!Array.isArray(tags)) {
    return [];
  }

  return tags
    .map((tag) => String(tag).trim())
    .filter((tag) => tag.length > 0)
    .map((tag) => (tag.startsWith("#") ? tag : `#${tag}`));
}

function getVoiceModelDisplayName(recording: RecordingRow): string {
  const voiceModel = getRecordingVoiceModel(recording);

  return pickText(voiceModel?.display_name, voiceModel?.name);
}

function getSeriesTags(series: SeriesRow): string[] {
  const candidates = [
    series["tags"],
    series["tag_list"],
    series["tagList"],
  ];

  for (const candidate of candidates) {
    const parsed = parseTags(candidate);
    if (parsed.length > 0) {
      return parsed;
    }
  }

  return [];
}

function buildReadHref(
  seriesId: string,
  episodeNumber: number,
  readerKey?: string,
  readerName?: string
): string {
  const query = new URLSearchParams();

  if (readerKey) query.set("readerKey", readerKey);
  if (readerName) query.set("readerName", readerName);

  const queryString = query.toString();
  return `/read/${seriesId}/${episodeNumber}${queryString ? `?${queryString}` : ""}`;
}

function buildWorksHref(
  seriesId: string,
  tab: "toc" | "readers",
  readerKey?: string,
  readerName?: string,
  rangeStart?: number
): string {
  const query = new URLSearchParams();
  query.set("tab", tab);

  if (readerKey) query.set("readerKey", readerKey);
  if (readerName) query.set("readerName", readerName);
  if (typeof rangeStart === "number" && Number.isFinite(rangeStart)) {
    query.set("range", String(rangeStart));
  }

  return `/works/${seriesId}?${query.toString()}`;
}

function buildAuthorHref(authorId: string): string {
  return `/authors/${encodeURIComponent(authorId)}`;
}

function getRecordingPermissionLabel(
  mode: RecordingPermissionMode | null | undefined
): string {
  if (mode === "open") return "無条件許可";
  if (mode === "approval_required") return "承認制";
  return "非許可";
}

function getRecordingPermissionDescription(
  mode: RecordingPermissionMode | null | undefined
): string {
  if (mode === "open") {
    return "朗読制作を募集している。";
  }
  if (mode === "approval_required") {
    return "申請と承認後に朗読制作へ進む。";
  }
  return "第三者朗読の募集は行っていない。";
}

function getRecordingPermissionBadgeClass(
  mode: RecordingPermissionMode | null | undefined
): string {
  if (mode === "open") {
    return "border-sky-200 bg-sky-50 text-black";
  }
  if (mode === "approval_required") {
    return "border-black/10 bg-neutral-100 text-neutral-700";
  }
  return "border-black/10 bg-white text-neutral-600";
}

function resolveRecordingPermissionMode(value: unknown): RecordingPermissionMode {
  if (value === "open") return "open";
  if (value === "approval_required") return "approval_required";
  return "closed";
}

async function fetchEpisodesBySeriesId(seriesId: string): Promise<EpisodeRow[]> {
  const firstTry = await supabase
    .from("episodes")
    .select("*")
    .eq("series_id", seriesId);

  if (!firstTry.error) {
    return (firstTry.data ?? []) as EpisodeRow[];
  }

  const secondTry = await supabase
    .from("episodes")
    .select("*")
    .eq("seriesId", seriesId);

  if (secondTry.error) {
    throw new Error(`episodes の取得に失敗: ${secondTry.error.message}`);
  }

  return (secondTry.data ?? []) as EpisodeRow[];
}

async function fetchRecordingsByEpisodeIds(episodeIds: string[]): Promise<{
  recordings: RecordingRow[];
  fetchErrorMessage: string | null;
}> {
  if (episodeIds.length === 0) {
    return {
      recordings: [],
      fetchErrorMessage: null,
    };
  }

  const firstTry = await adminSupabase
    .from("recordings")
    .select(WORK_PAGE_RECORDING_SELECT)
    .in("episode_id", episodeIds)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  if (!firstTry.error) {
    return {
      recordings: ((firstTry.data ?? []) as RecordingRow[]).filter(isPublicRecording),
      fetchErrorMessage: null,
    };
  }

  const secondTry = await adminSupabase
    .from("recordings")
    .select(WORK_PAGE_RECORDING_SELECT)
    .in("episodeId", episodeIds)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  if (!secondTry.error) {
    return {
      recordings: ((secondTry.data ?? []) as RecordingRow[]).filter(isPublicRecording),
      fetchErrorMessage: null,
    };
  }

  const fallbackFirstTry = await adminSupabase
    .from("recordings")
    .select("*")
    .in("episode_id", episodeIds)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  if (!fallbackFirstTry.error) {
    return {
      recordings: ((fallbackFirstTry.data ?? []) as RecordingRow[]).filter(
        isPublicRecording
      ),
      fetchErrorMessage: null,
    };
  }

  const fallbackSecondTry = await adminSupabase
    .from("recordings")
    .select("*")
    .in("episodeId", episodeIds)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  if (!fallbackSecondTry.error) {
    return {
      recordings: ((fallbackSecondTry.data ?? []) as RecordingRow[]).filter(
        isPublicRecording
      ),
      fetchErrorMessage: null,
    };
  }

  return {
    recordings: [],
    fetchErrorMessage: `recordings の取得に失敗: ${fallbackSecondTry.error.message}`,
  };
}

function isNemoReaderName(name: string): boolean {
  return name.startsWith("VOICEVOX Nemo");
}

function isAivisReaderName(name: string): boolean {
  return name.startsWith("Aivis ");
}

function getCanonicalAivisReaderKey(name: string): string {
  return `aivis:${name}`;
}

function getRecordingReaderName(recording: RecordingRow): string {
  return (
    pickText(
      recording.reader_name,
      recording.narrator_name,
      recording.display_name,
      recording.speaker_name
    ) || "名称未設定"
  );
}

function getCanonicalNemoReaderKey(name: string): string {
  return `nemo:${name}`;
}

function getRecordingReaderKey(recording: RecordingRow): string {
  const name = getRecordingReaderName(recording);

  if (isNemoReaderName(name)) {
    return getCanonicalNemoReaderKey(name);
  }

  if (isAivisReaderName(name)) {
    return getCanonicalAivisReaderKey(name);
  }

  return (
    pickText(
      recording.reader_id,
      recording.reader_user_id,
      recording.readerUserId,
      recording.reader_name,
      recording.narrator_name,
      recording.display_name,
      recording.speaker_name,
      recording.id
    ) || recording.id
  );
}

function getRecordingAudioStoragePath(recording: RecordingRow): string {
  return pickText(recording.audio_storage_path, recording.audioStoragePath);
}

function getRecordingReaderId(recording: RecordingRow): string {
  return pickText(
    recording.reader_id,
    recording.reader_user_id,
    recording.readerUserId
  );
}

function doesRecordingMatchRequestedReader(
  recording: RecordingRow,
  requestedReaderKey?: string,
  requestedReaderName?: string
): boolean {
  const hasRequestedReader = Boolean(
    pickText(requestedReaderKey, requestedReaderName)
  );

  if (!hasRequestedReader) {
    return false;
  }

  const readerKey = getRecordingReaderKey(recording);
  const readerName = getRecordingReaderName(recording);

  if (requestedReaderKey) {
    if (readerKey === requestedReaderKey || readerName === requestedReaderKey) {
      return true;
    }
  }

  if (requestedReaderName) {
    if (readerName === requestedReaderName) {
      return true;
    }
  }

  return false;
}

function isNemoAutogenRecording(
  recording: RecordingRow,
  config: { userId: string; narratorName: string }
): boolean {
  return (
    getRecordingReaderId(recording) === config.userId ||
    getRecordingReaderName(recording) === config.narratorName
  );
}

function resolveAutoNarrationBadge(args: {
  permissionMode: RecordingPermissionMode;
  totalEpisodeCount: number;
  generatedEpisodeCount: number;
  hasConfig: boolean;
}): {
  label: string;
  className: string;
} {
  const { permissionMode, totalEpisodeCount, generatedEpisodeCount, hasConfig } =
    args;

  if (permissionMode !== "open") {
    return {
      label: "自動朗読停止",
      className: "border-black/10 bg-neutral-100 text-neutral-700",
    };
  }

  if (!hasConfig) {
    return {
      label: "自動朗読未設定",
      className: "border-amber-200 bg-amber-50 text-amber-700",
    };
  }

  if (generatedEpisodeCount <= 0) {
    return {
      label: `自動朗読生成待ち 0/${totalEpisodeCount}`,
      className: "border-black/10 bg-neutral-100 text-neutral-700",
    };
  }

  if (generatedEpisodeCount < totalEpisodeCount) {
    return {
      label: `自動朗読生成中 ${generatedEpisodeCount}/${totalEpisodeCount}`,
      className: "border-sky-200 bg-sky-50 text-black",
    };
  }

  return {
    label: `自動朗読生成済み ${generatedEpisodeCount}/${totalEpisodeCount}`,
    className: "border-sky-200 bg-sky-50 text-black",
  };
}

function getRecordingEpisodeId(recording: RecordingRow): string {
  return pickText(recording.episode_id, recording.episodeId);
}

function normalizeRequestedReaderKey(
  readerKey?: string,
  readerName?: string
): string {
  const normalizedName = pickText(readerName);

  if (normalizedName && isNemoReaderName(normalizedName)) {
    return getCanonicalNemoReaderKey(normalizedName);
  }

  const normalizedKey = pickText(readerKey);

  if (normalizedKey.startsWith("nemo:")) {
    return normalizedKey;
  }

  return normalizedKey;
}

function buildReaderCards(
  recordings: RecordingRow[],
  episodeNumberById: Map<string, number>
): ReaderCard[] {
  const grouped = new Map<
    string,
    {
      key: string;
      name: string;
      description: string;
      totalLikes: number;
      totalPlays: number;
      recordingCount: number;
      allowDownload: boolean;
      tagMap: Map<string, number>;
      demoAudioUrl: string;
      demoEpisodeNumber: number;
    }
  >();

  for (const recording of recordings) {
    const name =
      getVoiceModelDisplayName(recording) || getRecordingReaderName(recording);
    const key =
      pickText(recording.voice_model_id, recording.voiceModelId) ||
      getRecordingReaderKey(recording);
    const audioStoragePath = getRecordingAudioStoragePath(recording);
    const episodeId = getRecordingEpisodeId(recording);
    const episodeNumber =
      episodeNumberById.get(episodeId) ?? Number.MAX_SAFE_INTEGER;

    const existing = grouped.get(key) ?? {
      key,
      name,
      description: pickText(recording.description, recording.reader_comment) || "",
      totalLikes: 0,
      totalPlays: 0,
      recordingCount: 0,
      allowDownload: false,
      tagMap: new Map<string, number>(),
      demoAudioUrl: "",
      demoEpisodeNumber: Number.MAX_SAFE_INTEGER,
    };

    existing.totalLikes += getRecordingLikes(recording);
    existing.totalPlays += getRecordingPlays(recording);
    existing.recordingCount += 1;
    existing.allowDownload = existing.allowDownload || recording.allow_download === true;

    const tags = uniqueTags([
      ...getVoiceModelTags(recording),
      ...parseTags(recording.tags),
      ...getSyntheticReaderTags(name),
    ]);
    for (const tag of tags) {
      existing.tagMap.set(tag, (existing.tagMap.get(tag) ?? 0) + 1);
    }

    if (!existing.description) {
      existing.description = pickText(recording.description, recording.reader_comment) || "";
    }

    if (
      audioStoragePath &&
      episodeNumber < existing.demoEpisodeNumber
    ) {
      existing.demoAudioUrl = audioStoragePath;
      existing.demoEpisodeNumber = episodeNumber;
    }

    grouped.set(key, existing);
  }

  return Array.from(grouped.values())
    .sort((a, b) => {
      if (b.totalLikes !== a.totalLikes) return b.totalLikes - a.totalLikes;
      if (b.totalPlays !== a.totalPlays) return b.totalPlays - a.totalPlays;
      return a.name.localeCompare(b.name, "ja");
    })
    .map((reader, index) => ({
      readerKey: reader.key,
      name: reader.name,
      rank: index + 1,
      tags: Array.from(reader.tagMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([tag]) => tag),
      description:
        reader.description ||
        `公開朗読 ${reader.recordingCount}件 / いいね ${reader.totalLikes} / 再生 ${reader.totalPlays}`,
      totalLikes: reader.totalLikes,
      totalPlays: reader.totalPlays,
      recordingCount: reader.recordingCount,
      allowDownload: reader.allowDownload,
      demoAudioUrl: reader.demoAudioUrl,
    }));
}

function formatEpisodeDate(value: string): string {
  if (!value) return "";

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";

  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(parsed);
}

function InfoActionRow({
  label,
  value,
  disabled,
}: {
  label: string;
  value: string;
  disabled?: boolean;
}) {
  return (
    <div
      className={[
        "flex items-center justify-between rounded-2xl border px-4 py-3 text-sm",
        disabled
          ? "border-black/10 bg-neutral-50 text-neutral-500"
          : "border-black/10 bg-white text-neutral-800",
      ].join(" ")}
    >
      <span className="text-neutral-600">{label}</span>
      <span className="font-medium text-black">{value}</span>
    </div>
  );
}

function buildRangeOptions(total: number) {
  const options: Array<{ start: number; end: number; label: string }> = [];

  for (let start = 1; start <= total; start += 50) {
    const end = Math.min(start + 49, total);
    options.push({
      start,
      end,
      label: `${start}話-${end}話`,
    });
  }

  return options;
}

export default async function WorkPage({ params, searchParams }: PageProps) {
  const { seriesId } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const currentTab = resolvedSearchParams?.tab === "readers" ? "readers" : "toc";

  const selectedReaderName = pickText(resolvedSearchParams?.readerName);
  const selectedReaderKey = normalizeRequestedReaderKey(
    resolvedSearchParams?.readerKey,
    selectedReaderName
  );

  const authSupabase = await createServerClient();
  const {
    data: { user: currentUser },
  } = await authSupabase.auth.getUser();

  const { data: seriesData, error: seriesError } = await supabase
    .from("series")
    .select("*")
    .eq("id", seriesId)
    .single();

  if (seriesError) {
    if (seriesError.code === "PGRST116") {
      notFound();
    }
    throw new Error(`series の取得に失敗: ${seriesError.message}`);
  }

  if (!seriesData) {
    notFound();
  }

  const series = seriesData as SeriesRow;
  if (getSeriesPublicationStatus(series) !== "public") {
    notFound();
  }

  const authorId = pickText(
    series.author_id,
    series["user_id"],
    series["userId"]
  ) || null;

  let author: UserRow | null = null;

  if (authorId) {
    const { data: userData } = await supabase
      .from("users")
      .select("*")
      .eq("id", authorId)
      .maybeSingle();

    if (userData) {
      author = userData as UserRow;
    }
  }

  const rawEpisodes = await fetchEpisodesBySeriesId(seriesId);
  const episodes = sortEpisodes(
    rawEpisodes.filter((episode) => isEpisodePubliclyVisible(episode))
  );

  if (episodes.length === 0) {
    notFound();
  }

  const firstEpisode = episodes[0] ?? null;
  const firstEpisodeNumber = firstEpisode ? getEpisodeNumber(firstEpisode) : null;

  const currentRangeRaw = Number(resolvedSearchParams?.range ?? 1);
  const currentRangeStart =
    Number.isFinite(currentRangeRaw) && currentRangeRaw > 0
      ? Math.floor((currentRangeRaw - 1) / 50) * 50 + 1
      : 1;

  const visibleEpisodes = episodes.slice(currentRangeStart - 1, currentRangeStart - 1 + 50);
  const rangeOptions = buildRangeOptions(episodes.length);

  const recordingPermissionMode = resolveRecordingPermissionMode(
    series.recording_permission_mode
  );

  if (recordingPermissionMode === "open") {
  }

  const requestedReaderSpecified = Boolean(
    pickText(selectedReaderKey, selectedReaderName)
  );

  const shouldFetchRecordings =
    currentTab === "readers" ||
    requestedReaderSpecified ||
    recordingPermissionMode === "open";

  const episodeIds = episodes.map((episode) => episode.id);

  const { recordings, fetchErrorMessage } = shouldFetchRecordings
    ? await fetchRecordingsByEpisodeIds(episodeIds)
    : {
        recordings: [],
        fetchErrorMessage: null,
      };

  const episodeNumberById = new Map(
    episodes.map((episode) => [episode.id, getEpisodeNumber(episode)])
  );
  const readerCards = buildReaderCards(recordings, episodeNumberById);

  const selectedReaderEpisodeIdSet = new Set(
    requestedReaderSpecified
      ? recordings
          .filter((recording) =>
            doesRecordingMatchRequestedReader(
              recording,
              selectedReaderKey,
              selectedReaderName
            )
          )
          .map((recording) => getRecordingEpisodeId(recording))
          .filter((value) => value.length > 0)
      : []
  );

  const nemoAutogenConfig = resolveNemoAutoGenerationConfig();

  const nemoGeneratedEpisodeIdSet = new Set(
    nemoAutogenConfig
      ? recordings
          .filter((recording) =>
            isNemoAutogenRecording(recording, nemoAutogenConfig)
          )
          .map((recording) => getRecordingEpisodeId(recording))
          .filter((value) => value.length > 0)
      : []
  );

  const autoNarrationBadge = resolveAutoNarrationBadge({
    permissionMode: recordingPermissionMode,
    totalEpisodeCount: episodes.length,
    generatedEpisodeCount: nemoGeneratedEpisodeIdSet.size,
    hasConfig: !!nemoAutogenConfig,
  });

  const selectedReaderLabel =
    pickText(selectedReaderName, selectedReaderKey) || "";  

  const displayedReaderCards = (() => {
    if (recordingPermissionMode !== "open" || !nemoAutogenConfig) {
      return readerCards;
    }

    const existingNemoReader =
      readerCards.find((reader) => isNemoReaderName(reader.name)) ?? null;

    const syntheticNemoReader: ReaderCard = existingNemoReader ?? {
      readerKey: getCanonicalNemoReaderKey(nemoAutogenConfig.narratorName),
      name: nemoAutogenConfig.narratorName,
      rank: 0,
      tags: ["#自動朗読"],
      description: autoNarrationBadge.label,
      totalLikes: 0,
      totalPlays: 0,
      recordingCount: 0,
      allowDownload: false,
      demoAudioUrl: "",
    };

    const mergedNemoReader: ReaderCard = {
      ...syntheticNemoReader,
      tags:
        syntheticNemoReader.tags.length > 0
          ? syntheticNemoReader.tags
          : ["#自動朗読"],
      description:
        syntheticNemoReader.recordingCount > 0
          ? `${autoNarrationBadge.label} / 公開朗読 ${syntheticNemoReader.recordingCount}件 / いいね ${syntheticNemoReader.totalLikes} / 再生 ${syntheticNemoReader.totalPlays}`
          : autoNarrationBadge.label,
    };

    return [
      mergedNemoReader,
      ...readerCards.filter((reader) => !isNemoReaderName(reader.name)),
    ];
  })().map((reader, index) => ({
    ...reader,
    rank: index + 1,
  }));  

  const readerCardLikeSnapshotMap = await fetchReaderCardLikeSnapshotMap({
    supabase: adminSupabase,
    seriesId,
    readerKeys: displayedReaderCards.map((reader) => reader.readerKey),
    currentUserId: currentUser?.id ?? null,
  });  

  const allPublicBaseWorks = await getCachedPublicBaseWorkCards();

  const relatedBase: Array<RelatedWorkCard & { sameAuthor: boolean }> =
    allPublicBaseWorks
      .filter((item) => item.seriesId !== seriesId)
      .map((item) => ({
        seriesId: item.seriesId,
        title: item.title,
        summary: item.summary,
        authorName: item.authorName,
        authorId: item.authorId,
        firstEpisodeNumber: item.firstEpisodeNumber,
        latestPostedLabel: item.latestPostedLabel,
        tags: item.tags,
        latestPostedAtValue: item.latestPostedAtValue,
        sameAuthor: item.authorId !== null && item.authorId === authorId,
      }));

  const authorOtherWorks = relatedBase
    .filter((item) => item.sameAuthor)
    .sort((a, b) => b.latestPostedAtValue - a.latestPostedAtValue)
    .slice(0, 4);

  const similarWorks = relatedBase
    .filter((item) => !item.sameAuthor)
    .sort((a, b) => b.latestPostedAtValue - a.latestPostedAtValue)
    .slice(0, 4);

  const seriesTitle = pickText(series.title) || "無題";
  const authorName =
    pickText(
      author?.display_name,
      author?.pen_name,
      author?.username,
      author?.name,
      series["author_name"]
    ) || "作者名未設定";

  const summary = getSeriesSummary(series) || "あらすじはまだ登録されていません。";
  const loginHref = `/login?next=${encodeURIComponent(buildWorksHref(seriesId, currentTab, selectedReaderKey, selectedReaderName, currentRangeStart))}`;

  const reviewsVisible = isSeriesReviewVisible(series);

  return (
    <main className="min-h-screen bg-white text-black">
      <ReaderSelectionBootstrap
        seriesId={seriesId}
        currentTab={currentTab}
        currentRangeStart={currentRangeStart}
        currentReaderKey={selectedReaderKey}
        currentReaderName={selectedReaderName}
      /> 
      <WorkPagePrefetcher
        seriesId={seriesId}
        currentTab={currentTab}
        currentRangeStart={currentRangeStart}
        selectedReaderKey={selectedReaderKey || undefined}
        selectedReaderName={selectedReaderName || undefined}
      />
      <div className="mx-auto w-full max-w-6xl px-4 pb-16 pt-6 sm:px-6 lg:px-8">
        <div className="mb-4 text-sm text-neutral-500">
          <Link href="/" className="hover:text-black">
            TOP
          </Link>
          <span className="mx-2">/</span>
          <span className="text-neutral-700">作品ページ</span>
        </div>

        <section className="overflow-hidden rounded-[28px] border border-black/10 bg-white shadow-sm sm:rounded-[32px]">
          <div className="border-b border-black/10 px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
            <p className="text-[11px] tracking-[0.25em] text-neutral-500">WORK PAGE</p>

            <h1 className="mt-3 text-2xl font-bold leading-tight text-black sm:text-3xl xl:text-4xl">
              {seriesTitle}
            </h1>

            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-neutral-600">
              <span>作者</span>
              {authorId ? (
                <Link
                  href={buildAuthorHref(authorId)}
                  className="rounded-full border border-black/10 bg-neutral-50 px-3 py-1 text-neutral-800 transition hover:border-sky-200 hover:bg-sky-50"
                >
                  {authorName}
                </Link>
              ) : (
                <span className="rounded-full border border-black/10 bg-neutral-50 px-3 py-1 text-neutral-800">
                  {authorName}
                </span>
              )}

              {requestedReaderSpecified && selectedReaderLabel ? (
                <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-black">
                  選択中朗読者: {selectedReaderLabel}
                </span>
              ) : null}
            </div>

            <p className="mt-5 whitespace-pre-wrap text-sm leading-8 text-neutral-700 sm:text-[15px]">
              {summary}
            </p>

            <div className="mt-5 flex flex-wrap items-center gap-2.5">
              {firstEpisodeNumber !== null ? (
                <Link
                  href={buildReadHref(
                    seriesId,
                    firstEpisodeNumber,
                    selectedReaderKey,
                    selectedReaderName
                  )}
                  className="rounded-full border border-black/10 bg-neutral-200 px-4 py-2.5 text-sm font-medium text-black transition hover:bg-neutral-300"
                >
                  第1話から読む
                </Link>
              ) : (
                <span className="rounded-full border border-black/10 bg-neutral-50 px-4 py-2.5 text-sm text-neutral-500">
                  公開話なし
                </span>
              )}

              <ContinueReadingButton
                seriesId={seriesId}
                fallbackEpisodeNumber={firstEpisodeNumber}
                fallbackReaderKey={selectedReaderKey}
                fallbackReaderName={selectedReaderName}
              />

              <FavoriteBookmarkButton seriesId={seriesId} />
              <SeriesReactionButton seriesId={seriesId} loginHref={loginHref} />
            </div>
          </div>

          <div className="px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
            <section className="rounded-[24px] border border-black/10 bg-white p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] tracking-[0.18em] text-neutral-500">
                    INDEX / READERS
                  </p>
                  <h2 className="mt-2 text-lg font-semibold text-black">
                    目次 / 朗読者
                  </h2>
                </div>

                <div className="flex flex-col items-end gap-2">
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={buildWorksHref(
                        seriesId,
                        "toc",
                        selectedReaderKey,
                        selectedReaderName,
                        currentRangeStart
                      )}
                      className={[
                        "rounded-full border px-4 py-2 text-sm font-medium transition",
                        currentTab === "toc"
                          ? "border-sky-200 bg-sky-50 text-black"
                          : "border-black/10 bg-white text-neutral-700 hover:bg-neutral-50",
                      ].join(" ")}
                    >
                      目次
                    </Link>
                    <Link
                      href={buildWorksHref(
                        seriesId,
                        "readers",
                        selectedReaderKey,
                        selectedReaderName,
                        currentRangeStart
                      )}
                      className={[
                        "rounded-full border px-4 py-2 text-sm font-medium transition",
                        currentTab === "readers"
                          ? "border-sky-200 bg-sky-50 text-black"
                          : "border-black/10 bg-white text-neutral-700 hover:bg-neutral-50",
                      ].join(" ")}
                    >
                      朗読者
                    </Link>
                  </div>

                  {currentTab === "toc" ? (
                    <div className="flex flex-wrap justify-end gap-2">
                      {rangeOptions.map((range) => (
                        <Link
                          key={range.start}
                          href={buildWorksHref(
                            seriesId,
                            "toc",
                            selectedReaderKey,
                            selectedReaderName,
                            range.start
                          )}
                          className={[
                            "rounded-full border px-3 py-1.5 text-xs transition",
                            range.start === currentRangeStart
                              ? "border-sky-200 bg-sky-50 text-black"
                              : "border-black/10 bg-white text-neutral-600 hover:bg-neutral-50",
                          ].join(" ")}
                        >
                          {range.label}
                        </Link>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>

              {currentTab === "toc" ? (
                <div className="mt-5">
                  <ContinueReadingEpisodeList
                    seriesId={seriesId}
                    episodes={visibleEpisodes.map((episode) => {
                      const episodeNumber = getEpisodeNumber(episode);
                      const episodeTitle =
                        pickText(episode.title, episode["episode_title"]) ||
                        `第${episodeNumber}話`;

                      const postedDate = formatEpisodeDate(
                        getEpisodePostedAtValue(episode)
                      );
                      const editedDate = formatEpisodeDate(
                        getEpisodeLastEditedAtValue(episode)
                      );

                      return {
                        id: episode.id,
                        episodeNumber,
                        episodeTitle,
                        postedDate,
                        editedDate,
                        href: buildReadHref(
                          seriesId,
                          episodeNumber,
                          selectedReaderKey,
                          selectedReaderName
                        ),
                        readerAvailability: requestedReaderSpecified
                          ? selectedReaderEpisodeIdSet.has(episode.id)
                            ? "has_recording"
                            : "no_recording"
                          : null,                        
                      };
                    })}
                  />
                </div>
              ) : (
                <div className="mt-5 grid gap-3">
                  {fetchErrorMessage ? (
                    <div className="rounded-[20px] border border-black/10 bg-neutral-100 p-4 text-sm leading-7 text-neutral-700">
                      {fetchErrorMessage}
                    </div>
                  ) : null}

                  {displayedReaderCards.length === 0 ? (
                    <div className="rounded-[20px] border border-dashed border-black/15 bg-neutral-50 p-5 text-sm leading-7 text-neutral-600">
                      まだ公開中の朗読がない。
                    </div>
                  ) : (
                    displayedReaderCards.map((reader) => {
                      const isSelected =
                        selectedReaderKey === reader.readerKey ||
                        selectedReaderName === reader.name;

                      return (
                        <div
                          key={reader.readerKey}
                          className={[
                            "rounded-[20px] border p-4",
                            isSelected
                              ? "border-sky-200 bg-sky-50/60"
                              : "border-black/10 bg-neutral-50",
                          ].join(" ")}
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="rounded-full border border-black/10 bg-white px-3 py-1 text-sm font-semibold text-black">
                                  #{reader.rank}
                                </span>

                                <Link
                                  href={buildReaderAuthorHref(reader.readerKey, reader.name)}
                                  className="text-base font-semibold text-black transition hover:text-neutral-700"
                                >
                                  {reader.name}
                                </Link>

                                <ReaderCardLikeButton
                                  seriesId={seriesId}
                                  readerKey={reader.readerKey}
                                  initialLikeCount={
                                    readerCardLikeSnapshotMap.get(reader.readerKey)
                                      ?.likeCount ?? 0
                                  }
                                  initialIsLiked={
                                    readerCardLikeSnapshotMap.get(reader.readerKey)
                                      ?.isLiked ?? false
                                  }
                                  loginHref={loginHref}
                                />
                              </div>

                              <div className="mt-3 flex flex-wrap gap-2">
                                {reader.tags.length > 0 ? (
                                  reader.tags.map((tag) => (
                                    <span
                                      key={tag}
                                      className="rounded-full border border-black/10 bg-white px-3 py-1 text-sm text-neutral-700"
                                    >
                                      {tag}
                                    </span>
                                  ))
                                ) : (
                                  <span className="rounded-full border border-black/10 bg-white px-3 py-1 text-sm text-neutral-500">
                                    タグ未設定
                                  </span>
                                )}
                              </div>
                            </div>

                            <ReaderCardControls
                              seriesId={seriesId}
                              readerKey={reader.readerKey}
                              readerName={reader.name}
                              isSelected={isSelected}
                              demoAudioUrl={reader.demoAudioUrl}
                              currentTab="readers"
                              currentRangeStart={currentRangeStart}
                            />
                          </div>

                          <p className="mt-4 text-sm leading-7 text-neutral-600">
                            {reader.description}
                          </p>

                          <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-neutral-500">
                            {isNemoReaderName(reader.name) ? (
                              <span
                                className={[
                                  "rounded-full border px-3 py-1",
                                  autoNarrationBadge.className,
                                ].join(" ")}
                              >
                                {autoNarrationBadge.label}
                              </span>
                            ) : null}                            
                            <span className="rounded-full border border-black/10 bg-white px-3 py-1">
                              公開朗読 {reader.recordingCount}件
                            </span>
                            <span className="rounded-full border border-black/10 bg-white px-3 py-1">
                              いいね {reader.totalLikes}
                            </span>
                            <span className="rounded-full border border-black/10 bg-white px-3 py-1">
                              再生 {reader.totalPlays}
                            </span>
                            <span className="rounded-full border border-black/10 bg-white px-3 py-1">
                              DL {reader.allowDownload ? "可" : "不可"}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </section>
          </div>
        </section>

        {reviewsVisible ? (
          <div className="mt-8">
            <SeriesReviewSection seriesId={seriesId} loginHref={loginHref} />
          </div>
        ) : null}

        <section className="mt-8 grid gap-4 xl:grid-cols-2">
          <div className="rounded-[24px] border border-black/10 bg-white p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] tracking-[0.18em] text-neutral-500">
                  AUTHOR OTHER WORKS
                </p>
                <h2 className="mt-2 text-lg font-semibold text-black">
                  作者の他作品
                </h2>
              </div>
              <span className="rounded-full border border-black/10 bg-neutral-50 px-3 py-1 text-[11px] text-neutral-600">
                {authorOtherWorks.length}件
              </span>
            </div>

            <div className="mt-4 grid gap-3">
              {authorOtherWorks.length === 0 ? (
                <div className="rounded-[20px] border border-dashed border-black/15 bg-neutral-50 p-4 text-sm leading-7 text-neutral-600">
                  まだ他の公開作品はない。
                </div>
              ) : (
                authorOtherWorks.map((work) => (
                  <PublicWorkBoardCard
                    key={work.seriesId}
                    title={work.title}
                    workHref={`/works/${work.seriesId}`}
                    authorName={work.authorName}
                    authorHref={work.authorId ? buildAuthorHref(work.authorId) : undefined}
                    latestPostedLabel={work.latestPostedLabel}
                    summary={work.summary}
                    firstReadHref={
                      work.firstEpisodeNumber
                        ? `/read/${work.seriesId}/${work.firstEpisodeNumber}`
                        : undefined
                    }
                    tags={work.tags}
                  />
                ))
              )}
            </div>
          </div>

          <div className="rounded-[24px] border border-black/10 bg-white p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] tracking-[0.18em] text-neutral-500">
                  SIMILAR WORKS
                </p>
                <h2 className="mt-2 text-lg font-semibold text-black">
                  類似作品おすすめ
                </h2>
              </div>
              <span className="rounded-full border border-black/10 bg-neutral-50 px-3 py-1 text-[11px] text-neutral-600">
                {similarWorks.length}件
              </span>
            </div>

            <div className="mt-4 grid gap-3">
              {similarWorks.length === 0 ? (
                <div className="rounded-[20px] border border-dashed border-black/15 bg-neutral-50 p-4 text-sm leading-7 text-neutral-600">
                  まだ候補に出せる公開作品がない。
                </div>
              ) : (
                similarWorks.map((work) => (
                  <PublicWorkBoardCard
                    key={work.seriesId}
                    title={work.title}
                    workHref={`/works/${work.seriesId}`}
                    authorName={work.authorName}
                    authorHref={work.authorId ? buildAuthorHref(work.authorId) : undefined}
                    latestPostedLabel={work.latestPostedLabel}
                    summary={work.summary}
                    firstReadHref={
                      work.firstEpisodeNumber
                        ? `/read/${work.seriesId}/${work.firstEpisodeNumber}`
                        : undefined
                    }
                    tags={work.tags}
                  />
                ))
              )}
            </div>
          </div>
        </section>

        <section className="mt-8 rounded-[24px] border border-black/10 bg-white p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] tracking-[0.18em] text-neutral-500">
                ABOUT THIS WORK
              </p>
              <h2 className="mt-2 text-lg font-semibold text-black">
                この作品について
              </h2>
            </div>

            <span className="rounded-full border border-black/10 bg-neutral-50 px-3 py-1 text-[11px] text-neutral-500">
              INFO
            </span>
          </div>

          <div className="mt-4 grid gap-3 xl:grid-cols-2">
            <div className="rounded-2xl border border-black/10 bg-neutral-50 px-4 py-3">
              <p className="text-sm text-neutral-500">作者</p>
              <p className="mt-2 text-sm font-medium text-black">{authorName}</p>
            </div>

            <div className="rounded-2xl border border-black/10 bg-neutral-50 px-4 py-3">
              <p className="text-sm text-neutral-500">朗読可否</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span
                  className={[
                    "rounded-full border px-3 py-1 text-sm",
                    getRecordingPermissionBadgeClass(recordingPermissionMode),
                  ].join(" ")}
                >
                  {getRecordingPermissionLabel(recordingPermissionMode)}
                </span>
              </div>
              <p className="mt-3 text-sm leading-7 text-neutral-600">
                {getRecordingPermissionDescription(recordingPermissionMode)}
              </p>
            </div>

            <InfoActionRow label="朗読出力" value="準備中" disabled />
            <InfoActionRow label="本文PDF化" value="準備中" disabled />
          </div>
        </section>

        <section className="mt-8">
          <PublicAdSlot
            slotId="work-bottom"
            title="広告掲載予定"
            description="作品ページでは本文導線と朗読導線を見終えた後の最下部に限定して配置する。目次、朗読者切替、レビュー操作の近くには置かない。"
            minHeightClassName="min-h-[132px]"
          />
        </section>
      </div>
    </main>
  );
}