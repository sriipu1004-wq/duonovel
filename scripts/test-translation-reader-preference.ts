import assert from "node:assert/strict";
import {
  TRANSLATION_READER_VISIBILITY_EVENT,
  readTranslationReaderVisible,
  writeTranslationReaderVisible,
} from "../src/lib/playback/translationReaderPreference";

// Characterization test: pins current behavior only (LT-002). Uses a fake window.

const KEY = "duonovel:translation-reader-visible";
const globals = globalThis as unknown as { window?: unknown };

function installWindow(options: { throwOnGet?: boolean; throwOnSet?: boolean } = {}) {
  const store = new Map<string, string>();
  const events: Array<{ type: string; detail: unknown }> = [];
  globals.window = {
    localStorage: {
      getItem(key: string) {
        if (options.throwOnGet) throw new Error("blocked");
        return store.has(key) ? store.get(key) : null;
      },
      setItem(key: string, value: string) {
        if (options.throwOnSet) throw new Error("blocked");
        store.set(key, value);
      },
    },
    dispatchEvent(event: CustomEvent) {
      events.push({ type: event.type, detail: event.detail });
      return true;
    },
  };
  return { store, events };
}

try {
  // No window (server): visible by default, write is a no-op.
  delete globals.window;
  assert.equal(readTranslationReaderVisible(), true);
  writeTranslationReaderVisible(false);

  assert.equal(TRANSLATION_READER_VISIBILITY_EVENT, "libread:translation-reader-visibility");

  const { store, events } = installWindow();
  assert.equal(readTranslationReaderVisible(), true);
  writeTranslationReaderVisible(false);
  assert.equal(store.get(KEY), "false");
  assert.equal(readTranslationReaderVisible(), false);
  writeTranslationReaderVisible(true);
  assert.equal(store.get(KEY), "true");
  assert.equal(readTranslationReaderVisible(), true);
  assert.deepEqual(events, [
    { type: TRANSLATION_READER_VISIBILITY_EVENT, detail: { visible: false } },
    { type: TRANSLATION_READER_VISIBILITY_EVENT, detail: { visible: true } },
  ]);
  // Only the exact string "false" hides the reader.
  store.set(KEY, "0");
  assert.equal(readTranslationReaderVisible(), true);

  // Storage failures: read falls back to visible; write still dispatches the event.
  const blocked = installWindow({ throwOnGet: true, throwOnSet: true });
  assert.equal(readTranslationReaderVisible(), true);
  writeTranslationReaderVisible(false);
  assert.deepEqual(blocked.events, [{ type: TRANSLATION_READER_VISIBILITY_EVENT, detail: { visible: false } }]);
} finally {
  delete globals.window;
}

console.log("PASS: translation reader visibility preference (server default, storage, event, failures)");
