import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import Module from "node:module";
import { normalizeTranslationSourceText, segmentSourceDocument } from "../src/lib/translation/segmentSourceDocument";

// Characterization test: pins current behavior only (LT-002).
// The Supabase server client is replaced in-process; no DB or Auth access. Synthetic rows only.

type Row = Record<string, unknown> | null;
const state = {
  user: { id: "owner-1", email: "owner@example.invalid", identities: [] } as Record<string, unknown> | null,
  authError: null as { message: string } | null,
  chapter: null as Row,
  work: null as Row,
  chapterError: null as { message: string } | null,
  workError: null as { message: string } | null,
  queries: [] as unknown[][],
};

const fakeClient = {
  auth: { getUser: async () => ({ data: { user: state.user }, error: state.authError }) },
  from(table: string) {
    const calls: unknown[] = [table];
    state.queries.push(calls);
    const builder = {
      select: (columns: string) => (calls.push(["select", columns]), builder),
      eq: (column: string, value: unknown) => (calls.push(["eq", column, value]), builder),
      maybeSingle: async () =>
        table === "private_library_chapters"
          ? { data: state.chapter, error: state.chapterError }
          : { data: state.work, error: state.workError },
    };
    return builder;
  },
};

const moduleWithLoad = Module as unknown as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown;
};
const originalLoad = moduleWithLoad._load;
moduleWithLoad._load = function (request, parent, isMain) {
  if (request === "server-only") return {};
  if (request === "@/lib/supabase/server" || request.endsWith("/lib/supabase/server")) return { createClient: async () => fakeClient };
  return originalLoad.call(this, request, parent, isMain);
};

async function main() {
  try {
    const server = await import("../src/lib/library/privateLibraryTranslationServer");

    // Source hash: versioned prefix + normalized text.
    const body = "吾輩は猫である。\r\n名前はまだ無い。";
    const expectedHash = createHash("sha256")
      .update("private-library-chapter-translation-source-v1\0" + normalizeTranslationSourceText(body), "utf8")
      .digest("hex");
    assert.equal(server.buildPrivateLibraryTranslationSourceHash(body), expectedHash);
    assert.equal(server.buildPrivateLibraryTranslationSourceHash(body.replace(/\r\n/g, "\n")), expectedHash);
    assert.deepEqual(server.buildPrivateLibraryTranslationSource(body, "ja"), segmentSourceDocument(body, "ja"));

    // Owner reading their own chapter.
    state.chapter = { id: "chapter-1", work_id: "work-1", body };
    state.work = { id: "work-1", owner_user_id: "owner-1", source_language: " EN " };
    const access = await server.resolvePrivateLibraryTranslationAccess(" chapter-1 ");
    assert.equal(access?.userId, "owner-1");
    assert.equal(access?.sourceLanguage, "en");
    assert.equal(access?.registrationBlocked, false);
    assert.equal(access?.body, body);
    assert.deepEqual(state.queries.slice(-2), [
      ["private_library_chapters", ["select", "*"], ["eq", "id", "chapter-1"]],
      ["private_library_works", ["select", "*"], ["eq", "id", "work-1"], ["eq", "owner_user_id", "owner-1"]],
    ]);

    // Google account still needing STEP 2 is flagged, not refused.
    state.user = {
      id: "owner-1",
      email: "owner@example.invalid",
      app_metadata: {},
      user_metadata: {},
      identities: [{ provider: "google", identity_data: { email: "owner@example.invalid", email_verified: true } }],
    };
    assert.equal((await server.resolvePrivateLibraryTranslationAccess("chapter-1"))?.registrationBlocked, true);
    state.user = { id: "owner-1", email: "owner@example.invalid", identities: [] };

    // Refusals -> null.
    const before = state.queries.length;
    assert.equal(await server.resolvePrivateLibraryTranslationAccess("  "), null);
    assert.equal(state.queries.length, before, "blank id: no query");
    state.user = null;
    assert.equal(await server.resolvePrivateLibraryTranslationAccess("chapter-1"), null);
    state.user = { id: "owner-1" };
    state.authError = { message: "expired" };
    assert.equal(await server.resolvePrivateLibraryTranslationAccess("chapter-1"), null);
    state.authError = null;
    state.chapterError = { message: "x" };
    assert.equal(await server.resolvePrivateLibraryTranslationAccess("chapter-1"), null);
    state.chapterError = null;
    state.work = null; // not owned (owner filter returns no row)
    assert.equal(await server.resolvePrivateLibraryTranslationAccess("chapter-1"), null);
    state.work = { id: "work-1", owner_user_id: "owner-1", source_language: "xx" };
    assert.equal(await server.resolvePrivateLibraryTranslationAccess("chapter-1"), null, "unsupported language");
    state.work = { id: "work-1", owner_user_id: "owner-1", source_language: "ja" };
    state.chapter = { id: "chapter-1", work_id: "work-1", body: "  \n " };
    assert.equal(await server.resolvePrivateLibraryTranslationAccess("chapter-1"), null, "blank body");
  } finally {
    moduleWithLoad._load = originalLoad;
  }

  console.log("PASS: private library translation access (source hash, owner-scoped reads, registration flag, refusals)");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
