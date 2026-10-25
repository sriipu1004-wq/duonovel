// Issue137 B2: REAL local GoTrue JWT + real PostgREST/Storage, synthetic only.
// Never use hosted Supabase URL/keys. No user data, existing files, or secrets.
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
assert.equal(process.env.B2_EPHEMERAL_CONFIRM,"local-only");
const url=new URL(process.env.B2_LOCAL_URL||"");
assert.equal(url.protocol,"http:");
assert.ok(["localhost","127.0.0.1","[::1]"].includes(url.hostname),"REFUSE hosted endpoint");
assert.ok(["54321","54331"].includes(url.port),"REFUSE unexpected port");
const anon=process.env.B2_ANON_KEY,admin=process.env.B2_SERVICE_KEY;
assert.ok(anon && admin && anon!==admin);
const base=url.origin,uuid=()=>randomUUID();
const password="synthetic-B2-"+uuid()+"!xAa3";
async function call(path,{method="GET",token=anon,key=anon,body,raw=false,type="application/json"}={}){
 const headers={apikey:key,Authorization:"Bearer "+token};
 if(body!==undefined)headers["Content-Type"]=type;
 const res=await fetch(base+path,{method,headers,body:body===undefined?undefined:raw?body:JSON.stringify(body),signal:AbortSignal.timeout(12000)});
 const txt=await res.text();let data;
 try{data=txt?JSON.parse(txt):null;}catch{data=txt;}
 return {status:res.status,data};
}
function ok(res,label,codes=[200,201,204]){
 assert.ok(codes.includes(res.status),label+" returned "+res.status+" (body redacted)");
 return res.data;
}
const people={};
for(const type of ["owner","on","off","unconfirmed","noProfile"]){
 const email="issue137-b2-"+uuid()+"@example.invalid";
 const created=ok(await call("/auth/v1/admin/users",{method:"POST",key:admin,token:admin,body:{email,password,email_confirm:true}}),"create synthetic "+type);
 const sign=ok(await call("/auth/v1/token?grant_type=password",{method:"POST",body:{email,password}}),"sign-in synthetic "+type);
 assert.equal(sign.user?.id,created.id);
 people[type]={id:created.id,token:sign.access_token};
}
const r={
 general:{id:uuid(),ep:uuid(),rec:uuid()},
 general2:{id:uuid(),ep:uuid(),rec:uuid()},
 rated:{id:uuid(),ep:uuid(),rec:uuid()},
 warned:{id:uuid(),ep:uuid(),rec:uuid()},
 privateWork:{id:uuid(),ep:uuid(),rec:uuid()},
};
const named=Object.keys(r),author=people.owner.id;
const series=named.map(name=>({
 id:r[name].id,author_id:author,
 publication_status:name==="privateWork"?"private":"public",
 content_rating:name==="rated"?"r18":"general",
 content_warnings:name==="warned"?["sexual_r18"]:[]
}));
const episodes=named.map(name=>({id:r[name].ep,series_id:r[name].id,posting_status:"posted",is_published:true,body:"SYNTHETIC "+name}));
ok(await call("/rest/v1/users",{method:"POST",key:admin,token:admin,body:[
 {id:author,show_r18_content:false,r18_confirmed_at:"2026-01-01T00:00:00Z"},
 {id:people.on.id,show_r18_content:true,r18_confirmed_at:"2026-01-01T00:00:00Z"},
 {id:people.off.id,show_r18_content:false,r18_confirmed_at:"2026-01-01T00:00:00Z"},
 {id:people.unconfirmed.id,show_r18_content:true,r18_confirmed_at:null}
]}),"seed synthetic profiles",[201]);
for(const [table,data] of [["series",series],["episodes",episodes]])
 ok(await call("/rest/v1/"+table,{method:"POST",key:admin,token:admin,body:data}),"seed "+table,[201]);
const storagePath=(key)=>"nemo/"+r[key].id+"/"+r[key].ep+"/audio.wav";
const generalRef=base+"/storage/v1/object/public/recording-audio/"+storagePath("general");
const general2Ref=base+"/storage/v1/object/public/recording-audio/"+storagePath("general2");
const recordings=[
 {id:r.general.rec,series_id:r.general.id,episode_id:r.general.ep,reader_id:author,reader_user_id:author,is_public:true,audio_storage_path:generalRef},
 {id:r.general2.rec,series_id:r.general2.id,episode_id:r.general2.ep,reader_id:author,reader_user_id:author,is_public:true,audio_storage_path:general2Ref},
 ...["rated","warned"].map(name=>({
  id:r[name].rec,series_id:r[name].id,episode_id:r[name].ep,
  reader_id:people.off.id,reader_user_id:people.off.id,is_public:true,
  audio_storage_path:"r18-private:"+storagePath(name)
 }))
];
ok(await call("/rest/v1/recordings",{method:"POST",key:admin,token:admin,body:recordings}),"seed recordings",[201]);
ok(await call("/storage/v1/bucket",{method:"POST",key:admin,token:admin,
 body:{id:"recording-audio",name:"recording-audio",public:true}}),"create local general public bucket");
let passed=0;
async function upload(path,bucket="recording-audio"){
 return call("/storage/v1/object/"+bucket+"/"+path,{
  method:"POST",key:admin,token:admin,body:"SYNTHETIC AUDIO",raw:true,type:"audio/wav"
 });
}
ok(await upload(storagePath("general")),"upload synthetic public general");
ok(await upload(storagePath("general2")),"upload synthetic public general2");
passed+=2;
for(const name of ["rated","warned"]){
 ok(await upload(storagePath(name),"r18-recording-audio"),"upload synthetic private "+name);passed++;
}
async function visible(table,actor,expected,select="id"){
 const token=actor?people[actor].token:anon;
 const result=ok(await call("/rest/v1/"+table+"?select="+encodeURIComponent(select),{token}),"visible "+table);
 const ids=result.map(x=>x.id).sort();
 assert.deepEqual(ids,expected.map(x=>r[x].id).sort(),table+" "+String(actor)+" not correctly isolated");
 passed++;
}
for(const actor of [null,"off","unconfirmed","noProfile"]){
 await visible("series",actor,["general","general2"]);

}
// Episode ID differs from series ID. Verify with correct object projection.
async function episodeIds(actor,expected){
 const token=actor?people[actor].token:anon;
 const data=ok(await call("/rest/v1/episodes?select=id,body",{token}),"episode data");
 assert.deepEqual(data.map(x=>x.id).sort(),expected.map(x=>r[x].ep).sort());passed++;
}
async function recordingIds(actor,expected){
 const token=actor?people[actor].token:anon;
 const data=ok(await call("/rest/v1/recordings?select=id,audio_storage_path",{token}),"recording data");
 assert.deepEqual(data.map(x=>x.id).sort(),expected.map(x=>r[x].rec).sort());passed++;
}
for(const actor of [null,"off","unconfirmed","noProfile"]){
 await episodeIds(actor,["general","general2"]);
 await recordingIds(actor,["general","general2"]);
}
for(const table of ["series","episodes","recordings"]){
 const data=ok(await call("/rest/v1/"+table+"?select=id",{token:people.on.token}),"ON data");
 assert.equal(data.length,4,"ON must see four public works/records");passed++;
}
await visible("series","owner",named);
await episodeIds("owner",named);
await recordingIds("owner",["general","general2","rated","warned"]);
const count=ok(await call("/rest/v1/public_episode_work_summaries?select=series_id,episode_count"),"anon invoker view");
assert.equal(count.length,2);passed++;
const onCounts=ok(await call("/rest/v1/public_episode_work_summaries?select=series_id,episode_count",{token:people.on.token}),"ON invoker view");
assert.equal(onCounts.length,4);passed++;
const invalid=await call("/rest/v1/series?select=id",{token:"invalid-JWT"});
assert.ok([401,403].includes(invalid.status));passed++;
// The private bucket has no browser SELECT grant (authorized proxy is required).
const restrictedStorage=await call("/storage/v1/object/authenticated/r18-recording-audio/"+storagePath("rated"),{token:people.on.token});
assert.notEqual(restrictedStorage.status,200);passed++;
assert.equal((await call("/storage/v1/object/public/recording-audio/"+storagePath("general"))).status,200);passed++;
// A direct privileged episode-to-series reparent must be blocked even when
// publication and rating columns remain unchanged.
const orphanReparent = await patch("episodes",r.general2.ep,{series_id:r.general.id},admin,admin);
assert.ok(orphanReparent.status >= 400,"privileged episode reassignment must be blocked");passed++;
// Concurrent-path guard at SQL boundary: owner AND service_role cannot update
// rating while any linked public recording or orphan public object exists.
async function patch(table,id,fields,token=people.owner.token,key=anon){
 return call("/rest/v1/"+table+"?id=eq."+id,{method:"PATCH",token,key,body:fields});
}
assert.ok((await patch("series",r.general.id,{content_rating:"r18"})).status>=400);passed++;
assert.ok((await patch("series",r.general.id,{content_warnings:["sexual_r18"]},admin,admin)).status>=400);passed++;
assert.ok((await patch("series",r.general.id,{publication_status:"private"})).status>=400);passed++;
assert.ok((await patch("episodes",r.general.ep,{is_published:false})).status>=400);passed++;
// Block a PUBLIC upload to a correctly marked R18 series (before recording row).
assert.ok((await upload(storagePath("rated"))).status>=400);passed++;
// Delete only synthetic row; orphan object MUST still prevent unsafe transition.
ok(await call("/rest/v1/recordings?id=eq."+r.general.rec,{method:"DELETE",key:admin,token:admin}),"delete synthetic DB reference");
assert.ok((await patch("series",r.general.id,{content_rating:"r18"})).status>=400);passed++;
// Remove synthetic public object; only now may classification change.
ok(await call("/storage/v1/object/recording-audio",{method:"DELETE",key:admin,token:admin,body:{prefixes:[storagePath("general")]}}),"remove synthetic object");
assert.notEqual((await call("/storage/v1/object/public/recording-audio/"+storagePath("general"))).status,200);passed++;
ok(await patch("series",r.general.id,{content_rating:"r18"}),"contained synthetic general->R18");passed++;
const anonymousAfter=ok(await call("/rest/v1/series?select=id"),"anon after safe transition");
assert.deepEqual(anonymousAfter.map(x=>x.id).sort(),[r.general2.id].sort());passed++;
// Mutable DB preference revocation, JWT unchanged.
ok(await call("/rest/v1/users?id=eq."+people.on.id,{method:"PATCH",key:admin,token:admin,body:{show_r18_content:false}}),"disable ON");
const offNow=ok(await call("/rest/v1/episodes?select=id",{token:people.on.token}),"same signed JWT after OFF");
assert.deepEqual(offNow.map(x=>x.id).sort(),[r.general2.ep].sort());passed++;
console.log("PASS: "+passed+" B2 locally signed GoTrue, restrictive RLS, transition, orphan and Storage assertions");
console.log("SYNTHETIC ONLY: not Production policy parity, not Next.js signed-in HTML/RSC, not CDN revocation");
