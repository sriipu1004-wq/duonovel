// Issue #137 F2-P: UNWIRED, NONPRODUCTION private-only release candidate.
// This is a contract around injected trusted DB/Storage operations, not a
// Supabase implementation or a grant for PUBLIC writes or privileged S3 access.
import { createHash } from "node:crypto";
import {
  checkPublicMediaReleaseCandidate,
  type FreshPublicMediaEvidence,
  type PublicMediaKind,
  type PublicMediaStage,
} from "./publicMediaReleasePreflight";

export type PrivateReleaseIntent = Readonly<{
  // IDs are only locators. The adapter MUST resolve identity/rights server-side.
  kind: PublicMediaKind;
  candidateId: string;
}>;

export type VerifiedPrivateStage = PublicMediaStage & Readonly<{
  // These fields MUST be authenticated against provider state, not request JSON.
  immutabilityVerified: boolean;
  bucketVisibilityVerified: boolean;
  // Read from trusted DB authority alongside the immutable stage identity.
  expectedPointerRevision: string;
  releaseNonce: string;
}>;

export type PrivateReleaseActor = Readonly<{
  actorId: string;
  sessionId: string;
  sessionActive: boolean;
}>;

export type LockedPrivateReleaseState = Readonly<{
  // Captured under a trusted DB lock/transaction; never caller-provided.
  actorId: string;
  sessionId: string;
  sessionActive: boolean;
  permissionCurrent: boolean;
  effectiveR18: boolean;
  rightsApproved: boolean;
  rightsWithdrawn: boolean;
  evidence: FreshPublicMediaEvidence;
  stageBucket: string;
  stagePath: string;
  stageVersion: string;
  stageDigest: string;
  stageImmutable: boolean;
  stageBucketPrivate: boolean;
  destinationBucketPrivate: boolean;
  destinationProxyGated: boolean;
  pointerRevision: string;
  releaseNonceAvailable: boolean;
  requestAlreadyCommitted: boolean;
}>;

export type PrivateReleaseHold =
  | "INVALID_INTENT" | "AUTH_HOLD" | "STAGE_HOLD"
  | "PRECHECK_HOLD" | "LOCK_HOLD" | "REVOKED_HOLD"
  | "RIGHTS_HOLD" | "R18_HOLD" | "CONTENT_HOLD"
  | "CONSENT_HOLD" | "PROVENANCE_HOLD" | "BGM_HOLD"
  | "PRIVATE_DESTINATION_HOLD" | "REPLAY_HOLD" | "CAS_HOLD"
  | "COMMIT_HOLD" | "CONTRACT_HOLD";

export type PrivateReleaseDecision =
  | { status: "HOLD"; reason: PrivateReleaseHold }
  | { status: "PRIVATE_POINTER_CANDIDATE_ONLY"; revision: string };

type FinalGate =
  | { allowed: true }
  | { allowed: false; reason: PrivateReleaseHold };

// A compliant implementation MUST lock and re-read the authoritative DB rows,
// verify a monotonic CAS + unique nonce IN THE SAME DB TRANSACTION, and invoke
// evaluateLocked synchronously while holding that lock. Commit is a private
// proxy pointer only. Neither this interface nor a mock demonstrates that a
// real PostgreSQL/Supabase adapter meets these transactional obligations.
export interface TrustedPrivateReleasePorts {
  authenticate(): Promise<PrivateReleaseActor | null>;
  readVerifiedPrivateStage(candidateId: string): Promise<VerifiedPrivateStage | null>;
  readCurrentEvidence(actor: PrivateReleaseActor, intent: PrivateReleaseIntent):
    Promise<FreshPublicMediaEvidence | null>;
  decodeFully(bytes: Uint8Array, kind: PublicMediaKind): Promise<boolean>;
  atomicCommitPrivatePointer(args: Readonly<{
    intent: PrivateReleaseIntent;
    actor: PrivateReleaseActor;
    stage: Readonly<{ bucket: string; path: string; version: string; sha256: string;
      expectedPointerRevision: string; releaseNonce: string }>;
    // Synchronous gate: must run inside DB lock, NOT before obtaining it.
    evaluateLocked: (state: LockedPrivateReleaseState) => FinalGate;
  }>): Promise<
    | { status: "committed"; revision: string }
    | { status: "rejected" }
  >;
}

const hash = (b: Uint8Array): string =>
  createHash("sha256").update(b).digest("hex");
const hex = (value: string): boolean => /^[a-f0-9]{64}$/u.test(value);
const goodId = (value: string): boolean =>
  /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/u.test(value);

// Keep AI, Human and catalog authority separate. No flags from a client payload.
function currentContentGate(kind: PublicMediaKind, e: FreshPublicMediaEvidence): PrivateReleaseHold | null {
  if (e.kind !== kind || !e.rightsApproved || e.rightsWithdrawn) return "RIGHTS_HOLD";
  if (e.rating === "r18" || e.contentWarnings.includes("sexual_r18")) return "R18_HOLD";
  if (kind === "site-bgm") {
    return e.siteManagedCatalogEntry ? null : "BGM_HOLD";
  }
  if (e.publicationStatus !== "public" || e.episodeStatus !== "posted" ||
      !e.episodePublished || !e.seriesMatchesEpisode || !e.ownerVerified)
    return "CONTENT_HOLD";
  if (kind === "human-recording" && !e.humanConsentCurrent) return "CONSENT_HOLD";
  if (kind === "ai-recording" && !e.aiProvenanceVerified) return "PROVENANCE_HOLD";
  return null;
}

export async function evaluatePrivateMediaReleaseCandidate(
  intent: PrivateReleaseIntent,
  ports: TrustedPrivateReleasePorts
): Promise<PrivateReleaseDecision> {
  const hold = (reason: PrivateReleaseHold): PrivateReleaseDecision => ({status:"HOLD",reason});
  if (!intent || !["ai-recording","human-recording","site-bgm"].includes(intent.kind) ||
      typeof intent.candidateId !== "string" || !goodId(intent.candidateId))
    return hold("INVALID_INTENT");

  let actor: PrivateReleaseActor | null;
  let stage: VerifiedPrivateStage | null;
  try {
    actor = await ports.authenticate();
    if (!actor || !goodId(actor.actorId) || !goodId(actor.sessionId) ||
        !actor.sessionActive) return hold("AUTH_HOLD");
    stage = await ports.readVerifiedPrivateStage(intent.candidateId);
  } catch {
    return hold("AUTH_HOLD");
  }
  if (!stage || !stage.bucketVisibilityVerified || !stage.immutabilityVerified ||
      !stage.bucketIsPrivate || !stage.bucket || !stage.objectPath ||
      !stage.immutableVersion || !hex(stage.storedSha256) ||
      !/^(0|[1-9][0-9]{0,17})$/u.test(stage.expectedPointerRevision) ||
      !goodId(stage.releaseNonce))
    return hold("STAGE_HOLD");

  const pinned = Object.freeze({
    bucket: stage.bucket, path: stage.objectPath,
    version: stage.immutableVersion, sha256: stage.storedSha256,
    expectedPointerRevision: stage.expectedPointerRevision,
    releaseNonce: stage.releaseNonce,
  });
  // This validation performs actual bytes+MIME+decoder checks, but the first
  // authorization snapshot is NEVER a grant or a substitute for locked recheck.
  let preflight: Awaited<ReturnType<typeof checkPublicMediaReleaseCandidate>>;
  try {
    preflight = await checkPublicMediaReleaseCandidate({
      kind: intent.kind, stage,
      loadFreshEvidence: () => ports.readCurrentEvidence(actor!,intent),
      decodeFully: (bytes,kind) => ports.decodeFully(bytes,kind),
    });
  } catch {
    return hold("PRECHECK_HOLD");
  }
  if (preflight.status !== "PRECHECK_ONLY_NOT_AUTHORIZED" ||
      preflight.immutableVersion !== pinned.version ||
      preflight.digestSha256 !== pinned.sha256)
    return hold("PRECHECK_HOLD");

  let gated = 0;
  let accepted = false;
  const evaluateLocked = (s: LockedPrivateReleaseState): FinalGate => {
    gated++;
    const deny = (reason: PrivateReleaseHold): FinalGate => ({allowed:false,reason});
    if (gated !== 1) return deny("CONTRACT_HOLD");
    if (!s || s.actorId !== actor.actorId || s.sessionId !== actor.sessionId ||
        !s.sessionActive || !s.permissionCurrent)
      return deny("REVOKED_HOLD");
    if (!s.stageImmutable || !s.stageBucketPrivate ||
        s.stageBucket !== pinned.bucket || s.stagePath !== pinned.path ||
        s.stageVersion !== pinned.version || s.stageDigest !== pinned.sha256)
      return deny("STAGE_HOLD");
    if (!s.rightsApproved || s.rightsWithdrawn) return deny("RIGHTS_HOLD");
    if (s.effectiveR18) return deny("R18_HOLD");
    const evidenceDecision = currentContentGate(intent.kind, s.evidence);
    if (evidenceDecision) return deny(evidenceDecision);
    if (s.evidence.immutableVersion !== pinned.version) return deny("STAGE_HOLD");
    if (!s.destinationBucketPrivate || !s.destinationProxyGated)
      return deny("PRIVATE_DESTINATION_HOLD");
    if (s.pointerRevision !== pinned.expectedPointerRevision)
      return deny("CAS_HOLD");
    if (!s.releaseNonceAvailable || s.requestAlreadyCommitted)
      return deny("REPLAY_HOLD");
    accepted = true;
    return { allowed:true };
  };

  try {
    const result = await ports.atomicCommitPrivatePointer({
      intent, actor, stage:pinned, evaluateLocked,
    });
    // A forged adapter "committed" without invoking the gate cannot be treated
    // as a successful candidate. This does not prove real DB transactionality.
    if (result.status !== "committed" || !accepted || gated !== 1 ||
        !/^(0|[1-9][0-9]{0,17})$/u.test(result.revision) ||
        BigInt(result.revision) <= BigInt(pinned.expectedPointerRevision))
      return hold("COMMIT_HOLD");
    return { status:"PRIVATE_POINTER_CANDIDATE_ONLY",revision:result.revision };
  } catch {
    return hold("COMMIT_HOLD");
  }
}
