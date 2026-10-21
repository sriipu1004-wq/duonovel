# LIB read specialist chat dispatch — existing chat or successor (2026-10-21)

## Dispatch condition — apply to EVERY specialist task

**The user retired all child conversations that existed before the 2026-10-21 reset** (including the old Child85). Do not reuse any of those. ChatGPT Project UI archival is a user action and has not been automatically performed by GitHub.

For each slot S1, S2, S3, S4, use this decision sequence:

1. **If the corresponding active post-reset specialist chat already exists, is not archived, and accepts new messages:** paste its assignment below **into that existing chat**. Continue its current Issue/PR if unfinished; do not create a duplicate or restart work.
2. **If no active post-reset specialist chat exists, or its conversation reached a limit and was archived:** create exactly **one new successor** in the LIB read Project, named with the same Sx slot (append `v2`, `v3` only for successive replacements), and paste the **same assignment text** as its first message. Retrieve open task status from GitHub rather than relying on a lost chat transcript.
3. **Do not create all four every time.** One active instance per specialist slot; former chat histories remain references, not authoritative release records. Parent retains this conversation and all cross-slot approvals. There is no tool to directly send these messages to another ChatGPT conversation; a user must invoke/paste each assignment. Writing an Issue alone never starts background execution.

**Always first:** repository `sriipu1004-wq/duonovel`; Production `https://www.syosetu-libread.com`; read `AGENTS.md`, `PROJECT_MASTER.md`, `docs/project-state.md`, `docs/roadmap.md`, `docs/decisions.md`, `docs/development-workflow.md`. Fetch live main, all open PRs, Production and relevant Supabase evidence before acting. Prior checkpoint main `37650ac9b391c1a76f597751ea44c6110541a697` is only a snapshot. Draft governance PR [#145](https://github.com/sriipu1004-wq/duonovel/pull/145) is not main until explicitly approved/merged; old [#136](https://github.com/sriipu1004-wq/duonovel/pull/136) must not be merged redundantly. Preserve existing product security/rights and do not merge without explicit approval.

A specialist may conduct authorized READ-ONLY investigation and create an **isolated branch + Draft PR + exact-HEAD tests/Preview** within its assigned scope. No Production data/rights, Auth/provider, RLS/security, advertising activation, publication, Cron activation or merge without separate scoped user approval. Use an **independent** reviewer from another child slot; authors cannot certify their own changes as independent.

## S4 — 新子S4_インフラ・性能・リリース (highest priority)

Send to active S4; if missing or archived at chat limit, create successor S4 and send as its first message:

> このチャットをLIB readの専門子S4（インフラ・性能・リリース）として継続、または新規後継として引き継ぐ。2026-10-21以前の旧子チャットは全て引退済みで再利用しない。まずリポジトリのAGENTS.md、PROJECT_MASTER.md、正史4文書を読み、GitHub最新main・全Open PR・Vercel Productionと必要なSupabase状態を再確認する。現在の未完了タスクが既にあれば同じIssue/PRを続け、重複開始しない。
>
> 最優先は [Issue #137](https://github.com/sriipu1004-wq/duonovel/issues/137)。Productionのpublic-base-work-cards/recording集計のcache revalidation AbortErrorについて、アクセス障害と正常なabortの区別、ユーザー影響、発生経路、実測指標、キャッシュ/timeout境界を調べる。既存 [PR #131](https://github.com/sriipu1004-wq/duonovel/pull/131) は資料として再評価し、無条件mergeしない。根拠があれば限定的に修正し、テスト・build・Draft PR・同一HEAD Previewまで実行。独立レビューはS1。権限・R18・公開範囲・Search結果の正確性を犠牲にせず、Production設定/DB書き込み/mergeは別途承認を得る。
>
> 次の [Issue #141](https://github.com/sriipu1004-wq/duonovel/issues/141) Child86は権利審査済み作品の実投入後。[Issue #143](https://github.com/sriipu1004-wq/duonovel/issues/143) AdSenseはP8、P7 Googleログイン後に実装判定する。段階の飛ばし・自己承認はしない。報告はGit/Production、Changed、DB/Data、Preserved、Validation、Remaining、Canonical docs、Nextを必須とする。

## S2 — 新子S2_認証・権限・ユーザーデータ (highest priority)

Send to active S2; if missing or archived at chat limit, create successor S2 and send as its first message:

> このチャットをLIB readの専門子S2（認証・権限・ユーザーデータ）として継続、または新規後継として引き継ぐ。旧子チャットは全件引退済み。AGENTS.md、PROJECT_MASTER.md、正史4文書と現在のGitHub main/PRs、Production/Supabaseを再取得し、既に進行中の同一Issue/PRがあれば続行して重複作業を避ける。
>
> 最優先は [Issue #138](https://github.com/sriipu1004-wq/duonovel/issues/138)。SupabaseのSECURITY DEFINER RPC 10件、漏えいパスワード保護無効、RLS/no-policy情報通知をREAD-ONLYで実際の関数定義・認可判定・GRANT・所有権境界に沿って監査する。警告だけで脆弱性確定とせず、危険な一括REVOKEやRLS変更はしない。必要な最小修正はbranch→回帰検査→Draft PR→Previewで提出し、S4の独立レビューとProduction Auth/DB個別承認を求める。アカウント削除停止と未実施の実認証E2Eは解決済みと称さない。
>
> 後続 [Issue #142](https://github.com/sriipu1004-wq/duonovel/issues/142) GoogleログインはP7。既存Auth・同一メール・identity紐付け・Stripe/credit/作品/本棚/R18の所有権を保持する設計から着手し、親の優先順/承認なくOAuth providerを有効にしない。報告項目はGit/Production、Changed、DB/Data、Preserved、Validation、Remaining、Canonical docs、Next。

## S1 — 新子S1_Reader・翻訳・検索品質 (P5, parallel)

Send to active S1; if missing or archived at chat limit, create successor S1 and send as its first message:

> このチャットをLIB readの専門子S1（Reader・翻訳・検索品質）として継続、または新規後継として引き継ぐ。旧子チャットは全件引退済み。AGENTS.md、PROJECT_MASTER.md、正史4文書とGitHub最新main/PRs、Productionを取得。未完了の同じIssue/PRが存在したらその証拠から再開する。
>
> 最初の実装・監査対象は [Issue #140](https://github.com/sriipu1004-wq/duonovel/issues/140)。Child85で準備済みの青空文庫8散文候補に残る注記102件（傍点、外字、ルビ、異本注、レイアウト）を原文ハッシュ/ソースと照合し、Original/Bilingual/Translation表示の忠実性を検証する。権利未承認作品をProductionに公開せず、検証用fixture/Previewで確認。既存AI/Human出所・権限・クレジット、R18、publication、source-language Searchを保持し、修正が必要なら限定Draft PRとHEAD一致Previewを作る。S3が独立に出典/本文と照合し、S2がセキュリティ影響を確認する。
>
> 併行してS4 [Issue #137](https://github.com/sriipu1004-wq/duonovel/issues/137) のReader/Search/Work結果を**別担当として**独立レビューする。自身が実装したPRを自分で独立監査しない。各段階を親の承認ゲートへ戻し、所定のGit/Production等8項目で報告する。

## S3 — 新子S3_Public Domain・出典・権利 (P5, parallel)

Send to active S3; if missing or archived at chat limit, create successor S3 and send as its first message:

> このチャットをLIB readの専門子S3（Public Domain・出典・権利）として継続、または新規後継として引き継ぐ。旧子85を含む2026-10-21以前の子は全件引退済み。AGENTS.md、PROJECT_MASTER.md、正史4文書、merge済み [PR #135](https://github.com/sriipu1004-wq/duonovel/pull/135)、[Issue #139](https://github.com/sriipu1004-wq/duonovel/issues/139) と権利レビュー記録を読み、最新main/PR/Production/DBを再検証。既存の継続PRや審査票があれば重複作業せず引き継ぐ。
>
> Child85は未完了。10候補/39話はSOURCE準備済みだが、権利承認ゼロ・Production取り込みゼロ。まず候補を絞り、原著・実使用底本/改版・校訂/注記・デジタル化/提供条件を一次情報で照合し、JP/US/KR権利リスク、内容区分/R18、既存作品との重複を作品単位で審査表に記録する。S1 [Issue #140](https://github.com/sriipu1004-wq/duonovel/issues/140) の注記表示検証と、独立S2の権利・R18レビューを受ける。初回3–6作品のDraft候補でも、AI調査だけで最終的な人間の法律審査済みと称さない。作品ごとの権利承認、PR merge、本番Draft import、本番公開はそれぞれ別承認として扱い、未承認のDB/Storage操作をしない。親への報告はGit/Production等8項目と証拠URLを付ける。

## Execution limitations and succession

The parent cannot address a different ChatGPT thread with these repository tools. Send each packet manually to an existing *active post-reset* chat or to a newly opened successor if none exists. On chat limit, checkpoint the active Issue/PR first if possible, archive that **instance only**, and create one same-slot successor that reconstructs GitHub/Production before continuing. Do not reuse the pre-reset legacy child chats or archive the parent conversation. Do not automatically activate dormant P6/P7/P8 when a child finishes R0/P5; parent controls the next assignment.
