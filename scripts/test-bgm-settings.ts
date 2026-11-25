import assert from "node:assert/strict";
import {
  clampBgmSeconds,
  emptyBgmSettings,
  formatBgmSeconds,
  mergeBgmSettings,
  normalizeBgmSettings,
  parseBgmSettingsFromRow,
  serializeBgmSettingsForSave,
} from "../src/lib/bgm/bgmSettings";

// Characterization test: pins current behavior only (LT-002).

for (const value of ["", null, undefined, "abc", -1, Infinity, NaN]) {
  assert.equal(clampBgmSeconds(value), null, String(value));
}
assert.equal(clampBgmSeconds(0), 0);
assert.equal(clampBgmSeconds(1.26), 1.3);
assert.equal(clampBgmSeconds("3"), 3);
assert.equal(clampBgmSeconds(25), 20);
// Current coercion quirks via Number(): whitespace/[] -> 0, true -> 1.
assert.equal(clampBgmSeconds("  "), 0);
assert.equal(clampBgmSeconds([]), 0);
assert.equal(clampBgmSeconds(true), 1);

assert.equal(formatBgmSeconds(null), "0秒");
assert.equal(formatBgmSeconds(2), "2.0秒");
assert.equal(formatBgmSeconds(99), "20.0秒");

const empty = { version: 1, fadeInSeconds: null, fadeOutSeconds: null, sceneCues: [] };
assert.deepEqual(emptyBgmSettings(), empty);
assert.notEqual(emptyBgmSettings(), emptyBgmSettings());
for (const value of [null, undefined, "x", 5, []]) {
  assert.deepEqual(normalizeBgmSettings(value), empty, JSON.stringify(value));
}

assert.deepEqual(
  normalizeBgmSettings({
    fadeInSeconds: "2.04",
    sceneCues: [
      { id: " ", label: 1, transitionMode: "crossfade", nextBgmTitle: " ", fadeOutSeconds: 30 },
      null,
      [],
      { id: "x", nextBgmAudioPath: "bgm/a.mp3", transitionMode: "other" },
    ],
  }),
  {
    version: 1,
    fadeInSeconds: 2,
    fadeOutSeconds: null,
    sceneCues: [
      {
        id: "scene-1",
        label: "",
        triggerText: "",
        nextBgmTitle: null,
        nextBgmAudioPath: null,
        transitionMode: "crossfade",
        fadeOutSeconds: 20,
        fadeInSeconds: null,
      },
      {
        id: "x",
        label: "",
        triggerText: "",
        nextBgmTitle: null,
        nextBgmAudioPath: "bgm/a.mp3",
        transitionMode: "cut",
        fadeOutSeconds: null,
        fadeInSeconds: null,
      },
    ],
  }
);

// First usable value wins; invalid JSON strings are skipped.
assert.equal(parseBgmSettingsFromRow(null, "", "{bad", { fadeOutSeconds: 1 }).fadeOutSeconds, 1);
assert.deepEqual(parseBgmSettingsFromRow("{bad"), empty);
assert.deepEqual(parseBgmSettingsFromRow(), empty);
assert.equal(parseBgmSettingsFromRow('{"fadeInSeconds":4}', { fadeInSeconds: 9 }).fadeInSeconds, 4);
// A non-object non-null value is normalized (to empty) and stops the search.
assert.deepEqual(parseBgmSettingsFromRow(5, { fadeInSeconds: 9 }), empty);

const base = normalizeBgmSettings({ fadeInSeconds: 1, fadeOutSeconds: 2, sceneCues: [{ id: "b" }] });
const override = normalizeBgmSettings({ fadeInSeconds: 3 });
const merged = mergeBgmSettings(base, override);
assert.equal(merged.fadeInSeconds, 3);
assert.equal(merged.fadeOutSeconds, 2);
assert.equal(merged.sceneCues, base.sceneCues);
const withCues = normalizeBgmSettings({ sceneCues: [{ id: "o" }] });
assert.equal(mergeBgmSettings(base, withCues).sceneCues, withCues.sceneCues);
// 0 is kept by ?? (not treated as missing).
assert.equal(mergeBgmSettings(base, normalizeBgmSettings({ fadeInSeconds: 0 })).fadeInSeconds, 0);

assert.equal(serializeBgmSettingsForSave({}), null);
assert.equal(serializeBgmSettingsForSave("junk"), null);
assert.deepEqual(serializeBgmSettingsForSave({ fadeInSeconds: 0 }), { ...empty, fadeInSeconds: 0 });

console.log("PASS: BGM settings (clamp, normalize, parse-from-row, merge, serialize, format)");
