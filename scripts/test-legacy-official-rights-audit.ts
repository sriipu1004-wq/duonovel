import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateManifest } from "./public-domain/core";

function load(path: string): any {
  return JSON.parse(readFileSync(resolve(process.cwd(), path), "utf8"));
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const classification = load("public-domain/audits/legacy-official-rights-classification-2026-09-25.json");
const provenance = load("public-domain/audits/legacy-official-provenance-recovery-2026-09-25.json");
const duplicates = load("public-domain/audits/legacy-official-duplicate-audit-2026-09-25.json");
const fingerprints = load("public-domain/audits/legacy-official-production-fingerprints-2026-09-25.json");

assert(classification.summary.total === 37, "classification total must remain 37");
assert(classification.works.length === 37, "classification work rows must remain 37");
assert(fingerprints.legacy_count === 37, "fingerprint legacy count must remain 37");
assert(fingerprints.body_included === false, "fingerprint snapshot must not contain bodies");
assert(duplicates.matches.length === 0, "legacy/current duplicate matches must remain explicitly reviewed");
assert(provenance.summary.legacy_series === 37, "provenance legacy count must remain 37");

const approved = classification.works.filter((row: any) => row.classification === "CURRENT_PD_APPROVED");
const unapproved = classification.works.filter((row: any) => row.classification !== "CURRENT_PD_APPROVED");
assert(approved.length === classification.summary.CURRENT_PD_APPROVED, "approved summary mismatch");
assert(unapproved.every((row: any) => row.permission_change_eligible === false), "unapproved work must never be permission-change eligible");
assert(unapproved.every((row: any) => row.manifest_candidate === null), "unapproved work must not have a migration manifest");

for (const row of approved) {
  assert(row.permission_change_eligible === true, "approved work must explicitly opt into permission change");
  assert(typeof row.manifest_candidate === "string", "approved work requires manifest candidate");
  const manifest = load("public-domain/manifests/" + row.manifest_candidate + ".json");
  const validation = validateManifest(manifest);
  assert(validation.ok && validation.manifest, "approved manifest must validate: " + row.manifest_candidate);
  assert(validation.manifest.approved === true, "approved manifest flag required");
  assert(validation.manifest.rights_status === "approved", "approved rights status required");
  for (const code of ["JP", "US", "KR"]) {
    assert(validation.manifest.jurisdictions_reviewed.includes(code), "approved manifest missing jurisdiction " + code);
  }
  const series = provenance.series.find((item: any) => item.series_id === row.series_id);
  assert(series, "approved series missing provenance row");
  const source = series.works.flatMap((work: any) => work.candidates ?? []).find((candidate: any) =>
    candidate.work_id === row.manifest_candidate.replace(/^aozora-/, "")
  );
  assert(source?.source_confirmed === true, "approved manifest requires cryptographically confirmed source");
  assert(source.raw_source_sha256 === validation.manifest.source_hash, "approved manifest source hash must equal recovered provider bytes");
}

for (const row of classification.works) {
  if (row.classification === "RIGHTS_CLEAR_SOURCE_UNCERTAIN") {
    assert(row.source_provenance.status !== "CONFIRMED_FULL_SERIES", "source-uncertain classification cannot claim full-series confirmation");
  }
  if (row.production_state.oversized_episode_count > 0) {
    assert(row.repartition_eligible === false, "Child77 must not auto-repartition legacy oversized works");
  }
}

const serialized = JSON.stringify({ classification, provenance, fingerprints });
assert(!serialized.includes('"body":'), "audit artifacts must not contain raw body fields");

console.log(JSON.stringify({
  total: classification.summary.total,
  approved: approved.length,
  source_uncertain: classification.summary.RIGHTS_CLEAR_SOURCE_UNCERTAIN,
  rights_review: classification.summary.RIGHTS_REVIEW_REQUIRED,
  edition_risk: classification.summary.SOURCE_OR_EDITION_RISK,
  action_required: classification.summary.REJECT_ACTION_REQUIRED
}));
