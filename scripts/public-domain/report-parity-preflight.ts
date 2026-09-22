import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  loadManifest,
  loadPreparedArtifact,
} from "./runtime";

type BatchEntry = {
  provider: "gutenberg" | "gongu";
  provider_id: number;
  title: string;
  author: string;
  author_death_year: number;
  first_publication_year: number;
};

type Batch = {
  id: string;
  target: { ja: number; en: number; ko: number };
  baseline: { ja: number; en: number; ko: number };
  additions: { en: number; ko: number };
  works: BatchEntry[];
};

function manifestId(entry: BatchEntry): string {
  return entry.provider === "gutenberg"
    ? `gutenberg-${String(entry.provider_id).padStart(6, "0")}`
    : `gongu-${entry.provider_id}`;
}

const batch = JSON.parse(
  readFileSync(
    resolve(process.cwd(), "public-domain/batches/en-ko-parity-2026-09-23.json"),
    "utf8"
  )
) as Batch;

const rows = batch.works.map((entry) => {
  const id = manifestId(entry);
  const manifest = loadManifest(id);
  const artifact = loadPreparedArtifact(id);
  const maxChapterCharacters = Math.max(
    ...artifact.chapters.map((chapter) => chapter.characterCount)
  );

  if (!manifest.source_hash || manifest.source_hash !== artifact.sourceHash) {
    throw new Error(`${id}: manifest/artifact source hash mismatch`);
  }
  if (!manifest.source_retrieved_at) {
    throw new Error(`${id}: source_retrieved_at is missing`);
  }
  if (manifest.chapter_count !== artifact.chapters.length) {
    throw new Error(`${id}: chapter_count does not match prepared artifact`);
  }
  if (maxChapterCharacters > 30_000) {
    throw new Error(
      `${id}: prepared chapter exceeds 30,000 characters (${maxChapterCharacters})`
    );
  }
  if (manifest.rights_status !== "pending" || manifest.approved !== false) {
    throw new Error(`${id}: preflight must remain pending/unapproved`);
  }
  if (manifest.import_status !== "prepared") {
    throw new Error(`${id}: source-prepared manifest must be marked prepared`);
  }

  return {
    id,
    provider: manifest.source_provider,
    provider_id: entry.provider_id,
    title: manifest.title,
    original_author: manifest.original_author,
    original_language: manifest.original_language,
    author_death_year: manifest.author_death_year,
    first_publication_year: manifest.first_publication_year,
    source_url: manifest.source_url,
    source_download_url: manifest.source_download_url,
    source_hash: manifest.source_hash,
    source_retrieved_at: manifest.source_retrieved_at,
    prepared_chapter_count: artifact.chapters.length,
    prepared_character_count: artifact.displayCharacterCount,
    max_chapter_characters: maxChapterCharacters,
    normalization_warnings: artifact.warnings,
    rights_status: manifest.rights_status,
    approved: manifest.approved,
    import_status: manifest.import_status,
  };
});

const en = rows.filter((row) => row.original_language === "en");
const ko = rows.filter((row) => row.original_language === "ko");
if (rows.length !== 75 || en.length !== 38 || ko.length !== 37) {
  throw new Error(
    `Prepared parity count mismatch: total=${rows.length} en=${en.length} ko=${ko.length}`
  );
}

const output = {
  generated_at: new Date().toISOString(),
  batch_id: batch.id,
  production_target: batch.target,
  baseline: batch.baseline,
  additions: batch.additions,
  stage: "SOURCE_PREPARED_PENDING_HUMAN_RIGHTS_APPROVAL",
  safety: {
    source_hashes_pinned: true,
    provider_landing_status_checked_by_source_sync: true,
    max_prepared_chapter_characters: 30_000,
    modern_translations_included: false,
    covers_or_illustrations_included: false,
    database_writes_performed: false,
    publication_performed: false,
  },
  summary: {
    total: rows.length,
    en: en.length,
    ko: ko.length,
    total_prepared_chapters: rows.reduce(
      (sum, row) => sum + row.prepared_chapter_count,
      0
    ),
    total_prepared_characters: rows.reduce(
      (sum, row) => sum + row.prepared_character_count,
      0
    ),
    max_chapter_characters: Math.max(
      ...rows.map((row) => row.max_chapter_characters)
    ),
  },
  works: rows,
};

const outputPath = resolve(
  process.cwd(),
  "public-domain/audits/en-ko-parity-preflight-2026-09-23.json"
);
writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(
  `PASS: prepared parity preflight total=${rows.length} en=${en.length} ko=${ko.length} chapters=${output.summary.total_prepared_chapters}`
);
