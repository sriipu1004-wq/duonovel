import { createClient } from "@/lib/supabase/server";
import {
  buildWorkPath,
  requireRecordingEntryAccess,
  type RecordingPermissionMode,
} from "@/lib/recording/recordingEntry";
import { RecordingStudioPage } from "@/components/recording/RecordingStudioPage";
import {
  formatBgmSeconds,
  mergeBgmSettings,
  parseBgmSettingsFromRow,
} from "@/lib/bgm/bgmSettings";
import {
  getEpisodeBody,
  getEpisodeNumber,
  isPublishedEpisode,
  type EpisodeRow,
} from "@/features/write/writeShared";

type PageProps = {
  params: Promise<{ seriesId: string }>;
};

type RawRow = Record<string, unknown>;

function pickString(row: RawRow, keys: string[], fallback = ""): string {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return fallback;
}

function getPermissionLabel(mode: RecordingPermissionMode): string {
  if (mode === "open") return "自由朗読";
  if (mode === "approval_required") return "承認制";
  return "朗読停止";
}

function getPermissionDescription(mode: RecordingPermissionMode): string {
  if (mode === "open") {
    return "ログイン済みなら、そのまま朗読制作ページへ入れる。";
  }

  if (mode === "approval_required") {
    return "承認済みユーザーだけが、朗読制作ページへ入れる。";
  }

  return "この作品には入れない設定。作品ページへ戻す。";
}

export default async function RecordCreateSeriesPage({ params }: PageProps) {
  const { seriesId } = await params;
  const { seriesTitle, permissionMode, hasApprovedRequest } =
    await requireRecordingEntryAccess(seriesId);

  const supabase = await createClient();

  const { data: seriesRow } = await supabase
    .from("series")
    .select("*")
    .eq("id", seriesId)
    .maybeSingle();

  const { data: episodeRows, error: episodesError } = await supabase
    .from("episodes")
    .select("*")
    .eq("series_id", seriesId);

  if (episodesError) {
    console.error("Failed to load episodes for recording studio:", episodesError);
  }

  const rawSeries = ((seriesRow ?? {}) as RawRow) || {};
  const rawEpisodes = ((episodeRows ?? []) as RawRow[])
  .filter(Boolean)
  .filter((row) => isPublishedEpisode(row as EpisodeRow));

  const authorName = pickString(
    rawSeries,
    ["author_name", "display_name", "user_name", "pen_name"],
    ""
  );

  const summary = pickString(
    rawSeries,
    ["summary", "description", "catch_copy", "overview"],
    ""
  );

const episodes = rawEpisodes
  .map((row, index) => {
    const episode = row as EpisodeRow;
    const episodeNumber = getEpisodeNumber(episode) || index + 1;

    const title = pickString(
      row,
      ["title", "episode_title", "name"],
      `第${episodeNumber}話`
    );
    const body = getEpisodeBody(episode);
    const preview =
      body.trim().length > 140 ? `${body.trim().slice(0, 140)}...` : body.trim();

    const rawEpisodeBgmTitle = pickString(row, ["bgm_title", "bgmTitle"], "");
    const rawEpisodeBgmAudioPath = pickString(
      row,
      ["bgm_audio_path", "bgmAudioPath"],
      ""
    );

    const seriesBgmTitle = pickString(
      rawSeries,
      ["bgm_title", "bgmTitle"],
      ""
    );
    const seriesBgmAudioPath = pickString(
      rawSeries,
      ["bgm_audio_path", "bgmAudioPath"],
      ""
    );

    const seriesBgmSettings = parseBgmSettingsFromRow(
      rawSeries["bgm_settings"],
      rawSeries["bgmSettings"]
    );
    const episodeBgmSettings = parseBgmSettingsFromRow(
      row["bgm_settings"],
      row["bgmSettings"]
    );
    const mergedBgmSettings = mergeBgmSettings(
      seriesBgmSettings,
      episodeBgmSettings
    );

    const effectiveBgmTitle = rawEpisodeBgmTitle || seriesBgmTitle;
    const effectiveBgmAudioPath = rawEpisodeBgmAudioPath || seriesBgmAudioPath;

    const bgmSummary = effectiveBgmAudioPath
      ? `${effectiveBgmTitle || "BGMあり"} / IN ${formatBgmSeconds(
          mergedBgmSettings.fadeInSeconds
        )} / OUT ${formatBgmSeconds(mergedBgmSettings.fadeOutSeconds)}`
      : "BGM未設定";

    return {
      id: String(row.id ?? `${seriesId}-${episodeNumber}`),
      episodeNumber,
      title,
      body,
      preview,
      readHref: `/read/${seriesId}/${episodeNumber}`,
      bgmSummary,
    };
  })
  .sort((a, b) => a.episodeNumber - b.episodeNumber);

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-neutral-100">
      <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <section className="mb-6 overflow-hidden rounded-[32px] border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] shadow-2xl">
          <div className="border-b border-white/10 px-5 py-6 sm:px-8">
            <p className="text-xs tracking-[0.22em] text-neutral-500">
              LIB READ RECORDING STUDIO
            </p>

            <h1 className="mt-3 text-3xl font-bold text-white sm:text-4xl">
              {seriesTitle}
            </h1>

            {authorName ? (
              <p className="mt-3 text-sm text-neutral-400">作者: {authorName}</p>
            ) : null}

            <p className="mt-4 max-w-4xl text-sm leading-7 text-neutral-300 sm:text-base">
              ここでは作品本文を見ながら、朗読制作を進められる。
              今回はブラウザ録音・既存音声アップロード・publish 接続の最小導線を先に通し、音声形式整理や高度な編集は次段へ回す。
            </p>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-neutral-300">
                許可状態: {getPermissionLabel(permissionMode)}
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-neutral-300">
                話数: {episodes.length}話
              </span>
              {permissionMode === "approval_required" ? (
                <span className="rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-sm text-amber-200">
                  承認状態: {hasApprovedRequest ? "approved" : "未承認"}
                </span>
              ) : null}
            </div>

            <p className="mt-3 text-sm leading-7 text-neutral-400">
              {getPermissionDescription(permissionMode)}
            </p>

            {summary ? (
              <div className="mt-5 rounded-[24px] border border-white/10 bg-black/20 p-4">
                <p className="text-xs tracking-[0.18em] text-neutral-500">SUMMARY</p>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-neutral-300">
                  {summary}
                </p>
              </div>
            ) : null}
          </div>
        </section>

        <RecordingStudioPage
          seriesId={seriesId}
          seriesTitle={seriesTitle}
          permissionMode={permissionMode}
          worksHref={buildWorkPath(seriesId)}
          bgmHref={`/bgm?from=record-create&seriesId=${seriesId}`}
          episodes={episodes}
          manageBgmHref={`/manage/bgm/${seriesId}`}
        />
      </div>
    </main>
  );
}