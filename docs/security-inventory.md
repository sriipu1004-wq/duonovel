# セキュリティの棚卸し（LT-003）

リポジトリだけを読んだ記録。本番の DB・Supabase の設定は見ていない。問題の疑いは直さず「要確認」と書く。

- 初回: 2026-11-25、origin/main `937daccc225ad952f5ff5587543f0394258364e6` を対象に全体を見た。
- 次回から: この記録以降に増えた・変わった `supabase/migrations/` と `src/app/api/**/route.ts` だけを見る（`git diff --stat 937daccc225ad952f5ff5587543f0394258364e6..origin/main -- supabase/migrations src/app/api`）。
- 読み方の限界:
  - migration に無い変更（ダッシュボードで直接入れた RLS・ポリシー・権限、元からあるテーブル `series`・`episodes`・`users`・`recordings` などの作成）は見えない。本番の状態はこの表と違いうる。
  - 抽出は正規表現の機械集計と目視の組み合わせ。`execute format(...)` で作るポリシー（例: `20261115120000_issue142_google_consent_rls.sql:140` の restrictive ポリシー）は数に入れていない。関数の `grant`/`revoke` は引数の型を見ずに関数名で集計した。
  - 既存の監査 `docs/security/child65-followup.md:125-126` は、本番の Security Advisor で「RLS 有効・ポリシー無し」27件を意図した内部用、SECURITY DEFINER の残り10件を確認済みとしている。この表はリポジトリ側から同じものを見直したもの。

## 1. RLS が有効でポリシーが無いテーブル（と、migration に RLS 有効化の文が無いテーブル）

「アプリでの参照」は `src/` で `.from("<テーブル名>")` などテーブル名を書いているファイル。`[admin]` は同じファイルで `createAdminClient`（service role）を使っているもの、`[client]` はブラウザで動くファイル。

| テーブル | RLS 有効化の根拠 | ポリシー（migration 上） | アプリでの参照 | 意図の推定 | 判定 |
|---|---|---|---|---|---|
| `libread_internal.h1_human_scope_revision` | `20261114120000_issue137_h1_human_atomic.sql:28` | 0 | なし（関数からだけ） | 内部スキーマの管理用。ブラウザからの読み書きは要らない | 意図して閉じている（推定） |
| `libread_internal.h2_human_stage_lease` | `20261114130000_issue137_h2_human_staging_lease.sql:50` | 0 | なし（関数からだけ） | 同上（人の朗読のアップロード中の lease） | 意図して閉じている（推定） |
| `libread_internal.human_media_cleanup_pending` | `20261114140000_issue137_human_media_cleanup_pending.sql:34` | 0 | なし（関数からだけ） | 同上（消し残しの Storage の記録） | 意図して閉じている（推定） |
| `public.bilingual_word_explanations` | `20260828120000_create_bilingual_word_explanations.sql:50` | 0 | `src/app/api/word-explanations/route.ts:343` [admin] | サーバーだけが読み書きするキャッシュ | 意図して閉じている（推定）。`child65-followup.md:128` も閲覧権限なしと確認 |
| `public.credit_purchase_reversals` | `20260914070000_add_public_translation_credit_runtime.sql:43` | 0 | なし（`reverse_credit_purchase_full` などの関数から） | 課金の取り消し記録。サーバーと関数だけ | 意図して閉じている（推定） |
