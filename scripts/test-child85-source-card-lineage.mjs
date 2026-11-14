import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const json = JSON.parse(readFileSync("public-domain/audits/child85-source-card-lineage-review-2026-10-21.json","utf8"));
// Issue #139 (2026-11-14): later owner decisions supersede some 2026-10-21 fields.
const batch = JSON.parse(readFileSync("public-domain/audits/issue139-p5-owner-approved-batch-2026-11-14.json","utf8"));
const batchById = new Map(batch.works.map((w) => [w.manifest_id, w]));
const OWNER_APPROVED = new Set(["aozora-000692","aozora-033200","aozora-053520"]);
assert.deepEqual(
  batch.works.filter((w) => w.approved).map((w) => w.manifest_id).sort(),
  [...OWNER_APPROVED].sort()
);
assert.equal(batch.totals.production_imports, 0);
assert.equal(
  batch.works.filter((w) => w.approved).reduce((n, w) => n + w.chapter_count, 0),
  batch.totals.approved_chapters
);
const currentChapterCount = (id, recorded) => batchById.get(id)?.chapter_count ?? recorded;
const chapterDelta = batch.works.reduce(
  (n, w) => n + (w.chapter_plan_changed ? w.chapter_count - w.previous_chapter_count : 0), 0
);
assert.equal(json.audit_version,1);
assert.equal(json.works.length,10);
assert.equal(json.totals.metadata_mismatches_found,0);
assert.equal(json.totals.prepared_chapters,39);
assert.equal(json.totals.prose_works,8);
assert.equal(json.totals.prose_prepared_chapters,33);
const ids = new Set();
let chapters=0;
for (const w of json.works) {
  assert.match(w.manifest_id,/^aozora-\d{6}$/u);
  assert(!ids.has(w.manifest_id),"duplicate candidate");
  ids.add(w.manifest_id);
  const manifest = JSON.parse(readFileSync("public-domain/manifests/"+w.manifest_id+".json","utf8"));
  for(const [a,b] of [
    ["id","manifest_id"],["source_url","primary_card_url"],["original_title","original_title"],
    ["original_author","author"],["author_death_year","author_death_year"],
    ["first_publication_year","first_publication_year"],["edition","base_edition"],
    ["edition_publication_year","base_first_publication_year"],
    ["source_hash","source_txt_sha256"],
  ]) assert.equal(manifest[a],w[b],w.manifest_id+" "+a);
  assert.equal(manifest.chapter_count, currentChapterCount(w.manifest_id, w.prepared_reader_chapters), w.manifest_id+" chapter_count");
  for(const [a,b] of [["input_edition","input_edition"],["proof_edition","proof_edition"],
    ["input_by","input_by"],["proofread_by","proofread_by"]]) {
    assert.equal(manifest.source_provenance?.[a]??null,w[b],w.manifest_id+" provenance "+a);
  }
  assert.match(manifest.source_hash,/^[0-9a-f]{64}$/u);
  if (OWNER_APPROVED.has(w.manifest_id)) {
    assert.equal(manifest.rights_status,"approved");
    assert.equal(manifest.approved,true);
    assert.match(manifest.reviewed_by,/owner/u);
    assert.match(manifest.rights_notes,/issuecomment-6872701172/u);
    assert.match(manifest.rights_notes,/issuecomment-6875024200/u);
    assert(Array.isArray(manifest.content_warnings), w.manifest_id+" content_warnings recorded");
  } else {
    assert.equal(manifest.rights_status,"pending");
    assert.equal(manifest.approved,false);
    assert.equal(manifest.reviewed_at,null);
  }
  assert.equal(manifest.import_status,"prepared");
  assert.equal(w.rights_approved,false);
  assert.equal(w.human_rights_review_signed,false);
  assert.equal(w.import_authorized,false);
  chapters+=manifest.chapter_count;
}
assert.equal(chapters,39+chapterDelta);
assert.deepEqual([...json.preliminary_first_review_order],["aozora-000692","aozora-033200","aozora-004386","aozora-053520"]);
assert.equal(new Set(json.preliminary_first_review_order).size,4);
assert(json.preliminary_first_review_order.every(id=>ids.has(id)));
assert(json.excluded_or_deferred_initial_prose.every(id=>ids.has(id)));
const variants = json.same_title_edition_variants;
assert.equal(variants.status, "VARIANT_EDITIONS_IDENTIFIED_NO_CROSS_EDITION_APPROVAL");
assert.equal(variants.card_count_by_selected_manifest["aozora-000692"], 3);
assert.equal(Object.keys(variants.card_count_by_selected_manifest).length, 10);
assert.equal(Object.values(variants.card_count_by_selected_manifest).filter(n=>n===1).length, 9);
assert.equal(variants.high_priority_review.reference_probes, 19);
assert.equal(variants.high_priority_review.new_candidate_manifests_created, 0);
assert.equal(variants.rights_or_import_permission_change, false);
assert.deepEqual(
  variants.high_priority_review.comparison_cards.map(x=>[x.id,x.exact_24char_probe_matches]),
  [["aozora-000691",11],["aozora-045245",0]]
);
assert(variants.high_priority_review.comparison_cards.every(x=>/^[0-9a-f]{64}$/u.test(x.sha256)));
const sourceBinding = JSON.parse(readFileSync(
  "public-domain/audits/child85-source-body-reproducibility-2026-10-21.json",
  "utf8"
));
assert.equal(sourceBinding.status, "SOURCE_RECOMPUTATION_PASS_RIGHTS_REVIEW_HOLD");
assert.equal(sourceBinding.totals.manifests, 10);
assert.equal(sourceBinding.totals.prepared_chapters, 39);
assert.equal(sourceBinding.totals.source_reproduction_failures, 0);
assert.equal(sourceBinding.totals.human_rights_approvals, 0);
assert.equal(sourceBinding.totals.production_imports, 0);
assert.equal(sourceBinding.candidates.length, 10);
let regeneratedChapters = 0;
for (const entry of sourceBinding.candidates) {
  assert.match(entry.source_sha256, /^[0-9a-f]{64}$/u);
  assert.match(entry.chapter_plan_sha256, /^[0-9a-f]{64}$/u);
  assert.equal(entry.raw_source_rebuilt_and_compared, true);
  assert.equal(entry.rights_status, "pending");
  assert.equal(entry.approved, false);
  assert.equal(entry.production_imported, false);
  const sourceManifest = JSON.parse(readFileSync(
    "public-domain/manifests/" + entry.manifest_id + ".json", "utf8"
  ));
  assert.equal(sourceManifest.source_hash, entry.source_sha256);
  const later = batchById.get(entry.manifest_id);
  if (later) {
    assert.equal(later.source_sha256, entry.source_sha256);
    if (later.chapter_plan_changed) {
      assert.equal(later.previous_chapter_plan_sha256, entry.chapter_plan_sha256);
      assert.equal(later.previous_chapter_count, entry.prepared_chapter_count);
    } else {
      assert.equal(later.chapter_plan_sha256, entry.chapter_plan_sha256);
    }
  }
  assert.equal(sourceManifest.chapter_count, currentChapterCount(entry.manifest_id, entry.prepared_chapter_count));
  regeneratedChapters += entry.prepared_chapter_count;
}
assert.equal(regeneratedChapters, 39);

console.log("PASS: Issue #139 owner-approved batch (3 works, 10 chapters) and aozora-004386 re-split fingerprints are consistent with the Child85 records");
console.log("PASS: Child85 ten source-card records, raw-body reproducibility audit fingerprints, rights state, chapter totals and edition review queue");
