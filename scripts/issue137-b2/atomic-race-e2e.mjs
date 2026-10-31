// Issue #137: two independent real LOCAL PostgREST HTTP transactions per race.
// DISPOSABLE synthetic users/rows only. No Production, media, hosted SQL or keys.
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
// tsx may expose the TypeScript module as CommonJS in this repo's package mode.
const humanStateModule=await import("../../src/lib/recording/humanRecordingState.ts");
const {isHumanRecordingRow,isPublishedHumanRecording}=
  humanStateModule.default??humanStateModule;
assert.equal(typeof isHumanRecordingRow,"function","real Human classifier loaded");
assert.equal(typeof isPublishedHumanRecording,"function","real published Human classifier loaded");

assert.equal(process.env.B2_EPHEMERAL_CONFIRM, "local-only");
assert.equal(process.env.DO_NOT_CONTACT_PRODUCTION, "true");
const endpoint=new URL(process.env.B2_LOCAL_URL||"");
assert.equal(endpoint.protocol,"http:");
assert.ok(["localhost","127.0.0.1","[::1]"].includes(endpoint.hostname));
assert.ok(["54321","54331"].includes(endpoint.port));
const anon=process.env.B2_ANON_KEY,admin=process.env.B2_SERVICE_KEY;
assert.ok(anon&&admin&&anon!==admin);
const base=endpoint.origin, uuid=()=>randomUUID();
let assertions=0;
async function call(path,{method="GET",key=admin,token=key,body}={}){
  const headers={apikey:key,Authorization:"Bearer "+token,Prefer:"return=representation"};
  if(body!==undefined)headers["Content-Type"]="application/json";
  const response=await fetch(base+path,{
    method,headers,signal:AbortSignal.timeout(12000),
    body:body===undefined?undefined:JSON.stringify(body)
  });
  const raw=await response.text();
  let data;try{data=raw?JSON.parse(raw):null;}catch{data=raw;}
  return {status:response.status,data};
}
function pass(res,name,codes=[200,201]){
  assert.ok(codes.includes(res.status),name+" status="+res.status+" code="+String(res.data?.code??""));
  assertions++;return res.data;
}
function rejected(res,name,code){
  assert.ok(res.status>=400&&res.status<500,name+" must fail closed, status="+res.status);
  if(code)assert.equal(res.data?.message,code,name+" must reject for the intended reason");
  assertions++;
}
const newId=uuid(),password="B2-local-"+uuid()+"-A!92";
const ownerEmail="issue137-race-owner-"+newId+"@example.invalid";
const otherEmail="issue137-race-other-"+newId+"@example.invalid";
const user=pass(await call("/auth/v1/admin/users",{method:"POST",
 body:{email:ownerEmail,password,email_confirm:true}
}),"synthetic local owner");
const otherUser=pass(await call("/auth/v1/admin/users",{method:"POST",
 body:{email:otherEmail,password,email_confirm:true}
}),"synthetic local other owner");
const owner=user.id,other=otherUser.id;
async function signIn(email,id,label){
 const session=pass(await call("/auth/v1/token?grant_type=password",{
   method:"POST",key:anon,token:anon,body:{email,password}
 }),label+" session");
 assert.equal(session.user?.id,id,label+" JWT identity");assertions++;
 const current=pass(await call("/auth/v1/user",{
   method:"GET",key:anon,token:session.access_token
 }),label+" signed-in user");
 assert.equal(current.id,id,label+" real authenticated identity");assertions++;
 return session.access_token;
}
const ownerToken=await signIn(ownerEmail,owner,"owner");
const otherToken=await signIn(otherEmail,other,"other");
async function work(){
  const series=uuid(),episode=uuid();
  pass(await call("/rest/v1/series",{method:"POST",
    body:{id:series,author_id:owner,publication_status:"public",content_rating:"general"}
  }),"synthetic series",[201]);
  pass(await call("/rest/v1/episodes",{method:"POST",
    body:{id:episode,series_id:series,posting_status:"posted",is_published:true,body:"SYNTHETIC RACE"}
  }),"synthetic episode",[201]);
  return {series,episode};
}
const readerName="Synthetic Human Reader";
function humanPath(w,id,suffix=""){
 return "human/"+w.series+"/"+w.episode+"/"+owner+"/"+id+suffix+"/playback-from-mp3.m4a";
}
function row(w,id,isPublic=true,alias=owner){
  return {id,series_id:w.series,episode_id:w.episode,
    reader_id:owner,reader_user_id:alias,reader_name:readerName,
    voice_model_id:null,is_public:isPublic,audio_storage_path:humanPath(w,id)};
}
async function postRow(record){return call("/rest/v1/recordings",{method:"POST",body:record});}
async function patch(id,changes){
  return call("/rest/v1/recordings?id=eq."+id,{method:"PATCH",body:changes});
}
async function rows(w){
  const data=pass(await call("/rest/v1/recordings?select=id,reader_id,reader_user_id,reader_name,voice_model_id,is_public,audio_storage_path&episode_id=eq."+w.episode),
    "read synthetic recordings");
  for (const record of data) {
    assert.equal(isHumanRecordingRow(record),true,"real SOURCE classifier accepts local Human row");
    assert.equal(isPublishedHumanRecording(record),record.is_public===true,"real SOURCE public Human classifier");
    assert.equal(record.reader_name,readerName,"Human narrator remains named");
    assert.equal(record.voice_model_id,null,"Human voice has no AI voice model");
    assertions+=4;
  }
  return data;
}
function rpc(w,expected,action,id,more={}){
  return call("/rest/v1/rpc/issue137_b2_race_commit",{method:"POST",body:{
    p_series_id:w.series,p_episode_id:w.episode,p_owner_id:owner,
    p_expected_generation:expected,p_recording_id:id,p_action:action,...more
  }});
}
async function generation(w){
  const result=pass(await call("/rest/v1/issue137_b2_race_generation?select=generation"+
    "&series_id=eq."+w.series+"&episode_id=eq."+w.episode+"&owner_id=eq."+owner),"read local generation");
  return result[0]?.generation??null;
}
// SOURCE classifier must reject AI, nameless and non-Human-provenance rows.
{
 const sample=row({series:uuid(),episode:uuid()},uuid());
 assert.equal(isHumanRecordingRow(sample),true);
 assert.equal(isHumanRecordingRow({...sample,voice_model_id:"ai-model"}),false);
 assert.equal(isHumanRecordingRow({...sample,reader_name:""}),false);
 assert.equal(isHumanRecordingRow({...sample,audio_storage_path:"r18-private:race/x.wav"}),false);
 assert.equal(isPublishedHumanRecording({...sample,is_public:false}),false);
 assertions+=5;
}
// Negative CONTROL: existing direct service-role PostgREST INSERT is not fenced.
{
  const w=await work(),priv=uuid(),pub=uuid();
  assert.equal((await rows(w)).length,0,"pre-upload snapshot was empty");assertions++;
  pass(await postRow(row(w,priv,false)),"late private recording",[201]);
  pass(await postRow(row(w,pub,true)),"stale public bypass recording",[201]);
  const observed=await rows(w);
  assert.equal(observed.length,2);assert.equal(observed.find(r=>r.id===priv).is_public,false);
  assert.equal(observed.find(r=>r.id===pub).is_public,true);assertions++;
}
console.log("CONTROL: real local PostgREST allows stale empty snapshot -> private plus public INSERT");
// Negative CONTROL: boolean publication CAS cannot observe true->false->true ABA.
{
  const w=await work(),id=uuid(),original=row(w,id);
  pass(await postRow(original),"ABA initial public",[201]);
  pass(await patch(id,{is_public:false}),"ABA withdrawal");
  pass(await patch(id,{is_public:true}),"ABA republish");
  const filter=new URLSearchParams({
    id:"eq."+id,series_id:"eq."+w.series,episode_id:"eq."+w.episode,
    reader_id:"eq."+owner,reader_name:"eq."+readerName,voice_model_id:"is.null",
    is_public:"is.true",audio_storage_path:"eq."+original.audio_storage_path
  });
  const response=pass(await call("/rest/v1/recordings?"+filter,{method:"PATCH",
    body:{audio_storage_path:humanPath(w,id,"-stale")}}),"stale boolean CAS");
  assert.equal(response.length,1);assertions++;
}
console.log("CONTROL: real local PostgREST boolean CAS accepts ABA");
// Negative CONTROL: the current final CAS does not include legacy alias.
{
  const w=await work(),id=uuid(),original=row(w,id);
  pass(await postRow(original),"alias baseline",[201]);
  pass(await patch(id,{reader_user_id:other}),"concurrent legacy owner alias change");
  const filter=new URLSearchParams({
    id:"eq."+id,series_id:"eq."+w.series,episode_id:"eq."+w.episode,
    reader_id:"eq."+owner,reader_name:"eq."+readerName,voice_model_id:"is.null",
    is_public:"is.true",audio_storage_path:"eq."+original.audio_storage_path
  });
  const response=pass(await call("/rest/v1/recordings?"+filter,{method:"PATCH",
    body:{audio_storage_path:humanPath(w,id,"-stale")}}),"stale owner CAS");
  assert.equal(response.length,1);assert.equal(response[0].reader_user_id,other);assertions++;
}
console.log("CONTROL: real local PostgREST CAS permits alias drift (privileged synthetic writer)");
// CANDIDATE: only opt-in RPC writes increment durable owner-scope generation.
{
  const w=await work(),priv=uuid(),pub=uuid();
  assert.equal(await generation(w),null,"absent scope must have NO generation row");assertions++;
  assert.equal(pass(await rpc(w,0,"insert",priv,{p_is_public:false}),"private RPC insert"),1);assertions++;
  rejected(await rpc(w,0,"insert",pub,{p_is_public:true}),"N1 stale public RPC","B2_RACE_STALE_GENERATION");
  rejected(await rpc(w,1,"insert",pub,{p_is_public:true}),"N1 fresh but private-state RPC","B2_RACE_PRIVATE_ROW");
  assert.equal(await generation(w),1,"rejected RPC must roll back scope generation");assertions++;
  assert.equal((await rows(w)).length,1);assert.equal(await generation(w),1);assertions++;
}
{
  const w=await work(),id=uuid();
  assert.equal(pass(await rpc(w,0,"insert",id,{p_is_public:true}),"ABA candidate insert"),1);assertions++;
  assert.equal(pass(await rpc(w,1,"visibility",id,{p_is_public:false}),"ABA candidate withdraw"),2);assertions++;
  assert.equal(pass(await rpc(w,2,"visibility",id,{p_is_public:true}),"ABA candidate republish"),3);assertions++;
  rejected(await rpc(w,1,"replace",id),"ABA stale replace","B2_RACE_STALE_GENERATION");
  assert.equal(await generation(w),3);assertions++;
}
{
  const w=await work(),id=uuid();
  assert.equal(pass(await rpc(w,0,"insert",id,{p_is_public:true}),"alias candidate insert"),1);assertions++;
  assert.equal(pass(await rpc(w,1,"alias",id,{p_alias_id:other}),"alias candidate change"),2);assertions++;
  rejected(await rpc(w,1,"replace",id),"alias stale replace","B2_RACE_STALE_GENERATION");
  rejected(await rpc(w,2,"replace",id),"alias conflicting owner","B2_RACE_OWNER_OR_ROW_CONFLICT");
  assert.equal((await rows(w))[0].reader_user_id,other);assertions++;
}
{
  const w=await work(),a=uuid(),b=uuid();
  // Real two PostgREST HTTP transactions overlap. Row lock must serialize them.
  const both=await Promise.all([
    rpc(w,0,"insert",a,{p_is_public:true,p_hold_ms:300}),
    rpc(w,0,"insert",b,{p_is_public:true,p_hold_ms:300})
  ]);
  assert.equal(both.filter(x=>x.status===200).length,1);
  const failed=both.find(x=>x.status!==200);
  rejected(failed,"concurrent stale second writer","B2_RACE_STALE_GENERATION");
  assert.equal(await generation(w),1);assert.equal((await rows(w)).length,1);assertions++;
}
{
  const w=await work(),id=uuid(),newTake=uuid();
  assert.equal(pass(await rpc(w,0,"insert",id,{p_is_public:true}),"delete case insert"),1);assertions++;
  assert.equal(pass(await rpc(w,1,"delete",id),"delete increments generation"),2);assertions++;
  rejected(await rpc(w,1,"insert",newTake,{p_is_public:true}),"deleted tombstone stale replay","B2_RACE_STALE_GENERATION");
  assert.equal((await rows(w)).length,0);assert.equal(await generation(w),2);assertions++;
}
{
  const w=await work(),a=uuid(),b=uuid();
  assert.equal(pass(await rpc(w,0,"insert",a,{p_is_public:true}),"first allowed public take"),1);assertions++;
  assert.equal(pass(await rpc(w,1,"insert",b,{p_is_public:true}),"second allowed public take"),2);assertions++;
  assert.equal((await rows(w)).length,2);assertions++;
  rejected(await rpc(w,2,"visibility",uuid(),{p_is_public:false}),
    "missing recording cannot report successful update","B2_RACE_OWNER_OR_ROW_CONFLICT");
  assert.equal(await generation(w),2);assertions++;
  const attempt={p_series_id:w.series,p_episode_id:w.episode,p_owner_id:owner,
    p_expected_generation:2,p_recording_id:a,p_action:"delete"};
  for(const [label,token] of [["anon",anon],["authenticated owner",ownerToken],
      ["authenticated other owner",otherToken]]){
    const response=await call("/rest/v1/rpc/issue137_b2_race_commit",{
      method:"POST",key:anon,token,body:attempt});
    rejected(response,label+" cannot execute restricted RPC");
    assert.ok([401,403,404].includes(response.status),
      label+" must be denied at EXECUTE privilege boundary");assertions++;
  }
  const noGrantRead=await call("/rest/v1/issue137_b2_race_generation?select=generation",{
    key:anon,token:otherToken});
  rejected(noGrantRead,"other authenticated user cannot read private epoch");
  const forged=await rpc(w,0,"delete",a,{p_owner_id:other});
  rejected(forged,"wrong owner identifier cannot mutate canonical row",
    "B2_RACE_OWNER_OR_ROW_CONFLICT");
  assert.equal(await generation(w),2,"denied owner write must not change genuine generation");assertions++;
}
{
  const w=await work(),pub=uuid(),privateTake=uuid();
  assert.equal(pass(await rpc(w,0,"insert",pub,{p_is_public:true}),"public take inserted"),1);assertions++;
  assert.equal(pass(await rpc(w,1,"insert",privateTake,{p_is_public:false}),"other private take inserted"),2);assertions++;
  rejected(await rpc(w,2,"replace",pub),
    "public replacement denied when another private take exists","B2_RACE_PRIVATE_ROW");
  assert.equal(await generation(w),2,"private-take rejection rolls back without epoch change");assertions++;
  const got=await rows(w);
  assert.equal(got.length,2);assert.equal(got.find(x=>x.id===pub).audio_storage_path,humanPath(w,pub));
  assert.equal(got.find(x=>x.id===privateTake).is_public,false);assertions+=3;
}
{
  const w=await work(),id=uuid();
  assert.equal(pass(await rpc(w,0,"insert",id,{p_is_public:true}),"cross-action candidate insert"),1);assertions++;
  const both=await Promise.all([
    rpc(w,1,"visibility",id,{p_is_public:false,p_hold_ms:300}),
    rpc(w,1,"replace",id,{p_hold_ms:300})
  ]);
  assert.equal(both.filter(x=>x.status===200).length,1,
    "concurrent public withdrawal and replacement cannot both commit");assertions++;
  rejected(both.find(x=>x.status!==200),"cross-action stale writer","B2_RACE_STALE_GENERATION");
  assert.equal(await generation(w),2);assertions++;
  const got=await rows(w);
  assert.equal(got.length,1);
  assert.ok(got[0].is_public===false || got[0].audio_storage_path===humanPath(w,id,"-replacement"),
    "only one of the competing writes committed");assertions+=2;
}
console.log("PASS: "+assertions+" real LOCAL PostgreSQL/PostgREST synthetic race assertions");
console.log("SYNTHETIC ONLY: candidate RPC is opt-in, service-role direct writes bypass it;");
console.log("NOT proof of Production schema, actual Human publisher, R18 rollout or full race closure");
