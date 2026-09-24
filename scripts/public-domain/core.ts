import { createHash } from "node:crypto";

export const PUBLIC_DOMAIN_SOURCE_LANGUAGES = ["ja", "en", "ko"] as const;

// Keep imported Public Domain episodes within the same cost/reliability envelope as
// on-demand translation. Longer source chapters must be split before import.
export const PUBLIC_DOMAIN_EPISODE_TARGET_CHARACTERS = 8_000;
export const PUBLIC_DOMAIN_EPISODE_MAX_CHARACTERS = 10_000;
export type PublicDomainSourceLanguage =
  (typeof PUBLIC_DOMAIN_SOURCE_LANGUAGES)[number];

export const RIGHTS_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "needs_review",
] as const;
export type RightsStatus = (typeof RIGHTS_STATUSES)[number];

export const RIGHTS_COMPONENT_STATUSES = [
  "approved",
  "not_applicable",
  "needs_review",
  "rejected",
] as const;
export type RightsComponentStatus =
  (typeof RIGHTS_COMPONENT_STATUSES)[number];

export const IMPORT_STATUSES = [
  "not_imported",
  "prepared",
  "imported",
  "blocked",
] as const;
export type ImportStatus = (typeof IMPORT_STATUSES)[number];

export const NORMALIZATION_PROFILES = [
  "plain",
  "aozora",
  "gutenberg",
  "standard_ebooks",
  "gongu_madang",
] as const;
export type NormalizationProfile =
  (typeof NORMALIZATION_PROFILES)[number];

export const SOURCE_ENCODINGS = ["utf-8", "shift_jis", "euc-kr"] as const;
export type SourceEncoding = (typeof SOURCE_ENCODINGS)[number];

export type RightsComponentReview = {
  status: RightsComponentStatus;
  basis: string;
  notes: string;
};

export type RightsComponents = {
  original_work: RightsComponentReview;
  edition: RightsComponentReview;
  translation: RightsComponentReview;
  editorial: RightsComponentReview;
  annotations: RightsComponentReview;
  illustrations: RightsComponentReview;
  cover: RightsComponentReview;
  digitization: RightsComponentReview;
  provider_terms: RightsComponentReview;
};

export type ChapterSplitConfig =
  | { strategy: "single" }
  | {
      strategy: "heading_regex";
      heading_pattern: string;
      drop_prefix_before_first_heading?: boolean;
    }
  | {
      strategy: "paragraph_chunks";
      max_characters: number;
    };

export type PublicDomainManifest = {
  id: string;
  title: string;
  original_title: string | null;
  original_author: string;
  author_death_year: number | null;
  original_language: PublicDomainSourceLanguage;
  first_publication_year: number | null;

  source_provider: string;
  source_url: string;
  source_download_url: string | null;
  source_file: string;
  source_retrieved_at: string | null;
  source_encoding: SourceEncoding;
  normalization_profile: NormalizationProfile;

  edition: string | null;
  edition_publication_year: number | null;

  translator: string | null;
  translator_death_year: number | null;
  translation_language: PublicDomainSourceLanguage | null;

  rights_status: RightsStatus;
  rights_basis: string;
  rights_notes: string;
  rights_components: RightsComponents;
  jurisdictions_reviewed: string[];

  reviewed_at: string | null;
  reviewed_by: string | null;

  chapter_count: number | null;
  chapter_split: ChapterSplitConfig;
  genres?: string[];
  tags: string[];

  source_hash: string | null;

  approved: boolean;
  import_status: ImportStatus;

  cover_source: string | null;
  cover_rights_status: RightsComponentStatus | null;
};

export type ManifestValidationResult = {
  ok: boolean;
  errors: string[];
  warnings: string[];
  manifest: PublicDomainManifest | null;
};

export type NormalizationResult = {
  displayText: string;
  archiveMetadata: string;
  changes: string[];
  warnings: string[];
};

export type PreparedChapter = {
  number: number;
  title: string;
  body: string;
  characterCount: number;
};

export type ChapterValidation = {
  fatals: string[];
  warnings: string[];
};

export type PreparedArtifact = {
  version: 1;
  manifestId: string;
  sourceHash: string;
  preparedAt: string;
  normalizationProfile: NormalizationProfile;
  rawCharacterCount: number;
  displayCharacterCount: number;
  archiveMetadataCharacterCount: number;
  normalizationChanges: string[];
  warnings: string[];
  chapters: PreparedChapter[];
};

export type DraftSeriesRow = {
  title: string;
  author_id: string;
  publication_status: "private";
  is_public: false;
  source_language: PublicDomainSourceLanguage;
  translation_permission_mode: "open";
  recording_permission_mode: "open";
  genres: string[];
  tags: string[];
  effect_settings: Record<string, unknown>;
};

export type DraftEpisodeRow = {
  series_id: string;
  episode_number: number;
  title: string;
  body: string;
  is_published: false;
  posting_status: "draft";
  scheduled_for: null;
  posted_at: null;
  last_edited_at: null;
};

export type DraftImportPlan = {
  series: Omit<DraftSeriesRow, "author_id"> & { author_id: string };
  episodes: Array<Omit<DraftEpisodeRow, "series_id">>;
};

const RIGHTS_COMPONENT_KEYS = [
  "original_work",
  "edition",
  "translation",
  "editorial",
  "annotations",
  "illustrations",
  "cover",
  "digitization",
  "provider_terms",
] as const satisfies readonly (keyof RightsComponents)[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function readString(
  record: Record<string, unknown>,
  key: string,
  errors: string[],
  options?: { nullable?: boolean; allowEmpty?: boolean }
): string | null {
  const value = record[key];
  if (value === null && options?.nullable) return null;
  if (typeof value !== "string") {
    errors.push(`${key} must be a string${options?.nullable ? " or null" : ""}`);
    return options?.nullable ? null : "";
  }
  if (!options?.allowEmpty && value.trim().length === 0) {
    errors.push(`${key} must not be empty`);
  }
  return value;
}

function readNullableYear(
  record: Record<string, unknown>,
  key: string,
  errors: string[]
): number | null {
  const value = record[key];
  if (value === null) return null;
  if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > 9999) {
    errors.push(`${key} must be an integer year or null`);
    return null;
  }
  return Number(value);
}

function isIsoDateTime(value: string): boolean {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && /^\d{4}-\d{2}-\d{2}T/.test(value);
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function isSafeRepoRelativePath(value: string): boolean {
  if (!value || value.startsWith("/") || value.startsWith("\\")) return false;
  const normalized = value.replace(/\\/g, "/");
  return !normalized.split("/").some((part) => part === ".." || part === "");
}

function parseRightsComponent(
  value: unknown,
  key: string,
  errors: string[]
): RightsComponentReview {
  if (!isRecord(value)) {
    errors.push(`rights_components.${key} must be an object`);
    return { status: "needs_review", basis: "", notes: "" };
  }
  const status = value.status;
  const basis = value.basis;
  const notes = value.notes;
  if (!RIGHTS_COMPONENT_STATUSES.includes(status as RightsComponentStatus)) {
    errors.push(`rights_components.${key}.status is invalid`);
  }
  if (typeof basis !== "string") {
    errors.push(`rights_components.${key}.basis must be a string`);
  }
  if (typeof notes !== "string") {
    errors.push(`rights_components.${key}.notes must be a string`);
  }
  return {
    status: RIGHTS_COMPONENT_STATUSES.includes(status as RightsComponentStatus)
      ? (status as RightsComponentStatus)
      : "needs_review",
    basis: typeof basis === "string" ? basis : "",
    notes: typeof notes === "string" ? notes : "",
  };
}

export function validateManifest(value: unknown): ManifestValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!isRecord(value)) {
    return {
      ok: false,
      errors: ["manifest root must be an object"],
      warnings,
      manifest: null,
    };
  }

  const id = readString(value, "id", errors) ?? "";
  if (id && !/^[a-z0-9][a-z0-9-]{2,79}$/.test(id)) {
    errors.push("id must use lowercase letters, numbers, and hyphens only");
  }
  const title = readString(value, "title", errors) ?? "";
  const originalTitle = readString(value, "original_title", errors, {
    nullable: true,
  });
  const originalAuthor = readString(value, "original_author", errors) ?? "";
  const authorDeathYear = readNullableYear(value, "author_death_year", errors);
  const originalLanguage = value.original_language;
  if (!PUBLIC_DOMAIN_SOURCE_LANGUAGES.includes(originalLanguage as PublicDomainSourceLanguage)) {
    errors.push("original_language must be ja, en, or ko");
  }
  const firstPublicationYear = readNullableYear(
    value,
    "first_publication_year",
    errors
  );

  const sourceProvider = readString(value, "source_provider", errors) ?? "";
  const sourceUrl = readString(value, "source_url", errors) ?? "";
  if (sourceUrl && !isHttpUrl(sourceUrl)) errors.push("source_url must be an HTTP(S) URL");
  const sourceDownloadUrl = readString(value, "source_download_url", errors, {
    nullable: true,
  });
  if (sourceDownloadUrl && !isHttpUrl(sourceDownloadUrl)) {
    errors.push("source_download_url must be an HTTP(S) URL or null");
  }
  const sourceFile = readString(value, "source_file", errors) ?? "";
  if (sourceFile && !isSafeRepoRelativePath(sourceFile)) {
    errors.push("source_file must be a safe repository-relative path");
  }
  if (sourceFile && !sourceFile.startsWith("public-domain/sources/raw/")) {
    errors.push("source_file must live under public-domain/sources/raw/");
  }
  const sourceRetrievedAt = readString(value, "source_retrieved_at", errors, {
    nullable: true,
  });
  if (sourceRetrievedAt && !isIsoDateTime(sourceRetrievedAt)) {
    errors.push("source_retrieved_at must be an ISO date-time or null");
  }
  const sourceEncoding = value.source_encoding;
  if (!SOURCE_ENCODINGS.includes(sourceEncoding as SourceEncoding)) {
    errors.push("source_encoding must be utf-8, shift_jis, or euc-kr");
  }
  const normalizationProfile = value.normalization_profile;
  if (!NORMALIZATION_PROFILES.includes(normalizationProfile as NormalizationProfile)) {
    errors.push("normalization_profile is invalid");
  }

  const edition = readString(value, "edition", errors, { nullable: true });
  const editionPublicationYear = readNullableYear(
    value,
    "edition_publication_year",
    errors
  );
  const translator = readString(value, "translator", errors, { nullable: true });
  const translatorDeathYear = readNullableYear(
    value,
    "translator_death_year",
    errors
  );
  const translationLanguage = value.translation_language;
  if (
    translationLanguage !== null &&
    !PUBLIC_DOMAIN_SOURCE_LANGUAGES.includes(
      translationLanguage as PublicDomainSourceLanguage
    )
  ) {
    errors.push("translation_language must be ja, en, ko, or null");
  }

  const rightsStatus = value.rights_status;
  if (!RIGHTS_STATUSES.includes(rightsStatus as RightsStatus)) {
    errors.push("rights_status is invalid");
  }
  const rightsBasis = readString(value, "rights_basis", errors, {
    allowEmpty: true,
  }) ?? "";
  const rightsNotes = readString(value, "rights_notes", errors, {
    allowEmpty: true,
  }) ?? "";

  const rightsComponentsRaw = value.rights_components;
  const rightsComponents = {} as RightsComponents;
  if (!isRecord(rightsComponentsRaw)) {
    errors.push("rights_components must be an object");
    for (const key of RIGHTS_COMPONENT_KEYS) {
      rightsComponents[key] = {
        status: "needs_review",
        basis: "",
        notes: "",
      };
    }
  } else {
    for (const key of RIGHTS_COMPONENT_KEYS) {
      rightsComponents[key] = parseRightsComponent(
        rightsComponentsRaw[key],
        key,
        errors
      );
    }
  }

  const jurisdictionsRaw = value.jurisdictions_reviewed;
  const jurisdictionsReviewed = Array.isArray(jurisdictionsRaw)
    ? jurisdictionsRaw.filter((item): item is string => typeof item === "string")
    : [];
  if (!Array.isArray(jurisdictionsRaw)) {
    errors.push("jurisdictions_reviewed must be an array");
  } else if (jurisdictionsReviewed.length !== jurisdictionsRaw.length) {
    errors.push("jurisdictions_reviewed must contain strings only");
  }
  for (const jurisdiction of jurisdictionsReviewed) {
    if (!/^[A-Z]{2}$/.test(jurisdiction)) {
      errors.push(`invalid jurisdiction code: ${jurisdiction}`);
    }
  }

  const reviewedAt = readString(value, "reviewed_at", errors, { nullable: true });
  if (reviewedAt && !isIsoDateTime(reviewedAt)) {
    errors.push("reviewed_at must be an ISO date-time or null");
  }
  const reviewedBy = readString(value, "reviewed_by", errors, { nullable: true });

  const chapterCountRaw = value.chapter_count;
  let chapterCount: number | null = null;
  if (chapterCountRaw !== null) {
    if (!Number.isInteger(chapterCountRaw) || Number(chapterCountRaw) < 1) {
      errors.push("chapter_count must be a positive integer or null");
    } else {
      chapterCount = Number(chapterCountRaw);
    }
  }

  let chapterSplit: ChapterSplitConfig = { strategy: "single" };
  if (!isRecord(value.chapter_split)) {
    errors.push("chapter_split must be an object");
  } else if (value.chapter_split.strategy === "single") {
    chapterSplit = { strategy: "single" };
  } else if (value.chapter_split.strategy === "heading_regex") {
    const pattern = value.chapter_split.heading_pattern;
    if (typeof pattern !== "string" || pattern.trim().length === 0) {
      errors.push("chapter_split.heading_pattern is required for heading_regex");
    } else if (pattern.length > 240) {
      errors.push("chapter_split.heading_pattern is too long");
    } else {
      try {
        void new RegExp(pattern, "iu");
      } catch {
        errors.push("chapter_split.heading_pattern is not a valid regular expression");
      }
      const dropPrefixRaw = value.chapter_split.drop_prefix_before_first_heading;
      if (dropPrefixRaw !== undefined && typeof dropPrefixRaw !== "boolean") {
        errors.push(
          "chapter_split.drop_prefix_before_first_heading must be a boolean when provided"
        );
      }
      chapterSplit = {
        strategy: "heading_regex",
        heading_pattern: pattern,
        ...(dropPrefixRaw === true
          ? { drop_prefix_before_first_heading: true }
          : {}),
      };
    }
  } else if (value.chapter_split.strategy === "paragraph_chunks") {
    const maxCharacters = value.chapter_split.max_characters;
    if (
      !Number.isInteger(maxCharacters) ||
      Number(maxCharacters) < 5_000 ||
      Number(maxCharacters) > PUBLIC_DOMAIN_EPISODE_MAX_CHARACTERS
    ) {
      errors.push(
        `chapter_split.max_characters must be an integer from 5000 to ${PUBLIC_DOMAIN_EPISODE_MAX_CHARACTERS}`
      );
    } else {
      chapterSplit = {
        strategy: "paragraph_chunks",
        max_characters: Number(maxCharacters),
      };
    }
  } else {
    errors.push(
      "chapter_split.strategy must be single, heading_regex, or paragraph_chunks"
    );
  }

  const genresRaw = value.genres;
  const genres =
    genresRaw === undefined
      ? []
      : Array.isArray(genresRaw)
        ? genresRaw.filter((item): item is string => typeof item === "string")
        : [];
  if (
    genresRaw !== undefined &&
    (!Array.isArray(genresRaw) || genres.length !== genresRaw.length)
  ) {
    errors.push("genres must be an array of strings when provided");
  }

  const tagsRaw = value.tags;
  const tags = Array.isArray(tagsRaw)
    ? tagsRaw.filter((item): item is string => typeof item === "string")
    : [];
  if (!Array.isArray(tagsRaw) || tags.length !== tagsRaw?.length) {
    errors.push("tags must be an array of strings");
  }

  const sourceHash = readString(value, "source_hash", errors, { nullable: true });
  if (sourceHash && !/^[a-f0-9]{64}$/.test(sourceHash)) {
    errors.push("source_hash must be a lowercase SHA-256 hex digest or null");
  }

  if (typeof value.approved !== "boolean") {
    errors.push("approved must be a boolean");
  }
  const approved = value.approved === true;

  const importStatus = value.import_status;
  if (!IMPORT_STATUSES.includes(importStatus as ImportStatus)) {
    errors.push("import_status is invalid");
  }

  const coverSource = readString(value, "cover_source", errors, { nullable: true });
  const coverRightsStatus = value.cover_rights_status;
  if (
    coverRightsStatus !== null &&
    !RIGHTS_COMPONENT_STATUSES.includes(coverRightsStatus as RightsComponentStatus)
  ) {
    errors.push("cover_rights_status is invalid");
  }

  const normalizedRightsStatus = RIGHTS_STATUSES.includes(rightsStatus as RightsStatus)
    ? (rightsStatus as RightsStatus)
    : "needs_review";

  if (approved !== (normalizedRightsStatus === "approved")) {
    errors.push("approved must be true exactly when rights_status is approved");
  }

  if (approved) {
    if (!rightsBasis.trim()) errors.push("approved manifests require rights_basis");
    if (!sourceRetrievedAt) {
      errors.push("approved manifests require source_retrieved_at");
    }
    if (!reviewedAt) errors.push("approved manifests require reviewed_at");
    if (!reviewedBy?.trim()) errors.push("approved manifests require reviewed_by");
    if (jurisdictionsReviewed.length === 0) {
      errors.push("approved manifests require at least one reviewed jurisdiction");
    }
    if (!sourceHash) errors.push("approved manifests require source_hash");
    if (!chapterCount) errors.push("approved manifests require chapter_count");
    for (const key of RIGHTS_COMPONENT_KEYS) {
      const component = rightsComponents[key];
      if (component.status === "needs_review" || component.status === "rejected") {
        errors.push(
          `approved manifests cannot have ${component.status} rights component: ${key}`
        );
      }
      if (component.status === "approved" && !component.basis.trim()) {
        errors.push(`approved rights component requires basis: ${key}`);
      }
    }
    if (translator && rightsComponents.translation.status !== "approved") {
      errors.push("approved translated editions require approved translation rights component");
    }
    if (coverSource && rightsComponents.cover.status !== "approved") {
      errors.push("approved cover_source requires approved cover rights component");
    }
  }

  if (!approved && normalizedRightsStatus === "pending") {
    warnings.push("manifest is pending and cannot be imported");
  }

  const manifest: PublicDomainManifest = {
    id,
    title,
    original_title: originalTitle,
    original_author: originalAuthor,
    author_death_year: authorDeathYear,
    original_language: PUBLIC_DOMAIN_SOURCE_LANGUAGES.includes(
      originalLanguage as PublicDomainSourceLanguage
    )
      ? (originalLanguage as PublicDomainSourceLanguage)
      : "ja",
    first_publication_year: firstPublicationYear,
    source_provider: sourceProvider,
    source_url: sourceUrl,
    source_download_url: sourceDownloadUrl,
    source_file: sourceFile,
    source_retrieved_at: sourceRetrievedAt,
    source_encoding: SOURCE_ENCODINGS.includes(sourceEncoding as SourceEncoding)
      ? (sourceEncoding as SourceEncoding)
      : "utf-8",
    normalization_profile: NORMALIZATION_PROFILES.includes(
      normalizationProfile as NormalizationProfile
    )
      ? (normalizationProfile as NormalizationProfile)
      : "plain",
    edition,
    edition_publication_year: editionPublicationYear,
    translator,
    translator_death_year: translatorDeathYear,
    translation_language:
      translationLanguage === null ||
      PUBLIC_DOMAIN_SOURCE_LANGUAGES.includes(
        translationLanguage as PublicDomainSourceLanguage
      )
        ? (translationLanguage as PublicDomainSourceLanguage | null)
        : null,
    rights_status: normalizedRightsStatus,
    rights_basis: rightsBasis,
    rights_notes: rightsNotes,
    rights_components: rightsComponents,
    jurisdictions_reviewed: jurisdictionsReviewed,
    reviewed_at: reviewedAt,
    reviewed_by: reviewedBy,
    chapter_count: chapterCount,
    chapter_split: chapterSplit,
    genres,
    tags,
    source_hash: sourceHash,
    approved,
    import_status: IMPORT_STATUSES.includes(importStatus as ImportStatus)
      ? (importStatus as ImportStatus)
      : "blocked",
    cover_source: coverSource,
    cover_rights_status:
      coverRightsStatus === null ||
      RIGHTS_COMPONENT_STATUSES.includes(coverRightsStatus as RightsComponentStatus)
        ? (coverRightsStatus as RightsComponentStatus | null)
        : null,
  };

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    manifest,
  };
}

export function sha256Bytes(source: Uint8Array): string {
  return createHash("sha256").update(source).digest("hex");
}

export function decodeSourceBytes(
  source: Uint8Array,
  encoding: SourceEncoding
): string {
  return new TextDecoder(encoding, { fatal: true }).decode(source);
}

function normalizeLineEndings(source: string): {
  text: string;
  changed: boolean;
} {
  const text = source.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  return { text, changed: text !== source };
}

function normalizeAozora(source: string): NormalizationResult {
  const base = normalizeLineEndings(source);
  const lines = base.text.split("\n");
  let metadataStart = -1;
  const searchStart = Math.floor(lines.length * 0.6);
  for (let index = searchStart; index < lines.length; index += 1) {
    if (/^(底本|底本の親本|初出)[：:]/u.test(lines[index] ?? "")) {
      const tail = lines.slice(index).join("\n");
      if (/青空文庫作成ファイル/u.test(tail)) {
        metadataStart = index;
        break;
      }
    }
  }

  const changes: string[] = [];
  if (base.changed) changes.push("normalized BOM/line endings");
  if (metadataStart >= 0) {
    changes.push("separated trailing Aozora bibliographic/provenance block");
  }

  const displayText = (
    metadataStart >= 0 ? lines.slice(0, metadataStart).join("\n") : base.text
  ).trim();
  const archiveMetadata =
    metadataStart >= 0 ? lines.slice(metadataStart).join("\n").trim() : "";
  const warnings: string[] = [];
  if (/［＃/u.test(displayText)) {
    warnings.push(
      "AOZORA_ANNOTATIONS_PRESENT: reader source retains Aozora annotations; do not blanket-strip them"
    );
  }
  if (/《[^》]+》/u.test(displayText)) {
    warnings.push(
      "AOZORA_RUBY_PRESENT: reader source retains ruby markup for existing reader/translation handling"
    );
  }
  return { displayText, archiveMetadata, changes, warnings };
}

function normalizeGutenberg(source: string): NormalizationResult {
  const base = normalizeLineEndings(source);
  const startPattern = /^\*\*\*\s*START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK.*\*\*\*\s*$/imu;
  const endPattern = /^\*\*\*\s*END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK.*\*\*\*\s*$/imu;
  const startMatch = startPattern.exec(base.text);
  const endMatch = endPattern.exec(base.text);
  const changes: string[] = [];
  const warnings: string[] = [];
  if (base.changed) changes.push("normalized BOM/line endings");

  if (!startMatch || !endMatch || endMatch.index <= startMatch.index) {
    warnings.push(
      "GUTENBERG_BOUNDARY_NOT_CONFIRMED: START/END markers were not both detected; no boilerplate was removed"
    );
    return {
      displayText: base.text.trim(),
      archiveMetadata: "",
      changes,
      warnings,
    };
  }

  const bodyStart = startMatch.index + startMatch[0].length;
  const displayText = base.text.slice(bodyStart, endMatch.index).trim();
  const archiveMetadata = [
    base.text.slice(0, bodyStart).trim(),
    base.text.slice(endMatch.index).trim(),
  ]
    .filter(Boolean)
    .join("\n\n--- PROJECT GUTENBERG BOUNDARY ---\n\n");
  changes.push(
    "separated Project Gutenberg header/license/footer from reader text; retained it in archive metadata"
  );
  warnings.push(
    "GUTENBERG_RIGHTS_REVIEW_REQUIRED: per-item copyright header and non-US jurisdiction status must still be human-reviewed"
  );
  return { displayText, archiveMetadata, changes, warnings };
}

export function normalizeSource(
  source: string,
  profile: NormalizationProfile
): NormalizationResult {
  if (profile === "aozora") return normalizeAozora(source);
  if (profile === "gutenberg") return normalizeGutenberg(source);

  const base = normalizeLineEndings(source);
  const warnings: string[] = [];
  if (profile === "standard_ebooks") {
    warnings.push(
      "STANDARD_EBOOKS_MANUAL_REVIEW: this profile does not strip provider editorial material, cover assets, typography, or metadata"
    );
  }
  if (profile === "gongu_madang") {
    warnings.push(
      "GONGU_LICENSE_LABEL_REVIEW: verify the per-item expiration/license label and source metadata before approval"
    );
  }
  return {
    displayText: base.text.trim(),
    archiveMetadata: "",
    changes: base.changed ? ["normalized BOM/line endings"] : [],
    warnings,
  };
}

export function splitChapters(
  text: string,
  manifest: Pick<PublicDomainManifest, "title" | "chapter_split">
): PreparedChapter[] {
  const body = text.trim();
  if (!body) return [];

  if (manifest.chapter_split.strategy === "single") {
    return [
      {
        number: 1,
        title: manifest.title,
        body,
        characterCount: body.length,
      },
    ];
  }

  if (manifest.chapter_split.strategy === "paragraph_chunks") {
    const maxCharacters = manifest.chapter_split.max_characters;
    const paragraphs = body
      .split(/\n\s*\n+/u)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean);
    const chunks: string[] = [];
    let current = "";

    function flush() {
      const trimmed = current.trim();
      if (trimmed) chunks.push(trimmed);
      current = "";
    }

    for (const paragraph of paragraphs) {
      if (paragraph.length > maxCharacters) {
        flush();
        let offset = 0;
        while (offset < paragraph.length) {
          let end = Math.min(paragraph.length, offset + maxCharacters);
          if (end < paragraph.length) {
            const windowStart = Math.max(offset + Math.floor(maxCharacters * 0.65), offset + 1);
            const slice = paragraph.slice(windowStart, end);
            const boundaryMatches = Array.from(
              slice.matchAll(/[.!?。！？]\s+|[.!?。！？]["'”’」』）】］»]?/gu)
            );
            const lastBoundary = boundaryMatches[boundaryMatches.length - 1];
            if (lastBoundary?.index !== undefined) {
              end = windowStart + lastBoundary.index + lastBoundary[0].length;
            }
          }
          const piece = paragraph.slice(offset, end).trim();
          if (!piece) {
            throw new Error("CHAPTER_CHUNK_EMPTY: failed to split oversized paragraph");
          }
          chunks.push(piece);
          offset = end;
        }
        continue;
      }

      const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
      if (candidate.length > maxCharacters && current) {
        flush();
        current = paragraph;
      } else {
        current = candidate;
      }
    }
    flush();

    return chunks.map((chapterBody, index) => ({
      number: index + 1,
      title:
        chunks.length === 1
          ? manifest.title
          : `${manifest.title} — Part ${index + 1}`,
      body: chapterBody,
      characterCount: chapterBody.length,
    }));
  }

  const pattern = new RegExp(manifest.chapter_split.heading_pattern, "iu");
  const lines = body.split("\n");
  const headings: Array<{ index: number; title: string }> = [];
  lines.forEach((line, index) => {
    if (pattern.test(line.trim())) {
      headings.push({ index, title: line.trim() });
    }
  });
  if (headings.length === 0) return [];

  const prefix = lines.slice(0, headings[0]!.index).join("\n").trim();
  const keepPrefix =
    manifest.chapter_split.strategy === "heading_regex" &&
    manifest.chapter_split.drop_prefix_before_first_heading !== true;
  const semanticChapters = headings.map((heading, index) => {
    const next = headings[index + 1];
    const content = lines
      .slice(heading.index + 1, next ? next.index : lines.length)
      .join("\n")
      .trim();
    const chapterBody =
      index === 0 && prefix && keepPrefix
        ? `${prefix}\n\n${content}`.trim()
        : content;
    return { title: heading.title, body: chapterBody };
  });

  // Preserve semantic headings where possible, but never let a naturally long
  // chapter bypass the translation-sized episode envelope.
  const chapters: PreparedChapter[] = [];
  for (const semantic of semanticChapters) {
    const pieces =
      semantic.body.length <= PUBLIC_DOMAIN_EPISODE_MAX_CHARACTERS
        ? [semantic.body]
        : splitChapters(semantic.body, {
            title: semantic.title,
            chapter_split: {
              strategy: "paragraph_chunks",
              max_characters: PUBLIC_DOMAIN_EPISODE_TARGET_CHARACTERS,
            },
          }).map((chapter) => chapter.body);
    for (const [pieceIndex, piece] of pieces.entries()) {
      chapters.push({
        number: chapters.length + 1,
        title:
          pieces.length === 1
            ? semantic.title
            : `${semantic.title} — Part ${pieceIndex + 1}`,
        body: piece,
        characterCount: piece.length,
      });
    }
  }
  return chapters;
}

export function canonicalizePublicDomainText(text: string): string {
  return text.replace(/\r\n?/g, "\n").trim();
}

export function publicDomainTextDigest(text: string): string {
  return sha256Text(canonicalizePublicDomainText(text));
}

export function validateChapterRepartition(args: {
  before: string[];
  after: PreparedChapter[];
}): void {
  const beforeText = canonicalizePublicDomainText(args.before.join("\n\n"));
  const afterText = canonicalizePublicDomainText(
    args.after.map((chapter) => chapter.body).join("\n\n")
  );
  if (publicDomainTextDigest(beforeText) !== publicDomainTextDigest(afterText)) {
    throw new Error("CHAPTER_REPARTITION_TEXT_MISMATCH: repartition changed source text");
  }
  if (
    args.after.some(
      (chapter) => chapter.characterCount > PUBLIC_DOMAIN_EPISODE_MAX_CHARACTERS
    )
  ) {
    throw new Error("CHAPTER_REPARTITION_LIMIT: repartition produced an oversized episode");
  }
}

export function validateChapters(chapters: PreparedChapter[]): ChapterValidation {
  const fatals: string[] = [];
  const warnings: string[] = [];
  if (chapters.length === 0) fatals.push("CHAPTER_ZERO: no chapters were produced");
  if (chapters.some((chapter) => chapter.body.trim().length === 0)) {
    fatals.push("CHAPTER_EMPTY: one or more chapters have an empty body");
  }
  if (chapters.length > 1000) {
    fatals.push("CHAPTER_COUNT_EXTREME: more than 1000 chapters were produced");
  } else if (chapters.length > 300) {
    warnings.push("CHAPTER_COUNT_HIGH: more than 300 chapters were produced");
  }

  const normalizedTitles = chapters.map((chapter) => chapter.title.trim().toLowerCase());
  if (new Set(normalizedTitles).size !== normalizedTitles.length) {
    warnings.push("CHAPTER_DUPLICATE_TITLE: duplicate chapter titles detected");
  }

  if (chapters.length >= 5) {
    const shortCount = chapters.filter((chapter) => chapter.characterCount < 200).length;
    if (shortCount / chapters.length >= 0.5) {
      warnings.push(
        "CHAPTER_MANY_SHORT: at least half of chapters are under 200 characters"
      );
    }
  }
  const oversized = chapters.filter(
    (chapter) => chapter.characterCount > PUBLIC_DOMAIN_EPISODE_MAX_CHARACTERS
  );
  if (oversized.length > 0) {
    fatals.push(
      `CHAPTER_TRANSLATION_LIMIT: ${oversized.length} chapter(s) exceed ${PUBLIC_DOMAIN_EPISODE_MAX_CHARACTERS} characters; split them before import`
    );
  } else if (
    chapters.some(
      (chapter) => chapter.characterCount > PUBLIC_DOMAIN_EPISODE_TARGET_CHARACTERS
    )
  ) {
    warnings.push(
      `CHAPTER_TRANSLATION_TARGET: one or more chapters exceed the ${PUBLIC_DOMAIN_EPISODE_TARGET_CHARACTERS}-character target`
    );
  }
  return { fatals, warnings };
}

export function prepareArtifact(args: {
  manifest: PublicDomainManifest;
  rawBytes: Uint8Array;
  preparedAt?: string;
}): PreparedArtifact {
  const sourceHash = sha256Bytes(args.rawBytes);
  const decoded = decodeSourceBytes(args.rawBytes, args.manifest.source_encoding);
  const normalized = normalizeSource(decoded, args.manifest.normalization_profile);
  const chapters = splitChapters(normalized.displayText, args.manifest);
  const validation = validateChapters(chapters);
  if (validation.fatals.length > 0) {
    throw new Error(validation.fatals.join("\n"));
  }
  return {
    version: 1,
    manifestId: args.manifest.id,
    sourceHash,
    preparedAt: args.preparedAt ?? new Date().toISOString(),
    normalizationProfile: args.manifest.normalization_profile,
    rawCharacterCount: decoded.length,
    displayCharacterCount: normalized.displayText.length,
    archiveMetadataCharacterCount: normalized.archiveMetadata.length,
    normalizationChanges: normalized.changes,
    warnings: [...normalized.warnings, ...validation.warnings],
    chapters,
  };
}

export function assertImportable(
  manifest: PublicDomainManifest,
  artifact: PreparedArtifact
): void {
  if (manifest.rights_status !== "approved" || manifest.approved !== true) {
    throw new Error("RIGHTS_NOT_APPROVED: manifest must be human-approved before import");
  }
  if (manifest.import_status === "imported") {
    throw new Error("ALREADY_IMPORTED: manifest is already marked imported");
  }
  if (!manifest.source_hash || manifest.source_hash !== artifact.sourceHash) {
    throw new Error("SOURCE_HASH_MISMATCH: approved manifest hash does not match prepared source");
  }
  if (!manifest.chapter_count || manifest.chapter_count !== artifact.chapters.length) {
    throw new Error(
      "CHAPTER_COUNT_MISMATCH: approved manifest chapter_count does not match prepared chapters"
    );
  }
  if (artifact.chapters.length === 0) {
    throw new Error("CHAPTER_ZERO: import requires at least one chapter");
  }
}

export function buildDraftImportPlan(args: {
  manifest: PublicDomainManifest;
  artifact: PreparedArtifact;
  officialUserId: string;
}): DraftImportPlan {
  assertImportable(args.manifest, args.artifact);
  const storyFormat = args.artifact.chapters.length === 1 ? "short" : "long";
  const tags = Array.from(new Set(args.manifest.tags));
  const genres = Array.from(new Set(args.manifest.genres ?? []));
  const authorSuffix = `・${args.manifest.original_author.trim()}`;
  const seriesTitle = args.manifest.title.trim().endsWith(authorSuffix)
    ? args.manifest.title.trim()
    : `${args.manifest.title.trim()}${authorSuffix}`;
  return {
    series: {
      title: seriesTitle,
      author_id: args.officialUserId,
      publication_status: "private",
      is_public: false,
      source_language: args.manifest.original_language,
      // Importability already requires a human-approved rights manifest. Approved
      // Public Domain works are therefore open for translation and Human narration.
      translation_permission_mode: "open",
      recording_permission_mode: "open",
      genres,
      tags,
      effect_settings: {
        version: 1,
        storyFormat,
        publicDomain: {
          manifestId: args.manifest.id,
          originalTitle: args.manifest.original_title,
          originalAuthor: args.manifest.original_author,
          firstPublicationYear: args.manifest.first_publication_year,
          sourceProvider: args.manifest.source_provider,
          sourceUrl: args.manifest.source_url,
          sourceHash: args.artifact.sourceHash,
          rightsChecked: true,
          reviewedAt: args.manifest.reviewed_at,
          reviewedBy: args.manifest.reviewed_by,
          jurisdictionsReviewed: args.manifest.jurisdictions_reviewed,
        },
      },
    },
    episodes: args.artifact.chapters.map((chapter) => ({
      episode_number: chapter.number,
      title: chapter.title,
      body: chapter.body,
      is_published: false,
      posting_status: "draft",
      scheduled_for: null,
      posted_at: null,
      last_edited_at: null,
    })),
  };
}

export function readPublicDomainMetadata(
  effectSettings: unknown
): Record<string, unknown> | null {
  let settings: Record<string, unknown> | null = null;
  if (isRecord(effectSettings)) settings = effectSettings;
  if (typeof effectSettings === "string" && effectSettings.trim()) {
    try {
      const parsed = JSON.parse(effectSettings);
      if (isRecord(parsed)) settings = parsed;
    } catch {
      return null;
    }
  }
  const publicDomain = settings?.publicDomain;
  return isRecord(publicDomain) ? publicDomain : null;
}

export function isDuplicatePublicDomainSeries(args: {
  effectSettings: unknown;
  manifestId: string;
  sourceHash: string;
}): boolean {
  const metadata = readPublicDomainMetadata(args.effectSettings);
  if (!metadata) return false;
  return (
    metadata.manifestId === args.manifestId || metadata.sourceHash === args.sourceHash
  );
}
