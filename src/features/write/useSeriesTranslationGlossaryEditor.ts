"use client";

import { useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  LANGUAGE_REGISTRY,
  type SupportedLanguageTag,
} from "@/lib/translation/languageRegistry";
import type {
  SeriesTranslationGlossaryEntryRow,
  SeriesTranslationGlossaryTargetRow,
  SeriesTranslationGlossaryWorkspaceProps,
  SeriesTranslationProfileRow,
} from "@/features/write/seriesTranslationGlossaryWorkspaceShared";

export type GlossaryStatus = "suggested" | "confirmed" | "disabled";

function numberOrOne(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : 1;
}

export function useSeriesTranslationGlossaryEditor(
  props: SeriesTranslationGlossaryWorkspaceProps,
  savedMessage: string,
  failedMessage: string
) {
  const targetLanguages = useMemo(
    () =>
      (Object.keys(LANGUAGE_REGISTRY) as SupportedLanguageTag[]).filter(
        (language) => language !== props.sourceLanguage
      ),
    [props.sourceLanguage]
  );
  const [targetLanguage, setTargetLanguage] = useState<SupportedLanguageTag>(
    targetLanguages[0] ?? "en"
  );
  const [entries, setEntries] = useState(props.initialEntries);
  const [targets, setTargets] = useState(props.initialTargets);
  const [profiles, setProfiles] = useState(props.initialProfiles);
  const [editingTargetId, setEditingTargetId] = useState<string | null>(null);
  const [sourceTerm, setSourceTerm] = useState("");
  const [targetTerm, setTargetTerm] = useState("");
  const [termType, setTermType] = useState("other");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<GlossaryStatus>("confirmed");
  const [isLocked, setIsLocked] = useState(true);
  const [isGlobal, setIsGlobal] = useState(false);
  const [effectiveFrom, setEffectiveFrom] = useState("1");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [profileDrafts, setProfileDrafts] = useState<
    Record<string, { style: string; honorific: string; formatting: string }>
  >(() =>
    Object.fromEntries(
      props.initialProfiles.map((item) => [
        item.target_language,
        {
          style: item.style_notes ?? "",
          honorific: item.honorific_policy ?? "",
          formatting: item.formatting_notes ?? "",
        },
      ])
    )
  );

  const visibleTargets = targets
    .filter((target) => target.target_language === targetLanguage)
    .map((target) => ({
      target,
      entry: entries.find((entry) => entry.id === target.glossary_entry_id),
    }))
    .filter(
      (item): item is {
        target: SeriesTranslationGlossaryTargetRow;
        entry: SeriesTranslationGlossaryEntryRow;
      } => Boolean(item.entry)
    )
    .sort((left, right) =>
      left.entry.source_term.localeCompare(right.entry.source_term)
    );
  const profile = profiles.find(
    (candidate) => candidate.target_language === targetLanguage
  );
  const profileDraft = profileDrafts[targetLanguage] ?? {
    style: profile?.style_notes ?? "",
    honorific: profile?.honorific_policy ?? "",
    formatting: profile?.formatting_notes ?? "",
  };

  function resetForm() {
    setEditingTargetId(null);
    setSourceTerm("");
    setTargetTerm("");
    setTermType("other");
    setNote("");
    setStatus("confirmed");
    setIsLocked(true);
    setIsGlobal(false);
    setEffectiveFrom("1");
  }

  function changeTargetLanguage(language: SupportedLanguageTag) {
    setTargetLanguage(language);
    resetForm();
  }

  function beginEdit(
    entry: SeriesTranslationGlossaryEntryRow,
    target: SeriesTranslationGlossaryTargetRow
  ) {
    setEditingTargetId(target.id);
    setSourceTerm(entry.source_term);
    setTargetTerm(target.target_term);
    setTermType(entry.term_type || "other");
    setNote(target.translation_note ?? entry.source_note ?? "");
    setStatus(
      target.status === "suggested" || target.status === "disabled"
        ? target.status
        : "confirmed"
    );
    setIsLocked(entry.is_locked || target.is_locked);
    setIsGlobal(entry.is_global);
    setEffectiveFrom(
      String(
        Math.max(
          entry.effective_from_episode_number || 1,
          target.effective_from_episode_number || 1
        )
      )
    );
  }

  async function saveTerm() {
    const cleanSource = sourceTerm.trim();
    const cleanTarget = targetTerm.trim();
    if (!cleanSource || !cleanTarget || saving) return;
    setSaving(true);
    setMessage("");
    try {
      const effective = numberOrOne(effectiveFrom);
      const existingTarget = editingTargetId
        ? targets.find((candidate) => candidate.id === editingTargetId)
        : null;
      let entry = existingTarget
        ? entries.find(
            (candidate) => candidate.id === existingTarget.glossary_entry_id
          )
        : entries.find((candidate) => candidate.source_term === cleanSource);
      const entryPayload = {
        source_term: cleanSource,
        term_type: termType,
        source_note: note.trim() || null,
        effective_from_episode_number: effective,
        origin: "author",
        status: "confirmed",
        is_locked: isLocked,
        is_global: isLocked && isGlobal,
        updated_at: new Date().toISOString(),
      };
      if (entry) {
        const result = await supabase
          .from("series_translation_glossary_entries")
          .update(entryPayload)
          .eq("id", entry.id)
          .select("*")
          .single();
        if (result.error || !result.data) throw result.error;
        entry = result.data as SeriesTranslationGlossaryEntryRow;
        const savedEntry = entry;
        setEntries((current) => [
          ...current.filter((candidate) => candidate.id !== savedEntry.id),
          savedEntry,
        ]);
      } else {
        const result = await supabase
          .from("series_translation_glossary_entries")
          .insert({
            ...entryPayload,
            series_id: props.seriesId,
            source_language: props.sourceLanguage,
            created_by_user_id: props.currentUserId,
          })
          .select("*")
          .single();
        if (result.error || !result.data) throw result.error;
        entry = result.data as SeriesTranslationGlossaryEntryRow;
        const savedEntry = entry;
        setEntries((current) => [...current, savedEntry]);
      }

      const targetPayload = {
        glossary_entry_id: entry.id,
        target_language: targetLanguage,
        target_term: cleanTarget,
        translation_note: note.trim() || null,
        origin: "author",
        status,
        is_locked: isLocked,
        effective_from_episode_number: effective,
        updated_at: new Date().toISOString(),
      };
      const result = existingTarget
        ? await supabase
            .from("series_translation_glossary_targets")
            .update(targetPayload)
            .eq("id", existingTarget.id)
            .select("*")
            .single()
        : await supabase
            .from("series_translation_glossary_targets")
            .upsert(targetPayload, {
              onConflict: "glossary_entry_id,target_language",
            })
            .select("*")
            .single();
      if (result.error || !result.data) throw result.error;
      const savedTarget = result.data as SeriesTranslationGlossaryTargetRow;
      setTargets((current) => [
        ...current.filter((candidate) => candidate.id !== savedTarget.id),
        savedTarget,
      ]);
      resetForm();
      setMessage(savedMessage);
    } catch {
      setMessage(failedMessage);
    } finally {
      setSaving(false);
    }
  }

  async function toggleDisabled(target: SeriesTranslationGlossaryTargetRow) {
    const nextStatus = target.status === "disabled" ? "confirmed" : "disabled";
    const result = await supabase
      .from("series_translation_glossary_targets")
      .update({
        status: nextStatus,
        origin: "author",
        updated_at: new Date().toISOString(),
      })
      .eq("id", target.id)
      .select("*")
      .single();
    if (result.error || !result.data) {
      setMessage(failedMessage);
      return;
    }
    const saved = result.data as SeriesTranslationGlossaryTargetRow;
    setTargets((current) => [
      ...current.filter((candidate) => candidate.id !== saved.id),
      saved,
    ]);
  }

  async function deleteTarget(target: SeriesTranslationGlossaryTargetRow) {
    const result = await supabase
      .from("series_translation_glossary_targets")
      .delete()
      .eq("id", target.id);
    if (result.error) {
      setMessage(failedMessage);
      return;
    }
    setTargets((current) =>
      current.filter((candidate) => candidate.id !== target.id)
    );
    if (editingTargetId === target.id) resetForm();
  }

  async function saveProfile() {
    setSaving(true);
    setMessage("");
    const result = await supabase
      .from("series_translation_profiles")
      .upsert(
        {
          series_id: props.seriesId,
          target_language: targetLanguage,
          style_notes: profileDraft.style.trim() || null,
          honorific_policy: profileDraft.honorific.trim() || null,
          formatting_notes: profileDraft.formatting.trim() || null,
          origin: "author",
          updated_by_user_id: props.currentUserId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "series_id,target_language" }
      )
      .select("*")
      .single();
    setSaving(false);
    if (result.error || !result.data) {
      setMessage(failedMessage);
      return;
    }
    const saved = result.data as SeriesTranslationProfileRow;
    setProfiles((current) => [
      ...current.filter(
        (candidate) => candidate.target_language !== targetLanguage
      ),
      saved,
    ]);
    setMessage(savedMessage);
  }

  function updateProfileDraft(
    key: "style" | "honorific" | "formatting",
    value: string
  ) {
    setProfileDrafts((current) => ({
      ...current,
      [targetLanguage]: { ...profileDraft, [key]: value },
    }));
  }

  return {
    targetLanguages,
    targetLanguage,
    changeTargetLanguage,
    visibleTargets,
    editingTargetId,
    sourceTerm,
    setSourceTerm,
    targetTerm,
    setTargetTerm,
    termType,
    setTermType,
    note,
    setNote,
    status,
    setStatus,
    isLocked,
    setIsLocked,
    isGlobal,
    setIsGlobal,
    effectiveFrom,
    setEffectiveFrom,
    message,
    saving,
    resetForm,
    beginEdit,
    saveTerm,
    toggleDisabled,
    deleteTarget,
    profileDraft,
    updateProfileDraft,
    saveProfile,
  };
}
