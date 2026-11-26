"use server";

import { isBlockedFromWritesUntilRegistered } from "@/lib/auth/registrationGate";
import { createClient } from "@/lib/supabase/server";
import { isValidSeriesId } from "@/lib/write/ownedSeriesPayload";
import {
  isOwnedSeriesEffectSettingsPayload,
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
        | "save_failed";
    };

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

  const { data, error } = await supabase
    .from("series")
    .update({ effect_settings: nextSettings })
    .eq("id", seriesId)
    .eq("author_id", auth.user.id)
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, code: "save_failed" };
  if (!data) return { ok: false, code: "not_found_or_forbidden" };
  return { ok: true };
}
