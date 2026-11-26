import assert from "node:assert/strict";
import { concatNemoWavs, downsampleNemoWav, getNemoWavDurationSeconds } from "../src/lib/recording/nemoWav";

// Characterization test: pins current behavior only (LT-002). Synthetic PCM only.

function makeWav(args: { sampleRate: number; channels?: number; bits?: 8 | 16; samples: number[]; extraChunk?: boolean }): Uint8Array {
  const channels = args.channels ?? 1;
  const bits = args.bits ?? 16;
  const bytesPerSample = bits / 8;
  const pcm = new Uint8Array(args.samples.length * bytesPerSample);
  const pcmView = new DataView(pcm.buffer);
  args.samples.forEach((value, index) => {
    if (bits === 16) pcmView.setInt16(index * 2, value, true);
    else pcmView.setUint8(index, value);
  });
  const extra = args.extraChunk ? 8 + 3 + 1 : 0; // odd-sized LIST chunk + pad byte
  const out = new Uint8Array(44 + extra + pcm.length);
  const view = new DataView(out.buffer);
  const ascii = (offset: number, text: string) => [...text].forEach((ch, i) => (out[offset + i] = ch.charCodeAt(0)));
  ascii(0, "RIFF");
  view.setUint32(4, out.length - 8, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, args.sampleRate, true);
  view.setUint32(28, args.sampleRate * channels * bytesPerSample, true);
  view.setUint16(32, channels * bytesPerSample, true);
  view.setUint16(34, bits, true);
  let offset = 36;
  if (args.extraChunk) {
    ascii(offset, "LIST");
    view.setUint32(offset + 4, 3, true);
    offset += 8 + 3 + 1;
  }
  ascii(offset, "data");
  view.setUint32(offset + 4, pcm.length, true);
  out.set(pcm, offset + 8);
  return out;
}

function pcmOf(wav: Uint8Array): number[] {
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  const length = view.getUint32(40, true);
  const result: number[] = [];
  for (let i = 0; i < length; i += 2) result.push(view.getInt16(44 + i, true));
  return result;
}

// Duration = data bytes / byteRate.
const oneSecond = makeWav({ sampleRate: 8, samples: [0, 1, 2, 3, 4, 5, 6, 7] });
assert.equal(getNemoWavDurationSeconds(oneSecond), 1);
// Odd-sized extra chunk with pad byte is skipped.
assert.equal(getNemoWavDurationSeconds(makeWav({ sampleRate: 8, samples: [0, 1, 2, 3], extraChunk: true })), 0.5);

// Parse errors.
assert.throws(() => getNemoWavDurationSeconds(new Uint8Array(10)), /nemo_wav_parse_failed:too_small/);
const badHeader = makeWav({ sampleRate: 8, samples: [0] });
badHeader[0] = 0x58;
assert.throws(() => getNemoWavDurationSeconds(badHeader), /nemo_wav_parse_failed:invalid_header/);
const notPcm = makeWav({ sampleRate: 8, samples: [0] });
new DataView(notPcm.buffer).setUint16(20, 3, true);
assert.throws(() => getNemoWavDurationSeconds(notPcm), /nemo_wav_parse_failed:unsupported_format/);

// Concat with pauses: silence frames = round(sampleRate * ms / 1000), at least 1.
const a = makeWav({ sampleRate: 8, samples: [100, 200] });
const b = makeWav({ sampleRate: 8, samples: [300] });
const joined = concatNemoWavs([
  { wavBytes: a, pauseAfterMs: 250 },
  { wavBytes: b, pauseAfterMs: 0 },
]);
assert.deepEqual(pcmOf(joined), [100, 200, 0, 0, 300]);
assert.equal(getNemoWavDurationSeconds(joined), 5 / 8);
assert.deepEqual(
  pcmOf(concatNemoWavs([{ wavBytes: b, pauseAfterMs: 1 }])),
  [300, 0],
  "minimum one silent frame"
);
assert.throws(() => concatNemoWavs([]), /nemo_wav_concat_failed:empty/);
assert.throws(
  () => concatNemoWavs([
    { wavBytes: a, pauseAfterMs: 0 },
    { wavBytes: makeWav({ sampleRate: 16, samples: [1] }), pauseAfterMs: 0 },
  ]),
  /nemo_wav_format_mismatch/
);

// KD-9 regression: 8-bit PCM is unsigned, so pause silence is 128 (not 0).
const eightBit = concatNemoWavs([
  { wavBytes: makeWav({ sampleRate: 8, bits: 8, samples: [128, 128] }), pauseAfterMs: 250 },
  { wavBytes: makeWav({ sampleRate: 8, bits: 8, samples: [200] }), pauseAfterMs: 0 },
]);
assert.equal(new DataView(eightBit.buffer).getUint16(34, true), 8);
assert.deepEqual(Array.from(eightBit.subarray(44)), [128, 128, 128, 128, 200]);

// Downsample: nearest-frame picking; no-op when target >= source or invalid.
const src = makeWav({ sampleRate: 8, samples: [0, 1000, 2000, 3000, 4000, 5000, 6000, 7000] });
const half = downsampleNemoWav(src, 4);
assert.equal(new DataView(half.buffer).getUint32(24, true), 4);
assert.equal(new DataView(half.buffer).getUint32(28, true), 8);
assert.deepEqual(pcmOf(half), [0, 2000, 4000, 6000]);
assert.equal(getNemoWavDurationSeconds(half), 1);
assert.equal(downsampleNemoWav(src, 8), src);
assert.equal(downsampleNemoWav(src, 16), src);
assert.equal(downsampleNemoWav(src, 0), src);
assert.equal(downsampleNemoWav(src, Number.NaN), src);

// Stereo keeps channel interleaving.
const stereo = makeWav({ sampleRate: 4, channels: 2, samples: [1, -1, 2, -2, 3, -3, 4, -4] });
assert.deepEqual(pcmOf(downsampleNemoWav(stereo, 2)), [1, -1, 3, -3]);

console.log("PASS: Nemo WAV parse, duration, concat with pauses (16-bit and 8-bit silence), downsample");
