// #137 REAL LOCAL legacy human/ signed path is OUTSIDE new H2 namespace.
// This deliberately documents a retained capability, not approved publishing.
import assert from "node:assert/strict";
import {randomUUID,createHash} from "node:crypto";
import {createClient} from "@supabase/supabase-js";
assert.equal(process.env.DO_NOT_CONTACT_PRODUCTION,"true");
assert.equal(process.env.R0_EPHEMERAL_CONFIRM,"local-only");
const url=process.env.R0_LOCAL_URL;
assert.equal(url,"http://127.0.0.1:54321");
const admin=createClient(url,process.env.R0_SERVICE_KEY,{auth:{persistSession:false}});
const anon=createClient(url,process.env.R0_ANON_KEY,{auth:{persistSession:false}});
const id=()=>randomUUID(),hash=x=>createHash("sha256").update(x).digest("hex");
const user=await admin.auth.admin.createUser({email:"legacy-"+id()+"@example.invalid",
 password:"Synthetic-"+id()+"A1!",email_confirm:true});
assert.equal(user.error,null);
const actor=user.data.user.id,sid=id(),eid=id();
for(const [table,row] of [
 ["users",{id:actor,display_name:"Synthetic legacy"}],
 ["series",{id:sid,author_id:actor,publication_status:"public",content_rating:"general",recording_permission_mode:"open"}],
 ["episodes",{id:eid,series_id:sid,episode_number:1,posting_status:"posted",is_published:true}],
 ["user_recording_consents",{user_id:actor,consent_key:"recording_studio_global",consent_version:"2026-04-16"}]
])assert.equal((await admin.from(table).insert(row)).error,null,table);
const key="human/"+sid+"/"+eid+"/"+actor+"/"+id()+"/stale-part.webm";
const sign=await admin.storage.from("human-recording-audio").createSignedUploadUrl(key,{upsert:false});
assert.equal(sign.error,null,"legacy bearer before withdrawal");
assert.ok(sign.data.token.length>15);
assert.equal((await admin.from("user_recording_consents")
 .update({consent_version:"withdrawn"}).eq("user_id",actor)).error,null);
assert.equal((await admin.from("series").update({publication_status:"private",
 content_rating:"r18",content_warnings:["sexual_r18"]}).eq("id",sid)).error,null);
const original=Buffer.from("synthetic legacy old signer still accepted "+id());
const sent=await anon.storage.from("human-recording-audio")
 .uploadToSignedUrl(key,sign.data.token,original,{contentType:"audio/webm"});
assert.equal(sent.error,null,"old untracked human/ bearer still stages PRIVATE after revoke");
const stored=await admin.storage.from("human-recording-audio").download(key);
assert.equal(stored.error,null);
assert.equal(hash(Buffer.from(await stored.data.arrayBuffer())),hash(original));
assert.ok((await anon.storage.from("human-recording-audio").download(key)).error,
 "legacy PRIVATE object must not be anonymous readable");
const noPublished=await admin.from("recordings").select("id").eq("audio_storage_path",key);
assert.equal(noPublished.error,null);assert.equal(noPublished.data?.length,0);
console.log("RISK_LEGACY_SIGNED_HUMAN: pre-H2 human/ bearer survives withdrawal"+
 " for PRIVATE stage, with no publication and no anonymous download");
console.log("HOLD: old signed token family needs exact runtime inventory/expiry strategy");
