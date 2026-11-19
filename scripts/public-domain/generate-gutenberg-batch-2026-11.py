# Create pending manifests for public-domain/batches/gutenberg-2026-11-19.json.
# Same shape as scripts/public-domain/generate-parity-manifests.ts, with:
# - normalization_profile "gutenberg_body" (PG credits moved out of the Reader
#   body; any remaining PG name/URL stops preparation),
# - public_attribution, so the work page does not show the Project Gutenberg
#   name (docs/rights/region-research-2026-11-19-gutenberg.md),
# - the first-publication evidence kept in rights_notes.
# Refuses entries outside the cut-offs and never overwrites an existing file.
#   python scripts/public-domain/generate-gutenberg-batch-2026-11.py
import json
import os
import sys

BATCH = "public-domain/batches/gutenberg-2026-11-19.json"
batch = json.load(open(BATCH, encoding="utf8"))
policy = batch["selection_policy"]
DEATH_MAX = policy["author_and_contributor_death_year_max"]
FIRST_MAX = policy["first_publication_year_max"]


def component(status="needs_review"):
    return {"status": status, "basis": "", "notes": ""}


ids = [w["provider_id"] for w in batch["works"]]
if len(ids) != len(set(ids)) or len(ids) > 50:
    sys.exit("duplicate provider ids or more than 50 works")

created = 0
for w in batch["works"]:
    n = w["provider_id"]
    if w["author_death_year"] > DEATH_MAX or w["first_publication_year"] > FIRST_MAX:
        sys.exit(f"{n}: outside the batch cut-offs")
    mid = f"gutenberg-{n:06d}"
    path = f"public-domain/manifests/{mid}.json"
    if os.path.exists(path):
        sys.exit(f"{mid}: manifest already exists (existing works are not re-imported)")
    manifest = {
        "id": mid,
        "title": w["title"],
        "original_title": w["title"],
        "original_author": w["author"],
        "author_death_year": w["author_death_year"],
        "original_language": "en",
        "first_publication_year": w["first_publication_year"],
        "source_provider": "Project Gutenberg",
        "source_url": f"https://www.gutenberg.org/ebooks/{n}",
        "source_download_url": f"https://www.gutenberg.org/cache/epub/{n}/pg{n}.txt",
        "source_file": f"public-domain/sources/raw/{mid}.txt",
        "source_retrieved_at": None,
        "source_encoding": "utf-8",
        "normalization_profile": "gutenberg_body",
        "edition": f"Project Gutenberg eBook #{n} plain text",
        "edition_publication_year": None,
        "translator": None,
        "translator_death_year": None,
        "translation_language": None,
        "rights_status": "pending",
        "rights_basis": "",
        "rights_notes": (
            f"Selected for batch {batch['id']}. First publication: {w['first_publication_year']}, "
            f"{w['first_publication_place']}. Evidence: {w['evidence']}"
        ),
        "rights_components": {
            "original_work": component(),
            "edition": component(),
            "translation": component("not_applicable"),
            "editorial": component(),
            "annotations": component(),
            "illustrations": component("not_applicable"),
            "cover": component("not_applicable"),
            "digitization": component(),
            "provider_terms": component(),
        },
        "jurisdictions_reviewed": [],
        "reviewed_at": None,
        "reviewed_by": None,
        "chapter_count": None,
        "chapter_split": {"strategy": "paragraph_chunks", "max_characters": 10000},
        "genres": w["genres"],
        "tags": w["tags"],
        "public_attribution": {
            "source_provider": "Public domain",
            "source_url": None,
            "edition": f"First published {w['first_publication_year']} ({w['first_publication_place']})",
        },
        "source_hash": None,
        "approved": False,
        "import_status": "not_imported",
        "cover_source": None,
        "cover_rights_status": None,
    }
    with open(path, "w", encoding="utf8", newline="\n") as handle:
        handle.write(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    created += 1
print(f"created {created} pending manifests")
