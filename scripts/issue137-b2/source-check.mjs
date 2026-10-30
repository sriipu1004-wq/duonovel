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
const storageRace = read("scripts/issue137-b2/storage-upload-publicity-e2e.mjs");
must(runLocal, "F2-P actual Storage race connected", 'node "$B2/storage-upload-publicity-e2e.mjs"');
must(storageRace, "F2-P POST upload first race", "actual LOCAL Storage POST first");
must(storageRace, "F2-P real x-upsert race", "Storage x-upsert");
must(storageRace, "F2-P bucket PUT first race", "bucket PUT first");
must(storageRace, "F2-P actual lock reached", "PgSleep");
must(storageRace, "F2-P no hosted endpoint", 'B2_EPHEMERAL_CONFIRM');
const s3Probe = read("scripts/issue137-b2/s3-byte-path-e2e.mjs");
must(runLocal, "F2-P real S3 local runner wired", 'node "$B2/s3-byte-path-e2e.mjs"');
must(s3Probe, "F2-P local-only S3 guard", 'B2_EPHEMERAL_CONFIRM');
must(s3Probe, "F2-P signed local S3", "AWS4-HMAC-SHA256 Credential=stub/");
must(s3Probe, "F2-P metadata UPDATE trigger comparison", "before update of bucket_id,name,metadata");
must(s3Probe, "F2-P byte-level overwrite evidence", "after.bytes.equals(audio)");
must(s3Probe, "F2-P S3 same-key overwrite baseline", "S3 same-key overwrite works WITHOUT metadata guard");
must(s3Probe, "F2-P public MIME disguise", "disguised");
must(s3Probe, "F2-P exact local S3 credential key", "B2_ANON_KEY");
must(s3Probe,"F2-P NEW public S3 opaque media regression","S3 NEW opaque public key");
const policyModel=read("scripts/issue137-b2/public-media-admission-local.mjs");
must(runLocal,"F2-P synthetic admission design model runner",'node "$B2/public-media-admission-local.mjs"');
must(policyModel,"F2-P direct public held","HOLD_DIRECT_PUBLIC");
must(policyModel,"F2-P private quarantine","STAGE_PRIVATE");
must(policyModel,"F2-P proof digest bound","attestation.sha256!==hash(bytes)");
must(policyModel,"F2-P Human consent R18 rights checks","humanConsentMissing");
must(policyModel,"F2-P no runtime positive authorization","MODEL_RELEASE_ELIGIBLE_NOT_AUTHORIZED");
const serverPreflight=read("src/lib/recording/publicMediaReleasePreflight.ts");
const serverPreflightTest=read("scripts/issue137-b2/public-media-server-preflight.test.ts");
must(runLocal,"F2-P server preflight test wired",'node --import tsx "$B2/public-media-server-preflight.test.ts"');
must(serverPreflight,"F2-P no publish result","PRECHECK_ONLY_NOT_AUTHORIZED");
must(serverPreflight,"F2-P staged bytes hash","createHash(\"sha256\").update(stage.bytes)");
must(serverPreflight,"F2-P fresh authority callback","loadFreshEvidence");
must(serverPreflight,"F2-P real decoder callback","decodeFully");
must(serverPreflight,"F2-P R18 warning gate",'fresh.contentWarnings.includes("sexual_r18")');
must(serverPreflight,"F2-P Human consent","humanConsentCurrent");
must(serverPreflight,"F2-P distinct site BGM","siteManagedCatalogEntry");
must(serverPreflightTest,"F2-P no new runtime permission","NON-WIRED, no PUBLIC authorization");
const releaseRaceModel = read("scripts/issue137-b2/public-media-release-race-model.mjs");
must(runLocal, "F2-P race-model runner", 'node "$B2/public-media-release-race-model.mjs"');
must(releaseRaceModel, "F2-P private proxy only", "MODEL_PRIVATE_POINTER_CAS_NOT_PUBLIC_RELEASE");
must(releaseRaceModel, "F2-P PUBLIC copy first hazard", "EXPECTED_RELEASE_HOLD: copy-first PUBLIC object survives failed DB CAS");

// F2-P application bridge: opt-in Preview refusal, never a PUBLIC release grant.
const writerBoundary=read("src/lib/recording/publicMediaWriterBoundary.ts");
const writerBoundaryTest=read("scripts/issue137-b2/public-media-writer-bridge.test.ts");
const humanPublisher=read("src/lib/recording/humanRecordingPublish.ts");
const aivisWriter=read("src/lib/recording/aivisGeneration.ts");
const bridgeWorkflow=read(".github/workflows/issue137-b2-isolated-e2e.yml");
for(const label of ["F2P_PREVIEW_PUBLIC_MEDIA_HOLD","F2P_PREVIEW_GUARD_WRONG_ENVIRONMENT",
  "LEGACY_UNCHANGED_NOT_APPROVED","PRIVATE_ONLY_UNCHANGED","F2P_MEDIA_WRITER_MODE_UNVERIFIED"]){
 must(writerBoundary,"F2-P bridge mode/"+label,label);
}
for(const [label,file] of [["Nemo",generator],["Aivis",aivisWriter],["Human",humanPublisher]]){
 must(file,"F2-P "+label+" shared bridge", "checkNonproductionMediaWriterBoundary({");
 must(file,"F2-P "+label+" uses only explicit server env fields", "VERCEL_ENV: process.env.VERCEL_ENV");
}
must(bridgeWorkflow,"F2-P preview bridge dynamic CI",
 "node --import tsx scripts/issue137-b2/public-media-writer-bridge.test.ts");
must(writerBoundaryTest,"F2-P early before upload source check","gate must run BEFORE FIRST final Storage write");
assert.ok(!writerBoundary.includes("getPublicUrl(") && !writerBoundary.includes("createAdminClient("),
 "F2-P bridge cannot itself publish or use privileged Storage");

const privateCore=read("src/lib/recording/publicMediaPrivateReleaseCore.ts");
const privateFacade=read("src/lib/recording/publicMediaPrivateReleaseServer.ts");
const privateAdapterTests=read("scripts/issue137-b2/public-media-private-adapter.test.ts");
must(privateFacade, "F2-P server-only facade", 'import "server-only"');
must(privateFacade, "F2-P private-only candidate exported", "evaluatePrivateMediaReleaseCandidate");
must(privateCore, "F2-P private destination gate", "destinationBucketPrivate");
must(privateCore, "F2-P atomically locked recheck contract", "atomicCommitPrivatePointer");
must(privateCore, "F2-P revision CAS", "s.pointerRevision !== pinned.expectedPointerRevision");
must(privateCore, "F2-P nonce replay", "releaseNonceAvailable");
must(privateAdapterTests, "F2-P fake Storage plus fake DB tests", "synthetic candidate adapter assertions");
must(privateAdapterTests, "F2-P S3 bypass explicitly held", "privileged S3 direct PUBLIC writes bypass");
must(runLocal, "F2-P new isolated adapter test wiring", 'node --import tsx "$B2/public-media-private-adapter.test.ts"');
// F2-P S3 privilege inventory and real disposable cross-credential negative.
// F2-P user-scoped PRIVATE media upload. This source must never receive
// a service-role/S3 key and must be exercised only in disposable Docker.
const rlsWriter=read("src/lib/recording/rlsScopedPrivateWriterLocal.ts");
const rlsSql=read("scripts/issue137-b2/rls-user-private-writer-local.sql");
const rlsE2E=read("scripts/issue137-b2/rls-user-private-writer-e2e.mjs");
const rlsWorkflow=read(".github/workflows/issue137-b2-isolated-e2e.yml");
for(const [label,needle] of [
 ["anon API bearer split",'apikey:config.anonKey,Authorization:"Bearer "+token'],
 ["verified signed-in GoTrue user",'/auth/v1/user'],
 ["enforced authenticated principal",'parsed.role!=="authenticated"'],
 ["enforced anonymous API key",'claims(config.anonKey).role!=="anon"'],
 ["no production host", 'F2P_RLS_LOCAL_ONLY'],
 ["owner prefix", '"owner/"+actorId+"/"+objectId+".wav"'],
 ["digest byte proof",'sha(copied)!==sha(bytes)'],
 ["new only POST",'userJwt,"POST",bytes'],
]) must(rlsWriter,"F2-P user RLS "+label,needle);
assert.ok(!/\b(?:serviceKey|serviceRoleKey|SUPABASE_SERVICE_ROLE_KEY|AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY|S3Client|createAdminClient|getPublicUrl|createSignedUploadUrl)\b/u.test(rlsWriter),
 "F2-P RLS upload client must not have any privileged credential capability");
checked++;
must(rlsSql,"F2-P local-only bucket", "'f2p-rls-user-stage'");
must(rlsSql,"F2-P authenticated-only INSERT", "for insert to authenticated");
must(rlsSql,"F2-P RLS path bound to JWT", "(select auth.uid())::text");
must(rlsSql,"F2-P restrictive INSERT", "as restrictive for insert to authenticated");
must(rlsSql,"F2-P bucket public switch disabled", "F2P_RLS_BUCKET_PUBLIC_HOLD");
must(rlsE2E,"F2-P user RLS cross-owner negative", "stranger writes owner prefix");
must(rlsE2E,"F2-P service JWT rejected", "F2P_USER_JWT_REQUIRED");
must(rlsE2E,"F2-P anonymous URL denial", "anonymous PUBLIC URL");
must(rlsE2E,"F2-P same key denial", "same-key user JWT upsert blocked");
must(runLocal,"F2-P restricted fixture install", 'docker cp "$B2/rls-user-private-writer-local.sql"');
must(runLocal,"F2-P RLS dynamic e2e", 'node --import tsx "$B2/rls-user-private-writer-e2e.mjs"');
must(rlsWorkflow,"F2-P early RLS test syntax", "node --check scripts/issue137-b2/rls-user-private-writer-e2e.mjs");
for(const actualSource of [generator,aivis,read("src/lib/recording/humanRecordingPublish.ts"),
  proxy,humanProxy,read("src/lib/recording/privateMediaLocalPipeline.ts")]){
 assert.ok(!actualSource.includes("createDisposableRlsScopedPrivateWriter"),
  "disposable RLS writer must NOT be wired into live routes");
 checked++;
}

// 2026-10-31 F2-P S2/S4: CODE-SOURCE map and REAL LOCAL synthetic transport.
const writerSim=read("scripts/issue137-b2/writer-path-private-preservation-e2e.mjs");
for(const [name,relative,firstUpload,publicSignal] of [
 ["Nemo","src/lib/recording/nemoGeneration.ts",".upload(audioObjectPath","isPublicCandidate: !protectedR18"],
 ["Aivis","src/lib/recording/aivisGeneration.ts",".upload(audioObjectPath","isPublicCandidate: !protectedR18"],
 ["Human","src/lib/recording/humanRecordingPublish.ts",".upload(originalObjectPath","isPublicCandidate: isPublic"],
]){
 const route=read(relative);
 const guardAt=route.indexOf("checkNonproductionMediaWriterBoundary({");
 const putAt=route.indexOf(firstUpload);
 assert.ok(guardAt>=0&&putAt>guardAt,
  name+" must check Preview HOLD before first FINAL Storage upload");
 assert.ok(route.slice(guardAt,guardAt+360).includes(publicSignal),
  name+" must send corresponding server-side public flag");
 checked+=2;
}
const nemoAuto=read("src/lib/recording/nemoAutoGeneration.ts");
const aivisAuto=read("src/lib/recording/aivisAutoGeneration.ts");
const humanSession=read("src/app/api/recordings/human-upload-session/route.ts");
const humanFinalize=read("src/app/api/recordings/human-upload-finalize/route.ts");
const humanStudio=read("src/components/recording/RecordingStudioPage.tsx");
must(nemoAuto,"Nemo automatic writer uses normal generator","generateNemoRecordingForEpisode(");
must(aivisAuto,"Aivis automatic writer uses normal generator","generateAivisRecordingForEpisode(");
must(aivisAuto,"Aivis privileged cleanup independent operation","removeStorageObjectPaths(");
must(humanSession,"Human upload session creates privileged signed temporary URLs",
  ".createSignedUploadUrl(part.objectPath");
must(humanStudio,"Human browser signed temporary object upload",
  ".uploadToSignedUrl(part.objectPath");
must(humanFinalize,"Human finalize has independent privileged cleanup",
  "admin.storage.from(bucketName).remove(tempObjectPaths)");
must(writerSim,"real LOCAL app boundary imported",
  'from "../../src/lib/recording/publicMediaWriterBoundary.ts"');
must(writerSim,"Nemo Aivis Human coverage",
  'label:"Human",kind:"human-recording"');
must(writerSim,"PRIVATE bytes preserved",
  "PUBLIC hold damaged already-saved PRIVATE bytes");
must(writerSim,"no PUBLIC Storage PUT",
  "ZERO PUBLIC Storage write calls");
must(runLocal,"real LOCAL synthetic writer test connected",
  'node --import tsx "$B2/writer-path-private-preservation-e2e.mjs"');
const b2Yml=read(".github/workflows/issue137-b2-isolated-e2e.yml");
must(b2Yml,"isolated writer test checked early",
 "node --check scripts/issue137-b2/writer-path-private-preservation-e2e.mjs");
assert.ok(!/supabase\.link|db push|db reset --linked|https:\/\/www\.syosetu-libread\.com/u.test(writerSim),
 "writer simulation must not address Production or linked projects");
checked++;

const s3WriterInventory=read("scripts/issue137-b2/s3-public-writer-inventory.mjs");
const s3Containment=read("scripts/issue137-b2/s3-privileged-writer-containment-design.md");
const s3RealE2E=read("scripts/issue137-b2/s3-byte-path-e2e.mjs");
const b2Workflow=read(".github/workflows/issue137-b2-isolated-e2e.yml");
must(b2Workflow,"F2-P full tracked-source inventory in CI",
 "node scripts/issue137-b2/s3-public-writer-inventory.mjs");
must(b2Workflow,"F2-P syntax check real S3 negative",
 "node --check scripts/issue137-b2/s3-byte-path-e2e.mjs");
must(s3WriterInventory,"F2-P source scan git tracked files",
 '["ls-files","-z","--cached"]');
must(s3WriterInventory,"F2-P source scan flagged credential references",
 '"s3_key_reference"');
must(s3WriterInventory,"F2-P source scan PUBLIC url",
 '"public_url"');
must(s3RealE2E,"F2-P synthetic user JWT S3 negative",
 "signed user JWT wrote forbidden public bucket");
must(s3RealE2E,"F2-P cross credential privileged S3 control",
 "privileged S3 can expose synthetic bytes");
must(s3Containment,"F2-P Production remediation not approved",
 "No Production remediation authorized.");
assert.ok(!/createSignedUrl\(/u.test(s3WriterInventory),
 "inventory must never mint signed bearer URL");
checked++;

const realPrivateSql=read("scripts/issue137-b2/private-real-local-adapter.sql");
const realPrivateE2E=read("scripts/issue137-b2/private-real-local-adapter-e2e.mjs");

const localPrivateApp=read("src/lib/recording/privateMediaLocalPipeline.ts");
must(runLocal,"F2-P real app-private pipeline tsx runner",
 'node --import tsx "$B2/private-real-local-adapter-e2e.mjs"');
must(runLocal,"F2-P ensure loader module resolution from ROOT",
 '(cd "$ROOT" && B2_NETWORK="$NETWORK" B2_DB_CONTAINER="$db_container"');
must(realPrivateE2E,"F2-P actual app pipeline import",
 'createDisposablePrivateMediaPipeline');
must(realPrivateE2E,"F2-P app private byte delivery E2E",
 'authorizedPrivateBytes(app.id,login.access_token)');
must(localPrivateApp,"F2-P exact localhost-only condition",
 'B2_EPHEMERAL_CONFIRM !== "local-only"');
must(localPrivateApp,"F2-P verified client identity",
 '"/auth/v1/user"');
must(localPrivateApp,"F2-P PRIVATE stage upload",
 '"/storage/v1/object/"+bucket+"/"+path');
must(localPrivateApp,"F2-P private-only CAS",
 '"issue137_f2p_local_private_commit"');
must(localPrivateApp,"F2-P read-time authorization",
 '"issue137_f2p_local_private_playback"');
must(localPrivateApp,"F2-P second authorization fence",
 'const after=await lookup()');
must(localPrivateApp,"F2-P no cached bytes",
 '"Cache-Control":"private, no-store, max-age=0"');
assert.ok(!localPrivateApp.includes("getPublicUrl(") &&
 !localPrivateApp.includes("createSignedUrl(") &&
 !localPrivateApp.includes("/storage/v1/object/public/") &&
 !localPrivateApp.includes("upsert:true"),
 "F2-P app-local PRIVATE pipeline must never grant public media or reusable URLs");
for(const source of [generator,aivisWriter,humanPublisher,
 read("src/app/api/recordings/ai-audio/[recordingId]/route.ts"),
 read("src/app/api/recordings/human-audio/[recordingId]/route.ts")]){
 assert.ok(!source.includes("createDisposablePrivateMediaPipeline"),
 "F2-P disposable fixture must NOT wire into real publisher or playback routes");
 checked++;
}

must(runLocal,"F2-P actual local DB/Storage adapter wired",'node --import tsx "$B2/private-real-local-adapter-e2e.mjs"');
must(runLocal,"F2-P local-only test SQL loaded",'docker cp "$B2/private-real-local-adapter.sql"');
must(realPrivateSql,"F2-P row lock in actual Postgres","where id=p_id for update");
must(realPrivateSql,"F2-P destination storage bucket live private check","b.public is distinct from false");
must(realPrivateSql,"F2-P object identity lock","name=c.stage_path and id=c.stage_object_id for share");
must(realPrivateSql,"F2-P nonce UNIQUE primary key","primary key(candidate_id,nonce)");
must(realPrivateSql,"F2-P revision compare","c.pointer_revision is distinct from p_expected_revision");
must(realPrivateSql,"F2-P SQL transaction rollback injection","F2P_LOCAL_INJECTED_ROLLBACK");
must(realPrivateSql,"F2-P stage overwrite guard","F2P_LOCAL_STAGE_IMMUTABLE");
must(realPrivateSql,"F2-P SQL SECURITY INVOKER","security invoker");
must(realPrivateSql,"F2-P service-role-only RPC", "to service_role;");
must(realPrivateE2E,"F2-P real localhost-only guard", 'B2_EPHEMERAL_CONFIRM,"local-only"');
must(realPrivateE2E,"F2-P real local GoTrue user", "/auth/v1/user");
must(realPrivateE2E,"F2-P real private byte GET", "/storage/v1/object/authenticated/");
must(realPrivateE2E,"F2-P real HTTP concurrent CAS", "Promise.all([rpc(ai,uuid()),rpc(ai,uuid())])");
must(realPrivateE2E,"F2-P direct Storage upsert denial", '"x-upsert":"true"');
must(realPrivateE2E,"F2-P no public writes", "No PUBLIC Storage writes");
assert.ok(!realPrivateSql.includes("security definer"),"test-only RPC may not run as definer");
assert.ok(!/drop\s+table|delete\s+from\s+storage\.objects|update\s+storage\.buckets\s+set\s+public/iu.test(realPrivateSql),
  "test-only local SQL must not delete or publish stored bytes");

for (const route of [
 "src/lib/recording/nemoGeneration.ts",
 "src/lib/recording/aivisGeneration.ts",
 "src/lib/recording/humanRecordingPublish.ts",
 "src/lib/bgm/bgmLibrary.ts",
 "src/app/api/recordings/human-upload-finalize/route.ts"
]) {
 assert.ok(!read(route).includes("publicMediaPrivateRelease"),
  "F2-P private release candidate MUST remain unwired: "+route);
 checked++;
}

for(const route of [
 "src/lib/recording/nemoGeneration.ts",
 "src/lib/recording/aivisGeneration.ts",
 "src/lib/recording/humanRecordingPublish.ts",
 "src/lib/bgm/bgmLibrary.ts",
 "src/app/api/recordings/human-upload-finalize/route.ts"
]) {
 assert.ok(!read(route).includes("publicMediaReleasePreflight"),
   "F2-P must remain unwired at release gate: "+route);
 checked++;
}


const aggregateLocal = read("scripts/issue137-b2/public-media-aggregate-local.sql");
must(runLocal, "F2-P synthetic aggregate runner wired", "public-media-aggregate-local.sql");
must(aggregateLocal, "F2-P synthetic temp tables", "create temp table audit_result as");
must(aggregateLocal, "F2-P public URL normalization", "'/storage/v1/object/public/recording-audio/'");
must(aggregateLocal, "F2-P R18 warning classification", "'sexual_r18'=any");
must(aggregateLocal, "F2-P BGM cross-reference", "audit_bgm");
must(aggregateLocal, "F2-P false negative documented", "misc/disguised.bin");
must(aggregateLocal, "F2-P explicit transaction rollback", "rollback;");
must(aggregateLocal, "F2-P UUID episode regex exact 8-4-4-4-12", "and split_part(c.name,'/',3) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'");
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
