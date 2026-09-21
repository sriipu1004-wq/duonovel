import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  OFFICIAL_ACCOUNT_EMAIL,
  isOfficialAccountEmail,
} from "../../src/lib/auth/officialAccount";
import { loadLocalEnvironment } from "./runtime";

async function main() {
const args = process.argv.slice(2);
const writeSnapshot = args.includes("--write-snapshot");
loadLocalEnvironment();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for read-only Official audit"
  );
}

const admin = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let officialUserId: string | null = null;
for (let page = 1; page <= 20 && !officialUserId; page += 1) {
  const result = await admin.auth.admin.listUsers({ page, perPage: 100 });
  if (result.error) throw new Error(result.error.message);
  officialUserId =
    result.data.users.find((user) => isOfficialAccountEmail(user.email))?.id ?? null;
  if (result.data.users.length < 100) break;
}
if (!officialUserId) {
  throw new Error(`Official account not found: ${OFFICIAL_ACCOUNT_EMAIL}`);
}

const seriesResult = await admin
  .from("series")
  .select(
    "id,title,created_at,is_public,publication_status,source_language,translation_permission_mode,recording_permission_mode,tags,effect_settings"
  )
  .eq("author_id", officialUserId)
  .order("created_at", { ascending: true });
if (seriesResult.error) throw new Error(seriesResult.error.message);

const seriesRows = seriesResult.data ?? [];
const ids = seriesRows.map((row) => String(row.id));
const episodeCounts = new Map<
  string,
  { total: number; published: number; draft: number }
>();
const episodeTitles = new Map<string, string[]>();
for (const id of ids) {
  episodeCounts.set(id, { total: 0, published: 0, draft: 0 });
  episodeTitles.set(id, []);
}

for (let offset = 0; offset < ids.length; offset += 50) {
  const batchIds = ids.slice(offset, offset + 50);
  if (batchIds.length === 0) continue;
  const episodes = await admin
    .from("episodes")
    .select("series_id,title,is_published,posting_status")
    .in("series_id", batchIds);
  if (episodes.error) throw new Error(episodes.error.message);
  for (const episode of episodes.data ?? []) {
    const id = String(episode.series_id);
    const count = episodeCounts.get(id);
    if (!count) continue;
    count.total += 1;
    if (episode.is_published === true) count.published += 1;
    if (episode.posting_status === "draft") count.draft += 1;
    if (typeof episode.title === "string" && episode.title.trim()) {
      episodeTitles.get(id)?.push(episode.title.trim());
    }
  }
}

function publicDomainMetadata(effectSettings: unknown): Record<string, unknown> | null {
  if (
    effectSettings &&
    typeof effectSettings === "object" &&
    !Array.isArray(effectSettings)
  ) {
    const value = (effectSettings as Record<string, unknown>).publicDomain;
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  }
  return null;
}

const series = seriesRows.map((row) => {
  const id = String(row.id);
  const counts = episodeCounts.get(id) ?? { total: 0, published: 0, draft: 0 };
  const pd = publicDomainMetadata(row.effect_settings);
  return {
    title: row.title,
    created_at: row.created_at,
    publication_status: row.publication_status,
    is_public: row.is_public,
    source_language: row.source_language,
    translation_permission_mode: row.translation_permission_mode,
    recording_permission_mode: row.recording_permission_mode,
    episode_count: counts.total,
    published_episode_count: counts.published,
    draft_episode_count: counts.draft,
    public_domain_manifest_id:
      typeof pd?.manifestId === "string" ? pd.manifestId : null,
    public_domain_source_hash:
      typeof pd?.sourceHash === "string" ? pd.sourceHash : null,
  };
});

const snapshot = {
  generated_at: new Date().toISOString(),
  account: "LIB read Official",
  official_identity: OFFICIAL_ACCOUNT_EMAIL,
  contained_titles: Array.from(
    new Set(
      seriesRows.flatMap((row) =>
        typeof row.title === "string" && row.title.endsWith("・短編")
          ? episodeTitles.get(String(row.id)) ?? []
          : []
      )
    )
  ),
  summary: {
    series_count: series.length,
    public_series_count: series.filter(
      (row) => row.publication_status === "public" || row.is_public === true
    ).length,
    source_language_missing_count: series.filter(
      (row) => !row.source_language
    ).length,
    rights_manifest_missing_count: series.filter(
      (row) => !row.public_domain_manifest_id
    ).length,
    total_episode_count: series.reduce(
      (sum, row) => sum + row.episode_count,
      0
    ),
  },
  series,
};

console.log(JSON.stringify(snapshot, null, 2));

if (writeSnapshot) {
  const date = new Date().toISOString().slice(0, 10);
  const path = resolve(
    process.cwd(),
    `public-domain/audits/official-production-${date}.json`
  );
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  console.error(`Snapshot written: ${path}`);
}

console.error("READ-ONLY AUDIT COMPLETE: no database rows were modified.");

}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
