/**
 * P9 share buttons, UTM rules and per-work Open Graph image regression.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { ImageResponse } from "next/og";
import {
  buildShareIntentUrl,
  buildShareTargetUrl,
  buildShareText,
  resolveShareAuthorName,
  SHARE_CHANNEL_UTM,
  SHARE_CHANNELS,
  SHARE_INTENT_HOSTS,
  shouldShowShareButtons,
} from "../src/lib/share/shareLinks";
import { shareDictionaries } from "../src/i18n/dictionaries/share";
import { UI_LOCALES } from "../src/i18n/config";
import {
  isOgBundledFontText,
  isOgSubsetFontText,
  listOgBundledFontCodePoints,
  listOgSubsetFontCodePoints,
  prefersKoreanOgFont,
  resolveWorkOgImageContent,
  truncateOgText,
  workOgImagePath,
} from "../src/lib/og/workOgContent";
import {
  DefaultOgImageElement,
  OG_IMAGE_SIZE,
  WorkOgImageElement,
} from "../src/lib/og/ogImageElements";
import { isWorkOpenGraphImagePath } from "../src/proxy";
import { loadOgSubsetFonts, ogSubsetFontFamily, type OgFontOption } from "../src/lib/og/ogFonts";

const SITE = "https://www.syosetu-libread.com";
const SERIES = "11111111-2222-4333-8444-555555555555";
const read = (path: string) => readFileSync(path, "utf8");

// 1. UTM on every shared URL.
{
  const url = new URL(buildShareTargetUrl(`/works/${SERIES}`, "x", "work"));
  assert.equal(url.origin, SITE, "share the production origin");
  assert.equal(url.pathname, `/works/${SERIES}`);
  assert.equal(url.searchParams.get("utm_source"), "x");
  assert.equal(url.searchParams.get("utm_medium"), "social");
  assert.equal(url.searchParams.get("utm_campaign"), "share");
  assert.equal(url.searchParams.get("utm_content"), "work");

  const replaced = new URL(
    buildShareTargetUrl(
      `/en/read/${SERIES}/3?readerKey=k&utm_source=old&UTM_MEDIUM=old#top`,
      "line",
      "reader"
    )
  );
  assert.equal(replaced.pathname, `/en/read/${SERIES}/3`);
  assert.equal(replaced.searchParams.get("readerKey"), "k", "other params kept");
  assert.equal(replaced.searchParams.getAll("utm_source").join(","), "line");
  assert.equal(replaced.searchParams.get("UTM_MEDIUM"), null, "old utm removed");
  assert.equal(replaced.searchParams.get("utm_medium"), "social");
  assert.equal(replaced.searchParams.get("utm_content"), "reader");
  assert.equal(replaced.hash, "");

  for (const channel of SHARE_CHANNELS) {
    const utm = SHARE_CHANNEL_UTM[channel];
    assert.match(utm.source, /^[a-z0-9_]+$/u, `${channel} source format`);
    assert.match(utm.medium, /^[a-z0-9_]+$/u, `${channel} medium format`);
    const target = new URL(buildShareTargetUrl("/works/a", channel, "work"));
    assert.equal(target.searchParams.get("utm_source"), utm.source);
    assert.equal(target.searchParams.get("utm_campaign"), "share");
  }
  assert.deepEqual(SHARE_CHANNEL_UTM.copy, { source: "copy_link", medium: "share" });
  assert.deepEqual(SHARE_CHANNEL_UTM.native, { source: "web_share", medium: "share" });
}

// 2. Intent URLs only (no SDK), shared URL carried intact.
{
  const shared = buildShareTargetUrl(`/works/${SERIES}`, "x", "work");
  const x = new URL(buildShareIntentUrl("x", { url: shared, text: "「題」 作者 | LIB read" })!);
  assert.equal(x.host, SHARE_INTENT_HOSTS.x);
  assert.equal(x.host, "x.com");
  assert.equal(x.pathname, "/intent/post");
  assert.equal(x.searchParams.get("url"), shared);
  assert.equal(x.searchParams.get("text"), "「題」 作者 | LIB read");

  const line = new URL(buildShareIntentUrl("line", { url: shared, text: "t" })!);
  assert.equal(line.host, SHARE_INTENT_HOSTS.line);
  assert.equal(line.pathname, "/lineit/share");
  assert.equal(line.searchParams.get("url"), shared);

  const facebook = new URL(buildShareIntentUrl("facebook", { url: shared, text: "t" })!);
  assert.equal(facebook.host, SHARE_INTENT_HOSTS.facebook);
  assert.equal(facebook.pathname, "/sharer/sharer.php");
  assert.equal(facebook.searchParams.get("u"), shared);

  assert.equal(buildShareIntentUrl("copy", { url: shared, text: "t" }), null);
  assert.equal(buildShareIntentUrl("native", { url: shared, text: "t" }), null);
  for (const href of [x, line, facebook]) assert.equal(href.protocol, "https:");
}

// 2b. Share-text author (review S2): PD original author or a user author;
//     never the operator account, never an "author unset" placeholder.
{
  const unset = ["作者名未設定", "Author unavailable", "작가 정보 없음", "Author not set"];
  assert.equal(
    resolveShareAuthorName({ publicDomainOriginalAuthor: "夏目漱石", accountAuthorName: "LIB read Official", authorIsOfficialAccount: true, unsetLabels: unset }),
    "夏目漱石"
  );
  // Official work without Public Domain metadata: no author at all.
  assert.equal(
    resolveShareAuthorName({ publicDomainOriginalAuthor: null, accountAuthorName: "LIB read Official", authorIsOfficialAccount: true, unsetLabels: unset }),
    ""
  );
  // Even if the account lookup fails open, the operator display name is withheld.
  assert.equal(
    resolveShareAuthorName({ publicDomainOriginalAuthor: null, accountAuthorName: "LIB read Official", authorIsOfficialAccount: false, unsetLabels: unset }),
    ""
  );
  assert.equal(
    resolveShareAuthorName({ publicDomainOriginalAuthor: "", accountAuthorName: "公式の別名", authorIsOfficialAccount: true }),
    ""
  );
  for (const placeholder of unset) {
    assert.equal(
      resolveShareAuthorName({ publicDomainOriginalAuthor: null, accountAuthorName: placeholder, authorIsOfficialAccount: false, unsetLabels: unset }),
      "",
      `placeholder ${placeholder}`
    );
  }
  assert.equal(
    resolveShareAuthorName({ publicDomainOriginalAuthor: null, accountAuthorName: " 投稿者A ", authorIsOfficialAccount: false, unsetLabels: unset }),
    "投稿者A"
  );
  // The reviewed failure: 「吾輩は猫である・夏目漱石」 LIB read Official.
  const author = resolveShareAuthorName({ publicDomainOriginalAuthor: null, accountAuthorName: "LIB read Official", authorIsOfficialAccount: true, unsetLabels: unset });
  assert.equal(
    buildShareText({ title: "吾輩は猫である・夏目漱石", authorName: author, quote: shareDictionaries.ja.quoteTitle }),
    "「吾輩は猫である・夏目漱石」 | LIB read"
  );
  for (const locale of UI_LOCALES) {
    const text = buildShareText({ title: "T", authorName: author, quote: shareDictionaries[locale].quoteTitle });
    assert.ok(!/LIB read Official|作者名未設定/u.test(text), `${locale}: ${text}`);
  }
}

// 3. Visibility: public and non-R18 only.
assert.equal(shouldShowShareButtons({ isPublic: true, isR18: false }), true);
assert.equal(shouldShowShareButtons({ isPublic: true, isR18: true }), false);
assert.equal(shouldShowShareButtons({ isPublic: false, isR18: false }), false);
assert.equal(shouldShowShareButtons({ isPublic: false, isR18: true }), false);

// 4. ja / en / ko copy.
{
  const keys = Object.keys(shareDictionaries.ja).sort();
  for (const locale of UI_LOCALES) {
    const dictionary = shareDictionaries[locale];
    assert.deepEqual(Object.keys(dictionary).sort(), keys, `${locale} keys`);
    for (const [key, value] of Object.entries(dictionary)) {
      if (typeof value === "string") assert.ok(value.trim(), `${locale}.${key}`);
    }
    assert.ok(dictionary.quoteTitle("T").includes("T"));
  }
  assert.notEqual(shareDictionaries.en.copyLink, shareDictionaries.ja.copyLink);
  assert.notEqual(shareDictionaries.ko.copyLink, shareDictionaries.ja.copyLink);
  assert.equal(
    buildShareText({ title: " 題 ", authorName: "作者", quote: shareDictionaries.ja.quoteTitle }),
    "「題」 作者 | LIB read"
  );
  assert.equal(
    buildShareText({ title: "修道院の秋・南部修太郎", authorName: "南部修太郎", quote: shareDictionaries.ja.quoteTitle }),
    "「修道院の秋」 南部修太郎 | LIB read",
    "author suffix is not repeated"
  );
  assert.equal(
    buildShareText({ title: "Title", authorName: "", quote: shareDictionaries.en.quoteTitle }),
    '"Title" | LIB read'
  );
}

// 5. OG content decision.
{
  const base = { isPublic: true, isR18: false, hasPublicEpisode: true };
  assert.deepEqual(
    resolveWorkOgImageContent({ ...base, title: "The Wind in the Willows", authorName: "Kenneth Grahame" }),
    { kind: "work", title: "The Wind in the Willows", authorName: "Kenneth Grahame", fontSet: "default" }
  );
  assert.deepEqual(
    resolveWorkOgImageContent({ ...base, isR18: true, title: "Latin Title", authorName: "A" }),
    { kind: "generic", reason: "r18" },
    "R18 never shows its title"
  );
  assert.deepEqual(
    resolveWorkOgImageContent({ ...base, isPublic: false, title: "Latin Title", authorName: "A" }),
    { kind: "generic", reason: "not_public" }
  );
  assert.deepEqual(
    resolveWorkOgImageContent({ ...base, hasPublicEpisode: false, title: "Latin", authorName: "A" }),
    { kind: "generic", reason: "no_public_episode" }
  );
  assert.deepEqual(
    resolveWorkOgImageContent({ ...base, title: "吾輩は猫である", authorName: "夏目漱石" }),
    { kind: "work", title: "吾輩は猫である", authorName: "夏目漱石", fontSet: "cjk" }
  );
  assert.deepEqual(
    resolveWorkOgImageContent({ ...base, title: "운수 좋은 날", authorName: "현진건" }),
    { kind: "work", title: "운수 좋은 날", authorName: "현진건", fontSet: "cjk" }
  );
  assert.deepEqual(
    resolveWorkOgImageContent({ ...base, title: "Kokoro", authorName: "夏目漱石" }),
    { kind: "work", title: "Kokoro", authorName: "夏目漱石", fontSet: "cjk" },
    "a Latin title with a Japanese author switches to the subset fonts"
  );
  // Outside every bundled font: never downloaded.
  assert.deepEqual(
    resolveWorkOgImageContent({ ...base, title: "憂鬱な朝", authorName: "A" }),
    { kind: "generic", reason: "font_unavailable" },
    "JIS level-2 kanji (鬱) is not in the subset"
  );
  assert.deepEqual(
    resolveWorkOgImageContent({ ...base, title: "Kokoro", authorName: "📚 reader" }),
    { kind: "work", title: "Kokoro", authorName: null, fontSet: "default" },
    "author no bundled font can draw is dropped, not downloaded"
  );
  assert.deepEqual(
    resolveWorkOgImageContent({ ...base, title: "吾輩は猫である", authorName: "作者😀" }),
    { kind: "work", title: "吾輩は猫である", authorName: null, fontSet: "cjk" }
  );
  assert.deepEqual(
    resolveWorkOgImageContent({ ...base, title: "边城", authorName: "沈从文" }),
    { kind: "generic", reason: "font_unavailable" },
    "Simplified Chinese 边 is not in the subset"
  );
  assert.deepEqual(
    resolveWorkOgImageContent({ ...base, isR18: true, title: "吾輩は猫である", authorName: "夏目漱石" }),
    { kind: "generic", reason: "r18" }
  );
  // Every production title / author character is drawable.
  const productionChars = read("scripts/og-fonts/production-chars.txt")
    .split("\n")
    .filter((line) => !line.startsWith("#"))
    .join("")
    .replace(/\s+/gu, "");
  for (const char of productionChars) {
    assert.ok(isOgSubsetFontText(char), `production character ${char} in the subset`);
  }
  assert.equal(isOgSubsetFontText("こころ ヘンゼル 漢字 한국어"), true);
  assert.equal(prefersKoreanOgFont("운수 좋은 날"), true);
  assert.equal(prefersKoreanOgFont("吾輩は猫である"), false);
  assert.deepEqual(resolveWorkOgImageContent({ ...base, title: "  ", authorName: "A" }), {
    kind: "generic",
    reason: "no_title",
  });
  const long = truncateOgText("a".repeat(200), 90);
  assert.equal(Array.from(long).length, 90);
  assert.ok(long.endsWith("…"));
  assert.equal(isOgBundledFontText("Les Misérables — Œuvre “I” …"), true);
  assert.equal(isOgBundledFontText("emoji 📚"), false);
  assert.equal(isOgBundledFontText("‐"), false, "U+2010 is not in Geist");
  assert.equal(workOgImagePath(SERIES), `/works/${SERIES}/opengraph-image`);
}

// 6. Proxy keeps the image route locale-independent.
assert.equal(isWorkOpenGraphImagePath(`/works/${SERIES}/opengraph-image`), true);
assert.equal(isWorkOpenGraphImagePath(`/works/${SERIES}/opengraph-image-abc123`), true);
assert.equal(isWorkOpenGraphImagePath(`/works/${SERIES}`), false);
assert.equal(isWorkOpenGraphImagePath(`/works/${SERIES}/translations`), false);

// 7. Source wiring.
{
  const shareButtons = read("src/components/share/ShareButtons.tsx");
  assert.ok(
    !/<script|<iframe|<img|next\/script|connect\.facebook|platform\.twitter|d\.line-scdn|src=|\.js["']/iu.test(shareButtons),
    "no external script, SDK or pixel"
  );
  assert.ok(shareButtons.includes('rel="noopener noreferrer"'));
  assert.ok(shareButtons.includes("navigator.share"), "native share only when supported");
  assert.ok(shareButtons.includes("useSyncExternalStore"), "native share button not rendered on the server");

  const workPage = read("src/app/works/[seriesId]/page.tsx");
  assert.ok(workPage.includes("shouldShowShareButtons({"));
  assert.ok(workPage.includes('isR18: getSeriesContentRating(series) === "r18"'));
  assert.ok(workPage.includes("{showShareButtons ? ("));
  assert.ok(workPage.includes("authorName={shareAuthorName}"), "Work share uses resolveShareAuthorName");
  assert.ok(
    !/authorName=\{displayedAuthorName\}\s+className="mt-5"/u.test(workPage),
    "Work share must not use the displayed (account) author name"
  );
  assert.ok(workPage.includes("resolveShareAuthorName({"));
  assert.ok(workPage.includes("isOfficialAuthorAccountForDisplay(authorId)"));
  assert.ok(workPage.includes("images: [workOgImagePath(seriesId)]"));
  assert.ok(!workPage.includes('images: ["/opengraph-image"]'));

  const layout = read("src/app/read/[seriesId]/[episodeNumber]/layout.tsx");
  assert.ok(layout.includes("isR18: isR18Series(input.series)"));
  assert.ok(layout.includes("isEpisodePubliclyVisible(input.episode)"));
  assert.ok(layout.includes('getSeriesPublicationStatus(input.series) === "public"'));
  assert.ok(layout.includes("readerCanonicalPath("), "Reader shares its canonical copy");
  assert.ok(layout.includes("resolveShareAuthorName({"), "Reader share uses the same author rule");
  assert.ok(layout.includes("isOfficialAuthorAccountForDisplay("));
  assert.ok(layout.includes("pb-56"), "clear of the fixed Reader player bar (~174px)");
  // Outside the translation shell, so Bilingual / Translation modes keep it.
  const shellEnd = layout.indexOf("</ReadBilingualShell>");
  assert.ok(shellEnd > 0 && layout.indexOf("shareSectionFor(shareAuthorName)", shellEnd) > shellEnd);
  // R18-blocked viewers get the gate and nothing else.
  const gate = layout.indexOf("if (payload.r18Blocked)");
  assert.ok(gate > 0 && gate < layout.indexOf("shareSectionFor("));

  const readerPage = read("src/app/read/[seriesId]/[episodeNumber]/page.tsx");
  assert.equal((readerPage.match(/images: \[workOgImagePath\(seriesId\)\]/gu) ?? []).length, 2);
  const localeWork = read("src/app/locale-work/[seriesId]/page.tsx");
  assert.equal((localeWork.match(/images: \[workOgImagePath\(seriesId\)\]/gu) ?? []).length, 2);

  const ogRoute = read("src/app/works/[seriesId]/opengraph-image.tsx");
  assert.ok(ogRoute.includes("isR18Series(series)"));
  assert.ok(ogRoute.includes('getSeriesPublicationStatus(series) === "public"'));
  assert.ok(ogRoute.includes("<DefaultOgImageElement />"));
  assert.ok(ogRoute.includes('"cache-control": OG_CACHE_CONTROL'));
  assert.ok(!/cookies\(|getCurrentR18ViewerPreference|createAdminClient\(\)\s*\.from\("series"\)/u.test(ogRoute), "image does not depend on the viewer");
  assert.ok(!/fonts\.googleapis|https?:\/\/|fetch\(|loadGoogleFont/u.test(ogRoute), "no network font loading in the route");
  assert.ok(ogRoute.includes("fonts = await loadOgSubsetFonts()"), "only the bundled subset fonts");
  assert.ok(ogRoute.includes('content.fontSet === "cjk"'));
  // The image never names the operator account as the author (same rule as
  // the share text).
  assert.ok(ogRoute.includes("resolveShareAuthorName({"), "OG author uses the share author rule");
  assert.ok(ogRoute.includes("await isOfficialAuthorAccountForDisplay(authorId)"));
  assert.ok(ogRoute.includes("authorName: imageAuthorName,"));
  const ogFonts = read("src/lib/og/ogFonts.ts");
  assert.ok(!/fetch\(|https?:\/\//u.test(ogFonts), "font loader never uses the network");
  assert.ok(ogFonts.includes("readFile(path.join(rootDir, OG_SUBSET_FONT_DIR, file))"));
  const nextConfig = read("next.config.ts");
  assert.ok(nextConfig.includes('"./src/assets/og-fonts/*.ttf"'), "fonts traced into the function bundle");
  const sources = read("src/assets/og-fonts/SOURCES.md");
  assert.ok(read("src/assets/og-fonts/OFL.txt").includes("SIL Open Font License, Version 1.1"));
  for (const file of ["NotoSansJP-OgSubset-400.ttf", "NotoSansJP-OgSubset-700.ttf", "NotoSansKR-OgSubset-400.ttf", "NotoSansKR-OgSubset-700.ttf"]) {
    const digest = createHash("sha256").update(readFileSync(`src/assets/og-fonts/${file}`)).digest("hex");
    assert.ok(sources.includes(`\`${file}\``) && sources.includes(digest), `SOURCES.md records ${file} ${digest}`);
  }
}

// 7b. The official-account check is deny-side and fails closed.
{
  const official = read("src/lib/auth/officialAuthor.server.ts");
  assert.ok(official.includes('import "server-only"'));
  assert.ok(official.includes("isOfficialAccountEmail("), "deny side matches by email");
  assert.ok(!official.includes("isOfficialAccountUser("), "never the grant-side check");
  assert.equal((official.match(/return true;/gu) ?? []).length, 2, "lookup error and exception -> withhold");
}

// 8. The UTM document matches the code.
{
  const doc = read("docs/p9-utm-measurement.md");
  for (const channel of SHARE_CHANNELS) {
    const utm = SHARE_CHANNEL_UTM[channel];
    assert.ok(
      doc.includes(`| \`${utm.source}\` | \`${utm.medium}\` | \`share\` |`),
      `doc row for ${channel}`
    );
  }
  for (const heading of ["Vercel Web Analytics での見方", "受け入れの指標の測り方", "最小のイベント", "最大でおよそ10分", "何日も残りうる"]) {
    assert.ok(doc.includes(heading), heading);
  }
}

// 9. Real next/og render: the bundled font covers every allowed character,
//    so no font is downloaded; Japanese would trigger a download (why the
//    gate exists).
async function renderAndCollectFontRequests(
  element: React.ReactElement,
  size: { width: number; height: number } = OG_IMAGE_SIZE,
  fonts?: OgFontOption[]
) {
  const originalFetch = globalThis.fetch;
  const requests: string[] = [];
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith("data:")) return originalFetch(input, init);
    requests.push(url);
    throw new Error(`blocked network request in test: ${url}`);
  }) as typeof fetch;
  const originalError = console.error;
  console.error = () => {};
  try {
    const response = new ImageResponse(element, fonts ? { ...size, fonts } : size);
    const bytes = new Uint8Array(await response.arrayBuffer());
    assert.deepEqual([...bytes.slice(0, 4)], [0x89, 0x50, 0x4e, 0x47], "PNG");
    return requests;
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalError;
  }
}

async function main() {
  const allowed = String.fromCodePoint(...listOgBundledFontCodePoints());
  for (let index = 0; index < allowed.length; index += 120) {
    const chunk = allowed.slice(index, index + 120);
    const requests = await renderAndCollectFontRequests(
      <div style={{ display: "flex", flexWrap: "wrap", fontSize: 24 }}>{chunk}</div>
    );
    assert.deepEqual(requests, [], `bundled font must cover: ${chunk}`);
  }
  assert.deepEqual(await renderAndCollectFontRequests(<DefaultOgImageElement />), []);
  assert.deepEqual(
    await renderAndCollectFontRequests(
      <WorkOgImageElement title={truncateOgText("Les Misérables — " + "x".repeat(120), 90)} authorName="Victor Hugo" />
    ),
    []
  );
  const japanese = await renderAndCollectFontRequests(
    <div style={{ display: "flex" }}>吾輩は猫である</div>
  );
  assert.ok(
    japanese.some((url) => url.includes("fonts.googleapis.com")),
    "Japanese glyphs need a downloaded font in next/og (gate must stay)"
  );

  // 9b. Bundled Noto Sans JP / KR subsets: every code point the gate accepts
  //     renders with zero network requests, in both weights.
  const fonts = await loadOgSubsetFonts();
  assert.equal(fonts.length, 4);
  const subsetCodePoints = listOgSubsetFontCodePoints();
  assert.ok(subsetCodePoints.length > 6000, "subset coverage loaded");
  const subsetText = String.fromCodePoint(...subsetCodePoints);
  const subsetChars = Array.from(subsetText);
  for (let index = 0; index < subsetChars.length; index += 400) {
    const chunk = subsetChars.slice(index, index + 400).join("");
    for (const fontWeight of [400, 700] as const) {
      const requests = await renderAndCollectFontRequests(
        <div style={{ display: "flex", flexWrap: "wrap", fontSize: 20, fontWeight, fontFamily: ogSubsetFontFamily(false) }}>{chunk}</div>,
        { width: 1200, height: 1200 },
        fonts
      );
      assert.deepEqual(requests, [], `subset fonts must cover (weight ${fontWeight}): ${chunk}`);
    }
  }
  for (const [title, author] of [
    ["吾輩は猫である", "夏目漱石"],
    ["운수 좋은 날", "현진건"],
    ["Kokoro", "夏目漱石"],
    [truncateOgText("羅生門・鼻・芋粥 ".repeat(20), 90), "芥川龍之介"],
  ] as const) {
    const content = resolveWorkOgImageContent({ isPublic: true, isR18: false, hasPublicEpisode: true, title, authorName: author });
    assert.equal(content.kind, "work");
    if (content.kind !== "work") continue;
    assert.equal(content.fontSet, "cjk");
    assert.equal(content.authorName, author, `${title}: author drawn`);
    const requests = await renderAndCollectFontRequests(
      <WorkOgImageElement
        title={content.title}
        authorName={content.authorName}
        fontFamily={ogSubsetFontFamily(prefersKoreanOgFont(title + author))}
      />,
      OG_IMAGE_SIZE,
      fonts
    );
    assert.deepEqual(requests, [], `no network request for ${title}`);
  }
  // The stub would see a request for a glyph the subsets lack (the gate
  // keeps such titles away from the renderer).
  const outside = await renderAndCollectFontRequests(
    <div style={{ display: "flex", fontFamily: ogSubsetFontFamily(false) }}>憂鬱</div>,
    OG_IMAGE_SIZE,
    fonts
  );
  assert.ok(outside.length > 0, "a glyph outside the subset would be downloaded (gate must stay)");
  console.log("PASS: P9 share buttons (UTM, intents, visibility, ja/en/ko), per-work OG image (R18/private generic, bundled-font gate, real render), UTM doc");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
