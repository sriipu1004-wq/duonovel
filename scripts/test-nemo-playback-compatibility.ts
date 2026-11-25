import assert from "node:assert/strict";
import {
  findPlaybackSegmentForGlobalTime,
  getGlobalPlaybackTimeSeconds,
  resolveNemoPlaybackSources,
} from "../src/lib/recording/nemoPlaybackCompatibility";
import type { NemoGeneratedAudioSegment } from "../src/lib/recording/nemoTiming";

// Characterization test: pins current behavior only (LT-002). fetch is stubbed; no network.

const segments: NemoGeneratedAudioSegment[] = [
  { segmentIndex: 0, startTimeSeconds: 0, durationSeconds: 10, audioPublicUrl: "https://media.invalid/a-0.wav" },
  { segmentIndex: 1, startTimeSeconds: 10, durationSeconds: 5, audioPublicUrl: "https://media.invalid/a-1.wav" },
];

assert.equal(getGlobalPlaybackTimeSeconds({ currentSegmentIndex: 0, localCurrentTimeSeconds: 3, audioSegments: [] }), 3);
assert.equal(getGlobalPlaybackTimeSeconds({ currentSegmentIndex: 1, localCurrentTimeSeconds: 2, audioSegments: segments }), 12);
assert.equal(getGlobalPlaybackTimeSeconds({ currentSegmentIndex: 9, localCurrentTimeSeconds: 1, audioSegments: segments }), 11);
assert.equal(getGlobalPlaybackTimeSeconds({ currentSegmentIndex: -4, localCurrentTimeSeconds: -1, audioSegments: segments }), 0);

assert.deepEqual(findPlaybackSegmentForGlobalTime({ targetTimeSeconds: -2, audioSegments: [] }), { segmentIndex: 0, localTimeSeconds: 0 });
assert.deepEqual(findPlaybackSegmentForGlobalTime({ targetTimeSeconds: 4, audioSegments: segments }), { segmentIndex: 0, localTimeSeconds: 4 });
assert.deepEqual(findPlaybackSegmentForGlobalTime({ targetTimeSeconds: 10, audioSegments: segments }), { segmentIndex: 1, localTimeSeconds: 0 });
assert.deepEqual(findPlaybackSegmentForGlobalTime({ targetTimeSeconds: -1, audioSegments: segments }), { segmentIndex: 0, localTimeSeconds: 0 });
// Past the end: last segment, 0.05 s before its end.
assert.deepEqual(findPlaybackSegmentForGlobalTime({ targetTimeSeconds: 99, audioSegments: segments }), { segmentIndex: 1, localTimeSeconds: 4.95 });

type FetchStub = (url: string) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;
const globals = globalThis as unknown as { fetch: unknown };
const originalFetch = globals.fetch;

async function withFetch(stub: FetchStub, run: (urls: string[]) => Promise<void>) {
  const urls: string[] = [];
  globals.fetch = (url: string) => {
    urls.push(url);
    return stub(url);
  };
  try {
    await run(urls);
  } finally {
    globals.fetch = originalFetch;
  }
}

function single(url: string, sentenceTimings: unknown[] = []) {
  return { primaryAudioUrl: url, audioUrls: [url], audioSegments: [], sentenceTimings, isMultipart: false, totalDurationSeconds: null };
}

async function main() {
  await withFetch(async () => ({ ok: true, json: async () => ({}) }), async (urls) => {
    assert.deepEqual(await resolveNemoPlaybackSources("   "), single(""));
    assert.equal(urls.length, 0);
  });

  // Multipart manifest next to the WAV.
  await withFetch(async () => ({ ok: true, json: async () => ({ audioSegments: segments }) }), async (urls) => {
    const resolved = await resolveNemoPlaybackSources(" https://media.invalid/a.wav ");
    assert.deepEqual(urls, ["https://media.invalid/a.timing.json"]);
    assert.equal(resolved.primaryAudioUrl, "https://media.invalid/a-0.wav");
    assert.deepEqual(resolved.audioUrls, ["https://media.invalid/a-0.wav", "https://media.invalid/a-1.wav"]);
    assert.equal(resolved.isMultipart, true);
    assert.equal(resolved.totalDurationSeconds, 15);
  });

  // Non-WAV URL: ".timing.json" is appended.
  await withFetch(async () => ({ ok: true, json: async () => ({ audioSegments: [segments[0]] }) }), async (urls) => {
    const resolved = await resolveNemoPlaybackSources("https://media.invalid/a.m4a");
    assert.deepEqual(urls, ["https://media.invalid/a.m4a.timing.json"]);
    assert.equal(resolved.isMultipart, false);
    assert.equal(resolved.totalDurationSeconds, 10);
  });

  // Fallbacks: HTTP error, fetch throws, no segments.
  await withFetch(async () => ({ ok: false, json: async () => ({}) }), async () => {
    assert.deepEqual(await resolveNemoPlaybackSources("https://media.invalid/a.wav"), single("https://media.invalid/a.wav"));
  });
  await withFetch(async () => {
    throw new Error("offline");
  }, async () => {
    assert.deepEqual(await resolveNemoPlaybackSources("https://media.invalid/a.wav"), single("https://media.invalid/a.wav"));
  });
  await withFetch(async () => ({ ok: true, json: async () => ({ audioSegments: [] }) }), async () => {
    assert.deepEqual(await resolveNemoPlaybackSources("https://media.invalid/a.wav"), single("https://media.invalid/a.wav"));
  });

  console.log("PASS: Nemo playback compatibility (global/local time mapping, timing manifest resolution, fallbacks)");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
