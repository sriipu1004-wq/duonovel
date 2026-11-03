// Issue #137: actual LOCAL signed upload capability vs source/consent revoke.
// A previously minted bearer upload token can remain usable after an app-level
// PRIVATE transition. Test actual GoTrue/PostgREST/Storage, NO hosted secrets,
// no real audio or user, no token printed. This is NOT a release safety PASS.
import assert from "node:assert/strict";
import {createHash,randomUUID} from "node:crypto";
import {createClient} from "@supabase/supabase-js";
assert.equal(process.env.DO_NOT_CONTACT_PRODUCTION,"true");
assert.equal(process.env.R0_EPHEMERAL_CONFIRM,"local-only");
for(const key of ["SUPABASE_SERVICE_ROLE_KEY","SUPABASE_DB_PASSWORD",
 "SUPABASE_ACCESS_TOKEN","AWS_SECRET_ACCESS_KEY","S3_SECRET_ACCESS_KEY"]){
 assert.equal(process.env[key],undefined,"must never inherit remote secret "+key);
}
const url=new URL(process.env.R0_LOCAL_URL||"");
assert.equal(url.protocol,"http:");
assert.equal(url.hostname,"127.0.0.1");
assert.equal(url.port,"54321");
assert.equal(url.pathname,"/");
assert.equal(url.search,"");
const anonKey=process.env.R0_ANON_KEY||"";
const serviceKey=process.env.R0_SERVICE_KEY||"";
assert.ok(anonKey.length>30 && serviceKey.length>30 && anonKey!==serviceKey);
const opts={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
const admin=createClient(url.origin,serviceKey,opts);
const anon=createClient(url.origin,anonKey,opts);
const uid=()=>randomUUID();
const sha=x=>createHash("sha256").update(x).digest("hex");
const original=Buffer.from("SYNTHETIC PRIVATE HUMAN STAGE A " + uid());
const changed=Buffer.from("SYNTHETIC PRIVATE HUMAN STAGE B " + uid());
const bucket="human-recording-audio";
let pass=0,deny=0;
function yes(x,msg){assert.ok(x,msg);pass++;}
function no(x,msg){assert.ok(x,msg);deny++;}
const made=await admin.auth.admin.createUser({email:"r0-stage-"+uid()+"@example.invalid",
 password:"Synthetic-Only-"+uid()+"Aa1!",email_confirm:true});
assert.equal(made.error,null,"local synthetic user");
const author=made.data.user.id,series=uid(),episode=uid();
async function insert(table,row) {
 const {error}=await admin.from(table).insert(row);
 assert.equal(error,null,table+" synthetic fixture "+String(error?.code||""));
}
await insert("users",{id:author,display_name:"LOCAL STAGE ACTOR"});
await insert("series",{id:series,author_id:author,publication_status:"public",
 content_rating:"general",recording_permission_mode:"open"});
await insert("episodes",{id:episode,series_id:series,episode_number:1,
 posting_status:"posted",is_published:true});
await insert("user_recording_consents",{
 user_id:author,consent_key:"recording_studio_global",
 consent_version:"2026-04-16"});
const b=await admin.storage.getBucket(bucket);
yes(!b.error && b.data?.public===false,
 "signed bearer temp bucket is physically private, not direct public media");
const prefix="human/"+series+"/"+episode+"/"+author+"/stage-"+uid()+"/";
const before=prefix+"part-before.webm",late=prefix+"part-after.webm";
const create=async p=>{
 const res=await admin.storage.from(bucket).createSignedUploadUrl(p,{upsert:true});
 assert.equal(res.error,null,"issue local temporary signed upload capability");
 assert.ok(typeof res.data?.token==="string"&&res.data.token.length>15);
 return res.data.token;
};
const valid=await create(before);
const control=await anon.storage.from(bucket)
 .uploadToSignedUrl(before,valid,original,{contentType:"audio/webm"});
yes(!control.error,"unsigned-in client with signed bearer can stage PRIVATE bytes before revoke");
const controlStored=await admin.storage.from(bucket).download(before);
yes(!controlStored.error&&sha(Buffer.from(await controlStored.data.arrayBuffer()))===sha(original),
 "signed upload positive control persisted real local bytes");
const issuedBeforeRevoke=await create(late);
// Revoke app owner/consent authority after the capability has been issued.
// No real user/media is touched; this source exists only inside local fixture.
const rev=await admin.from("user_recording_consents")
 .update({consent_version:"withdrawn"}).eq("user_id",author)
 .eq("consent_key","recording_studio_global").select("user_id");
yes(!rev.error&&rev.data?.length===1,
 "synthetic current actor consent revoked in actual local DB");
const hidden=await admin.from("series")
 .update({publication_status:"private",content_rating:"r18",
 content_warnings:["sexual_r18"]}).eq("id",series).select("id");
yes(!hidden.error&&hidden.data?.length===1,
 "synthetic source withdrawn and R18-corrected after token minted");
const bearerLate=await anon.storage.from(bucket)
 .uploadToSignedUrl(late,issuedBeforeRevoke,changed,{contentType:"audio/webm"});
yes(!bearerLate.error,
 "RISK: pre-issued PRIVATE upload token still works AFTER source and consent withdrawal");
const lateCheck=await admin.storage.from(bucket).download(late);
yes(!lateCheck.error&&sha(Buffer.from(await lateCheck.data.arrayBuffer()))===sha(changed),
 "revoked-consent bearer uploaded actual PRIVATE bytes, not just API success");
no((await anon.storage.from(bucket).download(late)).error===null,
 "bearer does NOT grant anonymous download of protected PRIVATE object");
const publicResponse=await fetch(url.origin+"/storage/v1/object/public/"+bucket+"/"+late,
 {cache:"no-store",redirect:"error",signal:AbortSignal.timeout(15000)});
no(publicResponse.status!==200,
 "PRIVATE staged bearer bytes are not readable through public origin");
const noToken=await anon.storage.from(bucket)
 .upload(prefix+"no-token.webm",changed,{contentType:"audio/webm",upsert:false});
no(Boolean(noToken.error),"anonymous unsigned direct upload remains denied");
const rec=await admin.from("recordings")
 .select("id").eq("audio_storage_path",late);
yes(!rec.error&&(rec.data||[]).length===0,
 "private staged capability did NOT publish a recording DB pointer");
// Never leave a synthetic live temp token/object after test. Unlinked local
// stack is also deleted by runner cleanup even if the assertion fails.
const clean=await admin.storage.from(bucket).remove([before,late]);
yes(!clean.error,"local-only staging objects cleaned by scoped Storage API");
const absent=await admin.storage.from(bucket).download(late);
no(Boolean(absent.error),"temporary staging object is absent after cleanup");
console.log("PASS: #137 actual LOCAL signed-upload before/after consent change "+
 pass+" positive / "+deny+" denied checks");
console.log("RISK_SIGNED_UPLOAD_CAPABILITY: temp PRIVATE token issued before withdrawal"+
 " remained valid for staging after revocation; it did not authorize public narration");
console.log("HOLD: this is provider-local capability semantics, not hosted token expiry,"+
 " CDN, rights, or a safe atomic publish/abort design");
