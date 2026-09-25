import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
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

type FingerprintProfile = "raw" | "ws" | "markup";

type EpisodeFingerprint = {
  id: string;
  episode_number: number;
  title: string;
  chars: number;
  sha256: string;
  head64_sha256: string;
  tail64_sha256: string;
  ws_chars: number;
  ws_sha256: string;
  ws_head64_sha256: string;
  ws_tail64_sha256: string;
  markup_chars: number;
  markup_sha256: string;
  markup_head64_sha256: string;
  markup_tail64_sha256: string;
};

type SeriesFingerprint = {
  series_id: string;
  title: string;
  source_language: string;
  publication_status: string;
  is_public: boolean;
  translation_permission_mode: string;
  recording_permission_mode: string;
  episode_count: number;
  max_episode_chars: number;
  oversized_episode_count: number;
  production_chars: number;
  concat_empty_sha256: string;
  concat_lf_sha256: string;
  concat_double_lf_sha256: string;
  ws_chars: number;
  ws_concat_sha256: string;
  markup_chars: number;
  markup_concat_sha256: string;
  episodes: EpisodeFingerprint[];
};

type FingerprintSnapshot = {
  mode: string;
  body_included: boolean;
  legacy_count: number;
  series: SeriesFingerprint[];
};

type SliceMatch = {
  episode_id: string;
  episode_number: number;
  profile: FingerprintProfile;
  start: number;
  end: number;
  chars: number;
};

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
  raw_source_sha256: string | null;
  normalized_sha256: string | null;
  normalized_chars: number | null;
  source_retrieved_at: string | null;
  full_text_match_profile: FingerprintProfile | null;
  all_episode_slices_match: boolean;
  slice_match_profile: FingerprintProfile | null;
  ordered_slices: boolean;
  slice_coverage: number;
  matched_episode_count: number;
  expected_episode_count: number;
  difference_type: string;
  source_confirmed: boolean;
  matches: SliceMatch[];
  fetch_error: string | null;
};

type WorkEvidence = {
  work_title: string;
  episode_ids: string[];
  candidate_count: number;
  best_candidate: CandidateEvidence | null;
  candidates: CandidateEvidence[];
};

const REVIEW_DATE = "2026-09-25";
const INPUT_PATH =
  "public-domain/audits/legacy-official-production-fingerprints-2026-09-25.json";
const OUTPUT_PATH =
  "public-domain/audits/legacy-official-provenance-recovery-2026-09-25.json";
const AUTHOR_NAMES = [
  "芥川龍之介",
  "夏目漱石",
  "太宰治",
  "宮沢賢治",
  "江戸川乱歩",
] as const;
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
    .replace(
      /[・･·\s　「」『』【】（）()［］\[\]〈〉《》―—‐－:：,，.。!?！？'"“”‘’]/gu,
      ""
    )
    .toLowerCase();
}

function baseTitle(seriesTitle: string, author: string): string {
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

function stripWhitespace(value: string): string {
  return value.replace(/\s+/gu, "");
}

function stripAozoraMarkup(value: string): string {
  return value
    .replace(/《[^》]*》/gu, "")
    .replace(/［＃[^］]*］/gu, "")
    .replace(/｜/gu, "")
    .replace(/\s+/gu, "");
}

function profileText(value: string, profile: FingerprintProfile): string {
  if (profile === "raw") return value;
  if (profile === "ws") return stripWhitespace(value);
  return stripAozoraMarkup(value);
}

function codePoints(value: string): string[] {
  return Array.from(value);
}

function episodeProfile(
  episode: EpisodeFingerprint,
  profile: FingerprintProfile
): {
  chars: number;
  sha256: string;
  head64: string;
  tail64: string;
} {
  if (profile === "raw") {
    return {
      chars: episode.chars,
      sha256: episode.sha256,
      head64: episode.head64_sha256,
      tail64: episode.tail64_sha256,
    };
  }
  if (profile === "ws") {
    return {
      chars: episode.ws_chars,
      sha256: episode.ws_sha256,
      head64: episode.ws_head64_sha256,
      tail64: episode.ws_tail64_sha256,
    };
  }
  return {
    chars: episode.markup_chars,
    sha256: episode.markup_sha256,
    head64: episode.markup_head64_sha256,
    tail64: episode.markup_tail64_sha256,
  };
}

function wholeSeriesMatch(
  source: string,
  series: SeriesFingerprint,
  episodes: EpisodeFingerprint[]
): FingerprintProfile | null {
  if (episodes.length !== series.episodes.length) return null;
  const rawHash = sha256Text(source);
  const sourceChars = codePoints(source).length;
  const rawLengths = new Set([
    series.production_chars,
    series.production_chars + Math.max(series.episode_count - 1, 0),
    series.production_chars + Math.max(series.episode_count - 1, 0) * 2,
  ]);
  if (
    rawLengths.has(sourceChars) &&
    [
      series.concat_empty_sha256,
      series.concat_lf_sha256,
      series.concat_double_lf_sha256,
    ].includes(rawHash)
  ) {
    return "raw";
  }

  const ws = stripWhitespace(source);
  if (
    codePoints(ws).length === series.ws_chars &&
    sha256Text(ws) === series.ws_concat_sha256
  ) {
    return "ws";
  }

  const markup = stripAozoraMarkup(source);
  if (
    codePoints(markup).length === series.markup_chars &&
    sha256Text(markup) === series.markup_concat_sha256
  ) {
    return "markup";
  }
  return null;
}

function findEpisodeSlices(
  source: string,
  episodes: EpisodeFingerprint[],
  profile: FingerprintProfile
): {
  allMatched: boolean;
  ordered: boolean;
  coverage: number;
  matches: SliceMatch[];
} {
  const points = codePoints(profileText(source, profile));
  const sourceLength = points.length;
  const targets = episodes.map((episode) => ({
    episode,
    fp: episodeProfile(episode, profile),
  }));
  if (targets.some((target) => target.fp.chars < 1)) {
    return { allMatched: false, ordered: false, coverage: 0, matches: [] };
  }

  const byHead = new Map<string, typeof targets>();
  for (const target of targets) {
    const key = target.fp.chars >= 64 ? target.fp.head64 : target.fp.sha256;
    const list = byHead.get(key) ?? [];
    list.push(target);
    byHead.set(key, list);
  }

  const found = new Map<string, SliceMatch[]>();
  for (let start = 0; start < sourceLength; start += 1) {
    const remaining = sourceLength - start;
    const windowLength = remaining >= 64 ? 64 : remaining;
    if (windowLength < 1) break;
    const windowHash = sha256Text(points.slice(start, start + windowLength).join(""));
    const possible = byHead.get(windowHash);
    if (!possible) continue;

    for (const target of possible) {
      const length = target.fp.chars;
      if (start + length > sourceLength) continue;
      const chunk = points.slice(start, start + length).join("");
      if (sha256Text(chunk) !== target.fp.sha256) continue;
      const tail = points
        .slice(Math.max(start, start + length - 64), start + length)
        .join("");
      if (sha256Text(tail) !== target.fp.tail64) continue;
      const item: SliceMatch = {
        episode_id: target.episode.id,
        episode_number: target.episode.episode_number,
        profile,
        start,
        end: start + length,
        chars: length,
      };
      const list = found.get(target.episode.id) ?? [];
      list.push(item);
      found.set(target.episode.id, list);
    }
  }

  const selected: SliceMatch[] = [];
  let cursor = 0;
  for (const episode of [...episodes].sort(
    (a, b) => a.episode_number - b.episode_number
  )) {
    const options = (found.get(episode.id) ?? []).sort((a, b) => a.start - b.start);
    const choice = options.find((option) => option.start >= cursor) ?? options[0];
    if (!choice) continue;
    selected.push(choice);
    cursor = choice.end;
  }

  const allMatched = selected.length === episodes.length;
  const ordered =
    allMatched &&
    selected.every(
      (match, index) => index === 0 || match.start >= selected[index - 1]!.end
    );
  const covered = selected.reduce((sum, match) => sum + match.chars, 0);
  return {
    allMatched,
    ordered,
    coverage: Number((covered / Math.max(sourceLength, 1)).toFixed(6)),
    matches: selected,
  };
}

async function fetchAozoraText(rows: CsvRow[]): Promise<{
  rawBytes: Uint8Array;
  text: string;
  retrievedAt: string;
}> {
  const primary = rows[0] ?? {};
  const url = primary["テキストファイルURL"]?.trim() ?? "";
  if (!isAllowedAozoraTextUrl(url)) {
    throw new Error("No allowlisted Aozora ZIP URL");
  }
  const response = await fetch(url, {
    redirect: "error",
    headers: {
      "user-agent":
        "LIB-read-Legacy-Rights-Audit/1.0 (+https://www.syosetu-libread.com)",
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
    throw new Error(
      "Expected exactly one TXT in Aozora ZIP; found " + entries.length
    );
  }
  const rawBytes = entries[0]![1];
  const encoding = normalizeAozoraEncoding(
    primary["テキストファイル符号化方式"] ?? ""
  );
  return {
    rawBytes,
    text: decodeSourceBytes(rawBytes, encoding),
    retrievedAt: new Date().toISOString(),
  };
}

function candidateScore(item: CandidateEvidence): number {
  if (item.full_text_match_profile === "raw") return 100;
  if (item.full_text_match_profile === "ws") return 95;
  if (item.full_text_match_profile === "markup") return 80;
  if (item.source_confirmed && item.slice_match_profile === "raw") {
    return 70 + item.slice_coverage;
  }
  if (item.source_confirmed && item.slice_match_profile === "ws") {
    return 65 + item.slice_coverage;
  }
  if (item.source_confirmed && item.slice_match_profile === "markup") {
    return 50 + item.slice_coverage;
  }
  if (item.all_episode_slices_match) return 20 + item.slice_coverage;
  return item.matched_episode_count;
}

async function main() {
  const input = JSON.parse(
    readFileSync(resolve(process.cwd(), INPUT_PATH), "utf8")
  ) as FingerprintSnapshot;
  if (
    input.mode !== "READ_ONLY_HASH_FINGERPRINTS" ||
    input.body_included !== false ||
    input.legacy_count !== 37 ||
    input.series.length !== 37
  ) {
    throw new Error("Production fingerprint snapshot invariant failed");
  }

  const catalogResponse = await fetch(AOZORA_CATALOG_URL, {
    redirect: "error",
    headers: {
      "user-agent":
        "LIB-read-Legacy-Rights-Audit/1.0 (+https://www.syosetu-libread.com)",
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
  const rows = parseCsv(
    new TextDecoder("utf-8", { fatal: true }).decode(csvEntry[1])
  );
  const grouped = groupAozoraRows(rows);

  const candidateIndex = new Map<string, CsvRow[][]>();
  for (const sourceRows of grouped.values()) {
    const primary = sourceRows[0] ?? {};
    const title = primary["作品名"]?.trim() ?? "";
    const authorRows = sourceRows.filter(
      (row) => row["役割フラグ"]?.trim() === "著者"
    );
    const author = authorRows[0]
      ? String(authorRows[0]["姓"] ?? "").trim() +
        String(authorRows[0]["名"] ?? "").trim()
      : "";
    if (!title || !author) continue;
    const keyValue =
      canonical(TITLE_ALIASES[title] ?? title) + "|" + canonical(author);
    const current = candidateIndex.get(keyValue) ?? [];
    current.push(sourceRows);
    candidateIndex.set(keyValue, current);
  }

  const sourceCache = new Map<
    string,
    Promise<{ rawBytes: Uint8Array; text: string; retrievedAt: string }>
  >();
  const reportSeries: Array<Record<string, unknown>> = [];

  for (const [seriesIndex, series] of input.series.entries()) {
    const author = authorForTitle(series.title);
    const isCollection = series.title.endsWith("・短編");
    const workUnits = isCollection
      ? series.episodes.map((episode) => ({
          title: TITLE_ALIASES[episode.title] ?? episode.title,
          episodes: [episode],
        }))
      : [
          {
            title: baseTitle(series.title, author),
            episodes: series.episodes,
          },
        ];

    const works: WorkEvidence[] = [];
    for (const unit of workUnits) {
      const lookupKey = canonical(unit.title) + "|" + canonical(author);
      const candidates = (candidateIndex.get(lookupKey) ?? [])
        .filter((candidateRows) =>
          isAllowedAozoraTextUrl(
            candidateRows[0]?.["テキストファイルURL"]?.trim() ?? ""
          )
        )
        .slice(0, 8);

      const evidence: CandidateEvidence[] = [];
      for (const candidateRows of candidates) {
        const primary = candidateRows[0] ?? {};
        const workId = primary["作品ID"]?.trim() ?? "";
        const authorRows = candidateRows.filter(
          (row) => row["役割フラグ"]?.trim() === "著者"
        );
        const candidateAuthor = authorRows[0]
          ? String(authorRows[0]["姓"] ?? "").trim() +
            String(authorRows[0]["名"] ?? "").trim()
          : "";

        let rawSourceSha: string | null = null;
        let normalizedSha: string | null = null;
        let normalizedChars: number | null = null;
        let sourceRetrievedAt: string | null = null;
        let fullTextMatchProfile: FingerprintProfile | null = null;
        let allEpisodeSlicesMatch = false;
        let sliceMatchProfile: FingerprintProfile | null = null;
        let orderedSlices = false;
        let sliceCoverage = 0;
        let matchedEpisodeCount = 0;
        let differenceType = "FETCH_FAILED";
        let sourceConfirmed = false;
        let matches: SliceMatch[] = [];
        let fetchError: string | null = null;

        try {
          if (!sourceCache.has(workId)) {
            sourceCache.set(workId, fetchAozoraText(candidateRows));
          }
          const source = await sourceCache.get(workId)!;
          rawSourceSha = sha256Bytes(source.rawBytes);
          sourceRetrievedAt = source.retrievedAt;
          const normalized = normalizeSource(source.text, "aozora").displayText;
          normalizedSha = sha256Text(normalized);
          normalizedChars = codePoints(normalized).length;

          if (!isCollection) {
            fullTextMatchProfile = wholeSeriesMatch(
              normalized,
              series,
              unit.episodes
            );
          } else {
            const episode = unit.episodes[0]!;
            for (const profile of ["raw", "ws", "markup"] as const) {
              const candidateProfile = profileText(normalized, profile);
              const fp = episodeProfile(episode, profile);
              if (
                codePoints(candidateProfile).length === fp.chars &&
                sha256Text(candidateProfile) === fp.sha256
              ) {
                fullTextMatchProfile = profile;
                break;
              }
            }
          }

          if (fullTextMatchProfile) {
            allEpisodeSlicesMatch = true;
            orderedSlices = true;
            sliceCoverage = 1;
            matchedEpisodeCount = unit.episodes.length;
            sliceMatchProfile = fullTextMatchProfile;
            differenceType =
              fullTextMatchProfile === "raw"
                ? "EXACT_FULL_NORMALIZED_TEXT"
                : fullTextMatchProfile === "ws"
                  ? "FULL_TEXT_WHITESPACE_ONLY_DIFFERENCE"
                  : "FULL_TEXT_AOZORA_MARKUP_DIFFERENCE";
            sourceConfirmed =
              fullTextMatchProfile === "raw" || fullTextMatchProfile === "ws";
          } else {
            let best:
              | {
                  profile: FingerprintProfile;
                  allMatched: boolean;
                  ordered: boolean;
                  coverage: number;
                  matches: SliceMatch[];
                }
              | undefined;
            for (const profile of ["raw", "ws", "markup"] as const) {
              const result = findEpisodeSlices(
                normalized,
                unit.episodes,
                profile
              );
              const candidate = { profile, ...result };
              if (
                !best ||
                Number(candidate.allMatched) > Number(best.allMatched) ||
                (candidate.allMatched === best.allMatched &&
                  Number(candidate.ordered) > Number(best.ordered)) ||
                (candidate.allMatched === best.allMatched &&
                  candidate.ordered === best.ordered &&
                  candidate.coverage > best.coverage)
              ) {
                best = candidate;
              }
            }
            if (best) {
              allEpisodeSlicesMatch = best.allMatched;
              orderedSlices = best.ordered;
              sliceCoverage = best.coverage;
              matchedEpisodeCount = best.matches.length;
              sliceMatchProfile = best.profile;
              matches = best.matches;
              sourceConfirmed =
                best.allMatched &&
                best.ordered &&
                best.coverage >= 0.95 &&
                (best.profile === "raw" || best.profile === "ws");
              if (sourceConfirmed) {
                differenceType =
                  best.profile === "raw"
                    ? "ORDERED_EXACT_EPISODE_SLICES_GE95"
                    : "ORDERED_WHITESPACE_NORMALIZED_EPISODE_SLICES_GE95";
              } else if (
                best.allMatched &&
                best.ordered &&
                best.coverage >= 0.95 &&
                best.profile === "markup"
              ) {
                differenceType =
                  "AOZORA_MARKUP_NORMALIZED_GE95_NOT_PROVENANCE_APPROVAL";
              } else if (best.allMatched && best.ordered) {
                differenceType =
                  "ORDERED_EXACT_SLICES_WITH_MATERIAL_GAPS_SOURCE_UNCERTAIN";
              } else if (best.matches.length > 0) {
                differenceType =
                  "PARTIAL_EXACT_SLICE_MATCH_SOURCE_UNCERTAIN";
              } else {
                differenceType = "NO_CRYPTOGRAPHIC_TEXT_MATCH";
              }
            }
          }
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
          edition_publication_year: extractGregorianYear(
            primary["底本初版発行年1"] ?? ""
          ),
          input_by: primary["入力者"]?.trim() || null,
          proofread_by: primary["校正者"]?.trim() || null,
          work_copyright_flags: Array.from(
            new Set(
              candidateRows
                .map((row) => row["作品著作権フラグ"]?.trim())
                .filter(Boolean)
            )
          ),
          contributor_roles: Array.from(
            new Set(
              candidateRows
                .map((row) => row["役割フラグ"]?.trim())
                .filter(Boolean)
            )
          ),
          contributor_copyright_flags: Array.from(
            new Set(
              candidateRows
                .map((row) => row["人物著作権フラグ"]?.trim())
                .filter(Boolean)
            )
          ),
          raw_source_sha256: rawSourceSha,
          normalized_sha256: normalizedSha,
          normalized_chars: normalizedChars,
          source_retrieved_at: sourceRetrievedAt,
          full_text_match_profile: fullTextMatchProfile,
          all_episode_slices_match: allEpisodeSlicesMatch,
          slice_match_profile: sliceMatchProfile,
          ordered_slices: orderedSlices,
          slice_coverage: sliceCoverage,
          matched_episode_count: matchedEpisodeCount,
          expected_episode_count: unit.episodes.length,
          difference_type: differenceType,
          source_confirmed: sourceConfirmed,
          matches,
          fetch_error: fetchError,
        });
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
      }

      evidence.sort((a, b) => candidateScore(b) - candidateScore(a));
      works.push({
        work_title: unit.title,
        episode_ids: unit.episodes.map((episode) => episode.id),
        candidate_count: evidence.length,
        best_candidate: evidence[0] ?? null,
        candidates: evidence,
      });
    }

    reportSeries.push({
      series_id: series.series_id,
      title: series.title,
      author,
      collection: isCollection,
      source_language: series.source_language,
      publication_status: series.publication_status,
      is_public: series.is_public,
      translation_permission_mode: series.translation_permission_mode,
      recording_permission_mode: series.recording_permission_mode,
      episode_count: series.episode_count,
      max_episode_chars: series.max_episode_chars,
      oversized_episode_count: series.oversized_episode_count,
      works,
    });

    console.log(
      "AUDITED " +
        (seriesIndex + 1) +
        "/37 " +
        series.title +
        " work_units=" +
        works.length +
        " candidates=" +
        works.reduce((sum, work) => sum + work.candidate_count, 0)
    );
  }

  const allWorks = reportSeries.flatMap(
    (series) => series.works as WorkEvidence[]
  );
  const sourceConfirmed = allWorks.filter(
    (work) => work.best_candidate?.source_confirmed === true
  ).length;
  const markupOnly = allWorks.filter((work) =>
    work.candidates.some(
      (candidate) =>
        candidate.difference_type ===
        "AOZORA_MARKUP_NORMALIZED_GE95_NOT_PROVENANCE_APPROVAL"
    )
  ).length;
  const noCandidate = allWorks.filter((work) => work.candidate_count === 0).length;
  const sourceUncertain = allWorks.length - sourceConfirmed;

  const snapshot = {
    generated_at: new Date().toISOString(),
    review_date: REVIEW_DATE,
    mode: "READ_ONLY_HASH_PROVENANCE_RECOVERY",
    production_body_exported: false,
    summary: {
      legacy_series: input.series.length,
      legacy_episodes: input.series.reduce(
        (sum, series) => sum + series.episode_count,
        0
      ),
      work_units: allWorks.length,
      source_confirmed_work_units: sourceConfirmed,
      source_uncertain_work_units: sourceUncertain,
      markup_only_work_units: markupOnly,
      no_aozora_candidate_work_units: noCandidate,
      recording_open_legacy_series: input.series.filter(
        (series) => series.recording_permission_mode === "open"
      ).length,
      translation_open_legacy_series: input.series.filter(
        (series) => series.translation_permission_mode === "open"
      ).length,
      oversized_legacy_series: input.series.filter(
        (series) => series.oversized_episode_count > 0
      ).length,
    },
    source_method: {
      production_evidence:
        "irreversible SHA-256 fingerprints only; no Production body text committed",
      provider:
        "Aozora Bunko official expanded UTF-8 catalog + per-work official ZIP",
      catalog_url: AOZORA_CATALOG_URL,
      normalizer:
        "existing scripts/public-domain/core.ts Aozora normalization profile",
      approval_strength_rule:
        "source_confirmed=true only for full normalized raw/whitespace equality, or every Production episode cryptographically matching ordered raw/whitespace source slices with >=95% source coverage",
      excluded_from_confirmation:
        "Aozora-markup-only equality, partial slice matches, and approximate/title-only similarity",
      source_hash:
        "raw_source_sha256 is SHA-256 of the exact TXT bytes extracted from the provider ZIP fetched during this audit",
    },
    series: reportSeries,
  };

  const output = resolve(process.cwd(), OUTPUT_PATH);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, JSON.stringify(snapshot, null, 2) + "\n", "utf8");
  console.log("WROTE " + OUTPUT_PATH);
  console.log(JSON.stringify(snapshot.summary));
  console.log(
    "READ-ONLY AUDIT COMPLETE: no database row was read by this workflow and no Production row was modified."
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
