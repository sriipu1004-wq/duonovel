import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { validateManifest } from "./core";
import { OFFICIAL_ACCOUNT_EMAIL, isOfficialAccountEmail } from "../../src/lib/auth/officialAccount";
import { loadLocalEnvironment } from "./runtime";

const CLASSIFICATION_PATH = "public-domain/audits/legacy-official-rights-classification-2026-09-25.json";
const FINGERPRINT_PATH = "public-domain/audits/legacy-official-production-fingerprints-2026-09-25.json";
const EXECUTE_CONFIRMATION = "PRODUCTION_TARGETED_CURRENT_PD";

function json(path: string): any {
  return JSON.parse(readFileSync(resolve(process.cwd(), path), "utf8"));
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

async function officialUserId(admin: any): Promise<string> {
  for (let page = 1; page <= 20; page += 1) {
    const result = await admin.auth.admin.listUsers({ page, perPage: 100 });
    if (result.error) throw new Error(result.error.message);
    const found = result.data.users.find((user: any) => isOfficialAccountEmail(user.email));
    if (found) return found.id;
    if (result.data.users.length < 100) break;
  }
  throw new Error("Official account not found: " + OFFICIAL_ACCOUNT_EMAIL);
}

async function countByEpisodeIds(admin: any, table: string, column: string, ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const result = await admin.from(table).select("*", { count: "exact", head: true }).in(column, ids);
  if (result.error) throw new Error(table + " dependency audit failed: " + result.error.message);
  return result.count ?? 0;
}

async function main() {
  const args = process.argv.slice(2);
  const execute = args.includes("--execute");
  if (execute && !args.includes("--production")) {
    throw new Error("--execute requires --production");
  }
  if (execute && process.env.LEGACY_PD_MIGRATION_CONFIRM !== EXECUTE_CONFIRMATION) {
    throw new Error("Execution requires LEGACY_PD_MIGRATION_CONFIRM=" + EXECUTE_CONFIRMATION);
  }

  loadLocalEnvironment();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Production Supabase credentials are required");

  const classification = json(CLASSIFICATION_PATH);
  const fingerprints = json(FINGERPRINT_PATH);
  if (fingerprints.mode !== "READ_ONLY_HASH_FINGERPRINTS" || fingerprints.body_included !== false || fingerprints.legacy_count !== 37) {
    throw new Error("Production fingerprint snapshot invariant failed");
  }

  const targets = (classification.works ?? []).filter((row: any) =>
    row.classification === "CURRENT_PD_APPROVED" &&
    row.permission_change_eligible === true &&
    typeof row.manifest_candidate === "string"
  );
  if (targets.length === 0) throw new Error("No CURRENT_PD_APPROVED targets");

  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const officialId = await officialUserId(admin);
  const plans: any[] = [];

  for (const target of targets) {
    const manifestRaw = json("public-domain/manifests/" + target.manifest_candidate + ".json");
    const validation = validateManifest(manifestRaw);
    if (!validation.ok || !validation.manifest) {
      throw new Error(target.title + ": manifest invalid: " + validation.errors.join("; "));
    }
    const manifest = validation.manifest;
    if (!manifest.approved || manifest.rights_status !== "approved" || !manifest.source_hash) {
      throw new Error(target.title + ": unapproved/incomplete manifest");
    }
    for (const code of ["JP", "US", "KR"]) {
      if (!manifest.jurisdictions_reviewed.includes(code)) {
        throw new Error(target.title + ": missing jurisdiction " + code);
      }
    }

    const expected = (fingerprints.series ?? []).find((item: any) => item.series_id === target.series_id);
    if (!expected || expected.title !== target.title) {
      throw new Error(target.title + ": fingerprint identity mismatch");
    }

    const seriesResult = await admin.from("series")
      .select("id,author_id,title,source_language,publication_status,is_public,translation_permission_mode,recording_permission_mode,effect_settings")
      .eq("id", target.series_id)
      .eq("author_id", officialId)
      .maybeSingle();
    if (seriesResult.error) throw new Error(seriesResult.error.message);
    const series = seriesResult.data;
    if (!series || series.title !== target.title) throw new Error(target.title + ": live series identity drift");
    if (series.source_language !== manifest.original_language) throw new Error(target.title + ": source language drift");

    const effect = series.effect_settings && typeof series.effect_settings === "object" && !Array.isArray(series.effect_settings)
      ? series.effect_settings as Record<string, unknown>
      : {};
    const currentPd = effect.publicDomain && typeof effect.publicDomain === "object" && !Array.isArray(effect.publicDomain)
      ? effect.publicDomain as Record<string, unknown>
      : null;
    if (currentPd) {
      if (currentPd.manifestId === manifest.id && currentPd.rightsChecked === true) {
        plans.push({ series_id: target.series_id, title: target.title, manifest_id: manifest.id, status: "ALREADY_CURRENT_SKIP" });
        continue;
      }
      throw new Error(target.title + ": partial/mismatched publicDomain metadata present");
    }

    const episodesResult = await admin.from("episodes")
      .select("id,episode_number,title,body")
      .eq("series_id", target.series_id)
      .order("episode_number", { ascending: true });
    if (episodesResult.error) throw new Error(episodesResult.error.message);
    const episodes = episodesResult.data ?? [];
    if (episodes.length !== expected.episode_count) throw new Error(target.title + ": episode count drift");

    for (const fp of expected.episodes) {
      const live = episodes.find((episode: any) => episode.id === fp.id);
      if (!live) throw new Error(target.title + ": episode missing " + fp.id);
      const body = String(live.body ?? "");
      if (live.episode_number !== fp.episode_number || body.length !== fp.chars || sha256(body) !== fp.sha256) {
        throw new Error(target.title + ": episode fingerprint drift " + fp.id);
      }
    }

    if (expected.max_episode_chars > 10000) {
      throw new Error(target.title + ": oversized target requires separate dependency-safe repartition");
    }

    const episodeIds = episodes.map((episode: any) => String(episode.id));
    const dependencies = {
      translations: await countByEpisodeIds(admin, "episode_translations", "episode_id", episodeIds),
      unlocks: await countByEpisodeIds(admin, "public_episode_translation_unlocks", "episode_id", episodeIds),
      recordings: await countByEpisodeIds(admin, "recordings", "episode_id", episodeIds),
      comments: await countByEpisodeIds(admin, "user_episode_comments", "episode_id", episodeIds),
      continuation_reservations: await countByEpisodeIds(admin, "time_fit_story_continuation_reservations", "source_episode_id", episodeIds)
    };

    const publicDomain = {
      manifestId: manifest.id,
      originalTitle: manifest.original_title ?? manifest.title,
      originalAuthor: manifest.original_author,
      firstPublicationYear: manifest.first_publication_year,
      sourceProvider: manifest.source_provider,
      sourceUrl: manifest.source_url,
      sourceHash: manifest.source_hash,
      rightsChecked: true,
      reviewedAt: manifest.reviewed_at,
      reviewedBy: manifest.reviewed_by,
      jurisdictionsReviewed: manifest.jurisdictions_reviewed
    };

    plans.push({
      series_id: target.series_id,
      title: target.title,
      manifest_id: manifest.id,
      source_hash: manifest.source_hash,
      before: {
        translation_permission_mode: series.translation_permission_mode,
        recording_permission_mode: series.recording_permission_mode,
        publicDomain: null
      },
      after: {
        translation_permission_mode: "open",
        recording_permission_mode: "open",
        publicDomain
      },
      episode_count: episodes.length,
      max_episode_chars: expected.max_episode_chars,
      episode_fingerprint_verified: true,
      dependencies,
      status: execute ? "EXECUTE_PENDING" : "DRY_RUN_READY"
    });

    if (execute) {
      const update = await admin.from("series").update({
        translation_permission_mode: "open",
        recording_permission_mode: "open",
        effect_settings: { ...effect, publicDomain }
      }).eq("id", target.series_id).eq("author_id", officialId)
        .select("id,title,translation_permission_mode,recording_permission_mode,effect_settings").single();
      if (update.error) throw new Error(update.error.message);
      const pd = update.data.effect_settings?.publicDomain;
      if (update.data.translation_permission_mode !== "open" ||
          update.data.recording_permission_mode !== "open" ||
          pd?.manifestId !== manifest.id ||
          pd?.rightsChecked !== true ||
          pd?.sourceHash !== manifest.source_hash) {
        throw new Error(target.title + ": postcheck failed");
      }
      plans[plans.length - 1].status = "EXECUTED_AND_VERIFIED";
    }
  }

  console.log(JSON.stringify({
    mode: execute ? "EXECUTE" : "DRY_RUN",
    approved_target_count: targets.length,
    plans
  }, null, 2));

  if (!execute) {
    console.log("DRY RUN ONLY. Production write requires --execute --production plus LEGACY_PD_MIGRATION_CONFIRM=" + EXECUTE_CONFIRMATION);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
