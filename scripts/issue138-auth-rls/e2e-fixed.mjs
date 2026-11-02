// Issue #138 fixed-state E2E: local-only after the REAL proposed migration.
// Exactly signed GoTrue A/B JWTs + anonymous + PostgREST; not hosted users/data.
// Any unexpected permission or loss of the legitimate product path is a failure.
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";

assert.equal(process.env.DO_NOT_CONTACT_PRODUCTION,"true");
assert.equal(process.env.I138_EPHEMERAL_CONFIRM,"local-only");
const url=new URL(process.env.I138_LOCAL_URL??"");
const anon=process.env.I138_ANON_KEY??"";
const service=process.env.I138_SERVICE_KEY??"";
assert.equal(url.protocol,"http:");
assert.ok(["localhost","127.0.0.1","[::1]"].includes(url.hostname));
assert.ok(["54321","54331"].includes(url.port));
assert.equal(url.pathname,"/");assert.equal(url.search,"");
assert.ok(anon.length>15&&service.length>15&&service!==anon);
const uuid=()=>randomUUID();
let checks=0;
function check(x,why){assert.ok(x,why);checks++}
async function http(path,method="GET",token=anon,body=undefined,header={}){
 const res=await fetch(url.origin+path,{
  method,headers:{apikey:anon,Authorization:"Bearer "+token,
   ...(body===undefined?{}:{"content-type":"application/json"}),...header},
  body:body===undefined?undefined:JSON.stringify(body),
  signal:AbortSignal.timeout(15000),redirect:"error"
 });
 const raw=await res.text();
 let value=null;try{value=raw?JSON.parse(raw):null}catch{}
 return {status:res.status,data:value};
}
function q(table,params=""){return "/rest/v1/"+table+(params?"?"+params:"")}
async function identity(){
 const email="issue138-fixed-"+uuid()+"@example.invalid";
 const password="OnlyLocal-I138-"+uuid()+"Bb9!";
 const create=await http("/auth/v1/admin/users","POST",service,{email,password,email_confirm:true});
 check([200,201].includes(create.status)&&!!create.data.id,"local synthetic user created");
 const login=await http("/auth/v1/token?grant_type=password","POST",anon,{email,password});
 check(login.status===200&&login.data.user?.id===create.data.id&&
  !!login.data.access_token&&login.data.access_token!==service,
  "real signed GoTrue JWT matches synthetic subject");
 return {id:create.data.id,jwt:login.data.access_token};
}
const a=await identity(),b=await identity();
const reported={};
function forbidden(r,label){
 check([400,401,403,404].includes(r.status),
  label+" blocked by privilege/RLS; observed HTTP "+r.status);
}
const startPayload=(title,chars,units)=>({
 p_title:title,p_author_name:"Author A",p_source_type:"txt",p_source_language:"ja",
 p_original_file_name:"owned.txt",p_source_char_count:chars,
 p_unit_count:units,p_section_count:1
});
const starting=await http(q("rpc/begin_private_library_import"),"POST",a.jwt,
 startPayload("Owned incomplete",50,2));
check(starting.status===200&&typeof starting.data==="string",
 "begin import still works via SECURITY DEFINER");
const work=starting.data;
const foreign=await http(q("private_library_works","id=eq."+work+"&select=id"),"GET",b.jwt);
check(foreign.status===200&&Array.isArray(foreign.data)&&foreign.data.length===0,
 "owner B cannot read owner A work");
const anonRead=await http(q("private_library_works","id=eq."+work+"&select=id"));
check([200,401,403].includes(anonRead.status)&&
 !(Array.isArray(anonRead.data)&&anonRead.data.length>0),
 "anonymous cannot read private work");
const bComplete=await http(q("rpc/complete_private_library_import"),"POST",b.jwt,
 {p_work_id:work});
forbidden(bComplete,"foreign complete RPC");
const incomplete=await http(q("rpc/complete_private_library_import"),"POST",a.jwt,
 {p_work_id:work});
forbidden(incomplete,"incomplete own RPC");
const forgeInsert=await http(q("private_library_works"),"POST",a.jwt,{
 owner_user_id:a.id,title:"direct INSERT forbidden",source_type:"txt",
 source_language:"ja",source_char_count:50,chapter_count:1,
 section_count:1,import_status:"ready"}, {"Prefer":"return=representation"});
forbidden(forgeInsert,"authenticated direct works INSERT");
const mutations=[
 ["import_status",{import_status:"ready"}],
 ["source_char_count",{source_char_count:1}],
 ["chapter_count",{chapter_count:1}],
 ["section_count",{section_count:1}],
 ["owner_user_id",{owner_user_id:b.id}]
];
for(const [name,body] of mutations){
 const r=await http(q("private_library_works","id=eq."+work+"&select=id"),
  "PATCH",a.jwt,body,{"Prefer":"return=representation"});
 forbidden(r,"direct work critical-field "+name);
}
const bUpdate=await http(q("private_library_works","id=eq."+work+"&select=id"),
 "PATCH",b.jwt,{title:"foreign spoof"},{"Prefer":"return=representation"});
check([200,403,401,404].includes(bUpdate.status)&&
 !(Array.isArray(bUpdate.data)&&bUpdate.data.length),
 "owner B cannot update other work even in permitted title column");

// Direct chapters INSERT/UPDATE/DELETE are all denied, regardless of parent
// ownership. The import RPC SECURITY DEFINER retains its intended access.
const chapterData={work_id:work,chapter_number:1,title:"forged",body:"a".repeat(100),
 source_char_count:100,section_number:1,section_title:"SECTION",
 part_number:1,part_count:2};
const directChapter=await http(q("private_library_chapters"),"POST",a.jwt,
 chapterData,{"Prefer":"return=representation"});
forbidden(directChapter,"owner direct chapter INSERT before READY");
const bChapter=await http(q("private_library_chapters"),"POST",b.jwt,
 chapterData,{"Prefer":"return=representation"});
forbidden(bChapter,"foreign direct chapter INSERT");

// Normal RPC rejects oversized append, then accepts exact-bytes units.
const oversized=await http(q("rpc/append_private_library_import_units"),
 "POST",a.jwt,{p_work_id:work,p_start_unit_number:1,
  p_units:[{title:"TooLong",body:"z".repeat(60),sectionTitle:"SECTION",
   sectionNumber:1,partNumber:1,partCount:2}]});
forbidden(oversized,"normal RPC enforces aggregate declared size");
function unit(i,s){return {title:"Unit "+i,body:s,sectionTitle:"SECTION",
 sectionNumber:1,partNumber:i,partCount:2};}
const append1=await http(q("rpc/append_private_library_import_units"),
 "POST",a.jwt,{p_work_id:work,p_start_unit_number:1,
 p_units:[unit(1,"a".repeat(25))]});
check(append1.status===200&&append1.data===1,
 "normal first authenticated RPC append");
const partial=await http(q("rpc/complete_private_library_import"),
 "POST",a.jwt,{p_work_id:work});
forbidden(partial,"normal RPC rejects 1/2 incomplete chapters");
const append2=await http(q("rpc/append_private_library_import_units"),
 "POST",a.jwt,{p_work_id:work,p_start_unit_number:2,
 p_units:[unit(2,"b".repeat(25))]});
check(append2.status===200&&append2.data===1,"normal second RPC append");
const complete=await http(q("rpc/complete_private_library_import_with_usage"),
 "POST",a.jwt,{p_work_id:work});
check(complete.status===200&&complete.data===work,
 "actual production route wrapper still completes validated import");
const good=await http(q("private_library_works",
 "id=eq."+work+"&select=id,import_status,source_char_count,chapter_count"),"GET",a.jwt);
check(good.status===200&&good.data.length===1&&
 good.data[0].import_status==="ready"&&good.data[0].chapter_count===2&&
 good.data[0].source_char_count===50,
 "validated ready work retains declared values");
const records=await http(q("private_library_chapters",
 "work_id=eq."+work+"&select=id,source_char_count"),"GET",a.jwt);
check(records.status===200&&records.data.length===2&&
 records.data.reduce((a,x)=>a+x.source_char_count,0)===50,
 "normal import chapters match declaration");
const chapterId=records.data[0].id;
for(const [verb,body] of [["PATCH",{body:"tampered"}],["DELETE",undefined]]){
 const r=await http(q("private_library_chapters","id=eq."+chapterId+"&select=id"),
 verb,a.jwt,body,{"Prefer":"return=representation"});
 forbidden(r,"owner direct chapters "+verb+" after READY");
}
const bDelete=await http(q("private_library_works","id=eq."+work+"&select=id"),
 "DELETE",b.jwt,undefined,{"Prefer":"return=representation"});
check([200,401,403,404].includes(bDelete.status)&&
 !(Array.isArray(bDelete.data)&&bDelete.data.length),
 "foreign DELETE does not destroy another work");
const title=await http(q("private_library_works","id=eq."+work+"&select=id,title,author_name"),
 "PATCH",a.jwt,{title:"正規作品名編集",author_name:"正規著者"},
 {"Prefer":"return=representation"});
check(title.status===200&&title.data.length===1&&
 title.data[0].title==="正規作品名編集"&&title.data[0].author_name==="正規著者",
 "authorized title+author editor stays functional");
// Test legacy short-text one-request import RPC (separate product path).
const importText=await http(q("rpc/import_private_library_txt"),"POST",a.jwt,{
 p_title:"Valid TXT import",p_author_name:"A",
 p_source_language:"ja",p_original_file_name:"txt.txt",
 p_chapters:[{title:"Unit1",body:"Hello world"}]
});
check(importText.status===200&&typeof importText.data==="string",
 "legacy single-call TXT import remains usable");
const quota=await http(q("libread_daily_ai_action_logs",
 "user_id=eq."+a.id+"&action_type=eq.library_import&select=id"),"GET",service);
check(quota.status===200&&quota.data.length===2,
 "both completed regular RPC imports charged local daily quota");
const ownDelete=await http(q("private_library_works","id=eq."+work+"&select=id"),
 "DELETE",a.jwt,undefined,{"Prefer":"return=representation"});
check(ownDelete.status===200&&ownDelete.data[0]?.id===work,
 "owner DELETE preserved with cascade even after chapters DELETE revoked");
const orphan=await http(q("private_library_chapters","work_id=eq."+work+"&select=id"),"GET",a.jwt);
check(orphan.status===200&&orphan.data.length===0,
 "deleting work removes its chapters, no new orphan records");
const anonBegin=await http(q("rpc/begin_private_library_import"),"POST",anon,
 startPayload("Anon denial",50,1));
forbidden(anonBegin,"anon cannot start import");
console.log("PASS: ISSUE138_FIXED_REAL_LOCAL signed A/B/anon "+checks+
 " assertions: direct import-critical writes denied; "+
 "valid begin/append/complete/TXT/title/delete/quotas retained, "+
 "foreign ownership and anonymous denied");
