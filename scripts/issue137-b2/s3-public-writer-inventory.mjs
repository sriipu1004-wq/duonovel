// Issue #137 F2-P. Repository-wide tracked-source candidate discovery.
// Never reads environment/key VALUES, contacts hosted services or modifies state.
// Produces only tracked file paths, line numbers and broad code patterns.
// CANDIDATES != proved runtime writers; dynamic code, external workers and
// provider-issued key inventory are OUTSIDE static source visibility.
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import path from "node:path";

const ROOT=fileURLToPath(new URL("../../",import.meta.url));
const patterns=[
 ["storage_write",/\.\s*(?:upload|update|move|copy|remove|uploadToSignedUrl|createSignedUploadUrl|createSignedUrls)\s*\(/giu],
 ["storage_client",/\.storage\s*\.\s*from\s*\(/giu],
 ["public_url",/getPublicUrl\s*\(|\/storage\/v1\/object\/public\//giu],
 ["raw_storage_write",/\/storage\/v1\/object\/|\/storage\/v1\/s3\//giu],
 ["s3_client",/\b(?:S3Client|PutObjectCommand|UploadPartCommand|AWS4-HMAC-SHA256|x-amz-security-token)\b/giu],
 ["s3_key_reference",/\b(?:AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY|SUPABASE_S3_ACCESS_KEY|S3_ACCESS_KEY_ID|S3_SECRET_ACCESS_KEY|SUPABASE_SERVICE_ROLE_KEY|SERVICE_ROLE_KEY)\b/giu],
 ["public_bucket",/(?:recording-audio|public\s*:\s*true|public\s*=\s*true)/giu],
];
function scan(source) {
 const lines=source.split(/\r?\n/),found=[];
 for(let i=0;i<lines.length;i++){
  const line=lines[i];
  for(const [kind,pattern] of patterns) {
   pattern.lastIndex=0;
   if(pattern.test(line))found.push({kind,line:i+1});
  }
 }
 return found;
}
const known=scan("const admin=createAdminClient();\n"+
 "admin.storage.from(bucket).upload(path,bytes);\n"+
 "admin.storage.from(bucket).getPublicUrl(path);\n"+
 "new S3Client({credentials:{accessKeyId:process.env.AWS_ACCESS_KEY_ID}});\n"+
 "fetch('/storage/v1/object/public/recording-audio/a');");
for(const item of ["storage_client","storage_write","public_url","s3_client","s3_key_reference","raw_storage_write"]){
 assert.ok(known.some(x=>x.kind===item),"scanner lost "+item);
}
assert.equal(scan("const noStorage = 1").length,0);
const names=execFileSync("git",["ls-files","-z","--cached"],{
 cwd:ROOT,encoding:"utf8",timeout:15000,maxBuffer:12*1024*1024,
}).split("\0").filter(Boolean).sort();
assert.ok(names.length>0,"tracked file discovery failed");
const records=[];let scanned=0;
for(const name of names){
 if(!/^(?:src\/|scripts\/|supabase\/|\.github\/)/u.test(name) ||
   !/\.(?:[cm]?[jt]sx?|sql|ya?ml|sh|toml|json)$/iu.test(name))continue;
 if(name.includes("/node_modules/")||name.includes("/.next/"))continue;
 const target=path.resolve(ROOT,name);
 assert.ok(target.startsWith(ROOT), "path escapes checkout");
 let body;try{body=readFileSync(target,"utf8");}catch{continue}
 if(body.length>2*1024*1024)continue;
 scanned++;
 const result=scan(body);if(!result.length)continue;
 const group=name.startsWith("src/")?"APP":name.startsWith("supabase/")?"DB_SOURCE":
  name.startsWith(".github/")?"WORKFLOW":"SCRIPT_TEST_OR_MAINTENANCE";
 const kinds=[...new Set(result.map(x=>x.kind))].sort();
 records.push({file:name,group,kinds,lines:result.map(x=>x.line)});
}
const get=name=>records.find(x=>x.file===name);
for(const name of ["src/lib/supabase/admin.ts","src/lib/recording/nemoGeneration.ts",
 "src/lib/recording/aivisGeneration.ts","scripts/issue137-b2/s3-byte-path-e2e.mjs"]){
 assert.ok(get(name),"expected author or S3 test candidate disappeared: "+name);
}
for(const name of ["src/lib/recording/nemoGeneration.ts",
 "src/lib/recording/aivisGeneration.ts"]){
 const row=get(name);
 assert.ok(row.kinds.includes("storage_write")&&row.kinds.includes("public_url"),
  "direct PUBLIC writer no longer observable; re-review required: "+name);
}
const byGroup=Object.fromEntries(["APP","DB_SOURCE","WORKFLOW",
 "SCRIPT_TEST_OR_MAINTENANCE"].map(k=>[k,records.filter(x=>x.group===k).length]));
console.log("PASS: F2-P inventory scanner synthetic positive/negative fixtures; "+
 scanned+" tracked source files examined, "+records.length+" candidate files");
console.log("SOURCE_CANDIDATES_NOT_VERIFIED_WRITERS "+JSON.stringify({byGroup,records}));
console.log("RELEASE HOLD: source scan cannot enumerate external S3 key holders, "+
 "dynamic bucket values, deployed env values or already public bytes");
