"use client";

import type { ChangeEvent } from "react";
import { getSupportedLanguage } from "@/lib/translation/languageRegistry";
import { useUiLocale } from "@/i18n/UiLocaleProvider";
import {
  SERIES_TRANSLATION_GLOSSARY_COPY,
  TERM_TYPES,
  type SeriesTranslationGlossaryWorkspaceProps,
} from "@/features/write/seriesTranslationGlossaryWorkspaceShared";
import {
  useSeriesTranslationGlossaryEditor,
  type GlossaryStatus,
} from "@/features/write/useSeriesTranslationGlossaryEditor";

export type {
  SeriesTranslationGlossaryEntryRow,
  SeriesTranslationGlossaryTargetRow,
  SeriesTranslationProfileRow,
} from "@/features/write/seriesTranslationGlossaryWorkspaceShared";

export default function SeriesTranslationGlossaryWorkspace(
  props: SeriesTranslationGlossaryWorkspaceProps
) {
  const copy = SERIES_TRANSLATION_GLOSSARY_COPY[useUiLocale()];
  const editor = useSeriesTranslationGlossaryEditor(props, copy.saved, copy.failed);

  return (
    <section id="translation-glossary" className="mx-auto w-full max-w-5xl px-4 pb-8 sm:px-6">
      <details className="rounded-[28px] border border-black/10 bg-white p-5" open>
        <summary className="cursor-pointer text-lg font-semibold">{copy.title}</summary>
        <p className="mt-2 text-sm text-neutral-600">{copy.help}</p>
        <div className="mt-5 grid gap-3 rounded-2xl bg-neutral-50 p-4 md:grid-cols-2">
          <label className="grid gap-1 md:col-span-2">
            <span className="text-xs text-neutral-600">{copy.targetLanguage}</span>
            <select value={editor.targetLanguage} onChange={(e: ChangeEvent<HTMLSelectElement>) => editor.changeTargetLanguage(e.target.value as typeof editor.targetLanguage)} className="rounded-xl border p-2">
              {editor.targetLanguages.map((language) => <option key={language} value={language}>{getSupportedLanguage(language).nativeLabel}</option>)}
            </select>
          </label>
          <label className="grid gap-1"><span className="text-xs">{copy.sourceTerm}</span><input maxLength={120} value={editor.sourceTerm} onChange={(e: ChangeEvent<HTMLInputElement>) => editor.setSourceTerm(e.target.value)} className="rounded-xl border p-2" /></label>
          <label className="grid gap-1"><span className="text-xs">{copy.targetTerm}</span><input maxLength={200} value={editor.targetTerm} onChange={(e: ChangeEvent<HTMLInputElement>) => editor.setTargetTerm(e.target.value)} className="rounded-xl border p-2" /></label>
          <label className="grid gap-1"><span className="text-xs">{copy.type}</span><select value={editor.termType} onChange={(e: ChangeEvent<HTMLSelectElement>) => editor.setTermType(e.target.value)} className="rounded-xl border p-2">{TERM_TYPES.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <label className="grid gap-1"><span className="text-xs">{copy.status}</span><select value={editor.status} onChange={(e: ChangeEvent<HTMLSelectElement>) => editor.setStatus(e.target.value as GlossaryStatus)} className="rounded-xl border p-2"><option value="confirmed">{copy.confirmed}</option><option value="suggested">{copy.suggested}</option><option value="disabled">{copy.disabled}</option></select></label>
          <label className="grid gap-1 md:col-span-2"><span className="text-xs">{copy.note}</span><textarea rows={2} maxLength={1000} value={editor.note} onChange={(e: ChangeEvent<HTMLTextAreaElement>) => editor.setNote(e.target.value)} className="rounded-xl border p-2" /></label>
          <label className="grid gap-1"><span className="text-xs">{copy.effectiveFrom}</span><input type="number" min={1} value={editor.effectiveFrom} onChange={(e: ChangeEvent<HTMLInputElement>) => editor.setEffectiveFrom(e.target.value)} className="rounded-xl border p-2" /></label>
          <div className="flex items-end gap-4 pb-2 text-sm">
            <label><input type="checkbox" checked={editor.isLocked} onChange={(e: ChangeEvent<HTMLInputElement>) => { editor.setIsLocked(e.target.checked); if (!e.target.checked) editor.setIsGlobal(false); }} /> {copy.locked}</label>
            <label><input type="checkbox" checked={editor.isGlobal} disabled={!editor.isLocked} onChange={(e: ChangeEvent<HTMLInputElement>) => editor.setIsGlobal(e.target.checked)} /> {copy.global}</label>
          </div>
          <div className="flex justify-end gap-2 md:col-span-2">
            {editor.editingTargetId ? <button type="button" onClick={editor.resetForm} className="rounded-full border px-4 py-2">{copy.cancel}</button> : null}
            <button type="button" disabled={editor.saving || !editor.sourceTerm.trim() || !editor.targetTerm.trim()} onClick={() => void editor.saveTerm()} className="rounded-full bg-black px-5 py-2 text-white disabled:opacity-40">{editor.editingTargetId ? copy.save : copy.add}</button>
          </div>
        </div>
        <div className="mt-4 grid gap-2">
          {editor.visibleTargets.length === 0 ? <p className="rounded-2xl border border-dashed p-4 text-sm text-neutral-500">{copy.empty}</p> : editor.visibleTargets.map(({ entry, target }) => (
            <div key={target.id} className="rounded-2xl border p-4">
              <p className="font-medium">{entry.source_term} → {target.target_term}</p>
              <p className="mt-1 text-xs text-neutral-500">{entry.term_type} · {target.status} · ep.{Math.max(entry.effective_from_episode_number || 1, target.effective_from_episode_number || 1)}{entry.is_global ? " · global" : ""}{entry.is_locked || target.is_locked ? " · locked" : ""}</p>
              {target.translation_note || entry.source_note ? <p className="mt-2 whitespace-pre-wrap text-xs">{target.translation_note || entry.source_note}</p> : null}
              <div className="mt-3 flex gap-2">
                <button type="button" onClick={() => editor.beginEdit(entry, target)} className="rounded-full border px-3 py-1 text-xs">{copy.edit}</button>
                <button type="button" onClick={() => void editor.toggleDisabled(target)} className="rounded-full border px-3 py-1 text-xs">{target.status === "disabled" ? copy.enable : copy.disable}</button>
                <button type="button" onClick={() => void editor.deleteTarget(target)} className="rounded-full border px-3 py-1 text-xs">{copy.delete}</button>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-6 grid gap-3 rounded-2xl border p-4">
          <h3 className="font-semibold">{copy.profileTitle}</h3>
          {([['style', copy.styleNotes], ['honorific', copy.honorificPolicy], ['formatting', copy.formattingNotes]] as const).map(([key, label]) => (
            <label key={key} className="grid gap-1"><span className="text-xs">{label}</span><textarea rows={2} maxLength={2000} value={editor.profileDraft[key]} onChange={(e: ChangeEvent<HTMLTextAreaElement>) => editor.updateProfileDraft(key, e.target.value)} className="rounded-xl border p-2" /></label>
          ))}
          <div className="flex justify-end"><button type="button" disabled={editor.saving} onClick={() => void editor.saveProfile()} className="rounded-full bg-black px-5 py-2 text-white disabled:opacity-40">{copy.saveProfile}</button></div>
        </div>
        {editor.message ? <p className="mt-3 text-xs text-neutral-600">{editor.message}</p> : null}
      </details>
    </section>
  );
}
