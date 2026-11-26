"use server";

import { isBlockedFromWritesUntilRegistered } from "@/lib/auth/registrationGate";
import { createClient } from "@/lib/supabase/server";
import { isValidSeriesId } from "@/lib/write/ownedSeriesPayload";
import {
  isOwnedSeriesEffectSettingsPayload,
  buildOperatorKeyConcurrencyFilters,
  mergeOwnedSeriesEffectSettings,
} from "@/lib/write/ownedSeriesEffectSettings";

type SaveResult =
  | { ok: true }
  | {
      ok: false;
      code:
        | "invalid_request"
        | "authentication_required"
        | "registration_required"
        | "not_found_or_forbidden"
        | "save_failed"
        | "concurrent_update";
    };

const MAX_SAVE_ATTEMPTS = 2;

/**
 * Series effect-editor save (Issue #221 / KD-3). Does not use a service role:
 * Supabase author RLS continues to enforce ownership. Only the effect-editor
 * keys come from the browser; operator records (publicDomain,
 * legacyAttribution) and other workspace keys are re-read from the DB and
 * kept as they are.
 */
export async function saveOwnedSeriesEffectSettings(
  seriesId: string,
  effectSettings: unknown
): Promise<SaveResult> {
  if (
    typeof seriesId !== "string" ||
    !isValidSeriesId(seriesId) ||
    !isOwnedSeriesEffectSettingsPayload(effectSettings)
  ) {
    return { ok: false, code: "invalid_request" };
  }

  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) {
    return { ok: false, code: "authentication_required" };
  }
  if (isBlockedFromWritesUntilRegistered(auth.user)) {
    return { ok: false, code: "registration_required" };
  }

  // Read -> merge -> compare-and-set update. If an operator write changed
  // publicDomain / legacyAttribution in between, the update matches 0 rows;
  // re-read once and retry, then give up with an explicit conflict.
  for (let attempt = 0; attempt < MAX_SAVE_ATTEMPTS; attempt += 1) {
    const { data: previous, error: previousError } = await supabase
      .from("series")
      .select("id, effect_settings")
      .eq("id", seriesId)
      .eq("author_id", auth.user.id)
      .maybeSingle();
    if (previousError) return { ok: false, code: "save_failed" };
    if (!previous) return { ok: false, code: "not_found_or_forbidden" };

    const nextSettings = mergeOwnedSeriesEffectSettings(
      effectSettings,
      previous.effect_settings
    );

    let update = supabase
      .from("series")
      .update({ effect_settings: nextSettings })
      .eq("id", seriesId)
      .eq("author_id", auth.user.id);
    for (const filter of buildOperatorKeyConcurrencyFilters(previous.effect_settings)) {
      update =
        filter.kind === "eq"
          ? update.eq(filter.column, filter.value)
          : update.is(filter.column, null);
    }
    const { data, error } = await update.select("id").maybeSingle();

    if (error) return { ok: false, code: "save_failed" };
    if (data) return { ok: true };
  }
  return { ok: false, code: "concurrent_update" };
}
