# Issue #139: §104A の8作品の AI 朗読を非公開バケットへ移す

PR #210 で8作品を非公開にしたが、AI 朗読 330 件（wav 330 + timing.json 330 = 660 個、3,938,402,969 バイト）が
公開バケット `recording-audio` に残り、URL を知っていれば取得できる。これを非公開バケット
`ai-narration-private` の同じパスへ移し、`recordings.audio_storage_path` を
`ai-narration-private:<path>` に書き換える。再生は既存の `/api/recordings/ai-audio/<id>`
（作品の公開・章の公開・作者本人・R18・行の is_public を毎回確かめる proxy）が受け持つ。

オーナーの承認：ボタン回答 2026-11-15「非公開の場所へ移す (推奨)」。

## 前提（2026-11-15 本番を読み取りで確認）
- 対象行は 330。全行が公開 URL で、パスは `(aivis|nemo)/<その行の series>/<その行の episode>/<file>.wav`。
- 元のファイルは 660 個すべて存在。この8作品のフォルダに参照されないファイルは無い。
- `ai-narration-private`：非公開、上限 100MB（最大のファイルは 51.7MB）、許可する型は
  `audio/wav` / `audio/x-wav` / `application/json` だけ。timing.json の一部は
  `application/json; charset=utf-8` で保存されているので、コピー時に `application/json` に揃える。
- 他の表（series / episodes / 他の recordings）からこのパスへの参照は無い。
- 生成は停止中（`AI_NARRATION_GENERATION_SUSPENDED`）なので、移している間に新しい行は増えない。

## 手順（承認の後に親が行う）
鍵は環境変数だけで渡す。出力に鍵は出ない（出たら `[redacted]` に置き換える）。

```
# 例：NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY を環境に入れてから
S=scripts/issue139-us104a-audio-private
node --import tsx $S/cli.ts plan                  # 読み取りだけ。.issue139-audio-state/manifest.json を作る
node --import tsx $S/cli.ts copy                  # dry-run（何も書かない）
node --import tsx $S/cli.ts copy --execute        # 660 個をコピー。止まっても再実行で続きから
node --import tsx $S/cli.ts verify                # 660 個・サイズ・中身（ETag 再計算 or SHA-256）＋ proxy と同じ取得
```
1. `dryrun.sql` を流す（読み取りだけ）。期待値 `330,330,0,330,330,330,330,330,660,3938402969,f,8`。
2. `db-apply.sql` を流す（1トランザクション。660 個のコピーとサイズを SQL でも確かめ、330 行だけ書き換える）。
   その後の `dryrun.sql` は `330,0,330,330,...,t,8`。
3. 再生の確認：公式アカウント（作者本人）でログインし、8作品のどれかの章を開き「AI朗読音声」が鳴ることを確かめる。
   未ログインでは `/api/recordings/ai-audio/<id>` が 404（作品が非公開のため。これが正しい）。
4. `node --import tsx $S/cli.ts delete-public --confirm-playback-checked`（dry-run）→ 同じく `--execute`。
   DB が 330 行とも非公開を指し、verify が通り、確認の印があるときだけ、公開バケットの元の 660 個を消す。
   元は `Cache-Control: max-age=3600` なので、CDN が最大1時間ほど返し続けることがある。

## 元に戻す
- **作品を公開に戻すだけ（PR #210 の rollback.sql）**：そのまま動く。朗読は非公開バケットのまま、
  proxy が未ログインにも配信する。Reader に「AI朗読音声」の欄が出る（移す前は公開 AI 行を Reader に載せていなかったので、ここは見え方が変わる）。
- **朗読の置き場も元に戻す**：
  - delete-public の前なら `db-rollback.sql` だけ。
  - delete-public の後なら `cli.ts restore-public --execute` → `cli.ts verify-restore` → `db-rollback.sql`。
  - `db-rollback.sql` は公開バケットに元の 660 個がそろっていないと何も変えずに止まる。

## テスト
- `npm run test:issue139-audio-private`：参照の形がアプリの proxy と一致すること、再生の可否
  （非公開・作者本人・#210 を戻した後）、各段の冪等・再開・中身の照合・削除の拒否（Storage は模擬）。
- `node $S/scope-check.mjs`：SQL が8作品だけ、`recordings.audio_storage_path` だけを書くこと。
- CI（`.github/workflows/issue139-us104a-audio-private.yml`）：使い捨ての PostgreSQL で
  #210 適用後の状態を作り、apply / 二重 apply の拒否 / コピー不足・サイズ違い・パスのずれでの拒否 /
  #210 rollback.sql との両立 / 削除後の rollback 拒否と復元後の完全な rollback / lock_timeout を確かめる。

## 孤島の鬼（set "kotou"、2026-11-15 追加）
孤島の鬼（江戸川乱歩）は D030 の許可リストの国でだけ公開しているが、AI 朗読 120 件（240 個）が公開バケットに残っていた。同じ手順で移す。
- すべてのコマンドに `ISSUE139_AUDIO_SET=kotou` を付ける。状態は `.issue139-audio-state-kotou/` に置く（消さない）。
- SQL は `kotou/dryrun.sql`、`kotou/db-apply.sql`、`kotou/db-rollback.sql`。snapshot は `libread_internal.issue139_audio_private_kotou_20261115`。
- 期待値：120 行・240 個。`scope-check.mjs` は両方の組を確かめる。
- 移した後は、許可リストに無い国（US など）からは `/api/recordings/ai-audio/<id>` が 451 を返す。公開バケットの URL を直接たどる抜け道がなくなる。
