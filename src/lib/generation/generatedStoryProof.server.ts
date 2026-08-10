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

function sourceHash(body: string): string {
  return createHash("sha256")
    .update(body.replace(/\r\n?/g, "\n"), "utf8")
    .digest("hex");
}

function signature(args: {
  storyId: string;
  body: string;
  issuedAt: number;
}): string {
  return createHmac("sha256", resolveProofSecret())
    .update(
      [
        PROOF_VERSION,
        args.storyId,
        sourceHash(args.body),
        String(args.issuedAt),
      ].join(":"),
      "utf8"
    )
    .digest("hex");
}

export function createGeneratedStoryTranslationProof(args: {
  storyId: string;
  body: string;
}): string {
  const issuedAt = Date.now();
  return [
    PROOF_VERSION,
    String(issuedAt),
    signature({ ...args, issuedAt }),
  ].join(".");
}

export function verifyGeneratedStoryTranslationProof(args: {
  storyId: string;
  body: string;
  proof: string;
}): boolean {
  const [version, issuedAtText, providedSignature] = args.proof.split(".");
  const issuedAt = Number(issuedAtText);

  if (
    version !== PROOF_VERSION ||
    !Number.isFinite(issuedAt) ||
    issuedAt <= 0 ||
    !/^[a-f0-9]{64}$/u.test(providedSignature ?? "")
  ) {
    return false;
  }

  const age = Date.now() - issuedAt;
  if (age < -5 * 60 * 1000 || age > PROOF_MAX_AGE_MS) {
    return false;
  }

  const expectedSignature = signature({
    storyId: args.storyId,
    body: args.body,
    issuedAt,
  });
  const actual = Buffer.from(providedSignature, "hex");
  const expected = Buffer.from(expectedSignature, "hex");

  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
