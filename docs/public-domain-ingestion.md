# Public Domain ingestion policy and operator runbook

Status: Child71 foundation. This is an internal operating control, not an automated legal conclusion.

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

An actual write requires `--execute` and an explicit target. Production additionally requires both `--production` and `PUBLIC_DOMAIN_IMPORT_CONFIRM=PRODUCTION_DRAFT_ONLY`.

```bash
npm run public-domain:import -- <manifest-id> --execute --target=preview
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
