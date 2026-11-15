# Open Graph subset fonts

Subsets of Noto Sans JP and Noto Sans KR used only by the per-work Open
Graph image (`src/app/works/[seriesId]/opengraph-image.tsx`). They are read
from these files at render time; no font is fetched from the network.

## License

SIL Open Font License 1.1 — full text in [OFL.txt](OFL.txt) (identical for
both upstream families). These files are Modified Versions under the OFL
(instanced to static weights and subset). They are distributed only as part
of this application, never sold by themselves. No Reserved Font Name is used.

## Upstream (pinned)

Repository: google/fonts, commit `cc39c4c2c304bc368c9b7c311ea2bcc6013299fe`

| File | URL | SHA-256 |
|---|---|---|
| `NotoSansJP[wght].ttf` (9,589,900 bytes) | https://raw.githubusercontent.com/google/fonts/cc39c4c2c304bc368c9b7c311ea2bcc6013299fe/ofl/notosansjp/NotoSansJP%5Bwght%5D.ttf | `c2f3b4d463500a2ddcd3849cded1fceeb9fd6d1c32e6cbecd568453ba50fc68f` |
| `NotoSansKR[wght].ttf` (10,414,588 bytes) | https://raw.githubusercontent.com/google/fonts/cc39c4c2c304bc368c9b7c311ea2bcc6013299fe/ofl/notosanskr/NotoSansKR%5Bwght%5D.ttf | `194018e6b2b293a7964f037b25c0249ce1418bc9ab3c971060a03aa57861e252` |
| `OFL.txt` (jp and kr identical) | https://raw.githubusercontent.com/google/fonts/cc39c4c2c304bc368c9b7c311ea2bcc6013299fe/ofl/notosansjp/OFL.txt | `1c05c68c34f9708415aada51f17e1b0092d2cea709bf4a94cd38114f9e73d7d9` |

## Built files

Built with `fonttools==4.55.3` by
[`scripts/og-fonts/build_og_subset_fonts.py`](../../../scripts/og-fonts/build_og_subset_fonts.py)
(the script checks the upstream SHA-256 and produces identical bytes on
re-run). It also writes `src/lib/og/ogFontCoverage.generated.ts`, the exact
code points the runtime gate accepts.

| File | Bytes | SHA-256 |
|---|---|---|
| `NotoSansJP-OgSubset-400.ttf` | 982,268 | `79a28da03a32f2f8110c20190a873e132b9bd322bd477db279db9eb3e1476841` |
| `NotoSansJP-OgSubset-700.ttf` | 980,500 | `d19e072185a343eaeb34a0df35b839466e92eaf7c9ca0a64ef56efc7ec8e877e` |
| `NotoSansKR-OgSubset-400.ttf` | 610,436 | `101cf1696c974a1f83a634123f36549e2a48ea5cd7585c069d0bbb4e2800ae3c` |
| `NotoSansKR-OgSubset-700.ttf` | 609,716 | `78f7211a7ebbbf85d42c0a9f91302a641d69d290c1fcc608233fde56a7e7cb96` |

Characters (JP 3,713 / KR 3,626 / union 6,488 code points): ASCII,
Latin-1, Latin Extended-A and common punctuation; JIS X 0208 symbols, kana
and level-1 kanji (2,965); KS X 1001 symbols, compatibility jamo and the
2,350 common Hangul syllables; and the characters of production public
titles / author names in `scripts/og-fonts/production-chars.txt`. A title
with any other character keeps the common LIB read image.

## Rebuild

1. Download the two upstream files above into a new empty folder outside
   the repository and check their SHA-256.
2. In a virtual environment: `pip install fonttools==4.55.3`.
3. From the repository root:
   `python -I scripts/og-fonts/build_og_subset_fonts.py --jp <folder>/NotoSansJP[wght].ttf --kr <folder>/NotoSansKR[wght].ttf`
4. Update the table above and run `npm run test:p9-share-ogp`.
