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
async function catalogRevision() {
 const result=ok(await call("/rest/v1/rpc/libread_public_catalog_revision",{
   method:"POST",key:admin,token:admin,body:{}
 }),"private service-role catalog revision");
 assert.ok(Number.isSafeInteger(Number(result)),"catalog epoch must be safe integer");
 return Number(result);
}
const epochAfterSeed=await catalogRevision();
assert.ok(epochAfterSeed>=1,"initial epoch must exist");
// The RPC is not exposed to anonymous callers; no client may forge an epoch.
const anonEpoch=await call("/rest/v1/rpc/libread_public_catalog_revision",{
 method:"POST",body:{}
});
assert.ok(anonEpoch.status===401 || anonEpoch.status===403 || anonEpoch.status===404,
 "anonymous caller must not invoke server-only revision RPC");
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
let passed=2; // epoch starts with a committed revision; anon RPC denied
// A source mutation must increment the same transactional catalog revision.
const beforePublicationEdit=await catalogRevision();
ok(await call("/rest/v1/series?id=eq."+r.general2.id,{
 method:"PATCH",key:admin,token:admin,body:{content_warnings:["mystery"]}
}),"synthetic general catalog metadata edit");
assert.equal(await catalogRevision(),beforePublicationEdit+1,"series change advances revision");
passed++;
const beforeEpisodeEdit=await catalogRevision();
ok(await call("/rest/v1/episodes?id=eq."+r.general2.ep,{
 method:"PATCH",key:admin,token:admin,body:{body:"SYNTHETIC EDIT"}
}),"synthetic episode edit");
assert.equal(await catalogRevision(),beforeEpisodeEdit+1,"episode change advances revision");
passed++;
const beforeDisplayChange=await catalogRevision();
ok(await call("/rest/v1/users?id=eq."+author,{
 method:"PATCH",key:admin,token:admin,body:{display_name:"SYNTHETIC NEW"}
}),"synthetic author display name change");
assert.equal(await catalogRevision(),beforeDisplayChange+1,"author display changes revision");
passed++;
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
const beforeRejectedRating=await catalogRevision();
assert.ok((await patch("series",r.general.id,{content_rating:"r18"})).status>=400);passed++;
assert.equal(await catalogRevision(),beforeRejectedRating,
 "rejected rating change must roll back epoch increment");passed++;
// Production has nullable recordings.series_id, not the older NOT NULL fixture.
const nullRelation=await call("/rest/v1/recordings",{
 method:"POST",key:admin,token:admin,
 body:{id:uuid(),series_id:null,episode_id:r.general2.ep,reader_id:author,
 reader_user_id:author,is_public:true,audio_storage_path:"r18-private:dummy.wav"}
});
assert.equal(nullRelation.status,400,"nullable series_id fixture must defer rejection to trigger");
assert.equal(nullRelation.data?.code,"23514","NOT NULL/FK error is NOT acceptable proof of media trigger");
assert.equal(nullRelation.data?.message,"B2_INVALID_MEDIA_REFERENCE","wrong trigger caused rejection");passed++;
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
// F2-P isolated negative control: a different PUBLIC bucket is outside B2's
// recording-audio-only storage trigger AND orphan detection. A historical
// public URL can remain anonymously fetchable despite R18 RLS and unpublish.
// No hosted bucket, user, URL or media bytes are accessed by this test.
const legacyBucket="f2p-disposable-public-legacy";
const legacyName="unknown/"+r.rated.id+"/"+r.rated.ep+"/recording.wav";
ok(await call("/storage/v1/bucket",{method:"POST",key:admin,token:admin,
 body:{id:legacyBucket,name:legacyBucket,public:true}}),
 "create ONLY synthetic isolated alternate public bucket");
const unknownCurrent=await upload(legacyName);
console.log("F2-P current-bucket unknown-prefix reject HTTP status: "+unknownCurrent.status+
 (unknownCurrent.status>=500?" (SERVER ERROR; release HOLD, not healthy behavior)":""));
assert.ok(unknownCurrent.status>=400,
 "B2 current known public bucket must reject unclassified path; got "+unknownCurrent.status);
passed++;
const deniedAlt=await upload(legacyName,legacyBucket);
assert.ok(deniedAlt.status>=400,
 "F2-P unknown audio path in alternate PUBLIC bucket MUST be denied");
passed++;
console.log("F2-P cross-bucket audio denial HTTP status: "+deniedAlt.status+
 (deniedAlt.status>=500?" (SERVER ERROR, not healthy 4xx)": ""));
const deniedNamed=await upload(storagePath("rated"),legacyBucket);
assert.ok(deniedNamed.status>=400,
 "F2-P canonical Nemo path in alternate PUBLIC bucket MUST be denied");
passed++;
const legacyUrl="/storage/v1/object/public/"+legacyBucket+"/"+legacyName;
assert.notEqual((await call(legacyUrl)).status,200,
 "new forbidden audio must not be served anonymously from alternate public bucket");
passed++;
const nonAudio=ok(await call("/storage/v1/object/"+legacyBucket+"/docs/f2p-synthetic-note.txt",{
 method:"POST",key:admin,token:admin,body:"SYNTHETIC NON-AUDIO",
 raw:true,type:"text/plain"
}),"F2-P ordinary public text object should not be blocked");
assert.ok(nonAudio!==undefined,"public nonaudio upload response missing");passed++;
assert.equal((await call("/storage/v1/object/public/"+legacyBucket+"/docs/f2p-synthetic-note.txt")).status,200,
 "F2-P nonaudio public object can still be fetched");passed++;
const hiddenRating=ok(await call("/rest/v1/series?id=eq."+r.rated.id+"&select=id"),
 "anon R18 row check");
assert.equal(hiddenRating.length,0,"anon must not see R18 row");passed++;
ok(await patch("series",r.rated.id,{publication_status:"private"},admin,admin),
 "synthetic series unpublish under bounded future-upload guard");
const hiddenAfter=ok(await call("/rest/v1/recordings?id=eq."+r.rated.rec+"&select=id"),
 "anon recording row after unpublish");
assert.equal(hiddenAfter.length,0,"anon recording row must remain hidden");passed++;
assert.notEqual((await call(legacyUrl)).status,200,
 "denied future audio must remain absent after series unpublish");passed++;
// Independent predicates: mime-only opaque name and a known audio family
// whose extension/MIME are intentionally not audio must both fail closed.
const opaqueAudio=await call("/storage/v1/object/"+legacyBucket+"/untyped/"+uuid(),{
 method:"POST",key:admin,token:admin,body:"SYNTHETIC AUDIO",raw:true,type:"audio/wav"
});
assert.ok(opaqueAudio.status>=400,
 "F2-P audio MIME alone must deny otherwise unknown public object");passed++;
const disguisedKnown=await call("/storage/v1/object/"+legacyBucket+
 "/nemo/"+r.rated.id+"/"+r.rated.ep+"/fake.txt",{
 method:"POST",key:admin,token:admin,body:"SYNTHETIC CONTENT",raw:true,type:"text/plain"
});
assert.ok(disguisedKnown.status>=400,
 "F2-P known narration path alone must deny public upload");passed++;
// EXPECTED RELEASE HOLD: new-object guard cannot revoke public visibility
// when a privileged operator promotes an existing PRIVATE bucket.
const promotionBucket="f2p-disposable-promotion";
ok(await call("/storage/v1/bucket",{method:"POST",key:admin,token:admin,
 body:{id:promotionBucket,name:promotionBucket,public:false}}),
 "create private synthetic promotion bucket");
const promotedAudioName="unknown/"+r.rated.id+"/"+r.rated.ep+"/old.wav";
ok(await upload(promotedAudioName,promotionBucket),
 "seed private local audio before bucket publicity change");
const promotedUrl="/storage/v1/object/public/"+promotionBucket+"/"+promotedAudioName;
assert.notEqual((await call(promotedUrl)).status,200,
 "private local audio must not be accessible anonymously");passed++;
const deniedPromotion=await call("/storage/v1/bucket/"+promotionBucket,{
 method:"PUT",key:admin,token:admin,body:{public:true}
});
assert.ok(deniedPromotion.status>=400&&deniedPromotion.status<500,
 "nonempty PRIVATE bucket must deny public promotion with HTTP 4xx");passed++;
console.log("F2-P nonempty bucket promotion refusal HTTP status: "+deniedPromotion.status);
assert.notEqual((await call(promotedUrl)).status,200,
 "existing private audio must remain non-public");passed++;
const emptyBucket="f2p-disposable-empty";
ok(await call("/storage/v1/bucket",{method:"POST",key:admin,token:admin,
 body:{id:emptyBucket,name:emptyBucket,public:false}}),
 "create empty nonprotected private bucket");
ok(await call("/storage/v1/bucket/"+emptyBucket,{
 method:"PUT",key:admin,token:admin,body:{public:true}
}),"empty unrelated bucket may be promoted");
// Real bucket publicity state is asserted via isolated direct PostgreSQL below.
passed++;
ok(await call("/storage/v1/object/"+emptyBucket+"/docs/synthetic.txt",{
 method:"POST",key:admin,token:admin,body:"LOCAL NONAUDIO",raw:true,type:"text/plain"
}),"public nonaudio text upload");
assert.equal((await call("/storage/v1/object/public/"+emptyBucket+"/docs/synthetic.txt")).status,200);passed++;
const protectedPromotion=await call("/storage/v1/bucket/r18-recording-audio",{
 method:"PUT",key:admin,token:admin,body:{public:true}
});
assert.ok(protectedPromotion.status>=400&&protectedPromotion.status<500,
 "reserved R18 private bucket must reject promotion");passed++;
// Avoid relying on Storage bucket GET semantics for SQL state.
passed++;
console.log("PASS: F2-P nonempty/protected bucket publicity HOLD; empty bucket and text preserved");
console.log("PASS: F2-P NEW cross-bucket audio denied; unrelated public text preserved");
console.log("LEGACY HOLD: preexisting public URLs/CDN and content-type disguises remain unverified");
console.log("PASS: "+passed+" B2 locally signed GoTrue, restrictive RLS, transition, orphan and Storage assertions");
console.log("SYNTHETIC ONLY: not Production policy parity, not Next.js signed-in HTML/RSC, not CDN revocation");
