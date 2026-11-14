# #141 P6 — DB と Storage を独立に復元できることの検証手順書

状態：**手順書のみ。実施していない。** オーナーの判断（2026-11-15「手順書だけ作り、実施は後に」）による。
この文書があることは、復元できることの証明ではない。#141 の受け入れの条件「DB と Storage の独立した復元」は、下の「7. 完了の条件」を満たして記録するまで **未達** のままとする。

前提の文書：[`docs/child84-backup-and-storage-recovery.md`](child84-backup-and-storage-recovery.md)（2026-10-11 の棚卸しと方針）。本書はそれを、費用をかけずに実行できる順の手順に落としたもの。

> **最重要の警告**：本番の Storage には **バックアップが無い**。複製の命令で元と先を取り違えたり、`sync` のように先に合わせて消す命令を使ったりすると、本番の object を一括で消し、戻せなくなる。本書では `sync` を禁止し、方向は常に **元＝本番、先＝手元** とする（3-4）。

## 0. 前提として確かめた事実（2026-11-15、読み取りのみ）

本番 Supabase `nyxbnccuvmlzffgtdadi`（Pro、ap-southeast-1、PostgreSQL 17.6）に、MCP の SELECT だけで確かめた。**どの値も時点の値で、表の数・件数・byte は日々変わる。** 実施の直前に取り直す。

| 項目 | 値 |
| --- | --- |
| DB の大きさ（`pg_database_size`） | 82 MB |
| 表の数 | public 55、auth 27、全体 106（主キーのある表は public・auth・storage で 92） |
| Storage の object（`storage.objects`） | recording-audio 4,720件 / 30,165,700,212 B、illustrations 6件 / 12,290,705 B、bgm-library 2件 / 11,648,088 B。計 4,728件・約30.2GB |
| bucket | 公開：recording-audio、illustrations、bgm-library。非公開：human-recording-audio、ai-narration-private（どちらも object 0件） |
| `metadata->>'eTag'` | 4,728件すべてにある。うち **2,396件は multipart 形式**（`-` を含む。recording-audio 2,394・bgm-library 2） |
| object の名前 | recording-audio の **4,720件すべての名前に UUID が入り、うち6件は `auth.users` の id を含む**。名前の一覧は個人に結びつく情報として扱う（3-2） |
| storage・auth の手直し | `storage` の RLS policy 6件。auth・storage の表にある trigger（内部用を除く）12件。これらは `db dump` の schema に入らない（2-6） |
| auth の資格情報を持つ表 | `auth.refresh_tokens`、`auth.sessions`、`auth.flow_state`、`auth.one_time_tokens`、`auth.mfa_factors` がある（2-8） |
| DB から Storage への参照 | `public.recordings.audio_storage_path` 2,277件（すべて URL 形式で `/recording-audio/` を含む）、`public.bgm_library.audio_path` 2件。`episodes.bgm_*`・`series.bgm_audio_path` は 0件。illustrations を参照する列は、列名の検索では見つからなかった（未確認。本文などに埋め込まれている可能性） |
| `archive_mode` | `on`（#141 のコメント 6882158260）。これだけでは PITR が有効とは言えない（推論）。 |

## 1. 今のバックアップの状態を確かめる（A0〜A2、費用なし）

### 1-1. PITR の有無と、最新の復元点
次のどちらかで確かめ、結果を #141 に記録する。

- **Dashboard**：Database → Backups。「Scheduled backups」に日ごとの一覧が出るか、「Point in Time」に earliest / latest recovery point が出るかを見る。
- **Management API**：`GET https://api.supabase.com/v1/projects/nyxbnccuvmlzffgtdadi/database/backups`（参照：<https://supabase.com/docs/reference/api/v1-list-all-backups>）。
  - 個人のアクセストークン（Account → Access Tokens）が要る。トークンを作るのは **A2**（秘密の作成）。作るときは **有効期限を最短にし、使い終わったらすぐ取り消す**（8. 後始末）。オーナーが手元で実行し、応答から「PITR の有無・各バックアップの日時と状態」だけを書き写す。トークンや応答の全文は Git・PR・Issue に貼らない。
  - 公式の API の説明には応答の項目名が載っていない（`pitr_enabled` などの名前は未確認）。実際の応答を見て判断する。
- 併せて、Dashboard の Add-ons で PITR の add-on が付いているか、Compute の大きさを見る。

### 1-2. PITR の費用と条件（参考。本手順では有効にしない）
出典：<https://supabase.com/docs/guides/platform/manage-your-usage/point-in-time-recovery>（2026-11-15 確認）
- 保持期間 7日：時間あたり $0.137（月約 $100）、14日：$0.274（月約 $200）、28日：$0.55（月約 $400）。
- **PITR の add-on は Spend Cap の対象外**（上限を設けていても課金が止まらない）。
- PITR を有効にすると、日次のバックアップは取られなくなる（backups の文書）。
- compute の条件（2026-11-15 に確かめた2つの公式の出典）：
  - <https://supabase.com/docs/guides/platform/backups> は「PITR には少なくとも Small の compute が要る」と書く。
  - 上の PITR usage の文書は、条件を文として書かず、請求の例をすべて Small で示す。
  - 独立レビュー（2026-11-15）は、公式の出典どうしで食い違いがあると指摘した。今回の検索では、条件を否定する文は見つからなかった。採用を検討するときは、その日の Dashboard の Add-ons の表示を正とし、日付つきで記録する。

### 1-3. Pro の毎日のバックアップで「戻せるもの」と「戻せないもの」
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

結論：Supabase の日次バックアップは「本番を同じ project の過去に戻す」手段で、**独立した復元の実証にはならない**。独立した復元は、下の 2〜5 で手元に作る。

## 2. DB の独立した復元の検証

### 2-1. 道具（費用なし。導入は A2）
- Supabase CLI、Docker Desktop、`psql`（PostgreSQL 17 系）。これらの導入と、Docker の image の取得は、PC へのソフトの導入にあたるので **A2**。
- **CLI の版を固定する**。最初に `supabase --version` を記録し、dump・diff・戻す・照合のすべてを同じ版で行う。途中で更新しない。
- `supabase db dump` は内部で、Supabase の Postgres の image の中の `pg_dump` を使う（<https://supabase.com/docs/reference/cli/supabase-db-dump>）。

### 2-2. 手元の stack を作る（リポジトリの外）
- **このリポジトリの中では行わない**。リポジトリの `supabase/` の設定・migration と混ざらないよう、リポジトリの外に **空のフォルダ** を作り、そこで `supabase init` する。
- 生成された `supabase/config.toml` の `[db]` の `major_version` を `17` にする（本番は 17.6）。
- `supabase start` で手元の stack を起こす。auth・storage の schema と Supabase の role が揃う。素の Postgres の image では `anon`・`authenticated` などの role が無く、schema の適用で失敗しやすい。

### 2-3. 接続の資格情報（ここが最初の承認点）
- 公式の手順は、Dashboard の Connect の接続文字列と DB の password を使う。password が分からない場合、公式の手順は「Database Settings で password を **reset** する」になっている。**reset は本番の設定変更で、使っているアプリや自動処理が切れる恐れがある（A2）**。
- 代わりの案：検証用に読み取り専用の login role を作る。これも本番への DDL で **A2**。auth schema の表を読めるかも確かめる必要がある。
- どちらにするかはオーナーが決める。
- 秘密の置き方：
  - 接続文字列は手元の shell の環境変数（例：`PROD_DB_URL`）にだけ置き、ファイル・Git・ログ・チャットに残さない。shell の履歴に残らない入れ方にする。
  - **password を命令の引数で渡すと、実行中はプロセスの一覧（`ps`、タスク マネージャーのコマンド ライン列など）から見える**。環境変数を展開して引数にした場合も同じ。ほかの人が使っていない PC で、dump の間だけ実行する。CLI が引数以外で password を受け取る方法（環境変数など）を、固定した版の `--help` で確かめ、あればそちらを使う。
  - **dump が終わったら、すぐ `unset PROD_DB_URL` する**（PowerShell では `Remove-Item Env:PROD_DB_URL`）。

### 2-4. dump（本番からの読み取り。個人データと資格情報を外に出す点が A2）
公式の手順（<https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore>）どおり、3つに分ける。

```sh
supabase db dump <接続先の指定> -f roles.sql --role-only
supabase db dump <接続先の指定> -f schema.sql
supabase db dump <接続先の指定> -f data.sql --use-copy --data-only \
  -x "storage.buckets_vectors" -x "storage.vector_indexes"
unset PROD_DB_URL
```

- `<接続先の指定>`：2026-11-15 の公式の CLI の文書（上の2つ）は `--db-url "$PROD_DB_URL"` を示す。独立レビューは「`--db-url` は v3 で非推奨、v4 で削除。`--remote=` を使う」と指摘した（今回の公式文書の検索では確かめられなかった）。**固定した版の `supabase db dump --help` を見て、その版が示す指定を使う。** 非推奨の警告が出たら、示された新しい指定に替える。
- **接続先の確認**：実行時に stderr に出る接続先の行（レビューの指摘では `Target:` の行）を読み、本番の project（`nyxbnccuvmlzffgtdadi`）であることを確かめてから先に進む。逆に、戻す（2-5）・照合（2-7）のときは、接続先が `127.0.0.1` か `localhost` であることを確かめる。
- 置き場所は、暗号化した手元の記憶装置の、リポジトリの外の作業用フォルダ。dump を GitHub Actions の artifact・Vercel・公開の bucket・共有の URL に置かない。
- dump の直後に、各ファイルの `sha256` を計算して記録する（中身は記録しない）。
- 同じ時刻の本番の基準値（2-7 の SQL の結果）を、dump の直前と直後に取る。間で件数が変わった表は「動いている表」として印を付ける。
- dump の量は約82MB で、Supavisor 経由なら「Shared Pooler Egress」に数えられる。Pro の枠（250GB）に比べて小さい。

### 2-5. 手元に戻す
```sh
psql --single-transaction --variable ON_ERROR_STOP=1 \
  --file roles.sql --file schema.sql \
  --command 'SET session_replication_role = replica' \
  --file data.sql \
  --dbname "$LOCAL_DB_URL"
```
- `$LOCAL_DB_URL` は `supabase status` で出る手元の URL。本番の URL と取り違えないよう、実行前に host が `127.0.0.1` か `localhost` であることを目で確かめる。
- 拡張機能（本番で5つ）が手元にあるかを先に確かめる（`select extname from pg_extension`）。
- 失敗したら、その SQL の位置と error を記録し、直して最初からやり直す（部分的な成功を合格としない）。
- **版の違いで data.sql が失敗した場合**（手元の stack の auth・storage の表の形が本番と違うなど）は、<https://supabase.com/docs/guides/self-hosting/restore-from-platform> の手順と注意（拡張機能、`session_replication_role`、Auth の扱い）を見て対処する。CLI の版を変えた場合は、dump からやり直す。
- かかった時間（dump、戻す、照合のそれぞれ）を測る。

### 2-6. auth と storage の手直しを別に戻す
- 公式の CLI の文書では、`db dump` の schema は **auth・storage・拡張機能が作る schema を除く**（<https://supabase.com/docs/reference/cli/supabase-db-dump>）。そのため、本番が auth・storage に加えた手直し（storage の RLS policy 6件、auth・storage の表の trigger など）は schema.sql に入らない。
- 別に取り出す：`supabase db diff --schema auth,storage`（接続先の指定は 2-4 と同じく、固定した版の `--help` に従う）。公式の `db pull` の文書も、auth・storage の手直しは `--schema auth,storage` で取り込むよう書いている（<https://supabase.com/docs/reference/cli/supabase-db-pull>）。
- 出てきた SQL を読み、DDL（policy・trigger・grant）だけであることを確かめてから、手元の DB に `psql` で流す。本番に流す命令ではないことを、接続先で確かめる。
- この手順は 2-5 の後、2-7 の照合の前に行う。

### 2-7. 照合：表ごとの件数と主キーの hash、schema の形、grant
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
- 2026-11-15 の本番では、この SQL は 92 表分の問い合わせを生成した（public・auth・storage の主キーのある表）。表の数は時点で変わる。`auth.audit_log_entries` のように常に増える表は、2-4 の「動いている表」として扱う。
- 生成された各行を `union all` でつないで流し、結果（表名・件数・hash）を本番と手元で比べる。
- 主キーの無い表は、件数だけ比べ、表名を一覧に残す。
- **data dump が除外する表**（照合の対象から外し、理由を記録に残す）：

  | 表 | 除外の理由 |
  | --- | --- |
  | `auth.schema_migrations` | Auth のサービス自身の migration の履歴。手元の stack は自分の版の履歴を持つので、本番の値で上書きしない。独立レビューの指摘で CLI が除外するとされる。data.sql に COPY が無いことで確かめる |
  | `storage.migrations` | Storage のサービス自身の migration の履歴。理由と確かめ方は上と同じ |
  | `storage.buckets_vectors` | 公式の backup-restore の手順が `-x` で除外している（vector の機能の表。本番での利用なし） |
  | `storage.vector_indexes` | 同上 |

- **schema の形**：表・view・関数・RLS の policy・trigger の数を、schema（public・auth・storage）ごとに比べる（`pg_class`、`pg_proc`、`pg_policies`、`pg_trigger`）。storage の policy が 6件（2026-11-15）あることを確かめる。
- **grant**：役割ごとの権限の一覧の hash を比べる。

  ```sql
  select grantee, count(*) as n,
         md5(string_agg(table_schema || '.' || table_name || ':' || privilege_type, ',' order by table_schema, table_name, privilege_type)) as grant_hash
  from information_schema.role_table_grants
  where table_schema in ('public', 'storage')
    and grantee in ('anon', 'authenticated', 'service_role', 'postgres')
  group by grantee order by grantee;
  ```
  関数の実行権限（`information_schema.routine_privileges`）も同じ形で比べる。
- 2-4 で「動いている表」とした表の差は、dump の時刻の差として説明できるかを確かめ、説明できない差は不一致とする。

### 2-8. dump は秘密と同じに扱う。auth と個人データの扱い
- dump には個人データに加えて、**そのまま使える資格情報**が入る：`auth.refresh_tokens`、`auth.sessions`、`auth.users` の password の hash、`auth.flow_state` の provider の token、`auth.one_time_tokens`、`auth.mfa_factors`。漏れると、利用者の session を奪われる恐れがある。
- **dump と、それを戻した手元の DB（Docker の volume）は、API key や password と同じ秘密として扱う**：暗号化した記憶装置にだけ置く、共有しない、clipboard・チャット・Issue に中身を出さない、使い終わったら消す（8. 後始末）。
- 個人データと資格情報を Supabase の外に出すので、dump は **A2**。

| 案 | 内容 | 欠点 |
| --- | --- | --- |
| A（推奨） | 全部を dump し、暗号化した手元の記憶装置にだけ置き、照合の後に消す。消した日時を記録する | 秘密が一時的に手元に出る |
| B | `auth` を除いて dump する | `public` から `auth.users` への外部キーが手元で切れ、参照の照合ができない。「独立した復元」としては不完全 |
| C | 暗号化して保管し続け、off-site のバックアップにする | **鍵の管理（だれが鍵を持つか、保管の期間、取り消しと削除の手順）の決まりができるまで、選べない** |

どの案でも、照合の結果に個人の行・メールアドレスを書かない。

## 3. Storage の複製と照合

### 3-1. 鍵について（公式文書で確かめた制約）
- Supabase の S3 access key は「全 bucket の全操作ができ、RLS を通らない」（<https://supabase.com/docs/guides/storage/s3/authentication>）。**読み取り専用の S3 鍵は、公式の機能としては無い**（文書で見つからなかった）。鍵を作れば書き込みも削除もできる鍵になるので **A2**。
- 今の object 4,728件は **すべて公開の bucket にある**（非公開の2つは0件）。公開の bucket の object は、鍵なしで公開 URL から読める。そこで次の順にする。
  1. **鍵なしの案（推奨）**：公開 URL から読み取る。本番を変える力のある鍵を手元に置かずに済む。
  2. **S3 鍵の案**：非公開の bucket に object が増えた場合、または公開 URL で ETag が返らない場合だけ。鍵を作り（A2）、使い終わったらすぐ Dashboard で取り消す。鍵は環境変数にだけ置く。
- 公開 URL からの取得は CDN を通ることがあり、cached egress に数えられる可能性がある（どちらに数えられるかは未確認）。

### 3-2. 取得する一覧の作り方
- object の名前には UUID が入り、一部は `auth.users` の id を含む（0 節）。名前の一覧は個人に結びつく情報なので、**MCP で本番から取り出さない**。
- 一覧は、2-5 で **手元に戻した DB の `storage.objects`** から作る（bucket、name、`metadata->>'size'`、`metadata->>'eTag'`）。手元の DB の中身は dump の時点のものなので、dump の直後に複製を始め、間に増えた object は「動いている object」として扱う。
- 一覧のファイルは、dump と同じ暗号化した作業用フォルダに置き、Git・Issue・PR に貼らない。

### 3-3. 複製の前に、egress の量と費用を確かめる（A0）
出典：<https://supabase.com/docs/guides/platform/manage-your-usage/egress>
- Pro の枠：uncached 250GB／月、cached 250GB／月。超えた分は uncached $0.09/GB、cached $0.03/GB。
- 手順：Dashboard の organization → Usage で、今の請求期間の egress（uncached と cached）を見て記録する。
- 判定は **最悪の場合として、約30.2GB 全部が uncached に数えられる** として行う：`今の uncached の使用量 + 30.2GB ≦ 250GB` なら費用は0。超える見込みなら、超える量 × $0.09 を書いてオーナーに諮る（費用は A2）。Spend Cap が有効なら、超えた時点で制限がかかる恐れがあるので、請求期間の初めに行う。
- 複製の先（手元の外付けの記憶装置など）の空きが 30.2GB より十分にあることも確かめる。外部のクラウドの記憶装置を使うなら、その費用も別に諮る。

### 3-4. 複製（方向は 元＝本番 → 先＝手元 だけ）
**禁止**：`rclone sync`、`aws s3 sync`、その他「先に合わせて消す」命令。`--delete` 系の指定。本番を先にする命令。Storage にはバックアップが無いので、取り違えると本番の object を一括で消し、戻せない。

**取得の決まり（公開 URL・S3 鍵の両方）**
- 同時に取得する数は **4 以下** にする。
- 本番の利用が少ない時間帯に行う（Vercel の observability で、直近の時間ごとの呼び出し数を見て選ぶ）。混む時間帯は避ける。
- **429 か 5xx が返ったら、その時点で止める**。間隔を空けた再試行は1回までとし、続けて返るなら中止して記録する。止まった位置から再開できるよう、取得済みの一覧を残す。
- 失敗した object は再試行の一覧に入れ、最後に残った失敗を記録する。

**鍵なしの案**
- 一覧の各行について、`https://nyxbnccuvmlzffgtdadi.supabase.co/storage/v1/object/public/<bucket>/<name>` を GET し、手元の `<bucket>/<name>` に保存する。HTTP の GET だけで、本番を変える操作は無い。
- 応答の `Content-Length` と `ETag` を記録する。
- 最初に一覧の先頭の数件だけで試し（dry run に相当）、保存先・件数・応答の形が正しいことを確かめてから全体を流す。

**S3 鍵の案**（3-1 の条件のときだけ）
- `rclone copy` か `aws s3 cp --recursive` を使う。**元は本番の bucket、先は手元のフォルダ**（例：`rclone copy supabase-prod:recording-audio ./restore/recording-audio`）。引数の順を逆にしない。
- endpoint は `https://nyxbnccuvmlzffgtdadi.storage.supabase.co/storage/v1/s3`、region は `ap-southeast-1`、path style。
- **最初に必ず `--dry-run` で流し**（`rclone copy --dry-run …`、`aws s3 cp --recursive --dryrun …`）、出力が「本番から手元への copy」だけで、削除や本番への書き込みが1件も無いことを確かめてから本番の実行に移る。
- 同時の数は `rclone` なら `--transfers 4`、AWS CLI なら `max_concurrent_requests` を 4 以下にする。

**後に共通**：保存した各ファイルの `sha256` を計算し、手元の manifest（bucket、name、size、ETag、sha256）を作る。manifest は非公開の暗号化した場所に置く。

### 3-5. 照合：size と ETag
- **件数**：bucket ごとに、手元のファイル数 = 一覧（手元の DB の `storage.objects`）の件数。
- **size**：各 object で、手元のファイルの大きさ = `metadata->>'size'`。
- **ETag**：取得時の `ETag` = `metadata->>'eTag'`。
  - multipart 形式の ETag（2026-11-15 で 2,396件）は、中身の MD5 ではない（S3 の一般的な仕様。Supabase での計算の方法は未確認）。そのため、これらは「手元の MD5 = ETag」では比べられない。取得時の応答の ETag と metadata の ETag の一致、と size の一致で判定する。
  - それ以外は、手元のファイルの MD5 が ETag（引用符を除く）と一致するかも確かめる。
- 公開 URL の応答に ETag が無い、または値の形が違う場合は、その事実を記録し、3-1 の S3 鍵の案に切り替えるかをオーナーに諮る。

## 4. Storage を手元の stack に戻す
複製して照合するだけでは「戻せる」ことの実証にならない。手元の `supabase start` の Storage に戻し、使える状態になることを確かめる（child84 の Storage の手順4「retrieval authorization と DB-to-object resolution」に揃える）。

- 手元の stack の bucket（dump から戻した `storage.buckets`）があり、公開・非公開の設定が本番と同じであることを確かめる。
- 手元のファイルを、**手元の** Storage に上げる。S3 の endpoint は `http://127.0.0.1:54321/storage/v1/s3`、region は `local`、鍵は `supabase status` が出す手元の鍵（S3 Authentication の文書の local development の値）。**endpoint が 127.0.0.1 であることを実行前に確かめる**。本番の endpoint を先にしない。ここでも `sync` は使わず `rclone copy`（元＝手元のフォルダ、先＝手元の Storage）を使い、先に `--dry-run` で流す。
- 上げると、手元の `storage.objects` の行の metadata（ETag・時刻）は作り直されることがある（未確認）。そのため、戻した後の照合は size と、次の匿名の取得での `sha256` の一致で行う。
- **匿名での取得**：鍵も JWT も付けずに、手元の公開 URL `http://127.0.0.1:54321/storage/v1/object/public/<bucket>/<name>` を全件 GET し、HTTP 200 と、`sha256` が manifest と一致することを確かめる。手元なので egress の費用は無い。
- 非公開の bucket（いまは0件）に object がある場合は、匿名では取得できない（403 など）ことも確かめる。
- **grant の比較**：2-7 の grant の SQL を `storage` schema について手元と本番で比べ、anon・authenticated の権限が同じであることを確かめる。

## 5. 結合の確認（DB → object の通しの解決）
手元に戻した DB（2-5・2-6）と、手元の Storage（4）で確かめる。どちらも手元なので、本番には触れない。

```sql
-- 手元の DB で実行。recordings が参照する object の path を出す
select distinct split_part(audio_storage_path, '/recording-audio/', 2) as object_name
from public.recordings
where coalesce(audio_storage_path, '') <> '';
-- bgm_library.audio_path も同様に（URL 形式と path 形式が混ざっているので両方を正規化する）
```
- 出した path の一覧と、手元の Storage の `recording-audio`・`bgm-library` の object を突き合わせ、「参照されているのに無い」件数が 0 であることを確かめる（2026-10-11 の本番では 2,277/2,277 があった）。
- **Reader の音声1件の通しの解決**：手元の DB で、公開されている作品の公開された話の、録音1件を選ぶ（作品 → 話 → `recordings` の行）。その `audio_storage_path` の host を手元に置き換えた URL を、鍵なしで GET し、HTTP 200 で、`sha256` が manifest と一致することを確かめる。選んだ行の id は記録に書かず、「1件・成功」だけを書く。
- illustrations の参照の場所を特定できていないので、特定できるまでは「件数・size・sha256 の一致」だけで判定し、結合は未確認として残す。
- 参照されていない object（2026-10-11 で 2,443件）は、この検証でも消さない。

## 6. 段階ごとに要る承認
権限の区分は ai-operator-policy の `policies/authority.md`（A0 読み取り、A1 範囲内の作業・読み取り専用の本番の問い合わせ、A2 特権）による。このリポジトリの HOLD と承認の決まりが優先する。

| 段 | 内容 | 区分 | 承認 |
| --- | --- | --- | --- |
| 1-1 Dashboard を見る | Backups・Add-ons・Usage を見るだけ | A0 | 不要（オーナーが見る） |
| 1-1 Management API | 個人のアクセストークンを作る（期限は最短） | A2 | 要（秘密の作成）。オーナーが手元で実行 |
| 1-1 トークンの取り消し | 使った後に Dashboard で取り消す | A1 | 作成の承認に含める（必ず行う） |
| 2-1 道具の導入 | Supabase CLI・Docker Desktop・psql の導入、Docker の image の取得 | A2 | 要（ソフトの導入） |
| 2-3 DB の資格情報 | password の reset、または読み取り専用の role の作成 | A2 | 要（本番の変更・秘密） |
| 2-4 dump | 個人データと資格情報を含む DB の中身を手元に出す | A2 | 要（個人データ・秘密の持ち出し） |
| 2-6 auth・storage の手直しの取り出し | `db diff --schema auth,storage`（本番の schema を読む） | A2 | 2-3 の資格情報を使うので、2-4 と一緒に承認を得る |
| 2-5・2-7 手元で戻す・照合 | 手元の Docker の中だけ | A1 | 2-4 の承認の範囲内 |
| 2-7 本番側の基準値 | 件数・hash・grant の SELECT | A1 | 不要（読み取り専用。行った問い合わせを報告する） |
| 3-1 S3 鍵（必要な場合のみ） | 全権限の鍵の作成と取り消し | A2 | 要（秘密の作成） |
| 3-3 egress の確認 | Usage を見るだけ | A0 | 不要 |
| 3-4 複製 | 約30.2GB の取得（最悪の場合で枠の中なら費用0） | A2 | 要（データの持ち出し。枠を超えるなら費用も） |
| 3-5・4・5 照合・手元への復元 | 手元だけ | A1 | 3-4 の承認の範囲内 |
| 8 後始末 | dump と複製と volume の削除、鍵・トークンの取り消し、role の削除または password の変更 | A1（手元）・A2（本番の role・鍵） | 本番側は 2-3・3-1 の承認に含めて先に決める |

本番の DB・Storage への書き込み、本番の project への復元（Dashboard の restore）、新しい有料の project の作成、PITR の有効化は、本手順の範囲外とする。

## 7. 完了の条件と記録の書式

### 完了の条件（すべて満たしたときだけ「独立した復元を実証した」と書く）
1. DB：主キーのある全表で、件数と `pk_hash` が本番の基準値と一致する。違いはすべて dump の時刻の差として説明できる。data dump が除外する表（`auth.schema_migrations`、`storage.migrations`、`storage.buckets_vectors`、`storage.vector_indexes`）は対象外とし、理由を記録する。
2. DB：schema の形（表・view・関数・policy・trigger の数）と grant の hash が一致する。auth・storage の手直し（storage の RLS policy 6件など）を 2-6 の手順で別に戻し、それも一致する。
3. Storage の複製：bucket ごとの件数、各 object の size と ETag が `storage.objects` と一致する。取得に失敗した object が 0件。
4. Storage の復元：手元の Storage に全件を戻し、匿名で全件を取得でき、`sha256` が manifest と一致する。grant が本番と同じ。
5. 結合：DB が参照する Storage の path がすべて手元の Storage にあり、Reader の音声1件を DB から object まで通しで解決できる。
6. かかった時間と、手順のどこで何が起きたかを記録した。
7. 8 の後始末をすべて行い、記録した。

### #141 への記録の書式
秘密・個人の行・メールアドレス・object の名前の一覧は書かない。件数・hash・時間だけを書く。

```markdown
## P6 DB・Storage の独立した復元の検証（YYYY-MM-DD）
- 実施者／環境：<オーナー or セッション名>、手元の OS、supabase CLI <版（固定）>、Docker <版>、PostgreSQL <版>
- 承認：<段>：<承認の文言と日時>（各 A2 の段ごと）
- バックアップの状態：PITR <有／無>、最新の日次バックアップ <日時>、件数 <n>

### DB
| 項目 | 本番 | 手元 | 一致 |
|---|---|---|---|
| 主キーのある表の数 | | | |
| 件数・pk_hash が一致した表 | | | |
| 主キーの無い表（件数のみ） | | | |
| 表・view・関数・policy・trigger の数 | | | |
| grant の hash（anon・authenticated・service_role・postgres） | | | |
| auth・storage の手直し（policy・trigger） | | | |
- 除外した表と理由：<…>
- dump の sha256：roles <…>／schema <…>／data <…>
- 時間：dump <分>、戻す <分>、照合 <分>
- 不一致と説明：<表名：差、理由>

### Storage
| bucket | 件数（本番／手元） | bytes（本番／手元） | size 一致 | ETag 一致 | 取得失敗 | 手元へ戻す・匿名取得・sha256 一致 |
|---|---|---|---|---|---|---|
- egress：実施前 uncached <GB>／cached <GB>、実施後 <GB>／<GB>、費用 <$>
- 取得の条件：同時 <n>、時間帯 <…>、429・5xx <件数>
- 時間：複製 <分>、照合 <分>、手元へ戻す <分>

### 結合
- 参照された path <n> 件のうち、手元の Storage にある <n> 件、無い <n> 件
- Reader の音声1件の通しの解決：<成功／失敗>

### 後始末
- `supabase stop --no-backup` <日時>／VHDX の扱い <…>
- dump・一覧・manifest・複製の削除 <日時>（または保管先と鍵の管理者）
- `PROD_DB_URL` の unset <dump の直後に実施>
- アクセストークンの取り消し <日時>／S3 鍵の取り消し <日時 or 未使用>／role・password <…>

### 判定
- 完了の条件 1〜7：<満たした／満たしていない（どれが）>
- 検証の水準：実機確認済み／一部のみ（未確認の点：…）
```

## 8. 後始末（必ず行い、記録する）
- **dump の直後**：`unset PROD_DB_URL`（PowerShell では `Remove-Item Env:PROD_DB_URL`）。shell を閉じる。
- **手元の stack**：照合が終わったら、2-2 のフォルダで `supabase stop --no-backup` を実行し、手元の DB と Storage の Docker の volume を消す。`docker volume ls` で、その project の volume が残っていないことを確かめる。
  - Windows の Docker Desktop（WSL 2）では、volume は WSL の仮想ディスク（VHDX）の中にある。volume を消しても、VHDX の中の領域がすぐに上書きされるとは限らない（推論）。dump に資格情報が入っていたので、VHDX の置かれた記憶装置が暗号化されていることを、実施の前に確かめる。
- **ファイル**：dump（roles・schema・data）、auth・storage の手直しの SQL、object の一覧、manifest、複製した object を消す（案 C を選んだ場合を除く。案 C は 2-8 の条件を満たすまで選べない）。
- **アクセストークン**：作るときに有効期限を最短にし、使い終わったら Dashboard の Account → Access Tokens で取り消す。
- **S3 鍵**（作った場合）：Dashboard で取り消す。
- **本番の資格情報**：検証用の role を作った場合は消す。password を reset した場合は、オーナーの判断で変え直す。
- 2-2 の作業用フォルダ（`supabase init` したもの）を消す。

## 出典（2026-11-15 に Supabase の search_docs で確かめた）
- Database Backups：<https://supabase.com/docs/guides/platform/backups>
- Manage Point-in-Time Recovery usage：<https://supabase.com/docs/guides/platform/manage-your-usage/point-in-time-recovery>
- Lists all backups（Management API）：<https://supabase.com/docs/reference/api/v1-list-all-backups>
- Backup and Restore using the CLI：<https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore>
- Restore a Platform Project to Self-Hosted：<https://supabase.com/docs/guides/self-hosting/restore-from-platform>
- CLI `db dump`：<https://supabase.com/docs/reference/cli/supabase-db-dump>
- CLI `db pull`（auth・storage の手直しと `--schema auth,storage`）：<https://supabase.com/docs/reference/cli/supabase-db-pull>
- S3 Authentication：<https://supabase.com/docs/guides/storage/s3/authentication>
- Manage Egress usage：<https://supabase.com/docs/guides/platform/manage-your-usage/egress>

## 未確認の点
- PITR の有無、最新の日次バックアップの日時（1-1）。
- Management API の応答の項目名。
- 物理の日次バックアップを Dashboard からダウンロードできるか。
- CLI の `--db-url` の非推奨と `--remote=` への置き換え、stderr の `Target:` の行（独立レビューの指摘。2026-11-15 の公式文書では確かめられなかった。固定した版の `--help` と実際の出力で確かめる）。
- CLI の data dump が `auth.schema_migrations`・`storage.migrations` を既定で除くか（独立レビューの指摘。data.sql で確かめる）。
- `db diff --schema auth,storage` が本番に対して読み取りだけで済むか（固定した版の文書・`--help` で確かめる）。
- PITR の compute の条件についての、公式の出典どうしの食い違い（1-2）。
- 公開 URL の応答に、`storage.objects` と同じ ETag が返るか。公開 URL の取得が cached と uncached のどちらの egress に数えられるか。
- 手元の Storage に上げたとき、`storage.objects` の metadata がどう作り直されるか。
- illustrations の object を DB のどこが参照しているか。
- 本番の DB の password を今だれが持っているか（reset が要るか）。
