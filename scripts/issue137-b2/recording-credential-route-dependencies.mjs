// Issue #137 SOURCE-ONLY read-only dependency inventory for Next.js recording routes.
// Never reads env values, connects to Supabase, modifies credentials, or deploys.
// Conservative static import reachability is NOT Next.js's runtime function bundle
// or proof of Vercel per-route secret custody / all dynamic runtime call paths.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const sourceRoot=path.resolve("src");
const ext=["",".ts",".tsx",".js",".jsx",".mjs",".cjs",".json",
 "/index.ts","/index.tsx","/index.js"];
const sources=new Map();

function normalizedFile(root,file){
 const absolute=path.resolve(root,file);
 if(!absolute.startsWith(root+path.sep))throw Error("SOURCE_BOUNDARY");
 return absolute;
}
function resolveRelative(root,from,importName){
 let base;
 if(importName.startsWith("@/"))base=path.resolve(root,importName.slice(2));
 else if(importName.startsWith("./")||importName.startsWith("../"))
  base=path.resolve(path.dirname(from),importName);
 else return null; // external package, not a GitHub source file
 for(const suffix of ext){
  const target=path.resolve(base+suffix);
  if(!target.startsWith(root+path.sep))continue;
  if(fs.existsSync(target)&&fs.statSync(target).isFile())return target;
 }
 return {missing:importName};
}
function parseImports(source){
 const names=new Set();
 const patterns=[
  /(?:^|\n)\s*(?:import|export)\s+(?:(?!;)[\s\S]){0,600}?\bfrom\s*["']([^"']+)["']/g,
  /(?:^|\n)\s*import\s*["']([^"']+)["']/g,
  /\b(?:import|require)\s*\(\s*["']([^"']+)["']\s*\)/g,
 ];
 for(const re of patterns){
  for(const found of source.matchAll(re))names.add(found[1]);
 }
 return [...names];
}
function analyze(root,entry){
 const base=normalizedFile(root,entry);
 if(!fs.existsSync(base))throw Error("MISSING_ENTRY:"+entry);
 const pending=[base],seen=new Map([[base,null]]),ambiguous=[];
 while(pending.length){
  const file=pending.shift();
  const content=fs.readFileSync(file,"utf8");
  const names=parseImports(content);
  // Dynamic import with nonliteral source is not introspectable by this scan.
  // Fail closed for candidate no-key entrypoints; report elsewhere.
  if(/\b(?:import|require)\s*\(\s*(?!["'])/.test(content))
   ambiguous.push(path.relative(root,file));
  for(const name of names){
   const resolved=resolveRelative(root,file,name);
   if(resolved?.missing){
    ambiguous.push(path.relative(root,file)+" -> "+name+" (unresolved local)");
    continue;
   }
   if(resolved&&!seen.has(resolved)){
    seen.set(resolved,file);pending.push(resolved);
   }
  }
 }
 const marked=[];
 for(const file of seen.keys()){
  const body=fs.readFileSync(file,"utf8");
  const privileged=body.includes("SUPABASE_SERVICE_ROLE_KEY")||
   body.includes('from "@/lib/supabase/admin"')||
   body.includes("from '@/lib/supabase/admin'")||
   /\bcreateAdminClient\s*\(/.test(body);
  if(privileged){
   const chain=[];let walk=file;
   while(walk){chain.unshift(path.relative(root,walk));walk=seen.get(walk);}
   marked.push({file:path.relative(root,file),via:chain});
  }
 }
 return {entry:path.relative(root,base),modules:seen.size,
  privilegeMarkers:marked,ambiguous:[...new Set(ambiguous)]};
}
function syntheticNegatives(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"libread-issue137-credential-"));
 const src=path.join(dir,"src");fs.mkdirSync(path.join(src,"lib"),{recursive:true});
 try{
  fs.writeFileSync(path.join(src,"lib","admin.ts"),
   'export const key = process.env.SUPABASE_SERVICE_ROLE_KEY;\n');
  fs.writeFileSync(path.join(src,"lib","indirect.ts"),
   'import { key } from "./admin"; export { key };\n');
  fs.writeFileSync(path.join(src,"safe.ts"),
   'export const check = 7;\n');
  fs.writeFileSync(path.join(src,"leaky.ts"),
   'import { key } from "./lib/indirect"; export { key };\n');
  const good=analyze(src,"safe.ts"),bad=analyze(src,"leaky.ts");
  assert.equal(good.privilegeMarkers.length,0,"false privilege on clean fixture");
  assert.ok(bad.privilegeMarkers.some(x=>
   x.via.join(" -> ").includes("lib/admin.ts")),
   "must find transitive admin secret path via two imports");
  assert.equal(good.ambiguous.length,0);
  return 3;
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
}
const tests=syntheticNegatives();
const cases=[
 ["human-publish","app/api/recordings/human-publish/route.ts","privileged"],
 ["human-upload-session","app/api/recordings/human-upload-session/route.ts","privileged"],
 ["human-upload-finalize","app/api/recordings/human-upload-finalize/route.ts","privileged"],
 ["human-delete","app/api/recordings/human-delete/route.ts","privileged"],
 ["human-visibility","app/api/recordings/human-visibility/route.ts","privileged"],
 ["human-private-audio","app/api/recordings/human-audio/[recordingId]/route.ts","privileged"],
 ["ai-private-audio","app/api/recordings/ai-audio/[recordingId]/route.ts","privileged"],
 ["nemo-generate","app/api/recordings/nemo-generate/route.ts","privileged"],
 ["aivis-generate","app/api/recordings/aivis-generate/route.ts","privileged"],
 ["nemo-autogen","app/api/recordings/nemo-autogen/route.ts","privileged"],
 ["aivis-autogen-run-pending","app/api/recordings/aivis-autogen-run-pending/route.ts","privileged"],
 ["nemo-autogen-run-pending","app/api/recordings/nemo-autogen-run-pending/route.ts","privileged"],
 ["nemo-autogen-backfill","app/api/recordings/nemo-autogen-backfill/route.ts","privileged"],
 ["human-upload-check","app/api/recordings/upload-check/route.ts","user-only-candidate"],
 ["local-user-jwt-writer","lib/recording/rlsScopedPrivateWriterLocal.ts","local-only-user-candidate"],
];
let passed=tests;
for(const [label,entry,expectation] of cases){
 const audit=analyze(sourceRoot,entry);
 const found=audit.privilegeMarkers.length>0;
 const report={label,expectation,transitivePrivilege:found,
  modules:audit.modules,
  paths:audit.privilegeMarkers.slice(0,2).map(x=>x.via),
  ambiguous:audit.ambiguous.slice(0,5)};
 console.log("SOURCE_CREDENTIAL_ROUTE "+JSON.stringify(report));
 if(expectation==="privileged")
  assert.ok(found,"UNEXPECTED_CREDENTIAL_GRAPH_CLEAR:" + label);
 else {
  assert.ok(!found,"USER_ROUTE_PRIVILEGE_INTRODUCED:" + label);
  assert.equal(audit.ambiguous.length,0,"UNRESOLVED_USER_ROUTE:"+label);
 }
 passed++;
}
console.log("PASS: F2-P SOURCE credential-dependency graph "+passed+
 " checks; user-only candidates no tracked transitive privileged imports, "+
 "privileged recording routes identified; no hosted secret read");
console.log("HOLD: static import graph is not deploy/runtime secret isolation; "+
 "indirect dynamic/non-src modules and other service-role callers not exhaustive");
