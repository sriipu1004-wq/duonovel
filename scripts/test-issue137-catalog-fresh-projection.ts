import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  fetchFreshPublicCatalogProjection,
  loadFreshlyReconciledPublicCards,
  reconcileCardsWithFreshProjection,
  type PublicCatalogProjection,
} from "../src/lib/publicCatalogFreshProjection";
import { ReadOnlyTimeoutError, runReadOnlyWithRetry } from "../src/lib/reliability/readOnly";

// Issue #137 R0-1 PR-F (案 D): cached catalog cards must be reconciled with an
// uncached publication/rating projection before any visibility branch.

type Card = { seriesId: string; contentRating: "general" | "r18"; title: string };
const card = (seriesId: string, contentRating: "general" | "r18" = "general"): Card => ({
  seriesId,
  contentRating,
  title: "title-" + seriesId,
});

// Mirrors the visibility branches of getCachedPublicBaseWorkCards so the
// behavior for anonymous / "general" / "all" callers can be exercised on the
// reconciled output.
function applyVisibility(
  cards: Card[],
  visibility: "viewer" | "general" | "all",
  showR18Content = false
): Card[] {
  if (visibility === "all") return cards;
  if (visibility === "general") return cards.filter((c) => c.contentRating !== "r18");
  return showR18Content ? cards : cards.filter((c) => c.contentRating !== "r18");
}

const ids = (cards: Card[]) => cards.map((c) => c.seriesId).sort();

async function main() {
  // ① cached as public, absent from the fresh projection => not shown.
  {
    const cached = [card("a"), card("withdrawn"), card("b", "r18")];
    const projection: PublicCatalogProjection = new Map([
      ["a", "general"],
      ["b", "r18"],
    ]);
    const result = await loadFreshlyReconciledPublicCards(
      async () => cached,
      async () => projection
    );
    assert.deepEqual(ids(result), ["a", "b"], "withdrawn work must be dropped");
    for (const visibility of ["viewer", "general", "all"] as const) {
      assert.equal(
        applyVisibility(result, visibility, true).some((c) => c.seriesId === "withdrawn"),
        false,
        "withdrawn work must not appear for visibility " + visibility
      );
    }
  }

  // ② cached as general, fresh projection says R18 => hidden from anonymous.
  {
    const cached = [card("a"), card("now-r18", "general")];
    const projection: PublicCatalogProjection = new Map([
      ["a", "general"],
      ["now-r18", "r18"],
    ]);
    const result = await loadFreshlyReconciledPublicCards(
      async () => cached,
      async () => projection
    );
    assert.equal(
      applyVisibility(result, "viewer", false).some((c) => c.seriesId === "now-r18"),
      false,
      "stale general card of a now-R18 work must not reach an anonymous viewer"
    );
    // The mismatched card is dropped entirely (not relabelled), so even an
    // opted-in viewer and "all" never see the stale general card.
    assert.deepEqual(ids(applyVisibility(result, "all")), ["a"]);
    assert.deepEqual(ids(applyVisibility(result, "viewer", true)), ["a"]);
  }

  // Rating going the other way (R18 -> general) is also a mismatch: dropped
  // until the cache catches up; never shown with a stale label.
  assert.deepEqual(
    reconcileCardsWithFreshProjection([card("x", "r18")], new Map([["x", "general"]])),
    []
  );

  // ③ projection failure => rejects; stale cards are never returned.
  {
    let cachedLoaded = false;
    await assert.rejects(
      loadFreshlyReconciledPublicCards(
        async () => {
          cachedLoaded = true;
          return [card("a")];
        },
        async () => {
          throw new Error("public catalog projection の取得に失敗: boom");
        }
      ),
      /projection/,
      "projection failure must fail closed"
    );
    assert.equal(cachedLoaded, true, "cache and projection are read in parallel");

    await assert.rejects(
      loadFreshlyReconciledPublicCards(
        async () => {
          throw new Error("cache failure");
        },
        async () => new Map([["a", "general"]])
      ),
      /cache failure/
    );

    // A hanging projection must be cut by the caller's existing deadline.
    await assert.rejects(
      runReadOnlyWithRetry(
        () =>
          loadFreshlyReconciledPublicCards(
            async () => [card("a")],
            () => new Promise<PublicCatalogProjection>(() => undefined)
          ),
        { operation: "fresh projection deadline", timeoutMs: 250, retries: 0 }
      ),
      (error: unknown) => error instanceof ReadOnlyTimeoutError
    );
  }

  // fetchFreshPublicCatalogProjection: paging, schema fallback, other errors throw.
  {
    const rows = Array.from({ length: 1001 }, (_, i) => ({
      id: "s" + String(i).padStart(4, "0"),
      publication_status: "public",
      content_rating: i === 5 ? "r18" : "general",
      content_warnings: i === 7 ? ["sexual_r18"] : [],
    }));
    rows.push({ id: "private-row", publication_status: "private", content_rating: "general", content_warnings: [] });
    const calls: Array<{ select: string; eq: [string, string]; range: [number, number] }> = [];
    const makeClient = (failFirstSelectWith?: { code?: string; message: string }) => ({
      from(table: "series") {
        assert.equal(table, "series");
        return {
          select(selectClause: string) {
            return {
              eq(eqColumn: "publication_status", eqValue: "public") {
                return {
                  order(column: "id", options: { ascending: true }) {
                    assert.equal(column, "id");
                    assert.equal(options.ascending, true);
                    return {
                      async range(from: number, to: number) {
                        calls.push({ select: selectClause, eq: [eqColumn, eqValue], range: [from, to] });
                        if (failFirstSelectWith && selectClause !== "*") {
                          return { data: null, error: failFirstSelectWith };
                        }
                        return { data: rows.slice(from, to + 1), error: null };
                      },
                    };
                  },
                };
              },
            };
          },
        };
      },
    });

    const projection = await fetchFreshPublicCatalogProjection(makeClient());
    assert.equal(projection.size, 1001, "both pages must be read; private rows excluded");
    assert.equal(projection.has("private-row"), false);
    assert.equal(projection.get("s0005"), "r18");
    assert.equal(projection.get("s0007"), "r18", "sexual_r18 warning is effective R18");
    assert.equal(projection.get("s0000"), "general");
    assert.deepEqual(calls.map((c) => c.range), [[0, 999], [1000, 1999]]);
    assert.ok(calls.every((c) => c.eq[0] === "publication_status" && c.eq[1] === "public"));
    assert.equal(calls[0].select, "id, content_rating, content_warnings, publication_status");

    calls.length = 0;
    const fallback = await fetchFreshPublicCatalogProjection(
      makeClient({ code: "42703", message: "column series.content_warnings does not exist" })
    );
    assert.equal(fallback.size, 1001, "schema difference falls back to *");
    assert.ok(calls.some((c) => c.select === "*"));

    await assert.rejects(
      fetchFreshPublicCatalogProjection(makeClient({ message: "permission denied" })),
      /public catalog projection の取得に失敗/,
      "non-schema errors must throw"
    );
  }

  // ④ wiring: reconciliation runs before every visibility branch, including
  // "all" and "general", and the cache entry itself is unchanged.
  {
    const works = readFileSync("src/lib/publicWorks.ts", "utf8");
    const start = works.indexOf("export async function getCachedPublicBaseWorkCards(");
    assert.ok(start >= 0);
    const body = works.slice(start, works.indexOf("\ntype RecordingAggregateRow", start));
    const reconcile = body.indexOf("loadFreshlyReconciledPublicCards(");
    const allBranch = body.indexOf('if (visibility === "all") return cards;');
    const generalBranch = body.indexOf('if (visibility === "general")');
    assert.ok(reconcile >= 0, "getCachedPublicBaseWorkCards must reconcile");
    assert.ok(allBranch > reconcile && generalBranch > reconcile,
      "reconciliation must precede the all/general branches");
    assert.ok(body.slice(reconcile, allBranch).includes("getCachedPublicBaseWorkCardsInternal"));
    assert.ok(body.slice(reconcile, allBranch).includes("fetchFreshPublicCatalogProjection"));
    assert.equal(
      (body.match(/getCachedPublicBaseWorkCardsInternal\(\)/g) ?? []).length,
      0,
      "no unreconciled direct read of the cached cards may remain"
    );
    assert.ok(works.includes('["public-base-work-cards-v12-canonical-source-language"]'));
    assert.ok(works.includes('{ revalidate: 60, tags: ["public-base-work-cards"] }'));

    const projectionSource = readFileSync("src/lib/publicCatalogFreshProjection.ts", "utf8");
    assert.equal(
      /from "next\/cache"|unstable_cache\(|from "react"|\bcache\(/.test(projectionSource),
      false,
      "projection must not be cached"
    );
    assert.equal(projectionSource.includes("createAdminClient"), false, "projection must use the public client");
    assert.ok(projectionSource.includes("createPublicServerClient"));
  }

  // ⑤ ranking no longer bypasses the R18 viewer filter.
  {
    const ranking = readFileSync("src/app/ranking/page.tsx", "utf8");
    assert.equal(/visibility:\s*"all"/.test(ranking), false, "ranking must not use visibility all");
    assert.ok(ranking.includes('visibility: "viewer"'));
    assert.ok(ranking.includes("ignoreContentLanguageFilter: true"));
    assert.ok(ranking.includes("ignorePublicSearchLanguageFilter: true"));

    // Remaining "all" callers must apply the viewer's R18 preference themselves.
    const record = readFileSync("src/app/record/page.tsx", "utf8");
    assert.ok(record.includes('work.contentRating !== "r18"') && record.includes("r18Preference.showR18Content"));
    const readerPage = readFileSync("src/app/search/reader/[readerId]/page.tsx", "utf8");
    assert.ok(readerPage.includes("!preference.showR18Content && isR18Series(row)"));
  }

  console.log("PASS: issue137 catalog fresh projection drops withdrawn / re-rated cached cards for every visibility, fails closed, and ranking respects R18 preference");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
