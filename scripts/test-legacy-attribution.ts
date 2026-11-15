// Legacy official attribution (owner decision 2026-11-15 「原作者だけ先に表示」):
// display judgment regressions. Pure functions + source checks; no network.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  acceptLegacyAttributionForDisplay,
  readLegacyAttribution,
  resolveOriginalAuthorName,
} from "../src/lib/legacyAttribution";
import { createOfficialAuthorGrantCheck } from "../src/lib/auth/officialAuthorGrant";
import {
  isOgSubsetFontText,
  resolveWorkOgImageContent,
} from "../src/lib/og/workOgContent";
import { loadTargets } from "./legacy-official-attribution/targets.mjs";
import { readPublicDomainMetadata } from "../src/lib/publicDomainMetadata";
import { resolveShareAuthorName } from "../src/lib/share/shareLinks";
import {
  buildLocalizedWorkMetadataText,
  buildReaderJsonLd,
  resolvePublicWorkAttribution,
  stripAuthorSuffixFromTitle,
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

// 5. Reader / OG / metadata: the account becomes 「掲載」, like Public Domain,
//    but a legacy attribution is never reported as Public Domain.
{
  const legacyAttribution = resolvePublicWorkAttribution({
    publicDomainOriginalAuthor: null,
    legacyOriginalAuthor: "夏目漱石",
    accountAuthorName: "LIB read Official",
  });
  assert.deepEqual(legacyAttribution, {
    authorName: "夏目漱石",
    publisherName: "LIB read Official",
    isPublicDomain: false,
    isLegacyAttribution: true,
  });
  // Public Domain wins over a legacy record.
  assert.deepEqual(
    resolvePublicWorkAttribution({
      publicDomainOriginalAuthor: "森鴎外",
      legacyOriginalAuthor: "夏目漱石",
      accountAuthorName: "LIB read Official",
    }),
    { authorName: "森鴎外", publisherName: "LIB read Official", isPublicDomain: true, isLegacyAttribution: false }
  );

  // Reader JSON-LD is never built for a legacy attribution (a second guard
  // besides the page's `&& publicDomain`).
  const ld = buildReaderJsonLd({
    seriesId: "8e263f81-6348-4fb2-82a5-786b6c080515",
    seriesTitle: "こころ・夏目漱石",
    episodeTitle: "第1話",
    episodeNumber: 1,
    sourceLanguage: "ja",
    attribution: legacyAttribution,
    isShortStory: false,
  });
  assert.equal(ld, null, "no Reader JSON-LD for a legacy official work");
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

  // OG image (#211 merge): the drawn author follows the same original-author
  // rule as the share text, and the account check is skipped for it.
  const og = read("src/app/works/[seriesId]/opengraph-image.tsx");
  assert.ok(og.includes("const imageAuthorName = resolveShareAuthorName({\n    publicDomainOriginalAuthor: originalAuthorName,"));
  assert.ok(og.includes("originalAuthorName || !accountAuthorName"));
  assert.ok(og.includes('const accountAuthorName = originalAuthorName ? "" : await getNormalAuthorName(series, "");'));
  assert.ok(og.includes("legacyOriginalAuthor: legacyAttribution?.originalAuthor,"));
  assert.ok(og.includes("authorName: imageAuthorName,"));

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
  assert.ok(server.includes("isOfficialAuthorAccountForGrant"));
  assert.ok(server.includes("acceptLegacyAttributionForDisplay("));
  const grantServer = read("src/lib/auth/officialAuthorGrant.server.ts");
  assert.ok(grantServer.includes("createOfficialAuthorGrantCheck("));
  const grant = read("src/lib/auth/officialAuthorGrant.ts");
  assert.ok(grant.includes("isOfficialAccountUser("), "grant side uses the confirmed-identity check");
  assert.ok(!grant.includes("return true;"), "grant side never defaults to true");

  // Rights-checked consumers keep reading publicDomain only.
  for (const path of [
    "src/lib/translation/prepareEpisodeTranslationGeneration.ts",
    "src/lib/translation/publicWorkTranslations.ts",
  ]) {
    assert.ok(!read(path).includes("legacyAttribution"), `${path}: untouched`);
  }
}

// 10. Grant-side official check, behaviour with a fake admin lookup.
async function verifyGrantCheck(): Promise<void> {
  const OFFICIAL = "11111111-1111-4111-8111-111111111111";
  const OTHER = "22222222-2222-4222-8222-222222222222";
  const GOOGLE_ONLY = "33333333-3333-4333-8333-333333333333";
  const LOOKUP_ERROR = "44444444-4444-4444-8444-444444444444";
  const LOOKUP_THROWS = "55555555-5555-4555-8555-555555555555";
  const users: Record<string, unknown> = {
    [OFFICIAL]: {
      email: "libread08@gmail.com",
      email_confirmed_at: "2026-01-01T00:00:00Z",
      identities: [
        { provider: "email", identity_data: { email: "libread08@gmail.com", email_verified: true } },
      ],
    },
    [OTHER]: {
      email: "someone@example.invalid",
      email_confirmed_at: "2026-01-01T00:00:00Z",
      identities: [
        { provider: "email", identity_data: { email: "someone@example.invalid", email_verified: true } },
      ],
    },
    // Official address without a confirmed email identity.
    [GOOGLE_ONLY]: {
      email: "libread08@gmail.com",
      identities: [{ provider: "google", identity_data: { email: "libread08@gmail.com" } }],
    },
  };
  let calls = 0;
  const check = createOfficialAuthorGrantCheck(async (id) => {
    calls += 1;
    if (id === LOOKUP_ERROR) return { user: null, error: new Error("lookup failed") };
    if (id === LOOKUP_THROWS) throw new Error("timeout");
    return { user: (users[id] ?? null) as never, error: null };
  });
  assert.equal(await check(OFFICIAL), true, "official account is granted");
  assert.equal(await check(OTHER), false, "another author is refused");
  assert.equal(await check(GOOGLE_ONLY), false, "no confirmed email identity is refused");
  assert.equal(await check(LOOKUP_ERROR), false, "lookup error refuses");
  assert.equal(await check(LOOKUP_THROWS), false, "exception refuses");
  assert.equal(await check("66666666-6666-4666-8666-666666666666"), false, "missing user refuses");
  assert.equal(await check(""), false, "empty id refuses");
  assert.equal(await check(null), false, "null id refuses");
  // A failed lookup is not cached: retried, and still refused.
  const before = calls;
  assert.equal(await check(LOOKUP_ERROR), false);
  assert.equal(calls, before + 1, "failures are not cached");

  // Display gate: the record shows only for the official author, and no
  // account lookup runs when there is no record.
  const settings = { legacyAttribution: legacy };
  assert.equal((await acceptLegacyAttributionForDisplay(settings, OFFICIAL, check))?.originalAuthor, "夏目漱石");
  assert.equal(await acceptLegacyAttributionForDisplay(settings, OTHER, check), null);
  assert.equal(await acceptLegacyAttributionForDisplay(settings, LOOKUP_ERROR, check), null);
  assert.equal(await acceptLegacyAttributionForDisplay(settings, LOOKUP_THROWS, check), null);
  let looked = false;
  assert.equal(
    await acceptLegacyAttributionForDisplay({ storyFormat: "short" }, OFFICIAL, async () => {
      looked = true;
      return true;
    }),
    null
  );
  assert.equal(looked, false, "no lookup without a record");
}

// 11. OG image: the four original authors and the 28 target titles are
//     drawn with the bundled subset fonts (#211), author included.
function verifyOgFonts(): void {
  for (const author of ["夏目漱石", "芥川龍之介", "宮沢賢治", "江戸川乱歩"]) {
    assert.ok(isOgSubsetFontText(author), `subset font draws ${author}`);
  }
  const targets = loadTargets() as { title: string; originalAuthor: string }[];
  assert.equal(targets.length, 28);
  for (const target of targets) {
    const title = stripAuthorSuffixFromTitle(target.title, target.originalAuthor);
    const content = resolveWorkOgImageContent({
      isPublic: true,
      isR18: false,
      hasPublicEpisode: true,
      title,
      authorName: target.originalAuthor,
    });
    assert.equal(content.kind, "work", `${target.title}: work image`);
    if (content.kind === "work") {
      assert.equal(content.authorName, target.originalAuthor, `${target.title}: author drawn`);
      assert.equal(content.title, title);
    }
  }
}

verifyOgFonts();
verifyGrantCheck().then(
  () => {
    console.log(
      "PASS: legacy official attribution (reader, precedence, share, metadata, workspace guard, rights-only surfaces, Reader JSON-LD, grant check, OG fonts)"
    );
  },
  (error: unknown) => {
    console.error(error);
    process.exit(1);
  }
);
