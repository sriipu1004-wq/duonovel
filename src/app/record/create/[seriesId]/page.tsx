import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { RecordingLegalFooter } from "@/components/recording/RecordingLegalFooter";
import {
  buildRecordingEntryPath,
  buildWorkPath,
  requireRecordingEntryAccess,
  type RecordingPermissionMode,
} from "@/lib/recording/recordingEntry";
import {
  buildRecordingConsentPath,
  RECORDING_GLOBAL_CONSENT_KEY,
  RECORDING_GLOBAL_CONSENT_VERSION,
} from "@/lib/recording/recordingConsent";
import { RecordingStudioPage } from "@/components/recording/RecordingStudioPage";
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
type RecordingRow = Record<string, unknown> & {
  id?: string | null;
  episode_id?: string | null;
  episodeId?: string | null;
  series_id?: string | null;
  seriesId?: string | null;
  reader_id?: string | null;
  reader_user_id?: string | null;
  readerUserId?: string | null;
  reader_name?: string | null;
  narrator_name?: string | null;
  display_name?: string | null;
  speaker_name?: string | null;
  audio_storage_path?: string | null;
  audioStoragePath?: string | null;
  is_public?: boolean | null;
  isPublic?: boolean | null;
  created_at?: string | null;
};

type ExistingRecordingSeed = {
  id: string;
  episodeId: string;
  audioStoragePath: string;
  readerName: string;
  isPublic: boolean;
};

type PublicUserRow = Record<string, unknown> & {
  display_name?: string | null;
  username?: string | null;
  pen_name?: string | null;
  name?: string | null;
};

const adminSupabase = createAdminClient();

function pickString(row: RawRow, keys: string[], fallback = ""): string {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return fallback;
}

function pickBoolean(row: RawRow, keys: string[], fallback = true): boolean {
  for (const key of keys) {
    const value = row[key];

    if (typeof value === "boolean") {
      return value;
    }

    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();

      if (["false", "0", "private", "非公開"].includes(normalized)) {
        return false;
      }

      if (["true", "1", "public", "公開"].includes(normalized)) {
        return true;
      }
    }
  }

  return fallback;
}

function getPermissionLabel(mode: RecordingPermissionMode): string {
  if (mode === "open") return "自由朗読";
  if (mode === "approval_required") return "承認制";
  return "朗読停止";
}

function resolveCurrentUserReaderName(
  user: {
    email?: string | null;
    user_metadata?: Record<string, unknown> | null;
  } | null,
  publicUserRow?: PublicUserRow | null
): string {
  const fromPublicUser = pickString(
    (publicUserRow ?? {}) as RawRow,
    ["display_name", "username", "pen_name", "name"],
    ""
  );

  if (fromPublicUser) {
    return fromPublicUser;
  }

  const metadata = user?.user_metadata ?? {};

  const fromMetadata =
    (typeof metadata.display_name === "string" && metadata.display_name.trim()) ||
    (typeof metadata.name === "string" && metadata.name.trim()) ||
    (typeof metadata.full_name === "string" && metadata.full_name.trim()) ||
    "";

  if (fromMetadata) {
    return fromMetadata;
  }

  const email = typeof user?.email === "string" ? user.email.trim() : "";
  if (email.includes("@")) {
    return email.split("@")[0] || "ユーザー朗読";
  }

  return "ユーザー朗読";
}

async function fetchExistingRecordingsForSeriesUser(
  seriesId: string,
  userId: string | null
): Promise<ExistingRecordingSeed[]> {
  if (!userId) {
    return [];
  }

  const tries = [
    () =>
      adminSupabase
        .from("recordings")
        .select("*")
        .eq("series_id", seriesId)
        .eq("reader_id", userId)
        .order("created_at", { ascending: false }),
    () =>
      adminSupabase
        .from("recordings")
        .select("*")
        .eq("series_id", seriesId)
        .eq("reader_user_id", userId)
        .order("created_at", { ascending: false }),
    () =>
      adminSupabase
        .from("recordings")
        .select("*")
        .eq("seriesId", seriesId)
        .eq("readerUserId", userId)
        .order("created_at", { ascending: false }),
  ];

  for (const run of tries) {
    const { data, error } = await run();

    if (error) {
      continue;
    }

    const rows = (data ?? []) as RecordingRow[];
    const seenEpisodeIds = new Set<string>();
    const results: ExistingRecordingSeed[] = [];

    for (const row of rows) {
      const recordingId = pickString(row, ["id"]);
      const episodeId = pickString(row, ["episode_id", "episodeId"]);
      const audioStoragePath = pickString(row, [
        "audio_storage_path",
        "audioStoragePath",
      ]);
      const readerName = pickString(
        row,
        ["reader_name", "narrator_name", "display_name", "speaker_name"],
        ""
      );
      const isPublic = pickBoolean(row, ["is_public", "isPublic"], true);

      if (!recordingId || !episodeId || !audioStoragePath || seenEpisodeIds.has(episodeId)) {
        continue;
      }

      seenEpisodeIds.add(episodeId);
      results.push({
        id: recordingId,
        episodeId,
        audioStoragePath,
        readerName,
        isPublic,
      });
    }

    return results;
  }

  return [];
}

export default async function RecordCreateSeriesPage({ params }: PageProps) {
  const { seriesId } = await params;
  const {
    seriesTitle,
    permissionMode,
    hasApprovedRequest,
    userId,
  } = await requireRecordingEntryAccess(seriesId);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: consentRow, error: consentError } = await supabase
    .from("user_recording_consents")
    .select("consent_version")
    .eq("user_id", userId)
    .eq("consent_key", RECORDING_GLOBAL_CONSENT_KEY)
    .maybeSingle();

  if (consentError) {
    throw new Error(`recording consent lookup failed: ${consentError.message}`);
  }

  const acceptedConsentVersion = pickString(
    (consentRow ?? {}) as RawRow,
    ["consent_version"]
  );

  if (acceptedConsentVersion !== RECORDING_GLOBAL_CONSENT_VERSION) {
    redirect(buildRecordingConsentPath(buildRecordingEntryPath(seriesId)));
  }

  const { data: publicUserRow } = await supabase
    .from("users")
    .select("display_name, username, pen_name, name")
    .eq("id", user?.id ?? userId)
    .maybeSingle();  

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
        body.trim().length > 88 ? `${body.trim().slice(0, 88)}...` : body.trim();

      return {
        id: String(row.id ?? `${seriesId}-${episodeNumber}`),
        episodeNumber,
        title,
        body,
        preview,
        readHref: `/read/${seriesId}/${episodeNumber}`,
      };
    })
    .sort((a, b) => a.episodeNumber - b.episodeNumber);

  const existingRecordings = await fetchExistingRecordingsForSeriesUser(
    seriesId,
    user?.id ?? userId
  );

  const fixedReaderName = resolveCurrentUserReaderName(
    user,
    (publicUserRow as PublicUserRow | null) ?? null
  );

  return (
    <main className="min-h-screen bg-[#f4f4f4] text-black">
      <div className="mx-auto w-full max-w-7xl px-3 py-5 sm:px-6 lg:px-8">
        <section className="mb-6 w-full max-w-full rounded-[28px] border border-black/10 bg-white shadow-sm">
          <div className="border-b border-black/10 px-4 py-6 sm:px-8">
            <p className="text-xs tracking-[0.22em] text-neutral-500">
              LIB READ RECORDING STUDIO
            </p>

            <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="break-words text-3xl font-bold text-black sm:text-4xl">
                  {seriesTitle}
                </h1>

                {authorName ? (
                  <p className="mt-3 text-sm text-neutral-500">作者: {authorName}</p>
                ) : null}

                <p className="mt-4 max-w-4xl text-sm leading-7 text-neutral-600 sm:text-base">
                  ここでは作品本文を見ながら、朗読制作を進められる。
                  当サイトでの録音・既存音声アップロードも可能。
                </p>

                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <span className="rounded-full border border-black/10 bg-neutral-50 px-3 py-1 text-sm text-neutral-700">
                    許可状態: {getPermissionLabel(permissionMode)}
                  </span>
                  <span className="rounded-full border border-black/10 bg-neutral-50 px-3 py-1 text-sm text-neutral-700">
                    話数: {episodes.length}話
                  </span>
                  {permissionMode === "approval_required" ? (
                    <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-sm text-black">
                      承認状態: {hasApprovedRequest ? "approved" : "未承認"}
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <a
                  href={buildWorkPath(seriesId)}
                  className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm text-neutral-700 transition hover:bg-neutral-50"
                >
                  作品ページへ
                </a>
              </div>
            </div>
          </div>
        </section>

        <RecordingStudioPage
          seriesId={seriesId}
          seriesTitle={seriesTitle}
          permissionMode={permissionMode}
          worksHref={buildWorkPath(seriesId)}
          episodes={episodes}
          existingRecordings={existingRecordings}
          fixedReaderName={fixedReaderName}
        />

        <div className="mt-6">
          <RecordingLegalFooter />
        </div>
      </div>
    </main>
  );
}