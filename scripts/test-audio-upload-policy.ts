import assert from "node:assert/strict";
import {
  AUDIO_UPLOAD_ALLOWED_EXTENSIONS,
  AUDIO_UPLOAD_MAX_FILE_BYTES,
  AUDIO_UPLOAD_MIN_DURATION_SECONDS,
  buildPassedAudioUploadResult,
  buildRejectedAudioUploadResult,
  buildReviewRequiredAudioUploadResult,
  canProceedWithAudioUpload,
  getAudioFileExtension,
  getAudioUploadIssueMessage,
  getAudioUploadRetryHints,
  isSupportedAudioFile,
  type AudioUploadIssueCode,
} from "../src/lib/recording/audioUploadPolicy";

// Characterization test: pins current behavior only (LT-002).

assert.deepEqual([...AUDIO_UPLOAD_ALLOWED_EXTENSIONS], [
  "mp3",
  "m4a",
  "wav",
  "webm",
  "ogg",
  "aac",
  "flac",
]);
assert.equal(AUDIO_UPLOAD_MIN_DURATION_SECONDS, 8);
assert.equal(AUDIO_UPLOAD_MAX_FILE_BYTES, 1073741824);

assert.equal(getAudioFileExtension(" Voice.MP3 "), "mp3");
assert.equal(getAudioFileExtension("a.b.wav"), "wav");
assert.equal(getAudioFileExtension("noext"), "");
assert.equal(getAudioFileExtension("trailing."), "");
assert.equal(getAudioFileExtension(".flac"), "flac");

// MIME type audio/* wins even with an unknown extension.
assert.equal(isSupportedAudioFile({ name: "x.bin", size: 1, type: "audio/x-custom" }), true);
// Extension fallback when MIME is empty or non-audio.
assert.equal(isSupportedAudioFile({ name: "x.M4A", size: 1, type: "" }), true);
assert.equal(isSupportedAudioFile({ name: "x.mp4", size: 1, type: "video/mp4" }), false);
assert.equal(isSupportedAudioFile({ name: "x.txt", size: 1, type: "text/plain" }), false);

const file = { name: "a.mp3", size: 123, type: "audio/mpeg" };

const issueCodes: AudioUploadIssueCode[] = [
  "unsupported_type",
  "empty_file",
  "file_too_large",
  "too_short",
  "decode_failed",
  "silent",
  "mostly_non_voice",
  "bgm_dominant",
  "environment_dominant",
];
const messages = new Set<string>();
for (const code of issueCodes) {
  const message = getAudioUploadIssueMessage(code);
  assert.equal(typeof message, "string", code);
  assert.ok(message.length > 0, code);
  messages.add(message);
  const hints = getAudioUploadRetryHints(code);
  assert.ok(Array.isArray(hints) && hints.length >= 1, code);

  const rejected = buildRejectedAudioUploadResult(file, code);
  assert.deepEqual(rejected, {
    decision: "rejected",
    issueCode: code,
    message,
    retryHints: hints,
    metrics: null,
    fileName: "a.mp3",
    fileSize: 123,
    mimeType: "audio/mpeg",
  });
  assert.equal(canProceedWithAudioUpload(rejected), false, code);
}
assert.equal(messages.size, issueCodes.length, "each issue code has its own message");
assert.equal(getAudioUploadRetryHints("empty_file").length, 1);

const metrics = {
  durationSeconds: 10,
  averageRms: 0.1,
  activeRatio: 0.5,
  pauseRatio: 0.2,
  speechWindowRatio: 0.6,
  noisyWindowRatio: 0.1,
  continuousSoundRatio: 0.3,
};

const review = buildReviewRequiredAudioUploadResult(file, "m", ["h"], metrics);
assert.equal(review.decision, "review_required");
assert.equal(review.issueCode, null);
assert.equal(review.metrics, metrics);
assert.equal(canProceedWithAudioUpload(review), false);

const passed = buildPassedAudioUploadResult(file, "ok", []);
assert.equal(passed.decision, "passed");
assert.equal(passed.issueCode, null);
assert.equal(passed.metrics, null);
assert.equal(canProceedWithAudioUpload(passed), true);
assert.equal(canProceedWithAudioUpload(null), false);

console.log("PASS: audio upload policy (extensions, MIME fallback, issue messages/hints, decision builders)");
