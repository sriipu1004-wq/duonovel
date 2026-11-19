# Operator rights review for the second 2026-11 country-limited Aozora batch
# (docs/rights/pd-batch-2026-11-aozora-country-limited-2.md):
#   B: Japanese authors who died 1946-1967 (D030 allow list), as in
#      approve-batch-2026-11-country-limited.py.
#   C: Hagiwara Sakutaro (d. 1942) collections that contain a text by Muro
#      Saisei (d. 1962): same base allow list (region-research-2026-11-15b.md C,
#      parent decision C: base list only, no US).
# Mechanical preconditions were already enforced by aozora-candidates
# (copyright flags なし, author-only catalog contributors, death range, first
# publication known) and source-sync/prepare (pinned SHA-256, deterministic
# chapter plan). This script records the operator review and the content
# warning decision. It does NOT import or publish: production import, the
# series_region_restrictions rows and publication each need the owner's
# separate button approval and an independent review.
#   python scripts/public-domain/approve-batch-2026-11-country-limited-2.py <manifest-id>...
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

# C: works by an author who died by 1945 that contain a text by another
# Japanese writer who died in 1962 (Muro Saisei). The other contributors named
# here were checked in the text (signatures and headings).
C_WORKS = {
    "aozora-000859": {
        "others": "a preface by Kitahara Hakushu (d. 1942) and a text by Muro Saisei (d. 1962)",
        "saisei": "Muro Saisei's text (the book's second preface)",
    },
    "aozora-001788": {
        "others": "a preface signed 犀星生 by Muro Saisei (d. 1962) and an afterword (跋) by Hagiwara Kyojiro (d. 1938)",
        "saisei": "Muro Saisei's preface",
    },
}

# Content warnings decided from content-warnings.ts cue hits read in context
# (docs/rights/pd-batch-2026-11-aozora-country-limited-2.md). Not a full reading.
VIOLENCE = {
    "aozora-000737": "A murdered girl's corpse found in a ditch; the narrator's mother's corpse.",
    "aozora-000859": "Poems with a woman's corpse, blood, a hanging (天上縊死) and a killed frog.",
    "aozora-000876": "Assassination order, shootings and a young woman's corpse.",
    "aozora-002159": "Trial of a man who ran over and killed another man.",
    "aozora-002162": "An epidemic of suicide by cutting the arteries; corpses.",
    "aozora-042618": "A bandit kills men and his wives; heads collected as playthings.",
    "aozora-042621": "Air-raid fire: burnt corpses of people and dogs.",
    "aozora-043620": "A mother stabbed in the heart; corpses.",
    "aozora-043653": "Patricide with a knife; corpses at sea.",
    "aozora-043656": "Deaths aboard a submarine, corpses and bloodshed.",
    "aozora-045545": "Murder of a young woman and the investigation.",
    "aozora-046070": "A planned poisoning murder watched step by step; suicide.",
    "aozora-046071": "Five burnt corpses and a killing on a seal island.",
    "aozora-046074": "A woman stabbed, bleeding from the chest.",
    "aozora-046470": "A murder in a brothel and the disposal of the corpse.",
    "aozora-046484": "A father poisoned (spitting black blood); the mother's body in the water.",
    "aozora-046488": "Adventure on a desert island: two corpses on the beach, animals killed, fights.",
    "aozora-047001": "Killings among miners; corpses.",
    "aozora-047221": "A youth cuts his throat; blood.",
    "aozora-047224": "Hundreds of burnt corpses stored in a church after an air raid.",
    "aozora-047417": "A strangled and burnt corpse examined in a murder case.",
    "aozora-047418": "Killings in a labour camp (stabbing, shooting, massacre).",
    "aozora-047565": "A young woman's suicide is a turning point of the plot.",
    "aozora-047768": "A murder in a billiard room; the corpse.",
    "aozora-047857": "A married woman hangs herself after the actor's feigned seduction.",
    "aozora-047945": "A dancer's monologue about planning to kill a man.",
    "aozora-049280": "The narrator's father commits suicide.",
    "aozora-049870": "Suspicion that a son poisoned his mother; a sudden suicide.",
}
VIOLENCE["aozora-045516"] = (
    "Independent review (S3-4): a son wishes his dying father dead, beats his wife, and buries "
    "the father's corpse at night. Added on the safe side."
)

# Independent review of PR #227 (S3-1): the Aozora book card gives
# 「1929（昭和14）年12月号」, which contradicts itself (昭和14 = 1939); the text ends
# 「（昭和十四年十二月）」. 1939 is recorded. Either year keeps the work in batch B.
CORRECTED_FIRST = {
    "aozora-004109": 1939,
}

NO_WARNING_NOTE = (
    "Cue hits (if any) were figurative, a passing mention or non-graphic in context; "
    "no violence or sexual_r18 warning."
)

for manifest_id in sys.argv[1:]:
    path = f"public-domain/manifests/{manifest_id}.json"
    with open(path, encoding="utf8") as handle:
        m = json.load(handle)
    if manifest_id in CORRECTED_FIRST:
        m["first_publication_year"] = CORRECTED_FIRST[manifest_id]
    death = m["author_death_year"]
    first = m["first_publication_year"]
    is_c = manifest_id in C_WORKS
    if is_c:
        if not (isinstance(death, int) and death <= 1945 and isinstance(first, int) and first <= 1930):
            raise SystemExit(f"{manifest_id}: outside C criteria (death={death}, first={first})")
        if m.get("region_restriction"):
            raise SystemExit(f"{manifest_id}: unexpected existing region_restriction")
        expected = list(BASE)
        m["region_restriction"] = {
            "allowed_countries": list(expected),
            "basis": (
                f"D030 allow list. {m['original_author']} (d. {death}); the book also contains "
                f"{C_WORKS[manifest_id]['others']}. Governed by the latest death (1962): Japan life+50 "
                f"expired by end-2017 and was not revived by the 2018 extension; each listed country "
                f"applies the rule of the shorter term or has already expired this term (EU/EEA/GB/KR/"
                f"RU/SG comparison of terms; CA pre-2022 expiry not revived; NZ life+50; TW/CN/HK "
                f"life+50; IN life+60 or International Copyright Order 1999 para 7). US not included "
                f"(first edition vs base-text revision check not done). {NOTE} C (parent decision C)."
            ),
        }
    else:
        if not (isinstance(death, int) and 1946 <= death <= 1967 and isinstance(first, int)):
            raise SystemExit(f"{manifest_id}: outside batch criteria (death={death}, first={first})")
        expected = [c for c in BASE if not (death >= 1966 and c == "IN")]
    if m.get("translator") or m["rights_components"]["translation"]["status"] != "not_applicable":
        raise SystemExit(f"{manifest_id}: translation present")
    if m.get("import_status") != "prepared" or not m.get("chapter_count"):
        raise SystemExit(f"{manifest_id}: not prepared")
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
    if is_c:
        who = (
            f"{author} died in {death}; the work was first published in {first}; the book also "
            f"contains {C_WORKS[manifest_id]['others']}, so the 1962 death governs. "
        )
        contributors_note = (
            f"the book card lists the author only, but the text contains {C_WORKS[manifest_id]['others']} "
            f"(checked in the text); {C_WORKS[manifest_id]['saisei']} is why this work is limited to the allow list"
        )
        criteria_note = (
            "Aozora copyright flags なし; author d. 1942, but a text by Muro Saisei (d. 1962) is included "
            "(region-research-2026-11-15b.md C); region_restriction allow list recorded in this manifest."
        )
    else:
        who = f"{author} died in {death}; the work was first published in {first}. "
        contributors_note = (
            "the book card lists the author only and the text has no preface, afterword or commentary "
            "by another person"
        )
        criteria_note = (
            "Aozora copyright flags なし; author death 1946-1967 (country-limited criteria); "
            "region_restriction allow list recorded in this manifest."
        )
    m["rights_basis"] = (
        f"Operator review for distribution ONLY in the D030 allow list ({countries}); "
        f"withheld everywhere else, including the US and unknown countries. "
        f"{who}"
        f"Japan: the life+50 term ended by end-2017, before the 2018 extension, and was not revived. "
        f"Each listed country applies the rule of the shorter term or has its own term already expired "
        f"(EU/EEA/GB/KR/RU/SG comparison of terms; CA pre-2022 expiry not revived; NZ life+50; "
        f"TW/CN/HK life+50; IN life+60 or International Copyright Order 1999 para 7"
        + ("; IN is left out for deaths in 1966-1967" if death >= 1966 and not is_c else "")
        + f"). US is not included: §104A restored works first published 1931 or later, and no per-work "
        f"check of 1931+ revisions was done. AU/BR/MX are not added (medium confidence). ({NOTE}, "
        f"parent decision {'C' if is_c else 'A'}; D030.) Scope is the exact Aozora text file pinned by SHA-256 only."
    )
    m["rights_notes"] = (
        f"Operator review recorded {REVIEWED_AT}. Aozora catalog flags なし; {contributors_note}; exact "
        f"source fetched and hashed; chapter plan prepared ({m['chapter_count']} chapters, no chapter "
        f"over 10,000 characters). Base edition, cover and modern commentary are not reused. "
        f"Publication only together with its series_region_restrictions allow-list row "
        f"(scripts/public-domain/region-publish-sql.ts); import and publication are separate owner approvals."
    )
    rc = m["rights_components"]
    rc["original_work"] = {
        "status": "approved",
        "basis": (
            f"{author} (d. {death}), first published {first}"
            + (" (with a text by Muro Saisei, d. 1962)" if is_c else "")
            + f": out of term in JP and in every country of the D030 allow list per {NOTE}; not cleared for the US or any other country."
        ),
        "notes": criteria_note,
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
