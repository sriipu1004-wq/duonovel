import assert from "node:assert/strict";
import { trackRecordingPlayStartOnce, trackSeriesViewOnce } from "../src/lib/popularityEvents";

// Characterization test: pins current behavior only (LT-002). Fake window and fetch; no network.

const globals = globalThis as unknown as { window?: unknown; fetch: unknown };
const originalFetch = globals.fetch;

type Posted = { url: string; init: { method: string; headers: Record<string, string>; body: string; keepalive: boolean } };

function setup(options: { ok?: boolean; throwFetch?: boolean; storageThrows?: boolean } = {}) {
  const store = new Map<string, string>();
  const posted: Posted[] = [];
  let counter = 0;
  const storage = {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => void store.set(key, value),
  };
  globals.window = {
    get sessionStorage() {
      if (options.storageThrows) throw new Error("blocked");
      return storage;
    },
    crypto: { randomUUID: () => `session-${++counter}` },
  };
  globals.fetch = async (url: string, init: Posted["init"]) => {
    posted.push({ url, init });
    if (options.throwFetch) throw new Error("offline");
    return { ok: options.ok ?? true };
  };
  return { store, posted, bodies: () => posted.map((item) => JSON.parse(item.init.body)) };
}

async function main() {
  const originalError = console.error;
  console.error = () => {};
  try {
    // Server (no window): nothing happens.
    delete globals.window;
    let calls = 0;
    globals.fetch = async () => (calls++, { ok: true });
    await trackSeriesViewOnce({ seriesId: "s", episodeId: "e", episodeNumber: 1 });
    assert.equal(calls, 0);

    // Series view: posted once per session and episode.
    const view = setup();
    await trackSeriesViewOnce({ seriesId: "s1", episodeId: " e1 ", episodeNumber: 2.7 });
    await trackSeriesViewOnce({ seriesId: "s1", episodeId: "e1", episodeNumber: 2 });
    assert.equal(view.posted.length, 1);
    assert.equal(view.posted[0]?.url, "/api/popularity/events");
    assert.equal(view.posted[0]?.init.method, "POST");
    assert.equal(view.posted[0]?.init.keepalive, true);
    assert.deepEqual(view.bodies(), [
      { kind: "series_view", seriesId: "s1", episodeId: "e1", episodeNumber: 2, sessionId: "session-1" },
    ]);
    assert.equal(view.store.get("duonovel:popularity-session-id"), "session-1");
    assert.equal(view.store.get("duonovel:popularity:series-view:session-1:e1"), "1");

    // Invalid inputs are ignored.
    await trackSeriesViewOnce({ seriesId: "", episodeId: "e2", episodeNumber: 1 });
    await trackSeriesViewOnce({ seriesId: "s1", episodeId: "  ", episodeNumber: 1 });
    await trackSeriesViewOnce({ seriesId: "s1", episodeId: null, episodeNumber: 1 });
    await trackSeriesViewOnce({ seriesId: "s1", episodeId: "e2", episodeNumber: 0 });
    await trackSeriesViewOnce({ seriesId: "s1", episodeId: "e2", episodeNumber: Number.NaN });
    assert.equal(view.posted.length, 1);

    // Recording play: separate key space; requires recording id.
    await trackRecordingPlayStartOnce({ seriesId: "s1", episodeId: "e1", episodeNumber: 1, recordingId: null });
    await trackRecordingPlayStartOnce({ seriesId: "s1", episodeId: "e1", episodeNumber: 1, recordingId: " r1 " });
    await trackRecordingPlayStartOnce({ seriesId: "s1", episodeId: "e1", episodeNumber: 1, recordingId: "r1" });
    assert.equal(view.posted.length, 2);
    assert.deepEqual(view.bodies()[1], {
      kind: "recording_play",
      seriesId: "s1",
      episodeId: "e1",
      episodeNumber: 1,
      recordingId: "r1",
      sessionId: "session-1",
    });
    assert.equal(view.store.get("duonovel:popularity:recording-play:session-1:r1"), "1");

    // Failed posts are not remembered, so they are retried.
    const failing = setup({ ok: false });
    await trackSeriesViewOnce({ seriesId: "s", episodeId: "e", episodeNumber: 1 });
    await trackSeriesViewOnce({ seriesId: "s", episodeId: "e", episodeNumber: 1 });
    assert.equal(failing.posted.length, 2);
    assert.equal(failing.store.has("duonovel:popularity:series-view:session-1:e"), false);

    const offline = setup({ throwFetch: true });
    await trackRecordingPlayStartOnce({ seriesId: "s", episodeId: "e", episodeNumber: 1, recordingId: "r" });
    assert.equal(offline.store.has("duonovel:popularity:recording-play:session-1:r"), false);

    // Blocked storage: nothing is sent.
    const blocked = setup({ storageThrows: true });
    await trackSeriesViewOnce({ seriesId: "s", episodeId: "e", episodeNumber: 1 });
    assert.equal(blocked.posted.length, 0);
  } finally {
    console.error = originalError;
    globals.fetch = originalFetch;
    delete globals.window;
  }

  console.log("PASS: popularity events (once per session, payloads, invalid inputs, retry on failure, blocked storage)");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
