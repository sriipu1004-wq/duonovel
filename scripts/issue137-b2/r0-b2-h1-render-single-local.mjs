// Produce ONE unlinked nonproduction migration from existing reviewed source
// fragments. This renderer has NO network/SQL capability and never writes a
// migration into the repository or to a hosted Supabase project.
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
const folder=fileURLToPath(new URL("./",import.meta.url));
const fixture=readFileSync(folder+"r0-local-storage-fixture.sql","utf8");
const b2=readFileSync(folder+"r0-b2-unified-local-candidate.sql","utf8");
const h1=readFileSync(folder+"r0-h1-atomic-local-extension.sql","utf8");
const hostedShape=readFileSync(folder+"r0-hosted-constraint-overlay-local.sql","utf8");
assert.match(hostedShape,/series_author_id_fkey/u);
assert.match(hostedShape,/recordings_reader_id_fkey/u);
assert.match(hostedShape,/recordings_voice_model_id_fkey/u);
assert.match(hostedShape,/series_content_warnings_check/u);
assert.match(hostedShape,/episodes_scheduled_for_consistency_check/u);
function unwrap(sql,label){
 const starts=sql.match(/^\s*begin;\s*$/gmi)||[];
 const commits=sql.match(/^\s*commit;\s*$/gmi)||[];
 assert.equal(starts.length,1,label+" must own exactly one transaction start");
 assert.equal(commits.length,1,label+" must own exactly one transaction end");
 return sql.replace(/^\s*begin;\s*$/mi,"").replace(/^\s*commit;\s*$/mi,"");
}
const b2body=unwrap(b2,"B2/R0");
const h1body=unwrap(h1,"H1");
assert.match(b2body,/issue137_b2_recording_media_reference/u);
assert.match(h1body,/issue137_h1_human_atomic_guard/u);
assert.ok(!fixture.includes("issue137_h1_human_atomic_guard"),"fixture must not preinstall H1");
const sql="begin;\n"+fixture+"\n"+hostedShape+"\n"+b2body+"\n"+h1body+"\ncommit;\n";
assert.equal((sql.match(/^\s*begin;\s*$/gmi)||[]).length,1);
assert.equal((sql.match(/^\s*commit;\s*$/gmi)||[]).length,1);
const switches=sql.match(/create trigger issue137_(?:b2|h1)_[a-z0-9_]+/giu)||[];
assert.equal(switches.length,10,"one B2 nine-trigger set plus one H1 guard");
if(process.argv[2]==="--self-test"){
 console.log("PASS: B2/R0+H1+hosted-shape overlay single-transaction renderer; 10 guard triggers, no remote operation");
}else if(process.argv[2]==="--emit-local"&&
  process.env.DO_NOT_CONTACT_PRODUCTION==="true"&&
  process.env.R0_EPHEMERAL_CONFIRM==="local-only"){
 process.stdout.write(sql);
}else{
 throw Error("RENDER_HOLD: require --self-test or isolated --emit-local");
}
