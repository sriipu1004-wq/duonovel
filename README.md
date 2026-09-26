# LIB read

LIB read is a multilingual web-novel posting and reading platform.

Production: https://www.syosetu-libread.com

## Product

A published work keeps its source text as the canonical work and can be read in three Reader modes:

- Original
- Bilingual
- Translation only

Translation provenance is separate from Reader mode:

- **AI translation**: author-controlled. A missing translation may be generated through the configured OpenAI API path after server-side permission and entitlement checks. Saved public translations can be reused for the same source/version/language conditions.
- **Human translation**: separately author-controlled user translation with draft, edit, publish, and withdraw states. Human translation does not call OpenAI and does not consume AI allowance, credits, or AI unlocks.

For long-form AI translation, LIB read can use a work-level glossary and bounded context from earlier eligible public content to reduce terminology drift. This does not guarantee perfect consistency or human-level translation quality.

LIB read also includes a private My Library for supported user-owned/imported files, public work posting, read-aloud support, and narration features.

## AI boundary

First-party AI novel/story generation is retired and is not part of the active product. AI is used for reading and translation support, including AI translation and word explanation.

Posting or publishing a work does not by itself send the work to OpenAI. Provider processing occurs only on supported requested AI features after the relevant checks. See [docs/ai-data-flow.md](docs/ai-data-flow.md) for the audited data flow and current limitations on provider/account claims.

## Current plans

- Free: ¥0; public AI-translation unlocks and My Library imports share 3 uses/day; My Library capacity 3 works.
- Premium: ¥680/month; up to 30 public AI-translation unlocks/day; My Library imports have no daily count limit; My Library capacity 20 works.
- Credits: 5 = ¥300, 8 = ¥450, 12 = ¥600; valid for 150 days; 1 credit unlocks one public episode in one target language for AI translation.
- Human translation is free to read and does not consume AI credits or allowances.

## Development

Canonical project state and workflow live in:

- [docs/project-state.md](docs/project-state.md)
- [docs/roadmap.md](docs/roadmap.md)
- [docs/decisions.md](docs/decisions.md)
- [docs/development-workflow.md](docs/development-workflow.md)

Normal delivery flow is: latest main → work branch → implementation → validation → Draft PR → Vercel Preview → explicit approval → merge → Production verification.
