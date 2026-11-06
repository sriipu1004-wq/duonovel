# LIB read — durable recovery / operator overview

**Root entrypoint for a new or recovered work session.** Status values here are dated snapshots: **always re-check live GitHub / Vercel / Supabase before acting.** This file never grants merge, Production, data, rights, Auth, billing or ads permission.

- Repo: https://github.com/sriipu1004-wq/duonovel
- Production: https://www.syosetu-libread.com
- Read: [AGENTS.md](AGENTS.md), [CLAUDE.md](CLAUDE.md), [project-state](docs/project-state.md), [ordered roadmap](docs/roadmap.md), [decisions](docs/decisions.md), [development workflow](docs/development-workflow.md), [chat operations](docs/chat-operations.md), [response-status protocol](docs/response-status-protocol.md).

## Operating model (since 2026-11-07: Claude Code; CONTROL-R4 rules unchanged)

The owner moved day-to-day operation from a ChatGPT window to **Claude Code** sessions (2026-11-07). The CONTROL-R4 rules carry over unchanged; only the tooling words change:

| CONTROL-R4 wording | Claude Code meaning |
| --- | --- |
| single ChatGPT operator window | **one writer session per project at a time**, titled `【LIB read】…` |
| separate chat for independent review | a **separate, new Claude Code session** given only the fixed PR HEAD; it posts GO/FIX/NO-GO on the PR and never pushes. Same-model separate session is weaker than a human reviewer — say so. |
| ChatGPT Project Settings | repository `CLAUDE.md` + the shared policy repo `sriipu1004-wq/ai-operator-policy` (`AGENTS.md`, inbox for changes) |
| Codex / Work | not used by default |

S1–S4 remain internal responsibility labels. Serial work, Draft PR → same-HEAD CI/Preview → required independent review → explicit owner merge approval, and separate scope-specific approvals for Production DB/Storage/Auth/RLS/rights/publication/billing/ads/Cron all stay in force.

## Live-verified snapshot — 2026-11-07 (re-check before use)

- **main / Production:** main `c27a2fa` (PR #164, dev tooling only). Last runtime change: PR #163 → `4faa9f9`, Production READY and HTTP-verified (anonymous GET on 8 routes = 200; deployment id matched).
- **Supabase** `nyxbnccuvmlzffgtdadi`: ACTIVE_HEALTHY, PG 17.6.1. Hosted migration history 21 rows (latest `20261103010000`); repository has 76 SQL files → **no blanket `db push`** (Issue #137).
- **API keys:** Production and Preview now use the new `sb_publishable_…` / `sb_secret_…` keys (2026-11-07, owner-approved; Issue #138). Legacy `anon` / `service_role` keys are still **enabled as rollback**; disable them only after a few days of normal operation (owner action, reversible). Legacy keys are retired by Supabase in early 2027.
- **Storage S3 protocol:** owner turned the connection **OFF**; 0 S3 access keys existed.
- **Test account:** one Production account `LIBreadE2E` (owner's Gmail plus-address) for signed-in checks only. No password stored; sign in via email link fetched through the owner's Gmail connector (link valid ~5 min). Never use it to post, buy, change R18, or touch others' data.
- **Tooling:** `scripts/dev/local-supabase.sh` starts a disposable local Supabase stack (see `docs/local-supabase-dev.md`). Cloud environment **"LIB read (duonovel)"** allows `www.syosetu-libread.com`, `syosetu-libread.com`, `nyxbnccuvmlzffgtdadi.supabase.co`; the Default environment does not.

## Current priority (canonical order: [roadmap](docs/roadmap.md))

1. **R0-1 #137** — Production public-cache **AbortError** (≈780 events / 308 users since 2026-10-22, still recurring); PRIVATE AI narration writes without `service_role` (design recorded 2026-11-07); split Draft **#160** into shippable units; legacy PUBLIC audio (4,720 objects; rights decisions are the owner's); migration-ledger reconciliation.
2. **R0-2 #138** — legacy key disable; leaked-password protection (dashboard toggle); 10 `SECURITY DEFINER` functions executable by `authenticated`; account deletion; signup confirm-link expiry UX (S2, recorded 2026-11-07).
3. **HIGH #154** — traffic / ranking integrity (GI-P1 → P3).
4. **P5–P10** unchanged.

Open Drafts: **#160** (#137 B2/R0 integration, MERGE HOLD), **#153** (older overlapping B2, superseded in practice by #160), **#150** (PERFORMANCE_GATE_FAIL), **#157** (docs), **#131** (old metadata), **#108** (Cron, NO-GO). None is approved for merge.

## Independent reviews and approvals

- High-risk changes (Auth, RLS, ownership, R18, private/public, Human/AI entitlements, credits/payments, rights, publication, Production data/schema/Storage, ads/privacy/Cron, visibility-affecting cache/Search) need a **separate-session review at a fixed HEAD** before merge. Self-check must be labelled self-check.
- The owner approves each merge for the exact PR/HEAD, and separately approves each Production data/config action. Approval of one step does not carry to the next.

## Recovery bootstrap

1. Read this file, `AGENTS.md`, `CLAUDE.md`, the canonical docs above.
2. Fetch the shared policy repo `AGENTS.md` (report `POLICY_UNVERIFIED` if unavailable).
3. Verify live main, all open PRs (HEAD / CI / Preview), Production deployment SHA + READY, Supabase health.
4. Read the active Issue / PR checkpoints; recover phase, scope, HEAD, approvals, pending reviews.
5. If an approval or review is missing, stop and ask for exactly that. Checkpoints live in Issues/PRs; durable decisions in `docs/decisions.md`.

Every work report ends with the three lines `【現在】` / `【次の行動】` / `【状態】` (one of the 17 states in `docs/response-status-protocol.md`).
