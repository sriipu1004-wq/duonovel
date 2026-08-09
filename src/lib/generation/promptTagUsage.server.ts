import { createAdminClient } from "@/lib/supabase/admin";
import { normalizePromptTags } from "@/lib/generation/promptTags";

export async function recordPromptTagUsage(value: unknown): Promise<void> {
  const promptTags = normalizePromptTags(value);
  if (promptTags.length === 0) return;

  try {
    const supabase = createAdminClient();
    const { error } = await supabase.rpc(
      "increment_time_fit_story_prompt_tag_usage",
      { p_tags: promptTags }
    );

    if (error) {
      console.error("[time-fit-prompt-tag-usage]", error);
    }
  } catch (error) {
    console.error("[time-fit-prompt-tag-usage]", error);
  }
}
