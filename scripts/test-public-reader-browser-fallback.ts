import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  isPublicReaderFallbackEpisodeEligible,
  isPublicReaderFallbackSeriesEligible,
} from "../src/lib/publicReaderFallbackContract";
import {
  ReadOnlyTimeoutError,
  isTransientReadUnavailable,
} from "../src/lib/reliability/readOnly";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

function verifyTransientTriggerClassification(): void {
  assert.equal(
    isTransientReadUnavailable(
      new ReadOnlyTimeoutError("reader series", 2500)
    ),
    true
  );
  assert.equal(isTransientReadUnavailable(new Error("522 timeout")), true);
  assert.equal(isTransientReadUnavailable(new Error("503 upstream")), true);
  assert.equal(
    isTransientReadUnavailable(new Error("Connection terminated due to connection timeout")),
    true
  );
  assert.equal(isTransientReadUnavailable(new Error("permission denied")), false);
  assert.equal(isTransientReadUnavailable(new Error("PGRST116 no rows")), false);
  assert.equal(isTransientReadUnavailable(new Error("not found")), false);
}

function verifyPublicOnlyContract(): void {
  assert.equal(
    isPublicReaderFallbackSeriesEligible({
      id: "series-public",
      publication_status: "public",
      content_rating: "general",
      content_warnings: [],
    }),
    true
  );
  assert.equal(
    isPublicReaderFallbackSeriesEligible({
      id: "series-private",
      publication_status: "private",
      content_rating: "general",
    }),
    false
  );
  assert.equal(
    isPublicReaderFallbackSeriesEligible({
      id: "series-r18",
      publication_status: "public",
      content_rating: "r18",
    }),
    false
  );
  assert.equal(
    isPublicReaderFallbackSeriesEligible({
      id: "series-warning-r18",
      publication_status: "public",
      content_rating: "general",
      content_warnings: ["sexual_r18"],
    }),
    false
  );

  assert.equal(
    isPublicReaderFallbackEpisodeEligible({
      id: "episode-posted",
      posting_status: "posted",
      is_published: true,
    }),
    true
  );
  assert.equal(
    isPublicReaderFallbackEpisodeEligible({
      id: "episode-draft",
      posting_status: "draft",
      is_published: false,
    }),
    false
  );
  assert.equal(
    isPublicReaderFallbackEpisodeEligible({
      id: "episode-scheduled",
      posting_status: "scheduled",
      scheduled_for: "2020-01-01T00:00:00.000Z",
      is_published: false,
    }),
    false
  );
  assert.equal(
    isPublicReaderFallbackEpisodeEligible({
      id: "episode-unpublished",
      posting_status: "posted",
      is_published: false,
    }),
    false
  );
}

function verifyBrowserFallbackImplementation(): void {
  const fallback = source(
    "src/features/playback/PublicReaderBrowserFallback.tsx"
  );
  const publicClient = source("src/lib/supabase/browserPublic.ts");
  const readerPage = source(
    "src/app/read/[seriesId]/[episodeNumber]/page.tsx"
  );

  assert.ok(
    fallback.includes('.eq("publication_status", "public")'),
    "series query must explicitly require canonical public state"
  );
  assert.ok(
    fallback.match(/\.eq\("posting_status", "posted"\)/g)?.length === 3,
    "current/previous/next episode queries must all require posted state"
  );
  assert.ok(
    fallback.match(/\.eq\("is_published", true\)/g)?.length === 3,
    "current/previous/next episode queries must all require is_published=true"
  );
  assert.equal(fallback.includes('.select("*")'), false);
  assert.equal(fallback.includes("createAdminClient"), false);
  assert.equal(fallback.includes("service_role"), false);
  assert.equal(fallback.includes("SUPABASE_SERVICE_ROLE_KEY"), false);
  assert.equal(fallback.includes("/api/episode-translations"), false);
  assert.equal(fallback.includes("/api/human-translations"), false);
  assert.equal(fallback.includes("trackSeriesView"), false);
  assert.equal(fallback.includes("bookmark"), true);
  assert.ok(
    fallback.includes("translation, narration, bookmarks"),
    "fallback copy must make the degraded source-only scope explicit"
  );

  const seriesSafety = fallback.indexOf(
    "if (!isPublicReaderFallbackSeriesEligible(series))"
  );
  const firstEpisodeRead = fallback.indexOf("const currentQuery");
  assert.ok(
    seriesSafety >= 0 &&
      firstEpisodeRead >= 0 &&
      seriesSafety < firstEpisodeRead,
    "R18/public series eligibility must be checked before any episode/body query"
  );

  assert.ok(publicClient.includes("NEXT_PUBLIC_SUPABASE_URL"));
  assert.ok(publicClient.includes("NEXT_PUBLIC_SUPABASE_ANON_KEY"));
  assert.ok(publicClient.includes("persistSession: false"));
  assert.ok(publicClient.includes("autoRefreshToken: false"));
  assert.equal(publicClient.includes("SUPABASE_SERVICE_ROLE_KEY"), false);
  assert.equal(publicClient.includes("service_role"), false);

  assert.ok(readerPage.includes("isTransientReadUnavailable(error)"));
  assert.ok(readerPage.includes("<PublicReaderBrowserFallback"));
  assert.ok(readerPage.includes("if (!payload) notFound();"));
}

function verifyCanonicalRlsMigration(): void {
  const hardening = source(
    "supabase/migrations/20260915190000_security_harden_rls_and_internal_rpcs.sql"
  );

  assert.ok(
    hardening.includes(
      "drop policy if exists series_public_or_owner_select on public.series"
    )
  );
  assert.ok(
    hardening.includes(
      "drop policy if exists series_select_public_or_owner on public.series"
    )
  );
  assert.ok(hardening.includes("publication_status = 'public'"));
  assert.ok(hardening.includes("episodes.posting_status = 'posted'"));
  assert.ok(hardening.includes("episodes.is_published = true"));
  assert.ok(
    hardening.includes(
      "create policy episodes_public_or_owner_select"
    )
  );
}

function main(): void {
  verifyTransientTriggerClassification();
  verifyPublicOnlyContract();
  verifyBrowserFallbackImplementation();
  verifyCanonicalRlsMigration();
  console.log(
    "PASS: Child84b browser-direct fallback trigger, public-only, R18 fail-closed and RLS contracts"
  );
}

main();
