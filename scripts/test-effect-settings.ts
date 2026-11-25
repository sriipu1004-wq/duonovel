import assert from "node:assert/strict";
import {
  EFFECT_BACKGROUND_PRESET_META,
  EFFECT_BACKGROUND_PRESET_VALUES,
  EFFECT_BACKGROUND_PRESETS,
  emptyEffectSettings,
  getBackgroundPresetMeta,
  mergeEffectSettings,
  normalizeEffectSettings,
  parseEffectSettingsFromRow,
  serializeEffectSettingsForSave,
} from "../src/lib/effects/effectSettings";

// Characterization test: pins current behavior only (LT-002).

assert.equal(EFFECT_BACKGROUND_PRESET_VALUES.length, EFFECT_BACKGROUND_PRESETS.length);
assert.equal(new Set(EFFECT_BACKGROUND_PRESET_VALUES).size, EFFECT_BACKGROUND_PRESET_VALUES.length);
for (const preset of EFFECT_BACKGROUND_PRESETS) {
  assert.deepEqual(getBackgroundPresetMeta(preset.value), EFFECT_BACKGROUND_PRESET_META[preset.value]);
  assert.ok(preset.assetPath.startsWith("/textures/effects/"), preset.value);
}
assert.equal(getBackgroundPresetMeta(null), null);
assert.equal(getBackgroundPresetMeta(undefined), null);
assert.equal(EFFECT_BACKGROUND_PRESET_META.paper.label, "標準の紙");

const empty = emptyEffectSettings();
assert.deepEqual(empty, {
  version: 1,
  backgroundPreset: null,
  backgroundColor: null,
  typography: { fontFamily: null, fontSize: null, textColor: null, bold: false, italic: false },
  inlineMarks: [],
  illustrations: [],
  sceneCues: [],
  sentenceTimestamps: [],
  notes: "",
});
for (const value of [null, undefined, "x", 1, []]) {
  assert.deepEqual(normalizeEffectSettings(value), empty, JSON.stringify(value));
}

const normalized = normalizeEffectSettings({
  backgroundPreset: "not-a-preset",
  backgroundColor: "  #fff  ",
  typography: { fontFamily: " serif ", fontSize: "", bold: "true", italic: true },
  inlineMarks: [
    { targetText: " 猫 ", kind: "unknown", value: " ", note: " n " },
    { targetText: "  " },
    { id: "m2", targetText: "犬", kind: "shake", value: "x" },
  ],
  illustrations: [
    { imageUrl: " /a.png ", placement: "nowhere", sentenceIndex: 2.7 },
    { imageUrl: "" },
    { id: "i2", imageUrl: "/b.png", placement: "inline", anchorText: " 犬 ", sentenceIndex: -1 },
  ],
  sceneCues: [{}, { triggerText: "夜", backgroundPreset: "paper", textAnimation: "typing" }, { label: "L", textAnimation: "bad" }],
  sentenceTimestamps: [
    { targetText: "一", timeSeconds: "1.26" },
    { targetText: "二", timeSeconds: -1 },
    { targetText: "", timeSeconds: 3 },
  ],
  notes: "  memo  ",
});

assert.deepEqual(normalized, {
  version: 1,
  backgroundPreset: null,
  backgroundColor: "#fff",
  typography: { fontFamily: "serif", fontSize: null, textColor: null, bold: false, italic: true },
  inlineMarks: [
    { id: "inline-1", targetText: "猫", kind: "ruby", value: null, note: "n" },
    { id: "m2", targetText: "犬", kind: "shake", value: "x", note: "" },
  ],
  illustrations: [
    { id: "illustration-1", imageUrl: "/a.png", caption: "", placement: "top", anchorText: null, sentenceIndex: 2 },
    { id: "i2", imageUrl: "/b.png", caption: "", placement: "inline", anchorText: "犬", sentenceIndex: null },
  ],
  sceneCues: [
    {
      id: "scene-2",
      label: "場面転換2",
      triggerText: "夜",
      nextBgmTrackId: null,
      nextBgmTitle: null,
      nextBgmAudioPath: null,
      backgroundPreset: "paper",
      textAnimation: "typing",
    },
    {
      id: "scene-3",
      label: "L",
      triggerText: "",
      nextBgmTrackId: null,
      nextBgmTitle: null,
      nextBgmAudioPath: null,
      backgroundPreset: null,
      textAnimation: null,
    },
  ],
  sentenceTimestamps: [{ id: "timestamp-1", targetText: "一", timeSeconds: 1.3 }],
  notes: "memo",
});

// Current behavior: imageUrl is only trimmed, its scheme/host is not validated here.
assert.equal(
  normalizeEffectSettings({ illustrations: [{ imageUrl: "https://example.invalid/x.png" }] }).illustrations[0]?.imageUrl,
  "https://example.invalid/x.png"
);

assert.equal(parseEffectSettingsFromRow(null, "{bad", '{"notes":"a"}').notes, "a");
assert.deepEqual(parseEffectSettingsFromRow(), empty);

const merged = mergeEffectSettings(
  { backgroundColor: "#111", typography: { bold: true }, notes: "first", inlineMarks: [{ targetText: "a" }] },
  { backgroundColor: "#222", typography: { fontSize: "18px" }, notes: " ", inlineMarks: [{ targetText: "b" }] },
  { notes: "third" }
);
assert.equal(merged.backgroundColor, "#222");
assert.equal(merged.typography.bold, true);
assert.equal(merged.typography.fontSize, "18px");
assert.deepEqual(merged.inlineMarks.map((mark) => mark.targetText), ["a", "b"]);
assert.equal(merged.notes, "first\nthird");
assert.deepEqual(mergeEffectSettings(), empty);

assert.equal(serializeEffectSettingsForSave({}), null);
assert.equal(serializeEffectSettingsForSave({ notes: "   " }), null);
assert.equal(serializeEffectSettingsForSave({ typography: { italic: true } })?.typography.italic, true);

console.log("PASS: effect settings (presets, normalize, parse-from-row, merge, serialize)");
