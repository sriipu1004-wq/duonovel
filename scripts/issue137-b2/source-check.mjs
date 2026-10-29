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
const readerPage = read("src/app/read/[seriesId]/[episodeNumber]/page.tsx");
const workPage = read("src/app/works/[seriesId]/page.tsx");
const protectedOptions = read("src/lib/recording/protectedAiRecordingOptions.ts");
const readerProducer = read("src/lib/publicRead.ts");
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
  ["episode update race", "where id=new.episode_id for share"],
  ["F2 private Human proof", "create or replace function libread_internal.is_verified_private_human_recording("],
  ["F2 private bucket", "b.id='human-recording-audio' and b.public is false"],
  ["F2 storage-object match", "and o.name=p_path"],
  ["F2 explicit public alias rejection", "o.bucket_id='recording-audio' and o.name=p_path"],
  ["F2-P all public bucket audio detection", "B2_UNMONITORED_PUBLIC_AUDIO_HOLD"],
  ["F2-P cross bucket public predicate", "if bucket_is_public is true and ("],
  ["F2-P MIME predicate", "new.metadata->>'mimetype'"],
  ["F2-P monitored unknown path insufficient-privileges SQLSTATE", "errcode='42501',message='B2_UNCLASSIFIED_PUBLIC_AUDIO_PATH'"],
  ["F2-P metadata update guard", "before insert or update of bucket_id,name,metadata on storage.objects"],
  ["F2-P private bucket trigger", "create trigger issue137_b2_bucket_publicity"],
  ["F2-P protected audio privacy", "B2_PRIVATE_AUDIO_BUCKET_PUBLIC_HOLD"],
  ["F2-P nonempty private bucket HOLD", "B2_NONEMPTY_BUCKET_PUBLIC_HOLD"],
  ["F2-P object writer SHARE lock", "where b.id=new.bucket_id for share"]
]) must(sql, label, snippet);
const runLocal = read("scripts/issue137-b2/run-local.sh");
const bucketRace = read("scripts/issue137-b2/bucket-publicity-race-local.sh");
must(runLocal, "F2-P genuine DB lock race runner connected", 'bash "$B2/bucket-publicity-race-local.sh" "$db_container"');
must(bucketRace, "F2-P first direction test SQLSTATE", "no 55P03 bucket-waits-for-writer evidence");
must(bucketRace, "F2-P second direction test SQLSTATE", "no 55P03 writer-waits-for-bucket evidence");
const fixture = read("scripts/issue137-b2/fixture.sql");
const episodesTable = fixture.split("create table public.episodes (")[1]?.split(");")[0] ?? "";
const recordingsTable = fixture.split("create table public.recordings (")[1]?.split(");")[0] ?? "";
must(episodesTable,"real episodes.series_id NOT NULL","series_id uuid not null references public.series(id)");
must(recordingsTable,"real recordings.series_id NULLABLE","series_id uuid references public.series(id)");
assert.ok(!recordingsTable.includes("series_id uuid not null"),"recordings FK must remain nullable");
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
must(sql, "F1 catalog epoch", "create table if not exists libread_internal.public_catalog_revision");
must(sql, "F1 series epoch", "create trigger issue137_b2_series_catalog_revision");
must(sql, "F1 episode epoch", "create trigger issue137_b2_episode_catalog_revision");
must(sql, "F1 author epoch", "create trigger issue137_b2_author_catalog_revision");
must(catalog, "F1 epoch double check", "readEpochGuardedCatalog(");
must(catalog,"F1 final fence includes viewer filter","async (epoch) => filterPublicBaseWorkCardsForViewer(");
must(catalog,"F1 fresh viewer profile", "async function recheckR18CatalogCards(");
must(catalog,"F1 fresh profile fields", '.select("show_r18_content, r18_confirmed_at")');
must(catalog,"F1 list all fresh gated", 'if (visibility === "all") return recheckR18CatalogCards(visibleCards);');
must(catalog,"F1 single work fresh gated", 'return (await recheckR18CatalogCards([work]))[0] ?? null;');
must(catalog,"F1 failure-closed fallback","await buildPublicBaseWorkCards(), options");
must(readerProducer,"F3 Reader producer calls mixed provenance projection","return projectReaderEpisodeRecordings(");
const readerFetchSource = readerProducer.split("async function fetchPublicRecordings(")[1]
  ?.split("type ReaderViewerState")[0] ?? "";
assert.ok(!readerFetchSource.includes(".filter(isPublishedHumanRecording)"),
  "Human-only Reader producer would drop all protected AI rows");
must(readerPage,"F3 Reader has AI narration options","listProtectedAiRecordings(");
must(readerPage,"F3 Reader uses authorized audio URL","src={option.audioUrl}");
must(workPage,"F3 Work has separate AI narration","aiRecordings: listProtectedAiRecordings(");
must(workPage,"F3 Work preserves Human filter",".filter(isPublishedHumanRecording)");
must(workPage,"F3 Work authorized player","src={option.audioUrl}");
must(protectedOptions,"F3 AI-only private reference","stored.startsWith(\"r18-private:\")");

must(catalog, "F1 epoch-bound cache", "public-base-work-cards-v13-db-epoch-bound");
assert.ok(!catalog.includes('const cards = await getCachedPublicBaseWorkCardsInternal();'),
  "Forbidden: unsafe unversioned shared catalog fetch");
must(generator, "Nemo private bucket", "mustUsePrivateAiAudio(seriesId)");
must(aivis, "Aivis private bucket", "mustUsePrivateAiAudio(seriesId)");
assert.ok(!sql.includes("update storage.buckets set public"), "do not flip existing buckets");
assert.ok(!/delete\s+from\s+storage\.objects/i.test(sql), "do not delete existing objects");
console.log("PASS: " + checked + " B2 SOURCE security contracts; not authenticated E2E");
