import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ReadOnlyTimeoutError,
  runReadOnlyWithRetry,
} from "../src/lib/reliability/readOnly";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

async function verifyReadOnlyRetry(): Promise<void> {
  let attempts = 0;
  const recovered = await runReadOnlyWithRetry(
    async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error("522 Connection timed out");
      }
      return "ok";
    },
    {
      operation: "test transient read",
      timeoutMs: 100,
      retries: 1,
      retryDelayMs: 0,
    }
  );
  assert.equal(recovered, "ok");
  assert.equal(attempts, 2);

  attempts = 0;
  await assert.rejects(
    () =>
      runReadOnlyWithRetry(
        async () => {
          attempts += 1;
          throw new Error("permission denied");
        },
        {
          operation: "test permanent read",
          timeoutMs: 100,
          retries: 2,
          retryDelayMs: 0,
        }
      ),
    /permission denied/
  );
  assert.equal(attempts, 1);

  await assert.rejects(
    () =>
      runReadOnlyWithRetry(
        () => new Promise<string>(() => undefined),
        {
          operation: "test timeout",
          timeoutMs: 250,
          retries: 0,
        }
      ),
    ReadOnlyTimeoutError
  );
}
function verifyHomeIsolation(): void {
  const home = source("src/app/PublicTopPageLegacy.tsx");

  assert.ok(home.includes("const viewerStatePromise = loadHomeViewerState()"));
  assert.ok(home.includes("loadHomeRecordingSnapshot(workCardsPromise)"));
  assert.ok(home.includes("function HomeSectionUnavailable"));
  assert.ok(home.includes("async function HomeBookmarkSection"));
  assert.ok(home.includes("async function HomePopularitySections"));
  assert.ok(home.includes("recordingSnapshotPromise"));
  assert.ok(home.includes('{ operation: "home auth", timeoutMs: 2000, retries: 1 }'));
  assert.ok(
    home.includes(
      '{ operation: "home recording aggregates", timeoutMs: 1500, retries: 0 }'
    )
  );

  const pageStart = home.indexOf("export default async function PublicTopPage");
  const pageSource = home.slice(pageStart);
  assert.equal(pageSource.includes("await viewerStatePromise"), false);
}
function verifyWorkIsolationAndRange(): void {
  const work = source("src/app/works/[seriesId]/page.tsx");

  assert.ok(work.includes('import { cache, Suspense } from "react"'));
  assert.ok(work.includes("const fetchSeriesResult = cache("));
  assert.ok(work.includes("fetchFirstPublicEpisode"));
  assert.ok(work.includes("fetchEpisodeRangeBySeriesId"));
  assert.ok(work.includes(".range(from, to)"));
  assert.ok(
    work.includes('.select("id", { count: "exact", head: true })')
  );
  assert.ok(work.includes("currentUserIdPromise"));
  assert.ok(work.includes("subscriberPromise"));
  assert.ok(work.includes('{ operation: "work recordings", timeoutMs: 1800, retries: 0 }'));
  assert.ok(work.includes("Related works are temporarily unavailable."));
  assert.equal(work.includes("fetchEpisodesBySeriesId(seriesId)"), false);
}
function verifyPublicWorkCardQueries(): void {
  const publicWorks = source("src/lib/publicWorks.ts");

  assert.equal(publicWorks.includes("auth.admin.getUserById"), false);
  assert.ok(publicWorks.includes('.from("users")'));
  assert.ok(publicWorks.includes('.select("id, display_name")'));
  assert.ok(publicWorks.includes('.in("id", authorIds)'));
  assert.ok(
    publicWorks.includes(
      "translationEligible: isSeriesTranslationEligible(series)"
    )
  );

  // source_language backfill is still unverified while Production Supabase
  // connectivity is degraded, so the canonical legacy inference gate remains.
  assert.ok(publicWorks.includes("inferSeriesSourceLanguage("));
  assert.ok(publicWorks.includes("fetchEpisodeBodyMapByIds("));
}

function verifySearchIsolation(): void {
  const search = source("src/app/search/SearchPageLegacy.tsx");

  assert.ok(
    search.includes(
      '{ operation: "search public works", timeoutMs: 3500, retries: 0 }'
    )
  );
  assert.ok(
    search.includes(
      '{ operation: "search popularity", timeoutMs: 2500, retries: 0 }'
    )
  );
  assert.ok(search.includes("publicWorksAvailable"));
  assert.ok(search.includes("popularityAvailable"));
  assert.ok(search.includes("Public work data is temporarily unavailable."));
}

function verifyReaderIsolation(): void {
  const reader = source("src/lib/publicRead.ts");

  assert.ok(
    reader.includes(
      '{ operation: "reader series", timeoutMs: 2500, retries: 1 }'
    )
  );
  assert.ok(reader.includes("includePrivate: boolean"));
  assert.ok(reader.includes('.eq("posting_status", "posted")'));
  assert.ok(reader.includes('.eq("is_published", true)'));
  assert.ok(reader.includes("if (!isPublicSeries && !isOwner) return null"));
  assert.ok(reader.includes("showR18Content: false"));
  assert.ok(
    reader.includes(
      '{ operation: "reader recordings", timeoutMs: 1800, retries: 0 }'
    )
  );
}

function verifyPublicDatabaseFilters(): void {
  const publicWorks = source("src/lib/publicWorks.ts");

  assert.ok(publicWorks.includes('.eq("publication_status", "public")'));
  assert.ok(publicWorks.includes('.eq("posting_status", "posted")'));
  assert.ok(publicWorks.includes('.eq("is_published", true)'));
}

async function main(): Promise<void> {
  await verifyReadOnlyRetry();
  verifyHomeIsolation();
  verifyWorkIsolationAndRange();
  verifyPublicWorkCardQueries();
  verifySearchIsolation();
  verifyReaderIsolation();
  verifyPublicDatabaseFilters();

  console.log(
    "PASS: Child84 public-read resilience, optional isolation, author batching and work-detail range contracts"
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
