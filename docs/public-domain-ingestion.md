# Public Domain ingestion policy and operator runbook

Status: Child71 operational foundation. This is an internal operating control, not an automated legal conclusion.

## 1. Scope and non-goals

LIB read may ingest human-reviewed public-domain or otherwise reusable source texts into the existing `series` / `episodes` model as **LIB read Official Drafts only**. The importer does not publish, translate, generate glossary entries, create covers, charge credits, or create a separate Public Domain schema.

The library exists to let a first-time reader experience Original / Bilingual / Translation-only reading and to provide a small international classic shelf. It is not intended to turn LIB read into a classics-first service; current Web fiction remains the primary product direction.

## 2. Candidate selection versus rights approval

A conservative age heuristic (for example, preferring authors dead for roughly 100+ years) may be used only to build a candidate list. It must never set `rights_status=approved`, `approved=true`, publication state, or translation permission automatically.

Human review must separately consider at least:

- original work;
- the exact edition used;
- translation and translator rights;
- editorial revisions / modernized text;
- annotations;
- illustrations;
- cover art;
- digitization / transcription data;
- source-provider terms, licenses, and trademarks.

A modern translation, edited edition, annotation set, cover, illustration, or provider-created asset is not treated as reusable merely because the underlying original work is old.

`rights_status=approved` and `approved=true` are both required for import. An approved manifest must also have a reviewed source hash, reviewed chapter count, reviewer identifier, review date, reviewed jurisdictions, and no unresolved/rejected rights component.

## 3. Jurisdiction policy

The manifest records only jurisdictions actually reviewed; it does not claim that a work is public domain worldwide. For the initial JA/EN/KO shelf, the operator should normally review at least Japan, the United States, and South Korea, and add other jurisdictions where the author, edition, translator, or intended distribution creates a material issue. If a relevant jurisdiction is uncertain or conflicting, use `needs_review` rather than `approved`.

`reviewed_by` should use an operational identifier such as `LIB read operator`, not unnecessary personal information.

## 4. Source-provider notes checked 2026-09-22

These notes are operational summaries. The individual item and current provider notice still govern review.

### 青空文庫 / Aozora Bunko

Primary policy: https://www.aozora.gr.jp/guide/kijyunn.html

- Aozora states that files for works whose copyright has expired may be copied, redistributed, shared, and otherwise used, including commercially, under its handling rules.
- A translated work can still be protected when translator rights remain; do not approve by author age alone.
- Aozora asks that title/author/translator/base-edition/input/proofreading/provenance information not be removed when redistributing, and expects transformation history to be clear when text is altered.
- The importer therefore preserves Aozora ruby and `［＃...］` annotations and only separates a recognized trailing bibliographic/provenance block into archive metadata. It does not blanket-strip source notation.

### Project Gutenberg

Primary policies:

- https://www.gutenberg.org/policy/license.html
- https://www.gutenberg.org/policy/terms_of_use.html
- https://www.gutenberg.org/policy/permission.html

- Project Gutenberg's determinations are primarily U.S.-law determinations; non-U.S. reuse requires separate jurisdiction review.
- Some items are still copyrighted and distributed by permission. Review the copyright notice inside the individual ebook, not only the catalog entry.
- The Project Gutenberg name/trademark and license are separate from the underlying unrestricted text. Attribution in an acknowledgements/source context is distinct from presenting a redistributed ebook as a Project Gutenberg-branded product.
- The main website is intended for human users and warns that automated access can be blocked; bulk automated downloads should use approved mirrors/offline catalogs. Child71 therefore implements **no remote fetcher**. Source acquisition is manual and manifest-controlled.
- The Gutenberg normalizer only separates text between recognized START/END markers and retains the removed header/footer/license text in local archive metadata for audit. If markers are not confidently found, it removes nothing.

### Standard Ebooks

Primary examples/policy:

- https://standardebooks.org/contribute/collections-policy
- Standard Ebooks download pages state that content produced by or for Standard Ebooks L3C is dedicated to the public domain via CC0 1.0, while third-party content displayed on the site may still be copyrighted.

Standard Ebooks works only on books it treats as U.S. public domain, but that is not a worldwide determination. Individual translations, third-party content, source editions, covers, images, and other material must still be reviewed. Child71's `standard_ebooks` profile performs only encoding/newline normalization and emits a manual-review warning; it does not automatically extract or reuse provider cover/design/metadata assets.

### 공유마당 / Gongu Madang

Primary guidance:

- https://gongu.copyright.or.kr/gongu/main/contents.do?menuNo=200091
- https://gongu.copyright.or.kr/gongu/main/contents.do?menuNo=200093

The site describes expired works separately from CCL-licensed works. It states that expired economic rights works may be used without a separate permission process under Korean law, while CCL works must follow the displayed attribution/commercial/derivative/share-alike conditions. The operator must verify the **per-item label and metadata**; presence on 공유마당 is not itself an approval rule. Child71 uses manual source acquisition for Korean material as well.

## 5. Manifest workflow

Manifests live under `public-domain/manifests/<id>.json`. `_template.json` is a non-importable template and is ignored by bulk validation.

Required audit fields include identity/title/author/language/publication dates, provider URL and local raw file, edition/translator information, status and basis, per-rights-component review, jurisdictions, reviewer/date, chapter configuration/count, source hash, cover status, and import status.

The schema intentionally requires explicit component reviews for original work, edition, translation, editorial work, annotations, illustrations, cover, digitization, and provider terms. `not_applicable` is valid when that component is genuinely absent.

## 6. Source acquisition and raw preservation

Current Child71 flow is manual-source-first:

1. Verify the provider's current terms and the individual item.
2. Download or export the source manually when permitted.
3. Save the exact input file at the manifest's `source_file` path under `public-domain/sources/raw/`.
4. Do not commit raw source files by default; they are gitignored. The manifest and SHA-256 hash are the Git-tracked audit record.
5. Run prepare. The raw input is never silently overwritten.

No user-supplied URL is fetched by a public API. No arbitrary URL fetcher or crawler exists in Child71, avoiding SSRF and provider-automation problems.

## 7. Prepare pipeline

Run:

```bash
npm run public-domain:validate
npm run public-domain:prepare -- <manifest-id>
```

Prepare performs:

- manifest validation;
- raw-byte SHA-256 calculation;
- explicit decoding (`utf-8`, `shift_jis`, or `euc-kr`);
- provider-specific conservative normalization;
- raw/display/archive-metadata separation;
- single-episode or heading-regex split;
- zero/empty chapter rejection;
- excessive chapter count, many-short-chapter, duplicate-title, and very-long-chapter warnings;
- local prepared artifact creation under `.public-domain-work/<id>/`.

The prepared artifact is not a rights approval. The operator must review chapter boundaries and update `source_hash`, `chapter_count`, rights fields, and approval fields in the manifest before import.

## 8. Import safety

Run dry-run first:

```bash
npm run public-domain:import -- <manifest-id>
```

Dry-run performs no database write and requires no service-role key.

An actual write requires `--execute`, an explicit target, and `PUBLIC_DOMAIN_IMPORT_TARGET` in the loaded environment matching that target. Production additionally requires both `--production` and `PUBLIC_DOMAIN_IMPORT_CONFIRM=PRODUCTION_DRAFT_ONLY`.

```bash
PUBLIC_DOMAIN_IMPORT_TARGET=preview \
  npm run public-domain:import -- <manifest-id> --execute --target=preview
PUBLIC_DOMAIN_IMPORT_TARGET=production \
PUBLIC_DOMAIN_IMPORT_CONFIRM=PRODUCTION_DRAFT_ONLY \
  npm run public-domain:import -- <manifest-id> --execute --target=production --production
```

The importer resolves LIB read Official through the existing canonical Official-account identity; there is no CLI author-ID override. It refuses an existing matching manifest ID or source hash. It creates only:

- `series.publication_status = private`;
- `episodes.posting_status = draft`;
- `episodes.is_published = false`;
- `translation_permission_mode = closed`;
- `recording_permission_mode = closed`;
- canonical `series.source_language` from the manifest.

Original-author/source/rights-checked audit metadata is stored inside existing `series.effect_settings.publicDomain` while `author_id` remains LIB read Official for management. Public-page presentation of that metadata can be finalized with the first real Child72 works; no author architecture or database migration is introduced in Child71.

The importer contains no publish flag, translation generation, glossary generation, credit/allowance call, or public API route.

## 9. Re-import and idempotency

The same manifest ID or source hash must not create a second series. Existing works are not overwritten. If a source or split requires correction, stop and review; update/re-import semantics are deferred rather than silently modifying an existing work.

After a successful import the local manifest `import_status` becomes `imported`; that Git diff should be reviewed and committed as the audit trail.

## 10. Child72 handoff

Child72 should start with roughly 2–3 works each for JA/EN/KO, then verify Reader, translation, glossary behavior, source/rights display, chapter boundaries, SEO, and author attribution. Scale only after this real-world pass; do not bulk-load dozens of works in the first run.


## 11. Production Official inventory audited 2026-09-22

A read-only Production audit found:

- 37 LIB read Official series;
- 437 episodes, all currently published;
- all 37 series currently public;
- 36/37 series have no `source_language`;
- 37/37 series have no `effect_settings.publicDomain` manifest/source-hash metadata.

The Git snapshot is `public-domain/audits/official-production-2026-09-22.json`.
The current Official shelf consists of:

- 芥川龍之介: 短編 collection, 芋粥, 地獄変, あの頃の自分の事, 歯車, 侏儒の言葉, 河童;
- 夏目漱石: 短編 collection, 文鳥, 永日小品, 坊っちゃん, こころ, 草枕, 三四郎, それから, 吾輩は猫である, 夢十夜, 虞美人草, 行人, 明暗, 門, 私の個人主義, 硝子戸の中;
- 太宰治: 短編 collection, 女生徒, 人間失格, 斜陽, 津軽, 右大臣実朝;
- 宮沢賢治: 短編 collection, 銀河鉄道の夜, グスコーブドリの伝記, 春と修羅, 風の又三郎;
- 江戸川乱歩: 短編 collection, 孤島の鬼, 少年探偵団.

The short collections contain 46 individually titled episodes; those titles are also stored in the audit snapshot so new Aozora candidates can avoid obvious duplicates.

Existing database rows do **not** preserve sufficient source URL, exact edition, digitization provenance, or per-work rights review to retroactively declare them approved. Some bodies contain Aozora-style notation, but that is not evidence strong enough to attach an Aozora provenance record automatically. Existing works therefore remain a separate rights-backfill task: reconstruct the exact source first, then attach reviewed metadata. Do not fabricate source hashes or manifests from the current database body.

### Existing shelf: U.S. review priority

This is a triage rule, not a final infringement conclusion.

- Natsume and Akutagawa works are generally strong pre-1931 U.S. public-domain candidates because the listed works were published before 1931.
- Dazai works in the current shelf are post-1930 publications and require U.S.-specific review before treating them as globally reusable.
- Miyazawa is mixed: `春と修羅` is a pre-1931 candidate, while major posthumous works such as `銀河鉄道の夜`, `グスコーブドリの伝記`, and `風の又三郎` require U.S.-specific review.
- Edogawa is mixed: `孤島の鬼` begins in the 1929–1930 period and is a pre-1931 candidate subject to exact publication review; `少年探偵団` was first published later and requires U.S.-specific review.
- The short collections must be reviewed per contained work, not as one aggregate title.

No existing Production work is modified by Child71 on the basis of these observations.

## 12. Jurisdiction baseline used for conservative bulk candidate selection

### Japan

Current Japanese law is generally life + 70 years. The 2018 extension did not revive works whose protection had already expired before the amendment took effect. The Agency for Cultural Affairs explains that, in principle, authors who died in 1967 or earlier were not newly pulled into the extension merely by the 2018 amendment; old-law and special-term issues still require checking for the exact work.

Operational primary source:

- https://www.bunka.go.jp/seisaku/chosakuken/hokaisei/kantaiheiyo_chosakuken/1411890.html

### South Korea

Current Korean law is generally life + 70 years. For foreign works, Article 3(4) states that if the protection period has expired in the foreign source country, Korea does not recognize a longer protection period under Korean law for that foreign work.

Operational primary sources:

- https://www.law.go.kr/lsLinkCommonInfo.do?lsJoLnkSeq=1033063625
- https://www.copyright.or.kr/eng/laws-and-treaties/copyright-law/chapter02/section04.do

### United States

For 2026 operations, the conservative simple rule used by Project Gutenberg for pre-1978 publications is that qualifying works first published in 1930 or earlier have exceeded the 95-year maximum term. Foreign works first published later can require separate treaty/URAA/restoration analysis. Therefore Child71 does **not** auto-approve a Japanese work merely because it is public domain in Japan or present in Aozora.

Operational references:

- https://www.copyright.gov/help/faq/faq-duration.html
- https://www.copyright.gov/gatt.html
- https://www.gutenberg.org/help/copyright

Translations, revised editions, annotations, illustrations, and covers remain independently reviewable even when the original text is public domain.

## 13. Conservative Aozora bulk-candidate pipeline

Aozora provides an official UTF-8 expanded CSV catalog containing work ID, title, first publication, copyright flags, contributor roles/death dates, base-edition metadata, text-file URL, encoding, and card URL.

Child71 adds:

```bash
npm run public-domain:aozora-candidates -- --limit=25
npm run public-domain:aozora-candidates -- --limit=25 --write
```

The generator uses the official catalog ZIP and only selects **pending** candidates that satisfy all of the following mechanical filters:

1. Aozora work copyright flag is `なし`;
2. every contributor copyright flag is `なし`;
3. contributor roles are authors only — translations/editors are excluded from automatic candidate generation;
4. latest author death year is 1955 or earlier;
5. first publication year can be parsed and is 1930 or earlier;
6. source card and ZIP URLs are on the expected Aozora host/path;
7. obvious duplicates already present as an Official series or inside an Official short collection are excluded;
8. candidate source has at least the configured minimum character count.

Passing those filters produces `rights_status=pending` and `approved=false`. The generator has no code path that converts a candidate into an approved manifest.

The 1955 death cutoff is deliberately stricter than is necessary for many Japanese works. It is a candidate-quality filter, not a statement that later authors are protected.

## 14. Allowlisted source sync and mass Draft import

Aozora candidate manifests retain an internal `source_download_url`. Source acquisition can be performed with:

```bash
npm run public-domain:source-sync -- aozora-<id> --prepare
npm run public-domain:source-sync -- --all-pending --limit=10 --prepare
```

Safety properties:

- HTTPS only;
- exact `www.aozora.gr.jp/cards/.../files/*.zip` allowlist;
- redirects rejected;
- ZIP and extracted-text size limits;
- exactly one TXT entry required;
- existing raw source is not overwritten unless `--force`;
- approved-manifest hash mismatch aborts instead of replacing the reviewed source;
- source SHA-256 and retrieval timestamp are recorded;
- source sync never changes `rights_status` or `approved`;
- default rate delay is 750 ms and one run is capped at 50 sources.

For very large Aozora acquisition, prefer its published corpus/catalog workflow or a local copy rather than hammering the main website with thousands of individual requests.

After human rights review and chapter review, approved manifests can be batch-checked/imported:

```bash
npm run public-domain:batch -- --all-approved --prepare
PUBLIC_DOMAIN_IMPORT_TARGET=preview \
  npm run public-domain:batch -- --all-approved --prepare --execute --target=preview
PUBLIC_DOMAIN_IMPORT_TARGET=production \
PUBLIC_DOMAIN_IMPORT_CONFIRM=PRODUCTION_DRAFT_ONLY \
  npm run public-domain:batch -- --all-approved --prepare \
  --execute --target=production --production
```

Batch import is capped at 100 manifests per run and inherits all single-import gates:

- approved manifest only;
- exact reviewed source hash;
- exact reviewed chapter count;
- duplicate manifest/source-hash rejection;
- canonical LIB read Official account only;
- private series + draft episodes only;
- no publish;
- no translation generation;
- no glossary generation;
- no credit/allowance use.

This implements the machinery needed for dozens of works without converting legal review into a bulk checkbox.

## 15. Official audit command and Child71 stopping point

Run:

```bash
npm run public-domain:audit-official
npm run public-domain:audit-official -- --write-snapshot
```

This command is read-only against Supabase and reports Official series/episode state, missing source language, and missing Public Domain metadata.

Child71 is complete when the following are true:

- legal/source policy is documented;
- current Official shelf is auditable;
- pending candidates can be generated in bulk;
- approved source acquisition can be reproduced and hashed;
- chapter preparation is deterministic;
- approved manifests can be batch-imported as Official Drafts;
- CI protects the rights/Draft/non-paid gates.

Actual new Production content should only be inserted once individual manifests have passed the human review gate. A large batch of **unreviewed** works is intentionally impossible.
