import assert from "node:assert/strict";

// Characterization test: pins current behavior only (LT-002).
// globalThis.fetch is replaced in-process; no engine or network access. Env values are fake.

type Call = { url: string; init: RequestInit | undefined };
const state = { calls: [] as Call[], responses: [] as Response[] };
const realFetch = globalThis.fetch;

async function main() {
  const savedUrl = process.env.AIVIS_ENGINE_URL;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    state.calls.push({ url: String(url), init });
    const response = state.responses.shift();
    if (!response) throw new Error("unexpected fetch");
    return response;
  }) as typeof fetch;
  try {
    const client = await import("../src/lib/recording/aivisClient");
    const synth = client.synthesizeAivisWav;
    const reset = (...responses: Response[]) => {
      state.calls = [];
      state.responses = responses;
    };
    const query = () => new Response(JSON.stringify({ accent_phrases: [], speedScale: 1, pitchScale: 0 }), { status: 200 });
    const wav = (bytes = [1, 2, 3]) => new Response(new Uint8Array(bytes), { status: 200 });

    // Base URL: env (trimmed, one trailing slash removed) or the local default.
    delete process.env.AIVIS_ENGINE_URL;
    assert.equal(client.getAivisEngineBaseUrl(), "http://127.0.0.1:10101");
    process.env.AIVIS_ENGINE_URL = "  http://engine.invalid:9/  ";
    assert.equal(client.getAivisEngineBaseUrl(), "http://engine.invalid:9");
    process.env.AIVIS_ENGINE_URL = "   ";
    assert.equal(client.getAivisEngineBaseUrl(), "http://127.0.0.1:10101");
    process.env.AIVIS_ENGINE_URL = "http://engine.invalid:9";

    // Success: audio_query then synthesis with the (clamped) query as JSON.
    reset(query(), wav());
    const bytes = await synth({
      text: "  猫だ。 ",
      speaker: 3,
      speedScale: 5,
      pitchScale: -1,
      intonationScale: Number.NaN,
      volumeScale: 1.2,
      prePhonemeLength: -1,
      postPhonemeLength: 0.4,
    });
    assert.deepEqual([...bytes], [1, 2, 3]);
    assert.equal(state.calls[0].url, `http://engine.invalid:9/audio_query?speaker=3&text=${encodeURIComponent("猫だ。").replace(/%20/g, "+")}`);
    assert.deepEqual(state.calls[0].init, { method: "POST" });
    assert.equal(state.calls[1].url, "http://engine.invalid:9/synthesis?speaker=3");
    assert.equal(state.calls[1].init?.method, "POST");
    assert.deepEqual(state.calls[1].init?.headers, { "Content-Type": "application/json" });
    assert.deepEqual(JSON.parse(String(state.calls[1].init?.body)), {
      accent_phrases: [],
      speedScale: 2,
      pitchScale: -0.15,
      volumeScale: 1.2,
      prePhonemeLength: 0,
      postPhonemeLength: 0.4,
    });
    // Without overrides the engine's query is sent unchanged.
    reset(query(), wav());
    await synth({ text: "a", speaker: 0 });
    assert.deepEqual(JSON.parse(String(state.calls[1].init?.body)), { accent_phrases: [], speedScale: 1, pitchScale: 0 });
    // A path in the base URL is dropped (absolute endpoint paths).
    process.env.AIVIS_ENGINE_URL = "http://engine.invalid:9/tts/";
    reset(query(), wav());
    await synth({ text: "a", speaker: 0 });
    assert.equal(new URL(state.calls[0].url).pathname, "/audio_query");
    process.env.AIVIS_ENGINE_URL = "http://engine.invalid:9";

    // Input checks: no request.
    reset();
    await assert.rejects(synth({ text: "  ", speaker: 1 }), /^Error: aivis_text_empty$/);
    for (const speaker of [-1, 1.5, Number.NaN]) {
      await assert.rejects(synth({ text: "a", speaker }), /^Error: aivis_speaker_invalid$/);
    }
    assert.deepEqual(state.calls, []);

    // Engine errors.
    reset(new Response("bad text", { status: 422 }));
    await assert.rejects(synth({ text: "a", speaker: 1 }), /^Error: aivis_audio_query_failed:422:bad text$/);
    assert.equal(state.calls.length, 1);
    reset(query(), new Response("boom", { status: 500 }));
    await assert.rejects(synth({ text: "a", speaker: 1 }), /^Error: aivis_synthesis_failed:500:boom$/);
    reset(query(), wav([]));
    await assert.rejects(synth({ text: "a", speaker: 1 }), /^Error: aivis_audio_empty$/);
    reset(new Response("not json", { status: 200 }));
    await assert.rejects(synth({ text: "a", speaker: 1 }), SyntaxError);

    console.log("aivisClient characterization: PASS");
  } finally {
    globalThis.fetch = realFetch;
    if (savedUrl === undefined) delete process.env.AIVIS_ENGINE_URL;
    else process.env.AIVIS_ENGINE_URL = savedUrl;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
