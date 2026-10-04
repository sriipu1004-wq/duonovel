import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { AuthSessionMissingError } from "@supabase/supabase-js";
import {
  ReadOnlyTimeoutError,
  isSchemaCompatibilityReadFailure,
  runReadOnlyWithRetry,
} from "../src/lib/reliability/readOnly";
import { isAuthSessionMissingError } from "../src/lib/auth/authSessionState";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

function verifyAuthSessionClassification(): void {
  assert.equal(isAuthSessionMissingError(new AuthSessionMissingError()), true);
  assert.equal(isAuthSessionMissingError(new Error("Auth session missing!")), true);
  assert.equal(isAuthSessionMissingError(new Error("fetch failed")), false);

  const home = source("src/app/PublicTopPageLegacy.tsx");
  const work = source("src/app/works/[seriesId]/page.tsx");
  const reader = source("src/lib/publicRead.ts");
  const authStatus = source("src/components/auth/AuthStatus.tsx");
  assert.ok(home.includes("isAuthSessionMissingError(result.error)"));
  assert.ok(work.includes("isAuthSessionMissingError(authResult.error)"));
  assert.ok(reader.includes("isAuthSessionMissingError(authResult.error)"));
  assert.ok(authStatus.includes("isAuthSessionMissingError(error)"));
  assert.ok(
    authStatus.includes(
      '{ operation: "header auth", timeoutMs: 2500, retries: 0 }'
    )
  );
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

  attempts = 0;
  let aborted = false;
  await assert.rejects(
    () =>
      runReadOnlyWithRetry(
        (signal) => {
          attempts += 1;
          return new Promise<string>(() => {
            signal.addEventListener(
              "abort",
              () => {
                aborted = true;
              },
              { once: true }
            );
          });
        },
        {
          operation: "test timeout",
          timeoutMs: 250,
          retries: 2,
          retryDelayMs: 0,
        }
      ),
    ReadOnlyTimeoutError
  );
  assert.equal(attempts, 1);
  assert.equal(aborted, true);

  assert.equal(isSchemaCompatibilityReadFailure({ code: "42703" }), true);
  assert.equal(isSchemaCompatibilityReadFailure({ code: "PGRST204" }), true);
  assert.equal(
    isSchemaCompatibilityReadFailure({
      message: "column series.foo does not exist",
    }),
    true
  );
  assert.equal(
    isSchemaCompatibilityReadFailure({
      message: "522 Connection timed out",
    }),
    false
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
  assert.ok(work.includes(".abortSignal(signal)"));
  assert.ok(work.includes("isSchemaCompatibilityReadFailure"));
  assert.ok(
    work.includes('.select("id", { count: "exact", head: true })')
  );
  assert.ok(work.includes("currentUserIdPromise"));
  assert.ok(work.includes("subscriberPromise"));
  assert.ok(work.includes("function WorkTemporaryUnavailable"));
  assert.ok(work.includes("[work] core series unavailable"));
  assert.ok(work.includes("[work] core episode navigation unavailable"));
  assert.ok(work.includes("[work] core episode range unavailable"));
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
  assert.ok(publicWorks.includes("isSchemaCompatibilityReadFailure"));
  assert.ok(
    publicWorks.includes(
      "result.error && isSchemaCompatibilityReadFailure(result.error)"
    )
  );

  const publicServer = source("src/lib/supabase/serverPublic.ts");
  assert.ok(publicServer.includes("new AbortController()"));
  assert.ok(publicServer.includes("controller.abort()"));
  assert.ok(publicServer.includes("fetch: publicReadFetch"));
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
  assert.ok(reader.includes(".abortSignal(signal)"));
  assert.ok(reader.includes("isSchemaCompatibilityReadFailure"));
  assert.ok(reader.includes('.eq("posting_status", "posted")'));
  assert.ok(reader.includes('.eq("is_published", true)'));
  assert.ok(reader.includes("if (!isPublicSeries && !isOwner) return null"));
  assert.ok(reader.includes("showR18Content: false"));
  assert.ok(
    reader.includes(
      '{ operation: "reader recordings", timeoutMs: 1800, retries: 0 }'
    )
  );

  const readerPage = source("src/app/read/[seriesId]/[episodeNumber]/page.tsx");
  assert.ok(readerPage.includes("function ReadTemporaryUnavailable"));
  assert.ok(readerPage.includes("[reader] core public read unavailable"));
  assert.ok(readerPage.includes("loadOptionalReadSubscriber"));
  assert.ok(readerPage.includes('operation: "reader author profile"'));
  assert.equal(readerPage.includes("auth.admin.getUserById"), false);
}

function verifyPublicDatabaseFilters(): void {
  const publicWorks = source("src/lib/publicWorks.ts");

  assert.ok(publicWorks.includes('.eq("publication_status", "public")'));
  assert.ok(publicWorks.includes('.eq("posting_status", "posted")'));
  assert.ok(publicWorks.includes('.eq("is_published", true)'));
}

function verifyRankingIsolation(): void {
  const ranking = source("src/app/ranking/page.tsx");

  assert.ok(ranking.includes('export const dynamic = "force-dynamic"'));
  assert.ok(ranking.includes("getCachedPublicBaseWorkCards"));
  assert.ok(ranking.includes("getCachedPublicRecordingAggregates"));
  assert.ok(
    ranking.includes(
      '{ operation: "ranking public works", timeoutMs: 3000, retries: 0 }'
    )
  );
  assert.ok(
    ranking.includes(
      '{ operation: "ranking recording aggregates", timeoutMs: 2000, retries: 0 }'
    )
  );
  assert.equal(ranking.includes('.select("*")'), false);
}

function verifySitemapIsolation(): void {
  const sitemap = source("src/app/sitemap.ts");

  assert.ok(sitemap.includes('export const dynamic = "force-dynamic"'));
  assert.ok(sitemap.includes("loadSitemapWorkFallback"));
  assert.ok(
    sitemap.includes(
      'operation: "sitemap public works"'
    )
  );
  assert.ok(sitemap.includes("timeoutMs: 2500"));
  assert.ok(sitemap.includes("retries: 0"));
}

async function main(): Promise<void> {
  verifyAuthSessionClassification();
  await verifyReadOnlyRetry();
  verifyHomeIsolation();
  verifyWorkIsolationAndRange();
  verifyPublicWorkCardQueries();
  verifySearchIsolation();
  verifyReaderIsolation();
  verifyPublicDatabaseFilters();
  verifyRankingIsolation();
  verifySitemapIsolation();

  console.log(
    "PASS: Child84 public-read resilience, optional isolation, author batching and work-detail range contracts"
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
