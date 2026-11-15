// Issue #139 (rights): CLI for the narration move (see README.md).
//
//   node --import tsx scripts/issue139-us104a-audio-private/cli.ts <stage> [flags]
//
// stage: plan | copy | verify | delete-public | restore-public | verify-restore
// flags: --execute                 perform writes (otherwise dry-run)
//        --confirm-playback-checked  required by delete-public
//        --deep                    verify: SHA-256 both sides for unproven objects
//        --state <dir>             state directory (default .issue139-audio-state)
//        --concurrency <n>         copy workers (default 4)
//
// Credentials come only from the environment and are never printed:
//   NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL)  https://nyxbnccuvmlzffgtdadi.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY
import { createClient } from "@supabase/supabase-js";
import { streamPrivateMediaObject } from "../../src/lib/recording/privateMediaStream";
import {
  isPrivateAiNarrationPathForEpisode,
  parsePrivateAiNarrationReference,
} from "../../src/lib/recording/privateAiNarrationStorage";
import { buildNemoTimingObjectPathFromAudioObjectPath } from "../../src/lib/recording/nemoTiming";
import { PRIVATE_BUCKET, PROJECT_REF, TARGET_SERIES, privateReference } from "./lib.mjs";
import { copy, deletePublic, plan, verify } from "./core.mjs";

type Meta = { path: string; size: number; etag: string; mimetype: string };
type Row = { id: string; series_id: string; episode_id: string; path: string };

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(name);

const stage = process.argv[2];
const endpoint = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/u, "");
const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
if (endpoint !== `https://${PROJECT_REF}.supabase.co`) {
  console.error(`refused: Supabase URL must be https://${PROJECT_REF}.supabase.co`);
  process.exit(2);
}
if (!key) {
  console.error("refused: SUPABASE_SERVICE_ROLE_KEY is not set");
  process.exit(2);
}
const supabase = createClient(endpoint, key, { auth: { persistSession: false, autoRefreshToken: false } });
const log = (line: string) => console.log(line.split(key).join("[redacted]"));

const db = {
  async listTargetRecordings() {
    const { data, error } = await supabase
      .from("recordings")
      .select("id, series_id, episode_id, audio_storage_path, is_public")
      .in("series_id", [...TARGET_SERIES])
      .order("id")
      .range(0, 1999);
    if (error) throw new Error(`recordings_read_failed:${error.code ?? ""}`);
    return data ?? [];
  },
};

const storage = {
  async listFolder(bucket: string, folder: string): Promise<Meta[]> {
    const { data, error } = await supabase.storage.from(bucket).list(folder, { limit: 1000 });
    if (error) throw new Error(`list_failed:${bucket}:${folder}`);
    return (data ?? [])
      .flatMap((item) => {
        const meta = item.metadata as Record<string, unknown> | null;
        if (!item.id || !meta) return [];
        return [{
          path: `${folder}/${item.name}`,
          size: Number(meta.size),
          etag: String(meta.eTag ?? ""),
          mimetype: String(meta.mimetype ?? ""),
        }];
      });
  },
  async download(bucket: string, path: string): Promise<Uint8Array> {
    const { data, error } = await supabase.storage.from(bucket).download(path);
    if (error || !data) throw new Error(`download_failed:${bucket}:${path}`);
    return new Uint8Array(await data.arrayBuffer());
  },
  async upload(bucket: string, path: string, bytes: Uint8Array, contentType: string) {
    const { error } = await supabase.storage
      .from(bucket)
      .upload(path, bytes, { contentType, upsert: false, cacheControl: "3600" });
    if (error) throw new Error(`upload_failed:${bucket}:${path}:${error.message}`);
  },
  async remove(bucket: string, paths: string[]) {
    const { error } = await supabase.storage.from(bucket).remove(paths);
    if (error) throw new Error(`remove_failed:${bucket}`);
  },
};

/**
 * Proxy-shaped playback probe: the app's own reference parser and the exact
 * Storage request of /api/recordings/ai-audio/<id> (streamPrivateMediaObject),
 * for the wav (Range -> 206 audio/*) and its timing.json (200 JSON).
 * The viewer authorization half of the route is covered by the CI test.
 */
async function probe(row: Row) {
  const objectPath = parsePrivateAiNarrationReference(privateReference(row.path));
  if (!objectPath || !isPrivateAiNarrationPathForEpisode(objectPath, row.series_id, row.episode_id)) {
    return { ok: false, detail: "reference_rejected" };
  }
  const wav = await streamPrivateMediaObject({
    request: new Request("https://probe.invalid/", { headers: { Range: "bytes=0-1023" } }),
    bucket: PRIVATE_BUCKET,
    objectPath,
    endpoint,
    serviceKey: key,
  });
  await wav.body?.cancel().catch(() => undefined);
  const timing = await streamPrivateMediaObject({
    request: new Request("https://probe.invalid/"),
    bucket: PRIVATE_BUCKET,
    objectPath: buildNemoTimingObjectPathFromAudioObjectPath(objectPath),
    endpoint,
    serviceKey: key,
  });
  await timing.body?.cancel().catch(() => undefined);
  const ok =
    wav.status === 206 &&
    (wav.headers.get("content-type") ?? "").startsWith("audio/") &&
    timing.status === 200 &&
    timing.headers.get("content-type") === "application/json";
  return { ok, detail: `wav=${wav.status} timing=${timing.status}` };
}

async function anonymousStatus(url: string): Promise<number> {
  const response = await fetch(url, { method: "GET", headers: { Range: "bytes=0-0" }, cache: "no-store" });
  await response.body?.cancel().catch(() => undefined);
  return response.status;
}

async function main() {
  const stateDir = arg("--state") ?? ".issue139-audio-state";
  const common = { db, storage, stateDir, log };
  const execute = flag("--execute");
  switch (stage) {
    case "plan":
      return plan(common);
    case "copy":
      return copy({ ...common, execute, concurrency: Number(arg("--concurrency") ?? 4) });
    case "verify": {
      const result = await verify({ ...common, deep: flag("--deep"), probe });
      if (!result.ok) process.exitCode = 1;
      return result;
    }
    case "delete-public":
      return deletePublic({
        ...common,
        execute,
        confirmPlayback: flag("--confirm-playback-checked"),
        anonymousStatus,
        probe,
      });
    case "restore-public":
      return copy({ ...common, execute, direction: "restore", concurrency: Number(arg("--concurrency") ?? 4) });
    case "verify-restore": {
      const result = await verify({ ...common, direction: "restore", deep: flag("--deep") });
      if (!result.ok) process.exitCode = 1;
      return result;
    }
    default:
      console.error("stage: plan | copy | verify | delete-public | restore-public | verify-restore");
      process.exitCode = 2;
  }
}

main().catch((error: unknown) => {
  log(`ERROR ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
