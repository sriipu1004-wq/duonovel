// Per-country restriction (owner 2026-11-15): pure helpers, the proxy's 451,
// the sitemap filter and source checks that every text / translation / audio
// path is guarded. No network: fetch is replaced with a local stub.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import {
  extractRegionGuardedSeriesId,
  isBlockedInCountry,
  isSeriesBlockedInCountry,
  normalizeCountryCode,
  parseRegionRestrictionRows,
  regionBlockedHtml,
  REGION_BLOCKED_STATUS,
} from "../src/lib/rights/regionRestriction";
import {
  loadRegionRestrictionMapForProxy,
  resetRegionRestrictionProxyCache,
} from "../src/lib/rights/regionRestrictionProxy";

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

const RESTRICTED = "8514e9da-7864-4dad-a397-de06abee8fdc";
const FREE = "1dbf029f-ccd7-4e99-b875-432ad50abb50";
const OTHER = "d5e231b1-4f59-4d44-80a8-067cd49f8504";

async function main() {
  // --- normalizeCountryCode
  assert.equal(normalizeCountryCode("us"), "US");
  assert.equal(normalizeCountryCode(" JP "), "JP");
  for (const bad of [null, undefined, "", "USA", "1A", "U", "U S"]) {
    assert.equal(normalizeCountryCode(bad as string | null | undefined), null, String(bad));
  }

  // --- isBlockedInCountry: fail closed only for restricted works
  const block = { mode: "block", countries: ["US"] } as const;
  const allow = { mode: "allow", countries: ["JP", "GB"] } as const;
  assert.equal(isBlockedInCountry(undefined, null), false);
  assert.equal(isBlockedInCountry(block, "US"), true);
  assert.equal(isBlockedInCountry(block, "JP"), false);
  assert.equal(isBlockedInCountry(block, null), true, "unknown country is blocked");
  assert.equal(isBlockedInCountry(allow, "JP"), false);
  assert.equal(isBlockedInCountry(allow, "AU"), true, "allow list: others withheld");
  assert.equal(isBlockedInCountry(allow, null), true);

  // --- parseRegionRestrictionRows: strict
  const map = parseRegionRestrictionRows([
    { series_id: RESTRICTED.toUpperCase(), blocked_countries: ["US", "US", "KR"], allowed_countries: null },
    { series_id: OTHER, blocked_countries: null, allowed_countries: ["JP"] },
  ]);
  assert.deepEqual(map.get(RESTRICTED), { mode: "block", countries: ["US", "KR"] });
  assert.deepEqual(map.get(OTHER), { mode: "allow", countries: ["JP"] });
  assert.equal(isSeriesBlockedInCountry(map, RESTRICTED, "KR"), true);
  assert.equal(isSeriesBlockedInCountry(map, RESTRICTED.toUpperCase(), "US"), true);
  assert.equal(isSeriesBlockedInCountry(map, RESTRICTED, "JP"), false);
  assert.equal(isSeriesBlockedInCountry(map, OTHER, "JP"), false);
  assert.equal(isSeriesBlockedInCountry(map, OTHER, "US"), true);
  assert.equal(isSeriesBlockedInCountry(map, FREE, null), false);
  assert.equal(isSeriesBlockedInCountry(map, null, null), false);
  for (const bad of [
    null,
    {},
    [{ series_id: "x", blocked_countries: ["US"] }],
    [{ series_id: RESTRICTED, blocked_countries: [] }],
    [{ series_id: RESTRICTED, blocked_countries: ["us"] }],
    [{ series_id: RESTRICTED, blocked_countries: "US" }],
    [{ series_id: RESTRICTED, blocked_countries: ["US"], allowed_countries: ["JP"] }],
    [{ series_id: RESTRICTED, blocked_countries: null, allowed_countries: null }],
    [{ series_id: RESTRICTED }],
    [null],
  ]) {
    assert.throws(() => parseRegionRestrictionRows(bad), String(JSON.stringify(bad)));
  }

  // --- extractRegionGuardedSeriesId
  const guarded: Array<[string, string | null]> = [
    [`/works/${RESTRICTED}`, RESTRICTED],
    [`/works/${RESTRICTED}/translations/en`, RESTRICTED],
    [`/locale-work/${RESTRICTED}`, RESTRICTED],
    [`/read/${RESTRICTED}/3`, RESTRICTED],
    [`/translate/${RESTRICTED}/1`, RESTRICTED],
    [`/record/create/${RESTRICTED}`, RESTRICTED],
    [`/works/${RESTRICTED.toUpperCase()}`, RESTRICTED],
    [`/works/${RESTRICTED}/opengraph-image`, null],
    [`/works/${RESTRICTED}/opengraph-image-abc123`, null],
    ["/works/not-a-uuid", null],
    ["/search", null],
    [`/authors/${RESTRICTED}`, null],
    [`/record`, null],
  ];
  for (const [path, expected] of guarded) {
    assert.equal(extractRegionGuardedSeriesId(path), expected, path);
  }

  // --- blocked page
  const html = regionBlockedHtml("en");
  assert.ok(html.includes('lang="en"') && html.includes("noindex"));
  assert.ok(regionBlockedHtml("xx").includes('lang="ja"'));
  assert.ok(regionBlockedHtml("ko").includes("저작권"));

  // --- proxy loader + proxy 451 with a stubbed Data API
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-only-public-key";
  let calls = 0;
  let mode: "ok" | "fail" = "ok";
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    calls += 1;
    assert.ok(String(input).includes("/rest/v1/series_region_restrictions?select=series_id,blocked_countries,allowed_countries"));
    if (mode === "fail") return new Response("boom", { status: 503 });
    return Response.json([
      { series_id: RESTRICTED, blocked_countries: ["US"], allowed_countries: null },
      { series_id: OTHER, blocked_countries: null, allowed_countries: ["JP", "GB"] },
    ]);
  }) as typeof fetch;

  try {
    resetRegionRestrictionProxyCache();
    const first = await loadRegionRestrictionMapForProxy(1_000);
    const second = await loadRegionRestrictionMapForProxy(2_000);
    assert.equal(calls, 1, "cached for the TTL");
    assert.equal(first, second);
    resetRegionRestrictionProxyCache();
    mode = "fail";
    assert.equal(await loadRegionRestrictionMapForProxy(), null, "failure -> null (page guard decides)");
    mode = "ok";
    resetRegionRestrictionProxyCache();

    const { proxy } = await import("../src/proxy");
    const call = async (path: string, country: string | null, cookie?: string) => {
      const headers = new Headers();
      if (country) headers.set("x-vercel-ip-country", country);
      if (cookie) headers.set("cookie", cookie);
      return proxy(new NextRequest(`https://www.syosetu-libread.com${path}`, { headers }));
    };

    const blockedUs = await call(`/read/${RESTRICTED}/1`, "US");
    assert.equal(blockedUs.status, REGION_BLOCKED_STATUS);
    assert.match(blockedUs.headers.get("cache-control") ?? "", /no-store/);
    assert.equal(blockedUs.headers.get("x-robots-tag"), "noindex");

    assert.equal((await call(`/works/${RESTRICTED}`, null)).status, REGION_BLOCKED_STATUS, "unknown country");
    assert.equal((await call(`/en/works/${RESTRICTED}`, "US")).status, REGION_BLOCKED_STATUS, "locale prefix");
    const koBlocked = await call(`/ko/read/${RESTRICTED}/1`, "US");
    assert.equal(koBlocked.status, REGION_BLOCKED_STATUS);
    assert.ok((await koBlocked.text()).includes('lang="ko"'));

    assert.notEqual((await call(`/read/${RESTRICTED}/1`, "JP")).status, REGION_BLOCKED_STATUS);
    assert.notEqual((await call(`/read/${OTHER}/1`, "GB")).status, REGION_BLOCKED_STATUS, "allow list: allowed");
    assert.equal((await call(`/read/${OTHER}/1`, "AU")).status, REGION_BLOCKED_STATUS, "allow list: others");
    assert.equal((await call(`/read/${OTHER}/1`, "US")).status, REGION_BLOCKED_STATUS);
    assert.notEqual((await call(`/read/${FREE}/1`, "US")).status, REGION_BLOCKED_STATUS);
    assert.notEqual((await call(`/read/${FREE}/1`, null)).status, REGION_BLOCKED_STATUS);
    assert.notEqual(
      (await call(`/works/${RESTRICTED}/opengraph-image`, "US")).status,
      REGION_BLOCKED_STATUS,
      "OG image (title/author only) is not withheld"
    );

    // A failed restriction read lets the proxy pass; the page guard decides.
    resetRegionRestrictionProxyCache();
    mode = "fail";
    assert.notEqual((await call(`/read/${RESTRICTED}/1`, "US")).status, REGION_BLOCKED_STATUS);
  } finally {
    globalThis.fetch = realFetch;
  }

  // --- sitemap filter (US-blocked works are left out)
  const sitemapSource = read("src/app/sitemap.ts");
  assert.ok(sitemapSource.includes('isSeriesBlockedInCountry(restrictions, work.seriesId, "US")'));
  assert.ok(sitemapSource.includes("excludeUsBlockedWorks(works, restrictions)"));

  // --- source checks: every guarded surface calls the guard
  const pageGuards: Array<[string, number]> = [
    ["src/app/read/[seriesId]/[episodeNumber]/page.tsx", 2],
    ["src/app/works/[seriesId]/page.tsx", 2],
    ["src/app/locale-work/[seriesId]/page.tsx", 2],
    ["src/app/translate/[seriesId]/[episodeNumber]/page.tsx", 1],
    ["src/app/record/create/[seriesId]/page.tsx", 1],
    ["src/app/works/[seriesId]/translations/[targetLanguage]/page.tsx", 1],
  ];
  for (const [path, count] of pageGuards) {
    const source = read(path);
    const found = source.split("await assertSeriesAvailableInRequestRegion(seriesId);").length - 1;
    assert.equal(found, count, path);
  }
  for (const path of [
    "src/app/api/recordings/ai-audio/[recordingId]/route.ts",
    "src/app/api/recordings/human-audio/[recordingId]/route.ts",
  ]) {
    assert.ok(read(path).includes("await regionBlockedApiResponse(request, seriesId)"), path);
  }
  const access = read("src/lib/translation/episodeTranslationServer.ts");
  assert.ok(access.includes("canRead: (isPublic || isOwner) && r18Allowed && !regionBlocked,"));
  const server = read("src/lib/rights/regionRestriction.server.ts");
  assert.ok(server.startsWith('import "server-only";'));
  assert.ok(server.includes("if (error) throw"), "read failure must not become 'no restrictions'");

  // --- migration shape
  const migration = read("supabase/migrations/20261116090000_region_restrictions.sql");
  for (const table of ["episodes", "recordings", "episode_human_translations"]) {
    assert.ok(
      new RegExp(`on public\\.${table}\\n  as restrictive\\n  for select\\n  to anon, authenticated`).test(migration),
      `restrictive select on ${table}`
    );
  }
  assert.ok(!/for (insert|update|delete|all)[\s\S]*series_region_restrictions/.test(
    migration.split("create or replace function public.series_region_unrestricted_or_owner")[0]
      .replace(/series_region_restrictions_select_all[\s\S]*?using \(true\);/, "")
  ), "no write policy on series_region_restrictions");

  console.log("region restriction tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
