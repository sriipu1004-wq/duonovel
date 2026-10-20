import { createHash } from "node:crypto";

export type ExactSourceProbe = {
  manifestId: string;
  ordinal: number;
  phrase: string;
  characterCount: number;
  phraseSha256: string;
};

const JAPANESE_LITERAL_CLASS = "[一-龯々ぁ-ゖァ-ヶー、。！？「」『』]";
const PRIMARY_LENGTH = 24;
const RUBY_HEAVY_FALLBACK_LENGTH = 16;
const PROBE_COUNT = 3;

// Never join source across ruby/editorial annotations; every query probe
// must be a contiguous substring of the prepared (non-rewritten) Reader body.
export function selectExactJapaneseProbes(
  manifestId: string,
  chapters: Array<{ body: string }>
): ExactSourceProbe[] {
  if (!/^aozora-[0-9]{6}$/u.test(manifestId) || chapters.length === 0) {
    throw new Error("INVALID_EXACT_PROBE_SOURCE");
  }
  const source = chapters.map((chapter) => chapter.body).join("\n");
  const find = (length: number) => {
    const re = new RegExp(JAPANESE_LITERAL_CLASS + "{" + length + ",}", "gu");
    return Array.from(source.matchAll(re), (match) => match[0].slice(0, length));
  };
  let length = PRIMARY_LENGTH;
  let phrases = find(length);
  if (phrases.length < PROBE_COUNT) {
    length = RUBY_HEAVY_FALLBACK_LENGTH;
    phrases = find(length);
  }
  if (phrases.length < PROBE_COUNT) {
    throw new Error("EXACT_PROBE_TOO_FEW_RAW_CONTIGUOUS_SPANS");
  }
  const positions = [0, Math.floor(phrases.length / 2), phrases.length - 1];
  const selected = positions.map((index) => phrases[index]!);
  if (new Set(selected).size !== PROBE_COUNT ||
      selected.some((phrase) => !source.includes(phrase))) {
    throw new Error("EXACT_PROBE_NON_UNIQUE_OR_NOT_VERBATIM");
  }
  return selected.map((phrase, index) => ({
    manifestId,
    ordinal: index + 1,
    phrase,
    characterCount: length,
    phraseSha256: createHash("sha256").update(phrase, "utf8").digest("hex"),
  }));
}

const quoteSql = (value: string) => "'" + value.replace(/'/gu, "''") + "'";

export function publicJaExactProbeSql(probes: ExactSourceProbe[]): string {
  if (probes.length === 0 || probes.length > 30) {
    throw new Error("EXACT_PROBE_SQL_BATCH_SIZE");
  }
  const values = probes.map((probe) => {
    if (!/^aozora-[0-9]{6}$/u.test(probe.manifestId) ||
        !Number.isSafeInteger(probe.ordinal) || probe.ordinal < 1 ||
        ![16, 24].includes(probe.characterCount) ||
        probe.phrase.length !== probe.characterCount) {
      throw new Error("EXACT_PROBE_SQL_INPUT_INVALID");
    }
    return "(" + quoteSql(probe.manifestId) + ", " + probe.ordinal +
      ", " + quoteSql(probe.phrase) + ")";
  });
  return [
    "-- Child85 READ-ONLY probe, original Japanese public posted corpus only.",
    "-- Generated SQL contains short source excerpts: do not commit or publish.",
    "-- No hits does not exclude source-edition, semantic or translation overlaps.",
    "WITH probes(manifest_id, probe_index, needle) AS (",
    "  VALUES",
    "    " + values.join(",\n    "),
    "), corpus AS MATERIALIZED (",
    "  SELECT e.id AS episode_id, e.series_id, e.body",
    "  FROM public.episodes e",
    "  JOIN public.series s ON s.id = e.series_id",
    "  WHERE s.is_public IS TRUE AND s.publication_status = 'public'",
    "    AND s.source_language = 'ja' AND e.posting_status = 'posted'",
    ")",
    "SELECT p.manifest_id, p.probe_index,",
    "       count(DISTINCT c.episode_id) AS episode_hits,",
    "       count(DISTINCT c.series_id) AS series_hits,",
    "       (SELECT count(*) FROM corpus) AS eligible_ja_episodes",
    "FROM probes p",
    "LEFT JOIN corpus c ON position(p.needle in c.body) > 0",
    "GROUP BY p.manifest_id, p.probe_index",
    "ORDER BY p.manifest_id, p.probe_index;",
  ].join("\n");
}
