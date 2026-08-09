import { NextResponse } from "next/server";
import { PROMPT_TAGS } from "@/lib/generation/promptTags";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PromptTagUsageRow = {
  tag?: unknown;
  use_count?: unknown;
};

function buildDefaultTagResponse() {
  return PROMPT_TAGS.map((label) => ({ label, useCount: 0 }));
}

export async function GET() {
  const fallbackTags = buildDefaultTagResponse();

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("time_fit_story_prompt_tag_usage")
      .select("tag, use_count")
      .in("tag", [...PROMPT_TAGS]);

    if (error) {
      console.error("[time-fit-prompt-tags-read]", error);
      return NextResponse.json(
        { ok: true, tags: fallbackTags },
        {
          headers: {
            "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
          },
        }
      );
    }

    const counts = new Map<string, number>();
    for (const row of (data ?? []) as PromptTagUsageRow[]) {
      if (typeof row.tag !== "string") continue;
      const useCount = Number(row.use_count);
      counts.set(
        row.tag,
        Number.isFinite(useCount) && useCount >= 0 ? useCount : 0
      );
    }

    const tags = PROMPT_TAGS.map((label, defaultIndex) => ({
      label,
      useCount: counts.get(label) ?? 0,
      defaultIndex,
    }))
      .sort(
        (a, b) =>
          b.useCount - a.useCount || a.defaultIndex - b.defaultIndex
      )
      .map(({ label, useCount }) => ({ label, useCount }));

    return NextResponse.json(
      { ok: true, tags },
      {
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
        },
      }
    );
  } catch (error) {
    console.error("[time-fit-prompt-tags-read]", error);
    return NextResponse.json(
      { ok: true, tags: fallbackTags },
      {
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
        },
      }
    );
  }
}
