import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { assertExactDraftEpisodeInsert, assertDraftRollbackConfirmed } from "./public-domain/import-integrity";
import {
  assertImportable,
  assertPreparedArtifactMatchesRawSource,
  buildDraftImportPlan,
  chapterPlanSha256,
  isDuplicatePublicDomainSeries,
  normalizeSource,
  normalizationOptionsFor,
  type GutenbergBodyOptions,
  prepareArtifact,
  sha256Bytes,
  splitChapters,
  validateChapters,
  validateManifest,
  type PreparedArtifact,
  type PublicDomainManifest,
} from "./public-domain/core";
import {
  detectViolenceCues,
  violenceAdvisoryLines,
} from "./public-domain/content-warnings";
import {
  canonicalAozoraIdentityPart,
  classifyAozoraWork,
  isAllowedAozoraTextUrl,
  makePendingAozoraManifest,
} from "./public-domain/aozora";
import {
  AOZORA_COUNTRY_LIMITED_BASE_ALLOWED_COUNTRIES,
  aozoraCountryLimitedRegionRestriction,
} from "./public-domain/aozora";
import {
  buildRegionPublishSql,
  regionPublishTargetFromManifest,
} from "./public-domain/region-publish-sql";
import {
  gutenbergArchiveDir,
  gutenbergBodyBetweenMarkers,
  gutenbergMirrorUrls,
  gutenbergRdfDeclaresUsPublicDomain,
  isAllowedGutenbergTextUrl,
} from "./public-domain/gutenberg";
import {
  chooseGonguTxtSourceFromPopupHtml,
  detectGonguTextEncoding,
  gonguDownloadPopupUrlFromLandingUrl,
  gonguWorkNumberFromLandingUrl,
  isAllowedGonguTextUrl,
} from "./public-domain/gongu";
import { readPublicDomainMetadata } from "../src/lib/publicDomainMetadata";
import { auditPreparedAozoraAnnotationFidelity, classifyAozoraAnnotation } from "./public-domain/aozora-annotation-fidelity";
import { selectExactJapaneseProbes, publicJaExactProbeSql } from "./public-domain/prose-duplicate-probes";
import { auditAozoraEditionCollisions } from "./public-domain/aozora-edition-collisions";

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
    content_warnings: [],
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

function testPreparedArtifactIsBoundToRawBytes() {
  const raw = new TextEncoder().encode("abc");
  const manifest = approvedManifest({ source_hash: sha256Bytes(raw) });
  const prepared = prepareArtifact({ manifest, rawBytes: raw, preparedAt: "2026-10-21T00:00:00.000Z" });
  assert.equal(prepared.chapters.length, 1);
  assert.doesNotThrow(() => assertPreparedArtifactMatchesRawSource(manifest, prepared, raw));
  assert.doesNotThrow(() => assertPreparedArtifactMatchesRawSource(
    manifest, { ...prepared, preparedAt: "2026-10-22T00:00:00.000Z" }, raw
  ), "An incidental preparation timestamp must not change source identity");

  // Changing body characters while retaining the forged/copied raw SHA and
  // chapter count must not let a different literary text enter a Draft.
  assert.throws(() => assertPreparedArtifactMatchesRawSource(manifest, {
    ...prepared,
    chapters: prepared.chapters.map(c => ({ ...c, body: "abd" })),
  }, raw), /SOURCE_PREPARATION_MISMATCH: chapter 1/u);
  assert.throws(() => assertPreparedArtifactMatchesRawSource(manifest, {
    ...prepared,
    chapters: prepared.chapters.map(c => ({ ...c, title: "Forged" })),
  }, raw), /SOURCE_PREPARATION_MISMATCH: chapter 1/u);
  assert.throws(() => assertPreparedArtifactMatchesRawSource(manifest, {
    ...prepared,
    chapters: prepared.chapters.map(c => ({ ...c, number: 2 })),
  }, raw), /SOURCE_PREPARATION_MISMATCH: chapter 1/u);
  assert.throws(() => assertPreparedArtifactMatchesRawSource(manifest, {
    ...prepared,
    chapters: prepared.chapters.map(c => ({ ...c, characterCount: 4 })),
  }, raw), /SOURCE_PREPARATION_MISMATCH: chapter 1/u);
  assert.throws(() => assertPreparedArtifactMatchesRawSource(manifest, {
    ...prepared,
    normalizationProfile: "aozora",
  }, raw), /SOURCE_PREPARATION_MISMATCH: normalizationProfile/u);
  assert.throws(() => assertPreparedArtifactMatchesRawSource(manifest, {
    ...prepared, warnings: ["operator silently edited file"],
  }, raw), /SOURCE_PREPARATION_MISMATCH: normalization audit/u);
  assert.throws(() => assertPreparedArtifactMatchesRawSource(
    manifest, prepared, new TextEncoder().encode("abd")
  ), /SOURCE_RAW_HASH_MISMATCH/u);
  assert.throws(() => assertPreparedArtifactMatchesRawSource(
    { ...manifest, source_hash: null }, prepared, raw
  ), /SOURCE_RAW_HASH_MISMATCH/u);
  assert.throws(() => assertPreparedArtifactMatchesRawSource(
    { ...manifest, chapter_split: { strategy: "heading_regex", heading_pattern: "^abc$" } },
    prepared,
    raw
  ), /SOURCE_PREPARATION_MISMATCH/u);

  // Human rights acceptance remains separate: exact raw-byte match does not
  // import a manifest that still has pending rights.
  assert.throws(() => assertImportable({ ...manifest, rights_status: "pending", approved: false }, prepared),
    /RIGHTS_NOT_APPROVED/u);
}

function testDraftInsertConfirmationAndRollback() {
  const seriesId = "11111111-1111-4111-8111-111111111111";
  const make = (number: number, id: string) => ({
    id, series_id: seriesId, episode_number: number,
    posting_status: "draft", is_published: false,
  });
  const valid = [make(2, "episode-2"), make(1, "episode-1")];
  assert.doesNotThrow(() => assertExactDraftEpisodeInsert([1, 2], seriesId, valid));
  assert.throws(() => assertExactDraftEpisodeInsert([1, 2], seriesId, null),
    /DRAFT_EPISODE_COUNT_MISMATCH/u);
  assert.throws(() => assertExactDraftEpisodeInsert([1, 2], seriesId, [valid[0]!]),
    /DRAFT_EPISODE_COUNT_MISMATCH/u);
  assert.throws(() => assertExactDraftEpisodeInsert([1, 2], seriesId, [
    make(1, "same"), make(2, "same"),
  ]), /DRAFT_EPISODE_RESPONSE_MISMATCH/u);
  assert.throws(() => assertExactDraftEpisodeInsert([1, 2], seriesId, [
    make(1, "a"), make(1, "b"),
  ]), /DRAFT_EPISODE_RESPONSE_MISMATCH/u);
  assert.throws(() => assertExactDraftEpisodeInsert([1, 2], seriesId, [
    make(1, "a"), { ...make(2, "b"), series_id: "wrong" },
  ]), /DRAFT_EPISODE_RESPONSE_MISMATCH/u);
  assert.throws(() => assertExactDraftEpisodeInsert([1, 2], seriesId, [
    make(1, "a"), { ...make(2, "b"), posting_status: "posted" },
  ]), /DRAFT_EPISODE_RESPONSE_MISMATCH/u);
  assert.throws(() => assertExactDraftEpisodeInsert([1, 2], seriesId, [
    make(1, "a"), { ...make(2, "b"), is_published: true },
  ]), /DRAFT_EPISODE_RESPONSE_MISMATCH/u);
  assert.throws(() => assertExactDraftEpisodeInsert([1, 1], seriesId, valid),
    /DRAFT_INSERT_EXPECTATION_INVALID/u);

  assert.doesNotThrow(() => assertDraftRollbackConfirmed([{ id: seriesId }], seriesId));
  assert.throws(() => assertDraftRollbackConfirmed([], seriesId), /DRAFT_ROLLBACK_UNVERIFIED/u);
  assert.throws(() => assertDraftRollbackConfirmed(null, seriesId), /DRAFT_ROLLBACK_UNVERIFIED/u);
  assert.throws(() => assertDraftRollbackConfirmed([{ id: "other" }], seriesId),
    /DRAFT_ROLLBACK_UNVERIFIED/u);
  assert.throws(() => assertDraftRollbackConfirmed([{ id: seriesId }, { id: "other" }], seriesId),
    /DRAFT_ROLLBACK_UNVERIFIED/u);
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

function testVerbatimPublicDomainDuplicateProbes() {
  const sample = [
    "あ".repeat(30),
    "｜漢字《かんじ》",
    "い".repeat(30),
    "［＃「字」は底本では「文字」］",
    "う".repeat(30),
  ].join("\n");
  const probes = selectExactJapaneseProbes("aozora-000195", [{ body: sample }]);
  assert.equal(probes.length, 3);
  assert.deepEqual(probes.map((item) => item.characterCount), [24, 24, 24]);
  assert.deepEqual(
    probes.map((item) => item.phrase),
    ["あ".repeat(24), "い".repeat(24), "う".repeat(24)]
  );
  assert.equal(probes.every((item) => sample.includes(item.phrase)), true);
  assert.equal(probes.every((item) => item.phraseSha256.length === 64), true);

  const rubyDenseSource = ["甲".repeat(19), "乙".repeat(19), "丙".repeat(19)].join("《ルビ》");
  const denseProbes = selectExactJapaneseProbes(
    "aozora-053520", [{ body: rubyDenseSource }]
  );
  assert.deepEqual(
    denseProbes.map((item) => item.characterCount),
    [16, 16, 16]
  );
  assert.equal(denseProbes.every((item) => rubyDenseSource.includes(item.phrase)), true);
  const sql = publicJaExactProbeSql([...probes, ...denseProbes]);
  assert.equal(sql.includes("s.source_language = 'ja'"), true);
  assert.equal(sql.includes("e.posting_status = 'posted'"), true);
  assert.equal(sql.includes("WHERE s.is_public IS TRUE"), true);
  assert.equal(sql.includes("eligible_ja_episodes"), true);
  assert.equal(sql.includes("UPDATE public."), false);
  assert.equal(sql.includes("INSERT INTO"), false);
  assert.throws(
    () => selectExactJapaneseProbes("aozora-invalid", [{ body: sample }]),
    /INVALID_EXACT_PROBE_SOURCE/
  );
  assert.throws(
    () => selectExactJapaneseProbes("aozora-000195", [{ body: "｜漢《かん》" }]),
    /EXACT_PROBE_TOO_FEW_RAW_CONTIGUOUS_SPANS/
  );
}


function testAozoraEditionCollisionPreflight() {
  const mk = (id: string, title: string, author: string, role = "著者") => ({
    "作品ID": id,
    "作品名": title,
    "図書カードURL": `https://www.aozora.gr.jp/cards/000129/card${Number(id)}.html`,
    "役割フラグ": role,
    "姓": author,
    "名": "",
  });
  const rows = [
    mk("000692", "高瀬舟", "森鴎外"),
    mk("000691", "高瀬舟", "森鴎外"),
    mk("045245", "高瀬舟", "森鴎外"),
    mk("000692", "高瀬舟", "外部翻訳者", "翻訳者"),
    mk("000321", "二老人", "国木田独歩"),
    mk("009001", "同名の作品", "作家A"),
    mk("009002", "同名の作品", "作家B"),
  ];
  const selected = [
    { id: "aozora-000692", original_title: "高瀬舟", original_author: "森鴎外", source_url: "https://www.aozora.gr.jp/cards/000129/card692.html" },
    { id: "aozora-000321", original_title: "二老人", original_author: "国木田独歩", source_url: "https://www.aozora.gr.jp/cards/000129/card321.html" },
    { id: "aozora-009001", original_title: "同名の作品", original_author: "作家A", source_url: "https://www.aozora.gr.jp/cards/000129/card9001.html" },
  ];
  const findings = auditAozoraEditionCollisions(rows, selected);
  assert.equal(findings.length, 3);
  assert.equal(findings[0]?.status, "SAME_AUTHOR_MULTIPLE_EDITIONS");
  assert.equal(findings[0]?.sameTitleCardCount, 3);
  assert.equal(findings[0]?.sameAuthorSameTitleCardCount, 3);
  assert.deepEqual(findings[0]?.otherEditionCardIds, ["000691", "045245"]);
  assert.equal(findings[1]?.status, "UNIQUE");
  assert.equal(findings[2]?.status, "SAME_TITLE_OTHER_AUTHOR");
  assert.deepEqual(findings[2]?.distinctAuthorCardIds, ["009002"]);
  assert.equal(
    auditAozoraEditionCollisions(rows, [
      { ...selected[0]!, source_url: "https://www.aozora.gr.jp/cards/000129/card999.html" }
    ])[0]?.status, "SOURCE_CARD_MISMATCH"
  );
  assert.throws(() => auditAozoraEditionCollisions(rows, [selected[0]!, selected[0]!]),
    /AOZORA_EDITION_DUPLICATE_MANIFEST/u);
  assert.throws(() => auditAozoraEditionCollisions(rows, [
    { ...selected[0]!, id: "aozora-not-numeric" }
  ]), /AOZORA_EDITION_MANIFEST_INVALID/u);
}

function testAozoraAnnotationFidelityPreflight() {
  const source = [
    "本文［＃「本文」に傍点］",
    "校訂［＃「校訂」は底本では「原本」］",
    "外字※［＃「文字」、第4水準2-89-1］",
    "読仮［＃ルビの「よみ」はママ］",
    "［＃ここから３字下げ］段落［＃ここで字下げ終わり］",
    "［＃未知の指示］",
  ].join("\n");
  const prepared = artifact({
    chapters: [{ number: 1, title: "Fixture", body: source, characterCount: source.length }],
  });
  const report = auditPreparedAozoraAnnotationFidelity(prepared);
  assert.equal(report.originalAnnotationCount, 7);
  assert.equal(report.removedByRuntimeNormalization, 2);
  assert.equal(report.remainingAfterRuntimeNormalization, 5);
  assert.deepEqual(report.remainingByCategory, {
    layout: 0,
    emphasis: 1,
    edition_variant: 1,
    gaiji: 1,
    ruby_note: 1,
    unclassified: 1,
  });
  assert.equal(report.unclassifiedAnnotationsRemain, true);
  assert.equal(report.manualReaderFidelityReviewRequired, true);
  assert.equal(classifyAozoraAnnotation("ここから３字下げ"), "layout");
  assert.equal(classifyAozoraAnnotation("未知の形式"), "unclassified");

  const plain = auditPreparedAozoraAnnotationFidelity(artifact({
    chapters: [{ number: 1, title: "Plain", body: "No markup", characterCount: 9 }],
  }));
  assert.equal(plain.originalAnnotationCount, 0);
  assert.equal(plain.manualReaderFidelityReviewRequired, false);
}

function testAozoraReaderBodyOptIn() {
  const marker = "\u3010\u30c6\u30ad\u30b9\u30c8\u4e2d\u306b\u73fe\u308c\u308b\u8a18\u53f7\u306b\u3064\u3044\u3066\u3011";
  const separator = "-".repeat(55);
  const fixture = ["Test Title", "Test Author", "", separator, marker,
    "Ruby notation example", separator, "", "Original story body",
    "", "Second paragraph"].join("\n");
  const cleaned = normalizeSource(fixture, "aozora_reader_body");
  assert.equal(cleaned.displayText, "Original story body\n\nSecond paragraph");
  assert.equal(cleaned.archiveMetadata.includes(marker), true);
  assert.equal(cleaned.archiveMetadata.includes("Test Title"), true);
  assert.equal(normalizeSource(fixture, "aozora").displayText.includes(marker), true);
  assert.throws(() => normalizeSource("Unknown body format", "aozora_reader_body"),
    /AOZORA_READER_FRONT_MATTER_UNRECOGNIZED/);
}

function testAozoraBodyProfile() {
  const marker = "【テキスト中に現れる記号について】";
  const separator = "-".repeat(55);
  // Three header lines (title, subtitle, author), as in some Aozora texts.
  const fixture = ["Test Title", "Subtitle", "Test Author", "", separator, marker,
    "Ruby notation example", separator, "", "Original story body",
    "", "Second paragraph"].join("\n");
  const cleaned = normalizeSource(fixture, "aozora_body");
  assert.equal(cleaned.displayText, "Original story body\n\nSecond paragraph");
  assert.equal(cleaned.archiveMetadata.includes(marker), true);
  assert.equal(cleaned.archiveMetadata.includes("Subtitle"), true);
  // A text without the legend keeps its body unchanged (no throw).
  const noLegend = "Test Title\nTest Author\n\nBody only";
  assert.equal(normalizeSource(noLegend, "aozora_body").displayText, noLegend);
  // A legend that does not match the header shape (5 header lines here) is
  // refused rather than left in the Reader body.
  assert.throws(
    () => normalizeSource(["1", "2", "3", "4", "5", "", separator, marker, "x", separator, "", "Body"].join("\n"), "aozora_body"),
    /AOZORA_BODY_FRONT_MATTER_UNRECOGNIZED/
  );
  // A legend with nothing after it is refused rather than imported empty.
  assert.throws(
    () => normalizeSource(["T", "A", "", separator, marker, "x", separator].join("\n"), "aozora_body"),
    /AOZORA_BODY_EMPTY_AFTER_FRONT_MATTER/
  );
  // The legacy "aozora" profile is unchanged.
  assert.equal(normalizeSource(fixture, "aozora").displayText.includes(marker), true);
}

function testGutenbergBodyProfileAndPublicAttribution() {
  const wrap = (body: string) =>
    [
      "The Project Gutenberg eBook of Fixture",
      "*** START OF THE PROJECT GUTENBERG EBOOK FIXTURE ***",
      body,
      "*** END OF THE PROJECT GUTENBERG EBOOK FIXTURE ***",
      "License footer",
    ].join("\n");
  const gb = (body: string, options?: Partial<GutenbergBodyOptions>) =>
    normalizeSource(wrap(body), "gutenberg_body", {
      gutenbergBody: options
        ? { remove_paragraphs: [], remove_tail_from: null, allowed_markers: [], ...options }
        : undefined,
    });
  // Volunteer credits (names only, or naming PGDP/a URL) among the first
  // paragraphs move to archive metadata; a whitespace-only line separates
  // paragraphs like an empty one.
  const cleaned = gb(
    "Produced by David Reed, Ken Reeder, and David Widger\n \nE-text prepared by Judith Boss and the Online Distributed\nProofreading Team at https://www.pgdp.net\n\t\nCHAPTER I\n\nBody text."
  );
  assert.equal(cleaned.displayText, "CHAPTER I\n\nBody text.");
  assert.equal(cleaned.archiveMetadata.includes("Produced by David Reed"), true);
  assert.equal(cleaned.archiveMetadata.includes("E-text prepared by Judith Boss"), true);
  assert.equal(cleaned.archiveMetadata.includes("License footer"), true);
  // Prose that merely starts like a credit is kept.
  const prose = "Produced by the hand of fate, the boy walked into the town before dawn.";
  assert.equal(gb(`${prose}\n\nBody.`).displayText, `${prose}\n\nBody.`);
  // A credit-like paragraph after the first 3 paragraphs, or a very long one, is kept.
  assert.equal(
    gb("Title\n\nBy Someone\n\nContents\n\nProduced by David Reed\n\nBody.").displayText.includes("Produced by David Reed"),
    true
  );
  assert.equal(
    gb(`Produced by ${"Name ".repeat(90)}\n\nBody.`).displayText.startsWith("Produced by"),
    true
  );
  // Trailing sign-off, also when wrapped onto two lines; inner spacing is kept.
  const signedOff = gb("CHAPTER I\n\n\n\nBody.\n\n\nEnd of Project Gutenberg's Fixture, by\nSomeone Else");
  assert.equal(signedOff.displayText, "CHAPTER I\n\n\n\nBody.");
  assert.equal(signedOff.archiveMetadata.includes("End of Project Gutenberg's Fixture"), true);
  assert.equal(gb("Body.\n\n*Project Gutenberg Etext of Fixture, by Someone*").displayText, "Body.");
  // A body without credits is unchanged.
  assert.equal(gb("CHAPTER I\n\nBody.").displayText, "CHAPTER I\n\nBody.");
  // A remaining provider name or URL anywhere in the body stops preparation,
  // including scheme-less PG hosts.
  for (const leftover of [
    "This came from Project Gutenberg.",
    "See https://example.org/ for notes.",
    "Visit www.gutenberg.net for more.",
    "Mirror at gutenberg.org today.",
    "Old site promo.net/pg had it.",
  ]) {
    assert.throws(() => gb(`CHAPTER I\n\n${leftover}`), /GUTENBERG_BODY_PROVIDER_REFERENCE/, leftover);
  }
  // Transcriber/production notes and later-printing imprint wording stop
  // preparation unless removed or explicitly allowed.
  for (const leftover of [
    "Transcriber's Note: spelling kept.",
    "Appendix: Production notes for eBook edition 11",
    "[Note: This etext was transcribed from an American edition of 1911.]",
    "_All rights reserved_",
    "COPYRIGHT, 1925, BY X. RENEWED BY Y",
    "_Copyright_, _London_, 1904",
    "PRINTED IN GREAT BRITAIN BY R. CLAY",
    "First published 1902",
  ]) {
    assert.throws(() => gb(`CHAPTER I\n\nBody.\n\n${leftover}`), /GUTENBERG_BODY_EDITORIAL_MARKER/, leftover);
  }
  // Ordinary words are not markers.
  assert.equal(gb("He made a pretext; the copyrighted song was renewed.").displayText.length > 0, true);
  // Manifest-listed paragraphs (exact starts, line breaks compared as spaces)
  // and a tail section are moved out; an allowed passage passes.
  const trimmed = gb(
    "TITLE\n\nCOPYRIGHT, 1925, BY HARCOURT,\nBRACE. RENEWED BY L. W.\n\nWARNE\n\nWARNE\n\nCHAPTER I\n\nHe said the book was first published\nin March.\n\nTHE END\n\nTranscriber's note\n\nPage 159: changed.",
    {
      remove_paragraphs: ["COPYRIGHT, 1925, BY HARCOURT, BRACE", "WARNE", "WARNE"],
      remove_tail_from: "Transcriber",
      allowed_markers: ["the book was first published in March"],
    }
  );
  assert.equal(
    trimmed.displayText,
    "TITLE\n\nCHAPTER I\n\nHe said the book was first published\nin March.\n\nTHE END"
  );
  assert.equal(trimmed.archiveMetadata.includes("RENEWED BY L. W."), true);
  assert.equal(trimmed.archiveMetadata.includes("Page 159: changed."), true);
  // A listed start that is missing, or matches a different number of
  // paragraphs, stops preparation; so does an allowed passage that is absent.
  assert.throws(() => gb("CHAPTER I\n\nBody.", { remove_paragraphs: ["COPYRIGHT 1999"] }), /GUTENBERG_BODY_TRIM_NOT_FOUND/);
  assert.throws(() => gb("WARNE\n\nWARNE\n\nBody.", { remove_paragraphs: ["WARNE"] }), /GUTENBERG_BODY_TRIM_NOT_FOUND/);
  assert.throws(() => gb("CHAPTER I\n\nBody.", { remove_tail_from: "Transcriber" }), /GUTENBERG_BODY_TRIM_NOT_FOUND/);
  assert.throws(() => gb("CHAPTER I\n\nBody.", { allowed_markers: ["not in the body"] }), /GUTENBERG_BODY_ALLOWED_MARKER_NOT_FOUND/);
  // Credits only, or no START/END markers, are refused.
  assert.throws(() => gb("Produced by A"), /GUTENBERG_BODY_EMPTY_AFTER_CREDITS/);
  assert.throws(() => normalizeSource("Body without markers", "gutenberg_body"), /GUTENBERG_BODY_BOUNDARY_NOT_CONFIRMED/);
  // The legacy "gutenberg" profile keeps credit lines in the body.
  assert.equal(
    normalizeSource(wrap("Produced by A\n\nBody."), "gutenberg").displayText.startsWith("Produced by A"),
    true
  );
  // The manifest field is validated and only allowed with gutenberg_body.
  const withTrim = approvedManifest({
    normalization_profile: "gutenberg_body",
    public_attribution: { source_provider: "Public domain", source_url: null, edition: null },
    gutenberg_body: { remove_paragraphs: ["COPYRIGHT, 1912"], remove_tail_from: null, allowed_markers: [] },
  });
  assert.deepEqual(validateManifest(withTrim).errors, []);
  assert.deepEqual(normalizationOptionsFor(validateManifest(withTrim).manifest!), {
    gutenbergBody: { remove_paragraphs: ["COPYRIGHT, 1912"], remove_tail_from: null, allowed_markers: [] },
  });
  assert.equal(
    validateManifest({ ...withTrim, normalization_profile: "gutenberg" }).errors.some((error) =>
      error.includes("only valid with the gutenberg_body profile")
    ),
    true
  );
  assert.equal(
    validateManifest({
      ...withTrim,
      gutenberg_body: { remove_paragraphs: ["ab"], remove_tail_from: null, allowed_markers: [] },
    }).ok,
    false
  );

  const attribution = {
    source_provider: "Public domain",
    source_url: null,
    edition: "First published 1925 (New York)",
  };
  const reviewed = approvedManifest({
    normalization_profile: "gutenberg_body",
    source_provider: "Project Gutenberg",
    public_attribution: attribution,
  });
  assert.deepEqual(validateManifest(reviewed).errors, []);
  const missing = validateManifest({ ...reviewed, public_attribution: undefined });
  assert.equal(missing.errors.includes("gutenberg_body manifests require public_attribution"), true);
  const named = validateManifest({
    ...reviewed,
    public_attribution: { ...attribution, source_provider: "Project Gutenberg" },
  });
  assert.equal(named.errors.some((error) => error.includes("must not name Project Gutenberg")), true);
  const linked = validateManifest({
    ...reviewed,
    public_attribution: { ...attribution, source_url: "https://www.gutenberg.org/ebooks/1" },
  });
  assert.equal(linked.errors.some((error) => error.includes("must not name Project Gutenberg")), true);
  const tagged = validateManifest({ ...reviewed, tags: ["Project Gutenberg"] });
  assert.equal(tagged.errors.some((error) => error.includes("Project Gutenberg tag")), true);

  const plan = buildDraftImportPlan({
    manifest: validateManifest(reviewed).manifest!,
    artifact: artifact(),
    officialUserId: "official-user-id",
  });
  const publicMetadata = readPublicDomainMetadata(plan.series.effect_settings);
  assert.equal(publicMetadata?.sourceProvider, "Public domain");
  assert.equal(publicMetadata?.sourceUrl, null);
  assert.equal(publicMetadata?.edition, "First published 1925 (New York)");
  assert.equal(JSON.stringify(plan.series.effect_settings).includes("gutenberg.org"), false);
}

function testNewAozoraSourceAttributionGate() {
  const reviewed = approvedManifest({
    normalization_profile: "aozora_reader_body",
    source_provenance: {
      input_edition: "1923 first edition",
      proof_edition: "1923 tenth printing",
      input_by: "Transcriber",
      proofread_by: "Proofreader",
    },
  });
  assert.equal(validateManifest(reviewed).ok, true);
  const missing = validateManifest({ ...reviewed, source_provenance: null });
  assert.equal(missing.ok, false);
  assert.equal(
    missing.errors.some((error) => error.includes("input/proof provenance")),
    true
  );
  const malformed = validateManifest({
    ...reviewed,
    source_provenance: { ...reviewed.source_provenance, proofread_by: "" },
  });
  assert.equal(malformed.ok, false);
  const plan = buildDraftImportPlan({
    manifest: reviewed,
    artifact: artifact(),
    officialUserId: "official-user-id",
  });
  const publicMetadata = readPublicDomainMetadata(plan.series.effect_settings);
  assert.equal(publicMetadata?.edition, "Synthetic fixture");
  assert.equal(publicMetadata?.inputEdition, "1923 first edition");
  assert.equal(publicMetadata?.proofEdition, "1923 tenth printing");
  assert.equal(publicMetadata?.inputBy, "Transcriber");
  assert.equal(publicMetadata?.proofreadBy, "Proofreader");

  const legacy = readPublicDomainMetadata({
    publicDomain: {
      manifestId: "legacy",
      originalAuthor: "Original",
      sourceProvider: "Provider",
      sourceHash: reviewed.source_hash,
      rightsChecked: true,
    },
  });
  assert.equal(legacy?.edition, null);
  assert.equal(legacy?.inputBy, null);
}

function testPilotSemanticChapterSplits() {
  const scenarios = [
    { id: "aozora-000195", headings: ["１", "２", "３", "４", "５", "６", "７", "８"] },
    { id: "aozora-000204", headings: ["（一）", "（二）", "（三）", "（四）", "（五）", "（六）", "（七）"] },
    { id: "aozora-000321", headings: ["上", "下"] },
  ];
  for (const { id, headings } of scenarios) {
    const manifest = JSON.parse(
      readFileSync(`public-domain/manifests/${id}.json`, "utf8")
    ) as PublicDomainManifest;
    assert.equal(manifest.chapter_split.strategy, "heading_regex");
    assert.equal(manifest.chapter_count, headings.length);
    const fixture = headings
      .map((heading, index) => `${heading}\n${String(index + 1).repeat(250)}`)
      .join("\n\n");
    const chapters = splitChapters(fixture, manifest);
    assert.deepEqual(chapters.map((chapter) => chapter.title), headings);
    assert.deepEqual(chapters.map((chapter) => chapter.characterCount), headings.map(() => 250));
  }
}

function testAozoraNumberedHeadingDisplayTitles() {
  const first = "［＃５字下げ］一［＃「一」は中見出し］";
  const second = "［＃５字下げ］二［＃「二」は中見出し］";
  const source = [first, "First passage", second, "Second passage"].join("\n");
  const chapter_split = {
    strategy: "heading_regex" as const,
    heading_pattern: "^［＃５字下げ］[一二]［＃「[一二]」は中見出し］$",
  };
  const clean = splitChapters(source, {
    title: "Novel",
    chapter_split,
    normalization_profile: "aozora_reader_body",
  });
  assert.deepEqual(clean.map(({ title }) => title), ["一", "二"]);
  assert.deepEqual(clean.map(({ body }) => body), ["First passage", "Second passage"]);
  const original = splitChapters(source, { title: "Novel", chapter_split });
  assert.equal(original[0]?.title, first);
  assert.equal(original[1]?.title, second);
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
  assert.equal(plan.series.translation_permission_mode, "open");
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

function testGonguEncodingDetection() {
  assert.equal(
    detectGonguTextEncoding(new TextEncoder().encode("한글 UTF-8")),
    "utf-8"
  );
  assert.equal(
    detectGonguTextEncoding(new Uint8Array([0xb0, 0xa1])),
    "euc-kr"
  );
  assert.equal(
    detectGonguTextEncoding(new Uint8Array([0xff])),
    null
  );
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
    true
  );
  assert.equal(
    gonguDownloadPopupUrlFromLandingUrl(gonguLanding),
    "https://gongu.copyright.or.kr/gongu/wrt/wrt/wrtDownPopup.do?viewType=BODY&wrtSn=9002094&menuNo=200030"
  );
  const gonguPopup = [
    '//DEXT5UPLOAD.AddUploadedFile("2", "work.pdf", \'/gongu/wrt/cmmn/wrtFileDownload.do?wrtSn=9002094&fileSn=2\', \'120000\', \'\', G_UploadID) ;',
    '//DEXT5UPLOAD.AddUploadedFile("7", "work.txt", \'/gongu/wrt/cmmn/wrtFileDownload.do?wrtSn=9002094&fileSn=7\', \'25250\', \'\', G_UploadID) ;',
    'DEXT5UPLOAD.AddUploadedFile(n, "share.txt", \'\', \'907\', \'opaque\', G_UploadID) ;',
  ].join("\n");
  assert.deepEqual(
    chooseGonguTxtSourceFromPopupHtml(gonguPopup, "9002094"),
    {
      fileSn: "7",
      fileName: "work.txt",
      byteLength: 25250,
      downloadUrl:
        "https://gongu.copyright.or.kr/gongu/wrt/cmmn/wrtFileDownload.do?wrtSn=9002094&fileSn=7",
    }
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
  assert.equal(runtime.includes("assertExactDraftEpisodeInsert("), true);
  assert.equal(runtime.includes("assertDraftRollbackConfirmed(cleanup.data, seriesId)"), true);
  assert.equal(runtime.includes('select("id,series_id,episode_number,posting_status,is_published")'), true);
  assert.equal(runtime.includes('delete().eq("id", seriesId).select("id")'), true);
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

function testBlankLineSectionSplit() {
  const first = "一".repeat(3_000);
  const second = "二".repeat(9_500);
  const oversized = Array.from({ length: 30 }, () => "三".repeat(399) + "。").join("");
  const source = [first, second, oversized].join("\n\n");
  const manifest = {
    title: "Sections",
    chapter_split: { strategy: "blank_line_sections" as const },
  };
  const chapters = splitChapters(source, manifest);
  // Author sections within 10,000 characters stay whole even above the 8,000 target.
  assert.equal(chapters[0]?.body, first);
  assert.equal(chapters[1]?.body, second);
  assert.equal(chapters[1]?.characterCount, 9_500);
  // An oversized section falls back to bounded chunking, losslessly.
  assert.ok(chapters.length > 3);
  assert.equal(chapters.slice(2).map((chapter) => chapter.body).join(""), oversized);
  assert.ok(chapters.every((chapter) => chapter.characterCount <= 10_000));
  assert.deepEqual(
    chapters.map((chapter) => chapter.number),
    chapters.map((_, index) => index + 1)
  );
  assert.equal(chapters[0]?.title, "Sections — Part 1");
  // Deterministic: the same input gives the same chapter plan fingerprint.
  assert.equal(
    chapterPlanSha256(chapters),
    chapterPlanSha256(splitChapters(source, manifest))
  );
  const single = splitChapters("only one section", manifest);
  assert.equal(single.length, 1);
  assert.equal(single[0]?.title, "Sections");

  const parsed = validateManifest({
    ...approvedManifest(),
    chapter_split: { strategy: "blank_line_sections" },
  });
  assert.equal(parsed.ok, true, parsed.errors.join("\n"));
  assert.deepEqual(parsed.manifest?.chapter_split, { strategy: "blank_line_sections" });
}

function testViolenceAdvisoryIsRecommendationOnly() {
  const violent = detectViolenceCues("男は剃刀で喉を切つて自殺した。死骸が見つかつた。");
  assert.equal(violent.recommendViolence, true);
  assert.ok(violent.hits.some((hit) => hit.cue === "自殺"));
  assert.ok(violent.hits.some((hit) => hit.cue === "死体・死骸"));
  const calm = detectViolenceCues("秋の海は靜かに輝いてゐた。");
  assert.equal(calm.recommendViolence, false);
  assert.equal(calm.totalHits, 0);
  assert.equal(detectViolenceCues("He was executed; the corpse was bloody.").recommendViolence, true);
  assert.equal(detectViolenceCues("그는 자살을 생각했다").recommendViolence, true);

  // Advisory lines never quote the source text and never mutate the manifest.
  const text = "秘密の一文。彼は自殺した。";
  const manifest = approvedManifest({ content_warnings: undefined });
  const lines = violenceAdvisoryLines({
    manifestId: "fixture-ja",
    text,
    recordedWarnings: manifest.content_warnings,
  });
  assert.ok(lines.some((line) => line.includes("VIOLENCE_REVIEW_RECOMMENDED")));
  assert.ok(lines.some((line) => line.includes("import is blocked")));
  assert.ok(lines.every((line) => !line.includes("秘密の一文")));
  assert.equal(manifest.content_warnings, undefined);
  // A recorded human "none" decision is respected (keyword false positive).
  const keep = violenceAdvisoryLines({ manifestId: "x", text, recordedWarnings: [] });
  assert.ok(keep.some((line) => line.includes("false positive")));
  assert.ok(keep.every((line) => !line.includes("VIOLENCE_REVIEW_RECOMMENDED")));
}

function testContentWarningsAreHumanRecordedBeforeImport() {
  const unreviewed = approvedManifest({ content_warnings: undefined });
  assert.throws(
    () => assertImportable(unreviewed, artifact()),
    /CONTENT_WARNING_REVIEW_REQUIRED/u
  );
  assert.doesNotThrow(() => assertImportable(approvedManifest(), artifact()));
  const plan = buildDraftImportPlan({
    manifest: approvedManifest({ content_warnings: ["violence"] }),
    artifact: artifact(),
    officialUserId: "official-user-id",
  });
  assert.deepEqual(plan.series.content_warnings, ["violence"]);
  assert.deepEqual(
    buildDraftImportPlan({
      manifest: approvedManifest(),
      artifact: artifact(),
      officialUserId: "official-user-id",
    }).series.content_warnings,
    []
  );
  const omitted = { ...approvedManifest() } as Record<string, unknown>;
  delete omitted.content_warnings;
  const parsedOmitted = validateManifest(omitted);
  assert.equal(parsedOmitted.ok, true);
  assert.equal(parsedOmitted.manifest?.content_warnings, undefined);
  for (const bad of [["gore"], "violence", ["violence", "violence"]]) {
    const parsed = validateManifest({ ...approvedManifest(), content_warnings: bad });
    assert.equal(parsed.ok, false, JSON.stringify(bad));
  }
  const parsed = validateManifest({
    ...approvedManifest(),
    content_warnings: ["violence"],
    content_warning_notes: "human reading",
    content_notice_candidate: "notice",
  });
  assert.equal(parsed.ok, true, parsed.errors.join("\n"));
  assert.deepEqual(parsed.manifest?.content_warnings, ["violence"]);
  assert.equal(parsed.manifest?.content_notice_candidate, "notice");
}

function testIssue139OwnerApprovedBatch() {
  const batch = JSON.parse(
    readFileSync("public-domain/audits/issue139-p5-owner-approved-batch-2026-11-14.json", "utf8")
  ) as {
    works: Array<{
      manifest_id: string;
      source_sha256: string;
      chapter_count: number;
      chapter_plan_sha256: string;
      approved: boolean;
    }>;
  };
  const expectedWarnings: Record<string, string[] | undefined> = {
    "aozora-000692": ["violence"],
    "aozora-033200": [],
    "aozora-053520": ["violence"],
    "aozora-004386": [],
  };
  let rawChecked = 0;
  for (const work of batch.works) {
    const result = validateManifest(
      JSON.parse(readFileSync(`public-domain/manifests/${work.manifest_id}.json`, "utf8"))
    );
    assert.equal(result.ok, true, `${work.manifest_id}: ${result.errors.join("; ")}`);
    const manifest = result.manifest!;
    assert.equal(manifest.approved, work.approved);
    // Imported as private Production Drafts on 2026-11-15 (PR #197); publication is a separate step.
    assert.equal(manifest.import_status, "imported", work.manifest_id);
    assert.equal(manifest.source_hash, work.source_sha256);
    assert.equal(manifest.chapter_count, work.chapter_count);
    assert.deepEqual(manifest.content_warnings, expectedWarnings[work.manifest_id]);
    if (work.approved) {
      assert.match(manifest.reviewed_by ?? "", /owner/u);
      assert.deepEqual(manifest.jurisdictions_reviewed, ["JP", "US", "KR"]);
    }
    if (work.manifest_id === "aozora-053520") {
      assert.match(manifest.rights_notes, /作品について/u);
      assert.match(manifest.rights_basis, /end of 2019/u);
      assert.match(manifest.content_notice_candidate ?? "", /不適切と受け取られる可能性のある表現/u);
    }
    if (work.manifest_id === "aozora-033200") {
      assert.match(manifest.rights_notes, /新潮.*1915/u);
      assert.match(manifest.rights_notes, /文章世界.*1917/u);
    }
    if (work.manifest_id === "aozora-004386") {
      assert.deepEqual(manifest.chapter_split, { strategy: "blank_line_sections" });
      // Owner approved after the re-split review (button answer 2026-11-14).
      assert.equal(manifest.rights_status, "approved");
    }
    // Raw Aozora TXT files are git-ignored. When present locally, rebuild the
    // chapter plan from the pinned bytes and compare the recorded fingerprint.
    if (existsSync(manifest.source_file)) {
      const raw = readFileSync(manifest.source_file);
      const prepared = prepareArtifact({
        manifest,
        rawBytes: raw,
        preparedAt: "2026-11-14T00:00:00.000Z",
      });
      assert.equal(chapterPlanSha256(prepared.chapters), work.chapter_plan_sha256, work.manifest_id);
      assert.doesNotThrow(() => assertPreparedArtifactMatchesRawSource(manifest, prepared, raw));
      rawChecked += 1;
    }
  }
  console.log(
    rawChecked === batch.works.length
      ? `PASS: Issue #139 raw-source chapter plans reproduced for ${rawChecked} works`
      : `SKIP: Issue #139 raw-source reproduction checked ${rawChecked}/${batch.works.length} (raw TXT is git-ignored)`
  );
}

function testRegionRestrictionManifestGate() {
  const allow = {
    allowed_countries: ["JP", "GB", "KR"],
    basis: "D030 allow list fixture",
  };
  // Death <= 1945: the field may be absent.
  assert.equal(validateManifest(approvedManifest({ author_death_year: 1945 })).ok, true);
  // Approved + death after 1945 + no field: rejected.
  const missing = validateManifest(approvedManifest({ author_death_year: 1950 }));
  assert.equal(missing.ok, false);
  assert.ok(missing.errors.some((e) => e.includes("require region_restriction")));
  // A translator who died after 1945 also triggers it.
  assert.equal(
    validateManifest(
      approvedManifest({
        translator: "T",
        translator_death_year: 1960,
        translation_language: "ja",
        rights_components: {
          ...approvedManifest().rights_components,
          translation: component(),
        },
      })
    ).errors.some((e) => e.includes("require region_restriction")),
    true
  );
  // Pending manifests are not forced.
  assert.equal(
    validateManifest(
      approvedManifest({ author_death_year: 1950, approved: false, rights_status: "pending" })
    ).ok,
    true
  );
  // Allow list and block list are accepted; explicit null is refused.
  const ok = validateManifest(approvedManifest({ author_death_year: 1950, region_restriction: allow }));
  assert.equal(ok.ok, true, ok.errors.join("; "));
  assert.deepEqual(ok.manifest?.region_restriction, allow);
  assert.equal(
    validateManifest(
      approvedManifest({
        author_death_year: 1951,
        region_restriction: { blocked_countries: ["CO", "GQ"], basis: "fixture" },
      })
    ).ok,
    true
  );
  const explicitNull = validateManifest(
    approvedManifest({ author_death_year: 1947, region_restriction: null })
  );
  assert.equal(explicitNull.ok, false);
  assert.ok(explicitNull.errors.some((e) => e.includes("null is not accepted")));
  // Shape errors.
  const bad = (rr: unknown) =>
    validateManifest({ ...approvedManifest({ author_death_year: 1950 }), region_restriction: rr });
  assert.equal(bad({ allowed_countries: ["jp"], basis: "x" }).ok, false);
  assert.equal(bad({ allowed_countries: ["JPN"], basis: "x" }).ok, false);
  assert.equal(bad({ allowed_countries: ["JP", "JP"], basis: "x" }).ok, false);
  assert.equal(bad({ allowed_countries: [], basis: "x" }).ok, false);
  assert.equal(bad({ allowed_countries: ["JP"], basis: " " }).ok, false);
  assert.equal(bad({ allowed_countries: ["JP"] }).ok, false);
  assert.equal(bad({ allowed_countries: ["JP"], blocked_countries: ["US"], basis: "x" }).ok, false);
  assert.equal(bad({ allowed_countries: ["JP"], basis: "x", extra: 1 }).ok, false);
  assert.equal(bad("JP").ok, false);

  // Every manifest in the repository passes, and every approved one whose
  // author/translator died after 1945 states the field.
  const dir = "public-domain/manifests";
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".json") || name.startsWith("_")) continue;
    const raw = JSON.parse(readFileSync(`${dir}/${name}`, "utf8"));
    const result = validateManifest(raw);
    assert.equal(result.ok, true, `${name}: ${result.errors.join("; ")}`);
    if (
      raw.approved &&
      ((raw.author_death_year ?? 0) > 1945 || (raw.translator_death_year ?? 0) > 1945)
    ) {
      assert.ok(Object.prototype.hasOwnProperty.call(raw, "region_restriction"), name);
    }
  }
}

function testAozoraCountryLimitedCandidatePolicy() {
  const row = {
    "作品ID": "54321",
    "作品名": "Fixture Postwar",
    "作品著作権フラグ": "なし",
    "図書カードURL": "https://www.aozora.gr.jp/cards/000002/card54321.html",
    "姓": "Fixture",
    "名": "Postwar",
    "没年月日": "1950-01-01",
    "人物著作権フラグ": "なし",
    "役割フラグ": "著者",
    "初出": "1948（昭和23）年",
    "テキストファイルURL": "https://www.aozora.gr.jp/cards/000002/files/54321_ruby_1.zip",
    "テキストファイル符号化方式": "ShiftJIS",
    "底本名1": "Fixture Edition",
    "底本初版発行年1": "1960（昭和35）年",
  };
  const options = { minAuthorDeathYear: 1946, maxAuthorDeathYear: 1967, maxFirstPublicationYear: null };
  // Default behaviour unchanged: death 1950 / first 1948 is rejected.
  assert.equal(classifyAozoraWork([row]).eligible, false);
  const item = classifyAozoraWork([row], options);
  assert.equal(item.eligible, true, item.reasons.join("; "));
  assert.equal(classifyAozoraWork([{ ...row, "没年月日": "1945-12-31" }], options).eligible, false);
  assert.equal(classifyAozoraWork([{ ...row, "没年月日": "1968-01-01" }], options).eligible, false);
  assert.equal(classifyAozoraWork([{ ...row, "初出": "" }], options).eligible, false);
  assert.equal(classifyAozoraWork([{ ...row, "役割フラグ": "翻訳者" }], options).eligible, false);

  const pending = makePendingAozoraManifest(item, { countryLimited: true }) as unknown as {
    region_restriction: { allowed_countries: string[]; basis: string };
  };
  assert.deepEqual(pending.region_restriction.allowed_countries, [
    ...AOZORA_COUNTRY_LIMITED_BASE_ALLOWED_COUNTRIES,
  ]);
  assert.ok(pending.region_restriction.basis.includes("D030"));
  assert.ok(pending.region_restriction.basis.includes("region-research-2026-11-15b.md"));
  assert.equal(pending.region_restriction.allowed_countries.includes("US"), false);
  assert.equal(pending.region_restriction.allowed_countries.length, 41);
  assert.equal(validateManifest(pending).ok, true);
  // Default manifests do not get the field.
  const prewar = classifyAozoraWork([
    { ...row, "没年月日": "1920-01-01", "初出": "1910（明治43）年" },
  ]);
  assert.equal("region_restriction" in makePendingAozoraManifest(prewar), false);
  // IN is dropped for deaths in 1966-1967 only.
  assert.equal(aozoraCountryLimitedRegionRestriction(1965).allowed_countries.includes("IN"), true);
  assert.equal(aozoraCountryLimitedRegionRestriction(1966).allowed_countries.includes("IN"), false);
  assert.equal(aozoraCountryLimitedRegionRestriction(1967).allowed_countries.length, 40);
  assert.throws(() => aozoraCountryLimitedRegionRestriction(1945));
  assert.throws(() => aozoraCountryLimitedRegionRestriction(1968));
  assert.equal(new Set(AOZORA_COUNTRY_LIMITED_BASE_ALLOWED_COUNTRIES).size, 41);
}

function testRegionPublishSqlShape() {
  const manifest = approvedManifest({
    id: "aozora-054321",
    title: "Fixture Postwar・O'Author",
    original_author: "O'Author",
    author_death_year: 1950,
    source_provider: "Aozora Bunko",
    chapter_count: 3,
    content_warnings: ["violence"],
    region_restriction: { allowed_countries: ["JP", "GB"], basis: "D030 fixture O'basis" },
  });
  const target = regionPublishTargetFromManifest(manifest);
  assert.equal(target.mode, "allow");
  assert.equal(target.expectedEpisodes, 3);
  assert.throws(() => regionPublishTargetFromManifest({ ...manifest, region_restriction: null }));
  assert.throws(() =>
    regionPublishTargetFromManifest({ ...manifest, approved: false, rights_status: "pending" })
  );
  assert.throws(() => regionPublishTargetFromManifest({ ...manifest, content_warnings: undefined }));

  const block = regionPublishTargetFromManifest({
    ...manifest,
    id: "gongu-1",
    region_restriction: { blocked_countries: ["CO", "GQ"], basis: "b" },
  });
  const sql = buildRegionPublishSql({ tag: "fixture_tag", targets: [target, block] });
  const apply = sql.apply;
  // One transaction; restriction rows before publication.
  assert.equal(apply.match(/^begin;$/gmu)?.length, 1);
  assert.equal(apply.match(/^commit;$/gmu)?.length, 1);
  const insertAt = apply.indexOf("insert into public.series_region_restrictions");
  const publishAt = apply.indexOf("set publication_status = 'public'");
  assert.ok(insertAt > 0 && publishAt > insertAt);
  assert.ok(apply.includes("PD_REGION_FIXTURE_TAG_RESTRICTION_MISSING"));
  assert.ok(apply.includes("PD_REGION_FIXTURE_TAG_PUBLIC_WITHOUT_RESTRICTION"));
  assert.ok(
    apply.includes(
      "and exists (select 1 from public.series_region_restrictions r where r.series_id = s.id)"
    )
  );
  assert.ok(apply.includes("libread_internal.pd_region_fixture_tag_series"));
  assert.ok(apply.includes("effect_settings->'publicDomain'->>'manifestId'"));
  assert.ok(apply.includes("O''Author") && apply.includes("O''basis"));
  assert.ok(apply.includes("array['JP','GB']::text[]") && apply.includes("array['CO','GQ']::text[]"));
  assert.ok(apply.includes("<> 2 then") && apply.includes("<> 6 then"));
  // Default: restriction rows must be at least 120 s old (app cache is 60 s).
  assert.equal(apply.includes("RESTRICTION_TOO_RECENT"), true);
  assert.ok(apply.includes("interval '120 seconds'"));
  assert.equal(
    buildRegionPublishSql({ tag: "t", targets: [target], minRestrictionAgeSeconds: 0 }).apply.includes(
      "RESTRICTION_TOO_RECENT"
    ),
    false
  );
  assert.ok(
    buildRegionPublishSql({ tag: "t", targets: [target], minRestrictionAgeSeconds: 120 }).apply.includes(
      "interval '120 seconds'"
    )
  );
  // Rollback: unpublish first, then remove only rows apply.sql inserted.
  const rb = sql.rollback;
  assert.ok(
    rb.indexOf("set publication_status = t.publication_status_before") <
      rb.indexOf("delete from public.series_region_restrictions")
  );
  assert.ok(rb.includes("t.restriction_inserted"));
  assert.ok(rb.includes("drop table libread_internal.pd_region_fixture_tag_series"));
  // The restrictions-only script never publishes.
  assert.equal(sql.restrictions.includes("publication_status = 'public'"), false);
  assert.ok(sql.restrictions.includes("insert into public.series_region_restrictions"));
  assert.throws(() => buildRegionPublishSql({ tag: "Bad-Tag", targets: [target] }));
  assert.throws(() => buildRegionPublishSql({ tag: "t", targets: [target, target] }));
  assert.throws(() => buildRegionPublishSql({ tag: "t", targets: [] }));
}

function main() {
  testAozoraEditionCollisionPreflight();
  testVerbatimPublicDomainDuplicateProbes();
  testAozoraAnnotationFidelityPreflight();
  testAozoraReaderBodyOptIn();
  testAozoraBodyProfile();
  testGutenbergBodyProfileAndPublicAttribution();
  testDraftInsertConfirmationAndRollback();
  testPreparedArtifactIsBoundToRawBytes();
  testPendingAndApprovedGates();
  testApprovedManifestRequiresAuditMetadata();
  testSourceHash();
  testDuplicateDetection();
  testChapterValidationAndSingleEpisode();
  testParagraphChunkSplitFixture();
  testHeadingSplitFixture();
  testHeadingSplitCanDropProviderFrontMatter();
  testAozoraAndGutenbergNormalization();
  testPilotSemanticChapterSplits();
  testAozoraNumberedHeadingDisplayTitles();
  testNewAozoraSourceAttributionGate();
  testPreparedArtifactAndDraftPlan();
  testGonguEncodingDetection();
  testKoreanSourceLanguage();
  testAozoraConservativeCandidatePolicy();
  testVerifiedPublicDomainDisplayMetadata();
  testExistingOfficialAuditSnapshot();
  testDryRunAndNoPaidGenerationSourceGuards();
  testBlankLineSectionSplit();
  testViolenceAdvisoryIsRecommendationOnly();
  testContentWarningsAreHumanRecordedBeforeImport();
  testIssue139OwnerApprovedBatch();
  testRegionRestrictionManifestGate();
  testAozoraCountryLimitedCandidatePolicy();
  testRegionPublishSqlShape();
  // PGLAF mirror fallback (2026-11-20): archive paths, RDF rights gate, body cross-check normalization.
  assert.equal(gutenbergArchiveDir(5), "0/5");
  assert.equal(gutenbergArchiveDir(11), "1/11");
  assert.equal(gutenbergArchiveDir(64317), "6/4/3/1/64317");
  assert.deepEqual(gutenbergMirrorUrls(1837).crossCheck, [
    "https://mirrors.xmission.com/gutenberg/1/8/3/1837/1837-0.txt",
    "https://mirrors.xmission.com/gutenberg/1/8/3/1837/1837.txt",
  ]);
  assert.equal(gutenbergMirrorUrls(1837).text, "https://gutenberg.pglaf.org/cache/epub/1837/pg1837.txt");
  const pgRdf =
    '<pgterms:ebook rdf:about="ebooks/64317"><dcterms:rights>Public domain in the USA.</dcterms:rights>';
  assert.equal(gutenbergRdfDeclaresUsPublicDomain(pgRdf, 64317), true);
  assert.equal(gutenbergRdfDeclaresUsPublicDomain(pgRdf, 6431), false);
  assert.equal(
    gutenbergRdfDeclaresUsPublicDomain(pgRdf.replace("Public domain in the USA.", "Copyrighted."), 64317),
    false
  );
  const cacheCopy = [
    "header",
    "*** START OF THE PROJECT GUTENBERG EBOOK X ***",
    "Line one  ",
    "",
    "Last line.",
    "",
    "",
    "*** END OF THE PROJECT GUTENBERG EBOOK X ***",
    "license",
  ].join("\r\n");
  const archiveCopy = [
    "*** START OF THIS PROJECT GUTENBERG EBOOK X ***",
    "Line one",
    "",
    "Last line.",
    "",
    "End of the Project Gutenberg EBook of X,",
    "Complete by Y",
    "",
    "*** END OF THIS PROJECT GUTENBERG EBOOK X ***",
    "",
  ].join("\n");
  assert.equal(gutenbergBodyBetweenMarkers(cacheCopy), ["Line one", "", "Last line."].join("\n"));
  assert.equal(gutenbergBodyBetweenMarkers(archiveCopy), gutenbergBodyBetweenMarkers(cacheCopy));
  assert.notEqual(
    gutenbergBodyBetweenMarkers(archiveCopy.replace("Last line.", "Last line!")),
    gutenbergBodyBetweenMarkers(cacheCopy)
  );
  assert.equal(gutenbergBodyBetweenMarkers("no markers"), null);

  console.log(
    "PASS: Public Domain rights gate, verified public metadata display gate, conservative source policy, safe paragraph chunking, content taxonomy/narration Draft plan, hash/idempotency, and non-paid ingestion"
  );
}

main();
