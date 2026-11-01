# #137 / #153 — 非本番 Human Studio: TUSと隔離ワーカーの比較（2026-11-01）

**状態:** 開発環境限定の技術判断。正式なProduction採用決定、許可された本番Storage移行、権利／R18ルール変更ではない。PR #153はDraft / MERGE HOLD。

## 正確な比較

| 観点 | Supabase公式TUS / JWT直接Storage | 非本番の8MiB論理パート + 隔離ワーカー |
|---|---|---|
| 転送単位 | 公式サンプルは**6MiB固定のTUS転送チャンク** | 既存LIB read互換の**8MiB論理パート**（各PUTは最大8MiB） |
| ネットワーク再開 | TUS upload URL / PATCH offset、クライアントの再試行。URL期限は最大24時間 | 30分のDBセッション、同じindex+SHAでチケット再取得。既にSEALEDのパートは再PUTしない |
| 1GiB | 直接1GiBオブジェクトはプロジェクトのグローバル/バケット上限やプランに依存し、実転送未確認 | **128個の8MiB PRIVATEオブジェクト**を管理できる。1GiBは台帳のみ実測、全量再生/合成未実装 |
| 権限 | RLSとユーザーJWTは有効。ただしsigned-upload URLはBearer能力、旧URLの撤回保証は別問題 | Nextに管理者キーは置かず、隔離ワーカーがGoTrueセッション・同意・作品公開/R18をチェック。DB claim/finalize時にも再検査 |
| 内容の整合性 | Storage RLSは**アップロード実バイトのSHA比較を保証しない**（既存の使い捨てTUS実測で別内容の同サイズ書き込みを観測） | 各パートの期待SHAを計算し、workerが実バイトを検証して、Storageの読み戻しとDB CASでseal。期待SHA自体は送信者の入力で独立署名ではない |
| プロバイダー管理者キー | service_role/S3保持者はRLSを迂回できる | 同じSupabaseプロジェクトの他のservice_role/S3保持者は依然として迂回可能。WORMではない |
| 実装/保守費用 | TUS成熟機能、再送・一時停止のクライアント処理が簡潔。既存署名方式からの切替に審査が必要 | 独自HTTP/DB台帳/cleanupの維持が必要。高い保守コストと攻撃面。現状は非本番fixtureのみ |
| 配備 | 既存の権限・署名トークンを即移行すると未取消の旧能力が残る。Production RLS/Secretsは未承認 | dev-only localhost gate、通常のHuman投稿ボタン/公開処理は不変。Preview/Productionは404 |

公式資料：
- https://supabase.com/docs/guides/storage/uploads/resumable-uploads （6MiB、24時間、重複URL 409、upsertの危険、JWT/TUS）
- https://supabase.com/docs/guides/storage/security/access-control （Storage INSERT権限はRLS）
- https://supabase.com/docs/guides/storage/buckets/fundamentals （PRIVATEとPUBLICの区別）
- https://supabase.com/kb/troubleshooting/upload-file-size-restrictions-Y4wQLT （グローバル／バケット／プラン上限、2026-10-13更新）

## 今工程で採用する非本番方式

既存のStudioへ「**開発用PRIVATE転送を試す**」手動操作を追加し、**独自8MiB隔離ワーカー**の開発専用Next APIのみ呼ぶ。ソース全体をメモリ展開せず、`File.slice()` の最大8MiBパートだけ `crypto.subtle.digest` し、`Blob`をPUTする。受理後のACKが欠けたときは`status`でSHA済みのPRIVATE領収を読み、再PUTしない。同じファイル・話・セッション以外への再利用を拒否。UIは通常の保存/公開を呼ばず、`recordings`への登録・メディア公開はしない。

TUSは今工程では**既存の公式サンプルをベースにした別途の非本番比較対象**であり、UIに追加した転送はTUS互換と主張しない。これは最終リリース方式としての独自実装の採用決定でもない。TUS採用を認めるには、署名Bearerの失効、登録時の同意/所有権/R18、実バイトの独立検証、CAS確定、PRIVATE staging、cleanup/孤児、総容量/転送上限と料金、Storage他管理者キー隔離を同等に満たす設計と負例の固定HEAD実測が必要。

## リリース停止条件

1. **まだ公開可能なHuman録音ではない:** 従来投稿UIの最終アップロード/署名・finish・Human publisher・Reader/AIは未変更。Studioのボタンは手動の開発用PRIVATE stageのみ。
2. **1GiB実転送/最終再生未検証:** 1GiB=128個の8MiB台帳だけ確認。実際のpeak RSS、同時利用、VercelのRequest body /実時間制限、1GiB構成、TUS 6MiBリトライ、長期データ削除/孤児については未検証。
3. **特権クライアントの完全排除は未達成:** 既存Human/Nemo/Aivis、PRIVATE Readerに広域service_roleが残る。同一Supabaseプロジェクトの他管理者による上書きと同プロジェクト内の受領台帳改変が可能で、独立監査は本当の不変性を証明できない。
4. **本番移行・RLS・Auth・Storage・課金・merge・権利・公開状態の承認なし:** この文書はそれらを許可しない。安定した実装HEADの独立監査前にはMERGE HOLD。
