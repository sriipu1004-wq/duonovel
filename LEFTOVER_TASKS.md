# 余り枠用の作業一覧
条件（すべて満たすものだけ）：途中で切れても壊れない／オーナーの承認が要らない／確実にこのプロジェクトのためになる／公開・投稿・外部サービスへの書き込み・支払いを含まない。このリポジトリの AGENTS.md・承認範囲・HOLD が優先する。

LIB read 固有の制約（全項目共通）:
- 本番（Vercel・Supabase `nyxbnccuvmlzffgtdadi`・本番ドメイン）には、読み取りを含めて触れない。
- merge、PR 作成、Issue・PR へのコメントはしない。
- 権利・R18・公開範囲・Auth・課金の挙動を変えるコードは書かない。
- ローカルの使い捨て Supabase（`scripts/dev/local-supabase.sh`）を使う場合、結果は `LOCAL` と表記する。終わったら `stop` し、何も残っていないことを `docker ps -a` で確かめる。

## LT-001｜未着手
- 種類: テスト追加
- 内容: `supabase/migrations` のファイル名を検査するスクリプトを作る。検査するのは次の3点。2026-11-07 に同じ version が2組見つかり、#171 で直した問題の再発を防ぐ。
  - version が重複していないこと
  - `^[0-9]+_[a-z0-9_]+\.sql$` の形に合っていること
  - 新しく足すファイルの version が14桁であること（14桁でない既存の4件は例外として明記する）
- 触ってよい範囲: `scripts/check-migration-versions.mjs`（新規）、`package.json` の scripts への1行追加
- 完了条件: 今の main で PASS し、重複を作ると FAIL することを、一時ファイルで確かめた結果をコミットメッセージに書く
- 1コミットの単位: スクリプト本体 → package.json → 確認結果
- 追加: 2026-11-08

## LT-002｜未着手
- 種類: 調査
- 内容: Supabase の診断で WARN が出ている SECURITY DEFINER 関数11件を棚卸しする（`abort_private_library_import`、`append_private_library_import_units`、`begin_private_library_import`、`complete_private_library_import`、`count_private_library_import_usage`、`get_credit_balance`、`has_public_episode_translation_unlock`、`import_private_library_txt`、`is_ai_narration_official_writer`、`list_private_library_sections`、`update_private_library_reading_progress`）。リポジトリの migration と `scripts/issue137-private-ai/policy-candidate.sql` だけを読む。関数ごとに次を表にまとめる。
  - `auth.uid()` での所有者確認の有無
  - search_path の設定
  - 呼び出し元のコード
  - authenticated が実行できる必要があるか
  - 最小権限にする案
- 触ってよい範囲: `docs/security-definer-inventory.md`（新規）
- 完了条件: 11件すべてに行があり、各判断の根拠（ファイルと行）が付いている
- 1コミットの単位: 関数3件ずつ
- 追加: 2026-11-08

## LT-003｜未着手
- 種類: 調査
- 内容: RLS が有効でポリシーが無いテーブル（2026-11-07 時点で28件。診断の INFO）が、意図して閉じているのか（service-role だけで使う）、ポリシーの付け忘れなのかを、リポジトリのコードと migration から仕分ける。
- 触ってよい範囲: `docs/rls-no-policy-inventory.md`（新規）
- 完了条件: 各テーブルについて、読み書きしているコードの場所と、使っているクライアント（admin / user）、判定（意図どおり / 要確認）が書かれている
- 1コミットの単位: テーブル5件ずつ
- 追加: 2026-11-08

## LT-004｜未着手
- 種類: 下書き
- 内容: AI 朗読を再開するときの設計案を書く。
  - 保存: 本番に作った非公開バケット `ai-narration-private` に、公式アカウントの JWT で書き込む。
  - 再生: 権限を確かめてから音声を返すプロキシを用意する。
  - 前提の状態: 生成は #173 で止めてあり、旧音声は削除する予定。
  - 参照するもの: `scripts/issue137-private-ai/`、Draft #160 のブランチ、`src/lib/recording/` の現状のコード。
- 触ってよい範囲: `docs/ai-narration-private-redesign.md`（新規）
- 完了条件: 書き込み経路、再生経路、権限の確認、R18 と非公開作品の扱い、移行手順、テスト計画がそろっている
- 1コミットの単位: 節ごと
- 追加: 2026-11-08

## LT-005｜未着手
- 種類: 下書き
- 内容: `docs/account-deletion-design.md` の §6 にある検証計画を、ローカル用の fixture SQL とテスト手順の下書きにする。合成ユーザーに作品・人間翻訳・課金記録・Storage オブジェクトを持たせ、削除の前後で残る行と消える行を照合する。本番には流さない。
- 触ってよい範囲: `scripts/account-deletion/`（新規。README・fixture SQL・テストの雛形）
- 完了条件: ローカルの使い捨て Supabase で fixture が入ることを確かめた（`LOCAL`）。削除処理そのものは実装しない。
- 1コミットの単位: README → fixture → テストの雛形
- 追加: 2026-11-08

## LT-006｜未着手
- 種類: 整理
- 内容: eslint の未使用変数・未使用関数の警告を、挙動を変えない範囲で消す。対象は `src/lib/recording/nemoGeneration.ts` と `aivisGeneration.ts` で、2026-11-07 時点で9件ある。生成の停止フラグ（`AI_NARRATION_GENERATION_SUSPENDED`）とその検査には触れない。
- 触ってよい範囲: 上の2ファイル
- 完了条件: 両ファイルの eslint 警告が0件になり、`npx tsc --noEmit` と `npm run test:legacy-auto-narration-suspension` が PASS する
- 1コミットの単位: 1ファイルずつ
- 追加: 2026-11-08
