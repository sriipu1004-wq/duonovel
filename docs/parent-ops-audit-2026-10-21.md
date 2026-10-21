# Parent operator audit and issue dispatch — 2026-10-21

**Later CONTROL-R4 override:** User adopted a single ChatGPT operator window with S1–S4 internal responsibilities. The historical specialist-chat dispatch text below must not trigger physical child creation. S4 #137 PR #146 is frozen, independent review PENDING, and the runtime AbortError cause is unresolved. See [PROJECT_MASTER](../PROJECT_MASTER.md) and [single-window workflow](chat-operations.md). Historical counts/priority assessments remain dated evidence.


**Status:** READ-ONLY evidence; remediation proposals in separate child Issues. Snapshot, not continuously updated. No provider configuration, Auth, RLS, data, content, ad or code modification by this governance work.

## Verified provider facts

- GitHub main `37650ac9b391c1a76f597751ea44c6110541a697`; matching Vercel Production READY `dpl_3Zhkw9WLfYmdzChM2LRRQDNLpXCL`; PR [#135](https://github.com/sriipu1004-wq/duonovel/pull/135) MERGED. Ten Aozora manifests source prepared/pending, 39 prepared chapters, approval/import/publication zero.
- Supabase `ACTIVE_HEALTHY` does not certify Next.js public response reliability. Read-only SQL: 123 series / 120 public / 3 private, public JA/EN/KO 40 each, 84 rightsChecked, 36 legacy unverified JA; 3,284 public posted episodes; zero published Human translations, zero active/trialing subscriptions, 9 non-soft-deleted Auth users; 1,804 view event rows (7-day 1,317; 30-day 1,595, not unique people); 4,728 Storage objects and 30,189,639,005 size-metadata bytes. Storage byte-recovery not independently verified.
- Vercel current runtime error groups included `AbortError: This operation was aborted` from public-base-work-cards / recording aggregate **cache revalidation** on multiple routes. This does **not** establish HTTP outage or leaked content; S4 must distinguish degraded but 200 response from actual failures, and use a short log window on Hobby.
- Supabase security advisor: 27 `RLS Enabled No Policy` INFO (often deliberate deny), ten signed-in-executable `SECURITY DEFINER` RPC WARN, leaked-password protection disabled WARN. No unauthorized use has been demonstrated; S2 inspects function body, auth/ownership/grants and isolated E2E before changes. Performance advisor included 25 unindexed foreign-key INFO and 70 Auth RLS init-plan warnings; no blanket index/policy modifications.
- GSC Wizard MCP inaccessible because its free trial ended; this is not zero search traffic. Use a verified alternative or ask for connected native Search Console evidence later; avoid purchasing subscription by default.
- `auth.identities` connected read-only count showed provider email only at snapshot. Google login is not currently proven; no AdSense publisher approval/serving is evidenced.
- Account deletion is reviewed/manual with old automatic endpoint fail-closed; Auth E2E, SQL Search parity, managed DB recovery+Storage byte recovery, timer callback root cause and Cron #108 are unresolved/accepted risks, not test PASS.

## Dispatch clarification (2026-10-21)

The original row grouping below is priority/planning, **not simultaneous child work**. The user explicitly requested parent-directed **ONE child at a time** and confirmed no post-reset child had started. First: S4 #137; then S1 **review-only** of frozen #137 HEAD; next S2 #138, S1 #140, S3 #139 when parent explicitly transfers the baton. Later gated tasks follow roadmap and own acceptance. Any verified incident interrupt must freeze and checkpoint the current child first. See [single-child dispatch](chat-launch-2026-10-21.md). No automated GitHub mutex was installed.

## Prioritized dispatch and gates

| Lane | Owner | Issue | Next evidence |
| --- | --- | --- | --- |
| R0-1 | new S4 | [#137 public cache](https://github.com/sriipu1004-wq/duonovel/issues/137) | classify error/user impact + bounded fix |
| R0-2 | new S2 | [#138 Auth/RPC](https://github.com/sriipu1004-wq/duonovel/issues/138) | grants, function bodies and security audit |
| P5-A | new S1 | [#140 Reader annotations](https://github.com/sriipu1004-wq/duonovel/issues/140) | 102 Aozora directives, correct rendering |
| P5-B | new S3 | [#139 rights/import](https://github.com/sriipu1004-wq/duonovel/issues/139) | individual rights/edition/R18/duplicate signoff, 3–6 exact Draft cohort |
| P6 | new S4 | [#141 scale/restore](https://github.com/sriipu1004-wq/duonovel/issues/141) | post-expansion Production metrics |
| P7 | new S2 | [#142 Google Auth](https://github.com/sriipu1004-wq/duonovel/issues/142) | OAuth/security/identity-linking |
| P8 | new S4 | [#143 AdSense](https://github.com/sriipu1004-wq/duonovel/issues/143) | policy, site approval and approved placement |
| Parent | parent | [#144 governance/PR triage](https://github.com/sriipu1004-wq/duonovel/issues/144) | archive evidence, stale PR disposition, canonical freshness |

No task is automatically executing from being assigned. The parent must use a NEW selected ChatGPT child; each needs independent review by a different chat/actor. Google login and AdSense insertions postpone, not erase, acquisition and minimum analytics.

## Old PR reconciliation / exact-diff dispositions

- #68 **CLOSED UNMERGED** (2026-10-21), unsafe/outdated legacy Human translation-default edits; source preserved, S2/S1 reassess only if useful.
- #79 **CLOSED UNMERGED** (2026-10-21), single old P0 COMPLETE status already in main.
- #108 publication Cron NO-GO; keep gated, no deploy.
- #130 **CLOSED UNMERGED** (2026-10-21), operator-accepted managed-backup-only deferral recorded by merged #133, no false restore pass.
- #131 Work SEO isolated optimization; currently non-mergeable and must re-evaluate value/rebase.
- #136 prior Google priorities Draft; superseded once the full consolidated reset PR is accepted and merged; close with cross-reference rather than merging twice.
- #135 merged and Production READY, not an active PR.

## User actions outstanding

The user requested physical archive of **all former child chats**, but none of the available chat actions can archive them. Only the user-facing ChatGPT Project chat list can perform it, per chat. This governance note deliberately does not assert their actual archived state. New child chats must be explicitly created in UI using [launch packets](chat-launch-2026-10-21.md), after or independent of UI archive. Avoid any UI **archive all chats** operation that would archive parent or unrelated chat history.
