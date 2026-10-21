# LIB read — Parent-controlled single-child dispatch (2026-10-21)

## Authoritative dispatch contract — STRICT SERIAL, one child at a time

The user has **not yet started any post-reset child chat**. All older children, including former Child85, are retired for manual ChatGPT UI archival. The parent sends an instruction to **one child only**; other slots remain QUEUED / NO ACTION. An Issue alone does not activate a child.

**At any moment there is at most ONE child assigned an active production/repository work phase.** This includes investigation, authoring, revisions and independent review. The parent, not a child, grants the next dispatch. Do not proactively launch a second child, give any other specialist a simultaneous task, or start the next Issue merely because it is in the queue. Existing Draft PRs #108/#131/#136 and governance #145 are NOT a license to resume their child authors.

Choose a child conversation as follows:
1. If the assigned slot has an **active post-reset** ChatGPT conversation that accepts messages, send the work instruction to that existing conversation.
2. If none exists, or it hit its limit and was archived, create **one** specialist conversation (or same-slot v2/v3 successor), then send the same instruction as its first message.
3. Never reuse the retired pre-reset threads. Do not create S1/S2/S3/S4 in advance: only create the currently assigned child's chat.
4. Before entering a different child, require an immutable GitHub checkpoint on the current Issue/PR, stop the current child's repository work, and have the parent explicitly release the dispatch. There is **no automatic transition**, even when the current child reports finished.
5. Independent review is **sequential**: after an author's branch/CI/Draft PR/Preview checkpoint, the parent freezes its HEAD/work, then sends an explicit **review-only** instruction to a distinct child. Reviewer may report GO/NO-GO/FIX; it must NOT push commits or start its own backlog Issue. If FIX is required, parent can return the baton to the author. No self-review.
6. The parent alone confirms matching-head CI/Preview, explicit user merge approval, merge/Production smoke where authorized, and marks the work accepted, blocked, or deferred. **Do not merge or mutate Production without the separate previously required scope-specific approval.**

### Collision and release control

- One active Issue and one working child at a time. **Queue is not authorization**. Record active issue, actor slot, exact branch/base/HEAD, PR, current phase and stop gate in the active Issue checkpoint and parent control.
- Work branch is created from independently checked latest main; no direct main writes. Other PRs stay Draft/held until the parent explicitly sequences them.
- Each child modifies only its authorized files/workflow; no shared `PROJECT_MASTER.md` / `docs/roadmap.md` cleanup except if its task specifically requires canonical changes. Parent controls shared governance files.
- Each next stage re-checks live main, all open PRs and Production; do not rely on the previous child's old SHA. Maintain separate source/Preview/Production evidence.
- These are **procedural locks** enforced by the parent, not a GitHub branch-protection or automated mutex. The user must send one assignment at a time; a GitHub Issue does not trigger background work.
- A verified urgent Production/security incident may **preempt** the current task, but first freeze/checkpoint it and explicitly hand off; never create a second concurrent workstream.

### Initial serial dispatch queue

| Order | Parent sends to | Issue and scope | Gate before next |
| --- | --- | --- | --- |
| **ACTIVE NEXT: 1** | **S4** | [#137 Production cache `AbortError`](https://github.com/sriipu1004-wq/duonovel/issues/137) — measured investigation, scoped fix Draft PR only if justified | S4 finishes/fixes branch + CI + Preview and checks in; parent freezes work |
| 2 | S1 | **Review ONLY** S4 #137 exact HEAD for Reader/Search/Work parity, publication/R18 (NOT #140 yet) | Independent review checkpoint; if FIX, parent hands back to S4 |
| 3 | S2 | [#138](https://github.com/sriipu1004-wq/duonovel/issues/138) Supabase Auth/RPC/SECURITY DEFINER read-only audit; changes require separate release gate | S2 checkpoint, with separate S4 independent review only when needed |
| 4 | S1 | [#140](https://github.com/sriipu1004-wq/duonovel/issues/140) Aozora Reader annotation fidelity, draft if needed | S1 source/Preview + distinct S3 provenance review |
| 5 | S3 | [#139](https://github.com/sriipu1004-wq/duonovel/issues/139) Child85 rights/edition proposal, coordinated *sequentially* with S1/S2 review | Individual verified rights/user decisions; separately authorized bounded Production Draft import/publication |
| later | Parent decides | [#141](https://github.com/sriipu1004-wq/duonovel/issues/141) P6 scale after admitted corpus; [#142](https://github.com/sriipu1004-wq/duonovel/issues/142) P7 Google OAuth; [#143](https://github.com/sriipu1004-wq/duonovel/issues/143) P8 AdSense | Existing roadmap dependency and explicit release gates |

The queue above is *dispatch order*, not a silent change to roadmap P5/P6/P7/P8; R0 reliability and security investigation are operational safety exceptions. P5 rights and Reader work are on hold until their turn. **No other child should receive an assignment now.**

## Send now — S4 single assignment (existing chat, or create missing S4)

> このチャットを LIB read の S4（インフラ・性能・リリース）として扱う。2026-10-21より前の旧子チャットは引退済み。稼働中の新S4があれば同じチャットで継続し、なければ新S4として開始する。
>
> Repository: `sriipu1004-wq/duonovel`
> Production: `https://www.syosetu-libread.com`
> 親の管理PR: `https://github.com/sriipu1004-wq/duonovel/pull/145`
> 正式Issue: `https://github.com/sriipu1004-wq/duonovel/issues/137`
>
> **この工程で作業を行う子チャットはS4だけ。S1/S2/S3にはまだ作業を依頼していない。** 他の子に作業を割り当てず、独立レビューが必要になったら親へ返す。最初にAGENTS.md、PROJECT_MASTER.md、docs/project-state.md、docs/roadmap.md、docs/decisions.md、docs/development-workflow.mdを確認し、GitHub最新main、全Open PRとProductionを独立検証。現在のPR #145は未mergeの運用変更案として参照し、既存の旧Draft PR #108/#131/#136を自動的にmerge/再開しない。
>
> **今回の範囲はIssue #137のみ。** Vercelのpublic-base-work-cards/recording aggregateの再検証AbortErrorについて、利用者影響、5xxか失敗時の限定表示か、timeout/async timer/関数スケジュール、リクエスト・クエリ境界をREAD-ONLYに調査する。既存PR #131は資料として判断する。再現性と安全性が証明できた限定修正に限り、最新mainから単独ブランチを作り、テスト・build・Draft PR・同一HEAD Previewまで進める。検索の正確性、公開/非公開、R18、認証、Reader三モード、AI/Human区別を維持する。権限やProduction DB設定の変更・Production data writes・mergeはしない。
>
> GitHub Issue #137に最新main、担当S4、branch/base/HEAD、変更範囲、証拠、独立レビュー待ち/停止条件を残す。Draft PR + CI + Preview準備ができたら**そこで作業を停止し**、親へ結果を報告する。S1独立レビューは親が後で単独指示する。次のIssue #141/#143や他領域を自動開始しない。
>
> 完了報告は Git/Production、Changed、DB/Data、Preserved、Validation（SOURCE/MOCK/Preview/Productionを区別）、Remaining、Canonical docs updated、Next を含める。

## Later review-only message — DO NOT SEND YET

After parent has received and frozen S4 #137 exact PR HEAD, parent may send this to an existing post-reset S1, or create S1 if missing:

> このチャットをLIB readのS1とする。今回の作業は**新S4 Issue #137の完成したDraft PRの独立READ-ONLYレビューだけ**。S1の独自Issue #140は開始しない。親が指定した正確なPR番号、HEAD、CI、Preview、main/Productionを独立確認し、Reader/Search/Work結果の正確性、公開/非公開、R18、言語分離、既存Reader三モードに回帰がないか確認する。作者の実装PRに直接pushしない。GO/NO-GO/FIXと証拠を対象PRに提出後、親へ報告して停止する。追加実装や別Issueを始めない。

## Succession

When the currently active specialist hits a conversation length limit, require its Issue/PR checkpoint, archive that instance in ChatGPT Project UI, and create a successor **only for the same active slot**. Reconstruct progress from GitHub, not transcript guesses. The user must invoke the one child message; no GitHub connector here sends cross-chat instructions.
