// Issue #154 GI-P2: ingest-side filtering for /api/popularity/events.
// Runs the real handler against an in-memory store (no Supabase, no network).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  handlePopularityEvent,
  type PopularityEventTable,
  type PopularityIngestDeps,
  type PopularityInsertRow,
} from "../src/lib/popularityIngest";
import {
  classifyPopularityDailyCap,
  classifyPopularityRequestSource,
  classifyPopularityUserAgent,
  POPULARITY_DAILY_ROW_CAP,
  type PopularityIngestSkipReason,
} from "../src/lib/popularityIngestGuard";

const HOST = "www.syosetu-libread.com";
const ORIGIN = `https://${HOST}`;
const SERIES = "11111111-1111-4111-8111-111111111111";
const RECORDING = "22222222-2222-4222-8222-222222222222";
const EPISODE_COUNT = 400;

function episodeId(n: number): string {
  return `33333333-3333-4333-8333-${String(n).padStart(12, "0")}`;
}

const UA = {
  chromeWin:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
  safariIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1",
  chromeAndroid:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36",
  cubotPhone:
    "Mozilla/5.0 (Linux; Android 12; CUBOT X50) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36",
  lineInApp:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/15.10.0",
  naverInApp:
    "Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36 NAVER(inapp; search; 2000; 12.10.1)",
  firefox:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:144.0) Gecko/20100101 Firefox/144.0",
  googlebot:
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  googlebotSmartphone:
    "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.7390.122 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  metaExternal: "meta-externalagent/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler)",
  gptbot:
    "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)",
  claudebot: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)",
  bytespider:
    "Mozilla/5.0 (Linux; Android 5.0) AppleWebKit/537.36 (KHTML, like Gecko) Mobile Safari/537.36 (compatible; Bytespider; spider-feedback@bytedance.com)",
  bingbot:
    "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm) Chrome/116.0.1938.76 Safari/537.36",
  headless:
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/142.0.0.0 Safari/537.36",
  curl: "curl/8.7.1",
  pythonRequests: "python-requests/2.32.3",
  node: "node",
  undici: "undici",
  goClient: "Go-http-client/2.0",
};

// ---------------------------------------------------------------------------
// Pure classifiers
// ---------------------------------------------------------------------------

for (const ua of [
  UA.chromeWin,
  UA.safariIos,
  UA.chromeAndroid,
  UA.cubotPhone,
  UA.lineInApp,
  UA.naverInApp,
  UA.firefox,
]) {
  assert.deepEqual(classifyPopularityUserAgent(ua), { accept: true }, `reader UA must pass: ${ua}`);
}

for (const ua of [
  UA.googlebot,
  UA.googlebotSmartphone,
  UA.metaExternal,
  UA.gptbot,
  UA.claudebot,
  UA.bytespider,
  UA.bingbot,
  // Each layer on its own: the explicit token without a contact URL, and an
  // unknown crawler caught only by the generic "+https://" contact-URL shape.
  "meta-externalagent/1.1",
  "UnknownFetcher/0.3 (+https://fetcher.example/about)",
]) {
  assert.deepEqual(
    classifyPopularityUserAgent(ua),
    { accept: false, reason: "bot_user_agent" },
    `crawler UA must be rejected: ${ua}`
  );
}

for (const ua of [UA.headless, UA.curl, UA.pythonRequests, UA.node, UA.undici, UA.goClient]) {
  const decision = classifyPopularityUserAgent(ua);
  assert.equal(decision.accept, false, `automation UA must be rejected: ${ua}`);
}
assert.deepEqual(classifyPopularityUserAgent(UA.headless), {
  accept: false,
  reason: "automation_user_agent",
});
assert.deepEqual(classifyPopularityUserAgent(""), { accept: false, reason: "missing_user_agent" });
assert.deepEqual(classifyPopularityUserAgent(null), { accept: false, reason: "missing_user_agent" });

function h(init: Record<string, string>): Headers {
  return new Headers(init);
}

assert.deepEqual(
  classifyPopularityRequestSource(h({ host: HOST, origin: ORIGIN, "sec-fetch-site": "same-origin" })),
  { accept: true }
);
// Vercel preview / local dev: same-host check needs no hard-coded domain.
assert.deepEqual(
  classifyPopularityRequestSource(
    h({ host: "duonovel-git-x.vercel.app", origin: "https://duonovel-git-x.vercel.app" })
  ),
  { accept: true }
);
assert.deepEqual(
  classifyPopularityRequestSource(h({ host: "localhost:3000", origin: "http://localhost:3000" })),
  { accept: true }
);
assert.deepEqual(
  classifyPopularityRequestSource(h({ host: HOST, origin: "https://evil.example" })),
  { accept: false, reason: "foreign_origin" }
);
assert.deepEqual(
  classifyPopularityRequestSource(h({ host: HOST, origin: "null" })),
  { accept: false, reason: "foreign_origin" }
);
// Apex vs www are different origins; the page and API share one host.
assert.deepEqual(
  classifyPopularityRequestSource(h({ host: HOST, origin: "https://syosetu-libread.com" })),
  { accept: false, reason: "foreign_origin" }
);
assert.deepEqual(
  classifyPopularityRequestSource(h({ host: HOST, origin: ORIGIN, "sec-fetch-site": "cross-site" })),
  { accept: false, reason: "cross_site_fetch" }
);
assert.deepEqual(
  classifyPopularityRequestSource(h({ host: HOST, origin: ORIGIN, "sec-fetch-site": "same-site" })),
  { accept: false, reason: "cross_site_fetch" }
);
assert.deepEqual(
  classifyPopularityRequestSource(h({ host: HOST, "sec-fetch-site": "none" })),
  { accept: false, reason: "cross_site_fetch" }
);
assert.deepEqual(
  classifyPopularityRequestSource(h({ host: HOST, referer: `${ORIGIN}/works/x/episodes/1` })),
  { accept: true }
);
assert.deepEqual(
  classifyPopularityRequestSource(h({ host: HOST, referer: "https://evil.example/page" })),
  { accept: false, reason: "foreign_referer" }
);
assert.deepEqual(
  classifyPopularityRequestSource(h({ host: HOST })),
  { accept: false, reason: "missing_origin_and_referer" }
);

assert.deepEqual(classifyPopularityDailyCap(0), { accept: true });
assert.deepEqual(classifyPopularityDailyCap(POPULARITY_DAILY_ROW_CAP - 1), { accept: true });
assert.deepEqual(classifyPopularityDailyCap(POPULARITY_DAILY_ROW_CAP), {
  accept: false,
  reason: "daily_cap_reached",
});
assert.deepEqual(classifyPopularityDailyCap(Number.NaN), {
  accept: false,
  reason: "daily_cap_reached",
});
assert.ok(
  POPULARITY_DAILY_ROW_CAP >= 60,
  "the cap must leave room for a reader who binges several dozen episodes a day"
);

// ---------------------------------------------------------------------------
// Handler against an in-memory store
// ---------------------------------------------------------------------------

type Store = Record<PopularityEventTable, PopularityInsertRow[]>;

function makeHarness(options: { cap?: number; countFails?: boolean } = {}) {
  const store: Store = { series_view_events: [], recording_play_events: [] };
  const skips: PopularityIngestSkipReason[] = [];
  let dbCalls = 0;
  const deps: PopularityIngestDeps = {
    getCurrentUserId: async () => null,
    findEpisode: async (id) => {
      dbCalls += 1;
      const match = /-(\d{12})$/.exec(id);
      const n = match ? Number(match[1]) : 0;
      if (!id.startsWith("33333333-") || n < 1 || n > EPISODE_COUNT) {
        return { data: null, error: null };
      }
      return {
        data: {
          id,
          series_id: SERIES,
          episode_number: n,
          posting_status: "posted",
          is_published: true,
        },
        error: null,
      };
    },
    findSeries: async (id) => {
      dbCalls += 1;
      return { data: id === SERIES ? { id, publication_status: "public" } : null, error: null };
    },
    findRecording: async (id) => {
      dbCalls += 1;
      return {
        data:
          id === RECORDING
            ? { id, series_id: SERIES, episode_id: episodeId(1), is_public: true }
            : null,
        error: null,
      };
    },
    countActorRows: async (table, sessionId) => {
      dbCalls += 1;
      if (options.countFails) return null;
      return store[table].filter((row) => row.session_id === sessionId).length;
    },
    insertEvent: async (table, row) => {
      dbCalls += 1;
      const key = table === "series_view_events" ? "episode_id" : "recording_id";
      const dup = store[table].some(
        (existing) => existing.session_id === row.session_id && existing[key] === row[key]
      );
      if (!dup) store[table].push(row);
      return { error: null };
    },
    now: () => new Date("2026-11-14T03:00:00Z"),
    dailyRowCap: options.cap,
    onSkip: (reason) => skips.push(reason),
  };
  return { store, skips, deps, dbCalls: () => dbCalls };
}

const READER_HEADERS = {
  host: HOST,
  origin: ORIGIN,
  referer: `${ORIGIN}/works/${SERIES}/episodes/1`,
  "sec-fetch-site": "same-origin",
  "sec-fetch-mode": "cors",
  "content-type": "application/json",
  "user-agent": UA.safariIos,
  "x-forwarded-for": "203.0.113.10",
};

function post(
  body: Record<string, unknown>,
  headers: Record<string, string> = READER_HEADERS
): Request {
  return new Request(`${ORIGIN}/api/popularity/events`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function view(n: number) {
  return { kind: "series_view", seriesId: SERIES, episodeId: episodeId(n), episodeNumber: n };
}

async function main() {
  // A normal reader's view is recorded.
  {
    const t = makeHarness();
    const res = await handlePopularityEvent(post(view(1)), t.deps);
    assert.equal(res.status, 200);
    assert.equal(t.store.series_view_events.length, 1);
    assert.deepEqual(t.skips, []);
  }

  // Googlebot POSTing (it should not, robots disallows /api/) creates no row,
  // even with a same-site Origin, and never reaches the database.
  for (const ua of [UA.googlebot, UA.googlebotSmartphone, UA.metaExternal, UA.gptbot, UA.headless]) {
    const t = makeHarness();
    const res = await handlePopularityEvent(post(view(1), { ...READER_HEADERS, "user-agent": ua }), t.deps);
    assert.equal(res.status, 202, `filtered UA must get 202: ${ua}`);
    assert.deepEqual(await res.json(), { ok: true, recorded: false });
    assert.equal(t.store.series_view_events.length, 0, `no row for ${ua}`);
    assert.equal(t.dbCalls(), 0, "header-filtered requests must not touch the database");
  }

  // Cross-site Origin.
  {
    const t = makeHarness();
    const res = await handlePopularityEvent(
      post(view(1), { ...READER_HEADERS, origin: "https://evil.example", "sec-fetch-site": "cross-site" }),
      t.deps
    );
    assert.equal(res.status, 202);
    assert.equal(t.store.series_view_events.length, 0);
    assert.deepEqual(t.skips, ["cross_site_fetch"]);
  }

  // A direct POST (script / curl with a browser UA but no Origin/Referer/Sec-Fetch).
  {
    const t = makeHarness();
    const res = await handlePopularityEvent(
      post(view(1), {
        host: HOST,
        "content-type": "application/json",
        "user-agent": UA.chromeWin,
        "x-forwarded-for": "198.51.100.7",
      }),
      t.deps
    );
    assert.equal(res.status, 202);
    assert.equal(t.store.series_view_events.length, 0);
    assert.deepEqual(t.skips, ["missing_origin_and_referer"]);
  }

  // A direct POST with the default curl UA.
  {
    const t = makeHarness();
    const res = await handlePopularityEvent(
      post(view(1), { host: HOST, "content-type": "application/json", "user-agent": UA.curl }),
      t.deps
    );
    assert.equal(res.status, 202);
    assert.equal(t.store.series_view_events.length, 0);
    assert.deepEqual(t.skips, ["automation_user_agent"]);
  }

  // Ordinary binge reading: 80 episodes in one JST day from one actor all count.
  {
    const t = makeHarness();
    for (let n = 1; n <= 80; n += 1) {
      const res = await handlePopularityEvent(post(view(n)), t.deps);
      assert.equal(res.status, 200, `episode ${n} of a binge read must be recorded`);
    }
    assert.equal(t.store.series_view_events.length, 80);
    assert.deepEqual(t.skips, []);
  }

  // Cap boundary: exactly `cap` rows, then the next new episode is not recorded.
  {
    const t = makeHarness();
    for (let n = 1; n <= POPULARITY_DAILY_ROW_CAP; n += 1) {
      const res = await handlePopularityEvent(post(view(n)), t.deps);
      assert.equal(res.status, 200, `row ${n} (<= cap) must be recorded`);
    }
    assert.equal(t.store.series_view_events.length, POPULARITY_DAILY_ROW_CAP);
    const over = await handlePopularityEvent(post(view(POPULARITY_DAILY_ROW_CAP + 1)), t.deps);
    assert.equal(over.status, 202);
    assert.equal(t.store.series_view_events.length, POPULARITY_DAILY_ROW_CAP);
    assert.deepEqual(t.skips, ["daily_cap_reached"]);

    // A different actor (another IP) is unaffected by the first actor's cap.
    const other = await handlePopularityEvent(
      post(view(1), { ...READER_HEADERS, "x-forwarded-for": "203.0.113.99" }),
      t.deps
    );
    assert.equal(other.status, 200);
    assert.equal(t.store.series_view_events.length, POPULARITY_DAILY_ROW_CAP + 1);
  }

  // The cap is per table: a capped view actor can still log a narration play.
  {
    const t = makeHarness({ cap: 3 });
    for (let n = 1; n <= 3; n += 1) await handlePopularityEvent(post(view(n)), t.deps);
    const play = await handlePopularityEvent(
      post({ kind: "recording_play", seriesId: SERIES, episodeId: episodeId(1), recordingId: RECORDING }),
      t.deps
    );
    assert.equal(play.status, 200);
    assert.equal(t.store.recording_play_events.length, 1);
  }

  // Unknown count (database error) fails closed for ranking input.
  {
    const t = makeHarness({ countFails: true });
    const res = await handlePopularityEvent(post(view(1)), t.deps);
    assert.equal(res.status, 202);
    assert.equal(t.store.series_view_events.length, 0);
  }

  // Existing validation is preserved.
  {
    const t = makeHarness();
    const bad = await handlePopularityEvent(post({ kind: "series_view", seriesId: "x", episodeId: "y" }), t.deps);
    assert.equal(bad.status, 400);
    const missing = await handlePopularityEvent(post(view(EPISODE_COUNT + 1)), t.deps);
    assert.equal(missing.status, 404);
    assert.equal(t.store.series_view_events.length, 0);
  }

  // Wiring: the route delegates to the guarded handler; the log line carries
  // only the reason label (no UA text or IP).
  const route = readFileSync("src/app/api/popularity/events/route.ts", "utf8");
  assert.ok(route.includes("handlePopularityEvent(request,"));
  assert.ok(!route.includes('.from("series_view_events")'), "route must not write events outside the handler");
  const guard = readFileSync("src/lib/popularityIngestGuard.ts", "utf8");
  assert.ok(guard.includes('console.info("[popularity-ingest-skip]", reason);'));
  assert.ok(!/console\.[a-z]+\([^)]*user-agent/i.test(guard));

  // Good-crawler handling is untouched: robots still disallows /api/.
  const robots = readFileSync("src/app/robots.ts", "utf8");
  assert.ok(robots.includes('"/api/"'), "robots must keep disallowing /api/");

  console.log("popularity ingest guard tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
