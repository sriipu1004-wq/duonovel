export const LEGACY_AUTO_NARRATION_SUSPENDED = true;

export const LEGACY_AUTO_NARRATION_SUSPENDED_REASON =
  "旧自動朗読は現在休止中です。";

// Issue #137 (owner decision 2026-11-07): manual Nemo/Aivis generation by the
// official narration account also wrote to the PUBLIC recording-audio bucket.
// It is suspended until AI narration is rebuilt on the private bucket
// (ai-narration-private) with an access-checked playback path.
export const AI_NARRATION_GENERATION_SUSPENDED = true;

export const AI_NARRATION_GENERATION_SUSPENDED_REASON =
  "AI 朗読の生成は現在休止中です。";
