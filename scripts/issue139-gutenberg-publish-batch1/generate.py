# Issue #139 Gutenberg batch 1 (2026-11-19): derive the publish SQL from the
# reviewed Aozora batch-3 SQL (scripts/issue139-aozora-publish-batch3/) by
# replacing only the scope: series ids, manifest ids, expected episode counts
# and warnings (from the manifests), the totals, the snapshot table names
# (tag issue139_publish_gut1_*_20261119), the error codes (ISSUE139_GUT1_*)
# and the expected public sourceProvider ('Public domain', from
# public_attribution; the Project Gutenberg name is not shown).
#
# Run only after the production Draft import, with the series ids it printed:
#   PYTHONIOENCODING=utf-8 python scripts/issue139-gutenberg-publish-batch1/generate.py <map.txt>
# map.txt: "series_id,manifest_id;series_id,manifest_id;..." for every id in
# scripts/issue139-gutenberg-publish-batch1/manifest-ids.txt.
# Writes apply.sql and rollback.sql next to this file. The SQL is not run here.
import json
import re
import sys

HERE = "scripts/issue139-gutenberg-publish-batch1"
TEMPLATE = "scripts/issue139-aozora-publish-batch3"
expected_ids = open(f"{HERE}/manifest-ids.txt", encoding="utf8").read().split()

pairs = [p.split(",") for p in open(sys.argv[1], encoding="utf8").read().strip().split(";")]
uuid_re = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
rows = []
for series_id, manifest_id in pairs:
    series_id, manifest_id = series_id.strip(), manifest_id.strip()
    assert uuid_re.match(series_id), series_id
    m = json.load(open(f"public-domain/manifests/{manifest_id}.json", encoding="utf8"))
    assert m["approved"] and m["import_status"] == "imported", (manifest_id, "not imported")
    assert m["public_attribution"]["source_provider"] == "Public domain", manifest_id
    rows.append((series_id, manifest_id, m["chapter_count"], sorted(m["content_warnings"])))
assert sorted(r[1] for r in rows) == sorted(expected_ids), "map does not cover exactly manifest-ids.txt"
assert len({r[0] for r in rows}) == len(rows), "duplicate series id"
n_series = len(rows)
n_eps = sum(r[2] for r in rows)

uuid = r"'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'"
id_list = ",\n             ".join(f"'{r[0]}'" for r in rows)


def values_rows():
    out = []
    for sid, mid, n, w in rows:
        arr = "array[" + ",".join(f"'{x}'" for x in w) + "]::text[]"
        out.append(f"('{sid}'::uuid, '{mid}', {n}, {arr})")
    return ",\n  ".join(out)


for name in ["apply.sql", "rollback.sql"]:
    s = open(f"{TEMPLATE}/{name}", encoding="utf8").read()
    # Drop the batch-3 generated header (first 4 comment lines).
    s = "\n".join(s.split("\n")[4:])
    s = re.sub(r"\(" + uuid + r"(?:,\s*" + uuid + r")+\)", "(" + id_list + ")", s)
    s = re.sub(
        r"\('[0-9a-f-]{36}'::uuid, 'aozora-\d+', \d+, array\[[^\]]*\]::text\[\]\)"
        r"(?:,\s*\('[0-9a-f-]{36}'::uuid, 'aozora-\d+', \d+, array\[[^\]]*\]::text\[\]\))*",
        values_rows(),
        s,
    )
    s = s.replace("issue139_publish3_", "issue139_publish_gut1_").replace("_20261115", "_20261119")
    s = s.replace("ISSUE139_BATCH3_", "ISSUE139_GUT1_")
    guard = "       or s.effect_settings->'publicDomain'->>'sourceProvider' is distinct from 'Aozora Bunko'\n"
    assert s.count(guard) == (1 if name == "apply.sql" else 0), (name, "sourceProvider guard")
    s = s.replace(
        guard,
        guard
        + "       or s.effect_settings->'publicDomain'->>'sourceUrl' is not null\n"
        + "       or coalesce(s.effect_settings->'publicDomain'->>'edition', '') ilike '%gutenberg%'\n",
    )
    s = s.replace("'Aozora Bunko'", "'Public domain'")
    s = s.replace("reviewed Aozora rights metadata", "reviewed Gutenberg-batch rights metadata")
    s = re.sub(r"<> 63\b", f"<> {n_series}", s)
    s = re.sub(r"<> 282\b", f"<> {n_eps}", s)
    # Template comments that still carry older scope numbers / descriptions.
    s = re.sub(r"(?m)^-- Issue #139 \(batch 2\): publish the .*\n-- Production as private Drafts .*\n",
               f"-- Issue #139 Gutenberg batch 1: publish the {n_series} English works ({n_eps} chapters)\n"
               f"-- imported to Production as private Drafts (docs/rights/pd-batch-2026-11-gutenberg.md).\n", s)
    s = re.sub(r"(?m)^-- Issue #139 \(batch 2\): exact revert", "-- Issue #139 Gutenberg batch 1: exact revert", s)
    s = re.sub(r"(?m)^-- Owner approval: button answer 2026-11-15「公開まで進める \(推奨\)」\.\n",
               "-- Owner approval: required before running (none recorded yet).\n", s)
    s = re.sub(r"\b44 /works/", f"{n_series} /works/", s)
    s = re.sub(r"\b44 works with 410 chapters", f"{n_series} works with {n_eps} chapters", s)
    s = re.sub(r"for the 44 series / 410 episodes", f"for the {n_series} series / {n_eps} episodes", s)
    s = re.sub(r"these 4 series", f"these {n_series} series", s)
    for sid, *_ in rows:
        assert s.count(sid) >= 1, (name, sid)
    leftover = re.findall(r"<> (63|282)\b|publish3|BATCH3|aozora-\d|Aozora Bunko|20261115", s)
    assert not leftover, (name, leftover)
    header = (
        f"-- GENERATED by {HERE}/generate.py from {TEMPLATE}/{name};\n"
        f"-- only the scope differs ({n_series} works, {n_eps} chapters, tag issue139_publish_gut1_*_20261119).\n"
    )
    open(f"{HERE}/{name}", "w", encoding="utf8", newline="\n").write(header + s)
print("series", n_series, "episodes", n_eps)
