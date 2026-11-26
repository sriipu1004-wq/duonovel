import assert from "node:assert/strict";
import Module from "node:module";

// Characterization test: pins current behavior only (LT-002).

const moduleWithLoad = Module as unknown as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown;
};
const originalLoad = moduleWithLoad._load;
moduleWithLoad._load = function (request, parent, isMain) {
  if (request === "server-only") return {};
  return originalLoad.call(this, request, parent, isMain);
};

async function main() {
  try {
    const { getPublicSearchLanguageFilters, runWithPublicSearchLanguageFilters } = await import(
      "../src/lib/search/publicSearchRequestContext"
    );

    assert.equal(getPublicSearchLanguageFilters(), null);

    const outer = { sourceLanguages: ["ja" as const] };
    const inner = { sourceLanguages: ["en" as const, "ko" as const] };
    const result = runWithPublicSearchLanguageFilters(outer, () => {
      assert.equal(getPublicSearchLanguageFilters(), outer);
      runWithPublicSearchLanguageFilters(inner, () => {
        assert.equal(getPublicSearchLanguageFilters(), inner);
      });
      assert.equal(getPublicSearchLanguageFilters(), outer);
      return "value";
    });
    assert.equal(result, "value");
    assert.equal(getPublicSearchLanguageFilters(), null);

    // The store follows async work started inside the callback and does not leak between runs.
    const [first, second] = await Promise.all([
      runWithPublicSearchLanguageFilters(outer, async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return getPublicSearchLanguageFilters();
      }),
      runWithPublicSearchLanguageFilters(inner, async () => {
        await Promise.resolve();
        return getPublicSearchLanguageFilters();
      }),
    ]);
    assert.equal(first, outer);
    assert.equal(second, inner);
    assert.equal(getPublicSearchLanguageFilters(), null);
  } finally {
    moduleWithLoad._load = originalLoad;
  }

  console.log("PASS: public search request context (scoped store, nesting, async isolation)");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
