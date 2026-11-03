// #137: LOCAL ONLY, explicit, post-token-expiry PRIVATE stage retirement.
// The simulated 3h aging is performed by a sentinel-guarded psql fixture
// immediately before this script. No Cron, remote Storage or wildcard delete.
import assert from "node:assert/strict";
import {createClient} from "@supabase/supabase-js";
assert.equal(process.env.DO_NOT_CONTACT_PRODUCTION,"true");
assert.equal(process.env.R0_EPHEMERAL_CONFIRM,"local-only");
for(const key of ["SUPABASE_SERVICE_ROLE_KEY","SUPABASE_ACCESS_TOKEN",
 "SUPABASE_DB_PASSWORD","AWS_ACCESS_KEY_ID","AWS_SECRET_ACCESS_KEY"]){
 assert.equal(process.env[key],undefined);
}
const endpoint=new URL(process.env.R0_LOCAL_URL||"");
assert.equal(endpoint.origin,"http://127.0.0.1:54321");
const serviceKey=process.env.R0_SERVICE_KEY||"";
assert.ok(serviceKey.length>30);
const admin=createClient(endpoint.origin,serviceKey,{auth:{
 persistSession:false,autoRefreshToken:false,detectSessionInUrl:false
}});
const store=admin.storage.from("human-recording-audio");
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
let passed=0,denied=0,retired=0;
function yes(ok,msg){assert.ok(ok,msg);passed++;}
function no(ok,msg){assert.ok(ok,msg);denied++;}
const {data:candidates,error}=await admin.rpc(
 "issue137_h2_stage_retire_candidates",{p_limit:20});
assert.equal(error,null,"local-only H2 lease candidate RPC");
yes(Array.isArray(candidates)&&candidates.length===2,
 "only two synthetic aborted leases become eligible after simulated expiry");
for(const lease of candidates){
 for(const key of ["session_id","series_id","episode_id","actor_id"]){
  assert.ok(uuid.test(lease[key]),"candidate malformed UUID or foreign scope");
 }
 assert.equal(lease.source_extension,"webm");
 assert.equal(lease.part_count,1);
 const prefix="human-temp/"+lease.series_id+"/"+lease.episode_id+"/"+
   lease.actor_id+"/"+lease.session_id;
 const allowed=new Set(Array.from({length:lease.part_count},(_,i)=>
   "part-"+String(i+1).padStart(4,"0")+"."+lease.source_extension));
 const list=async()=>{
  const found=[];
  for(let offset=0;offset<=400;offset+=100){
    const res=await store.list(prefix,{limit:100,offset,
      sortBy:{column:"name",order:"asc"}});
    assert.equal(res.error,null,"complete session prefix listing failed");
    const batch=res.data??[];
    for(const item of batch){
      if(!item.id||!allowed.has(item.name)||item.name.includes("/")||
         found.some(x=>x.name===item.name)){
        throw Error("H2_MANIFEST_DRIFT_HOLD: unlisted, nested or duplicated object");
      }
      found.push(item);
    }
    if(found.length>lease.part_count)
      throw Error("H2_MANIFEST_DRIFT_HOLD: more objects than recorded parts");
    if(batch.length<100)return found.sort((x,y)=>x.name.localeCompare(y.name));
  }
  throw Error("H2_MANIFEST_OVERFLOW_HOLD: bounded pagination exhausted");
 };
 const initial=await list();
 const premature=await admin.rpc("issue137_h2_stage_finish_retirement",{
  p_session:lease.session_id
 });
 no(Boolean(premature.error),"cannot finish retirement before authoritative claim");
 const claim=await admin.rpc("issue137_h2_stage_claim_retirement",{
  p_session:lease.session_id
 });
 yes(!claim.error&&claim.data===true,"expired local session claimed, token writes disabled");
 const driftCheck=await list();
 yes(driftCheck.length===initial.length&&
   driftCheck.every((x,i)=>x.name===initial[i].name&&x.id===initial[i].id),
   "exact Storage manifest remains unchanged after claim");
 if(driftCheck.length){
  const protectedPath=prefix+"/"+driftCheck[0].name;
  const stillPrivate=await store.download(protectedPath);
  yes(!stillPrivate.error&&Boolean(stillPrivate.data),
   "matured cleanup candidate remains physically PRIVATE until scoped deletion");
  // The server-side claim alone MUST NOT claim the media was removed.
  const beforeDelete=await admin.rpc("issue137_h2_stage_finish_retirement",{
   p_session:lease.session_id
  });
  no(Boolean(beforeDelete.error),
   "retirement receipt refused while actual Storage object still exists");
  const remove=await store.remove([protectedPath]);
  yes(!remove.error,"only explicitly inventoried synthetic path retired via Storage API");
  const absent=await store.download(protectedPath);
  no(Boolean(absent.error),"scoped original is absent after local Storage API removal");
 }
 yes((await list()).length===0,
  "entire exact temporary session prefix empty after approved local cleanup");
 const finish=await admin.rpc("issue137_h2_stage_finish_retirement",{
  p_session:lease.session_id
 });
 yes(!finish.error&&finish.data===true,
  "server recorded physical absence receipt for claimed local session");
 retired++;
}
const after=await admin.rpc("issue137_h2_stage_retire_candidates",{p_limit:20});
yes(!after.error&&Array.isArray(after.data)&&after.data.length===0,
 "retired sessions no longer appear in local cleanup worklist");
console.log("PASS: H2 local synthetic post-expiry exact-prefix cleanup "+
 retired+" leases, "+passed+" positive / "+denied+" denied checks");
console.log("HOLD: expiry fast-forward is a TEST-ONLY simulation; real CDN, user rights, static S3, provider clock and Production maintenance are NOT exercised");
