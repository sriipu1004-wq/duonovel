import assert from "node:assert/strict";

// Characterization test: pins current behavior only (LT-002).
// The browser AudioContext is replaced in-process by a fake that "decodes" to synthetic
// samples chosen by the test; no audio decoding, files or network.

const SAMPLE_RATE = 8000;
type Signal = { channels: Float32Array[]; duration?: number };
const state = { next: null as Signal | null, decodeFails: false, closed: 0, decodedBytes: [] as number[] };

class FakeAudioContext {
  async decodeAudioData(data: ArrayBuffer) {
    state.decodedBytes.push(data.byteLength);
    if (state.decodeFails || !state.next) throw new Error("decode");
    const { channels, duration } = state.next;
    return {
      length: channels[0].length,
      numberOfChannels: channels.length,
      sampleRate: SAMPLE_RATE,
      duration: duration ?? channels[0].length / SAMPLE_RATE,
      getChannelData: (index: number) => channels[index],
    };
  }
  async close() {
    state.closed += 1;
  }
}

function makeSignal(seconds: number, sample: (t: number, i: number) => number): Float32Array {
  const out = new Float32Array(Math.round(seconds * SAMPLE_RATE));
  for (let i = 0; i < out.length; i += 1) out[i] = sample(i / SAMPLE_RATE, i);
  return out;
}
let seed = 1;
const random = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);

const silence = makeSignal(10, () => 0);
const steadyTone = makeSignal(10, (t) => 0.3 * Math.sin(2 * Math.PI * 440 * t));
const noise = makeSignal(10, () => 0.3 * (random() * 2 - 1));
// Bursts of a 200 Hz tone with a changing loudness, separated by pauses.
const speechLike = makeSignal(10, (t) => {
  const phase = t % 1;
  if (phase >= 0.6) return 0;
  return (0.05 + 0.25 * Math.sin((Math.PI * phase) / 0.6)) * Math.sin(2 * Math.PI * 200 * t);
});
// Same bursts with very short pauses (always loud).
const fewPauses = makeSignal(10, (t) => {
  const phase = t % 1;
  if (phase >= 0.97) return 0;
  return (0.05 + 0.25 * Math.sin((Math.PI * phase) / 0.97)) * Math.sin(2 * Math.PI * 200 * t);
});

async function main() {
  const globalWithWindow = globalThis as unknown as { window?: unknown };
  const savedWindow = globalWithWindow.window;
  globalWithWindow.window = { AudioContext: FakeAudioContext };
  try {
    const mod = await import("../src/lib/recording/audioUploadValidation");
    const file = (name = "voice.wav", type = "audio/wav", bytes = 16) => new File([new Uint8Array(bytes)], name, { type });
    const run = async (signal: Signal | null, f = file()) => {
      state.next = signal;
      return mod.analyzeAudioUploadClient(f);
    };

    // Re-exports from the policy module.
    assert.equal(mod.AUDIO_UPLOAD_MIN_DURATION_SECONDS, 8);
    assert.equal(mod.AUDIO_UPLOAD_MAX_FILE_BYTES, 1024 * 1024 * 1024);

    // File checks before decoding.
    const before = state.decodedBytes.length;
    assert.equal((await run(null, file("notes.txt", "text/plain"))).issueCode, "unsupported_type");
    assert.equal((await run(null, file("voice.wav", "audio/wav", 0))).issueCode, "empty_file");
    const huge = file();
    Object.defineProperty(huge, "size", { value: mod.AUDIO_UPLOAD_MAX_FILE_BYTES + 1 });
    assert.equal((await run(null, huge)).issueCode, "file_too_large");
    assert.equal(state.decodedBytes.length, before);

    // Decode failure (the context is still closed); no AudioContext at all.
    state.closed = 0;
    state.decodeFails = true;
    const failed = await run({ channels: [silence] });
    assert.deepEqual([failed.decision, failed.issueCode, failed.metrics], ["rejected", "decode_failed", null]);
    assert.equal(state.closed, 1);
    state.decodeFails = false;
    globalWithWindow.window = {};
    assert.equal((await run({ channels: [steadyTone] })).issueCode, "decode_failed");
    globalWithWindow.window = { webkitAudioContext: FakeAudioContext };
    assert.notEqual((await run({ channels: [steadyTone] })).issueCode, "decode_failed");
    globalWithWindow.window = { AudioContext: FakeAudioContext };

    // Too short (reported duration) and too short to fill one window.
    const short = await run({ channels: [steadyTone], duration: 7.9 });
    assert.equal(short.issueCode, "too_short");
    assert.equal(short.metrics?.durationSeconds, 7.9);
    const tiny = await run({ channels: [new Float32Array(100)], duration: 9 });
    assert.equal(tiny.issueCode, "silent");
    assert.deepEqual(tiny.metrics, {
      durationSeconds: 9, averageRms: 0, activeRatio: 0, pauseRatio: 1, speechWindowRatio: 0, noisyWindowRatio: 0, continuousSoundRatio: 0,
    });

    // Signal classes.
    const silent = await run({ channels: [silence] });
    assert.deepEqual([silent.decision, silent.issueCode], ["rejected", "silent"]);
    assert.equal(silent.metrics?.pauseRatio, 1);
    const tone = await run({ channels: [steadyTone] });
    assert.deepEqual([tone.decision, tone.issueCode], ["rejected", "bgm_dominant"]);
    assert.ok(tone.metrics!.continuousSoundRatio >= 0.72);
    const noisy = await run({ channels: [noise] });
    assert.deepEqual([noisy.decision, noisy.issueCode], ["rejected", "environment_dominant"]);
    assert.ok(noisy.metrics!.noisyWindowRatio >= 0.22);
    const speech = await run({ channels: [speechLike] });
    assert.deepEqual([speech.decision, speech.issueCode], ["passed", null]);
    assert.ok(speech.metrics!.speechWindowRatio >= 0.32 && speech.metrics!.pauseRatio >= 0.03);
    assert.equal(speech.message, "仮判定では声中心の音源として通せる。保存前の最小チェックを通過。");
    assert.deepEqual([speech.fileName, speech.fileSize, speech.mimeType], ["voice.wav", 16, "audio/wav"]);
    const review = await run({ channels: [fewPauses] });
    assert.deepEqual([review.decision, review.issueCode], ["review_required", null]);
    assert.equal(review.retryHints.length, 2);

    // Stereo is mixed down: speech on one channel and silence on the other is still speech-like.
    const stereo = await run({ channels: [speechLike, silence] });
    assert.equal(stereo.decision, "passed");
    assert.ok(Math.abs(stereo.metrics!.averageRms - speech.metrics!.averageRms / 2) < 1e-6);

    console.log("audioUploadValidation characterization: PASS");
  } finally {
    globalWithWindow.window = savedWindow;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
