// #137 H2: synthetically advance one ACTIVE LOCAL lease expiry,
// then attempt a still-valid signed upload. NO hosted database allowed.
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {execFileSync} from "node:child_process";
import {createClient} from "@supabase/supabase-js";
assert.equal(process.env.DO_NOT_CONTACT_PRODUCTION,"true");
assert.equal(process.env.R0_EPHEMERAL_CONFIRM,"local-only");
assert.equal(process.env.R0_LOCAL_URL,"http://127.0.0.1:54321");
const db=process.env.R0_LOCAL_DB_URL||"";
assert.match(db,/^postgresql:\/\/postgres:[^@]+@127[.]0[.]0[.]1:54322\/postgres$/u);
const admin=createClient(process.env.R0_LOCAL_URL,process.env.R0_SERVICE_KEY,
 {auth:{persistSession:false}});
const anon=createClient(process.env.R0_LOCAL_URL,process.env.R0_ANON_KEY,
 {auth:{persistSession:false}});
const uuid=()=>randomUUID(),sid=uuid(),eid=uuid(),session=uuid();
const made=await admin.auth.admin.createUser({
 email:"expired-"+uuid()+"@example.invalid",
 password:"Synthetic-"+uuid()+"A1!",email_confirm:true});
assert.equal(made.error,null);const actor=made.data.user.id;
for(const [table,row] of [
 ["users",{id:actor,display_name:"Expired local"}],
 ["series",{id:sid,author_id:actor,publication_status:"public",
  content_rating:"general",recording_permission_mode:"open"}],
 ["episodes",{id:eid,series_id:sid,episode_number:1,
  posting_status:"posted",is_published:true}],
 ["user_recording_consents",{user_id:actor,
  consent_key:"recording_studio_global",consent_version:"2026-04-16"}]
])assert.equal((await admin.from(table).insert(row)).error,null,table);
const lease={p_session:session,p_series:sid,p_episode:eid,p_actor:actor,
 p_extension:"webm",p_total_bytes:4194304,p_part_count:1};
const opened=await admin.rpc("issue137_h2_stage_open",lease);
assert.equal(opened.error,null);assert.equal(opened.data,true);
const key="human-temp/"+sid+"/"+eid+"/"+actor+"/"+session+"/part-0001.webm";
const signed=await admin.storage.from("human-recording-audio")
 .createSignedUploadUrl(key,{upsert:false});
assert.equal(signed.error,null);
const sql="do $$begin if not exists(select 1 from "+
 "libread_r0_disposable.sentinel where id and purpose='SYNTHETIC-R0-ONLY')"+
 "then raise exception 'LOCAL_ONLY';end if;end$$; "+
 "update libread_internal.h2_human_stage_lease set expires_at="+
 "clock_timestamp()-interval '1 minute' where session_id='"+session+
 "' and state='active';";
execFileSync("psql",["-X",db,"-v","ON_ERROR_STOP=1","-c",sql],
 {timeout:15000,stdio:"pipe"});
const put=await anon.storage.from("human-recording-audio")
 .uploadToSignedUrl(key,signed.data.token,
  Buffer.from("synthetic expired token"),{contentType:"audio/webm"});
assert.ok(put.error,"expired ACTIVE lease must reject unexpired bearer");
assert.ok((await admin.storage.from("human-recording-audio").download(key)).error,
 "expired bearer did not persist bytes");
const {p_part_count:unusedPartCount,...closeScope}=lease;
const seal=await admin.rpc("issue137_h2_stage_close",{
 ...closeScope,p_mode:"seal"});
assert.ok(seal.error,"expired lease cannot seal");
const abort=await admin.rpc("issue137_h2_stage_close",{
 ...closeScope,p_mode:"abort"});
assert.equal(abort.error,null);
console.log("PASS: #137 real local still-signed bearer denied after simulated 90m"+
 " active lease expiry; no object persisted, seal denied, abort allowed");
console.log("LIMIT: DB time advance is synthetic, NOT actual 90-minute wait");
