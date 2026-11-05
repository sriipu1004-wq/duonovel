// Issue #137 F2-P Preview-only public media write gate — SOURCE+dynamic tests.
// No Production, Storage, DB, outbound network, provider secrets, or media bytes.
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import {
  checkNonproductionMediaWriterBoundary,
  type CandidateMediaWriterKind,
} from "../../src/lib/recording/publicMediaWriterBoundary";

let checks=0;
const kinds:CandidateMediaWriterKind[]=["ai-recording","human-recording","site-bgm"];
function yes<T>(value:T,expected:T){assert.deepEqual(value,expected);checks++;}
function reject(kind:CandidateMediaWriterKind,isPublicCandidate:boolean,env:Record<string,string>,msg:string){
 assert.throws(()=>checkNonproductionMediaWriterBoundary({kind,isPublicCandidate,env}),
  (err:unknown)=>err instanceof Error && err.message===msg,kind+" "+msg);
 checks++;
}
for(const kind of kinds){
 for(const isPublicCandidate of [true,false]){
  yes(checkNonproductionMediaWriterBoundary({kind,isPublicCandidate,env:{}}),
    {status:"LEGACY_UNCHANGED_NOT_APPROVED"});
  yes(checkNonproductionMediaWriterBoundary({kind,isPublicCandidate,
    env:{LIBREAD_F2P_MEDIA_WRITER_MODE:" "}}),
    {status:"LEGACY_UNCHANGED_NOT_APPROVED"});
  reject(kind,isPublicCandidate,
   {LIBREAD_F2P_MEDIA_WRITER_MODE:"preview-hold",VERCEL_ENV:"production"},
   "F2P_PREVIEW_GUARD_WRONG_ENVIRONMENT");
  reject(kind,isPublicCandidate,
   {LIBREAD_F2P_MEDIA_WRITER_MODE:"preview-hold",VERCEL_ENV:"development"},
   "F2P_PREVIEW_GUARD_WRONG_ENVIRONMENT");
  reject(kind,isPublicCandidate,
   {LIBREAD_F2P_MEDIA_WRITER_MODE:"enable-release",VERCEL_ENV:"preview"},
   "F2P_MEDIA_WRITER_MODE_UNVERIFIED");
  if(isPublicCandidate)reject(kind,true,
   {LIBREAD_F2P_MEDIA_WRITER_MODE:"preview-hold",VERCEL_ENV:"preview"},
   "F2P_PREVIEW_PUBLIC_MEDIA_HOLD");
  else yes(checkNonproductionMediaWriterBoundary({kind,isPublicCandidate:false,
    env:{LIBREAD_F2P_MEDIA_WRITER_MODE:"preview-hold",VERCEL_ENV:"preview"}}),
    {status:"PRIVATE_ONLY_UNCHANGED"});
 }
}
assert.throws(()=>checkNonproductionMediaWriterBoundary({
 kind:"untrusted" as CandidateMediaWriterKind,isPublicCandidate:true,env:{},
}),/F2P_MEDIA_KIND_UNVERIFIED/);checks++;
function source(path:string){return readFileSync(new URL("../../"+path,import.meta.url),"utf8");}
const sites=[
 {path:"src/lib/recording/nemoGeneration.ts",publicExpression:"isPublicCandidate: !usePrivateAiAudio",
   next:".upload(audioObjectPath"},
 {path:"src/lib/recording/aivisGeneration.ts",publicExpression:"isPublicCandidate: !usePrivateAiAudio",
   next:".upload(audioObjectPath"},
 {path:"src/lib/recording/humanRecordingPublish.ts",publicExpression:"isPublicCandidate: isPublic",
   next:".upload(originalObjectPath"},
];
for(const site of sites){
 const text=source(site.path);
 const marker="checkNonproductionMediaWriterBoundary({";
 const i=text.indexOf(marker),j=text.indexOf(site.next);
 assert.ok(i>=0&&j>i,site.path+" gate must run BEFORE FIRST final Storage write");
 assert.ok(text.slice(i,i+350).includes(site.publicExpression),
   site.path+" must pass trusted server-side publication decision");
 assert.ok(text.includes('from "@/lib/recording/publicMediaWriterBoundary"'),
   site.path+" must import shared server writer boundary");
 if(site.path.endsWith("Generation.ts")){
   assert.ok(text.includes("await assertApprovedPrivateAiAudioBucket(adminSupabase)"),
     site.path+" must prove actual PRIVATE bucket visibility before Storage write");
   assert.ok(text.includes("usePrivateAiAudio ? PRIVATE_AI_AUDIO_BUCKET"),
     site.path+" must route selected AI recording to the verified PRIVATE bucket");
   checks+=2;
 }
 checks+=3;
}
for(const forbidden of ["createSignedUrl(","getPublicUrl(","service_role",
 "SUPABASE_SERVICE_ROLE_KEY","storage.from(","NEXT_PUBLIC_SUPABASE_URL"]){
 assert.ok(!source("src/lib/recording/publicMediaWriterBoundary.ts").includes(forbidden),
  "writer gate must have no Storage authority "+forbidden);
 checks++;
}
console.log("PASS: F2-P "+checks+
 " SOURCE+dynamic preview HOLD / default unchanged / all three media kinds / writers-before-upload controls");
console.log("NO RELEASE GO: no actual trusted production release ports or privileged S3 PUBLIC fencing");

// F2-P: Execute real function declarations from the server-only helper
// (isolated TypeScript transpilation) without importing provider credentials.
// Real Storage/Next HTTP coverage is in r0-next-http-e2e.mjs.
const helperSource=source("src/lib/recording/protectedAiRecordingStorage.ts");
const sf=ts.createSourceFile("protectedAiRecordingStorage.ts",helperSource,
  ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
const helpersToCheck=["isApprovedLocalPrivateAiExperiment",
  "assertApprovedPrivateAiAudioBucket"];
const extracted=helpersToCheck.map(name=>{
  const node=sf.statements.find(stmt=>
    ts.isFunctionDeclaration(stmt)&&stmt.name?.text===name);
  assert.ok(node,"production PRIVATE helper must exist: "+name);
  return node.getText(sf).replace(/^export\s+/u,"");
});
const runtime=vm.runInNewContext(ts.transpileModule(
  extracted.join("\n")+
    "\n({isApprovedLocalPrivateAiExperiment,assertApprovedPrivateAiAudioBucket});",
  {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}
).outputText,{URL,Error,PRIVATE_AI_AUDIO_BUCKET:"r18-recording-audio"}) as {
 isApprovedLocalPrivateAiExperiment:(env:Record<string,string>)=>boolean;
 assertApprovedPrivateAiAudioBucket:(client:unknown)=>Promise<string>;
};
const valid={
 LIBREAD_F2P_AI_PRIVATE_FIRST_EXPERIMENT:"local-only",
 DO_NOT_CONTACT_PRODUCTION:"true",
 R0_EPHEMERAL_CONFIRM:"local-only",
 NEXT_PUBLIC_SUPABASE_URL:"http://127.0.0.1:54321",
 NODE_ENV:"development",
};
yes(runtime.isApprovedLocalPrivateAiExperiment({}),false);
yes(runtime.isApprovedLocalPrivateAiExperiment(valid),true);
yes(runtime.isApprovedLocalPrivateAiExperiment({
 ...valid,NEXT_PUBLIC_SUPABASE_URL:"http://localhost:54331"
}),true);
for(const [key,value,reason] of [
 ["VERCEL_ENV","preview","f2p_ai_private_experiment_requires_isolated_local"],
 ["VERCEL_ENV","production","f2p_ai_private_experiment_requires_isolated_local"],
 ["NODE_ENV","production","f2p_ai_private_experiment_requires_isolated_local"],
 ["NEXT_PUBLIC_SUPABASE_URL","https://example.com","f2p_ai_private_experiment_requires_isolated_local"],
 ["NEXT_PUBLIC_SUPABASE_URL","http://127.0.0.1:54322","f2p_ai_private_experiment_requires_isolated_local"],
 ["DO_NOT_CONTACT_PRODUCTION","false","f2p_ai_private_experiment_requires_isolated_local"],
 ["R0_EPHEMERAL_CONFIRM","missing","f2p_ai_private_experiment_requires_isolated_local"],
 ["LIBREAD_F2P_AI_PRIVATE_FIRST_EXPERIMENT","preview","f2p_ai_private_experiment_mode_invalid"],
] as const){
 assert.throws(()=>runtime.isApprovedLocalPrivateAiExperiment({
  ...valid,[key]:value
 }),new RegExp(reason),key+" must fail closed");
 checks++;
}
async function verifyPrivateBucketNegatives():Promise<void> {
const bucket=(data:unknown,error:unknown=null)=>({
 storage:{getBucket:async (name:string)=>{
  assert.equal(name,"r18-recording-audio");
  return {data,error};
 }}
});
assert.equal(await runtime.assertApprovedPrivateAiAudioBucket(bucket({
 id:"r18-recording-audio",name:"r18-recording-audio",public:false
})),"r18-recording-audio");
checks++;
for(const data of [
 null,{id:"r18-recording-audio",name:"r18-recording-audio",public:true},
 {id:"recording-audio",name:"recording-audio",public:false},
 {id:"r18-recording-audio",name:"r18-recording-audio"}
]){
 await assert.rejects(runtime.assertApprovedPrivateAiAudioBucket(bucket(data)),
   /private_ai_audio_bucket_not_verified/);
 checks++;
}
await assert.rejects(runtime.assertApprovedPrivateAiAudioBucket(
 bucket(null,{message:"missing"})),/private_ai_audio_bucket_not_verified/);
checks++;
assert.ok(helperSource.includes("return isR18Series(data) || localPrivateFirst"),
 "ordinary R18 protection must not require the experiment flag");
checks++;
console.log("PASS: F2-P local PRIVATE-first selector and bucket visibility negatives");
}
void verifyPrivateBucketNegatives().catch(error=>{
 console.error(error);
 process.exitCode=1;
});
