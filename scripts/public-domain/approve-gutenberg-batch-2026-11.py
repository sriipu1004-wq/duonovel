# Operator rights review for the 2026-11-19 Gutenberg batch (50 works,
# public-domain/batches/gutenberg-2026-11-19.json). Same shape as
# approve-batch-2026-11.py (Aozora). Mechanical preconditions: every named
# author/contributor died in or before 1944, first publication in or before
# 1930, English original (no translation), prepared with the gutenberg_body
# profile (PG header/license/footer/credits outside the Reader body) and a
# public_attribution that does not name Project Gutenberg. Also records the
# content warnings decided for this batch. It does NOT import or publish:
# production import and publication each need the owner's separate approval.
#   python scripts/public-domain/approve-gutenberg-batch-2026-11.py <manifest-id>...
import json
import re
import sys
from datetime import datetime, timezone, timedelta

REVIEWED_AT = datetime.now(timezone(timedelta(hours=9))).replace(microsecond=0).isoformat()
REVIEWER = (
    "LIB read operator (Claude; owner direction 2026-11-15 "
    "「それぞれの国での無料公開可能な作品をできる限り導入して」; parent decision 2026-11-19 "
    "(docs/rights/region-research-2026-11-19-gutenberg.md); production import and "
    "publication need separate owner button approval)"
)
LICENSE = "https://www.gutenberg.org/policy/license.html"
NOTE = "docs/rights/pd-batch-2026-11-gutenberg.md"
FRAMEWORK = "public-domain/audits/en-ko-parity-rights-framework-2026-09-23.json"

# Content warnings decided for this batch (Claude, from the cue counts of
# content-warnings.ts and the known plot; not a full reading). sexual_r18: none.
VIOLENCE = {
    64317, 284, 4517, 160, 219, 5658, 558, 71865, 139, 2097, 108, 834, 3289,
    204, 271, 308, 95, 2166, 1298, 1300, 1074, 1056, 2776, 155, 110, 421, 1837,
    86, 2775, 2814, 848,
}
VIOLENCE_NOTE = (
    "violence: killing, suicide, execution or a described corpse appears in the story "
    "(Claude's judgement from cue words and the known plot; not a full reading)."
)
NONE_NOTE = (
    "No warning: no concrete violent or sexual depiction found from cue words and the known plot "
    "(Claude's judgement; not a full reading)."
)

for manifest_id in sys.argv[1:]:
    path = f"public-domain/manifests/{manifest_id}.json"
    with open(path, encoding="utf8") as handle:
        m = json.load(handle)
    death = m["author_death_year"]
    first = m["first_publication_year"]
    number = int(manifest_id.split("-")[1])
    if not (isinstance(death, int) and death <= 1944 and isinstance(first, int) and first <= 1930):
        raise SystemExit(f"{manifest_id}: outside batch criteria (death={death}, first={first})")
    if m.get("translator") or m["rights_components"]["translation"]["status"] != "not_applicable":
        raise SystemExit(f"{manifest_id}: translation present")
    if m.get("normalization_profile") != "gutenberg_body" or not m.get("public_attribution"):
        raise SystemExit(f"{manifest_id}: not a gutenberg_body manifest with public_attribution")
    if re.search(r"gutenberg|pglaf|pgdp", json.dumps(m["public_attribution"]) + json.dumps(m["tags"]), re.I):
        raise SystemExit(f"{manifest_id}: Project Gutenberg name in public attribution or tags")
    if m.get("import_status") != "prepared" or not m.get("chapter_count") or not m.get("source_hash"):
        raise SystemExit(f"{manifest_id}: not prepared")
    author = m["original_author"]
    m["content_warnings"] = ["violence"] if number in VIOLENCE else []
    m["content_warning_notes"] = VIOLENCE_NOTE if number in VIOLENCE else NONE_NOTE
    m["rights_status"] = "approved"
    m["approved"] = True
    m["jurisdictions_reviewed"] = ["JP", "US", "KR"]
    m["reviewed_at"] = REVIEWED_AT
    m["reviewed_by"] = REVIEWER
    m["rights_basis"] = (
        f"Operator review for worldwide distribution with no per-country restriction (D030), "
        f"same cut-offs as the 2026-09-23 English cohort ({FRAMEWORK}). {author} died in {death} "
        f"and the work was first published in {first}. US: published in or before 1930, so outside "
        f"the 95-year term (17 U.S.C. 304; 104A restoration also gives at most the remainder of that "
        f"term). Japan: life+50 plus the 3,794-day wartime addition for Allied works ended by 2005 "
        f"for authors who died by 1944, before the 2018 extension, and is not revived. Korea: life+50 "
        f"before 2013 / Art. 3(4). Life+70 and life+80 countries (CO, GQ) expired at the latest by "
        f"end-2024; Mexico treats authors who died before 1952 as public domain ({NOTE}). Scope is "
        f"the exact Project Gutenberg plain-text file pinned by SHA-256, without the PG header, "
        f"license, footer, volunteer credits or name."
    )
    m["rights_notes"] = (
        f"{m['rights_notes']} Operator review recorded {REVIEWED_AT}; exact source fetched from "
        f"www.gutenberg.org (landing states 'Public domain in the USA') and hashed; chapter plan "
        f"prepared ({m['chapter_count']} chapters). Production import and publication are separate "
        f"owner approvals."
    )
    rc = m["rights_components"]
    rc["original_work"] = {
        "status": "approved",
        "basis": f"{author} (d. {death}), first published {first}: out of term in JP/US/KR, life+70/80 countries and Mexico ({NOTE}).",
        "notes": "Batch criteria: every named author/contributor died in or before 1944; first publication in or before 1930; English original.",
    }
    shared = "Exact provider source is hash-pinned; no modern translation, cover, illustration, annotation or editorial layer is imported (texts with a modern introduction were excluded)."
    rc["edition"] = {"status": "approved", "basis": shared, "notes": m["rights_notes"].split(" Evidence: ")[-1][:300]}
    rc["editorial"] = {"status": "approved", "basis": shared, "notes": ""}
    rc["annotations"] = {"status": "approved", "basis": shared, "notes": ""}
    rc["digitization"] = {
        "status": "approved",
        "basis": "Volunteer transcription of a public-domain text; PG states that once its license and all references to Project Gutenberg are removed, the remaining text is not restricted by US intellectual property law.",
        "notes": LICENSE,
    }
    rc["provider_terms"] = {
        "status": "approved",
        "basis": f"PG license reviewed at {LICENSE}. Header, license, footer and volunteer credits are kept only in archive metadata (gutenberg_body profile); the work page shows public_attribution without the Project Gutenberg trademark.",
        "notes": f"Source landing: {m['source_url']}",
    }
    with open(path, "w", encoding="utf8", newline="\n") as handle:
        handle.write(json.dumps(m, ensure_ascii=False, indent=2) + "\n")
    print(f"approved {manifest_id} {m['title']} chapters={m['chapter_count']} warnings={m['content_warnings']}")
