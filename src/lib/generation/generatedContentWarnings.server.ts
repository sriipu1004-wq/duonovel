import "server-only";

import type { SeriesContentWarning } from "@/lib/contentRating";

type ModerationCategories = {
  sexual?: boolean;
  "sexual/minors"?: boolean;
  violence?: boolean;
  "violence/graphic"?: boolean;
};

type ModerationResponse = {
  results?: Array<{
    categories?: ModerationCategories;
  }>;
  error?: {
    message?: string;
  };
};

export type GeneratedContentWarningClassification = {
  warnings: SeriesContentWarning[];
  lockedWarnings: SeriesContentWarning[];
};

export async function classifyGeneratedContentWarnings(args: {
  title: string;
  synopsis: string;
  body: string;
}): Promise<GeneratedContentWarningClassification> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY が設定されていません。");
  }

  const input = [
    args.title.trim(),
    args.synopsis.trim(),
    args.body.trim(),
  ]
    .filter(Boolean)
    .join("\n\n");

  const response = await fetch("https://api.openai.com/v1/moderations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "omni-moderation-latest",
      input,
    }),
    cache: "no-store",
  });

  const payload = (await response.json()) as ModerationResponse;
  if (!response.ok) {
    throw new Error(
      payload.error?.message ?? "AI生成作品のコンテンツ警告判定に失敗しました。"
    );
  }

  const categories = payload.results?.[0]?.categories;
  if (!categories) {
    throw new Error("AI生成作品のコンテンツ警告判定結果を読み取れませんでした。");
  }

  const sexual =
    categories.sexual === true || categories["sexual/minors"] === true;
  const violence =
    categories.violence === true || categories["violence/graphic"] === true;

  const warnings: SeriesContentWarning[] = [];
  if (sexual) warnings.push("sexual_r18");
  if (violence) warnings.push("violence");

  return {
    warnings,
    // Sexual content detected in the original AI output is immutable for authors.
    lockedWarnings: sexual ? ["sexual_r18"] : [],
  };
}
