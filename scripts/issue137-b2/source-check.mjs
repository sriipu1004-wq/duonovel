// SOURCE checks only. Dynamic local GoTrue/RLS/Storage E2E is separate.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const root = new URL("../../", import.meta.url);
const read = (name) => readFileSync(new URL(name, root), "utf8").replace(/\r\n/g, "\n");
const sql = read("supabase/migrations/20261026120000_issue137_b2_r18_boundary.sql");
const proxy = read("src/app/api/recordings/ai-audio/[recordingId]/route.ts");
const humanProxy = read("src/app/api/recordings/human-audio/[recordingId]/route.ts");
const stream = read("src/lib/recording/privateMediaProxy.ts");
const catalog = read("src/lib/publicWorks.ts");
const generator = read("src/lib/recording/nemoGeneration.ts");
const aivis = read("src/lib/recording/aivisGeneration.ts");
let checked = 0;
function must(source, label, snippet) {
  assert.ok(source.includes(snippet), label);
  checked++;
}
for (const [label, snippet] of [
  ["restrictive series", "on public.series\nas restrictive for select"],
  ["restrictive episode", "on public.episodes\nas restrictive for select"],
  ["restrictive recording", "on public.recordings\nas restrictive for select"],
  ["human translator grant not widened", "on public.episode_human_translations as restrictive for select"],
  ["server profile ON", "u.show_r18_content is true"],
  ["server confirmation", "u.r18_confirmed_at is not null"],
  ["effective warning R18", "'sexual_r18'=any"],
  ["new private bucket", "'r18-recording-audio','r18-recording-audio',false"],
  ["series media transition trigger", "create trigger issue137_b2_series_media_transition"],
  ["episode media transition trigger", "create trigger issue137_b2_episode_media_transition"],
  ["recording write trigger", "create trigger issue137_b2_recording_media_reference"],
  ["Storage public write trigger", "create trigger issue137_b2_public_audio_storage"],
  ["episode reparent hold", "create trigger issue137_b2_episode_reparenting"],
  ["Storage rename hold", "B2_PUBLIC_AUDIO_RENAME_HOLD"],
  ["unknown Storage prefix hold", "B2_UNCLASSIFIED_PUBLIC_AUDIO_PATH"],
  ["orphaned media", "public_audio_exists_for_series(new.id)"],
  ["narrator consumer restriction", "recordings.is_public is distinct from true"],
  ["series update race", "where id=new.series_id for share"],
  ["episode update race", "where id=new.episode_id for share"]
]) must(sql, label, snippet);
const fixture = read("scripts/issue137-b2/fixture.sql");
must(fixture,"real recordings.series_id NULLABLE","id uuid primary key, series_id uuid references public.series(id)");
assert.ok(!fixture.includes("id uuid primary key, series_id uuid not null references public.series(id)"),"fixture still diverges from Production");
const expected = "!~* '^[a-f0-9-]{36}" + "$" + "'";
assert.equal(sql.split(expected).length - 1, 2, "Storage UUID pattern lost SQL end-anchor");
checked++;
must(proxy, "authorization", "getCurrentR18ViewerPreference");
must(stream, "no cache", 'cache:"no-store"');
must(stream, "response no-store", "private, no-store");
must(proxy, "AI uses authorized streaming", "streamAuthorizedPrivateRecording");
must(humanProxy, "Human uses authorized streaming", "streamAuthorizedPrivateRecording");
assert.ok(!humanProxy.includes("createSignedUrl("), "Human playback must not issue signed bearer URLs");
must(proxy, "episode gate", 'e.posting_status!=="posted"');
must(catalog, "request scoped R18 listing", "getViewerR18Cards");
must(catalog, "anonymous general cards", 'const generalCards = cards.filter');
must(catalog, "all cards still viewer gated", 'if (visibility === "all") return visibleCards;');
must(sql, "F1 catalog epoch", "create table if not exists libread_internal.public_catalog_revision");
must(sql, "F1 series epoch", "create trigger issue137_b2_series_catalog_revision");
must(sql, "F1 episode epoch", "create trigger issue137_b2_episode_catalog_revision");
must(sql, "F1 author epoch", "create trigger issue137_b2_author_catalog_revision");
must(catalog, "F1 epoch double check", "readEpochGuardedCatalog(");
must(catalog, "F1 epoch-bound cache", "public-base-work-cards-v13-db-epoch-bound");
assert.ok(!catalog.includes('const cards = await getCachedPublicBaseWorkCardsInternal();'),
  "Forbidden: unsafe unversioned shared catalog fetch");
must(generator, "Nemo private bucket", "mustUsePrivateAiAudio(seriesId)");
must(aivis, "Aivis private bucket", "mustUsePrivateAiAudio(seriesId)");
assert.ok(!sql.includes("update storage.buckets set public"), "do not flip existing buckets");
assert.ok(!/delete\s+from\s+storage\.objects/i.test(sql), "do not delete existing objects");
console.log("PASS: " + checked + " B2 SOURCE security contracts; not authenticated E2E");
