# LIB read — entrypoint and safety contract

**CONTROL-R4 (2026-10-21): single ChatGPT operator window, S1–S4 specialist RESPONSIBILITIES, not mandatory physical child chats.** The user approved this operating model on 2026-10-21; GitHub governance is being reconciled in Draft PR #147. This file is a recovery entrypoint, not a self-updating status dashboard.

Repository: `sriipu1004-wq/duonovel`
Production: `https://www.syosetu-libread.com`

## Required first actions

1. Read `PROJECT_MASTER.md`, `docs/project-state.md`, `docs/roadmap.md`, `docs/decisions.md`, `docs/development-workflow.md`, and `docs/chat-operations.md`.
2. Independently fetch current main, **ALL** Open PRs and their HEAD/draft/CI states, Vercel Production SHA/READY, and relevant Supabase state. Resolve contradictions between dated documents, past chats and actual GitHub/Production evidence. Don't call a cached SHA current.
3. Read the active Issue/PR checkpoint; verify precise phase, authorized work, outstanding reviewers, Preview, data permissions, approvals and stop gate. An Issue alone never starts work.

## Operating model

- A single ordinary ChatGPT conversation is the user-facing operator and normal implementer. **S1** Reader/translation/Search, **S2** Auth/ownership/R18/data, **S3** Public Domain/source/rights and **S4** infrastructure/performance/release are internal scope labels and checklists.
- Work is **strictly serial**: one user-authorized Issue/phase at a time; no competing writers, automatic next-Issue selection or independent permission to reorder `docs/roadmap.md`. Keep checkpoints and exact HEAD in GitHub.
- Self-review is not independent review. For relevant rights, private/public visibility, R18, Auth/RLS, ownership, AI/Human entitlements, payment/credits, destructive Production data, sensitive SEO or security changes, demand a truly separate reviewer session/person using the fixed PR HEAD. If one cannot be reached, leave REVIEW_PENDING. CI PASS/Preview READY never substitutes for it.
- Normal release: latest main → isolated branch → source/test/build → Draft PR → matching-head Preview → applicable separate audit → user inspection and **explicit merge approval** → merge → Production SHA/READY and smoke. Production DB/Storage/rights/Auth/RLS/ads/Cron/publication writes need distinct scope-specific approvals. No change to main directly.
- Default tools: direct GitHub, Vercel, Supabase (read-only unless authorized). Do not default to Codex, Work, ongoing agents or paid external infrastructure. Treat unavailable local build/authenticated E2E as **unverified**, never as PASS.
- Restart at chat context cap: `PROJECT_MASTER.md` + all canonical files + **live** GitHub/Production/PR evidence; require checkpoint of work phase, scope, base/branch/HEAD, CI/Preview, review, explicit approvals and blockers. Missing approval evidence => STOP/reconfirm. GitHub does not recover uncommitted chat-only work.

## Product invariants

AI novel/story generation retired. AI translation and Human translation are different provenance/permissions; Human translation never calls OpenAI or consumes AI allowance/credits. Human narration != TTS. Reader modes are Original / Bilingual / Translation; AI/Human is a source choice. UI locale, original/source language and reading target language are distinct; Search filters source language. Public Domain needs exact rights/provenance/edition evidence; “LIB read Official” alone is not grounds. Preserve ownership, private/public boundaries, R18, security, publication and billing. Do not fabricate rights, sources, translator/edition hashes, usage, inventory or stronger provider data claims than evidence supports.

**Mandatory answer footer (CONTROL response-status v1.1, 2026-10-24):** Read [docs/response-status-protocol.md](docs/response-status-protocol.md) on every fresh task/context recovery. Every work report must end with exactly three lines, `【現在】`, `【次の行動】`, `【状態】`; choose **one** of its 17 canonical states including backlog exhausted and separate-session independent reviewer handoff/wait. A reply of `続けて` never authorizes release, external access or a new Issue. Project Settings must be manually updated; GitHub does not synchronize the ChatGPT UI. This footer is reporting only and cannot weaken security gates or reorder the roadmap.

**Canonical operations:** `docs/chat-operations.md`. **Operator checklist:** `docs/development-workflow.md`. **Current status/approvals:** `PROJECT_MASTER.md` plus live Issues and PRs. **Historical child-chat launch packets** in `docs/chat-launch-2026-10-21.md` are archive-only, not active dispatch instructions.
