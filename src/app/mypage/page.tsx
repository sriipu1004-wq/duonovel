import Link from "next/link";
import { requireLoggedInUser } from "@/lib/auth/requireLoggedInUser";
import {
  ProfileSeriesSection,
  buildAuthorPageHref,
  buildAuthorSeriesCards,
  fetchAuthorById,
  fetchSeriesByAuthorId,
  resolveAuthorBio,
  resolveAuthorName,
} from "@/features/authorProfile/authorProfileShared";
import BookmarkedSeriesList from "@/features/bookmark/BookmarkedSeriesList";
import MyPageHeroEditable from "./MyPageHeroEditable";

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
    <article className="rounded-[28px] border border-white/10 bg-black/20 p-5">
      <p className="text-xs tracking-[0.18em] text-neutral-500">{eyebrow}</p>
      <h2 className="mt-2 text-xl font-semibold text-white">{title}</h2>
      <p className="mt-3 text-sm leading-7 text-neutral-400">{description}</p>

      <div className="mt-5">
        <Link
          href={href}
          className="inline-flex rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
        >
          {cta}
        </Link>
      </div>
    </article>
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
    <main className="min-h-screen bg-[#0a0a0a] text-neutral-100">
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-4 text-sm text-neutral-500">
          <span className="text-neutral-300">マイページ</span>
        </div>

        <MyPageHeroEditable
          userId={user.id}
          fallbackEmail={signedInLabel}
          initialDisplayName={initialDisplayName}
          eyebrow="LIB read MYPAGE"
          description={`${authorBio}

ここは公開作者ページとは別の、本人用活動ハブ。
プロフィール表現と作品一覧の土台は作者ページと揃えつつ、
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

          <ProfileSeriesSection
            eyebrow="MY SERIES"
            title="自分の作品一覧"
            description="ここでは自分の作品を、公開前のものも含めてまとめて確認する。作品ごとの実作業は作品ワークスペースへ寄せ、本文編集はそこから各話ページへ進める。"
            cards={seriesCards}
            emptyMessage="まだ作品がない。まずは作品ワークスペース一覧から1本目を作成する。"
            mode="private"
            headerAction={{
              href: "/write",
              label: "ワークスペース一覧へ",
            }}
          />

          <section className="rounded-[28px] border border-white/10 bg-black/20 p-5">
            <p className="text-xs tracking-[0.18em] text-neutral-500">BOOKMARKS</p>
            <h2 className="mt-2 text-xl font-semibold text-white">ブックマーク作品</h2>
            <p className="mt-3 text-sm leading-7 text-neutral-400">
              作品ページからブックマークした作品をここでまとめて確認する。
              BGM のお気に入りとは別に、作品保存はブックマークとして扱う。
            </p>

            <BookmarkedSeriesList userId={user.id} />
          </section>
        </div>
      </div>
    </main>
  );
}