import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { unzipSync } from "fflate";
import {
  AOZORA_CATALOG_URL,
  extractGregorianYear,
  groupAozoraRows,
  isAllowedAozoraTextUrl,
  normalizeAozoraEncoding,
  parseCsv,
  type CsvRow,
} from "./aozora";
import { decodeSourceBytes, normalizeSource, sha256Bytes } from "./core";
import { OFFICIAL_ACCOUNT_EMAIL, isOfficialAccountEmail } from "../../src/lib/auth/officialAccount";

type CandidateEvidence = {
  work_id: string;
  title: string;
  author: string;
  card_url: string;
  download_url: string;
  first_publication: string | null;
  first_publication_year: number | null;
  edition: string | null;
  edition_publication_year: number | null;
  input_by: string | null;
  proofread_by: string | null;
  work_copyright_flags: string[];
  contributor_roles: string[];
  contributor_copyright_flags: string[];
  raw_sha256: string | null;
  normalized_sha256: string | null;
  normalized_chars: number | null;
  exact_join: boolean;
  whitespace_only: boolean;
  ordered_exact_slices: boolean;
  ordered_slice_coverage: number;
  shingle_similarity: number;
  difference_type: string;
  fetch_error: string | null;
};

type WorkEvidence = {
  work_title: string;
  episode_ids: string[];
  production_chars: number;
  production_sha256_join_empty: string;
  candidate_count: number;
  best_candidate: CandidateEvidence | null;
  candidates: CandidateEvidence[];
};

const REVIEW_DATE = "2026-09-25";
const OUTPUT_PATH = "public-domain/audits/legacy-official-provenance-recovery-2026-09-25.json";
const AUTHOR_NAMES = ["芥川龍之介", "夏目漱石", "太宰治", "宮沢賢治", "江戸川乱歩"] as const;
const TITLE_ALIASES: Record<string, string> = {
  "虜美人草": "虞美人草",
};

function sha256Text(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function canonical(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/竜/gu, "龍")
    .replace(/[・･·\s　「」『』【】（）()［］\[\]〈〉《》―—‐－:：,，.。!?！？'"“”‘’]/gu, "")
    .toLowerCase();
}

function baseTitle(seriesTitle: string, author: string): string {
  if (seriesTitle.endsWith("・短編")) return seriesTitle;
  const suffix = "・" + author;
  const raw = seriesTitle.endsWith(suffix)
    ? seriesTitle.slice(0, -suffix.length)
    : seriesTitle;
  return TITLE_ALIASES[raw] ?? raw;
}

function authorForTitle(seriesTitle: string): string {
  const found = AUTHOR_NAMES.find((author) => seriesTitle.includes(author));
  if (found) return found;
  if (seriesTitle === "グスコーブドリの伝記") return "宮沢賢治";
  throw new Error("Unknown legacy author for series: " + seriesTitle);
}

function compactWhitespace(value: string): string {
  return value.replace(/\s+/gu, "");
}

function shingleSimilarity(left: string, right: string): number {
  const a = compactWhitespace(left);
  const b = compactWhitespace(right);
  if (a === b) return 1;
  if (!a || !b) return 0;
  const width = 64;
  const step = 32;
  const make = (value: string) => {
    const set = new Set<string>();
    if (value.length <= width) {
      set.add(sha256Text(value).slice(0, 24));
      return set;
    }
    for (let i = 0; i + width <= value.length; i += step) {
      set.add(sha256Text(value.slice(i, i + width)).slice(0, 24));
    }
    set.add(sha256Text(value.slice(-width)).slice(0, 24));
    return set;
  };
  const sa = make(a);
  const sb = make(b);
  let intersection = 0;
  for (const item of sa) if (sb.has(item)) intersection += 1;
  return intersection / Math.max(sa.size, sb.size, 1);
}

function orderedSliceCoverage(candidate: string, episodeBodies: string[]): {
  matched: boolean;
  coverage: number;
} {
  let cursor = 0;
  let covered = 0;
  for (const raw of episodeBodies) {
    const body = raw.trim();
    if (!body) continue;
    const index = candidate.indexOf(body, cursor);
    if (index < 0) return { matched: false, coverage: covered / Math.max(candidate.length, 1) };
    cursor = index + body.length;
    covered += body.length;
  }
  return {
    matched: true,
    coverage: covered / Math.max(candidate.length, 1),
  };
}

function compareCandidate(candidate: string, episodeBodies: string[]) {
  const joins = [
    episodeBodies.join(""),
    episodeBodies.join("\n"),
    episodeBodies.join("\n\n"),
    episodeBodies.map((value) => value.trim()).join(""),
    episodeBodies.map((value) => value.trim()).join("\n\n"),
  ].map((value) => value.trim());
  const exactJoin = joins.some((value) => value === candidate);
  const candidateCompact = compactWhitespace(candidate);
  const whitespaceOnly = joins.some(
    (value) => compactWhitespace(value) === candidateCompact
  );
  const ordered = orderedSliceCoverage(candidate, episodeBodies);
  const bestSimilarity = Math.max(
    ...joins.map((value) => shingleSimilarity(candidate, value))
  );
  let differenceType = "CONTENT_DIFF_OR_UNKNOWN";
  if (exactJoin) differenceType = "EXACT_NORMALIZED_TEXT";
  else if (whitespaceOnly) differenceType = "WHITESPACE_ONLY";
  else if (ordered.matched && ordered.coverage >= 0.95) {
    differenceType = "ORDERED_EXACT_SLICES_WITH_SMALL_GAPS";
  } else if (ordered.matched) {
    differenceType = "ORDERED_EXACT_SLICES_WITH_MATERIAL_GAPS";
  } else if (bestSimilarity >= 0.98) {
    differenceType = "HIGH_SIMILARITY_NOT_PROVENANCE_CONFIRMATION";
  }
  return {
    exactJoin,
    whitespaceOnly,
    orderedExactSlices: ordered.matched,
    orderedSliceCoverage: Number(ordered.coverage.toFixed(6)),
    shingleSimilarity: Number(bestSimilarity.toFixed(6)),
    differenceType,
  };
}

async function fetchAozoraText(rows: CsvRow[]): Promise<{
  rawBytes: Uint8Array;
  text: string;
}> {
  const primary = rows[0] ?? {};
  const url = primary["テキストファイルURL"]?.trim() ?? "";
  if (!isAllowedAozoraTextUrl(url)) {
    throw new Error("No allowlisted Aozora ZIP URL");
  }
  const response = await fetch(url, {
    redirect: "error",
    headers: {
      "user-agent": "LIB-read-Legacy-Rights-Audit/1.0 (+https://www.syosetu-libread.com)",
    },
  });
  if (!response.ok) {
    throw new Error("Aozora source HTTP " + response.status);
  }
  const zipBytes = new Uint8Array(await response.arrayBuffer());
  if (zipBytes.byteLength > 25_000_000) throw new Error("Aozora ZIP too large");
  const archive = unzipSync(zipBytes);
  const entries = Object.entries(archive).filter(([name]) =>
    /(?:^|\/)\w[^/]*\.txt$/iu.test(name)
  );
  if (entries.length !== 1) {
    throw new Error("Expected exactly one TXT in Aozora ZIP; found " + entries.length);
  }
  const rawBytes = entries[0]![1];
  const encoding = normalizeAozoraEncoding(
    primary["テキストファイル符号化方式"] ?? ""
  );
  return { rawBytes, text: decodeSourceBytes(rawBytes, encoding) };
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Production Supabase credentials are required");
  }

  const catalogResponse = await fetch(AOZORA_CATALOG_URL, {
    redirect: "error",
    headers: {
      "user-agent": "LIB-read-Legacy-Rights-Audit/1.0 (+https://www.syosetu-libread.com)",
    },
  });
  if (!catalogResponse.ok) {
    throw new Error("Aozora catalog HTTP " + catalogResponse.status);
  }
  const catalogZip = new Uint8Array(await catalogResponse.arrayBuffer());
  const catalogArchive = unzipSync(catalogZip);
  const csvEntry = Object.entries(catalogArchive).find(([name]) =>
    name.endsWith("list_person_all_extended_utf8.csv")
  );
  if (!csvEntry) throw new Error("Aozora catalog CSV missing");
  const rows = parseCsv(new TextDecoder("utf-8", { fatal: true }).decode(csvEntry[1]));
  const grouped = groupAozoraRows(rows);

  const candidateIndex = new Map<string, CsvRow[][]>();
  for (const sourceRows of grouped.values()) {
    const primary = sourceRows[0] ?? {};
    const title = primary["作品名"]?.trim() ?? "";
    const authorRows = sourceRows.filter((row) => row["役割フラグ"]?.trim() === "著者");
    const author = authorRows[0]
      ? String(authorRows[0]["姓"] ?? "").trim() + String(authorRows[0]["名"] ?? "").trim()
      : "";
    if (!title || !author) continue;
    const keyValue = canonical(TITLE_ALIASES[title] ?? title) + "|" + canonical(author);
    const current = candidateIndex.get(keyValue) ?? [];
    current.push(sourceRows);
    candidateIndex.set(keyValue, current);
  }

  const admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  let officialUserId: string | null = null;
  for (let page = 1; page <= 20 && !officialUserId; page += 1) {
    const users = await admin.auth.admin.listUsers({ page, perPage: 100 });
    if (users.error) throw users.error;
    officialUserId =
      users.data.users.find((user) => isOfficialAccountEmail(user.email))?.id ?? null;
    if (users.data.users.length < 100) break;
  }
  if (!officialUserId) throw new Error("Official account not found");

  const seriesResult = await admin
    .from("series")
    .select("id,title,created_at,is_public,publication_status,source_language,translation_permission_mode,recording_permission_mode,effect_settings")
    .eq("author_id", officialUserId)
    .order("created_at", { ascending: true });
  if (seriesResult.error) throw seriesResult.error;

  const legacy = (seriesResult.data ?? []).filter((row) => {
    const effect = row.effect_settings as Record<string, unknown> | null;
    const pd =
      effect && typeof effect === "object"
        ? (effect.publicDomain as Record<string, unknown> | undefined)
        : undefined;
    return pd?.rightsChecked !== true;
  });
  if (legacy.length !== 37) {
    throw new Error("Legacy series drift: expected 37, actual " + legacy.length);
  }

  const sourceCache = new Map<string, Promise<{ rawBytes: Uint8Array; text: string }>>();
  const reportSeries: Array<Record<string, unknown>> = [];

  for (const [seriesIndex, series] of legacy.entries()) {
    const episodesResult = await admin
      .from("episodes")
      .select("id,episode_number,title,body,is_published,posting_status,effect_settings")
      .eq("series_id", series.id)
      .order("episode_number", { ascending: true });
    if (episodesResult.error) throw episodesResult.error;
    const episodes = episodesResult.data ?? [];
    const author = authorForTitle(String(series.title));
    const isCollection = String(series.title).endsWith("・短編");

    const workUnits = isCollection
      ? episodes.map((episode) => ({
          title: TITLE_ALIASES[String(episode.title)] ?? String(episode.title),
          episodes: [episode],
        }))
      : [{
          title: baseTitle(String(series.title), author),
          episodes,
        }];

    const works: WorkEvidence[] = [];
    for (const unit of workUnits) {
      const bodies = unit.episodes.map((episode) => String(episode.body ?? ""));
      const lookupKey = canonical(unit.title) + "|" + canonical(author);
      const candidates = (candidateIndex.get(lookupKey) ?? [])
        .filter((candidateRows) =>
          isAllowedAozoraTextUrl(candidateRows[0]?.["テキストファイルURL"]?.trim() ?? "")
        )
        .slice(0, 8);

      const evidence: CandidateEvidence[] = [];
      for (const candidateRows of candidates) {
        const primary = candidateRows[0] ?? {};
        const workId = primary["作品ID"]?.trim() ?? "";
        const authorRows = candidateRows.filter((row) => row["役割フラグ"]?.trim() === "著者");
        const candidateAuthor = authorRows[0]
          ? String(authorRows[0]["姓"] ?? "").trim() + String(authorRows[0]["名"] ?? "").trim()
          : "";
        let rawSha: string | null = null;
        let normalizedSha: string | null = null;
        let normalizedChars: number | null = null;
        let comparison = {
          exactJoin: false,
          whitespaceOnly: false,
          orderedExactSlices: false,
          orderedSliceCoverage: 0,
          shingleSimilarity: 0,
          differenceType: "FETCH_FAILED",
        };
        let fetchError: string | null = null;
        try {
          if (!sourceCache.has(workId)) {
            sourceCache.set(workId, fetchAozoraText(candidateRows));
          }
          const source = await sourceCache.get(workId)!;
          rawSha = sha256Bytes(source.rawBytes);
          const normalized = normalizeSource(source.text, "aozora").displayText;
          normalizedSha = sha256Text(normalized);
          normalizedChars = normalized.length;
          comparison = compareCandidate(normalized, bodies);
        } catch (error) {
          fetchError = error instanceof Error ? error.message : String(error);
        }
        evidence.push({
          work_id: workId,
          title: primary["作品名"]?.trim() ?? "",
          author: candidateAuthor,
          card_url: primary["図書カードURL"]?.trim() ?? "",
          download_url: primary["テキストファイルURL"]?.trim() ?? "",
          first_publication: primary["初出"]?.trim() || null,
          first_publication_year: extractGregorianYear(primary["初出"] ?? ""),
          edition: primary["底本名1"]?.trim() || null,
          edition_publication_year: extractGregorianYear(primary["底本初版発行年1"] ?? ""),
          input_by: primary["入力者"]?.trim() || null,
          proofread_by: primary["校正者"]?.trim() || null,
          work_copyright_flags: Array.from(new Set(candidateRows.map((row) => row["作品著作権フラグ"]?.trim()).filter(Boolean))),
          contributor_roles: Array.from(new Set(candidateRows.map((row) => row["役割フラグ"]?.trim()).filter(Boolean))),
          contributor_copyright_flags: Array.from(new Set(candidateRows.map((row) => row["人物著作権フラグ"]?.trim()).filter(Boolean))),
          raw_sha256: rawSha,
          normalized_sha256: normalizedSha,
          normalized_chars: normalizedChars,
          exact_join: comparison.exactJoin,
          whitespace_only: comparison.whitespaceOnly,
          ordered_exact_slices: comparison.orderedExactSlices,
          ordered_slice_coverage: comparison.orderedSliceCoverage,
          shingle_similarity: comparison.shingleSimilarity,
          difference_type: comparison.differenceType,
          fetch_error: fetchError,
        });
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
      }

      evidence.sort((a, b) => {
        const score = (item: CandidateEvidence) =>
          (item.exact_join ? 10 : 0) +
          (item.whitespace_only ? 8 : 0) +
          (item.ordered_exact_slices ? 4 + item.ordered_slice_coverage : 0) +
          item.shingle_similarity;
        return score(b) - score(a);
      });

      works.push({
        work_title: unit.title,
        episode_ids: unit.episodes.map((episode) => String(episode.id)),
        production_chars: bodies.reduce((sum, body) => sum + body.length, 0),
        production_sha256_join_empty: sha256Text(bodies.join("")),
        candidate_count: evidence.length,
        best_candidate: evidence[0] ?? null,
        candidates: evidence,
      });
    }

    reportSeries.push({
      series_id: series.id,
      title: series.title,
      author,
      collection: isCollection,
      source_language: series.source_language,
      publication_status: series.publication_status,
      is_public: series.is_public,
      translation_permission_mode: series.translation_permission_mode,
      recording_permission_mode: series.recording_permission_mode,
      episode_count: episodes.length,
      max_episode_chars: Math.max(0, ...episodes.map((episode) => String(episode.body ?? "").length)),
      oversized_episode_count: episodes.filter((episode) => String(episode.body ?? "").length > 10000).length,
      existing_public_domain_metadata: null,
      works,
    });

    console.log(
      "AUDITED " + (seriesIndex + 1) + "/37 " + String(series.title) +
      " work_units=" + works.length +
      " candidates=" + works.reduce((sum, work) => sum + work.candidate_count, 0)
    );
  }

  const allWorks = reportSeries.flatMap((series) => series.works as WorkEvidence[]);
  const confirmed = allWorks.filter((work) => {
    const item = work.best_candidate;
    return !!item && (
      item.exact_join ||
      item.whitespace_only ||
      (item.ordered_exact_slices && item.ordered_slice_coverage >= 0.95)
    );
  }).length;
  const highSimilarityOnly = allWorks.filter((work) => {
    const item = work.best_candidate;
    return !!item &&
      !item.exact_join &&
      !item.whitespace_only &&
      !(item.ordered_exact_slices && item.ordered_slice_coverage >= 0.95) &&
      item.shingle_similarity >= 0.98;
  }).length;
  const noStrongMatch = allWorks.length - confirmed - highSimilarityOnly;

  const snapshot = {
    generated_at: new Date().toISOString(),
    review_date: REVIEW_DATE,
    mode: "READ_ONLY_PROVENANCE_RECOVERY",
    official_identity: OFFICIAL_ACCOUNT_EMAIL,
    summary: {
      legacy_series: legacy.length,
      work_units: allWorks.length,
      source_confirmed_work_units: confirmed,
      high_similarity_only_work_units: highSimilarityOnly,
      no_strong_match_work_units: noStrongMatch,
      recording_open_legacy_series: legacy.filter((row) => row.recording_permission_mode === "open").length,
      translation_open_legacy_series: legacy.filter((row) => row.translation_permission_mode === "open").length,
      oversized_legacy_series: reportSeries.filter((row) => Number(row.oversized_episode_count) > 0).length,
    },
    source_method: {
      provider: "Aozora Bunko official expanded UTF-8 catalog + per-work official ZIP",
      catalog_url: AOZORA_CATALOG_URL,
      normalizer: "existing scripts/public-domain/core.ts aozora profile",
      confirmation_rule: "exact normalized text, whitespace-only full-text equality, or ordered exact episode slices covering >=95% of candidate text",
      high_similarity_rule: ">=0.98 shingle similarity is reported but never treated as provenance confirmation",
      body_logging: "Production/source full text intentionally omitted",
    },
    series: reportSeries,
  };

  const output = resolve(process.cwd(), OUTPUT_PATH);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, JSON.stringify(snapshot, null, 2) + "\n", "utf8");
  console.log("WROTE " + OUTPUT_PATH);
  console.log(JSON.stringify(snapshot.summary));
  console.log("READ-ONLY AUDIT COMPLETE: no Production rows modified.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
