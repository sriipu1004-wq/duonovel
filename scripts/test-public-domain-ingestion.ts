import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  assertImportable,
  buildDraftImportPlan,
  isDuplicatePublicDomainSeries,
  normalizeSource,
  prepareArtifact,
  sha256Bytes,
  splitChapters,
  validateChapters,
  validateManifest,
  type PreparedArtifact,
  type PublicDomainManifest,
} from "./public-domain/core";
import {
  canonicalAozoraIdentityPart,
  classifyAozoraWork,
  isAllowedAozoraTextUrl,
  makePendingAozoraManifest,
} from "./public-domain/aozora";
import { isAllowedGutenbergTextUrl } from "./public-domain/gutenberg";
import { gonguWorkNumberFromLandingUrl, isAllowedGonguTextUrl } from "./public-domain/gongu";
import { readPublicDomainMetadata } from "../src/lib/publicDomainMetadata";

function component(
  status: "approved" | "not_applicable" | "needs_review" | "rejected" = "approved"
) {
  return {
    status,
    basis: status === "approved" ? "human reviewed fixture basis" : "",
    notes: "",
  } as const;
}

function approvedManifest(
  overrides: Partial<PublicDomainManifest> = {}
): PublicDomainManifest {
  return {
    id: "fixture-ja",
    title: "Fixture",
    original_title: "Fixture",
    original_author: "Public Domain Author",
    author_death_year: 1900,
    original_language: "ja",
    first_publication_year: 1890,
    source_provider: "Synthetic fixture",
    source_url: "https://example.invalid/fixture",
    source_download_url: null,
    source_file: "public-domain/sources/raw/fixture-ja.txt",
    source_retrieved_at: "2026-09-22T00:00:00.000Z",
    source_encoding: "utf-8",
    normalization_profile: "plain",
    edition: "Synthetic fixture",
    edition_publication_year: 1890,
    translator: null,
    translator_death_year: null,
    translation_language: null,
    rights_status: "approved",
    rights_basis: "Synthetic Public Domain test fixture only",
    rights_notes: "",
    rights_components: {
      original_work: component(),
      edition: component(),
      translation: component("not_applicable"),
      editorial: component("not_applicable"),
      annotations: component("not_applicable"),
      illustrations: component("not_applicable"),
      cover: component("not_applicable"),
      digitization: component(),
      provider_terms: component(),
    },
    jurisdictions_reviewed: ["JP", "US", "KR"],
    reviewed_at: "2026-09-22T00:00:00.000Z",
    reviewed_by: "LIB read operator",
    chapter_count: 1,
    chapter_split: { strategy: "single" },
    genres: ["文芸"],
    tags: ["心理"],
    source_hash:
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    approved: true,
    import_status: "not_imported",
    cover_source: null,
    cover_rights_status: null,
    ...overrides,
  };
}

function artifact(
  overrides: Partial<PreparedArtifact> = {}
): PreparedArtifact {
  return {
    version: 1,
    manifestId: "fixture-ja",
    sourceHash:
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    preparedAt: "2026-09-22T00:00:00.000Z",
    normalizationProfile: "plain",
    rawCharacterCount: 3,
    displayCharacterCount: 3,
    archiveMetadataCharacterCount: 0,
    normalizationChanges: [],
    warnings: [],
    chapters: [
      {
        number: 1,
        title: "Fixture",
        body: "abc",
        characterCount: 3,
      },
    ],
    ...overrides,
  };
}

function testPendingAndApprovedGates() {
  assert.throws(
    () =>
      assertImportable(
        approvedManifest({ rights_status: "pending", approved: false }),
        artifact()
      ),
    /RIGHTS_NOT_APPROVED/
  );
  assert.throws(
    () => assertImportable(approvedManifest({ approved: false }), artifact()),
    /RIGHTS_NOT_APPROVED/
  );
}

function testApprovedManifestRequiresAuditMetadata() {
  const input = approvedManifest({
    rights_basis: "",
    reviewed_at: null,
    reviewed_by: null,
    jurisdictions_reviewed: [],
    source_hash: null,
    chapter_count: null,
  }) as unknown as Record<string, unknown>;
  const result = validateManifest(input);
  assert.equal(result.ok, false);
  for (const expected of [
    "rights_basis",
    "source_hash",
    "chapter_count",
    "reviewed_at",
    "reviewed_by",
    "jurisdiction",
  ]) {
    assert.equal(
      result.errors.some((error) => error.includes(expected)),
      true,
      `missing approved audit field must fail: ${expected}`
    );
  }
}

function testSourceHash() {
  const hash = sha256Bytes(new TextEncoder().encode("abc"));
  assert.equal(
    hash,
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
  );
}

function testDuplicateDetection() {
  const settings = {
    version: 1,
    publicDomain: {
      manifestId: "fixture-ja",
      sourceHash: "hash-a",
    },
  };
  assert.equal(
    isDuplicatePublicDomainSeries({
      effectSettings: settings,
      manifestId: "fixture-ja",
      sourceHash: "other",
    }),
    true
  );
  assert.equal(
    isDuplicatePublicDomainSeries({
      effectSettings: JSON.stringify(settings),
      manifestId: "other",
      sourceHash: "hash-a",
    }),
    true
  );
  assert.equal(
    isDuplicatePublicDomainSeries({
      effectSettings: settings,
      manifestId: "other",
      sourceHash: "other",
    }),
    false
  );
}

function testChapterValidationAndSingleEpisode() {
  assert.equal(validateChapters([]).fatals.some((item) => item.includes("CHAPTER_ZERO")), true);
  assert.equal(
    validateChapters([
      { number: 1, title: "Empty", body: "", characterCount: 0 },
    ]).fatals.some((item) => item.includes("CHAPTER_EMPTY")),
    true
  );
  const chapters = splitChapters("short story body", {
    title: "Short Story",
    chapter_split: { strategy: "single" },
  });
  assert.equal(chapters.length, 1);
  assert.equal(chapters[0]?.body, "short story body");
}

function testParagraphChunkSplitFixture() {
  const paragraphA = "A".repeat(4_000);
  const paragraphB = "B".repeat(4_000);
  const paragraphC = "C".repeat(4_000);
  const source = [paragraphA, paragraphB, paragraphC].join("\n\n");
  const chapters = splitChapters(source, {
    title: "Chunked Book",
    chapter_split: {
      strategy: "paragraph_chunks",
      max_characters: 5_000,
    },
  });

  assert.equal(chapters.length, 3);
  assert.deepEqual(
    chapters.map((chapter) => chapter.body),
    [paragraphA, paragraphB, paragraphC]
  );
  assert.ok(
    chapters.every((chapter) => chapter.characterCount <= 5_000),
    "paragraph chunking must honor the configured maximum when natural paragraph boundaries exist"
  );
  assert.deepEqual(
    chapters.map((chapter) => chapter.title),
    [
      "Chunked Book — Part 1",
      "Chunked Book — Part 2",
      "Chunked Book — Part 3",
    ]
  );

  const invalid = validateManifest({
    ...approvedManifest(),
    chapter_split: {
      strategy: "paragraph_chunks",
      max_characters: 4_999,
    },
  });
  assert.equal(invalid.ok, false);
  assert.equal(
    invalid.errors.some((error) => error.includes("max_characters")),
    true
  );
}

function testHeadingSplitFixture() {
  const chapters = splitChapters(
    ["Preface", "", "CHAPTER I", "Alpha", "", "CHAPTER II", "Beta"].join("\n"),
    {
      title: "Book",
      chapter_split: {
        strategy: "heading_regex",
        heading_pattern: "^CHAPTER\\s+[IVXLC]+$",
      },
    }
  );
  assert.equal(chapters.length, 2);
  assert.equal(chapters[0]?.title, "CHAPTER I");
  assert.equal(chapters[0]?.body.includes("Preface"), true);
  assert.equal(chapters[1]?.body, "Beta");
}

function testHeadingSplitCanDropProviderFrontMatter() {
  const chapters = splitChapters(
    ["Provider title", "", "Contents", "CHAPTER I", "Alpha", "", "CHAPTER II", "Beta"].join("\n"),
    {
      title: "Book",
      chapter_split: {
        strategy: "heading_regex",
        heading_pattern: "^CHAPTER\\s+[IVXLC]+$",
        drop_prefix_before_first_heading: true,
      },
    }
  );
  assert.equal(chapters.length, 2);
  assert.equal(chapters[0]?.body, "Alpha");
  assert.equal(chapters[0]?.body.includes("Provider title"), false);
  assert.equal(chapters[0]?.body.includes("Contents"), false);
}

function testAozoraAndGutenbergNormalization() {
  const aozora = normalizeSource(
    [
      "題名",
      "",
      "探《さぐ》り",
      "［＃改ページ］",
      "",
      "底本：fixture",
      "入力：fixture",
      "青空文庫作成ファイル",
    ].join("\n"),
    "aozora"
  );
  assert.equal(aozora.displayText.includes("探《さぐ》り"), true);
  assert.equal(aozora.displayText.includes("［＃改ページ］"), true);
  assert.equal(aozora.archiveMetadata.includes("底本：fixture"), true);

  const gutenberg = normalizeSource(
    [
      "Project metadata",
      "*** START OF THE PROJECT GUTENBERG EBOOK FIXTURE ***",
      "Chapter body",
      "*** END OF THE PROJECT GUTENBERG EBOOK FIXTURE ***",
      "License footer",
    ].join("\n"),
    "gutenberg"
  );
  assert.equal(gutenberg.displayText, "Chapter body");
  assert.equal(gutenberg.archiveMetadata.includes("Project metadata"), true);
  assert.equal(gutenberg.archiveMetadata.includes("License footer"), true);
}

function testPreparedArtifactAndDraftPlan() {
  const raw = new TextEncoder().encode("abc");
  const prepared = prepareArtifact({
    manifest: approvedManifest(),
    rawBytes: raw,
    preparedAt: "2026-09-22T00:00:00.000Z",
  });
  const plan = buildDraftImportPlan({
    manifest: approvedManifest(),
    artifact: prepared,
    officialUserId: "official-user-id",
  });
  assert.equal(plan.series.author_id, "official-user-id");
  assert.equal(plan.series.publication_status, "private");
  assert.equal(plan.series.is_public, false);
  assert.equal(plan.series.source_language, "ja");
  assert.equal(plan.series.translation_permission_mode, "closed");
  assert.equal(plan.series.recording_permission_mode, "open");
  assert.deepEqual(plan.series.genres, ["文芸"]);
  assert.deepEqual(plan.series.tags, ["心理"]);
  assert.equal(plan.series.title, "Fixture・Public Domain Author");
  assert.equal(plan.episodes.length, 1);
  assert.equal(plan.episodes[0]?.posting_status, "draft");
  assert.equal(plan.episodes[0]?.is_published, false);
  assert.equal(plan.episodes[0]?.posted_at, null);
  assert.equal(plan.episodes[0]?.scheduled_for, null);
}

function testKoreanSourceLanguage() {
  const plan = buildDraftImportPlan({
    manifest: approvedManifest({
      id: "fixture-ko",
      original_language: "ko",
      source_file: "public-domain/sources/raw/fixture-ko.txt",
    }),
    artifact: artifact({ manifestId: "fixture-ko" }),
    officialUserId: "official-user-id",
  });
  assert.equal(plan.series.source_language, "ko");
}

function testAozoraConservativeCandidatePolicy() {
  assert.equal(canonicalAozoraIdentityPart(" 虞 美人草・"), "虞美人草");

  const baseRow = {
    "作品ID": "12345",
    "作品名": "Fixture Classic",
    "作品著作権フラグ": "なし",
    "図書カードURL": "https://www.aozora.gr.jp/cards/000001/card12345.html",
    "姓": "Fixture ",
    "名": "Author",
    "没年月日": "1920-01-01",
    "人物著作権フラグ": "なし",
    "役割フラグ": "著者",
    "初出": "1925（大正14）年",
    "テキストファイルURL":
      "https://www.aozora.gr.jp/cards/000001/files/12345_ruby_1.zip",
    "テキストファイル符号化方式": "ShiftJIS",
    "底本名1": "Fixture Edition",
    "底本初版発行年1": "1925（大正14）年",
  };
  const eligible = classifyAozoraWork([baseRow]);
  assert.equal(eligible.eligible, true);
  assert.equal(eligible.authorDeathYear, 1920);
  assert.equal(eligible.firstPublicationYear, 1925);

  const pending = makePendingAozoraManifest(eligible);
  assert.equal(pending.rights_status, "pending");
  assert.equal(pending.approved, false);
  assert.equal(pending.import_status, "not_imported");

  assert.equal(
    classifyAozoraWork([{ ...baseRow, "没年月日": "1960-01-01" }]).eligible,
    false
  );
  assert.equal(
    classifyAozoraWork([{ ...baseRow, "初出": "1931（昭和6）年" }]).eligible,
    false
  );
  assert.equal(
    classifyAozoraWork([{ ...baseRow, "役割フラグ": "翻訳者" }]).eligible,
    false
  );
  assert.equal(
    isAllowedAozoraTextUrl(
      "https://www.aozora.gr.jp/cards/000001/files/12345_ruby_1.zip"
    ),
    true
  );
  assert.equal(
    isAllowedAozoraTextUrl(
      "https://evil.example/cards/000001/files/12345_ruby_1.zip"
    ),
    false
  );

  assert.equal(
    isAllowedGutenbergTextUrl(
      "https://www.gutenberg.org/cache/epub/11/pg11.txt"
    ),
    true
  );
  assert.equal(
    isAllowedGutenbergTextUrl(
      "https://www.gutenberg.org/cache/epub/11/pg12.txt"
    ),
    false
  );
  assert.equal(
    isAllowedGutenbergTextUrl(
      "https://gutenberg.org/cache/epub/11/pg11.txt"
    ),
    false
  );
  assert.equal(
    isAllowedGutenbergTextUrl(
      "https://www.gutenberg.org/cache/epub/11/pg11.txt?download=1"
    ),
    false
  );
}

  const gonguLanding =
    "https://gongu.copyright.or.kr/gongu/wrt/wrt/view.do?menuNo=200030&wrtSn=9002094";
  assert.equal(gonguWorkNumberFromLandingUrl(gonguLanding), "9002094");
  assert.equal(
    isAllowedGonguTextUrl(
      "https://gongu.copyright.or.kr/gongu/wrt/cmmn/wrtFileDownload.do?wrtSn=9002094&fileSn=4",
      "9002094"
    ),
    true
  );
  assert.equal(
    isAllowedGonguTextUrl(
      "https://gongu.copyright.or.kr/gongu/wrt/cmmn/wrtFileDownload.do?wrtSn=9002094&fileSn=3",
      "9002094"
    ),
    false
  );
  assert.equal(
    isAllowedGonguTextUrl(
      "https://gongu.copyright.or.kr/gongu/wrt/cmmn/wrtFileDownload.do?wrtSn=9002100&fileSn=4",
      "9002094"
    ),
    false
  );

function testVerifiedPublicDomainDisplayMetadata() {
  const verified = readPublicDomainMetadata({
    version: 1,
    publicDomain: {
      manifestId: "fixture-ja",
      originalTitle: "Fixture",
      originalAuthor: "Fixture Author",
      firstPublicationYear: 1927,
      sourceProvider: "Fixture Provider",
      sourceUrl: "https://example.com/work",
      sourceHash:
        "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
      rightsChecked: true,
      reviewedAt: "2026-09-22T00:00:00.000Z",
      jurisdictionsReviewed: ["JP", "US", "KR"],
    },
  });
  assert.equal(verified?.originalAuthor, "Fixture Author");
  assert.equal(verified?.sourceUrl, "https://example.com/work");
  assert.deepEqual(verified?.jurisdictionsReviewed, ["JP", "US", "KR"]);

  assert.equal(
    readPublicDomainMetadata({
      publicDomain: {
        manifestId: "fixture-ja",
        originalAuthor: "Fixture Author",
        sourceProvider: "Fixture Provider",
        sourceHash:
          "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
        rightsChecked: false,
      },
    }),
    null
  );
  assert.equal(
    readPublicDomainMetadata({
      publicDomain: {
        manifestId: "fixture-ja",
        originalAuthor: "Fixture Author",
        sourceProvider: "Fixture Provider",
        sourceHash: "not-a-sha256",
        rightsChecked: true,
      },
    }),
    null
  );
}

function testExistingOfficialAuditSnapshot() {
  const snapshot = JSON.parse(
    readFileSync(
      "public-domain/audits/official-production-2026-09-22.json",
      "utf8"
    )
  ) as {
    summary: { series_count: number; episode_count: number };
    contained_titles: string[];
    known_title_aliases?: string[];
  };
  assert.equal(snapshot.summary.series_count, 37);
  assert.equal(snapshot.summary.episode_count, 437);
  assert.equal(snapshot.contained_titles.includes("走れメロス"), true);
  assert.equal(snapshot.contained_titles.includes("蜘蛛の糸"), true);
  assert.equal(snapshot.known_title_aliases?.includes("虞美人草"), true);

  const rightsAudit = JSON.parse(
    readFileSync(
      "public-domain/audits/official-rights-review-2026-09-22.json",
      "utf8"
    )
  ) as {
    summary: {
      series_count: number;
      GREEN: number;
      AMBER: number;
      RED: number;
      UNKNOWN: number;
      provenance_backfilled: number;
    };
    works: Array<{ title: string; classification: string }>;
  };
  assert.deepEqual(rightsAudit.summary, {
    series_count: 37,
    GREEN: 0,
    AMBER: 29,
    RED: 8,
    UNKNOWN: 0,
    provenance_backfilled: 0,
  });
  assert.equal(
    rightsAudit.works.some(
      (work) => work.title === "少年探偵団・江戸川乱歩" && work.classification === "RED"
    ),
    true
  );
}

function testDryRunAndNoPaidGenerationSourceGuards() {
  const runtime = readFileSync("scripts/public-domain/runtime.ts", "utf8");
  const importer = readFileSync("scripts/public-domain/import.ts", "utf8");
  const core = readFileSync("scripts/public-domain/core.ts", "utf8");
  const batch = readFileSync("scripts/public-domain/batch.ts", "utf8");
  const sourceSync = readFileSync("scripts/public-domain/source-sync.ts", "utf8");

  const dryRunReturn = runtime.indexOf("if (!args.execute)");
  const adminCreation = runtime.lastIndexOf("const admin = createAdminClient()");
  assert.ok(
    dryRunReturn >= 0 && adminCreation > dryRunReturn,
    "dry-run must return before creating a database admin client"
  );

  assert.equal(importer.includes("--author-id"), true);
  assert.equal(runtime.includes("isOfficialAccountEmail"), true);
  assert.equal(runtime.includes("OFFICIAL_ACCOUNT_EMAIL"), true);
  assert.equal(runtime.includes("PUBLIC_DOMAIN_IMPORT_TARGET"), true);
  assert.equal(runtime.includes(".range(from, from + pageSize - 1)"), true);
  assert.equal(runtime.includes('.from("series")'), true);
  assert.equal(runtime.includes(".insert(plan.series)"), true);
  assert.equal(runtime.includes('.from("episodes")'), true);
  assert.equal(runtime.includes(".insert(episodeRows)"), true);
  assert.equal(batch.includes("--all-approved"), true);
  assert.equal(batch.includes("--author-id"), true);
  assert.equal(sourceSync.includes("isAllowedAozoraTextUrl"), true);
  assert.equal(sourceSync.includes("isAllowedGutenbergTextUrl"), true);
  assert.equal(sourceSync.includes("isAllowedGonguTextUrl"), true);
  assert.equal(sourceSync.includes('redirect: "error"'), true);

  const combined = `${runtime}\n${importer}\n${core}\n${batch}\n${sourceSync}`;
  for (const forbidden of [
    "episode_translations",
    "generated-story-translations",
    "OpenAI",
    "consumeCredit",
    "consumeAllowance",
    "reserveAi",
  ]) {
    assert.equal(
      combined.includes(forbidden),
      false,
      `Public Domain importer must not contain paid translation/generation path: ${forbidden}`
    );
  }
}

function main() {
  testPendingAndApprovedGates();
  testApprovedManifestRequiresAuditMetadata();
  testSourceHash();
  testDuplicateDetection();
  testChapterValidationAndSingleEpisode();
  testParagraphChunkSplitFixture();
  testHeadingSplitFixture();
  testHeadingSplitCanDropProviderFrontMatter();
  testAozoraAndGutenbergNormalization();
  testPreparedArtifactAndDraftPlan();
  testKoreanSourceLanguage();
  testAozoraConservativeCandidatePolicy();
  testVerifiedPublicDomainDisplayMetadata();
  testExistingOfficialAuditSnapshot();
  testDryRunAndNoPaidGenerationSourceGuards();
  console.log(
    "PASS: Public Domain rights gate, verified public metadata display gate, conservative source policy, safe paragraph chunking, content taxonomy/narration Draft plan, hash/idempotency, and non-paid ingestion"
  );
}

main();
