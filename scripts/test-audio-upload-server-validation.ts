import assert from "node:assert/strict";
import { analyzeAudioUploadServer } from "../src/lib/recording/audioUploadServerValidation";

// Characterization test: pins current behavior only (LT-002). Synthetic header bytes only.

function bytes(...parts: Array<string | number[]>): Uint8Array<ArrayBuffer> {
  const out: number[] = [];
  for (const part of parts) {
    if (typeof part === "string") for (const ch of part) out.push(ch.charCodeAt(0));
    else out.push(...part);
  }
  while (out.length < 16) out.push(0);
  return new Uint8Array(out);
}

const wav = bytes("RIFF", [0, 0, 0, 0], "WAVE");
const ogg = bytes("OggS");
const flac = bytes("fLaC");
const mp4 = bytes([0, 0, 0, 0], "ftyp", "M4A ");
const webm = bytes([0x1a, 0x45, 0xdf, 0xa3]);
const id3 = bytes("ID3");
const mp3Frame = bytes([0xff, 0xfb]);
const adts = bytes([0xff, 0xf1]);
const junk = bytes("hello world!");

async function check(data: Uint8Array<ArrayBuffer>, name: string, type: string) {
  const result = await analyzeAudioUploadServer(new File([data], name, { type }));
  return { decision: result.decision, issueCode: result.issueCode };
}

const pass = { decision: "passed", issueCode: null };
const reject = (issueCode: string) => ({ decision: "rejected", issueCode });

async function main() {
  // Matching container / extension / MIME.
  assert.deepEqual(await check(wav, "a.wav", "audio/wav"), pass);
  assert.deepEqual(await check(ogg, "a.ogg", "audio/ogg"), pass);
  assert.deepEqual(await check(flac, "a.flac", "audio/flac"), pass);
  assert.deepEqual(await check(mp4, "a.m4a", "audio/mp4"), pass);
  assert.deepEqual(await check(webm, "a.webm", "audio/webm"), pass);
  assert.deepEqual(await check(id3, "a.mp3", "audio/mpeg"), pass);
  assert.deepEqual(await check(mp3Frame, "a.mp3", "audio/mpeg"), pass);
  assert.deepEqual(await check(adts, "a.aac", "audio/aac"), pass);

  // Unknown extension and MIME lists impose no constraint.
  assert.deepEqual(await check(wav, "a.bin", "audio/x-custom"), pass);
  assert.deepEqual(await check(wav, "a.wav", ""), pass);

  // Declared type disagrees with sniffed container.
  assert.deepEqual(await check(wav, "a.mp3", "audio/mpeg"), reject("unsupported_type"));
  assert.deepEqual(await check(adts, "a.mp3", "audio/mpeg"), reject("unsupported_type"));
  assert.deepEqual(await check(ogg, "a.ogg", "audio/wav"), reject("unsupported_type"));

  // Unrecognised bytes.
  assert.deepEqual(await check(junk, "a.wav", "audio/wav"), reject("decode_failed"));

  // Policy gates before sniffing.
  assert.deepEqual(await check(wav, "a.txt", "text/plain"), reject("unsupported_type"));
  assert.deepEqual(await check(new Uint8Array(0), "a.wav", "audio/wav"), reject("empty_file"));

  const passed = await analyzeAudioUploadServer(new File([wav], "a.wav", { type: "audio/wav" }));
  assert.equal(passed.fileName, "a.wav");
  assert.equal(passed.fileSize, wav.length);
  assert.equal(passed.retryHints.length, 2);
  assert.equal(passed.metrics, null);

  console.log("PASS: audio upload server validation (magic bytes vs extension/MIME, policy gates)");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
