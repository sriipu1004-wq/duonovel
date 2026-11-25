import assert from "node:assert/strict";
import { checkEmailAvailability } from "../src/lib/auth/checkEmailAvailability";

// Characterization test: pins current behavior only (LT-002). fetch is stubbed; synthetic addresses.

const globals = globalThis as unknown as { fetch: unknown };
const originalFetch = globals.fetch;

type Sent = { url: string; init: { method: string; headers: Record<string, string>; body: string } };

function stub(response: { ok: boolean; json: () => Promise<unknown> }) {
  const sent: Sent[] = [];
  globals.fetch = async (url: string, init: Sent["init"]) => {
    sent.push({ url, init });
    return response;
  };
  return sent;
}

const json = (ok: boolean, payload: unknown) => ({ ok, json: async () => payload });

async function main() {
  try {
    const sent = stub(json(true, { ok: true, available: true, normalizedEmail: " server@example.invalid " }));
    assert.equal(await checkEmailAvailability("  User@Example.INVALID "), "server@example.invalid");
    assert.equal(sent[0]?.url, "/api/account/email/check");
    assert.equal(sent[0]?.init.method, "POST");
    assert.deepEqual(JSON.parse(sent[0]!.init.body), { email: "user@example.invalid" });

    stub(json(true, { ok: true, available: true }));
    assert.equal(await checkEmailAvailability(" A@Example.invalid"), "a@example.invalid");

    stub(json(true, { ok: true, available: false, status: "unconfirmed" }));
    await assert.rejects(checkEmailAvailability("x@example.invalid"), /このメールアドレスは確認待ち。/);
    stub(json(true, { ok: true, available: false, status: "confirmed" }));
    await assert.rejects(checkEmailAvailability("x@example.invalid"), /^Error: このメールアドレスはすでに登録済み。ログインへ進んで。$/);
    stub(json(true, { ok: true, available: false, error: "custom" }));
    await assert.rejects(checkEmailAvailability("x@example.invalid"), /^Error: custom$/);
    stub(json(false, { ok: false, error: "形式が不正" }));
    await assert.rejects(checkEmailAvailability("x"), /^Error: 形式が不正$/);
    stub({ ok: false, json: async () => { throw new Error("not json"); } });
    await assert.rejects(checkEmailAvailability("x@example.invalid"), /^Error: メールアドレスの重複確認に失敗した。$/);
  } finally {
    globals.fetch = originalFetch;
  }

  console.log("PASS: client email availability check (request, normalization, status messages)");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
