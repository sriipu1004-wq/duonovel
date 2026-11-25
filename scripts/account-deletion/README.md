# アカウント削除の検証用 fixture とテスト手順（下書き）

`docs/account-deletion-design.md` の §6（検証計画）を、ローカルで使う fixture とテスト手順にした下書き。LEFTOVER_TASKS の LT-004。

- **削除処理そのものは実装していない。** 設計は未承認（設計文書の冒頭と §5）。ここにあるのは、削除の前後を照合する道具と手順だけ。
- **ローカルの使い捨て Supabase 専用。** 本番・Preview・hosted の DB には決して流さない。`fixture.sql` は、専用のスキーマ `acctdel_fx` が既にある DB や、`public.series` がある DB では止まる（本番らしい DB での誤実行を防ぐ）。
- 合成ユーザーだけを使う。実在の人の情報は入れない。

## ファイル
| ファイル | 中身 |
|---|---|
| `fixture.sql` | 合成ユーザー3人（削除する本人・他人の作者・関係のない人）と、本人が持つ作品・各話・朗読・人間翻訳・課金記録・クレジット・Storage のオブジェクト（メタデータの行）を作る。テーブルは設計文書 §2 の外部キーの動作（cascade / set null / no action / 外部キーなし）を写した最小の形で、本番の列のすべてではない |
| `snapshot.sql` | 本人に紐づく行と、残るべき他人の行を、テーブルごとに数えて `acctdel_fx.snapshots` に保存する |
| `check-fk-behavior.sql` | 今の外部キーのままで `auth.users` の本人を消すと何が起こるかを、トランザクションの中で試して必ず ROLLBACK する（設計文書 §3 の問題1の確認） |
| `expected.md` | 削除の後に残るべき行・消えるべき行の表。オーナーの決定（設計文書 §5）を待つ部分は「判断待ち」と書いてある |

## 手順（ローカル）
1. ローカルの使い捨て Supabase を起動する: `scripts/dev/local-supabase.sh start`
2. DB の接続先を確かめる: `scripts/dev/local-supabase.sh status` の `DB_URL`（`127.0.0.1` であること。ほかのホストなら止める）
3. fixture を入れる: `psql "$DB_URL" -v ON_ERROR_STOP=1 -f scripts/account-deletion/fixture.sql`
4. 削除の前を記録する: `psql "$DB_URL" -v ON_ERROR_STOP=1 -v label=before -f scripts/account-deletion/snapshot.sql`
5. 今の外部キーの動作を見る: `psql "$DB_URL" -v ON_ERROR_STOP=1 -f scripts/account-deletion/check-fk-behavior.sql`（ROLLBACK するので何も変わらない）
6. （将来）承認された削除処理を、ローカルでだけ動かす。**今はここに入れる処理が無い。**
7. 削除の後を記録する: `snapshot.sql` を `-v label=after` で流す。
8. 照合する: `expected.md` の表と、`acctdel_fx.snapshots` の before / after の差を比べる（比べる SQL は `snapshot.sql` の末尾）。
9. 再実行: 6〜8 をもう一度行い、2回目で after が変わらないこと（冪等）を確かめる。
10. 途中の失敗: 6 の処理を途中で止めて（例: Storage の消去の後で止める）、もう一度流して最後まで終わることを確かめる。
11. 後片付け: `scripts/dev/local-supabase.sh stop` の後、`docker ps -a` で何も残っていないことを確かめる。

結果は `LOCAL` と書いて記録する。本番での E2E は設計文書 §6 のとおり別の承認が要る。
