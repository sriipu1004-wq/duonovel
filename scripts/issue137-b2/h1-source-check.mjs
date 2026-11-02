// H1 invariant checks of actual repository SOURCE. Not a substitute for
// executable PostgreSQL/GoTrue/Storage or independently audited release gates.
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const root=new URL("../../",import.meta.url);
const read=p=>readFileSync(new URL(p,root),"utf8");
const writer=read("src/lib/recording/humanRecordingPublish.ts");
const visibility=read("src/app/api/recordings/human-visibility/route.ts");
const deletion=read("src/app/api/recordings/human-delete/route.ts");
const adapter=read("src/lib/recording/humanRecordingAtomic.ts");
const sql=read("supabase/migrations/20261029190000_issue137_h1_human_atomic.sql");
const runner=read("scripts/issue137-b2/run-local.sh");
let checks=0;
function yes(condition,name){assert.ok(condition,name);checks++;}
const direct=/\.from\("recordings"\)\s*\.(?:update|insert|delete)\s*\(/u;
for(const [name,source] of [["publisher",writer],["visibility",visibility],["delete",deletion]])
  yes(!direct.test(source),"no direct Human recordings mutations: "+name);
yes(writer.includes("commitHumanAtomicMutation(adminSupabase"),"publisher uses atomic RPC");
yes(writer.includes("const preUploadRevision = await readHumanAtomicRevision"),"preupload revision captured");
yes(writer.indexOf("const preUploadRevision")<writer.indexOf("const preUploadRows"),"revision precedes snapshot");
yes(writer.includes("preUploadRows, preUploadRevision"),"snapshot generation passed through upload");
yes(visibility.includes('action: "visibility"'),"visibility uses scoped RPC");
yes(deletion.includes('action: "delete_all"'),"delete uses scoped RPC");
yes(!deletion.includes(".remove("),"delete preserves uncertain storage bytes");
yes(adapter.includes('human_atomic_revision_unavailable')&&
  adapter.includes('human_atomic_commit_failed'),"missing RPC fails closed");
yes(!/\.from\("recordings"\)/u.test(adapter),"adapter contains no direct writer fallback");
yes(sql.includes("create trigger issue137_h1_human_atomic_guard"),"DB trigger denies direct known Human writes");
yes(sql.includes("H1_ATOMIC_RPC_REQUIRED"),"direct writer denial error code");
yes(sql.includes("for update;"),"scope locking in SQL transaction");
yes(sql.includes("H1_STALE_REVISION"),"persisted generation CAS");
yes(sql.includes("H1_PRIVATE_REPUBLISH_DENIED"),"no implicit public from private");
yes(sql.includes("H1_AMBIGUOUS_OWNER"),"alias conflict fail closed");
yes(sql.includes("H2_PERMISSION_REVOKED")&&sql.includes("H2_PUBLICATION_REVOKED"),"H2 permission and visibility enforced inside final RPC");
yes(sql.includes("H2_CONSENT_REVOKED")&&sql.includes("H2_R18_REVOKED"),"H2 consent and R18 recheck in final transaction");
yes(sql.includes("for share")&&sql.indexOf("H2_PERMISSION_REVOKED")<sql.indexOf("insert into libread_internal.h1_human_scope_revision"),"H2 locked checks precede revision acquisition");
yes(read("scripts/issue137-b2/h1-atomic-e2e.mjs").includes("R18 opt-out during upload blocks commit"),"H2 local negative tests wired");
yes(sql.includes("grant execute on function public.issue137_h1_human_commit"),"service-role grant explicit");
yes(sql.includes("from public,anon,authenticated"),"anonymous/authenticated RPC execute revoke");
yes(runner.includes("node \"$B2/h1-atomic-e2e.mjs\""),"actual local H1 REST test wired");
yes(runner.includes("db_container")&&runner.includes("network=$NETWORK"),"local DB binding gated");
console.log("PASS: "+checks+" H1 SOURCE contract assertions only; no Production DB/E2E");
