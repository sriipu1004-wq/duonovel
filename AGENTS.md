# LIB read — entrypoint and safety contract

## Goal-first execution guard

**LIB read-specific application:** Read live `docs/roadmap.md`, `PROJECT_MASTER.md`, `docs/development-workflow.md`, and active Issue. Preserve canonical ranked R0 security/rights/ownership gates, GI measurement and P5+ product roadmap. Work only on the active authorized Issue/phase; do not create a competing writer or silently jump roadmap. Unrelated UI polish, speculative optimizations, repeated intermediate audit requests and mock-only test expansion are not reasons to delay an actual blocker resolution or integrated Reader/translation/rights milestone. High-risk independent release reviews and exact Production/merge approval are mandatory.

## 2026-11-02 owner directive — GOAL-FIRST PRIORITY GATE (proposal until accepted into main)

This governs **task selection and execution sequence**, never permissions, scientific truth, or release authorization.

1. **Ground truth before work.** At the start of a new work phase, read the live authoritative master/decision/roadmap/issue indicated below, current main and relevant open Draft PRs. Do not follow outdated chat summaries or assume a Draft PR is accepted. State the **end goal**, **current milestone acceptance criterion**, **critical-path dependency**, and **single highest-impact allowed next action**. A full historical rescan is unnecessary every turn unless evidence changed.
2. **Prefer completed capabilities over visible activity.** Choose work that directly closes the active milestone's acceptance gap or its demonstrated prerequisite. Distinguish verified integrated outcomes from code written, mocks, unit tests, PR count, repeated reviews, or documentation volume. These intermediate artifacts are evidence, not a completed user outcome.
3. **Severity-based interruption** (severity is judged by actual impact, exposure, and dependency, not by the mere existence of a defect):
   - **S0 — safety/rights/secret leakage, irreversible corruption, materially unsafe operation:** stop the affected risky operation and perform only authorized containment; preserve existing HOLD/review gates.
   - **S1 — demonstrated blocker on the active milestone's critical path:** fix the smallest sufficient root cause with a relevant regression and resume the milestone.
   - **S2 — real but nonblocking defect or useful improvement:** record once in existing backlog/issue where possible, defer; do not derail S1/critical-path delivery.
   - **S3 — cosmetic, speculative, duplicate checking, documentation churn, or extra audit without a specific release/safety decision:** defer or drop.
   A suspected S0/S1 must be supported by a concrete failure/impact and scope; never invent a criticality rating to justify side work.
4. **No micro-fix loop.** Before opening another issue/PR, adding another audit or extending a test suite, explicitly ask: "What exact currently unmet milestone acceptance condition will this change unlock?" If none, do not start it. Prefer a bounded integration/E2E candidate using existing assets instead of endless isolated mock-only additions. Group related fixes where safe; keep risk-relevant boundaries and proper verification.
5. **Two-cycle anti-stall rule.** If two consecutive work cycles do not materially reduce the current milestone gap, stop expanding the same narrow workstream. Re-evaluate the bottleneck, alternatives (including reuse, simpler route, defer, no build), cost/risk, and direct path to acceptance. Record the decision in the existing canonical task, then resume the highest-value authorized work. Do not interpret this as permission to skip mandatory gates.
6. **Minimal decision log, not ritual.** At significant checkpoints record: goal/milestone; baseline vs achieved acceptance evidence; primary blocker; selected next action and why it beats alternatives; deferred findings; HOLD/approval boundary. Don't repeat full inventories or require new multi-chat audits for each low-risk intermediate iteration. Honest FAIL/HOLD/NOT_VERIFIED is preferable to cosmetic PASS.
7. **Safety and authority unchanged.** Never bypass current explicit user approvals, independent reviews where required, publication/data/financial/Host/Production boundaries, cost restrictions, or the prescribed Draft PR → review → approved merge process. A plain "続けて" does not grant a new permission.

**Priority rule:** Current explicit owner direction and live canonical roadmap/master control project-specific ordering. This gate implements that order; it does not autonomously reprioritize or silently edit existing decisions.


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
