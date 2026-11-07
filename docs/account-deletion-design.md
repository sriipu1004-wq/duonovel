# アカウント削除・データ消去 — 設計案（Issue #138 2-4, 2026-11-07, 未実装）

状態: **設計案のみ**。`/api/account/delete` は現在も 409（審査が必要）を返し、Auth・DB・Storage・課金には一切触れない。この文書は実装を許可しない。実装には、範囲を明示したオーナー承認と独立レビューが別途必要。

## 1. 目的と範囲
- 本人の申請により、アカウントと個人データを消去する。または公開を止め、匿名化する。
- 消去には監査可能な記録を残し、途中で失敗しても再実行できる手順にする。
- 他人の権利と、法令上の保存義務は守る。

## 2. 現状の DB 依存（本番を読み取りで確認、2026-11-07）
`auth.users` / `public.users` を参照する外部キーの削除時の動作:

| 動作 | テーブル |
|---|---|
| cascade（Auth を消すと一緒に消える） | users, author_follows, author_profile_likes, bgm_library_favorites, episode_human_translations, libread_billing_customers, libread_billing_subscriptions, libread_daily_ai_action_logs, libread_subscriber_monthly_ai_reservations, libread_user_entitlements, play_logs, private_library_*（works / glossary_terms / reading_progress / word_explanations）, public_episode_translation_unlocks, user_episode_comments, user_episode_comment_likes, user_recording_consents, user_series_bookmarks, user_series_reactions, user_series_reviews, user_series_review_likes, ai_narration_official_writers |
| set null（行は残り、利用者との紐づけだけ外れる） | bilingual_word_explanations, recording_play_events, recordings.reader_user_id, series_translation_glossary_entries, series_translation_profiles, series_view_events, time_fit_story_generation_logs |
| no action（**Auth の削除が失敗する**） | series.author_id, recordings.reader_id |

外部キーで追えないもの（列名などで紐づくもの）: credit_ledger（append-only）、credit_purchase_lots、Storage のオブジェクト（owner_id、パス）。

## 3. 問題点
1. 作品（series）を持つ作者は、このままでは Auth を削除できない（no action）。作品の扱いを先に決める必要がある。
2. `episode_human_translations` は cascade で消える。他の作品に付いた人間翻訳が、断りなく消える。
3. 課金記録（libread_billing_*）は cascade で消える。会計上の保存義務と衝突しうる（Stripe 側の記録が正本か要確認。**未確認**）。
4. Storage（人間の録音、挿絵、個人本棚の取り込みファイル）は DB を消しても残る。
5. credit_ledger は append-only なので消せない。匿名化の方針が要る。

## 4. 提案する手順（申請制。自動化は段階的に）
1. **申請**: マイページから申請する。本人確認には再ログインかメールリンクを使う。申請は `account_deletion_requests`（service-role だけが書ける）に記録する。
2. **猶予期間（例: 14日）**: 取り消せる。この間は公開作品を非公開にし、プロフィールも非表示にする。
3. **課金の停止**: Stripe のサブスクを解約する。未清算のクレジットは消滅とし、利用規約に明記する。
4. **公開物の処理**（作品ごとに決める）:
   - 作品と各話: 既定は削除。共作や他人の翻訳・朗読が付いている場合は、匿名作者へ移すか公開停止にするかを選んでもらう。
   - 他人の作品に付けた人間翻訳と朗読: 既定は削除。作品の作者には通知する。
5. **Storage の消去**: 本人が所有するオブジェクトを、サービスキーで削除する。対象一覧は事前に保存しておく。
6. **DB の消去**: 依存の順に削除する。series → recordings → 残り → `auth.admin.deleteUser`。保存義務のある課金記録は、cascade の前に匿名化した控えへ移す。
7. **監査記録**: 申請 ID、実行日時、件数、失敗と再実行の結果を残す。個人情報は含めない。
8. **完了通知**: メールで知らせる。

## 5. 決めてもらう必要があること（オーナー）
- 作品の既定の扱い（削除するか、匿名で残すか）と、猶予期間の日数
- 課金記録の保存方針（Stripe 側だけでよいか、DB にも匿名の控えを残すか）
- 他人の作品に付いた翻訳・朗読の扱い

## 6. 検証計画
ローカルの使い捨て Supabase で、作品・翻訳・課金・Storage を持つ合成ユーザーを作って確かめる。
- 削除の前後で、残るべき行と消えるべき行を照合する。
- 再実行しても同じ結果になることを確かめる。
- 途中で失敗した場合の再開を確かめる。
- その後、独立レビューを受ける。本番では、テスト用アカウント1件で E2E を行う（別途承認が必要）。
