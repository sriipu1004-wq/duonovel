import { preprocessNemoBodyToParagraphs } from "@/lib/recording/nemoTextPreprocess";

export type NemoRegenerationDecisionReason =
  | "no_change"
  | "format_only"
  | "body_spoken_changed";

export type NemoRegenerationDecision = {
  shouldRegenerate: boolean;
  reason: NemoRegenerationDecisionReason;
  previousComparableText: string;
  nextComparableText: string;
};

function buildComparableSpokenText(body: string): string {
  return preprocessNemoBodyToParagraphs(body)
    .map((paragraph) => paragraph.spokenParagraph.trim())
    .filter((paragraph) => paragraph.length > 0)
    .join("\n\n");
}

export function decideNemoRegenerationByBody(args: {
  previousBody: string;
  nextBody: string;
}): NemoRegenerationDecision {
  const previousRaw = args.previousBody ?? "";
  const nextRaw = args.nextBody ?? "";

  if (previousRaw === nextRaw) {
    return {
      shouldRegenerate: false,
      reason: "no_change",
      previousComparableText: buildComparableSpokenText(previousRaw),
      nextComparableText: buildComparableSpokenText(nextRaw),
    };
  }

  const previousComparableText = buildComparableSpokenText(previousRaw);
  const nextComparableText = buildComparableSpokenText(nextRaw);

  if (previousComparableText === nextComparableText) {
    return {
      shouldRegenerate: false,
      reason: "format_only",
      previousComparableText,
      nextComparableText,
    };
  }

  return {
    shouldRegenerate: true,
    reason: "body_spoken_changed",
    previousComparableText,
    nextComparableText,
  };
}