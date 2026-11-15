# P9 集客 — UTM の決まりと受け入れ指標の測り方

対象：P9（集客）。目標は「4週で外部の登録10、週に人の訪問者50。流入の経路ごとに UTM で測れる状態にする」。
この文書は、経路ごとの UTM の付け方、Vercel Web Analytics での見方、受け入れ指標の測り方を決める。コードの正本は `src/lib/share/shareLinks.ts`（共有ボタンの UTM）で、表とコードが食い違う場合はコードを直さず、この文書と一緒に PR で直す（`scripts/test-p9-share-ogp.tsx` が両者の一致を確かめる）。

## 1. UTM の付け方

### 共通の決まり

- 値は半角英小文字・数字・`_` だけ。空白・日本語・個人を特定できる値（利用者名、メール、作品の ID 以外の内部 ID）を入れない。
- `utm_campaign` は施策の単位。共有ボタンは常に `share`。
- `utm_content` は置き場所や投稿の区別に使う（共有ボタンは `work` / `reader`）。
- リンク先は本番の正規 URL（`https://www.syosetu-libread.com/...`）。Reader は「元のページにまとめる」決定に従い、本文の言語の Reader（正規 URL）を共有する。作品ページは、見ている UI 言語の作品ページ（ja・en・ko はどれも正規）を共有する。
- 既にある `utm_*` は置き換える。ほかのクエリは残す。

### 共有ボタン（このPRで実装）

| 押したボタン | utm_source | utm_medium | utm_campaign | utm_content |
|---|---|---|---|---|
| X で共有 | `x` | `social` | `share` | `work` / `reader` |
| LINE で送る | `line` | `social` | `share` | `work` / `reader` |
| Facebook で共有 | `facebook` | `social` | `share` | `work` / `reader` |
| URL をコピー | `copy_link` | `share` | `share` | `work` / `reader` |
| 端末の共有（`navigator.share`） | `web_share` | `share` | `share` | `work` / `reader` |

URL のコピーと端末の共有は、どこに貼られたかが分からないため、`utm_medium=share` にして SNS と分ける。

### 運営が手で貼るリンク（決まりだけ。実装は不要）

| 経路 | utm_source | utm_medium | utm_campaign の例 |
|---|---|---|---|
| 公式 X の投稿 | `x` | `social` | `launch_2026_11`、`pd_weekly` など施策名 |
| 公式 X のプロフィール欄 | `x` | `profile` | `always_on` |
| note・ブログの記事 | `note` / `blog` | `article` | 記事の施策名 |
| Reddit・掲示板 | `reddit` など | `community` | 施策名 |
| メール・ニュースレター | `newsletter` | `email` | 号の名前（例 `nl_2026_11_20`） |
| 語学学習の紹介ページ | 掲載サイト名 | `referral` | `partner` |
| 広告（使う場合） | `x` / `google` など | `cpc` | 広告の施策名（課金は別に承認が要る） |

施策名は `<内容>_<YYYY>_<MM>` のように、後で見て分かる名前にする。

## 2. Vercel Web Analytics での見方

公式ドキュメント（2026-11-15 に確認）：

- UTM Parameters のパネル・絞り込みは「Web Analytics Plus と Enterprise で使える」（https://vercel.com/docs/analytics/filtering）。
- Custom Events（`track()`）は「Pro と Enterprise で使える」（https://vercel.com/docs/analytics/custom-events）。

このプロジェクトの Vercel のプラン・Web Analytics Plus の有無は、このPRの作業では確かめられていない（Vercel の API でチームの情報を読んだが、プランの欄が無かった）。そのため、見方を2通り書く。

### A. Web Analytics Plus がある場合

1. Vercel のダッシュボード → プロジェクト → Analytics → Web Analytics。
2. 期間を「Last 7 days」にする。
3. UTM Parameters のパネルで `utm_source`・`utm_medium`・`utm_campaign` ごとの訪問者数を見る。行を押すと、その経路だけに絞り込める。
4. 絞り込んだまま Pages のパネルで、どのページに来たかを見る。

### B. Web Analytics Plus が無い場合（無料で見られる範囲）

- Referrers のパネルで、参照元のドメインごとの訪問者を見る。X は `t.co`、LINE・Facebook は各ドメインで出る（アプリ内ブラウザでは参照元が付かないことがある）。
- `t.co` の行を押すと、どの投稿のリンクから来たかを辿れる（Twitter Resolver）。
- この場合、UTM は URL に付いたまま記録されないので、経路の内訳は参照元での近似になる。UTM で経路を正確に分けるには、A（有料の追加）か、下の 4 の案（自前の数え方）が要る。どちらも課金・データの扱いに関わるため、オーナーの判断が要る。

## 3. 受け入れの指標の測り方

| 指標 | 目標 | 測り方 | 注意 |
|---|---|---|---|
| 人の訪問者 | 週に 50 | Web Analytics の Visitors（期間 Last 7 days、本番の環境）。 | Web Analytics の訪問者は日ごとの匿名の識別で数える。運営自身の閲覧を除くため、確かめる期間は運営の端末で開かない、または Pages の絞り込みで運営が使うページを除いて見る。ボットの扱いは Vercel 側の仕組みに依る（このPRでは確かめていない）。 |
| 外部の登録 | 4週で 10 | 本番の DB で、期間内に作られた利用者の数を集計だけで数える（個人の行を返さない `count`）。運営・テスト用のアカウントは数えない。経路の内訳は 2 の A または 4 の案で見る。 | 本番の DB への問い合わせは読み取りの集計だけにする。 |
| 7日以内の再訪 | 目標値は未設定（記録する） | B では直接の数字が出ない。近似として、週ごとの Visitors と Page Views の比、または Pages で作品ページ・Reader に2回以上来ているかを見る。正確に測るには 4 の案のイベントが要る。 | 個人を追いかける識別子は作らない。 |

記録は週に1回、`docs/project-state.md` などの既存の場所に、期間・訪問者・登録数・経路の内訳（分かる範囲）を残す。

## 4. 登録の経路を数えるための最小のイベント（案。このPRでは実装しない）

数える内容：「どの UTM 経路から来た人が登録を終えたか」の件数だけ。

- 来訪時：URL に `utm_source`・`utm_medium`・`utm_campaign` があれば、その3つだけを `sessionStorage` に入れる（最初の1回。個人の情報・ID は入れない）。
- 登録の完了時：`track("sign_up", { utm_source, utm_medium, utm_campaign })` を1回送る。値が無ければ `direct`。
- 送らないもの：利用者 ID、メール、表示名、作品の閲覧履歴、IP など、個人を特定しうるもの。

このPRで実装しなかった理由：

1. Custom Events は Pro 以上で使える（2 の公式ドキュメント）。このプロジェクトのプランが確かめられておらず、Hobby なら送っても記録されない。プランの変更は課金に当たり、オーナーの判断が要る。
2. 登録の完了は P7（認証・同意）の画面と処理にある。直近の #206・#208 で変えたばかりで、ここに計測を足すのは認証の境界に触れる変更として、別の PR と独立レビューで扱うのが安全。
3. 無料の代わりの案：イベントを使わず、登録の画面（`/register`）への流入を Referrers で見て、登録数は DB の集計で数える（3 の表）。経路の内訳は近似になる。

## 5. 作品ごとの OGP の画像

- 作品の画像は `src/app/works/[seriesId]/opengraph-image.tsx`。題名と作者（Public Domain は原作者）を描く。作品ページ（ja・en・ko）と Reader の `og:image`・`twitter:image` は、この画像を指す。
- R18・非公開・公開話が無い作品は、共通の画像（`src/app/opengraph-image.tsx` と同じ図柄）にする。閲覧者の R18 の設定には依らない（画像は Cookie を見ない）。
- 外部の書体は読み込まない。next/og（Satori）に入っている書体は Geist Regular だけで、それに無い文字（日本語・韓国語・中国語・絵文字など）を描こうとすると、@vercel/og が描く時に `fonts.googleapis.com` から Noto の書体を取りに行く（`node_modules/next/dist/compiled/@vercel/og/index.node.js` の `loadDynamicAsset`、実際に fetch を止めて確かめた）。これを避けるため、Geist で描ける文字だけの題名に限って題名を描き、それ以外は共通の画像にする。日本語・韓国語の題名を描く方法は PR の本文に書く。
- 画像の cache は `max-age=300, s-maxage=300, stale-while-revalidate=300` にする（next/og の既定より短くする）。作品が非公開・R18 に変わった後、このサイトの画像が共通の画像に変わるまでは、CDN の stale-while-revalidate を含めて最大でおよそ10分かかる。X・LINE・Facebook など外部のサービスが取り込んだカードの画像は、それぞれの側の cache に別に何日も残りうる（こちらからは消せない。各サービスの再取得の機能に依る）。
