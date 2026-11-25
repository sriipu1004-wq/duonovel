import assert from "node:assert/strict";
import Module from "node:module";

// Characterization test: pins current behavior only (LT-002).
// officialAuthorGrant.server is replaced in-process; no DB access. Synthetic ids only.

const state = { official: new Set<string>(), checks: [] as unknown[] };
const moduleWithLoad = Module as unknown as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown;
};
const originalLoad = moduleWithLoad._load;
moduleWithLoad._load = function (request, parent, isMain) {
  if (request === "server-only") return {};
  if (request === "@/lib/auth/officialAuthorGrant.server" || request.endsWith("/auth/officialAuthorGrant.server")) {
    return {
      isOfficialAuthorAccountForGrant: async (authorId: string | null | undefined) => {
        state.checks.push(authorId);
        return typeof authorId === "string" && state.official.has(authorId);
      },
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const legacy = {
  originalAuthor: " 作者 ",
  authorDeathYear: 1916,
  sourceCandidates: ["https://www.aozora.gr.jp/cards/000001/card1.html", "https://example.test/x"],
  sourceMatchVerified: false,
  jurisdictionsAssessed: ["jp", "US", "xx1"],
  recordedAt: "2026-01-01",
  recordedBy: "test",
};

async function main() {
  try {
    const { readLegacyAttributionForDisplay } = await import("../src/lib/legacyAttribution.server");
    state.official.add("official-1");

    // Official author: the cleaned record is returned.
    assert.deepEqual(await readLegacyAttributionForDisplay({ legacyAttribution: legacy }, "official-1"), {
      originalAuthor: "作者",
      authorDeathYear: 1916,
      sourceCandidates: ["https://www.aozora.gr.jp/cards/000001/card1.html"],
      sourceMatchVerified: false,
      jurisdictionsAssessed: ["JP", "US"],
      recordedAt: "2026-01-01",
      recordedBy: "test",
    });
    assert.deepEqual(state.checks, ["official-1"]);

    // JSON string settings are accepted too.
    assert.ok(await readLegacyAttributionForDisplay(JSON.stringify({ legacyAttribution: legacy }), "official-1"));

    // Any other account (or no author) is ignored.
    state.checks = [];
    assert.equal(await readLegacyAttributionForDisplay({ legacyAttribution: legacy }, "user-2"), null);
    assert.equal(await readLegacyAttributionForDisplay({ legacyAttribution: legacy }, null), null);
    assert.equal(await readLegacyAttributionForDisplay({ legacyAttribution: legacy }, undefined), null);
    assert.deepEqual(state.checks, ["user-2", null, undefined]);

    // No account lookup when the record is missing or malformed.
    state.checks = [];
    for (const settings of [
      null,
      {},
      "not json",
      { legacyAttribution: { ...legacy, sourceMatchVerified: true } },
      { legacyAttribution: legacy, publicDomain: {} },
    ]) {
      assert.equal(await readLegacyAttributionForDisplay(settings, "official-1"), null);
    }
    assert.deepEqual(state.checks, []);

    console.log("legacyAttribution.server characterization: PASS");
  } finally {
    moduleWithLoad._load = originalLoad;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
