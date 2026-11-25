import assert from "node:assert/strict";
import Module from "node:module";

// Characterization test: pins current behavior only (LT-002).
// The admin Supabase client, next/headers and next/navigation are replaced in-process; no DB access.

type Result = { data: unknown; error: { message: string } | null };
const state = {
  reads: 0,
  selects: [] as string[],
  next: [] as Array<Result | Error>,
  headerCountry: null as string | null,
};

const adminStub = {
  createAdminClient: () => ({
    from(table: string) {
      assert.equal(table, "series_region_restrictions");
      return {
        select(columns: string) {
          state.selects.push(columns);
          return {
            abortSignal(signal: AbortSignal) {
              assert.ok(signal instanceof AbortSignal);
              state.reads += 1;
              const next = state.next.shift() ?? { data: [], error: null };
              return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
            },
          };
        },
      };
    },
  }),
};

class NotFoundSignal extends Error {}
const moduleWithLoad = Module as unknown as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown;
};
const originalLoad = moduleWithLoad._load;
moduleWithLoad._load = function (request, parent, isMain) {
  if (request === "server-only") return {};
  if (request === "@/lib/supabase/admin" || request.endsWith("/lib/supabase/admin")) return adminStub;
  if (request === "next/headers") {
    return { headers: async () => new Headers(state.headerCountry ? { "x-vercel-ip-country": state.headerCountry } : {}) };
  }
  if (request === "next/navigation") {
    return {
      notFound: () => {
        throw new NotFoundSignal("not_found");
      },
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const BLOCKED_ID = "11111111-1111-4111-8111-111111111111";
const ALLOWED_ID = "22222222-2222-4222-8222-222222222222";
const FREE_ID = "33333333-3333-4333-8333-333333333333";
const rows = [
  { series_id: BLOCKED_ID, blocked_countries: ["US"], allowed_countries: null },
  { series_id: ALLOWED_ID.toUpperCase(), blocked_countries: null, allowed_countries: ["JP"] },
];

const realNow = Date.now;
let now = 1_000_000;

async function main() {
  Date.now = () => now;
  try {
    const server = await import("../src/lib/rights/regionRestriction.server");

    // countryFromHeaders normalizes the Vercel country header.
    assert.equal(server.countryFromHeaders(new Headers({ "x-vercel-ip-country": " jp " })), "JP");
    assert.equal(server.countryFromHeaders(new Headers()), null);
    assert.equal(server.countryFromHeaders(new Headers({ "x-vercel-ip-country": "XYZ" })), null);

    // No series id: never blocked, no read.
    assert.equal(await server.isSeriesRegionBlockedForCountry(null, "US"), false);
    assert.equal(state.reads, 0);

    // A read failure is thrown (fail closed) and not cached.
    state.next.push({ data: null, error: { message: "boom" } });
    await assert.rejects(server.loadRegionRestrictionMap(), /region restrictions: boom/);
    state.next.push(new Error("timeout"));
    await assert.rejects(server.isSeriesRegionBlockedForCountry(BLOCKED_ID, "JP"), /timeout/);
    assert.equal(state.reads, 2);

    // Concurrent callers share one read; the copy is reused for 60 s.
    state.next.push({ data: rows, error: null });
    const [a, b] = await Promise.all([server.loadRegionRestrictionMap(), server.loadRegionRestrictionMap()]);
    assert.equal(a, b);
    assert.equal(state.reads, 3);
    assert.deepEqual(state.selects.at(-1), "series_id,blocked_countries,allowed_countries");

    assert.equal(await server.isSeriesRegionBlockedForCountry(BLOCKED_ID, "US"), true);
    assert.equal(await server.isSeriesRegionBlockedForCountry(BLOCKED_ID, "JP"), false);
    assert.equal(await server.isSeriesRegionBlockedForCountry(BLOCKED_ID.toUpperCase(), "US"), true);
    assert.equal(await server.isSeriesRegionBlockedForCountry(BLOCKED_ID, null), true, "unknown country fails closed");
    assert.equal(await server.isSeriesRegionBlockedForCountry(ALLOWED_ID, "JP"), false);
    assert.equal(await server.isSeriesRegionBlockedForCountry(ALLOWED_ID, "KR"), true);
    assert.equal(await server.isSeriesRegionBlockedForCountry(FREE_ID, null), false);
    assert.equal(state.reads, 3);

    now += 59_999;
    await server.loadRegionRestrictionMap();
    assert.equal(state.reads, 3);
    now += 1;
    state.next.push({ data: [], error: null });
    await server.loadRegionRestrictionMap();
    assert.equal(state.reads, 4, "expired copy is never served");
    assert.equal(await server.isSeriesRegionBlockedForCountry(BLOCKED_ID, "US"), false);

    // Malformed rows throw instead of becoming "no restrictions".
    now += 60_000;
    state.next.push({ data: [{ series_id: "not-a-uuid", blocked_countries: ["US"], allowed_countries: null }], error: null });
    await assert.rejects(server.loadRegionRestrictionMap(), /invalid series_id/);

    // API guard: 451 JSON with no-store, or null.
    state.next.push({ data: rows, error: null });
    const blockedResponse = await server.regionBlockedApiResponse(
      new Request("https://app.invalid/api/x", { headers: { "x-vercel-ip-country": "us" } }),
      BLOCKED_ID
    );
    assert.equal(blockedResponse?.status, 451);
    assert.equal(blockedResponse?.headers.get("Cache-Control"), "private, no-store");
    const body = (await blockedResponse!.json()) as { error: string; message: string };
    assert.equal(body.error, "region_restricted");
    assert.ok(body.message.includes("copyright"));
    assert.equal(
      await server.regionBlockedApiResponse(new Request("https://app.invalid/api/x", { headers: { "x-vercel-ip-country": "JP" } }), BLOCKED_ID),
      null
    );

    // Page guard: notFound() for blocked or unknown country.
    state.headerCountry = "US";
    await assert.rejects(server.assertSeriesAvailableInRequestRegion(BLOCKED_ID), NotFoundSignal);
    state.headerCountry = null;
    await assert.rejects(server.assertSeriesAvailableInRequestRegion(BLOCKED_ID), NotFoundSignal);
    state.headerCountry = "JP";
    await server.assertSeriesAvailableInRequestRegion(BLOCKED_ID);
    await server.assertSeriesAvailableInRequestRegion(undefined);
  } finally {
    Date.now = realNow;
    moduleWithLoad._load = originalLoad;
  }

  console.log("PASS: region restriction server guard (fail-closed reads, 60 s hard expiry, shared read, API 451, page notFound)");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
