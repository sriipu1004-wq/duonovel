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
    tags: ["fixture"],
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
  assert.equal(plan.series.source_language, "ja");
  assert.equal(plan.series.translation_permission_mode, "closed");
  assert.equal(plan.series.recording_permission_mode, "closed");
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

function testDryRunAndNoPaidGenerationSourceGuards() {
  const runtime = readFileSync("scripts/public-domain/runtime.ts", "utf8");
  const importer = readFileSync("scripts/public-domain/import.ts", "utf8");
  const core = readFileSync("scripts/public-domain/core.ts", "utf8");

  const dryRunReturn = runtime.indexOf("if (!args.execute)");
  const adminCreation = runtime.lastIndexOf("const admin = createAdminClient()");
  assert.ok(
    dryRunReturn >= 0 && adminCreation > dryRunReturn,
    "dry-run must return before creating a database admin client"
  );

  assert.equal(importer.includes("--author-id"), true);
  assert.equal(runtime.includes("isOfficialAccountEmail"), true);
  assert.equal(runtime.includes("OFFICIAL_ACCOUNT_EMAIL"), true);
  assert.equal(runtime.includes('.from("series").insert(plan.series)'), true);
  assert.equal(runtime.includes('.from("episodes").insert(episodeRows)'), true);

  const combined = `${runtime}\n${importer}\n${core}`;
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
  testHeadingSplitFixture();
  testAozoraAndGutenbergNormalization();
  testPreparedArtifactAndDraftPlan();
  testKoreanSourceLanguage();
  testDryRunAndNoPaidGenerationSourceGuards();
  console.log(
    "PASS: Public Domain rights gate, hash/idempotency, normalization, chapter split, Draft-only plan, Official identity guard, and non-paid ingestion"
  );
}

main();
