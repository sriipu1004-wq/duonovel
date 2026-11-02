// Issue #137: LOCAL real TUS HTTP against actual LIB read authority FIELD NAMES.
// Synthetic actors, series, episodes, R18 profile and consent; independent
// PRIVATE bucket and trusted TEST-only lease allocation. NO production access.
// This is not a live Next.js route, not a browser test, and not public release.
import assert from "node:assert/strict";
import {randomUUID,createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import {createClient} from "@supabase/supabase-js";

assert.equal(process.env.DO_NOT_CONTACT_PRODUCTION,"true");
assert.equal(process.env.B2_EPHEMERAL_CONFIRM,"local-only");
const base=new URL(process.env.B2_LOCAL_URL??"");
assert.equal(base.protocol,"http:");
assert.ok(["127.0.0.1","localhost"].includes(base.hostname));
assert.ok(["54321","54331"].includes(base.port));
assert.equal(base.pathname,"/");
assert.equal(base.search,"");
assert.equal(base.hash,"");
const network=process.env.B2_NETWORK??"",db=process.env.B2_DB_CONTAINER??"";
assert.match(network,/^libread-issue137-b2-[A-Za-z0-9_-]+-loopback$/);
assert.match(db,/^[a-f0-9]{12,64}$/);
const foundIds=execFileSync("docker",["ps","-q","--filter","network="+network],
 {encoding:"utf8",timeout:10000}).trim().split(/\s+/);
assert.ok(foundIds.includes(db),"must be disposable local PostgreSQL");
for(const k of ["SUPABASE_SERVICE_ROLE_KEY","NEXT_PUBLIC_SUPABASE_URL",
 "NEXT_PUBLIC_SUPABASE_ANON_KEY","SUPABASE_HUMAN_RECORDING_BUCKET"])
 assert.equal(process.env[k],undefined,"hosted credentials forbidden");
const anon=process.env.B2_ANON_KEY??"",service=process.env.B2_SERVICE_KEY??"";
assert.ok(anon.length>15&&service.length>15&&anon!==service);
const origin=base.origin,bucket="f2p-tus-app-authority-local";
const clientOpts={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
const admin=createClient(origin,service,clientOpts),id=()=>randomUUID();
const chunk=6*1024*1024,total=chunk+96;
const good=Buffer.alloc(total,0x42),wrong=Buffer.alloc(total,0x25);
for(const b of [good,wrong]){b.write("RIFF",0);b.write("WAVE",8);}
const hash=x=>createHash("sha256").update(x).digest("hex");
let assertions=0,observed=0,risks=0;
function yes(value,message){assert.ok(value,message);assertions++;}
function sql(statement){
 return execFileSync("docker",["exec",db,"psql","-X","-q","-t","-A",
 "-v","ON_ERROR_STOP=1","-U","postgres","-d","postgres","-c",statement],
 {encoding:"utf8",timeout:15000,stdio:["ignore","pipe","pipe"]}).trim();
}
function uuid(s){assert.match(s,/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);return "'"+s+"'::uuid";}
function literal(s){assert.match(s,/^[a-z0-9_-]+$/);return "'"+s+"'";}
function note(label,value){observed++;console.log("OBSERVED: TUS APP LOCAL "+label+" "+value);}
function risk(label,value){risks++;console.log("RISK: TUS APP LOCAL "+label+" "+value);}
async function actor(){
 const email="app-tus-"+id()+"@example.invalid",password="App-"+id()+"A!1";
 const made=await admin.auth.admin.createUser({email,password,email_confirm:true});
 assert.equal(made.error,null,"create synthetic user");
 const client=createClient(origin,anon,clientOpts);
 const login=await client.auth.signInWithPassword({email,password});
 assert.equal(login.error,null,"real GoTrue sign in");
 yes(typeof login.data.session?.access_token==="string","local JWT created");
 const uid=made.data.user.id;
 const user=await admin.from("users").insert({id:uid,display_name:"SYNTHETIC"});
 assert.equal(user.error,null,"profile created");
 const c=await admin.from("user_recording_consents").insert({
  user_id:uid,consent_key:"recording_studio_global",consent_version:"2026-04-16"});
 assert.equal(c.error,null,"current consent created");
 return {id:uid,jwt:login.data.session.access_token,client};
}
async function row(table,data){
 const result=await admin.from(table).insert(data);
 assert.equal(result.error,null,"seed "+table);
}
async function alter(table,values,key,value){
 const o=await admin.from(table).update(values).eq(key,value);
 assert.equal(o.error,null,"mutate synthetic "+table);
}
function lease(actor,seriesId,episodeId,extras={}){
 const leaseId=id(),path="owner/"+actor.id+"/series/"+seriesId+
 "/episode/"+episodeId+"/"+leaseId+".wav";
 const state=extras.state??"active",sha=extras.sha??hash(good);
 const expire=extras.expired?"clock_timestamp()-interval '1 second'":"clock_timestamp()+interval '10 minutes'";
 sql("insert into libread_internal.issue137_tus_app_leases"+
 "(lease_id,actor_id,series_id,episode_id,object_path,expected_sha256,state,expires_at) values ("+
 [uuid(leaseId),uuid(actor.id),uuid(seriesId),uuid(episodeId),"'"+path+"'", "'"+sha+"'",literal(state),expire].join(",")+")");
 return {id:leaseId,path};
}
function putMeta(path){
 return ["bucketName "+Buffer.from(bucket).toString("base64"),
 "objectName "+Buffer.from(path).toString("base64"),
 "contentType "+Buffer.from("audio/wav").toString("base64")].join(",");
}
const root=origin+"/storage/v1/upload/resumable";
function scoped(location){
 const target=new URL(location,root);
 assert.equal(target.origin,origin,"No remote redirect permitted");
 assert.ok(target.pathname.startsWith("/storage/v1/upload/resumable/"),
 "Resume path must be local");
 return target.toString();
}
async function raw(uri,method,jwt,headers={},body){
 const a=await fetch(uri,{method,headers:{apikey:anon,
  "tus-resumable":"1.0.0",...(jwt?{authorization:"Bearer "+jwt}:{}),...headers},
  ...(body!==undefined?{body}:{}),cache:"no-store",redirect:"error",
  signal:AbortSignal.timeout(18000)});
 const result={status:a.status,offset:Number(a.headers.get("upload-offset")??"-1"),
  location:a.headers.get("location")};
 await a.arrayBuffer();
 return result;
}
async function begin(path,jwt){
 const a=await raw(root,"POST",jwt,{"upload-length":String(total),
 "upload-metadata":putMeta(path)});
 return {...a,url:a.status===201?scoped(a.location):null};
}
async function patch(uri,jwt,offset,blob){
 return raw(uri,"PATCH",jwt,{"upload-offset":String(offset),
  "content-type":"application/offset+octet-stream"},blob);
}
async function physical(path){
 const res=await admin.storage.from(bucket).download(path);
 return res.error?null:Buffer.from(await res.data.arrayBuffer());
}
async function clean(path){
 const res=await admin.storage.from(bucket).remove([path]);
 assert.equal(res.error,null,"cleanup synthetic object");
}
async function attemptDenied(label,l,jwt){
 const created=await begin(l.path,jwt);
 if(created.url){
  const first=await patch(created.url,jwt,0,good.subarray(0,chunk));
  if(first.status===204){
   const last=await patch(created.url,jwt,chunk,good.subarray(chunk));
   yes(last.status!==204,label+" MUST deny final TUS commit");
   note(label,"POST 201 first 204 final "+last.status);
  }else{
   yes(first.status!==204,label+" MUST deny first TUS PATCH");
   note(label,"POST 201 first "+first.status);
  }
 }else{
  yes(created.status!==201,label+" POST denied");
  note(label,"POST "+created.status);
 }
 yes((await physical(l.path))===null,label+" no PRIVATE object");
}
async function beginPart(l,actor){
 const open=await begin(l.path,actor.jwt);
 yes(open.status===201,"authorized TUS POST 201 got "+open.status);
 const first=await patch(open.url,actor.jwt,0,good.subarray(0,chunk));
 yes(first.status===204&&first.offset===chunk,"authorized partial PATCH 204");
 return open.url;
}
async function deniedAfterPart(label,l,actor,mutate,restore){
 const uri=await beginPart(l,actor);
 await mutate();
 const final=await patch(uri,actor.jwt,chunk,good.subarray(chunk));
 yes(final.status===403,label+" must be 403 (observed "+final.status+")");
 yes((await physical(l.path))===null,label+" no committed object");
 note(label,"PATCH 403; physical missing");
 if(restore)await restore();
}
async function complete(l,actor,data=good){
 const uri=await beginPart(l,actor);
 const state=await raw(uri,"HEAD",actor.jwt);
 yes([200,204].includes(state.status)&&state.offset===chunk,
  "TUS resume HEAD offset persists");
 const done=await patch(uri,actor.jwt,chunk,data.subarray(chunk));
 yes(done.status===204&&done.offset===total,"TUS final PATCH completes");
 const bytes=await physical(l.path);
 yes(bytes?.length===total&&hash(bytes)===hash(data),"physical full SHA readback");
 const publicGet=await fetch(origin+"/storage/v1/object/public/"+bucket+"/"+l.path,{
  headers:{apikey:anon},redirect:"error",signal:AbortSignal.timeout(12000)});
 yes(publicGet.status>=400&&publicGet.status<500,"no public read");
 await clean(l.path);
}
const owner=await actor(),narrator=await actor(),stranger=await actor();
const seriesId=id(),episodeId=id(),otherSeries=id(),otherEpisode=id();
await row("series",{id:seriesId,author_id:owner.id,publication_status:"public",
 content_rating:"general",content_warnings:[],recording_permission_mode:"open"});
await row("episodes",{id:episodeId,series_id:seriesId,body:"SYNTHETIC",posting_status:"posted",is_published:true});
await row("series",{id:otherSeries,author_id:stranger.id,publication_status:"public",
 content_rating:"general",content_warnings:[],recording_permission_mode:"open"});
await row("episodes",{id:otherEpisode,series_id:otherSeries,body:"SYNTHETIC 2",posting_status:"posted",is_published:true});
const b=await admin.storage.getBucket(bucket);
yes(b.error===null&&b.data?.public===false,"dedicated bucket physically PRIVATE");
// The synthetic lease ledger is NOT writable to the ordinary user role.
const grants=sql("select has_table_privilege('authenticated',"+
 "'libread_internal.issue137_tus_app_leases','INSERT')");
yes(grants==="f","ordinary users cannot allocate their own trusted leases");

// A normal narrator may record on an open, posted public series.
await complete(lease(narrator,seriesId,episodeId),narrator);
await attemptDenied("anonymous",lease(narrator,seriesId,episodeId),null);
await attemptDenied("different JWT on narrator lease",
 lease(narrator,seriesId,episodeId),stranger.jwt);
// Path is canonical but claimed episode belongs to a different series.
await attemptDenied("cross-series episode",lease(narrator,seriesId,otherEpisode),narrator.jwt);
// Unprovisioned client path (real TUS accepts arbitrary metadata but lease must exist).
await attemptDenied("missing server lease",{path:"owner/"+narrator.id+
 "/series/"+seriesId+"/episode/"+episodeId+"/"+id()+".wav"},narrator.jwt);
await attemptDenied("revoked server lease",lease(narrator,seriesId,episodeId,{state:"revoked"}),narrator.jwt);
await attemptDenied("expired server lease",lease(narrator,seriesId,episodeId,{expired:true}),narrator.jwt);

// Actual recordingEntry normalize: approval_required -> closed; no legacy approvals.
for(const mode of ["closed","approval_required"]){
 await alter("series",{recording_permission_mode:mode},"id",seriesId);
 await attemptDenied(mode+" narrator",lease(narrator,seriesId,episodeId),narrator.jwt);
 await attemptDenied(mode+" author",lease(owner,seriesId,episodeId),owner.jwt);
}
await alter("series",{recording_permission_mode:"open"},"id",seriesId);

// Public visibility and episode ownership: author may stage own unpublished work.
await alter("series",{publication_status:"private"},"id",seriesId);
await attemptDenied("private series nonowner",lease(narrator,seriesId,episodeId),narrator.jwt);
await complete(lease(owner,seriesId,episodeId),owner);
await alter("series",{publication_status:"public"},"id",seriesId);
await alter("episodes",{posting_status:"draft",is_published:false},"id",episodeId);
await attemptDenied("draft episode nonowner",lease(narrator,seriesId,episodeId),narrator.jwt);
await complete(lease(owner,seriesId,episodeId),owner);
await alter("episodes",{posting_status:"posted",is_published:true},"id",episodeId);

// R18 through exact user profile flags and *both* canonical series markers.
await alter("series",{content_rating:"r18",content_warnings:["sexual_r18"]},"id",seriesId);
await attemptDenied("R18 display OFF",lease(narrator,seriesId,episodeId),narrator.jwt);
await alter("users",{show_r18_content:true},"id",narrator.id);
await attemptDenied("R18 ON but unconfirmed",lease(narrator,seriesId,episodeId),narrator.jwt);
await alter("users",{r18_confirmed_at:new Date().toISOString()},"id",narrator.id);
await complete(lease(narrator,seriesId,episodeId),narrator);
// Disabling R18 mid-stream must block provider commit.
await deniedAfterPart("R18 switched OFF",lease(narrator,seriesId,episodeId),narrator,
 ()=>alter("users",{show_r18_content:false},"id",narrator.id));
await alter("users",{show_r18_content:true},"id",narrator.id);
// Content warning alone, even when content_rating is general, is treated as R18.
await alter("series",{content_rating:"general",content_warnings:["sexual_r18"]},"id",seriesId);
await alter("users",{show_r18_content:false},"id",narrator.id);
await attemptDenied("sexual_r18 warning alone",lease(narrator,seriesId,episodeId),narrator.jwt);
await alter("series",{content_rating:"general",content_warnings:[]},"id",seriesId);

// Revocation of actual app records after first chunk and before TUS final PATCH.
await deniedAfterPart("real consent_version revoked",lease(narrator,seriesId,episodeId),narrator,
 ()=>alter("user_recording_consents",{consent_version:"2026-04-15"},"user_id",narrator.id),
 ()=>alter("user_recording_consents",{consent_version:"2026-04-16"},"user_id",narrator.id));
await deniedAfterPart("recording_permission_mode closed",lease(narrator,seriesId,episodeId),narrator,
 ()=>alter("series",{recording_permission_mode:"closed"},"id",seriesId),
 ()=>alter("series",{recording_permission_mode:"open"},"id",seriesId));
await deniedAfterPart("series publication revoked",lease(narrator,seriesId,episodeId),narrator,
 ()=>alter("series",{publication_status:"private"},"id",seriesId),
 ()=>alter("series",{publication_status:"public"},"id",seriesId));
await deniedAfterPart("episode unpublished",lease(narrator,seriesId,episodeId),narrator,
 ()=>alter("episodes",{is_published:false},"id",episodeId),
 ()=>alter("episodes",{is_published:true},"id",episodeId));
const expired=lease(narrator,seriesId,episodeId);
await deniedAfterPart("upload lease revoked",expired,narrator,
 async()=>sql("update libread_internal.issue137_tus_app_leases set state='revoked' where lease_id="+uuid(expired.id)));
// Revoked GoTrue session cannot authorize an old JWT at final PATCH.
const logged=lease(narrator,seriesId,episodeId);
await deniedAfterPart("real GoTrue logout",logged,narrator,async()=>{
 const result=await narrator.client.auth.signOut({scope:"global"});
 assert.equal(result.error,null,"GoTrue global logout");
 yes(sql("select count(*) from auth.sessions where user_id="+uuid(narrator.id))==="0",
  "GoTrue deleted narrator's session");
});

// Provider RLS cannot validate file SHA: a legitimately authorized actor can
// deliberately send different bytes with same length (trusted app must verify).
const altered=lease(owner,seriesId,episodeId);
const alternateUrl=await begin(altered.path,owner.jwt);
yes(alternateUrl.status===201,"authorized alternate-byte TUS initialized");
const first=await patch(alternateUrl.url,owner.jwt,0,wrong.subarray(0,chunk));
yes(first.status===204,"altered first chunk accepted");
const finished=await patch(alternateUrl.url,owner.jwt,chunk,wrong.subarray(chunk));
yes(finished.status===204,"altered last chunk accepted");
const saved=await physical(altered.path);
yes(saved!==null&&hash(saved)===hash(wrong)&&hash(saved)!==hash(good),
 "provider accepted different bytes despite ledger expected SHA");
risk("provider byte SHA not enforced by Storage RLS","authorized client submitted different same-size WAV");
await clean(altered.path);
console.log("PASS: F2-P REAL LOCAL APP-AUTH TUS "+assertions+" checks, "+observed+
 " denied/observed cases; real series/episodes/users/consents/session, "+
 " server-allocated lease, private resume, R18 and revocations");
console.log("HOLD: "+risks+" verified provider-integrity risk(s); no production "+
 " rights grant attestation, immutable provider SHA, alternate service_role fence, "+
 " full 1GiB memory/timeout test or live Next.js integration");
