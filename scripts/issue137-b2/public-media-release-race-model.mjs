// Issue #137 F2-P: NONPRODUCTION transaction/TOCTOU contract, synthetic only.
// Not imported by the application. A passing model is NOT permission to publish.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const synthetic = Buffer.from("SYNTHETIC-NOT-A-REAL-AUDIO-FILE");
function fixture(kind = "ai-recording") {
  return {
    kind,
    ticket: {
      status: "PRECHECK_ONLY_NOT_AUTHORIZED", requestId: "synthetic-request-1",
      actorId: "synthetic-owner-1",
      stageBucket: "quarantine-private", stagePath: "synthetic/item-1",
      stageVersion: "immutable-v1", digestSha256: sha(synthetic), expectedPointerRevision: 7,
    },
    current: {
      lockHeld: true, actorId: "synthetic-owner-1", allowedActorId: "synthetic-owner-1", staged: { bucket: "quarantine-private", path: "synthetic/item-1",
        version: "immutable-v1", private: true, bytes: Buffer.from(synthetic) },
      destination: { private: true, proxyOnly: true }, pointerRevision: 7,
      rightsApproved: true, rightsWithdrawn: false, publication: "public",
      episodePosted: true, episodePublished: true, seriesMatchesEpisode: true,
      effectiveR18: false, ownerVerified: true, humanConsentCurrent: true,
      aiProvenanceVerified: true, bgmCatalogVerified: true,
      usedRequests: new Set(), publicCopies: new Map(),
    },
  };
}
function gateUnderSyntheticLock({ kind, ticket, current }) {
  const hold = reason => ({ status: "HOLD", reason });
  // An unsigned PRECHECK result is not a capability. This test-only second gate
  // assumes trustworthy, server-owned source data and a held DB lock.
  if (!current.lockHeld) return hold("LOCK_REQUIRED");
  if (ticket.status !== "PRECHECK_ONLY_NOT_AUTHORIZED" || !ticket.requestId)
    return hold("INVALID_PRECHECK");
  if (current.usedRequests.has(ticket.requestId)) return hold("REPLAY");
  if (ticket.actorId !== current.actorId || current.actorId !== current.allowedActorId)
    return hold("ACTOR_CHANGED");
  if (!current.staged.private || current.staged.bucket !== ticket.stageBucket ||
      current.staged.path !== ticket.stagePath ||
      current.staged.version !== ticket.stageVersion ||
      sha(current.staged.bytes) !== ticket.digestSha256)
    return hold("STAGE_CHANGED");
  if (!current.rightsApproved || current.rightsWithdrawn) return hold("RIGHTS_CHANGED");
  if (current.effectiveR18) return hold("R18_CHANGED");
  if (kind === "site-bgm") {
    if (!current.bgmCatalogVerified) return hold("BGM_AUTHORITY_CHANGED");
  } else {
    if (current.publication !== "public" || !current.episodePosted ||
        !current.episodePublished || !current.seriesMatchesEpisode)
      return hold("PUBLICATION_CHANGED");
    if (!current.ownerVerified) return hold("OWNER_CHANGED");
    if (kind === "human-recording" && !current.humanConsentCurrent)
      return hold("CONSENT_CHANGED");
    if (kind === "ai-recording" && !current.aiProvenanceVerified)
      return hold("PROVENANCE_CHANGED");
  }
  if (!current.destination.private || !current.destination.proxyOnly)
    return hold("UNCONTROLLED_PUBLIC_DESTINATION");
  if (current.pointerRevision !== ticket.expectedPointerRevision)
    return hold("CAS_CONFLICT");
  // MODEL ONLY: a private-proxy pointer CAS; no Storage PUBLIC write or release.
  current.pointerRevision++;
  current.usedRequests.add(ticket.requestId);
  return { status: "MODEL_PRIVATE_POINTER_CAS_NOT_PUBLIC_RELEASE" };
}
let checks = 0;
function expectHold(reason, mutate, kind = "ai-recording") {
  const s = fixture(kind); mutate(s);
  const priorRevision = s.current.pointerRevision;
  assert.deepEqual(gateUnderSyntheticLock(s), { status: "HOLD", reason });
  assert.equal(s.current.pointerRevision, priorRevision, "denials must not change pointer");
  assert.equal(s.current.publicCopies.size, 0, "denials must not copy PUBLIC bytes");
  checks++;
}
function expectPass(kind) {
  const s = fixture(kind);
  assert.deepEqual(gateUnderSyntheticLock(s),
    { status: "MODEL_PRIVATE_POINTER_CAS_NOT_PUBLIC_RELEASE" });
  assert.equal(s.current.pointerRevision, 8);
  assert.equal(s.current.publicCopies.size, 0);
  checks++;
}
for (const kind of ["ai-recording", "human-recording", "site-bgm"]) expectPass(kind);
expectHold("LOCK_REQUIRED",s=>{s.current.lockHeld=false;});
expectHold("INVALID_PRECHECK",s=>{s.ticket.status="HOLD";});
expectHold("ACTOR_CHANGED",s=>{s.current.allowedActorId="synthetic-other-owner";});
expectHold("STAGE_CHANGED",s=>{s.current.staged.version="immutable-v2";});
expectHold("STAGE_CHANGED",s=>{s.current.staged.bytes=Buffer.from("changed-after-preflight");});
expectHold("STAGE_CHANGED",s=>{s.current.staged.private=false;});
expectHold("STAGE_CHANGED",s=>{s.current.staged.bucket="other-private-bucket";});
expectHold("RIGHTS_CHANGED",s=>{s.current.rightsWithdrawn=true;});
expectHold("RIGHTS_CHANGED",s=>{s.current.rightsApproved=false;});
expectHold("R18_CHANGED",s=>{s.current.effectiveR18=true;});
expectHold("PUBLICATION_CHANGED",s=>{s.current.publication="private";});
expectHold("PUBLICATION_CHANGED",s=>{s.current.episodePosted=false;});
expectHold("OWNER_CHANGED",s=>{s.current.ownerVerified=false;});
expectHold("CONSENT_CHANGED",s=>{s.current.humanConsentCurrent=false;},"human-recording");
expectHold("PROVENANCE_CHANGED",s=>{s.current.aiProvenanceVerified=false;});
expectHold("BGM_AUTHORITY_CHANGED",s=>{s.current.bgmCatalogVerified=false;},"site-bgm");
expectHold("UNCONTROLLED_PUBLIC_DESTINATION",s=>{s.current.destination.private=false;});
expectHold("UNCONTROLLED_PUBLIC_DESTINATION",s=>{s.current.destination.proxyOnly=false;});
expectHold("CAS_CONFLICT",s=>{s.current.pointerRevision=8;});
{
  const s=fixture("human-recording");
  assert.equal(gateUnderSyntheticLock(s).status,"MODEL_PRIVATE_POINTER_CAS_NOT_PUBLIC_RELEASE");
  assert.deepEqual(gateUnderSyntheticLock(s),{status:"HOLD",reason:"REPLAY"});
  assert.equal(s.current.pointerRevision,8);
  checks++;
}
{
  // Counterexample: a copy-first PUBLIC release cannot be rolled back atomically
  // when the subsequent DB CAS fails, even if the handler reports an error.
  const s=fixture();
  s.current.publicCopies.set("public/synthetic.wav",Buffer.from(s.current.staged.bytes));
  s.current.pointerRevision=8; // concurrent winner changed the DB pointer
  assert.equal(gateUnderSyntheticLock(s).reason,"CAS_CONFLICT");
  assert.equal(s.current.publicCopies.size,1,"PUBLIC copy remains after CAS error");
  checks++;
}
console.log("PASS: F2-P " + checks + " synthetic private-proxy/CAS/TOCTOU contract controls (MODEL ONLY, no PUBLIC writes)");
console.log("EXPECTED_RELEASE_HOLD: copy-first PUBLIC object survives failed DB CAS; no cross-service atomic rollback");
