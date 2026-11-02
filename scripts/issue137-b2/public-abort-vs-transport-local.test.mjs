// Issue #137 S4: bounded SOURCE + localhost reproduction, NEVER Production.
// Differentiates a delayed local abort callback from a raw TCP reset.
// Observations are synthetic, not a causal diagnosis of Vercel, gateway or DB.
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {performance} from "node:perf_hooks";
import {setTimeout as delay} from "node:timers/promises";
import {publicReadFetch,classifyPublicReadEndpoint} from "../../src/lib/supabase/serverPublic.ts";

assert.equal(process.env.DO_NOT_CONTACT_PRODUCTION,"true");
for(const key of ["SUPABASE_SERVICE_ROLE_KEY","SUPABASE_S3_ACCESS_KEY",
 "S3_ACCESS_KEY_ID","AWS_SECRET_ACCESS_KEY","B2_SERVICE_KEY"])
 assert.equal(process.env[key],undefined,"no live credentials inherited");
const originalFetch=globalThis.fetch,originalWarn=console.warn;
let count=0;
const warnings=[];
function ok(expr,message){assert.ok(expr,message);count++;}
function equal(a,b,message){assert.equal(a,b,message);count++;}
console.warn=(tag,fields)=>{
 if(tag==="[public-db-local-timeout]")warnings.push(fields);
 else originalWarn(tag,fields);
};
const server=createServer((request,response)=>{
 if(request.url==="/rest/v1/series"){
  // This intentionally destroys a LOCAL TCP socket before any HTTP headers.
  request.socket.destroy();
  return;
 }
 response.writeHead(200,{"content-type":"application/json"});
 response.end("[]");
});
let listening=false;
try{
 await new Promise((resolve,reject)=>{
  server.once("error",reject);
  server.listen(0,"127.0.0.1",resolve);
 });
 listening=true;
 const addr=server.address();
 assert.ok(addr&&typeof addr==="object");
 const base="http://127.0.0.1:"+addr.port;
 equal(classifyPublicReadEndpoint(base+"/rest/v1/series"),"series",
  "real source allowlist recognizes only endpoint name");
 equal(classifyPublicReadEndpoint(base+"/rest/v1/anything-secret"),"other",
  "unknown endpoint is not logged with path");
 const happy=await publicReadFetch(base+"/rest/v1/episodes");
 equal(happy.status,200,"real publicReadFetch can complete localhost response");
 equal(warnings.length,0,"no spurious timeout on fast localhost response");
 let reset;
 try{await publicReadFetch(base+"/rest/v1/series");}
 catch(error){reset=error;}
 ok(reset instanceof Error,"real localhost pre-header TCP reset rejects fetch");
 ok(/fetch failed/i.test(reset.message),
  "fast transport reset reports fetch failed, not local deadline");
 equal(warnings.length,0,"fast transport failure does not emit local-deadline warning");
 const upstream=new AbortController();
 upstream.abort();
 const requested=[];
 // No external socket used below: globalThis.fetch is a deterministically
 // injected fake dependency used only while invoking current SOURCE function.
 globalThis.fetch=async (_input,init)=>{
  requested.push(init?.signal?.aborted);
  if(init.signal.aborted)throw new DOMException("upstream aborted","AbortError");
  throw Error("invalid synthetic branch");
 };
 let upstreamError;
 try{
  await publicReadFetch(base+"/rest/v1/series",{signal:upstream.signal});
 }catch(e){upstreamError=e;}
 ok(upstreamError instanceof Error,"upstream abort rejects");
 equal(warnings.length,0,"upstream cancellation is not mislabeled as deadline");
 equal(requested[0],true,"source propagates upstream abort signal");
 globalThis.fetch=(_input,init)=>{
  // Source has already scheduled a 2500ms timer. A deterministic 2750ms
  // busy-loop delays its timer dispatch, without contacting any host.
  // Producing such a delay locally does NOT identify Vercel's cause.
  const started=performance.now();
  while(performance.now()-started<2750){}
  return new Promise((_resolve,reject)=>{
   if(init.signal.aborted)reject(new DOMException("synthetic aborted","AbortError"));
   else init.signal.addEventListener("abort",()=>{
    reject(new DOMException("synthetic aborted","AbortError"));
   },{once:true});
  });
 };
 let slowError;
 const started=performance.now();
 try{await publicReadFetch(base+"/rest/v1/series");}
 catch(e){slowError=e;}
 ok(slowError instanceof Error&&slowError.name==="AbortError",
  "delayed timer leads to aborted in-memory fetch");
 ok(performance.now()-started>=2600,"timer callback was intentionally delayed");
 equal(warnings.length,1,"delayed SOURCE deadline records one warning only");
 const t=warnings[0];
 equal(t.endpoint,"series","warning never contains target URL or IDs");
 equal(t.timeoutMs,2500,"source's configured 2500ms deadline unchanged");
 ok(t.deadlineTimerDelayMs>=100,
  "local timer dispatch was delayed independently of network");
 ok(t.abortSettlementDelayMs>=0&&t.abortSettlementDelayMs<1000,
  "rejection settled shortly after fired timer in synthetic case");
 ok(t.elapsedMs>=t.timeoutMs+t.deadlineTimerDelayMs,
  "source warning separates planned timeout, callback delay and settlement");
 ok(t.elapsedMonotonicMs>t.timeoutMs,
  "monotonic wall elapsed exceeds planned deadline");
 const safeKeys=Object.keys(t);
 ok(!safeKeys.some(k=>/url|token|cookie|requestid|query/i.test(k)),
  "diagnostic warning fields contain no URL, token, request identifier or query");
 globalThis.fetch=originalFetch;
 // A fixed no-network pause allows a reused connection's teardown without
 // misclassifying it as a user-visible 5xx or correlated Vercel request.
 await delay(10);
 console.log("PASS: #137 local AbortError vs ECONNRESET SOURCE+LOOPBACK "+
  count+" checks; immediate socket failure has no local-deadline warning, "+
  "delayed timer produces >2500ms elapsed with short settlement");
 console.log("LIMIT: no real Vercel request status/p95/DB lock timing, "+
  "no proof of suspended runtime, event-loop cause or automatic retry safety");
}finally{
 console.warn=originalWarn;
 globalThis.fetch=originalFetch;
 if(listening){
  server.closeAllConnections?.();
  await new Promise(resolve=>server.close(resolve));
 }
}
