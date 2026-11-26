import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { createRequire } from "node:module";
import { streamPrivateMediaObject } from "../src/lib/recording/privateMediaStream";

// KD-5: wire-level check of private audio Range playback through the real
// Next.js send path. From Next.js 16.4.5 sendResponse() drops Content-Length
// from route-handler responses (GHSA-pc58-hwjq-p385). Seeking must still work
// from 206 + Content-Range + Accept-Ranges. No Storage or network access: the
// upstream is a fake fetch and the server listens on 127.0.0.1 only.

const require = createRequire(import.meta.url);
const { sendResponse } = require("next/dist/server/send-response.js") as {
  sendResponse: (req: unknown, res: unknown, response: Response) => Promise<void>;
};

const TOTAL = 1000;
const BYTES = Buffer.alloc(TOTAL, 7);

function fakeUpstream(withAcceptRanges: boolean): typeof fetch {
  return (async (_url: string | URL | Request, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    const range = headers.get("range");
    const common: Record<string, string> = { "content-type": "audio/mp4" };
    if (withAcceptRanges) common["accept-ranges"] = "bytes";
    const match = range ? /^bytes=(\d+)-(\d*)$/u.exec(range) : null;
    if (match) {
      const start = Number(match[1]);
      const end = match[2] ? Math.min(Number(match[2]), TOTAL - 1) : TOTAL - 1;
      const slice = BYTES.subarray(start, end + 1);
      return new Response(slice, {
        status: 206,
        headers: {
          ...common,
          "content-range": `bytes ${start}-${end}/${TOTAL}`,
          "content-length": String(slice.length),
        },
      });
    }
    return new Response(BYTES, {
      status: 200,
      headers: { ...common, "content-length": String(TOTAL) },
    });
  }) as typeof fetch;
}

async function startServer(withAcceptRanges: boolean): Promise<http.Server> {
  const server = http.createServer(async (req, res) => {
    const request = new Request(`http://127.0.0.1${req.url ?? "/"}`, {
      headers: req.headers.range ? { range: req.headers.range } : {},
    });
    const response = await streamPrivateMediaObject({
      request,
      bucket: "ai-narration-private",
      objectPath: "ai/series/episode/audio.m4a",
      endpoint: "https://storage.invalid",
      serviceKey: "fake-key",
      fetchImpl: fakeUpstream(withAcceptRanges),
    });
    // The same object plays both roles here: Next passes its NodeNextResponse
    // whose originalResponse is the Node ServerResponse.
    Object.assign(res, { originalResponse: res });
    await sendResponse({ method: req.method }, res, response);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return server;
}

function get(port: number, range?: string): Promise<{
  status: number;
  headers: http.IncomingHttpHeaders;
  body: Buffer;
}> {
  return new Promise((resolve, reject) => {
    const req = http.get(
      { host: "127.0.0.1", port, path: "/media", headers: range ? { range } : {} },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () =>
          resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) })
        );
      }
    );
    req.on("error", reject);
  });
}

async function main() {
  for (const withAcceptRanges of [true, false]) {
    const server = await startServer(withAcceptRanges);
    const { port } = server.address() as AddressInfo;
    try {
      // Mid-file seek.
      const seek = await get(port, "bytes=500-");
      assert.equal(seek.status, 206);
      assert.equal(seek.headers["content-range"], `bytes 500-999/${TOTAL}`);
      assert.equal(seek.headers["accept-ranges"], "bytes");
      // Pins the Next.js 16.4.5+ behavior this test exists for. If Next ever
      // forwards Content-Length again, it must match the body.
      if (seek.headers["content-length"] === undefined) {
        assert.equal(seek.headers["transfer-encoding"], "chunked");
      } else {
        assert.equal(seek.headers["content-length"], "500");
      }
      assert.equal(seek.body.length, 500);

      // Browsers' first media request.
      const first = await get(port, "bytes=0-");
      assert.equal(first.status, 206);
      assert.equal(first.headers["content-range"], `bytes 0-999/${TOTAL}`);
      assert.equal(first.body.length, TOTAL);

      // Safari-style probe.
      const probe = await get(port, "bytes=0-1");
      assert.equal(probe.status, 206);
      assert.equal(probe.headers["content-range"], `bytes 0-1/${TOTAL}`);
      assert.equal(probe.body.length, 2);

      // No Range: full 200 still advertises range support.
      const full = await get(port);
      assert.equal(full.status, 200);
      assert.equal(full.headers["accept-ranges"], "bytes");
      assert.equal(full.body.length, TOTAL);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }
  console.log(
    "PASS: private media Range playback over the Next.js send path (206 + Content-Range + Accept-Ranges without Content-Length)"
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
