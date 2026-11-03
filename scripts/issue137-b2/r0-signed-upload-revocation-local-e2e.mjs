// #137 H2: actual LOCAL signed Human bearer lifecycle with a DB-enforced
// upload-time lease barrier. Test bytes synthetic, localhost-only, no hosted
// credentials; real Storage/GoTrue/PostgREST, not mocked.
import assert from "node:assert/strict";
import {createHash,randomUUID} from "node:crypto";
import {createClient} from "@supabase/supabase-js";
assert.equal(process.env.DO_NOT_CONTACT_PRODUCTION,"true");
assert.equal(process.env.R0_EPHEMERAL_CONFIRM,"local-only");
for(const key of ["SUPABASE_SERVICE_ROLE_KEY","SUPABASE_DB_PASSWORD",
 "SUPABASE_ACCESS_TOKEN","AWS_SECRET_ACCESS_KEY","S3_SECRET_ACCESS_KEY"]){
 assert.equal(process.env[key],undefined,"no inherited hosted key: "+key);
}
const origin=new URL(process.env.R0_LOCAL_URL||"");
assert.equal(origin.protocol,"http:");
assert.equal(origin.hostname,"127.0.0.1");
assert.equal(origin.port,"54321");
assert.equal(origin.pathname,"/");
assert.equal(origin.search,"");
const anonKey=process.env.R0_ANON_KEY||"",serviceKey=process.env.R0_SERVICE_KEY||"";
assert.ok(anonKey.length>30&&serviceKey.length>30&&anonKey!==serviceKey);
const auth={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
const admin=createClient(origin.origin,serviceKey,auth),
  anon=createClient(origin.origin,anonKey,auth);
const uuid=()=>randomUUID();
const hash=bytes=>createHash("sha256").update(bytes).digest("hex");
const original=Buffer.from("synthetic human multipart temp A "+uuid()),
  changed=Buffer.from("synthetic human multipart temp B "+uuid());
const bucket="human-recording-audio",sourceExtension="webm";
let passed=0,denied=0;
const yes=(ok,msg)=>{assert.ok(ok,msg);passed++};
const no=(ok,msg)=>{assert.ok(ok,msg);denied++};
async function add(table,row,label) {
 const {error}=await admin.from(table).insert(row);
 assert.equal(error,null,label+":"+(error?.code||""));
}
const user=await admin.auth.admin.createUser({
 email:"h2-"+uuid()+"@example.invalid",password:"SyntheticH2-"+uuid()+"Aa1!",
 email_confirm:true
});
assert.equal(user.error,null,"local synthetic auth user created");
const actor=user.data.user.id,sid=uuid(),eid=uuid(),session=uuid(),foreign=uuid();
await add("users",{id:actor,display_name:"Synthetic actor"},"profile");
await add("series",{id:sid,author_id:actor,publication_status:"public",
 content_rating:"general",recording_permission_mode:"open"},"source");
await add("episodes",{id:eid,series_id:sid,episode_number:1,
 posting_status:"posted",is_published:true},"episode");
await add("user_recording_consents",{user_id:actor,
 consent_key:"recording_studio_global",consent_version:"2026-04-16"},"consent");
const b=await admin.storage.getBucket(bucket);
yes(!b.error&&b.data?.public===false,"Human temporary bucket is PRIVATE");

const lease={
 p_session:session,p_series:sid,p_episode:eid,p_actor:actor,
 p_extension:sourceExtension,p_total_bytes:4194304,p_part_count:1
};
const missing=await admin.rpc("issue137_h2_stage_open",{
 ...lease,p_session:uuid(),p_actor:foreign
});
no(Boolean(missing.error),"arbitrary actor with no consent cannot open lease");
const open=await admin.rpc("issue137_h2_stage_open",lease);
yes(!open.error&&open.data===true,"service-only lease created while source and consent valid");
const prefix="human-temp/"+sid+"/"+eid+"/"+actor+"/"+session+"/";
const first=prefix+"part-0001.webm";
const wrong=prefix+"part-0002.webm";
const sign=async(path)=>{
 const value=await admin.storage.from(bucket)
  .createSignedUploadUrl(path,{upsert:false});
 assert.equal(value.error,null,"actual private signed token minted");
 assert.ok(typeof value.data.token==="string"&&value.data.token.length>15);
 return value.data.token;
};
const token=await sign(first);
const control=await anon.storage.from(bucket)
 .uploadToSignedUrl(first,token,original,{contentType:"audio/webm"});
yes(!control.error,"bearer issued under active lease writes real PRIVATE bytes");
const originalRead=await admin.storage.from(bucket).download(first);
yes(!originalRead.error &&
 hash(Buffer.from(await originalRead.data.arrayBuffer()))===hash(original),
 "byte-verified positive control stored as PRIVATE original");
const second=await anon.storage.from(bucket)
 .uploadToSignedUrl(first,token,changed,{contentType:"audio/webm"});
no(Boolean(second.error),"no-upsert bearer cannot overwrite a staged part");
const unchanged=await admin.storage.from(bucket).download(first);
yes(!unchanged.error&&hash(Buffer.from(await unchanged.data.arrayBuffer()))===hash(original),
 "failed overwrite preserved original PRIVATE bytes");
const unlisted=await admin.storage.from(bucket).upload(wrong,changed,
 {contentType:"audio/webm",upsert:false});
no(Boolean(unlisted.error),"privileged unlisted multipart part rejected by H2");

// A previously issued token to a still-empty path should be blocked after
// consent withdrawal. Cannot mint a second token from another path under a
// one-part lease, so first perform a distinct authenticated lease.
const session2=uuid();
const lease2={...lease,p_session:session2};
const open2=await admin.rpc("issue137_h2_stage_open",lease2);
yes(!open2.error&&open2.data===true,"second distinct session opened");
const latePath="human-temp/"+sid+"/"+eid+"/"+actor+"/"+session2+"/part-0001.webm";
const lateToken=await sign(latePath);
const foreignClose=await admin.rpc("issue137_h2_stage_close",{
 p_session:session2,p_series:sid,p_episode:eid,p_actor:foreign,
 p_extension:sourceExtension,p_total_bytes:4194304,p_mode:"abort"
});
no(Boolean(foreignClose.error),"another actor cannot close the current lease");
const consent=await admin.from("user_recording_consents")
 .update({consent_version:"withdrawn"}).eq("user_id",actor)
 .eq("consent_key","recording_studio_global").select("user_id");
yes(!consent.error&&consent.data?.length===1,"real local consent revoked");
const withdraw=await admin.from("series")
 .update({publication_status:"private",content_rating:"r18",
 content_warnings:["sexual_r18"]}).eq("id",sid).select("id");
yes(!withdraw.error&&withdraw.data?.length===1,
 "real local owner source PRIVATE+R18 after token issued");
const late=await anon.storage.from(bucket)
 .uploadToSignedUrl(latePath,lateToken,changed,{contentType:"audio/webm"});
no(Boolean(late.error),
 "old bearer denied by upload-time H2 trigger after consent/publication withdrawn");
const lateRead=await admin.storage.from(bucket).download(latePath);
no(Boolean(lateRead.error),"blocked old bearer leaves no Storage object");
const sealAfter=await admin.rpc("issue137_h2_stage_close",{
 p_session:session2,p_series:sid,p_episode:eid,p_actor:actor,
 p_extension:sourceExtension,p_total_bytes:4194304,p_mode:"seal"
});
no(Boolean(sealAfter.error),"revoked lease cannot be sealed for publication");
const abort=await admin.rpc("issue137_h2_stage_close",{
 p_session:session2,p_series:sid,p_episode:eid,p_actor:actor,
 p_extension:sourceExtension,p_total_bytes:4194304,p_mode:"abort"
});
yes(!abort.error&&abort.data===true,
 "owner scope can abort a revoked lease without deleting any objects");
const reopen=await admin.rpc("issue137_h2_stage_open",lease2);
no(Boolean(reopen.error),"aborted lease identifier cannot be reused");
const retry=await anon.storage.from(bucket)
 .uploadToSignedUrl(latePath,lateToken,changed,{contentType:"audio/webm"});
no(Boolean(retry.error),"aborted lease cannot accept a previously issued bearer");

const sealed=await admin.rpc("issue137_h2_stage_close",{
 p_session:session,p_series:sid,p_episode:eid,p_actor:actor,
 p_extension:sourceExtension,p_total_bytes:4194304,p_mode:"abort"
});
yes(!sealed.error&&sealed.data===true,
 "owner scope can abort earlier existing lease after withdrawal");
const oldPrivate=await admin.storage.from(bucket).download(first);
yes(!oldPrivate.error &&
 hash(Buffer.from(await oldPrivate.data.arrayBuffer()))===hash(original),
 "revoked/aborted stage bytes are retained PRIVATE, NOT immediately deleted");
no(Boolean((await anon.storage.from(bucket).download(first)).error),
 "aborted bytes cannot be anonymously read");
const publicRead=await fetch(
 origin.origin+"/storage/v1/object/public/"+bucket+"/"+first,
 {cache:"no-store",redirect:"error",signal:AbortSignal.timeout(15000)}
);
no(publicRead.status!==200,"aborted staged bytes not publicly addressable");
const noToken=await anon.storage.from(bucket).upload(
 prefix+"no-token.webm",changed,{upsert:false,contentType:"audio/webm"});
no(Boolean(noToken.error),"direct unsigned client cannot upload to PRIVATE temp");
const recorded=await admin.from("recordings").select("id")
 .eq("audio_storage_path",first);
yes(!recorded.error&&(recorded.data||[]).length===0,
 "no Human recordings published from aborted temporary bytes");
const retire=await admin.rpc("issue137_h2_stage_retire_candidates",{p_limit:50});
yes(!retire.error&&Array.isArray(retire.data)&&retire.data.length===0,
 "unexpired sealed/aborted leases NOT eligible for immediate cleanup");
console.log("PASS: H2 actual local signed upload barrier "+
 passed+" positive / "+denied+" denied, no-upsert, revoke, foreign actor, private retention");
console.log("HOLD: 3h TTL and manual retire checklist are distinct from actual wall-clock expiry, provider CDN, global rights, full disaster restore");
