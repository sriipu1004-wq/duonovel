// #137: OFFLINE read-only legacy migration provenance guard.
// Safe use: node scripts/issue137-b2/r0-legacy-history-preflight.mjs --self-test
// No URL, DB driver, credentials, remote writes or migration repair calls.
// A PASS proves the SNAPSHOT/mapping has no unaccounted version, NOT release safety.
import assert from "node:assert/strict";
import {readFileSync,readdirSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {join,dirname} from "node:path";

const local=dirname(fileURLToPath(import.meta.url));
const root=join(local,"../..");
const files=readdirSync(join(root,"supabase/migrations"))
 .filter(x=>x.endsWith(".sql")).sort();
const manifest=JSON.parse(readFileSync(join(local,"r0-legacy-catalog-probes.json"),"utf8"));
const hosted=JSON.parse(readFileSync(join(local,"r0-hosted-ledger-snapshot.json"),"utf8"));
const filenameVersion=x=>/^(\d{14})_/.exec(x)?.[1]??null;
const filenameName=x=>x.replace(/^\d{14}_/,"").replace(/\.sql$/,"");
function isCalendarVersion(version){
 if(!/^\d{14}$/.test(version))return false;
 const yy=+version.slice(0,4),mm=+version.slice(4,6),dd=+version.slice(6,8),
 hh=+version.slice(8,10),mi=+version.slice(10,12),ss=+version.slice(12,14);
 const d=new Date(Date.UTC(yy,mm-1,dd,hh,mi,ss));
 return Number.isFinite(d.getTime())&&d.getUTCFullYear()===yy&&
 d.getUTCMonth()+1===mm&&d.getUTCDate()===dd&&
 d.getUTCHours()===hh&&d.getUTCMinutes()===mi&&d.getUTCSeconds()===ss;
}
function inventory(names){
 const versioned=names.map(f=>({file:f,version:filenameVersion(f)}));
 const duplicateMap=new Map();
 for(const f of versioned)if(f.version){
  duplicateMap.set(f.version,[...(duplicateMap.get(f.version)||[]),f.file]);
 }
 return {
  non14:versioned.filter(x=>!x.version).map(x=>x.file).sort(),
  invalid:versioned.filter(x=>x.version&&!isCalendarVersion(x.version))
   .map(x=>x.file).sort(),
  duplicate:[...duplicateMap.entries()].filter(([_,xs])=>xs.length>1)
   .map(([version,xs])=>({version,files:xs.sort()})).sort((a,b)=>a.version.localeCompare(b.version))
 };
}
function validate(sourceFiles, remoteSnapshot, localManifest){
 assert.equal(localManifest.schema,"issue137-legacy-source-catalog-probes-v1");
 assert.equal(remoteSnapshot.schema,"issue137-hosted-ledger-name-version-snapshot-v1");
 assert.equal(localManifest.readOnly,true);
 assert.equal(localManifest.pinnedMain,remoteSnapshot.pinnedMain);
 assert.equal(sourceFiles.length,76,"No silent migration-file addition/deletion.");
 assert.equal(new Set(sourceFiles).size,sourceFiles.length);
 assert.equal(remoteSnapshot.migrations.length,21);
 assert.equal(localManifest.rows.length,55);
 assert.equal(new Set(localManifest.rows.map(r=>r.file)).size,55);
 assert.equal(new Set(remoteSnapshot.migrations.map(r=>r.version)).size,21);
 const matches=remoteSnapshot.migrations.map(r=>{
   const byVersion=sourceFiles.filter(x=>filenameVersion(x)===r.version);
   const byName=sourceFiles.filter(x=>filenameName(x)===r.name);
   const candidates=byVersion.length?byVersion:byName;
   assert.equal(candidates.length,1,"Ambiguous or missing host history: "+r.version);
   return {remote:r.version,repo:candidates[0],basis:byVersion.length?"version":"name"};
 });
 assert.equal(new Set(matches.map(x=>x.repo)).size,21,"Host entries map to one file each.");
 assert.equal(matches.filter(x=>x.basis==="version").length,4);
 assert.equal(matches.filter(x=>x.basis==="name").length,17);
 const paired=new Set(matches.map(x=>x.repo));
 const missing=sourceFiles.filter(x=>!paired.has(x)).sort();
 const rows=localManifest.rows;
 assert.deepEqual(rows.map(x=>x.file).sort(),missing,
   "Every 51 versioned and four legacy-format sources need an explicit probe.");
 const allowedTypes=new Set(["relation","column","function","policy","trigger"]);
 for(const r of rows){
  assert.ok(allowedTypes.has(r.probe.kind));
  assert.ok(/^public\.[a-z_]+(?:(?:\.|:)[a-z_]+)?$/.test(r.probe.target),
    "Source-anchored catalog identifiers only, no SQL injection.");
  assert.equal(typeof r.probe.present,"boolean");
  assert.equal(r.provenance,"UNVERIFIED","Catalog presence never equals migration provenance");
 }
 const exceptions=rows.filter(r=>!r.probe.present);
 assert.equal(exceptions.length,1);
 assert.equal(exceptions[0].file,"20260326_manage_rls_series_episodes.sql");
 assert.equal(exceptions[0].interpretation,"LEGACY_POLICY_SUPERSEDED_CANDIDATE");
 const drift=inventory(sourceFiles);
 assert.equal(drift.non14.length,4,"Historical invalid-prefix count drift");
 assert.equal(drift.invalid.length,4,"Calendar-invalid migration versions drift");
 assert.equal(drift.duplicate.length,2,"Duplicate-version migration group count drift");
 // These anomaly counts are expected historical defects and are release HOLD.
 return {matches,missing,drift,catalogPresent:rows.filter(x=>x.probe.present).length,
  catalogMissing:exceptions.map(x=>({file:x.file,probe:x.probe.target}))};
}
function sqlLiteral(s){return "'"+s.replaceAll("'","''")+"'";}
function readOnlySql(rows){
 const clauses=rows.map(({file,probe})=>"("+[
  sqlLiteral(file),sqlLiteral(probe.kind),sqlLiteral(probe.target),
  probe.present?"true":"false"].join(",")+")").join(",\n  ");
 return [
  "-- READ-ONLY representative catalog check only. Do not execute DDL, DML or migration repair.",
  "-- Run only with separate authorization in an already approved read-only session.",
  "-- A matching representative object NEVER proves the migration was applied.",
  "BEGIN READ ONLY;",
  "WITH probes(file,kind,target,expected_present) AS (VALUES",
  "  "+clauses,
  "), observed AS (SELECT file,kind,target,expected_present,CASE kind",
  "WHEN 'relation' THEN to_regclass(target) IS NOT NULL",
  "WHEN 'column' THEN EXISTS(SELECT 1 FROM information_schema.columns c WHERE c.table_schema=split_part(target,'.',1) AND c.table_name=split_part(target,'.',2) AND c.column_name=split_part(target,'.',3))",
  "WHEN 'function' THEN EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=split_part(target,'.',1) AND p.proname=split_part(target,'.',2))",
  "WHEN 'policy' THEN EXISTS(SELECT 1 FROM pg_policies p WHERE p.schemaname=split_part(split_part(target,':',1),'.',1) AND p.tablename=split_part(split_part(target,':',1),'.',2) AND p.policyname=split_part(target,':',2))",
  "WHEN 'trigger' THEN EXISTS(SELECT 1 FROM pg_trigger t WHERE NOT t.tgisinternal AND t.tgrelid=to_regclass(split_part(target,':',1)) AND t.tgname=split_part(target,':',2))",
  "ELSE NULL END AS observed_present FROM probes)",
  "SELECT file,kind,target,expected_present,observed_present,",
  "CASE WHEN expected_present IS NOT DISTINCT FROM observed_present THEN 'SNAPSHOT_AGREES_NOT_PROVEN_APPLIED'",
  "ELSE 'CATALOG_DRIFT_HOLD' END AS audit_result FROM observed ORDER BY file;",
  "ROLLBACK;"
 ].join("\n")+"\n";
}
const result=validate(files,hosted,manifest);
const command=process.argv[2]||"--self-test";
if(command==="--emit-readonly-sql"){
 process.stdout.write(readOnlySql(manifest.rows));
}else if(command==="--self-test"){
 // Negative tests guarantee a missing file, duplicate/unexpected history or
 // an ordinary catalog result interpreted as provenance will not pass.
 assert.throws(()=>validate(files.filter(x=>x!==result.missing[0]),hosted,manifest));
 assert.throws(()=>validate(files,{...hosted,migrations:[...hosted.migrations,{
  version:"20990101000000",name:"invented_history"}]},manifest));
 assert.throws(()=>validate(files,hosted,{...manifest,rows:manifest.rows.slice(1)}));
 assert.throws(()=>validate(files,hosted,{...manifest,rows:manifest.rows.map((r,i)=>
  i===0?{...r,provenance:"APPLIED"}:r)}));
 const sql=readOnlySql(manifest.rows);
 assert.ok(sql.startsWith("-- READ-ONLY"));
 assert.equal((sql.match(/BEGIN READ ONLY;/g)||[]).length,1);
 assert.equal((sql.match(/ROLLBACK;/g)||[]).length,1);
 assert.ok(sql.includes("'CATALOG_DRIFT_HOLD'"));
 console.log("ISSUE137_LEGACY_READONLY_PREFLIGHT_PASS "+
  "hostedMatched="+result.matches.length+
  " nameRemapped="+result.matches.filter(x=>x.basis==="name").length+
  " legacyUnpaired="+result.missing.length+
  " catalogPresent="+result.catalogPresent+
  " catalogAbsent="+result.catalogMissing.length+
  " non14="+result.drift.non14.length+
  " invalidClock="+result.drift.invalid.length+
  " duplicateVersionGroups="+result.drift.duplicate.length);
 console.log("RELEASE_HOLD: these catalog probes do not attest migration execution, "+
  "full RLS or physical-media safety. No history repair or db push.");
}else throw Error("Only --self-test and --emit-readonly-sql are supported.");
