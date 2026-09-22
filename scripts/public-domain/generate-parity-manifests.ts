import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import batch from "../../public-domain/batches/en-ko-parity-2026-09-23.json";

type Entry = (typeof batch.works)[number];

const englishCount = batch.works.filter((entry) => entry.provider === "gutenberg").length;
const koreanCount = batch.works.filter((entry) => entry.provider === "gongu").length;
if (englishCount !== 38 || koreanCount !== 37 || batch.works.length !== 75) {
  throw new Error(
    `Parity batch count mismatch: total=${batch.works.length} en=${englishCount} ko=${koreanCount}`
  );
}
const providerKeys = batch.works.map(
  (entry) => `${entry.provider}:${entry.provider_id}`
);
if (new Set(providerKeys).size !== providerKeys.length) {
  throw new Error("Parity batch contains duplicate provider ids");
}
for (const entry of batch.works) {
  if (entry.first_publication_year > 1930) {
    throw new Error(
      `${entry.title}: first publication year exceeds conservative 1930 cutoff`
    );
  }
  const authorDeathYearMax = entry.provider === "gutenberg" ? 1944 : 1955;
  if (entry.author_death_year > authorDeathYearMax) {
    throw new Error(
      `${entry.title}: author death year exceeds conservative ${authorDeathYearMax} cutoff for ${entry.provider}`
    );
  }
}


const component = (status: "needs_review" | "not_applicable" = "needs_review") => ({
  status,
  basis: "",
  notes: "",
});

function padId(value: number): string {
  return String(value).padStart(6, "0");
}

function makeManifest(entry: Entry) {
  const isGutenberg = entry.provider === "gutenberg";
  const manifestId = isGutenberg
    ? `gutenberg-${padId(entry.provider_id)}`
    : `gongu-${entry.provider_id}`;
  const sourceUrl = isGutenberg
    ? `https://www.gutenberg.org/ebooks/${entry.provider_id}`
    : `https://gongu.copyright.or.kr/gongu/wrt/wrt/view.do?menuNo=200030&wrtSn=${entry.provider_id}`;
  const downloadUrl = isGutenberg
    ? `https://www.gutenberg.org/cache/epub/${entry.provider_id}/pg${entry.provider_id}.txt`
    : `https://gongu.copyright.or.kr/gongu/wrt/cmmn/wrtFileDownload.do?wrtSn=${entry.provider_id}&fileSn=4`;

  return {
    id: manifestId,
    title: entry.title,
    original_title: entry.title,
    original_author: entry.author,
    author_death_year: entry.author_death_year,
    original_language: isGutenberg ? "en" : "ko",
    first_publication_year: entry.first_publication_year,
    source_provider: isGutenberg
      ? "Project Gutenberg"
      : "Gongu Madang / Korea Copyright Commission",
    source_url: sourceUrl,
    source_download_url: downloadUrl,
    source_file: `public-domain/sources/raw/${manifestId}.txt`,
    source_retrieved_at: null,
    source_encoding: "utf-8",
    normalization_profile: isGutenberg ? "gutenberg" : "gongu_madang",
    edition: isGutenberg
      ? `Project Gutenberg eBook #${entry.provider_id} plain text`
      : `Korea Copyright Commission/Gongu Madang expired-work TXT #${entry.provider_id}`,
    edition_publication_year: null,
    translator: null,
    translator_death_year: null,
    translation_language: null,
    rights_status: "pending",
    rights_basis: "",
    rights_notes:
      "Selected under Child73 parity preflight. Exact provider landing status, source bytes, source hash, normalized Reader text, and JP/US/KR term analysis must pass before approval/import.",
    rights_components: {
      original_work: component(),
      edition: component(),
      translation: component("not_applicable"),
      editorial: component(),
      annotations: component(),
      illustrations: component("not_applicable"),
      cover: component("not_applicable"),
      digitization: component(),
      provider_terms: component(),
    },
    jurisdictions_reviewed: [],
    reviewed_at: null,
    reviewed_by: null,
    chapter_count: null,
    chapter_split: {
      strategy: "paragraph_chunks",
      max_characters: 30000,
    },
    genres: entry.genres,
    tags: entry.tags,
    source_hash: null,
    approved: false,
    import_status: "not_imported",
    cover_source: null,
    cover_rights_status: null,
  };
}

const manifests = batch.works.map(makeManifest);
for (const manifest of manifests) {
  const path = resolve(process.cwd(), "public-domain/manifests", `${manifest.id}.json`);
  mkdirSync(resolve(process.cwd(), "public-domain/manifests"), { recursive: true });
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}
console.log(`Generated ${manifests.length} parity manifests`);
