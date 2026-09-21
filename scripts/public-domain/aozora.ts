export type CsvRow = Record<string, string>;

export type AozoraCandidateClassification = {
  eligible: boolean;
  reasons: string[];
  workId: string;
  title: string;
  author: string;
  authorDeathYear: number | null;
  firstPublicationYear: number | null;
  cardUrl: string;
  textUrl: string;
  sourceEncoding: "shift_jis" | "utf-8";
  sourceRows: CsvRow[];
};

export const AOZORA_CATALOG_URL =
  "https://www.aozora.gr.jp/index_pages/list_person_all_extended_utf8.zip";

const REQUIRED_HEADERS = [
  "作品ID",
  "作品名",
  "作品著作権フラグ",
  "図書カードURL",
  "姓",
  "名",
  "没年月日",
  "人物著作権フラグ",
  "役割フラグ",
  "初出",
  "テキストファイルURL",
  "テキストファイル符号化方式",
] as const;

export function parseCsv(text: string): CsvRow[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell.replace(/\r$/u, ""));
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (quoted) throw new Error("CSV ended inside a quoted field");
  if (cell.length > 0 || row.length > 0) {
    row.push(cell.replace(/\r$/u, ""));
    rows.push(row);
  }
  if (rows.length === 0) return [];

  const headers = rows[0]!.map((value) => value.trim());
  for (const header of REQUIRED_HEADERS) {
    if (!headers.includes(header)) {
      throw new Error(`Aozora catalog is missing required header: ${header}`);
    }
  }

  return rows
    .slice(1)
    .filter((values) => values.some((value) => value.trim().length > 0))
    .map((values) => {
      const record: CsvRow = {};
      headers.forEach((header, index) => {
        record[header] = values[index] ?? "";
      });
      return record;
    });
}

export function extractGregorianYear(value: string): number | null {
  const matches = value.match(/(?:18|19|20)\d{2}/gu);
  if (!matches?.length) return null;
  return Math.min(...matches.map(Number));
}

export function deathYearFromDate(value: string): number | null {
  const match = /^(\d{4})-/u.exec(value.trim());
  return match ? Number(match[1]) : null;
}

export function normalizeAozoraEncoding(
  value: string
): "shift_jis" | "utf-8" {
  return /utf-?8/iu.test(value) ? "utf-8" : "shift_jis";
}

export function isAllowedAozoraTextUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname === "www.aozora.gr.jp" &&
      /^\/cards\/\d+\/files\/[A-Za-z0-9_.-]+\.zip$/u.test(url.pathname)
    );
  } catch {
    return false;
  }
}

export function canonicalAozoraIdentityPart(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\\s・･·]/gu, "");
}

export function groupAozoraRows(rows: CsvRow[]): Map<string, CsvRow[]> {
  const grouped = new Map<string, CsvRow[]>();
  for (const row of rows) {
    const id = row["作品ID"]?.trim();
    if (!id) continue;
    const current = grouped.get(id) ?? [];
    current.push(row);
    grouped.set(id, current);
  }
  return grouped;
}

export function classifyAozoraWork(
  sourceRows: CsvRow[],
  options: {
    maxAuthorDeathYear?: number;
    maxFirstPublicationYear?: number;
  } = {}
): AozoraCandidateClassification {
  const reasons: string[] = [];
  const maxAuthorDeathYear = options.maxAuthorDeathYear ?? 1955;
  const maxFirstPublicationYear = options.maxFirstPublicationYear ?? 1930;
  const primary = sourceRows[0] ?? {};
  const workId = primary["作品ID"]?.trim() ?? "";
  const title = primary["作品名"]?.trim() ?? "";
  const cardUrl = primary["図書カードURL"]?.trim() ?? "";
  const textUrl = primary["テキストファイルURL"]?.trim() ?? "";
  const authorRows = sourceRows.filter(
    (row) => row["役割フラグ"]?.trim() === "著者"
  );
  const author = authorRows[0]
    ? `${authorRows[0]["姓"]?.trim() ?? ""}${authorRows[0]["名"]?.trim() ?? ""}`
    : "";
  const deathYears = authorRows
    .map((row) => deathYearFromDate(row["没年月日"] ?? ""))
    .filter((value): value is number => value !== null);
  const authorDeathYear =
    deathYears.length > 0 ? Math.max(...deathYears) : null;
  const firstPublicationYear = extractGregorianYear(primary["初出"] ?? "");

  if (!workId || !/^\d+$/u.test(workId)) reasons.push("missing/invalid work id");
  if (!title) reasons.push("missing title");
  if (
    sourceRows.some((row) => row["作品著作権フラグ"]?.trim() !== "なし")
  ) {
    reasons.push("one or more Aozora work copyright flags are not なし");
  }
  if (
    sourceRows.some(
      (row) => row["人物著作権フラグ"]?.trim() !== "なし"
    )
  ) {
    reasons.push("one or more contributor copyright flags are not なし");
  }
  const nonAuthorRoles = Array.from(
    new Set(
      sourceRows
        .map((row) => row["役割フラグ"]?.trim())
        .filter((role) => role && role !== "著者")
    )
  );
  if (nonAuthorRoles.length > 0) {
    reasons.push(`non-author contributor roles present: ${nonAuthorRoles.join(", ")}`);
  }
  if (authorRows.length === 0 || !author) reasons.push("author row is missing");
  if (authorDeathYear === null) {
    reasons.push("author death year is unknown");
  } else if (authorDeathYear > maxAuthorDeathYear) {
    reasons.push(
      `author death year ${authorDeathYear} exceeds conservative cutoff ${maxAuthorDeathYear}`
    );
  }
  if (firstPublicationYear === null) {
    reasons.push("first publication year is unknown");
  } else if (firstPublicationYear > maxFirstPublicationYear) {
    reasons.push(
      `first publication year ${firstPublicationYear} exceeds conservative U.S. cutoff ${maxFirstPublicationYear}`
    );
  }
  if (!/^https:\/\/www\.aozora\.gr\.jp\/cards\//u.test(cardUrl)) {
    reasons.push("card URL is not an Aozora card URL");
  }
  if (!isAllowedAozoraTextUrl(textUrl)) {
    reasons.push("text URL is not an allowlisted Aozora ZIP URL");
  }

  return {
    eligible: reasons.length === 0,
    reasons,
    workId,
    title,
    author,
    authorDeathYear,
    firstPublicationYear,
    cardUrl,
    textUrl,
    sourceEncoding: normalizeAozoraEncoding(
      primary["テキストファイル符号化方式"] ?? ""
    ),
    sourceRows,
  };
}

export function makePendingAozoraManifest(
  item: AozoraCandidateClassification
): Record<string, unknown> {
  if (!item.eligible) {
    throw new Error(
      `Cannot create candidate manifest for ineligible Aozora work ${item.workId}: ${item.reasons.join("; ")}`
    );
  }
  const primary = item.sourceRows[0]!;
  const edition = primary["底本名1"]?.trim() || null;
  const editionPublicationYear = extractGregorianYear(
    primary["底本初版発行年1"] ?? ""
  );

  const review = (status: "needs_review" | "not_applicable", notes = "") => ({
    status,
    basis: "",
    notes,
  });

  return {
    id: `aozora-${item.workId}`,
    title: `${item.title}・${item.author}`,
    original_title: item.title,
    original_author: item.author,
    author_death_year: item.authorDeathYear,
    original_language: "ja",
    first_publication_year: item.firstPublicationYear,
    source_provider: "Aozora Bunko",
    source_url: item.cardUrl,
    source_download_url: item.textUrl,
    source_file: `public-domain/sources/raw/aozora-${item.workId}.txt`,
    source_retrieved_at: null,
    source_encoding: item.sourceEncoding,
    normalization_profile: "aozora",
    edition,
    edition_publication_year: editionPublicationYear,
    translator: null,
    translator_death_year: null,
    translation_language: null,
    rights_status: "pending",
    rights_basis: "",
    rights_notes:
      "Conservative catalog candidate only. Aozora copyright flags, original-work term, exact edition/digitization, provider terms, and intended jurisdictions still require human review.",
    rights_components: {
      original_work: review(
        "needs_review",
        "Aozora catalog flags are なし and candidate cutoffs passed; verify exact work and jurisdiction before approval."
      ),
      edition: review(
        "needs_review",
        "Verify whether the exact base edition contributes protectable modern editorial matter."
      ),
      translation: review("not_applicable"),
      editorial: review(
        "needs_review",
        "Verify modernization/editorial contribution in the selected source."
      ),
      annotations: review(
        "needs_review",
        "Aozora annotations/provenance are preserved and must be reviewed."
      ),
      illustrations: review("not_applicable"),
      cover: review("not_applicable"),
      digitization: review(
        "needs_review",
        "Review Aozora file handling rules and preserve provenance."
      ),
      provider_terms: review(
        "needs_review",
        "Review current Aozora file handling rules at approval time."
      ),
    },
    jurisdictions_reviewed: [],
    reviewed_at: null,
    reviewed_by: null,
    chapter_count: null,
    chapter_split: { strategy: "single" },
    tags: ["Public Domain", "Aozora Bunko", item.author],
    source_hash: null,
    approved: false,
    import_status: "not_imported",
    cover_source: null,
    cover_rights_status: null,
  };
}
