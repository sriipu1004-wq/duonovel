# 削除の前後で照合する表（下書き）

`snapshot.sql` の `check_name` ごとに、削除の前（before）と後（after）の期待する行数。fixture の合成ユーザーは A（消す本人）、B（ほかの作者）、C（関係のない人）。

「判断待ち」は `docs/account-deletion-design.md` §5 でオーナーが決めること。決まるまで期待値は書かない。「今の FK」は、何も足さずに外部キーだけに任せた場合の結果で、`check-fk-behavior.sql` で確かめる。

| check_name | before | after（期待） | 根拠 |
|---|---|---|---|
| `a.auth_users` | 1 | 0 | 削除の目的 |
| `a.users` | 1 | 0 | cascade（設計 §2） |
| `a.series` | 2 | 0（削除しても匿名の作者へ移しても 0。作品の行が残るかは判断待ちで、`b.*_on_a_series` と合わせて見る） | 設計 §3-1・§5 |
| `a.episodes_of_a_series` | 2 | 判断待ち（作品と同じ扱い） | 設計 §4-4 |
| `a.recordings_read_by_a` | 2 | 0（他人の作品に付けた朗読も既定は削除） | 設計 §4-4 |
| `a.human_translations_by_a` | 1 | 0（既定は削除。B への通知が要る） | 設計 §3-2・§4-4 |
| `a.billing_customers` | 1 | 判断待ち（今の FK では cascade で 0） | 設計 §3-3・§5 |
| `a.billing_subscriptions` | 1 | 判断待ち（Stripe の解約が先。今の FK では 0） | 設計 §4-3・§5 |
| `a.translation_unlocks` | 1 | 0 | cascade |
| `a.credit_ledger` | 2 | 判断待ち（append-only。匿名化の方針が要る。今の FK では 2 のまま） | 設計 §3-5 |
| `a.credit_purchase_lots` | 1 | 判断待ち（今の FK では 1 のまま） | 設計 §2 |
| `a.word_explanations_owned` | 1 | 0 | set null |
| `a.view_events` | 1 | 0 | set null |
| `a.bookmarks` | 1 | 0 | cascade |
| `a.private_library_works` | 1 | 0 | cascade |
| `a.storage_objects` | 3 | 0（事前に一覧を保存してから消す） | 設計 §3-4・§4-5 |
| `anon.word_explanations_unowned` | 0 | 1 | set null で行は残る |
| `anon.view_events_unlinked` | 0 | 1 | set null で行は残る |
| `b.auth_users` | 1 | 1 | 他人は残る |
| `b.series` | 1 | 1 | 他人の作品は残る |
| `b.recordings_on_a_series` | 1 | 判断待ち（A の作品を消すなら 0、匿名で残すなら 1） | 設計 §4-4 |
| `b.human_translations_on_a_series` | 1 | 判断待ち（同上） | 設計 §4-4 |
| `b.storage_objects` | 1 | 判断待ち（A の作品に付いた B の朗読のファイル。作品の扱いに従う） | 設計 §4-4 |
| `c.auth_users` | 1 | 1 | 関係のない人は残る |
| `c.billing_customers` | 1 | 1 | 同上 |
| `c.credit_ledger` | 1 | 1 | 同上 |
| `c.unlocks_on_a_series` | 1 | 判断待ち（A の作品を消すと cascade で 0。C が払ったクレジットの扱いも要る） | 設計 §4-4（未記載。§5 に足す候補） |
| `c.bookmarks_on_a_series` | 1 | 判断待ち（作品と同じ扱い） | 設計 §4-4 |

## 合わせて確かめること（設計 §6）
- 再実行: 同じ削除をもう一度流しても after が変わらない（冪等）。
- 途中の失敗: Storage を消した後・DB を消す前に止めて、もう一度流すと最後まで終わる。
- 監査記録: 申請 ID・件数・結果だけが残り、本文やメールアドレスは残らない（設計 §4-7）。

## 設計に足す候補（この下書きで気づいた点。設計文書は変えていない）
- A の作品を消すと、C がその作品で払った翻訳の解放（`public_episode_translation_unlocks`）が cascade で消える。C への扱い（返金・通知）が設計 §4・§5 に書かれていない。
