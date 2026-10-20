# Child85 — Public Domain five-work pilot: source preflight and rights hold

**Date:** 2026-10-21 (Australia/Brisbane)
**Status:** SOURCE PREPARED / RIGHTS PENDING / PRODUCTION WRITE NOT AUTHORIZED
**Canonical order:** Child84 operational closure -> Child85 rights-verified small batches -> Child86 Production scale verification.

This is a **source-only review candidate**, not a legal clearance, import authorization, release decision, or statement that new works already exist in Production.

## Baseline independently checked

- GitHub main at start: `9c34659ca167ead0c860456437bd5fe8fe9086d2`.
- Vercel Production deployment: `dpl_3DVLLda3DYfcZ8cQKJwLXFmmN6H2`, READY on the same commit.
- Connected Supabase project healthy; READ ONLY queries: 123 total series, 120 public, 3 private, 84 `publicDomain.rightsChecked=true`; 36 legacy public works and 3 private series are **not** approved by this workstream.
- Current public source-language counts: JA 40 / EN 40 / KO 40. Rights-checked: JA 4 / EN 40 / KO 40.
- 3,284 posted/published episodes; 0 draft and 0 scheduled at the baseline query.
- Existing manifests: 86 non-template; 84 approved/imported and 2 pre-existing pending. All existing 84 `publicDomain.manifestId` records were left untouched.
- Existing Child84 deferred authenticated E2E, independent restore, Search SQL exact parity, timer root cause and unmerged Cron #108 remain **unverified**, not silently reopened or declared passed.

## Acquisition and five pilot candidates

The repository's allowlisted Aozora work-classifier read the **official expanded 19,502-row catalog**, using conservative work/contributor copyright flags and published-year/death-year filters. Its dry run found 12 initial JA candidates; only the five below enter this Draft pilot. Dates, base-edition labels, source locations and text downloads originate from the catalog/individual provider records, not guesses. All five originals have `original_language=ja`, no translator, and no included provider covers/illustrations.

| Manifest / Japanese title and author | First published / died | Aozora primary record | Base edition from provider catalog | Actual downloaded SHA-256 | Verified chapters |
|---|---|---|---|---|---|
| `aozora-000022` 羅生門の後に — 芥川竜之介 | 1917 / 1927 | https://www.aozora.gr.jp/cards/000879/card22.html | 日本の文学 33 羅生門 (1984) | `7fd64ae9f13d8a04e111d67e2eab2644c9a20fe576778163be305f90ff0cd3df` | 1 |
| `aozora-000195` 可哀相な姉 — 渡辺温 | 1927 / 1930 | https://www.aozora.gr.jp/cards/000020/card195.html | アンドロギュノスの裔 (1970) | `9f641bf3cf71a82854dd6c1d4d91f1d3ac40305bfcd306e2c183db588a5a392d` | 1 |
| `aozora-000198` 青白き夢 — 素木しづ | 1915 / 1918 | https://www.aozora.gr.jp/cards/000012/card198.html | 素木しづ作品集 (1970) | `ce465e83545a7ddafb698b8179fc9157f8c1194f3687799ea5a0901c2495150c` | 3 |
| `aozora-000204` カインの末裔 — 有島武郎 | 1917 / 1923 | https://www.aozora.gr.jp/cards/000025/card204.html | カインの末裔 クララの出家 (1940) | `c478211aae151241801c48aa09c6d3fb9268ea1612a67fd245690ea66fafe211` | 7 |
| `aozora-000321` 二老人 — 国木田独歩 | 1908 / 1908 | https://www.aozora.gr.jp/cards/000038/card321.html | 号外・少年の悲哀 他六篇 (1939) | `fe3c023fb00ea334cb7cae24934c83aeebe5210a415f4b02e2e18c4875b08f5e` | 1 |

`羅生門の後に` is distinct from the story `羅生門`; do not treat these as identical works from a shared name fragment.

### Provider primary-card verification (2026-10-21)

Directly rechecked all five Aozora figure cards, rather than assuming expanded-catalog fields alone establish rights. Recorded work title, original printed publication, author, creator lifetime, orthography, base edition and **actual used/revised impression**, input/proofreading contributors, and provider notices in the companion machine-readable audit. The five manifest metadata records match the individual primary cards. **This verifies bibliographic provenance only, not modern editorial rights.**

| ID | First published per source | Base edition and revisions that must be separately cleared | Aozora's historical-language advisory |
|---|---|---|---|
| `aozora-000022` | 「時事新報」1917-05-05 | ほるぷ出版1984初版; 1986第3刷を入力; 親本は1917阿蘭陀書房 | No advisory on this card |
| `aozora-000195` | 「新青年」1927-10 | 薔薇十字社1970初版 | **Yes** |
| `aozora-000198` | 「新小説」1915-01 | 札幌・北書房1970初版; 新字旧仮名を保持 | **Yes** |
| `aozora-000204` | 「新小説」1917-07 | 岩波文庫1940初版、**1980第25刷改版**、入力は1990第35刷。親本1918新潮社 | **Yes** |
| `aozora-000321` | 「文章世界」1908-01 | 岩波文庫1939初版、**1960第14刷改版**、入力1981第34刷、校正2000第38刷 | **Yes** |

Provider cards are `https://www.aozora.gr.jp/cards/000879/card22.html`, `https://www.aozora.gr.jp/cards/000020/card195.html`, `https://www.aozora.gr.jp/cards/000012/card198.html`, `https://www.aozora.gr.jp/cards/000025/card204.html`, and `https://www.aozora.gr.jp/cards/000038/card321.html`.

**Publication-specific hold:** The four provider advisories are notices about potentially inappropriate historical expressions, not determinations of `content_rating=R18`. Each text must undergo an independent rating/content-warnings review. The 1980 and 1960 revised printings in particular require inspection for separately protected editorial alterations before the exact Aozora transcription is rights-approved. Retain the known contributors and provenance in the manifest/audit; it is not enough to identify only the original author and early first edition.

### Reproducible, local-only source preparation

The raw Shift-JIS texts were acquired from each allowlisted Aozora ZIP and decoded by the existing source-sync pipeline. Raw sources remain in gitignored `public-domain/sources/raw/`; `prepared.json`, `normalized.txt` and `archive-metadata.txt` remain in gitignored `.public-domain-work/<manifestId>/`. Neither raw text nor prepared bodies are published by this PR.

Run from a credential-safe, isolated checkout:

```sh
npm ci
npm run public-domain:source-sync -- aozora-000022 aozora-000195 aozora-000198 aozora-000204 aozora-000321 --prepare
npm run public-domain:validate
npm run test:public-domain-ingestion
```

Always compare the freshly fetched SHA-256 against each recorded source hash. A changed upstream ZIP is a **hard re-review**, never an occasion to silently update a previously reviewed hash.

### Narrow normalization fix and text quality

The old `aozora` normalizer separated trailing provenance but retained a leading modern Aozora technical notation legend in the Reader body. Before correction, `aozora-000198` generated a separate legend-only chapter; this was not acceptable for import.

The **opt-in** `aozora_reader_body` profile matches only a verified two-line title/author header plus an exact Aozora notation legend enclosed by matching separators. It moves that front matter to archive metadata, retains the literary body and trailing bibliographic metadata, and **fails closed** on unrecognized front matter. It does not change the original `aozora` profile or re-prepare the 84 previously imported works. In-body Aozora ruby and annotations are retained, not blanket stripped.

Verified chapter counts after preparation: 1, 1, 3, 7, 1 (13 chapters total). All bodies <=10,000 characters. The single 8,076-character `aozora-000195` body is below the hard maximum; `aozora-000198` uses 6,000-character chunks to avoid an ~900-character orphan chapter. Each full source hash equals its prepared artifact source hash, and manifest chapter counts equal actual chapter counts.

## Duplicate and provenance preflight

READ ONLY SQL was executed on Production for each of the five actual manifest IDs, five exact source hashes, five titles at series level, and five titles at episode level. **All four counts were zero for each candidate**. This is an exact identifier/hash and title/episode preflight, **not** a cryptographic full-body or semantic duplication proof; compare old compound/short-story works and variant titles manually before approval. The legacy 36 rights-unverified public series are separate and are not a bulk-approval population.

## Preliminary legal framework — NOT human rights clearance

- **Japan:** all five authors died 1908–1930, so their underlying author terms are expected to have expired prior to Japan's 2018 term extension, which did not revive already-expired rights. Primary framework: https://www.bunka.go.jp/seisaku/chosakuken/hokaisei/kantaiheiyo_chosakuken/1411890.html
- **United States:** all five reported first-publication years are 1908–1927, outside the 95-year pre-1978 published-work term by 2026; foreign-restoration nuances still require source-specific review. Primary framework: https://www.copyright.gov/circs/circ38b.pdf
- **South Korea:** verify applicable foreign/source-country and local-term conditions per selected original, not a generic `life + 70` assertion. Primary law: https://www.law.go.kr/lsLinkCommonInfo.do?lsJoLnkSeq=1033063625
- **Provider:** verify the *current per-work rights flag* and provider handling rules. Primary policy: https://www.aozora.gr.jp/guide/kijyunn.html

**Unresolved components for all five:** `original_work`, `edition`, `editorial`, `annotations`, `digitization`, and `provider_terms` retain `needs_review`. In particular, modern base-edition years **do not** grant rights to the edition's potentially creative amendments. Do not copy modern editorial commentary, unexamined annotations, publisher layout, cover, illustration, translation or narration based solely on original-author term expiry. The Aozora catalogue copyright flags and strict normalization are preflight signals, not final authorization.

Review each actual text and work card for original publication/author dates, modern editorial changes, historical-language/content warnings, source licensing, annotation/proofreader status, and any inherited rights. Final review must record the reviewer, timestamp, JP/US/KR findings, rights-components basis, and accepted source hash. Before such sign-off, keep **`rights_status=pending`, `approved=false`, `reviewed_at=null`** for every candidate. Current `import_status=prepared` means source *preparation*, not imported into the site.

## 2026-10-21 follow-up — original economic-rights terms and alternate-edition screening

The five **underlying original works** have a stronger preliminary expiry case, **separately from the exact Aozora transcription's modern editorial scope**:

- **Japan (official Agency for Cultural Affairs):** 2018 life+50 to life+70 extension did not resurrect protection already expired before the reform; all five writers died in 1908–1930, decades before the transition. See https://www.bunka.go.jp/seisaku/chosakuken/hokaisei/kantaiheiyo_chosakuken/1411890.html (questions 2–4).
- **United States:** Cornell's January 2026 public-domain chart confirms works first published outside the US **before 1931** are out of their published-work terms (subject to source/edition identity). The five original publication years are 1908–1927. https://guides.library.cornell.edu/copyright/publicdomain
- **South Korea:** Korean Copyright Commission and official government guidance confirm 2013 life+50 to life+70 extension did **not** apply to economic rights already expired by commencement; ordinary author terms for these authors ended by 1980 at the latest. https://www.easylaw.go.kr/CSP/CnpClsMain.laf?ccfNo=2&cciNo=1&cnpClsNo=2&csmSeq=695 ; https://www.copyright.or.kr/customer-center/faq/list.do?categorycode1=&counselfaqno=47592&pageIndex=2&portalcode=04&searchkeyword=
- **Aozora file policy:** explicitly allows commercial/noncommercial copying, redistribution and format conversion of files for expired works and requests that provenance and alteration history be kept. https://www.aozora.gr.jp/guide/kijyunn.html

This is **AI-assisted legal/bibliographic preflight, not human legal clearance**; modern textual editorial choices, independently copyrightable notes, exact reused printing and source-license nuances are still `needs_review`. The five manifests therefore remain **pending / approved=false**. The existing audit now records the ordinary old-term end-year calculation per writer, with explicit exclusions.

### Future candidate alternative: actual early editions rather than only old first editions

An independent reparse of the Aozora **19,502-row official expanded catalog** found 3,632 records passing the conservative rights/author/first-publication classifier and 3,585 not already represented by a manifest ID or the legacy-title exclusion audit. **75** of those have a first BASE edition no later than 1930. That does **not** imply the actual input or proof print was from before 1931, the exact material is rights-cleared, or the genre is suitable for LIB read.

Five individual cards were independently opened for a tighter, **metadata-only future shortlist**. No files were downloaded, no source SHA-256 is claimed, no manifest was added, and there was no Production write:

| ID | Work | First base edition | Input/proof edition | Relative suitability |
|---|---|---|---|---|
| `aozora-057848` | 袈裟の良人 — 菊池寛 | 1923 | 1923 input / 1923 proof | Literary prose; comparatively strong edition provenance |
| `aozora-053520` | 死刑 — 上司小剣 | 1930 | 1930 input / 1930 proof | Historical fiction; provider expression advisory |
| `aozora-049394` | 一九二八年三月十五日 — 小林多喜二 | 1928 | Original 1928 two-issue serialization | Long narrative; chapters 1–9 and content warning to review |
| `aozora-055427` | 海蛍の話 — 神田左京 | 1923 | 1923 input / 1923 proof | Science nonfiction; lower fit for a novel-focused shelf |
| `aozora-046337` | 妖怪研究 — 伊東忠太 | 1928 | 1928 input / 1928 proof | Folklore research nonfiction; lower fit, expression advisory |

Primary records: https://www.aozora.gr.jp/cards/000083/card57848.html ; https://www.aozora.gr.jp/cards/000248/card53520.html ; https://www.aozora.gr.jp/cards/000156/card49394.html ; https://www.aozora.gr.jp/cards/001731/card55427.html ; https://www.aozora.gr.jp/cards/001232/card46337.html

**Counterexample:** `aozora-001412` *出家とその弟子* has a first base edition in 1927 but the actual transcription used a 1991 printing and proofed against a 1974 printing, demonstrating why a first-edition-year filter cannot serve as a rights-approval gate: https://www.aozora.gr.jp/cards/000256/card1412.html .

**Decision:** Hold all five pilot rights approvals and any later 75-candidate expansion until individual actual editions and textual rights are reviewed. The early-edition screen is a **future priority queue only**, not authorization to exceed the 3–6-work pilot or to bulk-add works. See the companion JSON under `early_base_edition_screening`.

## Verification and change limits

- Local manifest validation: PASS; existing legacy max-length clamp warnings remain unrelated.
- `test:public-domain-ingestion` with the added strict opt-in normalization test: PASS.
- Local `tsc --noEmit`: PASS; targeted `eslint`: PASS.
- Local Next.js production build compiled and completed TypeScript but **did not complete page-data collection** because the isolated clone intentionally lacks `SUPABASE_SERVICE_ROLE_KEY` / Supabase admin environment. Full build must be assessed using authenticated Vercel Preview/CI; do not label the local build PASS.
- No new Production series, episodes, translations, covers or audio; no DB/Storage writes, publish actions, permission changes, AI calls or credits.
- No merge without explicit user approval. A separate explicit approval, count-checked target ID plan, rollback strategy and pre-write snapshot are required for **Production Draft import**, independently of approving a code PR.
- No automatic AI/Human translation or human narration/TTS, no cron activation, no automatic `rightsChecked` migration of old Official works, no Child84 restore/E2E reactivation.
- Child86 post-expansion Production scale verification remains entirely future work.

## Decision and next steps

**NO-GO for Draft DB import and public release.** The five manifest/evidence records are fit for a Draft PR source review; none is human-rights-approved. Independently review and resolve every rights component and the legacy short-story overlap risk, then (only with explicit operator clearance) prepare a full, auditable 3–6-work Production Draft-import proposal. After separately approved import, verify counts, exact IDs, visibility, Reader, Search and provenance before any publication approval. Expand cautiously toward 30–60 only after pilot acceptance and repeat the same rights process. Child85 completion is for the parent to decide.

Machine-readable per-work audit: `public-domain/audits/child85-pilot-preflight-2026-10-21.json`.
