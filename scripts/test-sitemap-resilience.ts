import assert from "node:assert/strict";
import { loadSitemapWorkFallback } from "../src/lib/sitemap/loadSitemapWorkFallback";

async function main() {
  const reports: Array<{ message: string; error: unknown }> = [];
  const works = await loadSitemapWorkFallback(
    async () => {
      throw new Error("transient database outage");
    },
    (message, error) => reports.push({ message, error })
  );
  assert.deepEqual(works, [], "a transient work lookup failure must fall back to static sitemap entries");
  assert.equal(reports.length, 1, "the sitemap fallback must preserve an operational warning");
  assert.equal(reports[0]?.message, "[sitemap] public work entries unavailable");

  console.log("PASS: sitemap work lookup failure falls back without throwing");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
