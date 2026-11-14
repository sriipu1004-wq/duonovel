import assert from "node:assert/strict";
import { adminReadRetryFetch, publicReadFetch } from "../src/lib/supabase/serverPublic";

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
    assert.equal(typeof metadata.deadlineTimerDelayMs, "number");
    assert.equal(typeof metadata.abortSettlementDelayMs, "number");
    assert.ok(Number.isFinite(metadata.deadlineTimerDelayMs));
    assert.ok(Number.isFinite(metadata.abortSettlementDelayMs));
    assert.ok((metadata.deadlineTimerDelayMs as number) >= 0);
    assert.ok((metadata.abortSettlementDelayMs as number) >= 0);
    for (const key of [
      "elapsedMonotonicMs",
      "deadlineTimerDelayMonotonicMs",
      "deadlineTimerCpuUserMs",
      "deadlineTimerCpuSystemMs",
    ]) {
      assert.equal(typeof metadata[key], "number", `${key} must be numeric`);
      assert.ok(Number.isFinite(metadata[key]), `${key} must be finite`);
      assert.ok((metadata[key] as number) >= 0, `${key} must be nonnegative`);
    }
    assert.ok(
      Math.abs((metadata.elapsedMonotonicMs as number) - (metadata.elapsedMs as number)) < 1000,
      "monotonic and wall clock normally agree without system clock steps"
    );
    const splitDuration =
      (metadata.timeoutMs as number) +
      (metadata.deadlineTimerDelayMs as number) +
      (metadata.abortSettlementDelayMs as number);
    assert.ok(Math.abs((metadata.elapsedMs as number) - splitDuration) < 150,
      "deadline timer delay plus post-abort settlement should explain elapsedMs");
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

    // Network-level failure on a read (Issue #137, 2026-11-14): retried once.
    const networkFailure = (code: string) =>
      Object.assign(new TypeError("fetch failed"), {
        cause: Object.assign(new Error(`connect ${code} 10.0.0.1:443 never-log-this`), { code }),
      });
    let calls = 0;
    warnings.length = 0;
    globalThis.fetch = async () => {
      calls += 1;
      if (calls === 1) throw networkFailure("ECONNRESET");
      return new Response(null, { status: 200 });
    };
    const retried = await publicReadFetch(requestUrl);
    assert.equal(retried.status, 200, "a stale-socket read failure is retried once");
    assert.equal(calls, 2);
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0][0], "[supabase-read-network-retry]");
    assert.deepEqual(warnings[0][1], { client: "public", endpoint: "series", causeCode: "ECONNRESET" });

    // Two failures: exactly one retry, then the original error type propagates.
    calls = 0;
    warnings.length = 0;
    globalThis.fetch = async () => {
      calls += 1;
      throw networkFailure(calls === 1 ? "UND_ERR_SOCKET" : "SOMETHING_NEW");
    };
    await assert.rejects(publicReadFetch(requestUrl), { name: "TypeError", message: "fetch failed" });
    assert.equal(calls, 2, "never more than one retry");
    assert.equal(warnings.length, 2);
    assert.equal(warnings[1][0], "[supabase-read-network-retry-failed]");
    assert.equal((warnings[1][1] as Record<string, unknown>).causeCode, "other", "unknown codes are not logged");
    const retryJson = JSON.stringify(warnings);
    for (const forbidden of ["never-log-this", "10.0.0.1", "private-title", "demo.supabase.co"]) {
      assert.equal(retryJson.includes(forbidden), false);
    }

    // Writes are never retried.
    calls = 0;
    warnings.length = 0;
    globalThis.fetch = async () => {
      calls += 1;
      throw networkFailure("ECONNRESET");
    };
    await assert.rejects(adminReadRetryFetch(requestUrl, { method: "POST", body: "{}" }), {
      message: "fetch failed",
    });
    assert.equal(calls, 1, "POST is not retried");
    assert.equal(warnings.length, 0);

    // The admin client wrapper retries reads too, labelled as admin.
    calls = 0;
    warnings.length = 0;
    globalThis.fetch = async () => {
      calls += 1;
      if (calls === 1) throw networkFailure("ECONNRESET");
      return new Response(null, { status: 200 });
    };
    const adminRead = await adminReadRetryFetch("https://demo.supabase.co/rest/v1/recordings?select=id");
    assert.equal(adminRead.status, 200);
    assert.equal((warnings[0][1] as Record<string, unknown>).client, "admin");
    assert.equal((warnings[0][1] as Record<string, unknown>).endpoint, "recordings");

    // An HTTP error response is a response, not a network failure: no retry.
    calls = 0;
    warnings.length = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return new Response(null, { status: 503 });
    };
    assert.equal((await publicReadFetch(requestUrl)).status, 503);
    assert.equal(calls, 1);
    assert.equal(warnings.length, 0);

    warnings.length = 0;
    globalThis.fetch = async () => new Response(null, { status: 200 });
    const ok = await publicReadFetch(requestUrl);
    assert.equal(ok.status, 200);
    assert.equal(warnings.length, 0);

    // Suspension simulation (Issue #137): block the event loop past the
    // deadline so the deadline timer fires late, the same signature as a
    // suspended Vercel instance thawing. A response that is due right after the
    // deadline must now succeed instead of being aborted.
    const blockEventLoop = (ms: number) => {
      const until = performance.now() + ms;
      while (performance.now() < until) {
        // busy wait: nothing else may run, exactly like a frozen process
      }
    };
    const realInfo = console.info;
    const infos: unknown[][] = [];
    console.info = (...args: unknown[]) => { infos.push(args); };
    try {
      warnings.length = 0;
      globalThis.fetch = async (_input, init) =>
        new Promise<Response>((resolve, reject) => {
          const done = setTimeout(() => resolve(new Response(null, { status: 200 })), 2600);
          init?.signal?.addEventListener("abort", () => {
            clearTimeout(done);
            reject(new DOMException("The operation was aborted", "AbortError"));
          }, { once: true });
        });
      const suspended = publicReadFetch(requestUrl);
      blockEventLoop(4200);
      const recovered = await suspended;
      assert.equal(recovered.status, 200, "a late (suspended) deadline must grant one grace window");
      assert.equal(warnings.length, 0, "recovered request is not a local timeout");
      assert.equal(infos.length, 1);
      assert.equal(infos[0][0], "[public-db-suspension-grace-recovered]");
      const graceMeta = infos[0][1] as Record<string, unknown>;
      assert.equal(graceMeta.endpoint, "series");
      assert.ok((graceMeta.suspensionDetectedDelayMs as number) >= 1000);
      assert.equal(JSON.stringify(infos).includes("never-log-this"), false);

      // Still pending after the grace window: abort, with grace recorded.
      warnings.length = 0;
      infos.length = 0;
      globalThis.fetch = mockPending;
      const stillSlow = publicReadFetch(requestUrl);
      blockEventLoop(4200);
      const graceStart = performance.now();
      await assert.rejects(stillSlow, { name: "AbortError" });
      const graceWaited = performance.now() - graceStart;
      assert.ok(graceWaited >= 2000 && graceWaited < 4500, "grace window is bounded (~2500ms)");
      assert.equal(warnings.length, 1);
      const abortMeta = warnings[0][1] as Record<string, unknown>;
      assert.equal(abortMeta.suspensionGraceGranted, true);
      assert.ok((abortMeta.suspensionDetectedDelayMs as number) >= 1000);
      assert.equal(infos.length, 0);
      assert.equal(abortMeta.suspensionGraceCount, 1);

      // A second suspension while the grace timer is pending (seen in
      // Production 2026-11-08): the late grace timer must re-arm, not abort.
      // A 0 ms timer runs in the timers phase after every already-expired timer.
      const yieldToTimers = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
      warnings.length = 0;
      infos.length = 0;
      globalThis.fetch = async (_input, init) =>
        new Promise<Response>((resolve, reject) => {
          const done = setTimeout(() => resolve(new Response(null, { status: 200 })), 8000);
          init?.signal?.addEventListener("abort", () => {
            clearTimeout(done);
            reject(new DOMException("The operation was aborted", "AbortError"));
          }, { once: true });
        });
      const twiceSuspended = publicReadFetch(requestUrl);
      blockEventLoop(4200);
      await yieldToTimers(); // deadline fires late -> first grace (due ~6700)
      blockEventLoop(5000); // frozen again past the grace due time (~6700) and the response (8000)
      const twiceRecovered = await twiceSuspended;
      assert.equal(twiceRecovered.status, 200, "a late grace timer must re-arm instead of aborting");
      assert.equal(warnings.length, 0);
      assert.equal(infos.length, 1);
      assert.equal((infos[0][1] as Record<string, unknown>).suspensionGraceCount, 2);

      // Repeated suspensions stay bounded: after 3 graces a late timer aborts.
      warnings.length = 0;
      infos.length = 0;
      globalThis.fetch = mockPending;
      const neverDone = publicReadFetch(requestUrl);
      const neverDoneResult = neverDone.then(
        () => "resolved",
        (error: unknown) => (error as { name?: string }).name
      );
      for (let i = 0; i < 4; i += 1) {
        blockEventLoop(4000); // each pending timer fires >= 1000 ms late
        await yieldToTimers();
      }
      // Guard: a regression that removes the cap must fail here, not hang CI.
      let hangGuard: ReturnType<typeof setTimeout> | undefined;
      const cappedOutcome = await Promise.race([
        neverDoneResult,
        new Promise<string>((resolve) => {
          hangGuard = setTimeout(() => resolve("still pending (grace cap missing?)"), 5000);
        }),
      ]);
      clearTimeout(hangGuard);
      assert.equal(cappedOutcome, "AbortError");
      assert.equal(warnings.length, 1);
      const cappedMeta = warnings[0][1] as Record<string, unknown>;
      assert.equal(cappedMeta.suspensionGraceCount, 3, "grace count is capped at 3");
      assert.equal(cappedMeta.suspensionGraceGranted, true);
      assert.equal(infos.length, 0);

      // An on-time deadline (slow database, process running) gets no grace.
      warnings.length = 0;
      const onTimeStart = Date.now();
      await assert.rejects(publicReadFetch(requestUrl), { name: "AbortError" });
      assert.ok(Date.now() - onTimeStart < 3500, "slow DB still aborts at ~2500ms");
      assert.equal((warnings[0][1] as Record<string, unknown>).suspensionGraceGranted, false);
    } finally {
      console.info = realInfo;
    }

    console.log("PASS: real 2500ms local AbortSignal, wall/monotonic/process-CPU diagnostics and endpoint allowlist; caller abort/network/success semantics unchanged; suspension grace recovers late-deadline requests, re-arms after a second suspension and stays capped at 3; network-level read failures retry exactly once with allowlisted cause codes, writes and HTTP errors never retry");
  } finally {
    globalThis.fetch = realFetch;
    console.warn = realWarn;
  }
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
