// Issue #137 F2-P: APP-SOURCE BRIDGE, NOT A PUBLIC RELEASE GRANT.
// This pure guard is called BEFORE the first final recording Storage upload.
// It has no DB/Storage credentials, no publishing side effect and never enables
// private or PUBLIC release. Actual final authorization remains NOT WIRED.
// Default is strictly legacy behavior (not an assertion that it is safe).
export type CandidateMediaWriterKind = "ai-recording" | "human-recording" | "site-bgm";

export type CandidateWriterEnvironment = Readonly<{
  LIBREAD_F2P_MEDIA_WRITER_MODE?: string;
  VERCEL_ENV?: string;
}>;

export type WriterBoundaryResult = { status: "LEGACY_UNCHANGED_NOT_APPROVED" } |
  { status: "PRIVATE_ONLY_UNCHANGED" };

const allowedKinds: readonly CandidateMediaWriterKind[] =
  ["ai-recording", "human-recording", "site-bgm"];

// Fail closed for unexpected settings; only explicit Preview HOLD is supported.
// A successful local CAS test is never permission to write PUBLIC media.
export function checkNonproductionMediaWriterBoundary(args: {
  kind: CandidateMediaWriterKind;
  isPublicCandidate: boolean;
  env: CandidateWriterEnvironment;
}): WriterBoundaryResult {
  const { kind, isPublicCandidate, env } = args;
  if (!allowedKinds.includes(kind)) {
    throw new Error("F2P_MEDIA_KIND_UNVERIFIED");
  }
  const mode = env.LIBREAD_F2P_MEDIA_WRITER_MODE?.trim() ?? "";
  if (!mode) return { status: "LEGACY_UNCHANGED_NOT_APPROVED" };
  if (mode !== "preview-hold") {
    throw new Error("F2P_MEDIA_WRITER_MODE_UNVERIFIED");
  }
  if (env.VERCEL_ENV !== "preview") {
    // Never silently allow Preview experiment values in Production/local/dev.
    throw new Error("F2P_PREVIEW_GUARD_WRONG_ENVIRONMENT");
  }
  if (isPublicCandidate) {
    throw new Error("F2P_PREVIEW_PUBLIC_MEDIA_HOLD");
  }
  // Existing PRIVATE paths still require all their ordinary authorizations.
  return { status: "PRIVATE_ONLY_UNCHANGED" };
}
