import assert from "node:assert/strict";
import { checkDisplayNameAvailability } from "../src/lib/auth/checkDisplayNameAvailability";

// Characterization test: pins current behavior only (LT-002). fetch is stubbed; no network.

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
    const sent = stub(json(true, { ok: true, available: true, normalizedDisplayName: " Server Name " }));
    assert.equal(await checkDisplayNameAvailability("  My \n Name ", "user-1"), "Server Name");
    assert.equal(sent[0]?.url, "/api/account/display-name/check");
    assert.equal(sent[0]?.init.method, "POST");
    assert.deepEqual(sent[0]?.init.headers, { "Content-Type": "application/json" });
    assert.deepEqual(JSON.parse(sent[0]!.init.body), { displayName: "My Name", excludeUserId: "user-1" });

    // Falls back to the locally normalized name; excludeUserId defaults to "".
    const sent2 = stub(json(true, { ok: true, available: true, normalizedDisplayName: "  " }));
    assert.equal(await checkDisplayNameAvailability(" a  b "), "a b");
    assert.equal(JSON.parse(sent2[0]!.init.body).excludeUserId, "");

    stub(json(true, { ok: true, available: false }));
    await assert.rejects(checkDisplayNameAvailability("x"), /^Error: このユーザー名はすでに使われている。$/);
    stub(json(true, { ok: true, available: false, error: "使用不可" }));
    await assert.rejects(checkDisplayNameAvailability("x"), /^Error: 使用不可$/);
    stub(json(false, { ok: true, available: true, error: "rate" }));
    await assert.rejects(checkDisplayNameAvailability("x"), /^Error: rate$/);
    stub(json(true, { ok: false }));
    await assert.rejects(checkDisplayNameAvailability("x"), /^Error: ユーザー名の重複確認に失敗した。$/);
    stub({ ok: true, json: async () => { throw new Error("not json"); } });
    await assert.rejects(checkDisplayNameAvailability("x"), /^Error: ユーザー名の重複確認に失敗した。$/);
  } finally {
    globals.fetch = originalFetch;
  }

  console.log("PASS: client display name availability check (request, normalization, error messages)");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
