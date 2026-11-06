// #137 disposable LOCAL legacy issuance CUTOVER, without ever disabling
// a protection trigger or issuing a real/hosted historical bearer.
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
const key="human/"+sid+"/"+eid+"/"+actor+"/"+id()+"/part-0001.webm";
const sign=await admin.storage.from("human-recording-audio").createSignedUploadUrl(key,{upsert:false});
assert.ok(sign.error && String(sign.error.message).includes("H2_LEGACY_MULTIPART_NEW_WRITE_HOLD"),
 "H2 must prevent new canonical legacy signed bearer issuance");
assert.equal((await admin.from("user_recording_consents")
 .update({consent_version:"withdrawn"}).eq("user_id",actor)).error,null);
assert.equal((await admin.from("series").update({publication_status:"private",
 content_rating:"r18",content_warnings:["sexual_r18"]}).eq("id",sid)).error,null);
const original=Buffer.from("synthetic legacy old signer still accepted "+id());
// A bearer issued before H2 was installed cannot be minted safely while the
// guard is active. Its future PUT behavior remains NOT VERIFIED by this test.
const stored=await admin.storage.from("human-recording-audio").download(key);
assert.ok(stored.error,"denied legacy token created no PRIVATE multipart bytes");
// Legitimate final Human original media must remain writable by the server:
// the legacy HOLD is exact to /part-NNNN.ext only.
const finalPath="human/"+sid+"/"+eid+"/"+actor+"/"+id()+"/original.webm";
const finalPut=await admin.storage.from("human-recording-audio").upload(
 finalPath,original,{contentType:"audio/webm",upsert:false});
assert.equal(finalPut.error,null,"nonmultipart final original remains writeable");
const actual=await admin.storage.from("human-recording-audio").download(finalPath);
assert.equal(actual.error,null);
assert.equal(hash(Buffer.from(await actual.data.arrayBuffer())),hash(original));
assert.ok((await anon.storage.from("human-recording-audio").download(finalPath)).error,
 "legitimate PRIVATE final source remains unreadable to anon");
const noPublished=await admin.from("recordings").select("id").eq("audio_storage_path",key);
assert.equal(noPublished.error,null);assert.equal(noPublished.data?.length,0);
console.log("PASS: current H2 blocks NEW canonical legacy part-0001.webm"+
 " signed URL issuance, with zero staged bytes; legitimate final source"+
 " remains PRIVATE and server-writeable");
console.log("HOLD: PRE-ISSUED old bearer PUT not tested; noncanonical names,"+
 " hosted token expiry, object inventory/CDN and rights remain unverified");
