// Issue #138 — REAL local GoTrue signatures + PostgREST owner/anon boundaries.
// Synthetic isolated fixture imports verbatim function bodies from live
// pg_get_functiondef (captured read-only). This is NOT production execution.
// A successful bypass here is a candidate requiring hosted negative validation
// in a strictly authorized test setting before any release/remediation.
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";

const endpoint=process.env.I138_LOCAL_URL,anon=process.env.I138_ANON_KEY;
const service=process.env.I138_SERVICE_KEY;
assert.equal(process.env.I138_EPHEMERAL_CONFIRM,"local-only");
assert.equal(process.env.DO_NOT_CONTACT_PRODUCTION,"true");
assert.ok(endpoint&&anon&&service&&anon!==service);
const ep=new URL(endpoint);
assert.equal(ep.protocol,"http:");
assert.ok(["127.0.0.1","localhost","[::1]"].includes(ep.hostname));
assert.ok(["54321","54331"].includes(ep.port));
assert.equal(ep.username,"");assert.equal(ep.password,"");
assert.equal(ep.pathname,"/");assert.equal(ep.search,"");
let checks=0;
const yes=(condition,label)=>{assert.ok(condition,label);checks++};
const uuid=()=>randomUUID();
async function api(path,method="GET",jwt=anon,body=undefined,headers={}){
 const r=await fetch(ep.origin+path,{method,headers:{apikey:anon,
  Authorization:"Bearer "+jwt,...headers},...(body===undefined?{}:{
   body:JSON.stringify(body),
   headers:{apikey:anon,Authorization:"Bearer "+jwt,
    "content-type":"application/json",...headers}}),
  signal:AbortSignal.timeout(15000),redirect:"error"});
 const str=await r.text();let data;
 try{data=str?JSON.parse(str):null}catch{data=null}
 return {status:r.status,body:data};
}
async function actor(){
 const email="issue138-"+uuid()+"@example.invalid";
 const password="OnlyLocal-I138-"+uuid()+"Aa1!";
 const c=await api("/auth/v1/admin/users","POST",service,{
  email,password,email_confirm:true});
 assert.ok([200,201].includes(c.status),"local GoTrue admin create (redacted)");
 const a=await api("/auth/v1/token?grant_type=password","POST",anon,{email,password});
 assert.equal(a.status,200,"real local GoTrue sign-in");
 assert.equal(a.body.user.id,c.body.id,"JWT signed identity");
 yes(a.body.access_token!==anon&&a.body.access_token!==service,
  "real JWT cannot equal public/service API key");
 return {id:c.body.id,jwt:a.body.access_token};
}
const owners={a:await actor(),b:await actor()};
const a=owners.a,b=owners.b;
function path(table,query=""){return "/rest/v1/"+table+(query?"?"+query:"")}
function query(id){return "id=eq."+encodeURIComponent(id)+"&select=id,owner_user_id,import_status,source_char_count,chapter_count"}
const insertHeader={"Prefer":"return=representation"};
const patchHeader={"Prefer":"return=representation"};
const deniedOrEmpty=(r,label)=>{
 yes([400,401,403,404,200,204].includes(r.status)&&
  !((r.status===200||r.status===201) && Array.isArray(r.body)&&r.body.length>0),
  label+" cannot expose/mutate owned row");
};
const works="private_library_works",chapters="private_library_chapters";
const aWork=uuid();
const create=await api(path(works),"POST",a.jwt,{
 id:aWork,owner_user_id:a.id,title:"Synthetic owner A",source_type:"txt",
 source_language:"ja",source_char_count:50,chapter_count:2,
 section_count:1,import_status:"uploading"
},insertHeader);
yes(create.status===201&&create.body?.[0]?.id===aWork,
 "owner A can create own uploading work");
const anonGet=await api(path(works,query(aWork)));
deniedOrEmpty(anonGet,"anonymous SELECT");
const bGet=await api(path(works,query(aWork)),"GET",b.jwt);
yes(bGet.status===200&&Array.isArray(bGet.body)&&bGet.body.length===0,
 "owner B cannot SELECT owner A work");
const bUpdate=await api(path(works,"id=eq."+aWork+"&select=id"),
 "PATCH",b.jwt,{import_status:"ready"},patchHeader);
deniedOrEmpty(bUpdate,"owner B UPDATE");
const bChapter=await api(path(chapters),"POST",b.jwt,{
 work_id:aWork,chapter_number:1,title:"B forged chapter",
 body:"B attempted foreign write",source_char_count:25
},insertHeader);
yes([400,401,403,404].includes(bChapter.status),
 "owner B cannot INSERT chapter into owner A work");
const forgedWork=await api(path(works),"POST",b.jwt,{
 owner_user_id:a.id,title:"B spoof owner ID",source_type:"txt",
 source_language:"ja",source_char_count:50,chapter_count:1,
 section_count:1,import_status:"uploading"
},insertHeader);
yes([400,401,403].includes(forgedWork.status),
 "owner B cannot INSERT owner A work by forging owner_user_id");
const stillA=await api(path(works,query(aWork)),"GET",a.jwt);
yes(stillA.status===200&&stillA.body.length===1&&
 stillA.body[0].import_status==="uploading",
 "foreign mutation did not change owner A work");

// The actual frozen SECURITY DEFINER complete RPC checks exact chapter counts,
// section counts and declared source size. It MUST reject empty import.
const incomplete=await api(path("rpc/complete_private_library_import"),"POST",a.jwt,
 {p_work_id:aWork});
yes(incomplete.status>=400,"owner A complete-import RPC rejects 0/2 chapters");
const foreignComplete=await api(path("rpc/complete_private_library_import"),"POST",b.jwt,
 {p_work_id:aWork});
yes(foreignComplete.status>=400,"owner B complete-import RPC rejects owner A work");
const foreignAbort=await api(path("rpc/abort_private_library_import"),"POST",b.jwt,
 {p_work_id:aWork});
yes(foreignAbort.status===200&&foreignAbort.body===false,
 "owner B abort-import RPC cannot delete owner A work");
const anonBegin=await api(path("rpc/begin_private_library_import"),"POST",anon,{
 p_title:"NoAnon",p_author_name:"X",p_source_type:"txt",p_source_language:"ja",
 p_original_file_name:"test.txt",p_source_char_count:50,p_unit_count:1,p_section_count:1
});
yes([400,401,403,404].includes(anonBegin.status),
 "anonymous cannot call authenticated-only begin import RPC");
const nestedQuota=await api(path("rpc/reserve_libread_daily_ai_action"),"POST",a.jwt,{
 p_request_id:uuid(),p_user_id:b.id,p_anonymous_key:null,p_action_type:"library_import",
 p_free_limit:100,p_subscriber_limit:100
});
yes([400,401,403,404].includes(nestedQuota.status),
 "ordinary JWT cannot call privileged quota reserver directly");

// The suspected bypass: owner A can mark 0/2 chapters READY via direct UPDATE.
// Import quota trigger still counts it; this is NOT a free-action bypass claim.
const directReady=await api(path(works,"id=eq."+aWork+"&select=id,import_status"),
 "PATCH",a.jwt,{import_status:"ready"},patchHeader);
yes(directReady.status===200&&directReady.body?.[0]?.import_status==="ready",
 "RISK PROVED IN LOCAL FIXTURE: direct self UPDATE completes zero-chapter work");
const count=await api(path(works,query(aWork)),"GET",a.jwt);
yes(count.status===200&&count.body.length===1&&
 count.body[0].import_status==="ready"&&count.body[0].chapter_count===2,
 "direct READY persists despite declared chapter count mismatch");

// No aggregate chapter sum trigger: direct writes may exceed declared
// source_char_count without using append RPC. Each unit stays below 6000.
for(let i=1;i<=2;i++){
 const text="X".repeat(120);
 const ins=await api(path(chapters),"POST",a.jwt,{
  work_id:aWork,chapter_number:i,title:"synthetic chapter "+i,
  body:text,source_char_count:text.length,
  section_number:1,section_title:"SECTION",part_number:i,part_count:2
 },insertHeader);
 yes(ins.status===201&&ins.body.length===1,
  "RISK PROVED IN LOCAL FIXTURE: direct owner chapter INSERT "+i);
}
const chaptersActual=await api(path(chapters,
 "work_id=eq."+aWork+"&select=source_char_count"),"GET",a.jwt);
const total=chaptersActual.body?.reduce((s,x)=>s+x.source_char_count,0);
yes(chaptersActual.status===200&&total===240&&total>50,
 "RISK PROVED IN LOCAL FIXTURE: 240 stored chars exceed declared work 50");
const directDeclared=await api(path(works,"id=eq."+aWork+"&select=source_char_count"),
 "PATCH",a.jwt,{source_char_count:1},patchHeader);
yes(directDeclared.status===200&&directDeclared.body?.[0]?.source_char_count===1,
 "RISK PROVED IN LOCAL FIXTURE: owner can rewrite own declared total after READY");

// Positive regression: legitimate client still can title PATCH and own DELETE.
const ownPatch=await api(path(works,"id=eq."+aWork+"&select=id,title"),
 "PATCH",a.jwt,{title:"合法な作品名変更"},patchHeader);
yes(ownPatch.status===200&&ownPatch.body?.[0]?.title==="合法な作品名変更",
 "legitimate owner title edit remains allowed");

// Control comparison: another work follows RPC start→append→complete.
const start=await api(path("rpc/begin_private_library_import"),"POST",a.jwt,{
 p_title:"Control Valid",p_author_name:"A",p_source_type:"txt",
 p_source_language:"ja",p_original_file_name:"valid.txt",
 p_source_char_count:10,p_unit_count:1,p_section_count:1
});
yes(start.status===200&&typeof start.body==="string",
 "legitimate owner begins import with real SQL RPC");
const unit={title:"Unit",body:"abcdefghij",sectionNumber:1,
 sectionTitle:"SECTION",partNumber:1,partCount:1};
const over=await api(path("rpc/append_private_library_import_units"),"POST",a.jwt,{
 p_work_id:start.body,p_start_unit_number:1,
 p_units:[{...unit,body:"abcdefghijklmno"}]
});
yes(over.status>=400,
 "legitimate import RPC rejects more characters than declared");
const append=await api(path("rpc/append_private_library_import_units"),"POST",a.jwt,{
 p_work_id:start.body,p_start_unit_number:1,p_units:[unit]
});
yes(append.status===200&&append.body===1,
 "legitimate RPC append persists exact declared chars");
const complete=await api(path("rpc/complete_private_library_import"),"POST",a.jwt,
 {p_work_id:start.body});
yes(complete.status===200&&complete.body===start.body,
 "legitimate RPC complete persists fully validated work");
const bDelete=await api(path(works,"id=eq."+aWork+"&select=id"),"DELETE",b.jwt,
 undefined,{"Prefer":"return=representation"});
deniedOrEmpty(bDelete,"foreign DELETE");
const ownDelete=await api(path(works,"id=eq."+aWork+"&select=id"),"DELETE",a.jwt,
 undefined,{"Prefer":"return=representation"});
yes(ownDelete.status===200&&ownDelete.body?.[0]?.id===aWork,
 "legitimate owner DELETE and chapter cascade still works");
const after=await api(path(works,query(aWork)),"GET",a.jwt);
yes(after.status===200&&after.body.length===0,"own DELETE removes only own work");

// No identifiers, credentials, bearer or true user records leave local output.
console.log("PASS: I138 REAL LOCAL GoTrue/PostgREST "+checks+
 " checks: A/B/anon denied; real RPC completeness/size checks; "+
 "owner direct READY/oversize bypass replicated; valid title/delete preserved.");
console.log("RISK: isolated exact-function-body replica, NOT a real hosted exploitation test; "+
 "direct quota-event count remains unmeasured by user JWT.");
