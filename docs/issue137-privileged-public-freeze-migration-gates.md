# Issue #137 — PUBLIC特権書き込み停止と旧音声移行のゲート

**2026-11-06 AEST / 非本番・権利未確認・Draft #160 MERGE HOLD。** この資料自体は公開・移行・課金・Production変更の承認ではない。現行main/Productionは `848f8419`。対象: Supabase `nyxbnccuvmlzffgtdadi`。

## 問題の分離

1. `service_role` と恒久S3キーはStorage RLSを迂回する。アプリ側の書き込み禁止やMIME制限だけでは、第三者の特権書き込み経路を封鎖できない。[S3 Auth](https://supabase.com/docs/guides/storage/s3/authentication) / [Storage Access](https://supabase.com/docs/guides/storage/security/access-control)。
2. PUBLICバケットはURLを知る者が読める。DBの非公開訂正は過去のPUBLIC URL・ブラウザ/CDNキャッシュ・既にダウンロードされたバイトを回収しない。[Serving](https://supabase.com/docs/guides/storage/serving/downloads)。
3. Storageの管理テーブル・トリガーへの独自DDLは[公式に非推奨](https://supabase.com/docs/guides/storage/schema/design)。ローカルで通ってもHosted互換性・アップグレード安全性・物理バイト削除を証明できない。

## 本番 READ-ONLY メタデータ（2026-11-06 AEST）

| バケット | PUBLIC | 件数 | metadata size |
| --- | --- | ---: | ---: |
| recording-audio | yes | 4,720 | 30,165,700,212 bytes |
| bgm-library | yes | 2 | 11,648,088 bytes |
| illustrations | yes | 6 | 12,290,705 bytes |
| human-recording-audio | no | 0 | 0 |
| r18-recording-audio | **未作成** | — | — |

既存のREAD-ONLY SQL `scripts/issue137-b2/r0-public-origin-cohorts-readonly.sql` による `recording-audio` 内訳：

| パス系列 | 全数 | 録音行から直接参照 | 直接未参照 | 現存シリーズなし | JSON名 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Aivis | 4,414 | 2,180 | 2,234 | 0 | 2,191 |
| Nemo | 300 | 97 | 203 | 45 | 113 |
| Human | 6 | 0 | 6 | 6 | 2 |
| **合計** | **4,720** | **2,277** | **2,443** | **51** | **2,306** |

51件（Nemo 45 / Human 6）のメタデータ容量は合計509,344,575 bytes。**直接未参照2,443件を不要・削除可能とは判定しない。** timing JSON、旧バージョン、権利未確認を含む。51件にも作者所有権・Narrator同意・原著権利の証拠はない。個人識別子・実ファイルバイトの取得なし。

## 競合する対策

| 経路 | 技術的期待値 | 限界 |
| --- | --- | --- |
| 現行MIME/拡張子ベースSQLトリガー | 名称に一致する音声は拒否 | `.bin` + `application/octet-stream` の別PUBLIC桶が回避可能。正当なBGM更新は阻止 |
| **非本番・全PUBLIC完全凍結の試験候補** | API/S3/TUS等がStorageメタデータを書けば、名前・MIME無関係に拒否 | BGM・イラストも更新不能。Supabase管理スキーマDDLは本番**非推奨／NO-GO**、provider/PG superuser迂回と物理バイト順序未確認 |
| 新規AI朗読PRIVATE-first | アプリ管理の新規PUBLIC音声書き込みをなくす | 既存PUBLIC URL、他の特権S3/service_role、未作成のPRIVATEバケットを解決しない |
| 使われない特権S3鍵の無効化・権限分離 | 不要な特権書き込み経路を減らす | `service_role` 自体は依然全バケット権限。キー・依存関係・停止対象を先に確認 |
| 公開生成一時停止 | アプリ側の新規音声を抑制 | 外部S3・既存音声・既発行署名URLを止めない。正式な本番承認要 |

## 非本番実装の境界

`r0-full-public-write-freeze-local.sql`: `libread_r0_disposable.sentinel` がある隔離PostgreSQLに限り、`storage.objects` のINSERT/UPDATE/DELETEと`storage.buckets`のPUBLIC作成・変更を拒否する**使い捨ての実験**。既存のPUBLIC GETとPRIVATE新規書き込みを許す。実験は `r0-run-local-storage.sh` の最後に追加し、Docker隔離スタックを完全廃棄する。実機テストはservice_role REST、事前発行signed upload、TUS、**認証成功をPRIVATE実バイトで確かめる恒久S3 SigV4**、名称・MIME偽装、旧PUBLIC URL継続読取、BGM/イラスト更新阻止を別々に検証する。**本番適用・マイグレーション生成・権限拡張なし。**

## 実際の移行開始に必要な条件

1. 認証経路の棚卸し：全S3アクセスキー、サービスキー配置、Storage REST/TUS/signed URL発行箇所、残存セッション期限。静的S3キーの存在/無効化状況は現時点で未確認。秘密値をIssue/ログに記録しない。
2. 対象オブジェクト単位の承認：元作品・話、AI/Human、原著・版の権利、作者/朗読者の所有権と現在/過去の同意、利用停止・R18、タイミングJSON/パーツの依存を検証。**LIB read OfficialはPublic Domainの証明ではない。**
3. PRIVATE実バケットの個別作成承認、所有者・R18閲覧・Reader/Work・署名URL・直接アクセスの負例、権限変更後のリクエスト別認証。既存のPUBLIC URLは回収できないことを告知。
4. 事前マニフェスト、原本・転送先SHA256/容量確認、DB/Storage両方の復旧、コピー失敗/中断/二重実行時の戻し方、少数コホートと件数・費用・所要容量の上限を決定。権利未確認の51件は移動・削除しない。
5. Hosted migration history（記録21 vs source 76件）、catalog revision RPC不在、Production timer delay/5xx、PRIVATE proxy転送費用・p95を解決または独立にHOLD。無断`db push`・migration repair禁止。
6. 固定HEADに対する実際に別セッション/レビュアーのAuth/RLS/R18/権利/Storage監査GO、その後もmerge、本番DB、バケット作成、旧PUBLICバイト移動・削除・権利・設定は各々対象・件数・影響を特定した**別個の明示承認**を必要とする。

**判定:** `GLOBAL_PUBLIC_NO_WRITE=UNPROVEN`／`FULL_FREEZE_LOCAL_ONLY`／`HOSTED_DDL_NO_GO`／`LEGACY_RIGHTS_UNKNOWN_HOLD`／`PR160_MERGE_HOLD`。本番の正当なBGM/イラスト書き込みと安全な音声封じ込めを両立させるプロバイダー対応の方式はまだ確定していない。
