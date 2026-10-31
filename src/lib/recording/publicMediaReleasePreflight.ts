// Issue #137 F2-P: SERVER-SIDE RELEASE CANDIDATE ONLY.
// NOT wired into live endpoints, storage upload, publishing, or migrations.
// Never treat PRECHECK_ONLY as permission to write to a public bucket.
import { createHash } from "node:crypto";

export type PublicMediaKind = "ai-recording" | "human-recording" | "site-bgm";

export type PublicMediaStage = {
  bucket: string;
  objectPath: string;
  // Actual authoritative bucket visibility must be read by the server.
  bucketIsPrivate: boolean;
  immutableVersion: string;
  storedSha256: string;
  bytes: Uint8Array;
  // Untrusted declarations can be checked for consistency, not proof of contents.
  claimedMime: string;
  claimedFileName: string;
};

export type FreshPublicMediaEvidence = {
  // These must come from current authoritative server queries, never a payload.
  kind: PublicMediaKind;
  immutableVersion: string;
  rightsApproved: boolean;
  rightsWithdrawn: boolean;
  publicationStatus: "public" | "private" | "draft" | "unknown";
  episodeStatus: "posted" | "draft" | "scheduled" | "none" | "unknown";
  episodePublished: boolean;
  seriesMatchesEpisode: boolean;
  rating: string;
  contentWarnings: string[];
  ownerVerified: boolean;
  humanConsentCurrent: boolean;
  aiProvenanceVerified: boolean;
  siteManagedCatalogEntry: boolean;
};

export type PublicMediaPreflightReason =
  | "BAD_STAGING"
  | "BAD_OBJECT"
  | "DIGEST_MISMATCH"
  | "UNVERIFIED_CURRENT_STATE"
  | "RIGHTS_HOLD"
  | "RESTRICTED_R18"
  | "PUBLICATION_HOLD"
  | "OWNERSHIP_HOLD"
  | "CONSENT_HOLD"
  | "PROVENANCE_HOLD"
  | "BGM_CATALOG_HOLD"
  | "INVALID_FORMAT"
  | "DECODER_HOLD";

export type PublicMediaPreflightResult =
  | { status: "HOLD"; reason: PublicMediaPreflightReason }
  | { status: "PRECHECK_ONLY_NOT_AUTHORIZED"; digestSha256: string; immutableVersion: string };

function fourCC(bytes: Uint8Array, start: number, value: string): boolean {
  if (bytes.length < start + value.length) return false;
  for (let i = 0; i < value.length; i++) {
    if (bytes[start + i] !== value.charCodeAt(i)) return false;
  }
  return true;
}

export type DetectedMediaContainer =
  | "wav" | "flac" | "ogg" | "mp3" | "mp4" | "webm" | "unknown";

/**
 * This is ONLY a pre-decoder container signature check. Even a match does not
 * prove the media is decodable, safe, correctly licensed, or public.
 */
export function detectPublicMediaContainer(bytes: Uint8Array): DetectedMediaContainer {
  if (fourCC(bytes, 0, "RIFF") && fourCC(bytes, 8, "WAVE")) return "wav";
  if (fourCC(bytes, 0, "fLaC")) return "flac";
  if (fourCC(bytes, 0, "OggS")) return "ogg";
  if (fourCC(bytes, 0, "ID3") ||
      (bytes.length >= 2 && bytes[0] === 255 && ((bytes[1] ?? 0) & 224) === 224)) return "mp3";
  if (fourCC(bytes, 4, "ftyp")) return "mp4";
  if (bytes.length >= 4 && bytes[0] === 26 && bytes[1] === 69 &&
      bytes[2] === 223 && bytes[3] === 163) return "webm";
  return "unknown";
}

const extensions: Record<Exclude<DetectedMediaContainer, "unknown">, string[]> = {
  wav: ["wav"], flac: ["flac"], ogg: ["ogg"], mp3: ["mp3"],
  mp4: ["mp4", "m4a"], webm: ["webm"],
};

const mimes: Record<Exclude<DetectedMediaContainer, "unknown">, string[]> = {
  wav: ["audio/wav", "audio/x-wav", "audio/wave"],
  flac: ["audio/flac", "audio/x-flac"],
  ogg: ["audio/ogg", "application/ogg"],
  mp3: ["audio/mpeg", "audio/mp3"],
  mp4: ["audio/mp4", "audio/m4a", "audio/x-m4a"],
  webm: ["audio/webm"],
};

export function publicMediaDeclarationMatches(
  bytes: Uint8Array, name: string, mime: string
): boolean {
  const kind = detectPublicMediaContainer(bytes);
  if (kind === "unknown") return false;
  const ext = name.trim().toLowerCase().split(".").at(-1) ?? "";
  return extensions[kind].includes(ext) &&
    mimes[kind].includes(mime.split(";")[0].trim().toLowerCase());
}

export async function checkPublicMediaReleaseCandidate(args: {
  kind: PublicMediaKind;
  stage: PublicMediaStage;
  // Implementers MUST fetch fresh DB/Storage authority server-side.
  loadFreshEvidence: () => Promise<FreshPublicMediaEvidence | null>;
  // Implementers MUST provide a real full-byte decoder, never only magic sniff.
  decodeFully: (bytes: Uint8Array, kind: PublicMediaKind) => Promise<boolean>;
}): Promise<PublicMediaPreflightResult> {
  const { stage, kind } = args;
  const hold = (reason: PublicMediaPreflightReason): PublicMediaPreflightResult =>
    ({ status: "HOLD", reason });
  if (!stage.bucketIsPrivate || !stage.bucket || !stage.objectPath ||
      stage.objectPath.startsWith("/") || stage.objectPath.includes("..") ||
      !stage.immutableVersion || stage.bytes.byteLength === 0) return hold("BAD_STAGING");

  if (!/^[a-f0-9]{64}$/u.test(stage.storedSha256)) return hold("BAD_OBJECT");
  const digest = createHash("sha256").update(stage.bytes).digest("hex");
  if (digest !== stage.storedSha256) return hold("DIGEST_MISMATCH");

  // Never turn a misleading Content-Type or file extension into permission.
  if (!publicMediaDeclarationMatches(stage.bytes, stage.claimedFileName, stage.claimedMime))
    return hold("INVALID_FORMAT");
  let fresh: FreshPublicMediaEvidence | null;
  try { fresh = await args.loadFreshEvidence(); }
  catch { return hold("UNVERIFIED_CURRENT_STATE"); }
  if (!fresh || fresh.kind !== kind ||
      fresh.immutableVersion !== stage.immutableVersion)
    return hold("UNVERIFIED_CURRENT_STATE");
  if (!fresh.rightsApproved || fresh.rightsWithdrawn) return hold("RIGHTS_HOLD");
  if (fresh.rating === "r18" || fresh.contentWarnings.includes("sexual_r18"))
    return hold("RESTRICTED_R18");
  if (kind === "site-bgm") {
    if (!fresh.siteManagedCatalogEntry) return hold("BGM_CATALOG_HOLD");
  } else {
    if (fresh.publicationStatus !== "public" || fresh.episodeStatus !== "posted" ||
        !fresh.episodePublished || !fresh.seriesMatchesEpisode)
      return hold("PUBLICATION_HOLD");
    if (!fresh.ownerVerified) return hold("OWNERSHIP_HOLD");
    if (kind === "human-recording" && !fresh.humanConsentCurrent)
      return hold("CONSENT_HOLD");
    if (kind === "ai-recording" && !fresh.aiProvenanceVerified)
      return hold("PROVENANCE_HOLD");
  }
  try {
    if (!(await args.decodeFully(stage.bytes, kind))) return hold("DECODER_HOLD");
  } catch {
    return hold("DECODER_HOLD");
  }
  // Another fresh check, transaction-scoped lock/CAS and privileged publication
  // are STILL REQUIRED; neither are implemented here.
  return { status: "PRECHECK_ONLY_NOT_AUTHORIZED",
    digestSha256: digest, immutableVersion: stage.immutableVersion };
}
