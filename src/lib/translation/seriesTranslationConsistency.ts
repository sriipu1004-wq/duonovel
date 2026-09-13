import type { SupportedLanguageTag } from "./languageRegistry";

export const MAX_GLOSSARY_PROMPT_TERMS = 60;
export const MAX_GLOSSARY_PROMPT_CHARS = 8_000;
export const MAX_GLOSSARY_NOTE_CHARS = 300;
export const MAX_PROFILE_NOTE_CHARS = 1_000;
export const MAX_FORMATTING_NOTE_CHARS = 800;
export const MAX_PREVIOUS_CONTEXT_CHARS = 2_000;

export type TranslationGlossaryStatus = "suggested" | "confirmed" | "disabled";
export type TranslationGlossaryOrigin = "ai" | "author" | "editor" | "system";
export type TranslationGlossaryTermType =
  | "character"
  | "person"
  | "place"
  | "organization"
  | "item"
  | "skill"
  | "magic"
  | "concept"
  | "title"
  | "other";

export type SeriesTranslationGlossaryEntry = {
  id: string;
  sourceTerm: string;
  termType: TranslationGlossaryTermType;
  sourceNote?: string | null;
  effectiveFromEpisodeNumber: number;
  origin: TranslationGlossaryOrigin;
  status: TranslationGlossaryStatus;
  isLocked: boolean;
  isGlobal: boolean;
};

export type SeriesTranslationGlossaryTarget = {
  glossaryEntryId: string;
  targetLanguage: SupportedLanguageTag;
  targetTerm: string;
  translationNote?: string | null;
  effectiveFromEpisodeNumber: number;
  origin: TranslationGlossaryOrigin;
  status: TranslationGlossaryStatus;
  isLocked: boolean;
};

export type ResolvedTranslationGlossaryTerm = {
  sourceTerm: string;
  targetTerm: string;
  note?: string;
  termType: TranslationGlossaryTermType;
  status: Exclude<TranslationGlossaryStatus, "disabled">;
  origin: TranslationGlossaryOrigin;
  isLocked: boolean;
};

export type SeriesTranslationProfile = {
  styleNotes?: string | null;
  honorificPolicy?: string | null;
  formattingNotes?: string | null;
};

export type TranslationPreviousEpisodeContext = {
  episodeNumber: number;
  sourceTail: string;
  targetTail?: string | null;
};

export type SeriesTranslationConsistencyContext = {
  glossaryTerms: ResolvedTranslationGlossaryTerm[];
  profile: SeriesTranslationProfile | null;
  previousEpisode: TranslationPreviousEpisodeContext | null;
  referenceChars: number;
};

function clampText(value: string | null | undefined, maxChars: number): string | null {
  const normalized = value?.trim() ?? "";
  if (!normalized) return null;
  return normalized.slice(0, maxChars);
}

function statusRank(status: TranslationGlossaryStatus): number {
  if (status === "confirmed") return 2;
  if (status === "suggested") return 1;
  return 0;
}

function originRank(origin: TranslationGlossaryOrigin): number {
  if (origin === "author" || origin === "editor") return 3;
  if (origin === "system") return 2;
  return 1;
}

export function glossaryCandidatePriority(args: {
  status: TranslationGlossaryStatus;
  origin: TranslationGlossaryOrigin;
  isLocked: boolean;
}): number {
  return (
    Number(args.isLocked) * 1_000 +
    originRank(args.origin) * 100 +
    statusRank(args.status) * 10
  );
}

export function shouldReplaceGlossaryTarget(
  existing: Pick<SeriesTranslationGlossaryTarget, "status" | "origin" | "isLocked">,
  candidate: Pick<SeriesTranslationGlossaryTarget, "status" | "origin" | "isLocked">
): boolean {
  if (existing.isLocked) return false;
  return glossaryCandidatePriority(candidate) > glossaryCandidatePriority(existing);
}

export function selectSeriesTranslationGlossary(args: {
  entries: SeriesTranslationGlossaryEntry[];
  targets: SeriesTranslationGlossaryTarget[];
  targetLanguage: SupportedLanguageTag;
  episodeNumber: number;
  currentSource: string;
  maxTerms?: number;
  maxChars?: number;
}): ResolvedTranslationGlossaryTerm[] {
  const maxTerms = Math.max(1, args.maxTerms ?? MAX_GLOSSARY_PROMPT_TERMS);
  const maxChars = Math.max(1, args.maxChars ?? MAX_GLOSSARY_PROMPT_CHARS);
  const targetByEntryId = new Map<string, SeriesTranslationGlossaryTarget>();

  for (const target of args.targets) {
    if (
      target.targetLanguage !== args.targetLanguage ||
      target.status === "disabled" ||
      target.effectiveFromEpisodeNumber > args.episodeNumber
    ) {
      continue;
    }

    const existing = targetByEntryId.get(target.glossaryEntryId);
    if (!existing || shouldReplaceGlossaryTarget(existing, target)) {
      targetByEntryId.set(target.glossaryEntryId, target);
    }
  }

  const candidates = args.entries
    .filter((entry) => {
      if (entry.status === "disabled") return false;
      if (entry.effectiveFromEpisodeNumber > args.episodeNumber) return false;
      if (!targetByEntryId.has(entry.id)) return false;
      return entry.isGlobal || args.currentSource.includes(entry.sourceTerm);
    })
    .map((entry) => {
      const target = targetByEntryId.get(entry.id)!;
      return {
        entry,
        target,
        relevant: args.currentSource.includes(entry.sourceTerm),
        priority:
          Math.max(
            glossaryCandidatePriority(entry),
            glossaryCandidatePriority(target)
          ) + Number(args.currentSource.includes(entry.sourceTerm)) * 10_000,
      };
    })
    .sort((left, right) => {
      const priorityDiff = right.priority - left.priority;
      if (priorityDiff !== 0) return priorityDiff;
      return right.entry.sourceTerm.length - left.entry.sourceTerm.length;
    });

  const selected: ResolvedTranslationGlossaryTerm[] = [];
  let usedChars = 0;

  for (const candidate of candidates) {
    if (selected.length >= maxTerms) break;

    const note = clampText(
      candidate.target.translationNote ?? candidate.entry.sourceNote,
      MAX_GLOSSARY_NOTE_CHARS
    );
    const itemChars =
      candidate.entry.sourceTerm.length +
      candidate.target.targetTerm.length +
      (note?.length ?? 0);

    if (selected.length > 0 && usedChars + itemChars > maxChars) continue;

    selected.push({
      sourceTerm: candidate.entry.sourceTerm,
      targetTerm: candidate.target.targetTerm,
      note: note ?? undefined,
      termType: candidate.entry.termType,
      status:
        candidate.entry.status === "suggested" || candidate.target.status === "suggested"
          ? "suggested"
          : "confirmed",
      origin:
        originRank(candidate.target.origin) >= originRank(candidate.entry.origin)
          ? candidate.target.origin
          : candidate.entry.origin,
      isLocked: candidate.entry.isLocked || candidate.target.isLocked,
    });
    usedChars += itemChars;
  }

  return selected;
}

export function normalizeSeriesTranslationProfile(
  profile: SeriesTranslationProfile | null | undefined
): SeriesTranslationProfile | null {
  if (!profile) return null;

  const normalized = {
    styleNotes: clampText(profile.styleNotes, MAX_PROFILE_NOTE_CHARS),
    honorificPolicy: clampText(profile.honorificPolicy, MAX_PROFILE_NOTE_CHARS),
    formattingNotes: clampText(profile.formattingNotes, MAX_FORMATTING_NOTE_CHARS),
  };

  if (
    !normalized.styleNotes &&
    !normalized.honorificPolicy &&
    !normalized.formattingNotes
  ) {
    return null;
  }

  return normalized;
}

export function tailTranslationContext(
  value: string | null | undefined,
  maxChars = MAX_PREVIOUS_CONTEXT_CHARS
): string {
  const normalized = value?.trim() ?? "";
  if (!normalized) return "";
  return normalized.slice(-Math.max(1, maxChars));
}

export function countTranslationConsistencyReferenceChars(args: {
  glossaryTerms: ResolvedTranslationGlossaryTerm[];
  profile: SeriesTranslationProfile | null;
  previousEpisode: TranslationPreviousEpisodeContext | null;
}): number {
  const glossaryChars = args.glossaryTerms.reduce(
    (total, term) =>
      total +
      term.sourceTerm.length +
      term.targetTerm.length +
      (term.note?.length ?? 0),
    0
  );
  const profileChars = args.profile
    ? (args.profile.styleNotes?.length ?? 0) +
      (args.profile.honorificPolicy?.length ?? 0) +
      (args.profile.formattingNotes?.length ?? 0)
    : 0;
  const previousChars = args.previousEpisode
    ? args.previousEpisode.sourceTail.length +
      (args.previousEpisode.targetTail?.length ?? 0)
    : 0;

  return glossaryChars + profileChars + previousChars;
}

export function emptySeriesTranslationConsistency(): SeriesTranslationConsistencyContext {
  return {
    glossaryTerms: [],
    profile: null,
    previousEpisode: null,
    referenceChars: 0,
  };
}

export function selectPreviousPublishedEpisodeCandidate<
  T extends { episodeNumber: number; isPublic: boolean },
>(candidates: T[], currentEpisodeNumber: number): T | null {
  return (
    candidates
      .filter(
        (candidate) =>
          candidate.isPublic && candidate.episodeNumber < currentEpisodeNumber
      )
      .sort((left, right) => right.episodeNumber - left.episodeNumber)[0] ?? null
  );
}
