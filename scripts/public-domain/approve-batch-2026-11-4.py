# Operator rights review for the 2026-11 Aozora batch 4 (100 works, no
# per-country restriction; docs/rights/pd-batch-2026-11-aozora-4.md).
# Copy of approve-batch-2026-11.py (batch 2/3) plus the content warning
# decision (as in approve-batch-2026-11-country-limited.py).
# Mechanical preconditions were already enforced by aozora-candidates
# (copyright flags なし, author-only contributors, death <= 1945,
# first publication <= 1930) and source-sync/prepare (pinned SHA-256,
# deterministic chapter plan). This script records the operator review in the
# same shape as earlier approved manifests. It does NOT import or publish:
# production import and publication each need the owner's separate approval.
#   python scripts/public-domain/approve-batch-2026-11-4.py <manifest-id>...
import json
import sys
from datetime import datetime, timezone, timedelta

REVIEWED_AT = datetime.now(timezone(timedelta(hours=9))).replace(microsecond=0).isoformat()
REVIEWER = (
    "LIB read operator (Claude; owner direction 2026-11-15 "
    "「それぞれの国での無料公開可能な作品をできる限り導入して」; production import "
    "and publication need separate owner button approval)"
)
KIJUN = "https://www.aozora.gr.jp/guide/kijyunn.html"
NOTE = "docs/rights/region-research-2026-11-15.md"

# Content warnings decided from content-warnings.ts cue hits read in context
# (docs/rights/pd-batch-2026-11-aozora-4.md). Not a full reading.
VIOLENCE = {
    "aozora-000031": "Robbers' raid: killings, corpses and sword wounds.",
    "aozora-000419": "The story is about K's drowning, probably suicide; his body is found on the beach.",
    "aozora-000930": "A character's father is reported to have committed seppuku; spitting blood.",
    "aozora-000933": "Tanka collection built on murderous impulses, corpses, blood and suicide.",
    "aozora-002096": "Strangling, a shooting and a murder-suicide; corpses.",
    "aozora-002570": "Investigation of a suicide (love suicide) and the circumstances of the death.",
    "aozora-002932": "A dog clubbed to death, bleeding, described in detail.",
    "aozora-002936": "Dead sailors (cholera) lying on the ship; corpses described.",
    "aozora-002952": "A dog catcher clubs dogs to death; the protagonist's dog is killed.",
    "aozora-003507": "A murder: the hero holds a bloodied corpse with a knife; suicide.",
    "aozora-042145": "Double love suicide; the woman's corpse is recovered from the river.",
    "aozora-042349": "Battlefield strewn with rotting corpses; killings in the Nanboku-cho war.",
    "aozora-043065": "Gunshot wounds with blood spurting from the forehead; sword fights.",
    "aozora-043557": "Sword killings and corpses in a period adventure.",
    "aozora-043648": "Murder; a woman's corpse woven into a cane chair; a body washed ashore.",
}
NO_WARNING_NOTE = (
    "Cue hits (if any) were figurative, a passing mention or non-graphic in context; "
    "no violence or sexual_r18 warning."
)

for manifest_id in sys.argv[1:]:
    path = f"public-domain/manifests/{manifest_id}.json"
    with open(path, encoding="utf8") as handle:
        m = json.load(handle)
    death = m["author_death_year"]
    first = m["first_publication_year"]
    if not (isinstance(death, int) and death <= 1945 and isinstance(first, int) and first <= 1930):
        raise SystemExit(f"{manifest_id}: outside batch criteria (death={death}, first={first})")
    if m.get("translator") or m["rights_components"]["translation"]["status"] != "not_applicable":
        raise SystemExit(f"{manifest_id}: translation present")
    if m.get("import_status") != "prepared" or not m.get("chapter_count"):
        raise SystemExit(f"{manifest_id}: not prepared")
    if m.get("region_restriction"):
        raise SystemExit(f"{manifest_id}: carries a region_restriction; not part of this batch")
    author = m["original_author"]
    m["rights_status"] = "approved"
    m["approved"] = True
    m["jurisdictions_reviewed"] = ["JP", "US", "KR"]
    m["reviewed_at"] = REVIEWED_AT
    m["reviewed_by"] = REVIEWER
    m["rights_basis"] = (
        f"Operator review for JP/US/KR distribution, and no per-country restriction (D030). "
        f"{author} died in {death} and the work was first published in {first}. "
        f"Japan: term expired before the 2018 extension and was not revived. "
        f"US: published in or before 1930, so outside the 95-year term; an author who died by 1945 "
        f"was also out of term in Japan on 1996-01-01, so no §104A restoration. Korea: Art. 3(4) "
        f"(expired abroad). Life+80 countries (CO, GQ) expired at the latest by end-2025; Mexico "
        f"treats authors who died before 1952 as public domain ({NOTE}). Scope is the exact Aozora "
        f"text file pinned by SHA-256 only."
    )
    m["rights_notes"] = (
        f"Operator review recorded {REVIEWED_AT}. Aozora catalog flags なし, author-only "
        f"contributors; exact source fetched and hashed; chapter plan prepared "
        f"({m['chapter_count']} chapters, no chapter over 10,000 characters). Base edition, cover and "
        f"modern commentary are not reused. Production import and publication are separate owner "
        f"approvals."
    )
    rc = m["rights_components"]
    rc["original_work"] = {
        "status": "approved",
        "basis": f"{author} (d. {death}), first published {first}: out of term in JP/US/KR and, per {NOTE}, in life+80 countries and Mexico.",
        "notes": "Aozora copyright flags なし; author death and first-publication dates pass the batch criteria (death <= 1945, first publication <= 1930).",
    }
    rc["edition"] = {
        "status": "approved",
        "basis": "Only the exact Aozora transcription pinned by SHA-256 is reused; modern base-edition layout, cover and commentary are excluded.",
        "notes": "Aozora names the base edition for provenance; no separately protected editorial matter is imported.",
    }
    rc["editorial"] = {
        "status": "approved",
        "basis": "Aozora's handling rules permit reuse and format/annotation changes of expired-work files; no modern editorial content is imported.",
        "notes": KIJUN,
    }
    rc["annotations"] = {
        "status": "approved",
        "basis": "Aozora ruby/annotation syntax is transcription metadata; normalized without adding commentary; provenance stays auditable.",
        "notes": "Preserved by the aozora normalizer.",
    }
    rc["digitization"] = {
        "status": "approved",
        "basis": "Aozora permits copying, redistribution, sharing and format conversion of expired-work files; input/proofreading credits are kept.",
        "notes": KIJUN,
    }
    rc["provider_terms"] = {
        "status": "approved",
        "basis": f"Aozora handling rules reviewed at {KIJUN}.",
        "notes": "Checked again 2026-11-19 for this batch.",
    }
    if manifest_id in VIOLENCE:
        m["content_warnings"] = ["violence"]
        m["content_warning_notes"] = VIOLENCE[manifest_id]
    else:
        m["content_warnings"] = []
        m["content_warning_notes"] = NO_WARNING_NOTE
    with open(path, "w", encoding="utf8") as handle:
        handle.write(json.dumps(m, ensure_ascii=False, indent=2) + "\n")
    print(f"approved {manifest_id} {m['title']} chapters={m['chapter_count']} warnings={m['content_warnings']}")
