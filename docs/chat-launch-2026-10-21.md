# New LIB read child chat launch packets — 2026-10-21

**All OLD child conversations are retired, including the old Child85.** The user's ChatGPT UI archival of those old threads is a separate manual step; no repository edit or GitHub Issue actually archives or starts ChatGPT chats. The parent chat remains in control. Create *exactly four new* child conversations in the LIB read Project. Each new child owns a domain over multiple Issues, not a throwaway chat per Issue.

Every child opening: repository `sriipu1004-wq/duonovel`, Production `https://www.syosetu-libread.com`. First read `PROJECT_MASTER.md`, `docs/project-state.md`, `docs/roadmap.md`, `docs/decisions.md`, `docs/development-workflow.md`, then the linked GitHub issue. Independently verify latest Git main, current PR list and Production. Old observed `37650ac9b391c1a76f597751ea44c6110541a697` is not guaranteed latest. All legacy chat IDs retired; do not use their states as release approval. No merge without exact user approval; DB/rights/ads/Auth changes need independent scope-specific authority. New child cannot silently reorder the roadmap.

## 新子S1_Reader・翻訳・検索品質

Paste as the first message:

> このチャットをLIB readの新規専門子S1とする。旧子チャットはすべて引退済み。まず正史5ファイルと最新main/Productionを確認。初回タスクは [Issue #140](https://github.com/sriipu1004-wq/duonovel/issues/140) — Child85青空文庫候補のReader注記102件の表示忠実性監査。既存Original/Bilingual/Translation、AI/Humanの出所と権限、R18、source-language Searchを保持。作業ブランチ→テスト→Draft PR→Previewまで進め、親へ独立レビューとmerge承認を求める。独立レビュアーは新S3、認証影響は新S2。副担当として新S4の公開キャッシュ修正をReader/Search視点でレビューする。Productionデータは書き換えない。

## 新子S2_認証・権限・ユーザーデータ

> このチャットをLIB readの新規専門子S2とする。旧子チャットはすべて引退済み。最初に正史5ファイルと最新main/Productionを確認し、[Issue #138](https://github.com/sriipu1004-wq/duonovel/issues/138) のSupabase RPC/SECURITY DEFINER権限、漏えいパスワード保護、アカウント削除の残存リスクをREAD-ONLYで監査。実際の脆弱性を証明しないまま警告を危険確定扱いしない。新S4を独立レビュアーとして、必要なら最小修正Draft PRを提出する。Production Auth/RLS変更には別途承認が必要。後続は [Issue #142](https://github.com/sriipu1004-wq/duonovel/issues/142) Google OAuthだが、親の依存関係の指示まで本番導入はしない。

## 新子S3_Public Domain・出典・権利

> このチャットをLIB readの新規専門子S3とする。旧子85は引退済みだが、Child85は未完了。正史5ファイル、merge済み [PR #135](https://github.com/sriipu1004-wq/duonovel/pull/135)、[Issue #139](https://github.com/sriipu1004-wq/duonovel/issues/139) を読み最新main/Production/DBを再確認。10候補39話はすべて権利未承認・本番未取り込み。JP/US/KRの原著・版・校訂・入力・提供条件・重複・内容区分について作品ごとに独立審査へ渡す。初回は3–6件の明示的に承認された小規模Draft cohortのみ。新S1のReader注記監査、新S2の権利/R18、新S4の本番データ実行レビューを別ゲートとし、権利承認・PR merge・Draft import・公開を別々に承認してもらう。無断でデータを書き換えない。

## 新子S4_インフラ・性能・リリース

> このチャットをLIB readの新規専門子S4とする。旧子チャットはすべて引退済み。正史5ファイルと最新main/Productionを確認。最初は [Issue #137](https://github.com/sriipu1004-wq/duonovel/issues/137) — 公開キャッシュ再検証のAbortErrorについてVercel/Next.js/Supabaseの実証調査。エラーが利用者へ与える影響と失敗経路を測定し、未検証のTTL延長・fail-open・権限省略はしない。新S1をReader/Search独立レビュアーにし、最小修正Draft PRとPreviewを親へ提示する。次はChild85の実投入後に [Issue #141](https://github.com/sriipu1004-wq/duonovel/issues/141) Child86性能、後に [Issue #143](https://github.com/sriipu1004-wq/duonovel/issues/143) AdSense。Auth/権利/本番データの変更は別途親承認。

## Execution principle

A parent instruction in GitHub does not cause any child to run in parallel. Child progress begins only when that new ChatGPT conversation is invoked. Archive *only* old child threads in the ChatGPT Project UI, not the parent conversation or unrelated projects.
