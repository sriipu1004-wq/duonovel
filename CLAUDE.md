# Claude Code cloud entrypoint — LIB read (duonovel)

@AGENTS.md

## Project authority

Before development work, follow current `PROJECT_MASTER.md`, `docs/roadmap.md`, `docs/development-workflow.md`, active Issue and latest remote main/PR/CI/Preview evidence. Keep one authorized work phase at a time. Develop on an isolated branch and Draft PR; do not merge, deploy, change production data, rights, R18, auth or payment boundaries without applicable approval and independent review. An unmerged Draft is not accepted implementation.

## Shared operator policy (private; external repository)

共通規則の正本は sriipu1004-wq/ai-operator-policy の main の `AGENTS.md` と、それが読み込む `policies/workflow/01〜04`（常に適用）。このリポジトリ自身の規則・承認範囲・HOLD が優先し、共通規則は権限を広げない。

PC のセッションでは `~/.claude/CLAUDE.md` が、クラウドのセッションでは環境のセットアップスクリプトが、これを自動で読み込む。自動で読み込まれていない（PC の手元の版が古い、クラウドで ai-operator-policy がセッションに無い等）場合は、作業の最初に main の `AGENTS.md` と `policies/workflow/01〜04` をすべて読む（`@` の行は自分で開く）。どれも読めなければ、最初の返答の冒頭で `POLICY_UNVERIFIED` と伝え、保護された書き込みをしない。読み取りだけの調査は続けてよい。

セッション名は `【LIB read｜親】…` / `【LIB read｜子】…`。「次から」「今後は」などの永続指示は ai-operator-policy の inbox に入れる（書式は inbox/README.md）。入れただけで反映済みとは言わない。

Preserve this repository's own canonical state, explicit owner approvals, independent-review requirements, and HOLDs. Shared policy text cannot grant OS, GUI, secrets, billing, production, financial execution, or merge permission.

Changes to the shared policy go only into that repository's `inbox/` as items (format: its `inbox/README.md`); do not edit its rule files directly. Do not read its `personalization/` in development sessions.
