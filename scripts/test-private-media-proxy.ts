import assert from "node:assert/strict";
import Module from "node:module";

// Characterization test: pins current behavior only (LT-002).
// privateMediaStream is replaced in-process; no Storage or network access. Env values are fake.

const calls: unknown[] = [];
const moduleWithLoad = Module as unknown as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown;
};
const originalLoad = moduleWithLoad._load;
moduleWithLoad._load = function (request, parent, isMain) {
  if (request === "server-only") return {};
  if (request === "@/lib/recording/privateMediaStream" || request.endsWith("/recording/privateMediaStream")) {
    return {
      streamPrivateMediaObject: async (input: unknown) => {
        calls.push(input);
        return new Response("stub", { status: 206 });
      },
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

async function main() {
  const savedUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const savedKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    const { streamAuthorizedPrivateRecording } = await import("../src/lib/recording/privateMediaProxy");
    const request = new Request("http://localhost/api/media", { headers: { range: "bytes=0-1" } });

    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://fake.invalid";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-key";
    const response = await streamAuthorizedPrivateRecording(request, "recordings", "a/b.mp3");
    assert.equal(response.status, 206);
    assert.equal(await response.text(), "stub");
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], {
      request,
      bucket: "recordings",
      objectPath: "a/b.mp3",
      endpoint: "http://fake.invalid",
      serviceKey: "fake-key",
    });
    assert.equal((calls[0] as { request: Request }).request, request);

    // Env is read at call time; missing values are passed through as undefined.
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    await streamAuthorizedPrivateRecording(request, "x", "y");
    assert.deepEqual(calls[1], { request, bucket: "x", objectPath: "y", endpoint: undefined, serviceKey: undefined });

    console.log("privateMediaProxy characterization: PASS");
  } finally {
    moduleWithLoad._load = originalLoad;
    if (savedUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = savedUrl;
    if (savedKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = savedKey;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
