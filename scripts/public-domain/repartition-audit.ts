import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import {
  PUBLIC_DOMAIN_EPISODE_MAX_CHARACTERS,
  canonicalizePublicDomainText,
  repartitionPreparedChapters,
} from "./core";
import { loadLocalEnvironment } from "./runtime";


type EpisodeRow = {
  id: string;
  series_id: string;
  episode_number: number;
  title: string;
  body: string;
};

type PublicDomainEffectSettings = {
  publicDomain?: {
    rightsChecked?: boolean;
    manifestId?: string;
  };
};

function digest(text: string): string {
  return createHash("sha256").update(text.replace(/\r\n?/g, "\n").trim()).digest("hex");
}

async function main() {
  loadLocalEnvironment();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase admin environment is required");
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const seriesResult = await admin
    .from("series")
    .select("id,title,source_language,effect_settings");
  if (seriesResult.error) throw seriesResult.error;

  let works = 0;
  let oldEpisodes = 0;
  let newEpisodes = 0;
  let mismatches = 0;
  let oversizedAfter = 0;

  for (const series of seriesResult.data ?? []) {
    const effectSettings = series.effect_settings as unknown as PublicDomainEffectSettings | null;
    const pd = effectSettings?.publicDomain;
    if (pd?.rightsChecked !== true) continue;
    const episodesResult = await admin
      .from("episodes")
      .select("id,series_id,episode_number,title,body")
      .eq("series_id", series.id)
      .order("episode_number", { ascending: true });
    if (episodesResult.error) throw episodesResult.error;
    const episodes = (episodesResult.data ?? []) as EpisodeRow[];
    if (!episodes.some((episode) => episode.body.length > PUBLIC_DOMAIN_EPISODE_MAX_CHARACTERS)) continue;

    works += 1;
    oldEpisodes += episodes.length;
    const repartitioned = repartitionPreparedChapters(
      episodes.map((episode, index) => {
        const body = canonicalizePublicDomainText(episode.body);
        return {
          number: index + 1,
          title: episode.title,
          body,
          characterCount: body.length,
        };
      })
    );
    newEpisodes += repartitioned.length;
    const before = episodes.map((episode) => episode.body.replace(/\r\n?/g, "\n").trim()).join("\n\n");
    const after = repartitioned.map((episode) => episode.body).join("\n\n");
    const hashMatch = digest(before) === digest(after);
    if (!hashMatch) mismatches += 1;
    const maxAfter = Math.max(...repartitioned.map((episode) => episode.characterCount));
    if (maxAfter > PUBLIC_DOMAIN_EPISODE_MAX_CHARACTERS) oversizedAfter += 1;

    console.log(JSON.stringify({
      seriesId: series.id,
      manifestId: pd.manifestId ?? null,
      language: series.source_language,
      oldEpisodes: episodes.length,
      newEpisodes: repartitioned.length,
      maxAfter,
      hashMatch,
    }));
  }

  console.log(JSON.stringify({ works, oldEpisodes, newEpisodes, mismatches, oversizedAfter }));
  if (mismatches || oversizedAfter) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
