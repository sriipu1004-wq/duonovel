import Link from "next/link";
import { requireLoggedInUser } from "@/lib/auth/requireLoggedInUser";
import {
  buildAuthorPageHref,
  buildAuthorSeriesCards,
  buildReadHref,
  buildWorksHref,
  fetchAuthorById,
  fetchSeriesByAuthorId,
  getProfileSeriesSummary,
  resolveAuthorBio,
  resolveAuthorName,
  type AuthorSeriesCard,
} from "@/features/authorProfile/authorProfileShared";
import BookmarkedSeriesList from "@/features/bookmark/BookmarkedSeriesList";
import MyPageHeroEditable from "./MyPageHeroEditable";
import AccountSettingsCard from "./AccountSettingsCard";

function EntryCard({
  eyebrow,
  title,
  description,
  href,
  cta,
}: {
  eyebrow: string;
  title: string;
  description: string;
  href: string;
  cta: string;
}) {
  return (
    <article className="rounded-[28px] border border-black/10 bg-white p-5 shadow-sm">
      <p className="text-xs tracking-[0.18em] text-neutral-500">{eyebrow}</p>
      <h2 className="mt-2 text-xl font-semibold text-black">{title}</h2>
      <p className="mt-3 text-sm leading-7 text-neutral-600">{description}</p>

      <div className="mt-5">
        <Link
          href={href}
          className="inline-flex rounded-full border border-black/10 bg-white px-5 py-3 text-sm text-neutral-800 transition hover:bg-neutral-50"
        >
          {cta}
        </Link>
      </div>
    </article>
  );
}

function MySeriesSection({ cards }: { cards: AuthorSeriesCard[] }) {
  return (
    <section className="rounded-[28px] border border-black/10 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs tracking-[0.18em] text-neutral-500">MY SERIES</p>
          <h2 className="mt-2 text-xl font-semibold text-black">自分の作品一覧</h2>
          <p className="mt-3 text-sm leading-7 text-neutral-600">
            ここでは自分の作品を、公開前のものも含めてまとめて確認する。
            作品ごとの実作業は作品ワークスペースへ寄せ、本文編集はそこから各話ページへ進める。
          </p>
        </div>

        <Link
          href="/write"
          className="rounded-full border border-black/10 bg-white px-5 py-3 text-sm text-neutral-800 transition hover:bg-neutral-50"
        >
          ワークスペース一覧へ
        </Link>
      </div>

      <div className="mt-4 grid gap-4">
        {cards.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-black/15 bg-neutral-50 px-4 py-4 text-sm leading-7 text-neutral-600">
            まだ作品がない。まずは作品ワークスペース一覧から1本目を作成する。
          </div>
        ) : (
          cards.map((card) => {
            const titleText =
              typeof card.series.title === "string" && card.series.title.trim().length > 0
                ? card.series.title
                : "無題";
            const summary = getProfileSeriesSummary(card.series);

            return (
              <article
                key={card.series.id}
                className="rounded-[28px] border border-black/10 bg-white p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="max-w-3xl">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-xs tracking-[0.18em] text-neutral-500">SERIES</p>
                      <span className="rounded-full border border-black/10 bg-neutral-50 px-3 py-1 text-xs text-neutral-600">
                        総話数 {card.totalEpisodes}
                      </span>
                      <span className="rounded-full border border-black/10 bg-neutral-50 px-3 py-1 text-xs text-neutral-600">
                        公開中 {card.publishedCount}
                      </span>
                      <span className="rounded-full border border-black/10 bg-neutral-50 px-3 py-1 text-xs text-neutral-600">
                        最新話{" "}
                        {card.latestEpisodeNumber !== null
                          ? `第${card.latestEpisodeNumber}話`
                          : "未作成"}
                      </span>
                    </div>

                    <h3 className="mt-2 text-2xl font-semibold text-black">{titleText}</h3>
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-neutral-600">
                      {summary}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <Link
                      href={`/write/series/${card.series.id}`}
                      className="rounded-full bg-black px-4 py-2 text-sm font-semibold text-white transition hover:bg-neutral-800"
                    >
                      作品ワークスペースへ
                    </Link>

                    <Link
                      href={buildWorksHref(card.series.id)}
                      className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm text-neutral-800 transition hover:bg-neutral-50"
                    >
                      作品ページへ
                    </Link>

                    {card.firstPublishedEpisodeNumber !== null ? (
                      <Link
                        href={buildReadHref(card.series.id, card.firstPublishedEpisodeNumber)}
                        className="rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-sm text-black transition hover:bg-sky-100"
                      >
                        公開中の第1話を見る
                      </Link>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}

export default async function MyPage() {
  const { supabase, user } = await requireLoggedInUser("/mypage");

  const [author, ownedSeries] = await Promise.all([
    fetchAuthorById(user.id, supabase),
    fetchSeriesByAuthorId(user.id, supabase),
  ]);

  const seriesCards = await buildAuthorSeriesCards(ownedSeries, supabase);

  const totalEpisodes = seriesCards.reduce((sum, card) => sum + card.totalEpisodes, 0);
  const totalPublished = seriesCards.reduce((sum, card) => sum + card.publishedCount, 0);

  const authorName = resolveAuthorName(author, user.email);
  const authorBio = resolveAuthorBio(author);
  const signedInLabel = user.email ?? "ログイン中";

  const rawDisplayName =
    typeof author?.display_name === "string" ? author.display_name : "";

  const initialDisplayName =
    rawDisplayName.trim().length > 0
      ? rawDisplayName
      : authorName !== signedInLabel
        ? authorName
        : "";

  return (
    <main className="min-h-screen bg-white text-black">
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-4 text-sm text-neutral-500">
          <Link href="/" className="hover:text-black">
            TOP
          </Link>
          <span className="mx-2">/</span>
          <span className="text-neutral-700">マイページ</span>
        </div>

        <MyPageHeroEditable
          userId={user.id}
          fallbackEmail={signedInLabel}
          initialDisplayName={initialDisplayName}
          eyebrow="LIB READ MYPAGE"
          description={`${authorBio}

ここは公開作者ページとは別の、本人用活動ハブ。
プロフィール表現と作品一覧の土台は作者ページと分けつつ、
作者向け実作業は作品ワークスペースへ寄せる。
作品一覧から目的の作品ワークスペースへ入る運用を主導線にする。`}
          badges={[
            { label: "本人面" },
            { label: `signed in: ${signedInLabel}` },
          ]}
          actions={[
            {
              href: buildAuthorPageHref(user.id),
              label: "公開作者ページを見る",
              tone: "primary",
            },
            { href: "/write", label: "作品ワークスペース一覧へ" },
            { href: "/record", label: "朗読ページへ" },
          ]}
          stats={[
            {
              label: "OWNED SERIES",
              value: seriesCards.length,
              sub: "自分が持っている作品数",
            },
            {
              label: "TOTAL EPISODES",
              value: totalEpisodes,
              sub: "全作品の話数合計",
            },
            {
              label: "PUBLISHED",
              value: totalPublished,
              sub: "公開中の話数合計",
            },
          ]}
          notice="公開プロフィールとして見せる面は /authors/[authorId] に残し、本人専用の作業入口は作品ワークスペース一覧から各作品へつなぐ。"
        />

        <div className="mt-6 grid gap-6">
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <EntryCard
              eyebrow="WORKSPACE"
              title="作品ワークスペース一覧"
              description="作品作成、作品ごとの作業開始、次話追加、本文編集への入口は /write に寄せる。作者向け実作業の主導線はここ。"
              href="/write"
              cta="ワークスペース一覧を開く"
            />

            <EntryCard
              eyebrow="RECORD"
              title="朗読ページ"
              description="朗読可能作品の確認、承認制作品への申請、申請状況確認、制作開始は /record に集約する。"
              href="/record"
              cta="朗読ページを開く"
            />

            <EntryCard
              eyebrow="PUBLIC PROFILE"
              title="公開作者ページ"
              description="他の読者から見える自分の公開面を確認する。公開プロフィール表現は作者ページ側で育てる。"
              href={buildAuthorPageHref(user.id)}
              cta="公開作者ページを見る"
            />
          </section>

          <MySeriesSection cards={seriesCards} />

          <section className="rounded-[28px] border border-black/10 bg-white p-5 shadow-sm">
            <p className="text-xs tracking-[0.18em] text-neutral-500">BOOKMARKS</p>
            <h2 className="mt-2 text-xl font-semibold text-black">ブックマーク作品</h2>
            <p className="mt-3 text-sm leading-7 text-neutral-600">
              作品ページからブックマークした作品をここでまとめて確認する。
              BGM のお気に入りとは別に、作品保存はブックマークとして扱う。
            </p>

            <BookmarkedSeriesList userId={user.id} surface="light" />
          </section>
          <AccountSettingsCard />
        </div>
      </div>
    </main>
  );
}