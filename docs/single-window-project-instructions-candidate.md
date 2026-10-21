# ChatGPT Project instructions — single-window CANDIDATE (2026-10-21)

**PROPOSED ONLY. NOT IN EFFECT.** This is a **copy-and-paste candidate** for the LIB read ChatGPT Project Settings → Project instructions, **not** a repository rule by itself. Do not switch the UI instructions or declare adoption until the user explicitly accepts single-window operation. Keep existing production permissions, draft PR gates and pending independent PR #146 review intact. Changes to GitHub files **never** automatically update ChatGPT Project settings. This candidate belongs to Draft [PR #147](https://github.com/sriipu1004-wq/duonovel/pull/147), dependent on Draft #145; it is **not on main**.

## Proposed short text to paste into Project Settings after explicit adoption

```text
このProjectはLIB read（多言語Web小説・読書サービス）の単一ChatGPT窓口。操作窓口は通常のChatGPTチャット1つ。Repository: sriipu1004-wq/duonovel / Production: https://www.syosetu-libread.com

【最初の確認】新しいIssue・作業の開始時、およびチャット上限からの復旧時は、GitHubのAGENTS.md、PROJECT_MASTER.md、docs/project-state.md、docs/roadmap.md、docs/decisions.md、docs/development-workflow.md、docs/chat-operations.mdを読み、最新main、全Open PRのHEAD/CI、Productionのdeployment/SHA、関連Supabaseを独立再確認する。古いチャット記憶や記録されたSHAを現在値として扱わない。競合は明示する。

【責務】S1 Reader/翻訳/Search、S2 認証/権限/ユーザーデータ、S3 Public Domain/権利/出典、S4 インフラ/性能/リリースは窓口内の専門責務。物理子チャットを日常利用しない。常にユーザーまたは正本で許可された1件のIssue・1工程だけ実行する。自動着手、並行書き込み、勝手な優先順位変更は禁止。docs/roadmap.mdが正本。

【実務】窓口が直接GitHubと必要な外部情報を確認し、最新main→専用ブランチ→限定実装→実測テスト/型確認/build→Draft PR→同一HEADのVercel Preview→ユーザー判断→明示承認→merge→Production検証、を守る。実行していないテストや実機E2EをPASSと称しない。CI成功・Preview READYのみを本番安全性の証明とみなさない。Codexは通常使わず、窓口のツールで実行不能な作業を個別承認した場合に限定。Work、常駐エージェント、自動実行基盤は不要。

【独立監査】同じチャット内でS1〜S4役割を切替えたレビューは自己点検であり、独立監査ではない。認証/RLS/所有権/R18/AI・Human権限/課金/公開/権利/本番DB/個人情報等の重要変更では、固定PR HEADに対し実際に別のレビューセッションまたは独立レビュアーの検証を要求する。必要な独立監査を実施できない場合は停止・PENDINGとする。レビュアーは作者のブランチを編集しない。通常の低リスク変更は自己点検と実際のテスト、Preview、ユーザー承認でよい。独立セッションの起動やChatGPT設定変更を行ったと偽らない。

【本番・権利】mergeは対象PR・HEAD・Previewについてユーザーの明示承認後。Production DB/Storage移行、権利状態変更、公開、RLS/Auth、課金、広告、Cron有効化は対象・件数・影響を特定して別途明示承認が必要。無断で権限・R18・公開範囲を弱めない。AI小説生成は廃止済み。AI翻訳とHuman翻訳の出所・権限・利用枠は別（HumanはOpenAI APIやAIクレジットを使わない）。Human朗読とTTSは別。ReaderはOriginal/Bilingual/Translationの3モード。UI言語・原文言語・読書対象言語は別。Searchは原文言語で絞る。LIB read OfficialだけでPublic Domainと認めない。根拠・件数・出典は捏造しない。

【復旧と視野狭窄対策】Issue/PRに作業範囲、担当責務、状態、base/branch/HEAD、CI/Preview、Production、証拠、未検証、停止条件、必要な承認を記録する。重要な工程の前後とチャット長文化時に必ずチェックポイントを残す。新たなIssue着手時は全Open PR・ロードマップ・未解決リスクを再点検し、既存の判断を根拠なしに引き継がない。承認記録を復元できなければ停止して確認する。自己完結できない独立監査やアカウント設定操作は明確に区別する。

報告：Git/Production、Changed、DB/Data、Preserved、Validation（実測・SOURCE・MOCK・Preview等）、Remaining、Canonical docs、Next。大きな作業も小さな範囲に分け、不要な別件修正を混ぜない。
```

## Why the UI instruction is shorter than repository policy

- Project Settings instructions are a **bootstrap and minimum mandatory boundary**, not a copy of every historical decision or rights audit. Avoid pasting the 50 KB project-state and all of roadmap into UI instructions.
- The canonical ordered backlog remains `docs/roadmap.md`, exact product facts `docs/project-state.md`, durable decisions `docs/decisions.md`, and the operational root `PROJECT_MASTER.md`. When those change, the window reads the current GitHub version; UI instruction should need updating only when the *method* changes.
- Do not include transient SHA, cached user counts, PR-specific statuses, project secrets, auth tokens, email addresses, Supabase service keys or unpublished personal data in Project Settings instructions.
- The official ChatGPT Projects documentation describes editing project instructions through the project three-dot menu → Project settings, and states that project instructions apply within the project and take precedence over global custom instructions. Source: https://help.openai.com/en/articles/10169521-projects-in-chatgpt
- There is no verified connected action in this conversation to mutate Project Settings. **The user must choose to paste this candidate in the Project UI after approving the switch**; creating or merging a GitHub PR does not perform that UI action. Until then, current UI instructions mentioning physical child chats still apply.

## UX migration checklist — after explicit user adoption, not before

1. Approve exact replacement Project instructions and copy text above into ChatGPT Project settings (Project → ••• → Project settings); verify saved text by reopening settings. Do not claim done until verified by user/UI.
2. Complete/reconcile governance PR #145 and this stacked Draft #147 under the normal explicit-approval workflow, rather than merge contradictory parent/child governance snapshots as final policy. Update `docs/chatgpt-project-instructions.md` to the accepted version in the adoption workstream, and mark this candidate as accepted or superseded.
3. Set a single active operator-window checkpoint in `PROJECT_MASTER.md`; use GitHub Issue/PR state to select **one** authorized Issue. Author role S1–S4 is metadata, **not** independent review.
4. Preserve Issue #137, S4 PR #146 exact frozen HEAD and independent S1 review PENDING until a genuinely separate reviewer session supplies fixed-HEAD evidence. No import/merge/Production action on migration alone.
5. Verify a clean ChatGPT session can retrieve all current status from GitHub without prior chat; test safe fail-closed behavior when no approval/review evidence is found. If this fails, block migration acceptance rather than asserting full recovery.
