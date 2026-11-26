import assert from "node:assert/strict";
import {
  readBilingualSessionPreference,
  writeBilingualSessionPreference,
} from "../src/lib/translation/bilingualSessionPreference";

// Characterization test: pins current behavior only (LT-002). Uses a fake window.

const globals = globalThis as unknown as { window?: unknown };

function installWindow(options: { throwOnGet?: boolean; throwOnSet?: boolean } = {}) {
  const store = new Map<string, string>();
  globals.window = {
    sessionStorage: {
      getItem(key: string) {
        if (options.throwOnGet) throw new Error("blocked");
        return store.has(key) ? store.get(key) : null;
      },
      setItem(key: string, value: string) {
        if (options.throwOnSet) throw new Error("blocked");
        store.set(key, value);
      },
    },
  };
  return store;
}

try {
  delete globals.window;
  assert.equal(readBilingualSessionPreference("series", "s1", "ja"), null);
  writeBilingualSessionPreference("series", "s1", "en");

  const store = installWindow();
  assert.equal(readBilingualSessionPreference("series", "s1", "ja"), null);

  writeBilingualSessionPreference("series", "s1", "en");
  assert.deepEqual([...store.entries()], [
    ["duonovel:bilingual-session:series:s1", JSON.stringify({ targetLanguage: "en", autoGenerate: true })],
  ]);
  assert.deepEqual(readBilingualSessionPreference("series", "s1", "ja"), { targetLanguage: "en", autoGenerate: true });

  // Scope and content id are part of the key.
  assert.equal(readBilingualSessionPreference("private-library", "s1", "ja"), null);
  assert.equal(readBilingualSessionPreference("series", "s2", "ja"), null);

  // Same as the source language -> ignored.
  assert.equal(readBilingualSessionPreference("series", "s1", "en"), null);

  // Stored tag is normalized; unsupported or malformed values are ignored.
  store.set("duonovel:bilingual-session:generated:g1", JSON.stringify({ targetLanguage: " KO " }));
  assert.deepEqual(readBilingualSessionPreference("generated", "g1", "ja"), { targetLanguage: "ko", autoGenerate: true });
  store.set("duonovel:bilingual-session:generated:g2", JSON.stringify({ targetLanguage: "xx" }));
  assert.equal(readBilingualSessionPreference("generated", "g2", "ja"), null);
  store.set("duonovel:bilingual-session:generated:g3", "{bad");
  assert.equal(readBilingualSessionPreference("generated", "g3", "ja"), null);

  // Storage failures are swallowed.
  installWindow({ throwOnGet: true, throwOnSet: true });
  assert.equal(readBilingualSessionPreference("series", "s1", "ja"), null);
  writeBilingualSessionPreference("series", "s1", "en");
} finally {
  delete globals.window;
}

console.log("PASS: bilingual session preference (keying, source-language guard, normalization, failures)");
