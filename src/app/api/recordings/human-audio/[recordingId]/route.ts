import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import {
  getSeriesPublicationStatus,
  isEpisodePubliclyVisible,
  pickText,
  type EpisodeRow,
  type SeriesRow,
} from "@/features/write/writeShared";
import { isR18Series } from "@/lib/contentRating";
import { getCurrentR18ViewerPreference } from "@/lib/contentRatingServer";
import { isHumanRecordingRow } from "@/lib/recording/humanRecordingState";
import {
  getHumanRecordingAudioBucketName,
  getHumanRecordingStorageObjectPath,
} from "@/lib/recording/humanRecordingStorage";
import { buildNemoTimingObjectPathFromAudioObjectPath } from "@/lib/recording/nemoTiming";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/uuid";
import { streamAuthorizedPrivateRecording } from "@/lib/recording/privateMediaProxy";

export const runtime = "nodejs";

type RouteProps = {
  params: Promise<{ recordingId: string }>;
};

function resolveRequestedArtifact(rawValue: string): {
  recordingId: string;
  timing: boolean;
} {
  const value = decodeURIComponent(rawValue).trim();
  const suffix = ".timing.json";
  if (value.endsWith(suffix)) {
    return {
      recordingId: value.slice(0, -suffix.length),
      timing: true,
    };
  }
  return { recordingId: value, timing: false };
}

// This path uses the EXISTING Human GET handler, NOT a new API route.
// The G1 ledger is disposable-only and cannot be used by Preview/Production.
// Never fall through from a requested local test mode to the legacy publisher.
function isStrictIssue137LocalG1Get(request: Request): boolean {
  try {
    const site = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "");
    const db = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
    return process.env.NODE_ENV === "development" &&
      process.env.VERCEL_ENV !== "production" &&
      process.env.DO_NOT_CONTACT_PRODUCTION === "true" &&
      process.env.B2_EPHEMERAL_CONFIRM === "local-only" &&
      site.protocol === "http:" && site.hostname === "127.0.0.1" &&
      Number(site.port) >= 39000 && Number(site.port) <= 40000 &&
      site.pathname === "/" && !site.search && !site.hash &&
      request.headers.get("host") === site.host &&
      db.protocol === "http:" &&
      ["127.0.0.1", "localhost"].includes(db.hostname) &&
      ["54321", "54331"].includes(db.port) && db.pathname === "/" &&
      !db.search && !db.hash;
  } catch {
    return false;
  }
}

type Issue137G1Proof = {
  leaseId: string; ownerId: string; sessionId: string;
  bucket: string; path: string; objectId: string;
  sha256: string; size: number; version: number; state: string;
};

async function readIssue137G1LocalPrivateAudio(request: Request, leaseId: string) {
  const denied = () => new NextResponse(null, {
    status: 404, headers: { "Cache-Control": "private, no-store" },
  });
  if (!isStrictIssue137LocalG1Get(request) ||
      request.headers.has("range") || leaseId.includes(".")) return denied();
  const supabase = await createClient();
  const { data: userResult, error: userError } = await supabase.auth.getUser();
  const { data: sessionResult, error: sessionError } =
    await supabase.auth.getSession();
  const user = userResult.user;
  const token = sessionResult.session?.access_token;
  if (userError || sessionError || !user || !token) return denied();
  let issuedSessionId = "";
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
    if (payload.sub !== user.id) return denied();
    issuedSessionId = payload.session_id;
  } catch { return denied(); }
  if (!isUuid(issuedSessionId)) return denied();
  const admin = createAdminClient();
  async function checkedProof(): Promise<Issue137G1Proof | null> {
    const { data, error } = await admin.rpc("issue137_g1_local_http_preflight", {
      p_lease: leaseId, p_actor: user!.id, p_session: issuedSessionId,
    });
    if (error || !data || typeof data !== "object") return null;
    const p = data as Issue137G1Proof;
    const expectedPath = new RegExp(
      "^owner/" + user!.id + "/series/[a-f0-9-]{36}/episode/" +
      "[a-f0-9-]{36}/" + leaseId + "[.]wav$",
      "u"
    );
    if (p.leaseId !== leaseId || p.ownerId !== user!.id ||
        p.sessionId !== issuedSessionId ||
        p.bucket !== "f2p-tus-app-authority-local" ||
        p.state !== "PRIVATE_POINTER_ONLY" || p.version !== 1 ||
        !isUuid(p.objectId) || !expectedPath.test(p.path) ||
        typeof p.sha256 !== "string" || !/^[a-f0-9]{64}$/u.test(p.sha256) ||
        !Number.isSafeInteger(p.size) || p.size < 44 || p.size > 16777216)
      return null;
    return p;
  }
  const before = await checkedProof();
  if (!before) return denied();
  // No signed URL, no Range, no early streaming. The LOCAL <=16 MiB bound
  // permits complete verification BEFORE a single byte is returned.
  const db = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!);
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return denied();
  const path = before.path.split("/").map(encodeURIComponent).join("/");
  let bytes: Buffer;
  try {
    const upstream = await fetch(
      db.origin + "/storage/v1/object/authenticated/" +
      encodeURIComponent(before.bucket) + "/" + path,
      { headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey },
        redirect: "error", cache: "no-store", signal: AbortSignal.timeout(15000) }
    );
    const length = upstream.headers.get("content-length");
    if (upstream.status !== 200 || !upstream.body ||
        (length !== null && Number(length) !== before.size)) return denied();
    bytes = Buffer.from(await upstream.arrayBuffer());
  } catch { return denied(); }
  if (bytes.length !== before.size ||
      createHash("sha256").update(bytes).digest("hex") !== before.sha256)
    return denied();
  const after = await checkedProof();
  if (!after || JSON.stringify(after) !== JSON.stringify(before)) return denied();
  return new NextResponse(new Uint8Array(bytes), {
    status: 200, headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "Content-Type": "audio/wav",
      "X-Content-Type-Options": "nosniff",
      "Vary": "Cookie",
    },
  });
}

export async function GET(request: Request, { params }: RouteProps) {
  const { recordingId: rawRecordingId } = await params;
  const requested = resolveRequestedArtifact(rawRecordingId);

  if (!isUuid(requested.recordingId)) {
    return new NextResponse(null, { status: 404 });
  }
  // Deliberate isolated G1 mode: NEVER reclassify a staged pointer as PUBLIC.
  if (process.env.B2_G1_HTTP_GET_MODE === "enabled") {
    if (requested.timing) return new NextResponse(null, { status: 404 });
    return readIssue137G1LocalPrivateAudio(request, requested.recordingId);
  }

  const admin = createAdminClient();
  const { data: recordingData, error: recordingError } = await admin
    .from("recordings")
    .select("*")
    .eq("id", requested.recordingId)
    .maybeSingle();

  if (recordingError || !recordingData || !isHumanRecordingRow(recordingData)) {
    return new NextResponse(null, { status: 404 });
  }

  const row = recordingData as Record<string, unknown>;
  const seriesId = pickText(row.series_id, row.seriesId);
  const episodeId = pickText(row.episode_id, row.episodeId);
  const readerId = pickText(row.reader_id, row.reader_user_id, row.readerUserId);
  const isPublic = row.is_public === true;

  if (!seriesId || !episodeId || !readerId) {
    return new NextResponse(null, { status: 404 });
  }

  if (isPublic) {
    const [seriesResult, episodeResult] = await Promise.all([
      admin.from("series").select("*").eq("id", seriesId).maybeSingle(),
      admin.from("episodes").select("*").eq("id", episodeId).maybeSingle(),
    ]);

    if (
      seriesResult.error ||
      episodeResult.error ||
      !seriesResult.data ||
      !episodeResult.data
    ) {
      return new NextResponse(null, { status: 404 });
    }

    const series = seriesResult.data as SeriesRow;
    const episode = episodeResult.data as EpisodeRow;
    if (
      getSeriesPublicationStatus(series) !== "public" ||
      pickText(episode.series_id, episode["seriesId"]) !== seriesId ||
      !isEpisodePubliclyVisible(episode)
    ) {
      return new NextResponse(null, { status: 404 });
    }

    if (isR18Series(series)) {
      const preference = await getCurrentR18ViewerPreference();
      if (!preference.showR18Content) {
        return new NextResponse(null, { status: 404 });
      }
    }
  } else {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user || user.id !== readerId) {
      return new NextResponse(null, { status: 404 });
    }
  }

  const storedPath = pickText(row.audio_storage_path, row.audioStoragePath);
  const playbackObjectPath = getHumanRecordingStorageObjectPath(storedPath);
  if (!playbackObjectPath) {
    return new NextResponse(null, { status: 404 });
  }

  const objectPath = requested.timing
    ? buildNemoTimingObjectPathFromAudioObjectPath(playbackObjectPath)
    : playbackObjectPath;

  return streamAuthorizedPrivateRecording(
    request,
    getHumanRecordingAudioBucketName(),
    objectPath
  );
}
