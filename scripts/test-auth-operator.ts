import assert from "node:assert/strict";
import { getOperatorEmails, isOperatorUser } from "../src/lib/auth/operator";

// Operator emails come only from the server-side LIBREAD_OPERATOR_EMAILS
// (KD-13). The NEXT_PUBLIC_ name is never read. Synthetic addresses only.

const saved = {
  server: process.env.LIBREAD_OPERATOR_EMAILS,
  pub: process.env.NEXT_PUBLIC_LIBREAD_OPERATOR_EMAILS,
};

function setEnv(server: string | undefined, pub: string | undefined) {
  if (server === undefined) delete process.env.LIBREAD_OPERATOR_EMAILS;
  else process.env.LIBREAD_OPERATOR_EMAILS = server;
  if (pub === undefined) delete process.env.NEXT_PUBLIC_LIBREAD_OPERATOR_EMAILS;
  else process.env.NEXT_PUBLIC_LIBREAD_OPERATOR_EMAILS = pub;
}

try {
  setEnv(undefined, undefined);
  assert.deepEqual(getOperatorEmails(), []);
  assert.equal(isOperatorUser("ops@example.invalid"), false);

  // Comma/newline separated, trimmed, lower-cased, de-duplicated, empties dropped.
  setEnv(" Ops@Example.invalid ,\nsecond@example.invalid,,ops@example.invalid\n", undefined);
  assert.deepEqual(getOperatorEmails(), ["ops@example.invalid", "second@example.invalid"]);
  assert.equal(isOperatorUser("  OPS@example.INVALID "), true);
  assert.equal(isOperatorUser("other@example.invalid"), false);
  assert.equal(isOperatorUser(""), false);
  assert.equal(isOperatorUser(null), false);
  assert.equal(isOperatorUser(undefined), false);

  // The server variable is used when both are set.
  setEnv("server@example.invalid", "public@example.invalid");
  assert.deepEqual(getOperatorEmails(), ["server@example.invalid"]);
  assert.equal(isOperatorUser("public@example.invalid"), false);

  // Regression (KD-13): NEXT_PUBLIC_ alone grants nothing.
  setEnv(undefined, "public@example.invalid");
  assert.deepEqual(getOperatorEmails(), []);
  assert.equal(isOperatorUser("public@example.invalid"), false);
  setEnv("", "public@example.invalid");
  assert.deepEqual(getOperatorEmails(), []);
  assert.equal(isOperatorUser("public@example.invalid"), false);
} finally {
  setEnv(saved.server, saved.pub);
}

console.log("PASS: operator emails (parsing, normalization, server-only env)");
