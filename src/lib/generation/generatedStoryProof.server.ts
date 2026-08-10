import "server-only";

import { createHash, createHmac, timingSafeEqual } from "crypto";

const PROOF_VERSION = "v1";
const PROOF_MAX_AGE_MS = 48 * 60 * 60 * 1000;

function resolveProofSecret(): string {
  return (
    process.env.IP_HASH_SALT ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.OPENAI_API_KEY ||
    "libread-local-dev-generated-story-proof"
  );
}

export function buildGeneratedStorySourceHash(body: string): string {
  return createHash("sha256")
    .update("generated-story-translation-source-v1\0" + body.replace(/\r\n?/g, "\n"), "utf8")
    .digest("hex");
}

function buildSignature(args: {
  storyId: string;
  sourceHash: string;
  issuedAt: number;
}): string {
  return createHmac("sha256", resolveProofSecret())
    .update(
      [PROOF_VERSION, args.storyId, args.sourceHash, String(args.issuedAt)].join(":"),
      "utf8"
    )
    .digest("hex");
}

export function createGeneratedStoryTranslationProof(args: {
  storyId: string;
  body: string;
}): string {
  const issuedAt = Date.now();
  const sourceHash = buildGeneratedStorySourceHash(args.body);
  const signature = buildSignature({
    storyId: args.storyId,
    sourceHash,
    issuedAt,
  });

  return [PROOF_VERSION, String(issuedAt), signature].join(".");
}

export function verifyGeneratedStoryTranslationProof(args: {
  storyId: string;
  body: string;
  proof: string;
}): { valid: true; sourceHash: string } | { valid: false } {
  const [version, issuedAtText, signature] = args.proof.split(".");
  const issuedAt = Number(issuedAtText);

  if (
    version !== PROOF_VERSION ||
    !Number.isFinite(issuedAt) ||
    issuedAt <= 0 ||
    !/^[a-f0-9]{64}$/u.test(signature ?? "")
  ) {
    return { valid: false };
  }

  const age = Date.now() - issuedAt;
  if (age < -5 * 60 * 1000 || age > PROOF_MAX_AGE_MS) {
    return { valid: false };
  }

  const sourceHash = buildGeneratedStorySourceHash(args.body);
  const expected = buildSignature({
    storyId: args.storyId,
    sourceHash,
    issuedAt,
  });

  const actualBuffer = Buffer.from(signature, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");

  if (
    actualBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    return { valid: false };
  }

  return { valid: true, sourceHash };
}
