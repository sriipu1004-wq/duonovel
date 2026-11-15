# Operator rights review for the 2026-11 country-limited Aozora batch
# (Japanese authors who died 1946-1967; D030 allow list).
# Mechanical preconditions were already enforced by
# `aozora-candidates --country-limited` (copyright flags なし, author-only
# contributors, death 1946-1967, first publication known; the manifest carries
# region_restriction) and source-sync/prepare (pinned SHA-256, deterministic
# chapter plan). This script records the operator review and the content
# warning decision. It does NOT import or publish: production import, the
# series_region_restrictions rows and publication each need the owner's
# separate button approval and an independent review.
#   python scripts/public-domain/approve-batch-2026-11-country-limited.py <manifest-id>...
import json
import sys
from datetime import datetime, timezone, timedelta

REVIEWED_AT = datetime.now(timezone(timedelta(hours=9))).replace(microsecond=0).isoformat()
REVIEWER = (
    "LIB read operator (Claude; owner direction 2026-11-15 "
    "「それぞれの国での無料公開可能な作品をできる限り導入して」; production import, "
    "D030 restriction rows and publication need separate owner button approval)"
)
KIJUN = "https://www.aozora.gr.jp/guide/kijyunn.html"
NOTE = "docs/rights/region-research-2026-11-15b.md"
EU27 = ["AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE",
        "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE"]
BASE = ["JP", *EU27, "IS", "LI", "NO", "GB", "CA", "NZ", "KR", "TW", "CN", "HK", "IN", "RU", "SG"]

# Content warnings decided from content-warnings.ts cue hits read in context
# (docs/rights/pd-batch-2026-11-aozora-country-limited.md). Not a full reading.
VIOLENCE = {
    "aozora-000249": "Narrator confesses pushing a woman off a cliff (murder).",
    "aozora-000869": "Murder plot; corpses on a dissection table.",
    "aozora-000907": "A worker dies after drinking dichromate; the narrator is suspected of killing him.",
    "aozora-001321": "Corpses driving a sledge; killings in an expedition story.",
    "aozora-001341": "Letter about the brutal robbery-murder of the writer's sister and the execution of the killer.",
    "aozora-001952": "Battle scenes; a father kills his son in single combat (Sohrab and Rustam).",
    "aozora-003829": "Suicide and killing in a mystery story.",
    "aozora-004680": "Hiroshima atomic bombing: burned and dead bodies, bleeding survivors.",
    "aozora-033227": "Sword fights, killings, seppuku and suicide.",
    "aozora-042614": "Killings, blood drinking, a stabbing at the climax.",
    "aozora-042756": "Seppuku and an attempted killing with a sword.",
    "aozora-043418": "A murder with a blade, a dead body.",
    "aozora-043422": "The narrator murders his wife; corpse description.",
    "aozora-043606": "Suicide by cutting the throat with a razor; a corpse.",
    "aozora-043646": "Famine and war in Kyoto: heaps of corpses, bloodshed.",
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
    if not (isinstance(death, int) and 1946 <= death <= 1967 and isinstance(first, int)):
        raise SystemExit(f"{manifest_id}: outside batch criteria (death={death}, first={first})")
    if m.get("translator") or m["rights_components"]["translation"]["status"] != "not_applicable":
        raise SystemExit(f"{manifest_id}: translation present")
    if m.get("import_status") != "prepared" or not m.get("chapter_count"):
        raise SystemExit(f"{manifest_id}: not prepared")
    expected = [c for c in BASE if not (death >= 1966 and c == "IN")]
    rr = m.get("region_restriction")
    if not rr or rr.get("allowed_countries") != expected or "blocked_countries" in rr:
        raise SystemExit(f"{manifest_id}: region_restriction is not the batch allow list")
    if "US" in rr["allowed_countries"]:
        raise SystemExit(f"{manifest_id}: US must not be allowed in this batch")
    author = m["original_author"]
    countries = ", ".join(expected)
    m["rights_status"] = "approved"
    m["approved"] = True
    m["jurisdictions_reviewed"] = list(expected)
    m["reviewed_at"] = REVIEWED_AT
    m["reviewed_by"] = REVIEWER
    m["rights_basis"] = (
        f"Operator review for distribution ONLY in the D030 allow list ({countries}); "
        f"withheld everywhere else, including the US and unknown countries. "
        f"{author} died in {death}; the work was first published in {first}. "
        f"Japan: the life+50 term ended by end-2017, before the 2018 extension, and was not revived. "
        f"Each listed country applies the rule of the shorter term or has its own term already expired "
        f"(EU/EEA/GB/KR/RU/SG comparison of terms; CA pre-2022 expiry not revived; NZ life+50; "
        f"TW/CN/HK life+50; IN life+60 or International Copyright Order 1999 para 7"
        + ("; IN is left out for deaths in 1966-1967" if death >= 1966 else "")
        + f"). US is not included: §104A restored works first published 1931 or later, and no per-work "
        f"check of 1931+ revisions was done. AU/BR/MX are not added (medium confidence). ({NOTE}, "
        f"parent decision A; D030.) Scope is the exact Aozora text file pinned by SHA-256 only."
    )
    m["rights_notes"] = (
        f"Operator review recorded {REVIEWED_AT}. Aozora catalog flags なし; the book card lists the "
        f"author only and the text has no preface, afterword or commentary by another person; exact "
        f"source fetched and hashed; chapter plan prepared ({m['chapter_count']} chapters, no chapter "
        f"over 10,000 characters). Base edition, cover and modern commentary are not reused. "
        f"Publication only together with its series_region_restrictions allow-list row "
        f"(scripts/public-domain/region-publish-sql.ts); import and publication are separate owner approvals."
    )
    rc = m["rights_components"]
    rc["original_work"] = {
        "status": "approved",
        "basis": f"{author} (d. {death}), first published {first}: out of term in JP and in every country of the D030 allow list per {NOTE}; not cleared for the US or any other country.",
        "notes": "Aozora copyright flags なし; author death 1946-1967 (country-limited criteria); region_restriction allow list recorded in this manifest.",
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
        "notes": "Preserved by the aozora_body normalizer.",
    }
    rc["digitization"] = {
        "status": "approved",
        "basis": "Aozora permits copying, redistribution, sharing and format conversion of expired-work files; input/proofreading credits are kept.",
        "notes": KIJUN,
    }
    rc["provider_terms"] = {
        "status": "approved",
        "basis": f"Aozora handling rules reviewed at {KIJUN}.",
        "notes": "Checked again 2026-11-15 for this batch.",
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
