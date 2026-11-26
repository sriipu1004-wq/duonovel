import assert from "node:assert/strict";
import { syncPublicUserProfile } from "../src/lib/auth/syncPublicUserProfile";

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
    // Only provided optional fields are sent; values are normalized.
    let sent = stub(json(true, { ok: true }));
    assert.deepEqual(await syncPublicUserProfile("  Fixture \n Name "), {
      displayName: "Fixture Name",
      bio: "",
      xUrl: "",
      noteUrl: "",
    });
    assert.equal(sent[0]?.url, "/api/account/profile");
    assert.equal(sent[0]?.init.method, "POST");
    assert.deepEqual(JSON.parse(sent[0]!.init.body), { displayName: "Fixture Name" });

    sent = stub(json(true, { ok: true, displayName: " Server ", bio: " b ", xUrl: " https://x.invalid/a ", noteUrl: " " }));
    assert.deepEqual(await syncPublicUserProfile("Name", "  line1\r\nline2\rline3  ", " https://x.invalid/a ", " https://note.invalid/b "), {
      displayName: "Server",
      bio: "b",
      xUrl: "https://x.invalid/a",
      noteUrl: "",
    });
    assert.deepEqual(JSON.parse(sent[0]!.init.body), {
      displayName: "Name",
      bio: "line1\nline2\nline3",
      xUrl: "https://x.invalid/a",
      noteUrl: "https://note.invalid/b",
    });

    // Empty strings are still sent (they clear the field).
    sent = stub(json(true, { ok: true }));
    await syncPublicUserProfile("Name", "", "", "");
    assert.deepEqual(JSON.parse(sent[0]!.init.body), { displayName: "Name", bio: "", xUrl: "", noteUrl: "" });

    stub(json(false, { ok: false, error: "URL が不正" }));
    await assert.rejects(syncPublicUserProfile("Name"), /^Error: URL が不正$/);
    stub(json(true, { ok: false }));
    await assert.rejects(syncPublicUserProfile("Name"), /^Error: プロフィールの保存に失敗した。$/);
    stub({ ok: true, json: async () => { throw new Error("not json"); } });
    await assert.rejects(syncPublicUserProfile("Name"), /^Error: プロフィールの保存に失敗した。$/);
  } finally {
    globals.fetch = originalFetch;
  }

  console.log("PASS: public user profile sync (request body, normalization, server values, errors)");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
