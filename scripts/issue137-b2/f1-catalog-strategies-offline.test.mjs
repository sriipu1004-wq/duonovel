// #137 F1 cache/security/performance strategy comparison.
// OFFLINE synthetic fixtures only: no DB, Vercel, HTTP, user data or credentials.
// The p50/p95 below are controlled loopback-free MOCK timings, not site p95.
import assert from "node:assert/strict";
import {performance} from "node:perf_hooks";
import {setTimeout as delay} from "node:timers/promises";
import {readFileSync} from "node:fs";
import * as fenceMod from "../../src/lib/publicCatalogEpochFence.ts";
import * as ratingMod from "../../src/lib/contentRating.ts";
import * as writingMod from "../../src/features/write/writeShared.ts";
assert.equal(process.env.DO_NOT_CONTACT_PRODUCTION,"true");
for(const key of ["SUPABASE_SERVICE_ROLE_KEY","AWS_SECRET_ACCESS_KEY","B2_SERVICE_KEY"])
 assert.equal(process.env[key],undefined);
const {readEpochGuardedCatalog,retainOnlyFreshlyAuthorizedR18Cards}=fenceMod.default??fenceMod;
const {getSeriesContentRating}=ratingMod.default??ratingMod;
const {getSeriesPublicationStatus,isEpisodePubliclyVisible}=writingMod.default??writingMod;
const src=p=>readFileSync(new URL("../../"+p,import.meta.url),"utf8");
const catalog=src("src/lib/publicWorks.ts");
const fenceSql=src("supabase/migrations/20261026120000_issue137_b2_r18_boundary.sql");
let checks=0;
function ok(x,message){assert.ok(x,message);checks++;}
function eq(actual,expected,message){assert.deepEqual(actual,expected,message);checks++;}
for(const marker of [
 "getDatabasePublicCatalogEpoch","public-base-work-cards-v13-db-epoch-bound",
 "readEpochGuardedCatalog(","getCachedPublicBaseWorkCardsInternal(epoch)",
 "return readUncached()"
].slice(0,4))ok(catalog.includes(marker),"actual PR153 code uses "+marker);
ok(src("src/lib/publicCatalogEpochFence.ts").includes("return readUncached()"),
 "when epoch unprovisioned do not serve shared stale cache");
for(const marker of [
 "after insert or update or delete on public.series",
 "after insert or update or delete on public.episodes",
 "after update of display_name on public.users",
 "set epoch=epoch+1",
 "grant execute on function public.libread_public_catalog_revision() to service_role"
])ok(fenceSql.includes(marker),"draft SQL mutation/authority inventory: "+marker);
ok(catalog.includes("translation_permission_mode"),"card builder reads translation permission");
ok(catalog.includes("source_language"),"card builder reads canonical source language");
ok(catalog.includes("effect_settings"),"card builder reads rights/edition metadata");
ok(catalog.includes("public_episode_numbers"),"card builder reads public episode membership");

function makeWork(){
 return {
  id:"synthetic-series-A",publication_status:"public",title:"SYNTHETIC GENERAL",
  description:"SYNTHETIC SUMMARY",content_rating:"general",
  content_warnings:[],source_language:"ja",translation_permission_mode:"open",
  effect_settings:{sourceProvider:"mock",rightsChecked:false,originalTitle:"mock edition"},
  genres:["fantasy"],tags:["#fantasy"],
 };
}
const base={
 work:makeWork(),
 episode:{series_id:"synthetic-series-A",episode_number:1,posting_status:"posted",is_published:true},
 author:{display_name:"SYNTHETIC AUTHOR"},
 epoch:10,
};
const clone=v=>structuredClone(v);
function card(state){
 const s=state.work,e=state.episode;
 if(getSeriesPublicationStatus(s)!=="public"||
   !isEpisodePubliclyVisible(e)||e.series_id!==s.id||
   !["ja","en","ko"].includes(s.source_language))return null;
 return {
  id:s.id,title:s.title,description:s.description,
  rating:getSeriesContentRating(s),author:s.author_id??state.author.display_name,
  sourceLanguage:s.source_language,
  translationPermission:s.translation_permission_mode,
  rights:JSON.stringify(s.effect_settings),
  genres:JSON.stringify(s.genres),tags:JSON.stringify(s.tags),
  episodeNumber:e.episode_number,
 };
}
function visibleForGeneral(c){return c?.rating==="general"?[c]:[]}
const original=card(base);
ok(original?.rating==="general","real classifier yields general");
const mutations=[
 ["publication withdrawal",s=>s.work.publication_status="private",true],
 ["r18 by content rating",s=>s.work.content_rating="r18",true],
 ["r18 by warning only",s=>s.work.content_warnings=["sexual_r18"],true],
 ["episode unpublish",s=>s.episode.is_published=false,true],
 ["episode draft",s=>s.episode.posting_status="draft",true],
 ["episode reassignment",s=>s.episode.series_id="different-series",true],
 ["original title changed",s=>s.work.title="NEW TITLE",false],
 ["summary changed",s=>s.work.description="NEW SUMMARY",false],
 ["author name changed",s=>s.author.display_name="NEW AUTHOR",false],
 ["source language changed",s=>s.work.source_language="ko",false],
 ["translation permission changed",s=>s.work.translation_permission_mode="closed",false],
 ["rights/edition metadata changed",s=>s.work.effect_settings.originalTitle="other edition",false],
 ["public episode changed",s=>s.episode.episode_number=99,false],
 ["tags changed",s=>s.work.tags=["#new"],false],
];
const stale=clone(original);
let naiveFailures=0,strictRejects=0;
for(const [name,mutate,shouldHide] of mutations){
 const now=clone(base);mutate(now);
 // An ID/public/rating-only "security projection" can still expose old
 // sensitive descriptive attributes, even when it keeps the work visible.
 const minimal=now.work.publication_status==="public"&&
  getSeriesContentRating(now.work)!=="r18"?stale:null;
 const live=visibleForGeneral(card(now));
 if(shouldHide){
  if(name.includes("episode"))ok(minimal!==null,name+" remains unsafely cached by series-only gate");
  else eq(minimal,null,name+" recognized by naive series/rating gate");
 }else{
  eq(minimal?.title,stale.title,name+" naive gate keeps cached presentation");
  ok(live.length===1,name+" live record still eligible");
  ok(JSON.stringify(minimal)!==JSON.stringify(live[0]),
    name+" exposes stale metadata even though status/R18 check passes");
  naiveFailures++;
 }
 // Only a complete authoritative presentation/security comparison can
 // safely reuse the cached bytes. A mismatch MUST suppress cached payload,
 // not simply discard an incomplete projection and emit stale metadata.
 const strict=JSON.stringify(card(now))===JSON.stringify(stale)?stale:null;
 eq(strict,null,name+" strict projection rejects stale cached payload");
 strictRejects++;
}
eq(naiveFailures,8,"eight distinct stale-visible metadata counterexamples");
eq(strictRejects,14,"all content/visibility mutations trigger strict comparison");

// Existing epoch implementation actually guarantees old-key refreshes cannot
// become visible after the revision changes, even if their late fetch writes.
let state=clone(base),cache=new Map(),cacheBuilds=0;
const readRevision=async()=>state.epoch;
const cached=async epoch=>{
 if(cache.has(epoch))return cache.get(epoch);
 const snapshot=visibleForGeneral(card(state));
 cache.set(epoch,snapshot);
 cacheBuilds++;
 return snapshot;
};
const direct=async()=>visibleForGeneral(card(state));
const guarded=()=>readEpochGuardedCatalog(readRevision,cached,direct);
eq((await guarded())[0].title,"SYNTHETIC GENERAL","initial epoch safe");
eq((await guarded())[0].title,"SYNTHETIC GENERAL","warm epoch cache hit");
eq(cacheBuilds,1,"only one build at constant epoch");
const oldResult=cache.get(10);
state.work.publication_status="private";state.epoch++;
eq(await guarded(),[],"invisible after committed publication revision");
eq(oldResult[0].title,"SYNTHETIC GENERAL","old stale cache still exists but is unreachable");
state.work.publication_status="public";
state.work.content_warnings=["sexual_r18"];state.epoch++;
eq(await guarded(),[],"R18 escalation invalidates cached general");
state.work.content_warnings=[];
state.work.title="NEW EPOCH TITLE";state.epoch++;
eq((await guarded())[0].title,"NEW EPOCH TITLE","next revision resolves changed public title");
let mutatedDuringViewer=false;
const raced=await readEpochGuardedCatalog(readRevision,async epoch=>{
 const result=await cached(epoch);
 if(!mutatedDuringViewer){
  mutatedDuringViewer=true;
  state.work.publication_status="private";
  state.epoch++;
 }
 return result;
},direct);
eq(raced,[],"late withdrawal during viewer work requires new epoch after check");
await assert.rejects(readEpochGuardedCatalog(
 async()=>state.epoch,
 async()=>{state.epoch++;return oldResult},
 direct,2),/catalog_epoch_changed_during_read/);checks++;
let directReads=0;
eq(await readEpochGuardedCatalog(async()=>null,async()=>{throw Error("no stale")},
 async()=>{directReads++;return []}),[],"missing RPC uses direct fresh read");
eq(directReads,1,"fallback must do actual DB work, not empty success");
await assert.rejects(readEpochGuardedCatalog(async()=>{
 throw Error("revision DB unavailable");
},cached,direct),/revision DB unavailable/);checks++;
const general={contentRating:"general",id:"normal"};
const r18={contentRating:"r18",id:"restricted"};
eq(await retainOnlyFreshlyAuthorizedR18Cards([general,r18],"u1",
 async()=>false),[general],"R18 revoked removes private metadata");
eq(await retainOnlyFreshlyAuthorizedR18Cards([general,r18],"u1",
 async()=>{throw Error("unavailable")}),[general],"fresh R18 failure fails closed");

// Explain the unavoidable last-validation-to-serialization race, not a green
// guarantee of zero stale bytes in concurrent distributed transactions.
let postCheckRace=clone(base);
const versionBefore=postCheckRace.epoch;
const cBefore=card(postCheckRace);
postCheckRace.epoch++;
postCheckRace.work.publication_status="private";
eq(versionBefore+1,postCheckRace.epoch,"mutation can commit after last epoch read");
ok(cBefore.title==="SYNTHETIC GENERAL",
 "in-flight response snapshot may already exist; no atomic stream gate");

// Controlled performance proxies: 120 synthetic works, 120 published episode
// summaries, 120 public-author rows; actual historical 3284 episodes are NOT
// all fetched when a published-only summary view is available.
const workloads={
 freshFull:{reads:3,series:120,summaries:120,authors:120,epochs:0},
 idRatingOnly:{reads:1,series:120,summaries:0,authors:0,epochs:0},
 strictProjection:{reads:3,series:120,summaries:120,authors:120,epochs:0},
 epochWarm:{reads:2,series:0,summaries:0,authors:0,epochs:2},
 epochCold:{reads:5,series:120,summaries:120,authors:120,epochs:2},
 epochUnprovisioned:{reads:4,series:120,summaries:120,authors:120,epochs:1},
};
eq(workloads.epochWarm.series,0,"hot versioned cache no card rows");
ok(workloads.strictProjection.reads===workloads.freshFull.reads,
 "fully authoritative projection still needs comparable per-request data reads");
ok(workloads.epochCold.reads>workloads.freshFull.reads,
 "epoch cold miss requires both revision and full build");
let sample=[];
const syntheticDelay=ms=>delay(ms);
for(const name of ["freshFull","idRatingOnly","strictProjection","epochWarm","epochCold"]){
 const times=[];
 for(let i=0;i<16;i++){
  const start=performance.now();
  const work=workloads[name];
  // Simulated fixed 2ms per network round trip. Bulk cost is NOT modeled.
  for(let j=0;j<work.reads;j++)await syntheticDelay(2);
  times.push(performance.now()-start);
 }
 times.sort((a,b)=>a-b);
 sample.push({name,dbRoundtrips:workloads[name].reads,
  authoritativeRows:workloads[name].series+workloads[name].summaries+
   workloads[name].authors,
  mockP50Ms:+times[7].toFixed(2),mockP95Ms:+times[15].toFixed(2)});
}
console.log("PASS: #137 F1 catalog strategy SOURCE+MODEL "+checks+
 " assertions, stale metadata negatives="+naiveFailures+
 ", epoch/withdrawal/R18/ABA and missing-revision fail-closed");
console.log("MOCK_ONLY #137 catalog 120-work roundtrip model "+JSON.stringify(sample));
console.log("HOLD: MOCK p50/p95 are local fixed-delay measurements, NOT database, "+
 "Vercel or real p95; no 5xx denominators, proof of every mutation trigger, "+
 "atomic response consistency, or authorized publication change");
