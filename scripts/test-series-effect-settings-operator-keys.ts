/**
 * Issue #221 / KD-3 regression: saving the series effect editor must keep the
 * operator records (publicDomain, legacyAttribution) and other non-effect keys
 * stored in series.effect_settings, and must refuse operator keys sent by the
 * browser.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  emptyEffectSettings,
  serializeEffectSettingsForSave,
} from "../src/lib/effects/effectSettings";
import {
  EFFECT_EDITOR_KEYS,
  isOwnedSeriesEffectSettingsPayload,
  mergeOwnedSeriesEffectSettings,
} from "../src/lib/write/ownedSeriesEffectSettings";

const publicDomain = {
  manifestId: "reviewed-test-manifest",
  originalAuthor: "Example Author",
  sourceProvider: "Example",
  sourceHash: "a".repeat(64),
  rightsChecked: true,
};
const legacyAttribution = { originalAuthor: "Example Author", note: "test" };
const stored = {
  ...emptyEffectSettings(),
  backgroundPreset: "old-preset",
  notes: "old notes",
  storyFormat: "short",
  publicDomain,
  legacyAttribution,
};

// The editor output is accepted as a payload (keys stay within the editor set).
const editorOutput = serializeEffectSettingsForSave({
  ...emptyEffectSettings(),
  notes: "new notes",
});
assert.ok(editorOutput, "non-empty editor output");
assert.equal(isOwnedSeriesEffectSettingsPayload(editorOutput), true);
assert.equal(isOwnedSeriesEffectSettingsPayload(null), true, "null clears effects");
for (const key of Object.keys(editorOutput as object)) {
  assert.ok(EFFECT_EDITOR_KEYS.includes(key), `editor key ${key} is allowed`);
}

// 1. After a save, operator keys and other non-effect keys remain unchanged.
const saved = mergeOwnedSeriesEffectSettings(
  editorOutput as unknown as Record<string, unknown>,
  stored
);
assert.ok(saved);
assert.deepEqual(saved.publicDomain, publicDomain);
assert.deepEqual(saved.legacyAttribution, legacyAttribution);
assert.equal(saved.storyFormat, "short");
assert.equal(saved.notes, "new notes", "effect keys come from the editor");
assert.equal(saved.backgroundPreset, null, "cleared effect keys are cleared");

// Clearing every effect still keeps operator records.
const cleared = mergeOwnedSeriesEffectSettings(null, stored);
assert.deepEqual(cleared, { storyFormat: "short", publicDomain, legacyAttribution });
// Stored as a JSON string (legacy rows) is handled the same way.
assert.deepEqual(
  mergeOwnedSeriesEffectSettings(null, JSON.stringify(stored)),
  { storyFormat: "short", publicDomain, legacyAttribution }
);
// No stored value and nothing to save -> null.
assert.equal(mergeOwnedSeriesEffectSettings(null, null), null);

// 2. Operator keys sent by the browser are rejected (add / change / delete).
const forgedAdd = { ...(editorOutput as object), publicDomain: { rightsChecked: true } };
assert.equal(isOwnedSeriesEffectSettingsPayload(forgedAdd), false);
const forgedLegacy = { ...(editorOutput as object), legacyAttribution: null };
assert.equal(isOwnedSeriesEffectSettingsPayload(forgedLegacy), false);
assert.equal(
  isOwnedSeriesEffectSettingsPayload({ ...(editorOutput as object), storyFormat: "long" }),
  false,
  "non-effect keys are not written through the effect editor"
);
assert.equal(isOwnedSeriesEffectSettingsPayload(["x"]), false);
assert.equal(isOwnedSeriesEffectSettingsPayload("x"), false);
assert.equal(
  isOwnedSeriesEffectSettingsPayload({ notes: "a".repeat(500_001) }),
  false,
  "size bound"
);
// Even if an unvalidated value reached the merge, stored operator keys win
// and client operator keys are dropped.
const defended = mergeOwnedSeriesEffectSettings(
  { notes: "x", publicDomain: { forged: true }, legacyAttribution: { forged: true } },
  stored
);
assert.deepEqual(defended?.publicDomain, publicDomain);
assert.deepEqual(defended?.legacyAttribution, legacyAttribution);
const defendedNoStored = mergeOwnedSeriesEffectSettings(
  { notes: "x", publicDomain: { forged: true } },
  { notes: "y" }
);
assert.deepEqual(defendedNoStored, { notes: "x" });

// 3. Wiring: the series effect editor saves through the server action, not a
// browser-side whole-column overwrite of series.effect_settings.
const form = readFileSync("src/features/effects/EffectSettingsForm.tsx", "utf8");
const action = readFileSync("src/app/actions/saveOwnedSeriesEffectSettings.ts", "utf8");
const handleSave = form.slice(
  form.indexOf("  async function handleSave() {"),
  form.indexOf("  const effectPanelItems")
);
assert.ok(handleSave.includes('if (tableName === "series") {'));
assert.ok(handleSave.includes("await saveOwnedSeriesEffectSettings(recordId, serialized)"));
assert.ok(action.startsWith('"use server";'));
assert.ok(action.includes("isOwnedSeriesEffectSettingsPayload(effectSettings)"));
assert.ok(action.includes('.select("id, effect_settings")'));
assert.ok(action.includes("mergeOwnedSeriesEffectSettings("));
assert.ok(
  action.indexOf('.select("id, effect_settings")') < action.indexOf(".update({ effect_settings: nextSettings })"),
  "reads stored value before the update"
);
assert.equal(action.split('.eq("author_id", auth.user.id)').length - 1, 2, "owner filter on read and write");
assert.equal(action.includes("service_role"), false);
assert.equal(action.includes("createAdminClient"), false);

console.log("PASS: KD-3 series effect editor keeps operator keys and rejects browser-sent operator keys");
