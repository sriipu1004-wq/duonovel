# #141 P6 — DB と Storage を独立に復元できることの検証手順書

状態：**手順書のみ。実施していない。** オーナーの判断（2026-11-15「手順書だけ作り、実施は後に」）による。
この文書があることは、復元できることの証明ではない。#141 の受け入れの条件「DB と Storage の独立した復元」は、下の「6. 完了の条件」を満たして記録するまで **未達** のままとする。

前提の文書：[`docs/child84-backup-and-storage-recovery.md`](child84-backup-and-storage-recovery.md)（2026-10-11 の棚卸しと方針）。本書はそれを、費用をかけずに実行できる順の手順に落としたもの。

## 0. 前提として確かめた事実（2026-11-15、読み取りのみ）

本番 Supabase `nyxbnccuvmlzffgtdadi`（Pro、ap-southeast-1、PostgreSQL 17.6）に、MCP の SELECT だけで確かめた。値は時点の値で、実施の直前に取り直す。

| 項目 | 値 |
| --- | --- |
| DB の大きさ（`pg_database_size`） | 82 MB |
| 表の数 | public 55、auth 27、全体 106 |
| Storage の object（`storage.objects`） | recording-audio 4,720件 / 30,165,700,212 B、illustrations 6件 / 12,290,705 B、bgm-library 2件 / 11,648,088 B。計 4,728件・約30.2GB |
| bucket | 公開：recording-audio、illustrations、bgm-library。非公開：human-recording-audio、ai-narration-private（どちらも object 0件） |
| `metadata->>'eTag'` | 4,728件すべてにある。うち **2,396件は multipart 形式**（`-` を含む。recording-audio 2,394・bgm-library 2） |
| DB から Storage への参照 | `public.recordings.audio_storage_path` 2,277件（すべて URL 形式で `/recording-audio/` を含む）、`public.bgm_library.audio_path` 2件。`episodes.bgm_*`・`series.bgm_audio_path` は 0件。illustrations を参照する列は、列名の検索では見つからなかった（未確認。本文などに埋め込まれている可能性） |
| `archive_mode` | `on`（#141 のコメント 6882158260）。これだけでは PITR が有効とは言えない（推論）。 |

## 1. 今のバックアップの状態を確かめる（A0〜A1、費用なし）

### 1-1. PITR の有無と、最新の復元点
次のどちらかで確かめ、結果を #141 に記録する。

- **Dashboard**：Database → Backups。「Scheduled backups」に日ごとの一覧が出るか、「Point in Time」に earliest / latest recovery point が出るかを見る。
- **Management API**：`GET https://api.supabase.com/v1/projects/nyxbnccuvmlzffgtdadi/database/backups`（参照：<https://supabase.com/docs/reference/api/v1-list-all-backups>）。
  - 個人のアクセストークン（Account → Access Tokens）が要る。トークンを作るのは **A2**（秘密の作成）。オーナーが手元で実行し、応答から「PITR の有無・各バックアップの日時と状態」だけを書き写す。トークンや応答の全文は Git・PR・Issue に貼らない。
  - 公式の API の説明には応答の項目名が載っていない（`pitr_enabled` などの名前は未確認）。実際の応答を見て判断する。
- 併せて、Dashboard の Add-ons で PITR の add-on が付いているか、Compute の大きさを見る。公式文書では、PITR には Small 以上の compute が要り、PITR を有効にすると日次のバックアップは取られなくなる。

### 1-2. Pro の毎日のバックアップで「戻せるもの」と「戻せないもの」
出典：<https://supabase.com/docs/guides/platform/backups>、<https://supabase.com/docs/guides/self-hosting/restore-from-platform>（2026-11-15 に search_docs で確かめた）。

| 戻せるもの | 戻せないもの・注意 |
| --- | --- |
| DB 全体（表・関数・RLS・権限・`auth.users` を含む）を、過去7日のうち日次の時点に戻す | **Storage の object の中身**。DB には metadata しか無い。「バックアップの後に消した object は、古いバックアップに戻しても戻らない」と明記されている |
| | custom role の password は日次バックアップに保存されない（戻した後に設定し直す） |
| | 戻す先は **その project 自身**。作業中は project に接続できない（停止時間がある）。本番で試してはいけない。独立した検証にもならない |
| | 日次の粒度なので、最大で1日分のデータを失う（PITR が無い場合） |
| | project を削除すると、バックアップも一緒に消える |
| | JWT の秘密・API key・Auth の provider 設定・Edge Functions・SMTP は DB の dump に含まれない（restore-from-platform の表） |
| | 新しい project に戻す（Duplicate Project）方法もあるが、別の project の費用がかかるので本手順では使わない |
| | 物理バックアップ（PG 15.8.1.079 以降は既定）を直接ダウンロードできるかは、Dashboard で未確認。公式文書には「PITR を無効にした後は物理バックアップは直接ダウンロードできない」とある |

結論：Supabase の日次バックアップは「本番を同じ project の過去に戻す」手段で、**独立した復元の実証にはならない**。独立した復元は、下の 2〜4 で手元に作る。

## 2. DB の独立した復元の検証

### 2-1. 道具（費用なし）
- Supabase CLI と Docker Desktop。`supabase db dump` は内部で、Supabase の Postgres の image の中の `pg_dump` を使う。
- `psql`（PostgreSQL 17 系）。
- 戻す先：手元の `supabase start`（ローカルの Supabase 一式。auth・storage の schema と Supabase の role がある）。素の Postgres の image では、`anon`・`authenticated` などの role が無く、schema の適用で失敗しやすい。

### 2-2. 接続の資格情報（ここが最初の承認点）
- 公式の手順は、Dashboard の Connect の接続文字列と DB の password を使う。password が分からない場合、公式の手順は「Database Settings で password を **reset** する」になっている。**reset は本番の設定変更で、使っているアプリや自動処理が切れる恐れがある（A2）**。
- 代わりの案：検証用に読み取り専用の login role を作る。これも本番への DDL で **A2**。auth schema の表を読めるかも確かめる必要がある。
- どちらにするかはオーナーが決める。接続文字列・password は手元の shell の環境変数にだけ置き、ファイル・Git・ログ・チャットに残さない。終わったら role を消すか password を変える。

### 2-3. dump（本番からの読み取り。個人データを外に出す点が A2）
公式の手順（<https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore>）どおり、3つに分ける。

```sh
supabase db dump --db-url "$PROD_DB_URL" -f roles.sql --role-only
supabase db dump --db-url "$PROD_DB_URL" -f schema.sql
supabase db dump --db-url "$PROD_DB_URL" -f data.sql --use-copy --data-only \
  -x "storage.buckets_vectors" -x "storage.vector_indexes"
```

- 置き場所は、暗号化した手元の記憶装置の、リポジトリの外の作業用フォルダ。dump を GitHub Actions の artifact・Vercel・公開の bucket・共有の URL に置かない。
- dump の直後に、各ファイルの `sha256` を計算して記録する（中身は記録しない）。
- 同じ時刻の本番の基準値（2-5 の SQL の結果）を、dump の直前と直後に取る。間で件数が変わった表は「動いている表」として印を付ける。
- dump の量は約82MB で、Supavisor 経由なら「Shared Pooler Egress」に数えられる。Pro の枠（250GB）に比べて小さい。

### 2-4. 手元に戻す
```sh
supabase start   # 手元の空の stack。本番には繋がない
psql --single-transaction --variable ON_ERROR_STOP=1 \
  --file roles.sql --file schema.sql \
  --command 'SET session_replication_role = replica' \
  --file data.sql \
  --dbname "$LOCAL_DB_URL"
```
- `$LOCAL_DB_URL` は `supabase status` で出る手元の URL。本番の URL と取り違えないよう、実行前に host が `127.0.0.1` か `localhost` であることを目で確かめる。
- 拡張機能（本番で5つ）が手元にあるかを先に確かめる（`select extname from pg_extension`）。
- 失敗したら、その SQL の位置と error を記録し、直して最初からやり直す（部分的な成功を合格としない）。
- かかった時間（dump、戻す、照合のそれぞれ）を測る。

### 2-5. 照合：表ごとの件数と主キーの hash
本番では MCP の SELECT（A1 の読み取り専用の問い合わせ）、手元では `psql` で、**同じ SQL** を流す。出力は件数と hash だけで、個人の行は出さない。

```sql
-- 主キーのある表について、件数と「主キーを並べた文字列の md5」を作る SQL を生成する
select format(
  'select %L as tbl, count(*) as n, md5(coalesce(string_agg((%s)::text, %L order by %s), %L)) as pk_hash from %I.%I',
  n.nspname || '.' || c.relname,
  string_agg(quote_ident(a.attname), ' || ''|'' || ' order by k.ord),
  ',', string_agg(quote_ident(a.attname), ', ' order by k.ord), '',
  n.nspname, c.relname)
from pg_constraint con
join pg_class c on c.oid = con.conrelid
join pg_namespace n on n.oid = c.relnamespace
cross join lateral unnest(con.conkey) with ordinality k(attnum, ord)
join pg_attribute a on a.attrelid = c.oid and a.attnum = k.attnum
where con.contype = 'p' and n.nspname in ('public', 'auth', 'storage')
group by n.nspname, c.relname
order by 1;
```
- 2026-11-15 の本番では、この SQL は 92 表分の問い合わせを生成した（public・auth・storage の主キーのある表）。`auth.audit_log_entries` のように常に増える表は、2-3 の「動いている表」として扱う。
- 生成された各行を `union all` でつないで流し、結果（表名・件数・hash）を本番と手元で比べる。
- 主キーの無い表は、件数だけ比べ、表名を一覧に残す。
- 加えて、schema の形も比べる：表・view・関数・RLS の policy・trigger の数（`pg_class`、`pg_proc`、`pg_policies`、`pg_trigger` を schema ごとに数える）。
- 2-3 で「動いている表」とした表の差は、dump の時刻の差として説明できるかを確かめ、説明できない差は不一致とする。

### 2-6. auth schema と個人データの扱い（オーナーが選ぶ）
`auth.users` と `public.users` などには個人データがある。dump を作った時点で、個人データが Supabase の外に出る（**A2**）。

| 案 | 内容 | 欠点 |
| --- | --- | --- |
| A（推奨） | 全部を dump し、暗号化した手元の記憶装置にだけ置き、照合の後に消す。消した日時を記録する | 個人データが一時的に手元に出る |
| B | `auth` を除いて dump する | `public` から `auth.users` への外部キーが手元で切れ、参照の照合ができない。「独立した復元」としては不完全 |
| C | 暗号化して保管し続け、off-site のバックアップにする | 保管と鍵の管理が続く。保存期間と削除の決まりが別に要る |

どの案でも、照合の結果に個人の行・メールアドレスを書かない。

## 3. Storage の独立した復元の検証

### 3-1. 鍵について（公式文書で確かめた制約）
- Supabase の S3 access key は「全 bucket の全操作ができ、RLS を通らない」（<https://supabase.com/docs/guides/storage/s3/authentication>）。**読み取り専用の S3 鍵は、公式の機能としては無い**（文書で見つからなかった）。鍵を作れば書き込みもできる鍵になるので **A2**。
- 今の object 4,728件は **すべて公開の bucket にある**（非公開の2つは0件）。公開の bucket の object は、鍵なしで公開 URL から読める。そこで次の順にする。
  1. **鍵なしの案（推奨）**：公開 URL から読み取る。一覧は、本番の `storage.objects` を MCP の SELECT で取る（bucket・name・size・eTag）。この一覧には個人データが無いことを、出力の列で確かめる。一覧は手元の、リポジトリの外に置く。
  2. **S3 鍵の案**：非公開の bucket に object が増えた場合、または公開 URL で ETag が返らない場合だけ。鍵を作り（A2）、使い終わったらすぐ Dashboard で取り消す。鍵は環境変数にだけ置く。
- 公開 URL からの取得は CDN を通ることがあり、cached egress に数えられる可能性がある（どちらに数えられるかは未確認）。

### 3-2. 複製の前に、egress の量と費用を確かめる（A0）
出典：<https://supabase.com/docs/guides/platform/manage-your-usage/egress>
- Pro の枠：uncached 250GB／月、cached 250GB／月。超えた分は uncached $0.09/GB、cached $0.03/GB。
- 手順：Dashboard の organization → Usage で、今の請求期間の egress（uncached と cached）を見て記録する。
- 判定：`今の使用量 + 約30.2GB` が枠の中なら費用は0。枠を超える見込みなら、超える量 × 単価を書いてオーナーに諮る（費用は A2）。Spend Cap が有効なら、超えた時点で制限がかかる恐れがあるので、期間の初めに行う。
- 複製の先（手元の外付けの記憶装置など）の空きが 30.2GB より十分にあることも確かめる。外部のクラウドの記憶装置を使うなら、その費用も別に諮る。

### 3-3. 複製
- 鍵なしの案：一覧の各行について、公開 URL `https://nyxbnccuvmlzffgtdadi.supabase.co/storage/v1/object/public/<bucket>/<name>` から取得し、`<bucket>/<name>` の path に保存する。同時に、応答の `Content-Length` と `ETag` を記録する。
- S3 鍵の案：endpoint `https://nyxbnccuvmlzffgtdadi.storage.supabase.co/storage/v1/s3`、region `ap-southeast-1`、path style で、rclone か AWS CLI の `sync`（取得だけ。本番側を変える操作をしない）。
- 失敗した object は再試行の一覧に入れ、最後に残った失敗を記録する。
- 保存した各ファイルの `sha256` を計算し、手元の manifest（bucket、name、size、ETag、sha256）を作る。manifest は非公開の場所に置く。

### 3-4. 照合：size と ETag
- **件数**：bucket ごとに、手元のファイル数 = `storage.objects` の件数。
- **size**：各 object で、手元のファイルの大きさ = `metadata->>'size'`。
- **ETag**：取得時の `ETag` = `metadata->>'eTag'`。
  - multipart 形式の ETag（2,396件）は、中身の MD5 ではない（S3 の一般的な仕様。Supabase での計算の方法は未確認）。そのため、これらは「手元の MD5 = ETag」では比べられない。取得時の応答の ETag と metadata の ETag の一致、と size の一致で判定する。
  - それ以外（2,332件）は、手元のファイルの MD5 が ETag（引用符を除く）と一致するかも確かめる。
- 公開 URL の応答に ETag が無い、または値の形が違う場合は、その事実を記録し、3-1 の S3 鍵の案に切り替えるかをオーナーに諮る。

## 4. 結合の確認（DB と Storage）
手元に戻した DB（2-4）と、手元に複製した object（3-3）で確かめる。どちらも手元なので、本番には触れない。

```sql
-- 手元の DB で実行。recordings が参照する object の path を出す
select distinct split_part(audio_storage_path, '/recording-audio/', 2) as object_name
from public.recordings
where coalesce(audio_storage_path, '') <> '';
-- bgm_library.audio_path も同様に（URL 形式と path 形式が混ざっているので両方を正規化する）
```
- 出した path の一覧と、手元の `recording-audio/`・`bgm-library/` のファイル一覧を突き合わせ、「参照されているのに無い」件数が 0 であることを確かめる（2026-10-11 の本番では 2,277/2,277 があった）。
- 手元の `storage.objects`（dump から戻したもの）と、手元のファイルの一覧も突き合わせる（件数・size）。
- illustrations の参照の場所を特定できていないので、特定できるまでは「件数・size・ETag の一致」だけで判定し、結合は未確認として残す。
- 参照されていない object（2026-10-11 で 2,443件）は、この検証でも消さない。

## 5. 段階ごとに要る承認
権限の区分は ai-operator-policy の `policies/authority.md`（A0 読み取り、A1 範囲内の作業・読み取り専用の本番の問い合わせ、A2 特権）による。このリポジトリの HOLD と承認の決まりが優先する。

| 段 | 内容 | 区分 | 承認 |
| --- | --- | --- | --- |
| 1-1 Dashboard を見る | Backups・Add-ons・Usage を見るだけ | A0 | 不要（オーナーが見る） |
| 1-1 Management API | 個人のアクセストークンを作る | A2 | 要（秘密の作成）。オーナーが手元で実行 |
| 2-2 DB の資格情報 | password の reset、または読み取り専用の role の作成 | A2 | 要（本番の変更・秘密） |
| 2-3 dump | 個人データを含む DB の中身を手元に出す | A2 | 要（個人データの持ち出し） |
| 2-4・2-5 手元で戻す・照合 | 手元の Docker の中だけ | A1 | 2-3 の承認の範囲内 |
| 2-5 本番側の基準値 | 件数と hash の SELECT | A1 | 不要（読み取り専用。行った問い合わせを報告する） |
| 3-1 S3 鍵（必要な場合のみ） | 全権限の鍵の作成と取り消し | A2 | 要（秘密の作成） |
| 3-2 egress の確認 | Usage を見るだけ | A0 | 不要 |
| 3-3 複製 | 約30.2GB の取得（枠の中なら費用0） | A2 | 要（データの持ち出し。枠を超えるなら費用も） |
| 3-4・4 照合 | 手元だけ | A1 | 3-3 の承認の範囲内 |
| 後始末 | dump と複製の削除、鍵の取り消し、role の削除または password の変更 | A1（手元）・A2（本番の role・鍵） | 本番側は 2-2・3-1 の承認に含めて先に決める |

本番の DB・Storage への書き込み、本番の project への復元（Dashboard の restore）、新しい有料の project の作成は、本手順の範囲外とする。

## 6. 完了の条件と記録の書式

### 完了の条件（すべて満たしたときだけ「独立した復元を実証した」と書く）
1. DB：主キーのある全表で、件数と `pk_hash` が本番の基準値と一致する。違いはすべて dump の時刻の差として説明できる。
2. DB：schema の形（表・view・関数・policy・trigger の数）が一致する。
3. Storage：bucket ごとの件数、各 object の size と ETag が `storage.objects` と一致する。取得に失敗した object が 0件。
4. 結合：DB が参照する Storage の path がすべて手元にある（参照されているのに無い件数が 0）。
5. かかった時間と、手順のどこで何が起きたかを記録した。
6. 個人データを含む dump と、使った鍵・資格情報の後始末（削除・取り消し）を記録した。

### #141 への記録の書式
秘密・個人の行・メールアドレス・object の名前の一覧は書かない。件数・hash・時間だけを書く。

```markdown
## P6 DB・Storage の独立した復元の検証（YYYY-MM-DD）
- 実施者／環境：<オーナー or セッション名>、手元の OS、supabase CLI <版>、Docker <版>、PostgreSQL <版>
- 承認：<段>：<承認の文言と日時>（各 A2 の段ごと）
- バックアップの状態：PITR <有／無>、最新の日次バックアップ <日時>、件数 <n>

### DB
| 項目 | 本番 | 手元 | 一致 |
|---|---|---|---|
| 主キーのある表の数 | | | |
| 件数・pk_hash が一致した表 | | | |
| 主キーの無い表（件数のみ） | | | |
| 表・view・関数・policy・trigger の数 | | | |
- dump の sha256：roles <…>／schema <…>／data <…>
- 時間：dump <分>、戻す <分>、照合 <分>
- 不一致と説明：<表名：差、理由>

### Storage
| bucket | 件数（本番／手元） | bytes（本番／手元） | size 一致 | ETag 一致 | 取得失敗 |
|---|---|---|---|---|---|
- egress：実施前 <GB>、実施後 <GB>、費用 <$>
- 時間：複製 <分>、照合 <分>

### 結合
- 参照された path <n> 件のうち、手元にある <n> 件、無い <n> 件

### 後始末
- dump の削除 <日時>／複製の削除 or 保管先 <…>／鍵の取り消し <日時>／role・password <…>

### 判定
- 完了の条件 1〜6：<満たした／満たしていない（どれが）>
- 検証の水準：実機確認済み／一部のみ（未確認の点：…）
```

## 出典（2026-11-15 に Supabase の search_docs で確かめた）
- Database Backups：<https://supabase.com/docs/guides/platform/backups>
- Lists all backups（Management API）：<https://supabase.com/docs/reference/api/v1-list-all-backups>
- Backup and Restore using the CLI：<https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore>
- Restore a Platform Project to Self-Hosted：<https://supabase.com/docs/guides/self-hosting/restore-from-platform>
- S3 Authentication：<https://supabase.com/docs/guides/storage/s3/authentication>
- Manage Egress usage：<https://supabase.com/docs/guides/platform/manage-your-usage/egress>
- Manage Point-in-Time Recovery usage：<https://supabase.com/docs/guides/platform/manage-your-usage/point-in-time-recovery>

## 未確認の点
- PITR の有無、最新の日次バックアップの日時（Dashboard か Management API で確かめる。1-1）。
- Management API の応答の項目名。
- 物理の日次バックアップを Dashboard からダウンロードできるか。
- 公開 URL の応答に、`storage.objects` と同じ ETag が返るか。公開 URL の取得が cached と uncached のどちらの egress に数えられるか。
- illustrations の object を DB のどこが参照しているか。
- 本番の DB の password を今だれが持っているか（reset が要るか）。
