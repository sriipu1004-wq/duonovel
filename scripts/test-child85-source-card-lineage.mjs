import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const json = JSON.parse(readFileSync("public-domain/audits/child85-source-card-lineage-review-2026-10-21.json","utf8"));
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
    ["source_hash","source_txt_sha256"],["chapter_count","prepared_reader_chapters"],
  ]) assert.equal(manifest[a],w[b],w.manifest_id+" "+a);
  for(const [a,b] of [["input_edition","input_edition"],["proof_edition","proof_edition"],
    ["input_by","input_by"],["proofread_by","proofread_by"]]) {
    assert.equal(manifest.source_provenance?.[a]??null,w[b],w.manifest_id+" provenance "+a);
  }
  assert.match(manifest.source_hash,/^[0-9a-f]{64}$/u);
  assert.equal(manifest.rights_status,"pending");
  assert.equal(manifest.approved,false);
  assert.equal(manifest.reviewed_at,null);
  assert.equal(manifest.import_status,"prepared");
  assert.equal(w.rights_approved,false);
  assert.equal(w.human_rights_review_signed,false);
  assert.equal(w.import_authorized,false);
  chapters+=manifest.chapter_count;
}
assert.equal(chapters,39);
assert.deepEqual([...json.preliminary_first_review_order],["aozora-000692","aozora-033200","aozora-004386","aozora-053520"]);
assert.equal(new Set(json.preliminary_first_review_order).size,4);
assert(json.preliminary_first_review_order.every(id=>ids.has(id)));
assert(json.excluded_or_deferred_initial_prose.every(id=>ids.has(id)));
console.log("PASS: Child85 10 primary Aozora card snapshot fields, candidate status HOLD, 39 chapters and review ordering");
