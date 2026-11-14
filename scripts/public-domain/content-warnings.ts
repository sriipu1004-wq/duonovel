// Advisory-only violence cue detection for Public Domain preparation.
//
// Owner direction (Issue #139, 2026-11-14): works with violent depictions should
// be recommended a `violence` content warning. This detector only RECOMMENDS a
// human review. It never sets `content_warnings` automatically:
// - false positives are expected (a word such as 「死」「血」「殺」 can appear in
//   a figurative, historical or non-graphic sentence);
// - false negatives are expected (violence can be described without any listed
//   word, especially in older orthography).
// A human must read the text and record the decision in the manifest
// (`content_warnings`, `content_warning_notes`) before import.

export type ViolenceCueHit = {
  cue: string;
  count: number;
};

export type ViolenceCueReport = {
  recommendViolence: boolean;
  hits: ViolenceCueHit[];
  totalHits: number;
};

// Cues are grouped by meaning only for readability; each entry is a literal
// regular expression source matched case-insensitively. Old (舊字) and new
// character forms are both listed for Aozora texts.
const VIOLENCE_CUES: ReadonlyArray<{ cue: string; pattern: string }> = [
  // suicide / self-harm
  { cue: "自殺", pattern: "自殺" },
  { cue: "自害", pattern: "自害" },
  { cue: "自刃", pattern: "自刃" },
  { cue: "切腹", pattern: "切腹" },
  { cue: "首を吊る/縊死", pattern: "首を[吊釣]|首[吊釣]り|縊死|縊[れり]" },
  { cue: "剃刀/喉を切る", pattern: "剃刀|喉を?[切斬突]|喉笛" },
  // killing / execution
  { cue: "殺す・殺される", pattern: "殺[しさすせそ]|殺害|人殺|惨殺|慘殺|虐殺|刺殺|斬殺|絞殺" },
  { cue: "死刑・処刑", pattern: "死刑|處刑|処刑|斬首|打首|絞首|磔|梟首" },
  // bodies / injury
  { cue: "死体・死骸", pattern: "死體|死体|死骸|屍|腐亂|腐乱" },
  { cue: "出血・流血", pattern: "血[だま]み?れ|血塗|流血|鮮血|血が[流噴出]|血を[吐流噴]" },
  { cue: "傷口・刺す", pattern: "傷口|突き刺|刺し[たて]" },
  // English
  { cue: "en: murder/kill", pattern: "\\b(?:murder(?:ed|s|ing)?|kill(?:ed|s|ing)?|slaughter(?:ed)?)\\b" },
  { cue: "en: suicide/execution", pattern: "\\b(?:suicide|executions?|executed|hanged|beheaded)\\b" },
  { cue: "en: corpse/blood", pattern: "\\b(?:corpses?|bloodied|bloody|bleeding)\\b" },
  // Korean
  { cue: "ko: 살인/자살/처형/시체", pattern: "살인|자살|처형|사형|시체|죽였|죽이" },
];

/** Minimum total cue hits before the advisory recommends `violence`. */
export const VIOLENCE_RECOMMENDATION_MIN_HITS = 1;

export function detectViolenceCues(text: string): ViolenceCueReport {
  const hits: ViolenceCueHit[] = [];
  for (const { cue, pattern } of VIOLENCE_CUES) {
    const count = Array.from(text.matchAll(new RegExp(pattern, "giu"))).length;
    if (count > 0) hits.push({ cue, count });
  }
  const totalHits = hits.reduce((sum, hit) => sum + hit.count, 0);
  return {
    recommendViolence: totalHits >= VIOLENCE_RECOMMENDATION_MIN_HITS,
    hits,
    totalHits,
  };
}

/**
 * Human-readable advisory lines for the preparation step. Never quotes source
 * passages; only cue labels and counts are printed.
 */
export function violenceAdvisoryLines(args: {
  manifestId: string;
  text: string;
  recordedWarnings: readonly string[] | undefined;
}): string[] {
  const report = detectViolenceCues(args.text);
  const recorded = args.recordedWarnings;
  const lines: string[] = [];
  if (report.recommendViolence) {
    const summary = report.hits.map((hit) => `${hit.cue}×${hit.count}`).join(", ");
    if (recorded?.includes("violence")) {
      lines.push(
        `ADVISORY ${args.manifestId}: violence cues found (${summary}); manifest already records content_warnings=violence.`
      );
    } else if (recorded !== undefined) {
      lines.push(
        `ADVISORY ${args.manifestId}: violence cues found (${summary}), but a human decision without violence is recorded. ` +
          "Keep it only if a human reading confirmed the cues are not violent depictions (keyword false positive)."
      );
    } else {
      lines.push(
        `ADVISORY ${args.manifestId}: VIOLENCE_REVIEW_RECOMMENDED — cues found (${summary}). ` +
          "Read the text; if it depicts violence (suicide, self-harm, execution, concrete descriptions of corpses, etc.) " +
          "record \"violence\" in content_warnings. This is a keyword heuristic with false positives and negatives; it never sets the warning automatically."
      );
    }
  } else {
    lines.push(
      `ADVISORY ${args.manifestId}: no violence cue words found. This does not prove the text is non-violent; a human reading is still required.`
    );
  }
  if (recorded === undefined) {
    lines.push(
      `ADVISORY ${args.manifestId}: content_warnings is not recorded yet; import is blocked until a human records it (use [] for none).`
    );
  }
  return lines;
}
