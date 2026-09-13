import { executeEpisodeTranslationGeneration } from "@/lib/translation/executeEpisodeTranslationGeneration";
import { prepareEpisodeTranslationGeneration } from "@/lib/translation/prepareEpisodeTranslationGeneration";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  const prepared = await prepareEpisodeTranslationGeneration(request);
  if ("response" in prepared) return prepared.response;
  return executeEpisodeTranslationGeneration(request, prepared.prepared);
}
