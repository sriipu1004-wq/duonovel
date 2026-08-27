export const AI_ACTION_TYPES = [
  "story_generation",
  "translation_generation",
  "word_explanation",
] as const;

export type AiActionType = (typeof AI_ACTION_TYPES)[number];
export type AiPlanType = "free" | "subscriber";

export type AiActionUsage = {
  used: number;
  limit: number;
};

export type AiUsageSnapshot = {
  plan: AiPlanType;
  isSubscriber: boolean;
  resetAt: string;
  actions: Record<AiActionType, AiActionUsage>;
};

export function formatAiUsage(usage?: AiActionUsage | null): string {
  return usage ? `${usage.used}/${usage.limit}` : "–/–";
}
