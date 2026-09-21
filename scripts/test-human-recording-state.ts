import assert from "node:assert/strict";
import {
  isHumanRecordingRow,
  isPublishedHumanRecording,
} from "../src/lib/recording/humanRecordingState";

function human(overrides: Record<string, unknown> = {}) {
  return {
    id: "human-1",
    is_public: true,
    voice_model_id: null,
    audio_storage_path:
      "https://example.supabase.co/storage/v1/object/public/recording-audio/human/series/episode/user/playback-from-webm.m4a",
    reader_id: "user-1",
    reader_name: "Narrator",
    ...overrides,
  };
}

function main() {
  assert.equal(
    isPublishedHumanRecording(
      human({
        voice_model_id: "voice-model-1",
        audio_storage_path:
          "https://example.supabase.co/storage/v1/object/public/recording-audio/aivis/series/episode/audio.wav",
      })
    ),
    false,
    "voice-model recordings are synthesized speech, not Human narration"
  );

  assert.equal(
    isPublishedHumanRecording(
      human({
        voice_model_id: null,
        audio_storage_path:
          "https://example.supabase.co/storage/v1/object/public/recording-audio/nemo/series/episode/audio.wav",
        reader_name: "VOICEVOX Nemo / ノーマル",
      })
    ),
    false,
    "legacy Nemo rows without voice_model_id must not be treated as Human narration"
  );

  assert.equal(
    isPublishedHumanRecording(human()),
    true,
    "published uploads from the canonical human namespace are Human narration"
  );

  assert.equal(
    isHumanRecordingRow(human({ is_public: false })),
    true,
    "a private/draft human upload remains a human recording row"
  );
  assert.equal(
    isPublishedHumanRecording(human({ is_public: false })),
    false,
    "a private/draft human recording must not be public Human narration"
  );

  assert.equal(
    isPublishedHumanRecording(human({ reader_name: "" })),
    false,
    "public Human narration requires a public narrator name"
  );

  assert.equal(
    isPublishedHumanRecording(
      human({
        audio_storage_path:
          "https://example.supabase.co/storage/v1/object/public/recording-audio/aivis/official/episode/audio.wav",
        voice_model_id: "voice-model-official",
        reader_name: "LIB read Official",
      })
    ),
    false,
    "Official synthesized audio must never become Human narration"
  );

  console.log(
    "PASS: Human narration requires human-upload provenance, narrator identity, and public state"
  );
}

main();
