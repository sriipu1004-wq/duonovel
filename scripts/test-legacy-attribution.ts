// Legacy official attribution (owner decision 2026-11-15 「原作者だけ先に表示」):
// display judgment regressions. Pure functions + source checks; no network.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  readLegacyAttribution,
  resolveOriginalAuthorName,
} from "../src/lib/legacyAttribution";
import { readPublicDomainMetadata } from "../src/lib/publicDomainMetadata";
import { resolveShareAuthorName } from "../src/lib/share/shareLinks";
import {
  buildLocalizedWorkMetadataText,
  resolvePublicWorkAttribution,
} from "../src/lib/seo/publicWorkSeo";
import {
  isOwnedSeriesWorkspacePayload,
  preserveSeriesPublicDomainMetadata,
} from "../src/lib/write/ownedSeriesPayload";

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

const legacy = {
  originalAuthor: "夏目漱石",
  authorDeathYear: 1916,
  sourceCandidates: ["https://www.aozora.gr.jp/cards/000148/card773.html"],
  sourceMatchVerified: false,
  jurisdictionsAssessed: ["JP", "US", "KR"],
  recordedAt: "2026-11-15",
  recordedBy: "LIB read operator (owner decision 2026-11-15)",
};

// 1. Reader: well-formed record is read; string form (JSON text) too.
{
  const parsed = readLegacyAttribution({ legacyAttribution: legacy });
  assert.ok(parsed);
  assert.equal(parsed.originalAuthor, "夏目漱石");
  assert.equal(parsed.authorDeathYear, 1916);
  assert.equal(parsed.sourceMatchVerified, false);
  assert.deepEqual(parsed.jurisdictionsAssessed, ["JP", "US", "KR"]);
  assert.ok(readLegacyAttribution(JSON.stringify({ legacyAttribution: legacy })));
}

// 2. Reader rejects: verified match claimed / missing flag, bad author, bad
//    year, missing record fields, publicDomain present, nothing at all.
{
  const reject = (value: unknown, why: string) =>
    assert.equal(readLegacyAttribution(value), null, why);
  reject({ legacyAttribution: { ...legacy, sourceMatchVerified: true } }, "verified match never accepted");
  reject({ legacyAttribution: { ...legacy, sourceMatchVerified: undefined } }, "flag is required");
  reject({ legacyAttribution: { ...legacy, sourceMatchVerified: "false" } }, "flag must be boolean false");
  reject({ legacyAttribution: { ...legacy, originalAuthor: "  " } }, "empty author");
  reject({ legacyAttribution: { ...legacy, originalAuthor: "x".repeat(101) } }, "author too long");
  reject({ legacyAttribution: { ...legacy, authorDeathYear: "1916" } }, "year must be integer");
  reject({ legacyAttribution: { ...legacy, authorDeathYear: 1916.5 } }, "year must be integer");
  reject({ legacyAttribution: { ...legacy, recordedAt: "" } }, "recordedAt required");
  reject({ legacyAttribution: { ...legacy, recordedBy: undefined } }, "recordedBy required");
  reject({ legacyAttribution: legacy, publicDomain: { rightsChecked: false } }, "publicDomain wins");
  reject(null, "null settings");
  reject({}, "no record");
  reject({ legacyAttribution: [legacy] }, "array");
  // Only Aozora https cards are kept as candidates.
  const parsed = readLegacyAttribution({
    legacyAttribution: {
      ...legacy,
      sourceCandidates: [
        "https://www.aozora.gr.jp/cards/000148/card773.html",
        "http://www.aozora.gr.jp/cards/000148/card1.html",
        "https://example.com/x",
        "javascript:alert(1)",
      ],
    },
  });
  assert.deepEqual(parsed?.sourceCandidates, ["https://www.aozora.gr.jp/cards/000148/card773.html"]);
}

// 3. Never mixes with the rights check.
{
  assert.equal(readPublicDomainMetadata({ legacyAttribution: legacy }), null);
  assert.equal(
    readPublicDomainMetadata({ legacyAttribution: { ...legacy, rightsChecked: true } }),
    null
  );
}

// 4. Author precedence: Public Domain > legacy > none.
{
  const parsed = readLegacyAttribution({ legacyAttribution: legacy });
  assert.equal(
    resolveOriginalAuthorName({ publicDomainOriginalAuthor: "森鴎外", legacyAttribution: parsed }),
    "森鴎外"
  );
  assert.equal(
    resolveOriginalAuthorName({ publicDomainOriginalAuthor: null, legacyAttribution: parsed }),
    "夏目漱石"
  );
  assert.equal(
    resolveOriginalAuthorName({ publicDomainOriginalAuthor: "", legacyAttribution: null }),
    null
  );
}

// 5. Reader / OG / metadata: the account becomes 「掲載」, like Public Domain.
{
  const attribution = resolvePublicWorkAttribution({
    publicDomainOriginalAuthor: "夏目漱石",
    accountAuthorName: "LIB read Official",
  });
  assert.equal(attribution.authorName, "夏目漱石");
  assert.equal(attribution.publisherName, "LIB read Official");
}

// 6. Share text: the original author, never the operator account.
{
  assert.equal(
    resolveShareAuthorName({
      publicDomainOriginalAuthor: "芥川龍之介",
      accountAuthorName: "LIB read Official",
      authorIsOfficialAccount: false,
    }),
    "芥川龍之介"
  );
  assert.equal(
    resolveShareAuthorName({
      publicDomainOriginalAuthor: null,
      accountAuthorName: "LIB read Official",
      authorIsOfficialAccount: true,
    }),
    ""
  );
}

// 7. Localized Work metadata: original author label, no source line.
{
  const text = buildLocalizedWorkMetadataText({
    locale: "en",
    title: "こころ・夏目漱石",
    summary: "",
    authorName: "夏目漱石",
    isPublicDomain: false,
    hasOriginalAuthor: true,
    sourceLanguage: "ja",
    sourceProvider: null,
  });
  assert.ok(text.title.startsWith("こころ by 夏目漱石"), text.title);
  assert.ok(text.description.includes("Original author: 夏目漱石."), text.description);
  assert.ok(!text.description.includes("Source:"), text.description);
  const user = buildLocalizedWorkMetadataText({
    locale: "en",
    title: "Work",
    summary: "s",
    authorName: "someone",
    isPublicDomain: false,
    sourceLanguage: "ja",
    sourceProvider: null,
  });
  assert.ok(user.description.includes("Author: someone."));
}

// 8. Workspace edits: a client can neither forge nor drop the record.
{
  const base = {
    title: "t",
    description: "",
    publication_status: "public",
    reviews_enabled: true,
    episode_comments_enabled: true,
    genres: [],
    tags: [],
    recording_permission_mode: "open",
    translation_permission_mode: "closed",
    human_translation_permission_mode: "closed",
  };
  assert.ok(isOwnedSeriesWorkspacePayload({ ...base, effect_settings: { storyFormat: "short" } }));
  assert.equal(
    isOwnedSeriesWorkspacePayload({ ...base, effect_settings: { legacyAttribution: legacy } }),
    false
  );
  assert.equal(
    isOwnedSeriesWorkspacePayload({ ...base, effect_settings: { publicDomain: {} } }),
    false
  );
  assert.deepEqual(
    preserveSeriesPublicDomainMetadata({ storyFormat: "short" }, { legacyAttribution: legacy }),
    { storyFormat: "short", legacyAttribution: legacy }
  );
  assert.deepEqual(
    preserveSeriesPublicDomainMetadata(null, { legacyAttribution: legacy }),
    { legacyAttribution: legacy }
  );
  assert.deepEqual(
    preserveSeriesPublicDomainMetadata(
      { legacyAttribution: { ...legacy, originalAuthor: "forged" } },
      null
    ),
    {}
  );
  assert.equal(preserveSeriesPublicDomainMetadata(null, null), null);
  const pd = { rightsChecked: true };
  assert.deepEqual(
    preserveSeriesPublicDomainMetadata({}, { publicDomain: pd, legacyAttribution: legacy }),
    { publicDomain: pd, legacyAttribution: legacy }
  );
}

// 9. Source: rights-only surfaces stay Public Domain only; legacy display is
//    official-account only (grant side, fails closed).
{
  const work = read("src/app/works/[seriesId]/page.tsx");
  assert.ok(work.includes("const publicDomainJsonLd = publicDomain\n"), "Work JSON-LD Public Domain only");
  assert.ok(work.includes("{publicDomain ? (\n              <div className=\"rounded-2xl border border-black/10 bg-neutral-50 px-4 py-3\">\n                <p className=\"text-sm text-neutral-500\">{dictionary.source}</p>"),
    "source panel Public Domain only");
  assert.ok(work.includes("{authorId && !originalAuthorName ? ("), "no profile link for an original author");
  assert.ok((work.match(/\{originalAuthorName \? \(\n\s+<(span|p) className="[^"]*">\n\s+\{dictionary\.managedBy\}: \{authorName\}/gu) ?? []).length === 2,
    "掲載 shown like Public Domain");
  assert.ok(!/legacyAttribution[^;\n]*JsonLd|JsonLd[^;\n]*legacyAttribution/u.test(work));

  const reader = read("src/app/read/[seriesId]/[episodeNumber]/page.tsx");
  assert.ok(reader.includes("isPublicReadPage && !isR18Series(series) && publicDomain\n"), "Reader JSON-LD Public Domain only");

  for (const path of [
    "src/app/works/[seriesId]/page.tsx",
    "src/app/works/[seriesId]/opengraph-image.tsx",
    "src/app/read/[seriesId]/[episodeNumber]/page.tsx",
    "src/app/read/[seriesId]/[episodeNumber]/layout.tsx",
  ]) {
    const source = read(path);
    assert.ok(source.includes("readLegacyAttributionForDisplay("), `${path}: server gate`);
    assert.ok(!/\breadLegacyAttribution\(/u.test(source), `${path}: no ungated reader`);
  }
  const cards = read("src/lib/publicWorks.ts");
  assert.ok(cards.includes("legacyAttributionAuthorIds.has(authorId)"), "cards gate by official author");
  assert.ok(cards.includes("isOfficialAuthorAccountForGrant(authorId)"));
  assert.ok(cards.includes("publicDomainRightsChecked: publicDomain?.rightsChecked === true,"));

  const server = read("src/lib/legacyAttribution.server.ts");
  assert.ok(server.includes('import "server-only"'));
  assert.ok(server.includes("isOfficialAuthorAccountForGrant(authorId)"));
  const grant = read("src/lib/auth/officialAuthorGrant.server.ts");
  assert.ok(grant.includes("isOfficialAccountUser("), "grant side uses the confirmed-identity check");
  assert.ok(!grant.includes("return true;"), "grant side never defaults to true");
  assert.equal((grant.match(/return false;/gu) ?? []).length, 3, "empty id, lookup error, exception -> no grant");

  // Rights-checked consumers keep reading publicDomain only.
  for (const path of [
    "src/lib/translation/prepareEpisodeTranslationGeneration.ts",
    "src/lib/translation/publicWorkTranslations.ts",
  ]) {
    assert.ok(!read(path).includes("legacyAttribution"), `${path}: untouched`);
  }
}

console.log("PASS: legacy official attribution (reader, precedence, share, metadata, workspace guard, rights-only surfaces)");
