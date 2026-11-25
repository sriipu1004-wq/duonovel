import assert from "node:assert/strict";
import { hideGlobalLoadingFeedback, showGlobalLoadingFeedback } from "../src/lib/client/loadingFeedback";

// Characterization test: pins current behavior only (LT-002). Uses a fake window.

const globals = globalThis as unknown as { window?: unknown };

try {
  delete globals.window;
  showGlobalLoadingFeedback();
  hideGlobalLoadingFeedback();

  const events: Array<{ type: string; detail: unknown }> = [];
  globals.window = {
    dispatchEvent(event: CustomEvent) {
      events.push({ type: event.type, detail: event.detail });
      return true;
    },
  };

  showGlobalLoadingFeedback();
  showGlobalLoadingFeedback("保存中", 1200);
  hideGlobalLoadingFeedback();
  assert.deepEqual(events, [
    { type: "libread:loading-feedback", detail: { label: "処理中...", timeoutMs: 5000 } },
    { type: "libread:loading-feedback", detail: { label: "保存中", timeoutMs: 1200 } },
    { type: "libread:loading-feedback-done", detail: null },
  ]);
} finally {
  delete globals.window;
}

console.log("PASS: global loading feedback events (defaults, custom label/timeout, done, server no-op)");
