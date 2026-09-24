import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  OFFICIAL_ACCOUNT_EMAIL,
  isOfficialAccountEmail,
} from "../../src/lib/auth/officialAccount";
import {
  buildDraftImportPlan,
  decodeSourceBytes,
  isDuplicatePublicDomainSeries,
  normalizeSource,
  prepareArtifact,
  validateManifest,
  type PreparedArtifact,
  type PublicDomainManifest,
} from "./core";

const MANIFEST_DIR = "public-domain/manifests";
const WORK_DIR = ".public-domain-work";

function repoPath(path: string): string {
  return resolve(process.cwd(), path);
}

function assertManifestId(id: string): void {
  if (!/^[a-z0-9][a-z0-9-]{2,79}$/.test(id)) {
    throw new Error(`Invalid manifest id: ${id}`);
  }
}

export function manifestPathForId(id: string): string {
  assertManifestId(id);
  return repoPath(`${MANIFEST_DIR}/${id}.json`);
}

export function loadManifest(id: string): PublicDomainManifest {
  const path = manifestPathForId(id);
  if (!existsSync(path)) throw new Error(`Manifest not found: ${id}`);
  const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
  const result = validateManifest(raw);
  if (!result.ok || !result.manifest) {
    throw new Error(
      `Manifest validation failed for ${id}:\n${result.errors
        .map((error) => `- ${error}`)
        .join("\n")}`
    );
  }
  return result.manifest;
}

export function validateAllManifests(): {
  checked: number;
  errors: string[];
  warnings: string[];
  approvedIds: string[];
  importedIds: string[];
  pendingIds: string[];
} {
  const directory = repoPath(MANIFEST_DIR);
  const files = existsSync(directory)
    ? readdirSync(directory)
        .filter((name) => name.endsWith(".json") && !name.startsWith("_"))
        .sort()
    : [];
  const errors: string[] = [];
  const warnings: string[] = [];
  const approvedIds: string[] = [];
  const importedIds: string[] = [];
  const pendingIds: string[] = [];
  for (const file of files) {
    try {
      const value = JSON.parse(readFileSync(join(directory, file), "utf8")) as unknown;
      const result = validateManifest(value);
      errors.push(...result.errors.map((item) => `${file}: ${item}`));
      warnings.push(...result.warnings.map((item) => `${file}: ${item}`));
      if (result.manifest) {
        if (result.manifest.rights_status === "pending") pendingIds.push(result.manifest.id);
        if (result.manifest.approved && result.manifest.rights_status === "approved") {
          approvedIds.push(result.manifest.id);
          if (result.manifest.import_status === "imported") importedIds.push(result.manifest.id);
        }
      }
    } catch (error) {
      errors.push(`${file}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return {
    checked: files.length,
    errors,
    warnings,
    approvedIds,
    importedIds,
    pendingIds,
  };
}

export function preparedArtifactPath(id: string): string {
  assertManifestId(id);
  return repoPath(`${WORK_DIR}/${id}/prepared.json`);
}

export function loadPreparedArtifact(id: string): PreparedArtifact {
  const path = preparedArtifactPath(id);
  if (!existsSync(path)) {
    throw new Error(`Prepared artifact not found for ${id}. Run public-domain:prepare first.`);
  }
  const value = JSON.parse(readFileSync(path, "utf8")) as PreparedArtifact;
  if (value.version !== 1 || value.manifestId !== id || !Array.isArray(value.chapters)) {
    throw new Error(`Prepared artifact is invalid for ${id}`);
  }
  return value;
}

export function prepareManifest(id: string): PreparedArtifact {
  const manifest = loadManifest(id);
  const sourcePath = repoPath(manifest.source_file);
  if (!existsSync(sourcePath)) {
    throw new Error(
      `Raw source file not found: ${manifest.source_file}. Acquire it manually and verify provider terms before preparing.`
    );
  }
  const raw = readFileSync(sourcePath);
  const artifact = prepareArtifact({ manifest, rawBytes: raw });
  const decoded = decodeSourceBytes(raw, manifest.source_encoding);
  const normalized = normalizeSource(decoded, manifest.normalization_profile);
  const outputDirectory = dirname(preparedArtifactPath(id));
  mkdirSync(outputDirectory, { recursive: true });
  writeFileSync(preparedArtifactPath(id), `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  writeFileSync(join(outputDirectory, "normalized.txt"), normalized.displayText, "utf8");
  writeFileSync(
    join(outputDirectory, "archive-metadata.txt"),
    normalized.archiveMetadata,
    "utf8"
  );
  return artifact;
}

function parseEnvFile(path: string): void {
  if (!existsSync(path)) return;
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    if (!/^[A-Z0-9_]+$/i.test(key) || process.env[key] !== undefined) continue;
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

export function loadLocalEnvironment(): void {
  parseEnvFile(repoPath(".env.local"));
  parseEnvFile(repoPath(".env"));
}

function createAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase admin environment is missing. NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required only for --execute."
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function displaySupabaseTarget(): string {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!raw) return "not configured";
  try {
    return new URL(raw).origin;
  } catch {
    return "configured (invalid URL)";
  }
}

async function resolveOfficialUserId(admin: SupabaseClient): Promise<string> {
  for (let page = 1; page <= 20; page += 1) {
    const result = await admin.auth.admin.listUsers({ page, perPage: 100 });
    if (result.error) throw new Error(`Official account lookup failed: ${result.error.message}`);
    const match = result.data.users.find((user) => isOfficialAccountEmail(user.email));
    if (match) return match.id;
    if (result.data.users.length < 100) break;
  }
  throw new Error(`Official account could not be resolved from canonical identity: ${OFFICIAL_ACCOUNT_EMAIL}`);
}

async function assertNotAlreadyImported(args: {
  admin: SupabaseClient;
  officialUserId: string;
  manifest: PublicDomainManifest;
  artifact: PreparedArtifact;
}): Promise<void> {
  const pageSize = 500;
  for (let from = 0; ; from += pageSize) {
    const result = await args.admin
      .from("series")
      .select("id,effect_settings")
      .eq("author_id", args.officialUserId)
      .order("created_at", { ascending: true })
      .range(from, from + pageSize - 1);
    if (result.error) {
      throw new Error(`Duplicate check failed: ${result.error.message}`);
    }
    const rows = result.data ?? [];
    const duplicate = rows.find((row) =>
      isDuplicatePublicDomainSeries({
        effectSettings: row.effect_settings,
        manifestId: args.manifest.id,
        sourceHash: args.artifact.sourceHash,
      })
    );
    if (duplicate) {
      throw new Error(
        `ALREADY_IMPORTED: matching manifest id or source hash already exists as series ${duplicate.id}`
      );
    }
    if (rows.length < pageSize) break;
  }
}

function updateManifestImportStatus(id: string, status: "imported"): void {
  const path = manifestPathForId(id);
  const value = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  value.import_status = status;
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export type ImportExecutionResult = {
  dryRun: boolean;
  seriesId: string | null;
  episodeCount: number;
  sourceHash: string;
  warnings: string[];
};

export async function importManifest(args: {
  id: string;
  execute: boolean;
  target: "local" | "preview" | "production" | null;
  productionConfirmed: boolean;
}): Promise<ImportExecutionResult> {
  const manifest = loadManifest(args.id);
  const artifact = loadPreparedArtifact(args.id);

  // A fake id is sufficient for the pure dry-run plan. No database call happens.
  const dryRunPlan = buildDraftImportPlan({
    manifest,
    artifact,
    officialUserId: "00000000-0000-0000-0000-000000000000",
  });

  if (!args.execute) {
    return {
      dryRun: true,
      seriesId: null,
      episodeCount: dryRunPlan.episodes.length,
      sourceHash: artifact.sourceHash,
      warnings: artifact.warnings,
    };
  }

  if (!args.target) {
    throw new Error("--execute requires --target=local, --target=preview, or --target=production");
  }

  loadLocalEnvironment();
  if (process.env.PUBLIC_DOMAIN_IMPORT_TARGET !== args.target) {
    throw new Error(
      `Configured environment does not match --target. Set PUBLIC_DOMAIN_IMPORT_TARGET=${args.target} in the selected environment before executing.`
    );
  }
  if (args.target === "production") {
    if (!args.productionConfirmed) {
      throw new Error("Production execution requires --production");
    }
    if (process.env.PUBLIC_DOMAIN_IMPORT_CONFIRM !== "PRODUCTION_DRAFT_ONLY") {
      throw new Error(
        "Production execution requires PUBLIC_DOMAIN_IMPORT_CONFIRM=PRODUCTION_DRAFT_ONLY"
      );
    }
  }

  const admin = createAdminClient();
  const officialUserId = await resolveOfficialUserId(admin);
  await assertNotAlreadyImported({ admin, officialUserId, manifest, artifact });
  const plan = buildDraftImportPlan({ manifest, artifact, officialUserId });

  const seriesResult = await admin
    .from("series")
    .insert(plan.series)
    .select("id")
    .single();
  if (seriesResult.error || !seriesResult.data?.id) {
    throw new Error(
      `Draft series insert failed: ${seriesResult.error?.message ?? "missing series id"}`
    );
  }
  const seriesId = String(seriesResult.data.id);
  const episodeRows = plan.episodes.map((episode) => ({
    ...episode,
    series_id: seriesId,
  }));
  const episodeResult = await admin.from("episodes").insert(episodeRows).select("id");
  if (episodeResult.error) {
    const cleanup = await admin.from("series").delete().eq("id", seriesId);
    const cleanupSuffix = cleanup.error
      ? ` Cleanup also failed: ${cleanup.error.message}`
      : " Inserted draft series was cleaned up.";
    throw new Error(`Draft episode insert failed: ${episodeResult.error.message}.${cleanupSuffix}`);
  }

  updateManifestImportStatus(args.id, "imported");
  return {
    dryRun: false,
    seriesId,
    episodeCount: episodeRows.length,
    sourceHash: artifact.sourceHash,
    warnings: artifact.warnings,
  };
}
