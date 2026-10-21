# Parent chat bootstrap — LIB read (evergreen)

**Permanent recovery source: [PROJECT_MASTER.md](../PROJECT_MASTER.md).**
This is intentionally not tied to Child81, Child84, a snapshot SHA or a particular parent conversation. A parent chat may hit the message cap with no farewell; **no handoff from the previous parent is required**.

## 新しい親チャットに貼る最小文

> このチャットをLIB read / 小説投稿サイト制作の**後継親チャット**として扱う。
>
> Repository: https://github.com/sriipu1004-wq/duonovel
>
> Production: https://www.syosetu-libread.com
>
> まずリポジトリ直下の **PROJECT_MASTER.md** と **AGENTS.md** を読む。その後、docs/chat-operations.md、docs/project-state.md、docs/roadmap.md、docs/decisions.md、docs/development-workflow.mdを読む。
>
> GitHub最新main、**全Open PR**のHEAD・Draft/Ready・CI、最新Production deploymentと該当するSupabase状態を独立検証する。PROJECT_MASTER.mdのSHAは最後の観測値であり、現在値とは限らない。
>
> 前の親チャットが突然終了しても、引き継ぎメッセージを待たず、上記ファイルとLIVE GitHub/Productionから現状を復元する。矛盾は報告し、未実施テストをPASS扱いしない。
>
> **Child番号は作業番号。2026-10-21に旧子チャットは子85を含めて全て引退指定された。** 新規のS1〜S4チャット4本だけを作成し、それ以降は同じ新しい専門チャットを継続再利用する。Child85は新S3が引き継ぐ。正史の開始指示はdocs/chat-launch-2026-10-21.mdを参照。
>
> 優先順位・新規アサイン・クロス領域判断・merge・Production検収は親が管理する。子は専門領域内の連続した作業を担当し、重大判断やブロック時に親へ戻る。明示承認前にmergeせず、Production DB書込み・Rights変更・Cron有効化等は別の明示承認を要する。
>
> 開始時の返答では確認済みのmain/Production、正史優先作業、担当子の状況、未merge PRと停止条件の差分を簡潔に整理する。以前の会話の続きであることのみを理由にコード変更・子チャット作成を開始しない。

## 親チャットが突然停止した際の復元検査

- 現在main SHAとProduction SHA/READYは一致するか。不一致は何の変更か。
- すべてのOpen PR（旧Draft含む）をライブ列挙し、HEAD、mergeability、Preview可否、承認範囲を再検証したか。
- Child84は運用上終了しているが、技術的な未検証事項と禁止事項を区別したか。
- Child85のPR #135はmerge済みだが作品未取り込みであることを確認したか。旧子85を復活させず、新S3へ仕事を引き継いだか。新チャットがUI上で実際に作成・起動済みかも区別する。
- データ削除、権利判定、Human翻訳、R18、料金、バックアップ・Cronなどの停止条件を勝手に解除していないか。
- 今回のCONTROL-R2例外では旧チャット全件を引退させ新S1〜S4を起動する。以後は新チャットが上限に達した場合に限り後継を作り、PR/Issue証拠から再開するか。

This document is a **copyable recovery prompt**, not a second status/roadmap source. Current control: [PROJECT_MASTER.md](../PROJECT_MASTER.md); historical findings: [governance audit](governance-audit-2026-10-21.md).
