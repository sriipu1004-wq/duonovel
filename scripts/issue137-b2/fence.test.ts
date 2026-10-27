import assert from "node:assert/strict";
import { readEpochGuardedCatalog } from "../../src/lib/publicCatalogEpochFence";

type Card = { id: string; title: string; rating: "general" | "r18"; publication: "public" | "private" };
let revision=1;
let live:Card[]=[{ id:"work-1",title:"SYNTHETIC PUBLIC TITLE",rating:"general",publication:"public" }];
const shared=new Map<number,Card[]>();
let builds=0;
const loadCached=async (epoch:number):Promise<Card[]>=>{
 if(shared.has(epoch)) return shared.get(epoch)!;
 builds++;
 const snapshot=live.filter(x=>x.rating==="general"&&x.publication==="public").map(x=>({...x}));
 shared.set(epoch,snapshot);
 return snapshot;
};
const readRevision=async()=>revision;
const direct=async()=>live.filter(x=>x.rating==="general"&&x.publication==="public").map(x=>({...x}));
const read=()=>readEpochGuardedCatalog(readRevision,loadCached,direct);

async function main() {
assert.equal((await read())[0].title,"SYNTHETIC PUBLIC TITLE");
assert.equal((await read())[0].title,"SYNTHETIC PUBLIC TITLE");
assert.equal(builds,1,"unchanged revision retains hot cache");
// R18 classification may leave the OLD cache entry intact; it must be unreachable.
live=[{...live[0],rating:"r18"}];revision++;
assert.deepEqual(await read(),[],"old general title forbidden after R18");
assert.equal(shared.get(1)?.[0].title,"SYNTHETIC PUBLIC TITLE");
const oldEpoch=revision;
live=[{...live[0],rating:"general",title:"SYNTHETIC NEW TITLE"}];revision++;
let raced=false;
const inFlight=await readEpochGuardedCatalog(readRevision,async e=>{
 const result=await loadCached(e);
 if(!raced){raced=true;live=[{...live[0],publication:"private"}];revision++;}
 return result;
},direct);
assert.deepEqual(inFlight,[],"in-flight publication withdrawal must retry");
assert.ok(revision>oldEpoch);
assert.deepEqual(await read(),[],"later request must not restore withdrawn card");
// Regression: epoch changes AFTER cached-card retrieval, while a delayed
// viewer or HTML/RSC projection resolves. Final check must run AFTER projection.
revision++;
live=[{id:"work-1",title:"POST FENCE SYNTHETIC",rating:"general",publication:"public"}];
let afterCacheDuringViewer=false;
const finalViewerChecked=await readEpochGuardedCatalog(readRevision,async epoch=>{
 const cards=await loadCached(epoch);
 await Promise.resolve(); // simulate viewer/headers rendering async work
 if(!afterCacheDuringViewer){
   afterCacheDuringViewer=true;
   live=[{...live[0],publication:"private",rating:"r18"}];
   revision++;
 }
 return cards;
},direct);
assert.deepEqual(finalViewerChecked,[],"post-cache viewer work must be included inside epoch fence");
assert.equal(afterCacheDuringViewer,true);
// First deployment with unprovisioned revision RPC must bypass shared cache.
let unversionedRead=false;
const fallback=await readEpochGuardedCatalog(async()=>null,async()=>{throw Error("shared cache forbidden");},async()=>{unversionedRead=true;return []});
assert.equal(unversionedRead,true);assert.deepEqual(fallback,[]);
// A revision disappearing mid-request is a hard error.
await assert.rejects(
  readEpochGuardedCatalog(async()=>revision,async()=>{revision++;return [];},direct,1),
  /catalog_epoch_changed_during_read/
);
let epochReads=0;
await assert.rejects(
  readEpochGuardedCatalog(async()=>{epochReads++;return epochReads===1?1:null},async()=>[],direct),
  /catalog_epoch_disappeared/
);
await assert.rejects(
  readEpochGuardedCatalog(async()=>{throw Error("DB unavailable")},loadCached,direct),
  /DB unavailable/
);
console.log("PASS: 13 F1 SOURCE/runtime assertions (epoch cache, R18 withdrawal, race and failures)");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
