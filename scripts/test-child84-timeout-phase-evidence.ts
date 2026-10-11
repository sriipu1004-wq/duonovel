import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("src/lib/supabase/serverPublic.ts","utf8");
const test = readFileSync("scripts/test-public-fetch-timeout-diagnostics.ts","utf8");
const evidence = readFileSync("docs/child84-public-db-timeout-phase-evidence.md","utf8");
for(const field of ["deadlineTimerDelayMs","abortSettlementDelayMs","elapsedMs","timeoutMs"]) {
 assert.ok(source.includes(field),"Diagnostic field missing: "+field);
 assert.ok(test.includes(field),"Diagnostic field not tested: "+field);
}
assert.ok(source.includes("classifyPublicReadEndpoint(input)"));
assert.ok(source.includes("!upstreamSignal?.aborted"),"Caller abort must not log local timeout");
assert.ok(evidence.includes("80,876 ms"));
assert.ok(evidence.includes("83,379 ms"));
assert.ok(evidence.includes("3 ms"));
assert.ok(evidence.includes("not timestamp-matched") || evidence.includes("not timestamp-matched".replace("timestamp-","timestamp-")) || evidence.includes("not request-time-matched") || evidence.includes("not timestamp-matched to"));
assert.ok(evidence.includes("does **not**") && evidence.includes("cause"));
assert.equal(evidence.includes("Fluid Compute is enabled"),false,"Never assert enabled Fluid Compute"); // Must say unverified.
console.log("PASS: Child84 timeout-phase evidence remains aligned to source and makes no unsupported root-cause claims");
