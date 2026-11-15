"""Build the subset Noto Sans JP / KR fonts used by per-work Open Graph images.

Reproducible: given the pinned upstream files (see SOURCES.md for URL and
SHA-256), this produces byte-identical output and the code point coverage
module that the runtime gate uses.

Usage (run from the repository root, with fonttools==4.55.3 installed):

    python -I scripts/og-fonts/build_og_subset_fonts.py \
        --jp <path>/NotoSansJP[wght].ttf \
        --kr <path>/NotoSansKR[wght].ttf

Character set (deterministic, no network):
  * Latin: printable ASCII, Latin-1, Latin Extended-A, common punctuation.
  * Japanese: every character of JIS X 0208 except level-2 kanji (kana,
    symbols, full-width forms, level-1 kanji = 2,965 commonly used kanji).
  * Korean: every character of KS X 1001 except hanja (2,350 common Hangul
    syllables, compatibility jamo, symbols).
  * production-chars.txt: characters used in public titles / author names
    on production (collected with a read-only aggregate SELECT).
Each font keeps only the characters it actually has a glyph for.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import pathlib

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

HERE = pathlib.Path(__file__).resolve().parent
REPO = HERE.parent.parent
OUT_FONT_DIR = REPO / "src" / "assets" / "og-fonts"
OUT_COVERAGE = REPO / "src" / "lib" / "og" / "ogFontCoverage.generated.ts"
PRODUCTION_CHARS = HERE / "production-chars.txt"

EXPECTED_SHA256 = {
    "jp": "c2f3b4d463500a2ddcd3849cded1fceeb9fd6d1c32e6cbecd568453ba50fc68f",
    "kr": "194018e6b2b293a7964f037b25c0249ce1418bc9ab3c971060a03aa57861e252",
}
WEIGHTS = (400, 700)


def sha256(path: pathlib.Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def latin_chars() -> set[int]:
    cps = set(range(0x20, 0x7F)) | set(range(0xA0, 0x180))
    cps |= {0x2013, 0x2014, 0x2018, 0x2019, 0x201A, 0x201C, 0x201D, 0x201E,
            0x2020, 0x2021, 0x2022, 0x2026, 0x2030, 0x2039, 0x203A, 0x20AC,
            0x2122}
    return cps


def double_byte_chars(codec: str, rows: range) -> set[int]:
    """Characters of a 94x94 double-byte set (EUC form), limited to rows."""
    cps: set[int] = set()
    for row in rows:
        for cell in range(1, 95):
            raw = bytes([0xA0 + row, 0xA0 + cell])
            try:
                text = raw.decode(codec)
            except UnicodeDecodeError:
                continue
            if len(text) == 1:
                cps.add(ord(text))
    return cps


def japanese_chars() -> set[int]:
    # Rows 1-8: symbols, digits, kana, Greek, Cyrillic, box drawing.
    # Rows 16-47: JIS level-1 kanji.
    return double_byte_chars("euc_jp", range(1, 9)) | double_byte_chars(
        "euc_jp", range(16, 48)
    )


def korean_chars() -> set[int]:
    # Rows 1-12: symbols and compatibility jamo. Rows 16-40: 2,350 syllables.
    return double_byte_chars("euc_kr", range(1, 13)) | double_byte_chars(
        "euc_kr", range(16, 41)
    )


def production_chars() -> set[int]:
    cps: set[int] = set()
    for line in PRODUCTION_CHARS.read_text(encoding="utf-8").splitlines():
        if line.startswith("#"):
            continue
        cps |= {ord(ch) for ch in line if not ch.isspace()}
    return cps


def build(source: pathlib.Path, wanted: set[int], weight: int) -> tuple[bytes, set[int]]:
    font = TTFont(source, recalcTimestamp=False)
    static = instancer.instantiateVariableFont(font, {"wght": weight})
    cmap = static.getBestCmap()
    keep = sorted(cp for cp in wanted if cp in cmap)
    options = subset.Options()
    options.layout_features = []  # Satori does not shape; keep outlines only.
    options.name_IDs = ["*"]
    options.name_languages = ["*"]
    options.notdef_outline = True
    options.hinting = False
    options.desubroutinize = True
    options.recalc_timestamp = False
    subsetter = subset.Subsetter(options)
    subsetter.populate(unicodes=keep)
    subsetter.subset(static)
    # Reproducible bytes: keep the upstream timestamp, not "now".
    static.recalcTimestamp = False
    static["head"].modified = font["head"].modified
    buffer = io.BytesIO()
    static.save(buffer, reorderTables=True)
    data = buffer.getvalue()
    covered = set(TTFont(io.BytesIO(data)).getBestCmap())
    return data, covered


def to_ranges(cps: set[int]) -> list[tuple[int, int]]:
    ranges: list[tuple[int, int]] = []
    for cp in sorted(cps):
        if ranges and ranges[-1][1] == cp - 1:
            ranges[-1] = (ranges[-1][0], cp)
        else:
            ranges.append((cp, cp))
    return ranges


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--jp", required=True, type=pathlib.Path)
    parser.add_argument("--kr", required=True, type=pathlib.Path)
    args = parser.parse_args()

    for key, path in (("jp", args.jp), ("kr", args.kr)):
        actual = sha256(path)
        if actual != EXPECTED_SHA256[key]:
            raise SystemExit(f"{key}: SHA-256 mismatch {actual}")

    common = latin_chars() | production_chars()
    plan = {
        "jp": (args.jp, common | japanese_chars()),
        "kr": (args.kr, common | korean_chars()),
    }
    OUT_FONT_DIR.mkdir(parents=True, exist_ok=True)
    coverage: dict[str, set[int]] = {}
    manifest = []
    for key, (source, wanted) in plan.items():
        per_weight = []
        for weight in WEIGHTS:
            data, covered = build(source, wanted, weight)
            name = f"NotoSans{key.upper()}-OgSubset-{weight}.ttf"
            (OUT_FONT_DIR / name).write_bytes(data)
            manifest.append((name, len(data), hashlib.sha256(data).hexdigest()))
            per_weight.append(covered)
        # Both weights come from one variable font, so coverage must match.
        if per_weight[0] != per_weight[1]:
            raise SystemExit(f"{key}: weights cover different characters")
        coverage[key] = per_weight[0]

    union = coverage["jp"] | coverage["kr"]
    missing_production = production_chars() - union
    lines = [
        "// GENERATED by scripts/og-fonts/build_og_subset_fonts.py. Do not edit.",
        "// Code points drawn by the bundled Noto Sans JP / KR subset fonts",
        "// (union of both), as inclusive [start, end] ranges.",
        "export const OG_SUBSET_FONT_RANGES: ReadonlyArray<readonly [number, number]> = [",
    ]
    items = [f"[0x{start:04x}, 0x{end:04x}]," for start, end in to_ranges(union)]
    for index in range(0, len(items), 6):
        lines.append("  " + " ".join(items[index : index + 6]))
    lines.append("];")
    lines.append(f"export const OG_SUBSET_FONT_CODE_POINT_COUNT = {len(union)};")
    OUT_COVERAGE.write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")

    for name, size, digest in manifest:
        print(f"{name}\t{size}\t{digest}")
    print(f"coverage jp={len(coverage['jp'])} kr={len(coverage['kr'])} union={len(union)}")
    if missing_production:
        print("production chars without a glyph:", "".join(map(chr, sorted(missing_production))))


if __name__ == "__main__":
    main()
