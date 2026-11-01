// Issue #137 B2: exact application-helper integration contract and legacy
// privileged path blockers. This test DOES NOT call a hosted/local provider,
// synthesize speech, invoke a Next route or claim production isolation.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildHumanMultipartUploadSession,
  HUMAN_MULTIPART_MAX_TOTAL_BYTES,
  HUMAN_MULTIPART_MIN_TRIGGER_BYTES,
  HUMAN_MULTIPART_PART_SIZE_BYTES,
} from "../../src/lib/recording/humanMultipartUploadShared";

const root=new URL("../../",import.meta.url);
const read=(p:string)=>readFileSync(new URL(p,root),"utf8");
const paths={
 signer:"src/app/api/recordings/human-upload-session/route.ts",
 finalize:"src/app/api/recordings/human-upload-finalize/route.ts",
 publish:"src/lib/recording/humanRecordingPublish.ts",
 nemo:"src/lib/recording/nemoGeneration.ts",
 aivis:"src/lib/recording/aivisGeneration.ts",
 automatic:"src/lib/recording/aivisAutoGeneration.ts",
 aiReader:"src/app/api/recordings/ai-audio/[recordingId]/route.ts",
 humanReader:"src/app/api/recordings/human-audio/[recordingId]/route.ts",
 proxy:"src/lib/recording/privateMediaProxy.ts",
 worker:"scripts/issue137-b2/privileged-http-boundary-process-local.mjs",
};
const src=Object.fromEntries(Object.entries(paths).map(([k,p])=>[k,read(p)]));
let checked=0;
function yes(ok:unknown,desc:string){assert.ok(ok,desc);checked++;}
function ordered(s:string,markers:string[],desc:string){
 let pos=-1;
 for(const marker of markers){
  const n=s.indexOf(marker,pos+1);
  yes(n>pos,desc+": "+marker);
  pos=n;
 }
}
function numMatches(s:string,re:RegExp){return [...s.matchAll(re)].length;}
yes(HUMAN_MULTIPART_MAX_TOTAL_BYTES===1024*1024*1024,
 "existing Human max is exactly 1GiB");
yes(HUMAN_MULTIPART_PART_SIZE_BYTES===8*1024*1024,"legacy part =8MiB");
yes(HUMAN_MULTIPART_MIN_TRIGGER_BYTES===4*1024*1024,"legacy multipart trigger 4MiB");
const cases=[4*1024*1024+1,8*1024*1024,8*1024*1024+1,
 HUMAN_MULTIPART_MAX_TOTAL_BYTES];
for(const bytes of cases){
 const session=buildHumanMultipartUploadSession({
  seriesId:"22222222-2222-4222-8222-222222222222",
  episodeId:"33333333-3333-4333-8333-333333333333",
  userId:"44444444-4444-4444-8444-444444444444",
  uploadSessionId:"55555555-5555-4555-8555-555555555555",
  sourceExtension:"wav",totalSizeBytes:bytes});
 let end=0;
 for(const p of session.parts){
  yes(p.byteOffsetStart===end,"actual app multipart byte coverage no gap/overlap");
  yes(p.expectedSizeBytes>0&&p.expectedSizeBytes<=HUMAN_MULTIPART_PART_SIZE_BYTES,
   "each part respects actual 8MiB max");
  yes(p.byteOffsetEndExclusive-p.byteOffsetStart===p.expectedSizeBytes,
   "actual part size matches offset delta");
  end=p.byteOffsetEndExclusive;
 }
 yes(end===bytes,"actual multipart part coverage reaches total");
 yes(new Set(session.parts.map(p=>p.objectPath)).size===session.parts.length,
  "actual multipart destination paths are distinct");
 if(bytes===HUMAN_MULTIPART_MAX_TOTAL_BYTES)
  yes(session.parts.length===128,"1GiB requires 128 pre-minted 8MiB parts");
}
const signer=src.signer,finalize=src.finalize,publish=src.publish;
ordered(signer,[
 "supabase.auth.getUser()",
 '.from("user_recording_consents")',
 "const adminSupabase = createAdminClient()",
 ".createSignedUploadUrl(part.objectPath",
 "token: data.token",
],"legacy Human signer still mints reusable Storage bearer after user consent");
yes(/\.createSignedUploadUrl\(part\.objectPath,\s*\{[^}]*upsert:\s*false/u.test(signer),
 "legacy bearer is first-write only (not revocable after issue)");
yes(!signer.includes("issue137_http_local_tickets"),
 "real signer is NOT wired to disposable durable ticket prototype");
ordered(finalize,[
 "const admin = createAdminClient()",
 ".download(part.objectPath)",
 "fileParts.push(data)",
 "new File(fileParts, fileName",
 "analyzeAudioUploadServer(sourceFile)",
 "publishHumanRecording({",
],"legacy Human finalize reconstructs all parts in server process");
yes(/finally\s*\{[\s\S]*?\.remove\(tempObjectPaths\)/u.test(finalize),
 "legacy finalize still attempts unconditional staging cleanup, including uncertain failures");
yes(publish.includes("new Uint8Array(await sourceFile.arrayBuffer())"),
 "real Human publisher allocates entire 1GiB-compatible original into memory");
yes(numMatches(publish,/\.upload\((?:originalObjectPath|playbackObjectPath|timingObjectPath)/g)===3,
 "real Human has three distinct privileged FINAL Storage PUTs");
yes(publish.includes('checkNonproductionMediaWriterBoundary({')&&
 publish.includes('isPublicCandidate: isPublic'),
 "legacy Human has only opt-in Preview PUBLIC HOLD before FINAL media writes");
for(const kind of ["nemo","aivis"]){
 const code=src[kind];
 yes(code.includes("createAdminClient()"),kind+" retains project-wide service_role");
 yes(code.includes('checkNonproductionMediaWriterBoundary({')&&
  code.includes('isPublicCandidate: !protectedR18'),
  kind+" Preview guard before storage writes but not a credential fence");
 yes(code.includes(".upload(audioObjectPath")&&code.includes(".upload(timingObjectPath"),
  kind+" still directly PUTs audio and timing via privileged SDK");
 yes(code.includes("getPublicUrl(audioObjectPath"),
  kind+" still produces legacy PUBLIC URL for non-R18 audio");
}
ordered(src.automatic,[
 "const cleanupPaths = buildStorageCleanupPathsForRecording(staleRecording)",
 '.from("recordings")',
 ".delete()",
 "generateAivisRecordingForEpisode({",
 "removeStorageObjectPaths(args.supabase, cleanupPaths)",
],"automatic Aivis deletes old DB row before regeneration; cleanup separately privileged");
for(const kind of ["humanReader","aiReader"]){
 yes(src[kind].includes("createAdminClient()"),
  kind+" reader metadata still requires privileged server DB query");
 yes(src[kind].includes("streamAuthorizedPrivateRecording("),
  kind+" private playback still delegates to privileged Storage proxy");
}
yes(src.proxy.includes("SUPABASE_SERVICE_ROLE_KEY")&&
 src.proxy.includes("cache:\"no-store\""),
 "actual proxy uses service_role for read-only media streaming, not per-route restricted JWT");
yes(src.worker.includes("bytes.length>1024*1024")&&
 src.worker.includes('request.bytesBase64.length>1400000'),
 "isolated worker prototype is 1MiB bounded and cannot accept 8MiB app part or 1GiB audio");
for(const kind of ["signer","finalize","publish","nemo","aivis","automatic","aiReader","humanReader","proxy"]){
 yes(!src[kind].includes("issue137_http_local_claim")&&
  !src[kind].includes("privileged-http-boundary-process-local"),
  kind+" does NOT call nonproduction privileged worker");
}
console.log("PASS: F2-P "+checked+
 " app-derived SOURCE/PURE compatibility checks, 1GiB/128 legacy parts verified WITHOUT allocating audio");
console.log("HOLD: existing Next Human bearer/finalize/arrayBuffer + 3 final PUTs, "+
 "Nemo/Aivis PUBLIC/admin PUT, Aivis stale-delete, reader admin GET remain UNWIRED to separate worker");
console.log("NO RELEASE GO: 1MiB local worker vs 8MiB part / 1GiB upload; "+
 "source contracts not an app production E2E, zero hosted writes or media publication");
