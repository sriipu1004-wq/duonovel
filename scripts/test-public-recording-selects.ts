import assert from "node:assert/strict";
import {
  PUBLIC_RECORDING_AGGREGATE_SELECT,
  PUBLIC_WORK_RECORDING_SELECT,
} from "../src/lib/recording/publicRecordingSelects";

function selectionFields(select: string): string[] {
  return select
    .split("\n")
    .map((line) => line.trim().replace(/,$/, ""))
    .filter((line) => line.length > 0 && line !== "voice_models (")
    .filter((line) => line !== ")");
}

function main() {
  assert.deepEqual(selectionFields(PUBLIC_RECORDING_AGGREGATE_SELECT), [
    "id",
    "series_id",
    "reader_id",
    "reader_user_id",
    "reader_name",
    "audio_storage_path",
    "voice_model_id",
    "like_count",
    "play_count",
    "is_public",
  ]);

  const workFields = selectionFields(PUBLIC_WORK_RECORDING_SELECT);
  for (const field of [
    "id",
    "series_id",
    "reader_id",
    "reader_user_id",
    "reader_name",
    "tags",
    "like_count",
    "play_count",
    "is_public",
    "allow_download",
    "episode_id",
    "audio_storage_path",
    "voice_model_id",
    "created_at",
    "display_name",
    "name",
  ]) {
    assert.ok(workFields.includes(field), `public Reader select must include ${field}`);
  }

  for (const obsoleteColumn of [
    "likes_count",
    "plays_count",
    "narrator_name",
    "speaker_name",
    "reader_comment",
  ]) {
    assert.equal(
      workFields.includes(obsoleteColumn),
      false,
      `public Reader select must not request absent ${obsoleteColumn}`
    );
  }

  console.log("PASS: public recording selects only request canonical production columns");
}

main();
