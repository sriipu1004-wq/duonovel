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
  const optionalAuthorRead = work.slice(
    work.indexOf("async function loadOptionalAuthor"),
    work.indexOf("async function WorkSubscriptionNotice")
  );
  assert.ok(optionalAuthorRead.includes('.select("id, display_name")'));
  assert.equal(
    optionalAuthorRead.includes('.select("id, display_name, username, pen_name, name")'),
    false
  );
  assert.ok(work.includes("const fetchSeriesResult = cache("));
  assert.ok(work.includes("fetchFirstPublicEpisode"));
  assert.ok(work.includes("fetchEpisodeRangeBySeriesId"));
  assert.ok(work.includes(".range(from, to)"));
  assert.ok(work.includes(".abortSignal(signal)"));
  assert.ok(work.includes("isSchemaCompatibilityReadFailure"));
  assert.equal(
    work.includes('.select("id", { count: "exact", head: true })'),
    false
  );
  assert.ok(work.includes("const episodeCount = episodes.length"));
  assert.ok(work.includes("const PAGE_SIZE = 1000"));
  assert.ok(work.includes(".range(start, start + PAGE_SIZE - 1)"));
  assert.ok(work.includes('.eq("posting_status", "posted")'));
  assert.ok(work.includes('.eq("is_published", true)'));
  assert.ok(work.includes("currentUserIdPromise"));
  assert.ok(work.includes("subscriberPromise"));
  assert.ok(work.includes("function WorkTemporaryUnavailable"));
  assert.ok(work.includes("[work] core series unavailable"));
  assert.ok(work.includes("[work] core episode navigation unavailable"));
  assert.ok(work.includes("[work] core episode range unavailable"));
  assert.ok(work.includes('{ operation: "work recordings", timeoutMs: 1800, retries: 0 }'));
  assert.ok(work.includes("Related works are temporarily unavailable."));
  assert.equal(work.includes("fetchEpisodesBySeriesId(seriesId)"), false);

  const workLayout = source("src/app/works/[seriesId]/layout.tsx");
  assert.ok(workLayout.includes('operation: "work layout series"'));
  assert.ok(workLayout.includes(".abortSignal(signal)"));
  assert.ok(workLayout.includes('status: "unavailable"'));
  assert.ok(workLayout.includes("[work-layout] content safety unavailable"));
  assert.ok(
    workLayout.includes('surfaceResult.status === "unavailable"')
  );
  assert.ok(workLayout.includes("<WorkSafetyUnavailable"));
  assert.ok(
    workLayout.includes(
      'operation: "work layout r18 preference"'
    )
  );

  const translationAvailability = source(
    "src/features/works/WorkTranslationAvailability.tsx"
  );
  assert.ok(
    translationAvailability.includes(
      'operation: "work translation availability"'
    )
  );

  const publicTranslations = source(
    "src/lib/translation/publicWorkTranslations.ts"
  );
  assert.ok(publicTranslations.includes("signal?: AbortSignal"));
  assert.ok(publicTranslations.includes(".abortSignal(signal)"));
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
  assert.ok(publicWorks.includes('.eq("posting_status", "posted")'));
  assert.ok(publicWorks.includes('.eq("is_published", true)'));
  const episodeProjectionStart = publicWorks.indexOf(
    "const PUBLIC_WORK_EPISODE_SELECT"
  );
  const episodeProjectionEnd = publicWorks.indexOf(
    "function isEmailLike",
    episodeProjectionStart
  );
  const episodeProjection = publicWorks.slice(
    episodeProjectionStart,
    episodeProjectionEnd
  );
  assert.ok(episodeProjection.includes("posted_at"));
  assert.equal(episodeProjection.includes("scheduled_for"), false);
  assert.equal(episodeProjection.includes("posting_status"), false);

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
  assert.ok(search.includes("isAuthSessionMissingError(result.error)"));
  assert.ok(search.includes("Public work data is temporarily unavailable."));
}

function verifyReaderAuthorProfileColumns(): void {
  const readerPage = source("src/app/read/[seriesId]/[episodeNumber]/page.tsx");
  const authorQuery = readerPage.slice(
    readerPage.indexOf("async function getNormalAuthorName("),
    readerPage.indexOf("export async function generateMetadata(")
  );
  assert.ok(authorQuery.includes('.from("users")'));
  assert.ok(authorQuery.includes('.select("display_name")'));
  assert.equal(authorQuery.includes("username, pen_name, name"), false);
  assert.ok(authorQuery.includes("result.data.display_name"));
  assert.ok(authorQuery.includes("return fallbackName"));
}

function verifyPublicEpisodeSummaryReadBoundary(): void {
  const works = source("src/lib/publicWorks.ts");
  const migration = source(
    "supabase/migrations/20261010013603_public_episode_work_summaries.sql"
  );

  const privilegeMigration = source(
    "supabase/migrations/20261010013642_restrict_public_episode_work_summaries_grants.sql"
  );
  assert.ok(privilegeMigration.includes("revoke all on public.public_episode_work_summaries from anon, authenticated"));
  assert.ok(privilegeMigration.includes("grant select on public.public_episode_work_summaries to anon, authenticated"));
  assert.ok(migration.includes("with (security_invoker = true)"));
  assert.ok(migration.includes("join public.series s on s.id = e.series_id"));
  assert.ok(migration.includes("s.publication_status = 'public'"));
  assert.ok(migration.includes("e.posting_status = 'posted'"));
  assert.ok(migration.includes("e.is_published = true"));
  assert.ok(migration.includes("grant select on public.public_episode_work_summaries to anon, authenticated"));
  assert.equal(migration.includes("security definer"), false);
  assert.equal(migration.includes("e.body"), false);

  const summaryRead = works.slice(
    works.indexOf("async function fetchPublicEpisodeSummariesBySeriesIds("),
    works.indexOf("async function fetchEpisodeBodyMapByIds(")
  );
  assert.ok(summaryRead.includes('.from("public_episode_work_summaries")'));
  assert.ok(summaryRead.includes('.in("series_id", seriesIds)'));
  assert.ok(summaryRead.includes('.order("series_id", { ascending: true })'));
  assert.ok(summaryRead.includes(".range(start, start + PAGE_SIZE - 1)"));
  assert.ok(summaryRead.includes("isMissingEpisodeSummaryView(error)"));
  assert.ok(summaryRead.includes("throw new Error("));
  assert.ok(works.includes('code === "PGRST205" || code === "42P01"'));
  const build = works.slice(
    works.indexOf("async function buildPublicBaseWorkCards()"),
    works.indexOf("const getCachedPublicBaseWorkCardsInternal")
  );
  assert.ok(build.includes("fetchPublicEpisodeSummariesBySeriesIds("));
  assert.equal(build.includes("fetchEpisodesBySeriesIds("), false);
  assert.ok(build.includes("episodeSummary.public_episode_numbers"));
  assert.ok(build.includes("legacyFirstEpisodeBodyMap.get(episodeSummary.first_episode_id)"));
}

function verifyReaderIsolation(): void {
  const reader = source("src/lib/publicRead.ts");

  assert.ok(reader.includes('import { cache } from "react"'));
  assert.ok(
    reader.includes(
      "export const getCachedPublicReadPagePayload = cache(async ("
    )
  );
  assert.ok(
    reader.includes(
      '{ operation: "reader series", timeoutMs: 2500, retries: 1 }'
    )
  );
  assert.ok(reader.includes("includePrivate: boolean"));
  assert.ok(reader.includes("fetchAdjacentEpisode"));
  assert.ok(reader.includes('.lt("episode_number", episodeNumber)'));
  assert.ok(reader.includes('.gt("episode_number", episodeNumber)'));
  assert.ok(reader.includes(".limit(1)"));
  assert.ok(reader.includes('operation: "reader previous episode"'));
  assert.ok(reader.includes('operation: "reader next episode"'));
  assert.equal(reader.includes("fetchEpisodeNavigation"), false);
  assert.equal(reader.includes("publicEpisodes:"), false);
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
  assert.ok(readerPage.includes("previousEpisode"));
  assert.ok(readerPage.includes("nextEpisode"));
  assert.equal(readerPage.includes("publicEpisodes"), false);
  assert.equal(readerPage.includes("auth.admin.getUserById"), false);

  const readerLayout = source("src/app/read/[seriesId]/[episodeNumber]/layout.tsx");
  assert.ok(readerLayout.includes("payload.previousEpisode"));
  assert.ok(readerLayout.includes("payload.nextEpisode"));
  assert.equal(readerLayout.includes("payload.publicEpisodes"), false);
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

function verifyPopularityDailyCutover(): void {
  const popularity = source("src/lib/popularity.ts");
  assert.ok(popularity.includes('.from("series_popularity_daily")'));
  assert.ok(popularity.includes('.in("series_id", normalizedSeriesIds)'));
  assert.ok(popularity.includes('.order("series_id", { ascending: true })'));
  assert.ok(popularity.includes('.order("bucket_date", { ascending: true })'));
  assert.ok(popularity.includes('.range(start, start + POPULARITY_DAILY_PAGE_SIZE - 1)'));
  assert.ok(popularity.includes("rows.length < POPULARITY_DAILY_PAGE_SIZE"));
  assert.ok(popularity.includes("throw new Error("));
  assert.equal(popularity.includes('.from("user_series_reactions")'), false);
  assert.equal(popularity.includes('.from("user_series_bookmarks")'), false);
  assert.equal(popularity.includes('.from("series_view_events")'), false);
  assert.equal(popularity.includes('.from("recording_play_events")'), false);
}

async function main(): Promise<void> {
  verifyAuthSessionClassification();
  await verifyReadOnlyRetry();
  verifyHomeIsolation();
  verifyWorkIsolationAndRange();
  verifyPublicWorkCardQueries();
  verifyPublicEpisodeSummaryReadBoundary();
  verifySearchIsolation();
  verifyPopularityDailyCutover();
  verifyReaderAuthorProfileColumns();
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
