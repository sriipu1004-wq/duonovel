// Issue #137 F2-P Preview-only public media write gate — SOURCE+dynamic tests.
// No Production, Storage, DB, outbound network, provider secrets, or media bytes.
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
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
 {path:"src/lib/recording/nemoGeneration.ts",publicExpression:"isPublicCandidate: !protectedR18",
   next:".upload(audioObjectPath"},
 {path:"src/lib/recording/aivisGeneration.ts",publicExpression:"isPublicCandidate: !protectedR18",
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
