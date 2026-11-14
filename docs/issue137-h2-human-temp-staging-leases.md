# Issue #137 H2 — Human の分割アップロードの一時領域をリースで管理する

状態：Draft PR の候補。本番への適用には、別の承認と独立したレビューが要る。Draft #160（HEAD 21d7287）の H2 の候補をもとに、H1（main、本番に適用済み）の上に単独で動く形に直した。

## なぜ要るか
4 MiB 以上の Human の音源は、`human-upload-session` が部分ごとに署名付きのアップロード URL（bearer、約2時間有効）を発行し、ブラウザが `human-recording-audio/human-temp/<series>/<episode>/<actor>/<session>/part-NNNN.<ext>` に直接上げる。署名付き URL は、アプリ側で同意の取り消し・作品の非公開化・録音許可の停止を確かめても、取り消せない。以前は `upsert: true` で発行していたので、確定の後でも部分を上書きできた。

## 仕組み
- `libread_internal.h2_human_stage_lease`：セッションごとのリース（series・episode・actor・拡張子・合計サイズ・部分の数・状態・期限）。
  - 状態は active → sealed（確定）／aborted（中止）→ retiring → retired。
  - 書き込みできるのは、発行から 90 分まで。
  - retire_after は発行から 3 時間（署名付き URL の 2 時間より長い）。
- `storage.objects` の trigger `issue137_h2_stage_storage_guard`：`human-temp/` に書けるのは、次の条件をすべて満たすときだけ。
  - リースが active で、期限内である。
  - パスの series・episode・actor がリースと一致する。
  - 部分の番号が上限以内で、名前と拡張子が正確である。
  - その時点で作品・話・同意・R18 の条件を満たしている。
  - これが、発行済みの bearer を止める唯一の壁になる。パスの変更も止める。旧形式の `human/…/part-NNNN.*` への新しい書き込みも止める。
- 条件は H1 の commit RPC と同じにした。録音許可が `open` であること。公開かつ投稿済みの作品か、作者本人であること。同意の版が 2026-04-16 であること。R18 は作者か、R18 を確認した人だけ。
- RPC は service_role だけが呼べる：`issue137_h2_stage_open`、`issue137_h2_stage_close`（seal／abort）、`issue137_h2_stage_retire_candidates`、`issue137_h2_stage_claim_retirement`、`issue137_h2_stage_finish_retirement`。anon と authenticated は、RPC にもテーブルにも触れない。

## アプリの流れ
1. `human-upload-session`：ログインと同意を確かめる → #181 の `assertApprovedPrivateHumanRecordingBucket` → 同じ人の期限を過ぎたリースを片付ける（失敗しても続ける）→ **リースを開く** → `upsert: false` で署名付き URL を発行する。発行の途中で失敗したら、リースを abort する。
2. `human-upload-finalize`：バケットを確かめる → **seal** → 部分を読む → `publishHumanRecording`（H1）→ 部分を消す（finally）。seal の後なので、古い bearer では書き戻せない。
3. `human-upload-abort`（新規）：本人のリースを abort した後、正確な部分のパスを消す（失敗しても、後の片付けに回す）。
4. `RecordingStudioPage`：分割アップロードや確定が失敗したら、abort を呼ぶ（届かなくても、期限と trigger で閉じた側に倒れる）。

## 期限が切れた一時ファイルの片付け（方針）
- **いつ・誰が**
  - 確定と中止のときは、そのリクエストが、そのセッションの部分を正確なパスで消す。
  - 放置されたもの（abort が届かなかった、タブを閉じた、など）は、同じ人が次に分割アップロードを始めるときに消す。retire_after を過ぎたリースを最大 5 件、claim → Storage API で正確なパスを消す → finish（DB 側で、残りや参照が無いことを確かめる）の順で処理する。
- 二度と戻ってこない人の残りは、まだ消えない。全体を消す定期処理（Cron など）は、インフラと費用に関わるので、別に承認を得て入れる。そのときは `issue137_h2_stage_retire_candidates(null, n)` と同じ順番を使う。
- 消すのは、リースから組み立てた正確なパスだけ。ワイルドカードや prefix の一括削除はしない。`recordings` から参照されているものは claim で止まる。

## 確かめていないこと
- 本番の Supabase で、migration を当てる role が `storage.objects` に trigger を作れるか（作れなければ migration 全体が失敗し、何も当たらない）。
- 本番の Storage API・S3・TUS の書き込みが、この trigger を通ること。DB への書き込みが trigger で止まったとき、裏側に bytes だけが残るかどうか。
- service_role が `storage.objects` を SELECT できること（finish の確認に使う）。
- 実際のブラウザでの分割アップロード（E2E）。#160 の B2 のローカルスタックを前提にした E2E のスクリプトは、移していない。
