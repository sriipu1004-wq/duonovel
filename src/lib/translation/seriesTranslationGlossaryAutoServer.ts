import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { SupportedLanguageTag } from "@/lib/translation/languageRegistry";
import type { AiTranslationGlossaryCandidate } from "@/lib/translation/publicEpisodeTranslation";

const MAX_SERIES_GLOSSARY_ENTRIES = 500;
const MAX_AUTO_CANDIDATES_PER_TRANSLATION = 12;

type EntryRow = {
  id: string;
  source_term: string;
  origin: string;
  status: string;
  is_locked: boolean;
  effective_from_episode_number: number;
};

function normalizeSurface(value: string, maxChars: number): string {
  return value.normalize("NFKC").trim().slice(0, maxChars);
}

function positiveEpisodeNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : 1;
}

export async function persistAiSeriesTranslationGlossaryCandidates(args: {
  seriesId: string;
  episodeId: string;
  episodeNumber: number;
  sourceLanguage: SupportedLanguageTag;
  targetLanguage: SupportedLanguageTag;
  currentSource: string;
  candidates: AiTranslationGlossaryCandidate[];
}): Promise<void> {
  if (
    args.sourceLanguage === args.targetLanguage ||
    args.candidates.length === 0
  ) {
    return;
  }

  const currentSource = args.currentSource.normalize("NFKC");
  const seenSourceTerms = new Set<string>();
  const candidates = args.candidates
    .slice(0, MAX_AUTO_CANDIDATES_PER_TRANSLATION)
    .map((candidate) => ({
      sourceTerm: normalizeSurface(candidate.sourceTerm, 120),
      targetTerm: normalizeSurface(candidate.targetTerm, 200),
      termType: candidate.termType,
    }))
    .filter((candidate) => {
      if (!candidate.sourceTerm || !candidate.targetTerm) return false;
      if (!currentSource.includes(candidate.sourceTerm)) return false;
      if (seenSourceTerms.has(candidate.sourceTerm)) return false;
      seenSourceTerms.add(candidate.sourceTerm);
      return true;
    });

  if (candidates.length === 0) return;

  const admin = createAdminClient();
  const seriesResult = await admin
    .from("series")
    .select("id, source_language")
    .eq("id", args.seriesId)
    .maybeSingle();

  if (
    seriesResult.error ||
    !seriesResult.data ||
    seriesResult.data.source_language !== args.sourceLanguage
  ) {
    return;
  }

  const existingEntriesResult = await admin
    .from("series_translation_glossary_entries")
    .select("id, source_term, origin, status, is_locked, effective_from_episode_number")
    .eq("series_id", args.seriesId)
    .eq("source_language", args.sourceLanguage)
    .limit(MAX_SERIES_GLOSSARY_ENTRIES);

  if (existingEntriesResult.error) return;

  let entries = (existingEntriesResult.data ?? []) as EntryRow[];
  const entryBySource = new Map(
    entries.map((entry) => [entry.source_term.normalize("NFKC"), entry])
  );
  const remainingSlots = Math.max(
    0,
    MAX_SERIES_GLOSSARY_ENTRIES - entries.length
  );
  const missingEntries = candidates
    .filter((candidate) => !entryBySource.has(candidate.sourceTerm))
    .slice(0, remainingSlots);

  if (missingEntries.length > 0) {
    await admin.from("series_translation_glossary_entries").upsert(
      missingEntries.map((candidate) => ({
        series_id: args.seriesId,
        source_language: args.sourceLanguage,
        source_term: candidate.sourceTerm,
        term_type: candidate.termType,
        source_note: null,
        first_seen_episode_id: args.episodeId,
        effective_from_episode_number: args.episodeNumber,
        origin: "ai",
        status: "suggested",
        is_locked: false,
        is_global: false,
        created_by_user_id: null,
        updated_at: new Date().toISOString(),
      })),
      {
        onConflict: "series_id,source_language,source_term",
        ignoreDuplicates: true,
      }
    );

    const refreshedEntriesResult = await admin
      .from("series_translation_glossary_entries")
      .select("id, source_term, origin, status, is_locked, effective_from_episode_number")
      .eq("series_id", args.seriesId)
      .eq("source_language", args.sourceLanguage)
      .limit(MAX_SERIES_GLOSSARY_ENTRIES);
    if (refreshedEntriesResult.error) return;
    entries = (refreshedEntriesResult.data ?? []) as EntryRow[];
  }

  const refreshedEntryBySource = new Map(
    entries.map((entry) => [entry.source_term.normalize("NFKC"), entry])
  );
  const candidateEntries = candidates
    .map((candidate) => ({
      candidate,
      entry: refreshedEntryBySource.get(candidate.sourceTerm) ?? null,
    }))
    .filter(
      (item): item is { candidate: (typeof candidates)[number]; entry: EntryRow } =>
        Boolean(item.entry)
    )
    .filter(({ entry }) => {
      if (entry.status === "disabled") return false;
      if (entry.is_locked && (entry.origin === "author" || entry.origin === "editor")) {
        return positiveEpisodeNumber(entry.effective_from_episode_number) <= args.episodeNumber;
      }
      return positiveEpisodeNumber(entry.effective_from_episode_number) <= args.episodeNumber;
    });

  if (candidateEntries.length === 0) return;

  const targetResult = await admin
    .from("series_translation_glossary_targets")
    .select("id, glossary_entry_id, target_language, origin, status, is_locked")
    .in(
      "glossary_entry_id",
      candidateEntries.map(({ entry }) => entry.id)
    )
    .eq("target_language", args.targetLanguage);

  if (targetResult.error) return;
  const existingTargetEntryIds = new Set(
    (targetResult.data ?? []).map((row) => String(row.glossary_entry_id))
  );
  const missingTargets = candidateEntries.filter(
    ({ entry }) => !existingTargetEntryIds.has(entry.id)
  );
  if (missingTargets.length === 0) return;

  await admin.from("series_translation_glossary_targets").upsert(
    missingTargets.map(({ candidate, entry }) => ({
      glossary_entry_id: entry.id,
      target_language: args.targetLanguage,
      target_term: candidate.targetTerm,
      translation_note: null,
      origin: "ai",
      status: "suggested",
      is_locked: false,
      first_seen_episode_id: args.episodeId,
      effective_from_episode_number: args.episodeNumber,
      updated_at: new Date().toISOString(),
    })),
    {
      onConflict: "glossary_entry_id,target_language",
      ignoreDuplicates: true,
    }
  );
}
