import assert from "node:assert/strict";
import { publicReadFetch } from "../src/lib/supabase/serverPublic";

/** Exercise real AbortSignal propagation with no external network calls. */
async function main(): Promise<void> {
  const realFetch = globalThis.fetch;
  const realWarn = console.warn;
  const warnings: unknown[][] = [];
  console.warn = (...args: unknown[]) => { warnings.push(args); };

  const requestUrl = "https://demo.supabase.co/rest/v1/series?apikey=never-log-this&title=eq.private-title";
  const mockPending: typeof fetch = async (_input, init) =>
    new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      if (!signal) {
        reject(new Error("request did not receive an AbortSignal"));
        return;
      }
      const fail = () => reject(new DOMException("The operation was aborted", "AbortError"));
      if (signal.aborted) fail();
      else signal.addEventListener("abort", fail, { once: true });
    });

  try {
    globalThis.fetch = mockPending;
    const start = Date.now();
    await assert.rejects(publicReadFetch(requestUrl), { name: "AbortError" });
    const elapsed = Date.now() - start;
    assert.ok(elapsed >= 2300 && elapsed < 5500, "local fetch must abort at bounded 2500ms");
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0][0], "[public-db-local-timeout]");
    const metadata = warnings[0][1] as Record<string, unknown>;
    assert.equal(metadata.endpoint, "series");
    assert.equal(metadata.timeoutMs, 2500);
    assert.equal(typeof metadata.elapsedMs, "number");
    const json = JSON.stringify(warnings);
    for (const forbidden of ["never-log-this", "private-title", "demo.supabase.co"]) {
      assert.equal(json.includes(forbidden), false);
    }

    warnings.length = 0;
    const caller = new AbortController();
    const scheduledAbort = setTimeout(() => caller.abort(), 15);
    try {
      await assert.rejects(publicReadFetch(requestUrl, { signal: caller.signal }), {
        name: "AbortError",
      });
    } finally {
      clearTimeout(scheduledAbort);
    }
    assert.equal(warnings.length, 0, "caller-triggered cancellation is not a local timeout");

    warnings.length = 0;
    globalThis.fetch = async () => { throw new Error("fetch failed"); };
    await assert.rejects(publicReadFetch(requestUrl), /fetch failed/);
    assert.equal(warnings.length, 0, "network errors are not local timeout events");

    warnings.length = 0;
    globalThis.fetch = async () => new Response(null, { status: 200 });
    const ok = await publicReadFetch(requestUrl);
    assert.equal(ok.status, 200);
    assert.equal(warnings.length, 0);

    console.log("PASS: real 2500ms local AbortSignal and endpoint-only telemetry; caller abort, network failure and success retain semantics");
  } finally {
    globalThis.fetch = realFetch;
    console.warn = realWarn;
  }
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
