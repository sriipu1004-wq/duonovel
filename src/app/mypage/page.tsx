import Link from "next/link";
import { requireLoggedInUser } from "@/lib/auth/requireLoggedInUser";
import {
  ProfileHero,
  ProfileSeriesSection,
  buildAuthorPageHref,
  buildAuthorSeriesCards,
  fetchAuthorById,
  fetchSeriesByAuthorId,
  resolveAuthorBio,
  resolveAuthorName,
} from "@/features/authorProfile/authorProfileShared";

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

function FutureSlotCard({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <article className="rounded-[24px] border border-dashed border-white/10 bg-white/[0.03] p-4">
      <p className="text-sm font-semibold text-white">{title}</p>
      <p className="mt-2 text-sm leading-7 text-neutral-400">{description}</p>
      <p className="mt-3 text-xs tracking-[0.18em] text-neutral-500">
        PREPARED SLOT
      </p>
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

  const totalEpisodes = seriesCards.reduce(
    (sum, card) => sum + card.totalEpisodes,
    0
  );

  const totalPublished = seriesCards.reduce(
    (sum, card) => sum + card.publishedCount,
    0
  );

  const authorName = resolveAuthorName(author, user.email);
  const authorBio = resolveAuthorBio(author);
  const signedInLabel = user.email ?? "ログイン中";

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-neutral-100">
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-4 text-sm text-neutral-500">
          <span className="text-neutral-300">マイページ</span>
        </div>

        <ProfileHero
          eyebrow="LIB read MYPAGE"
          title={authorName}
          description={`${authorBio}

ここは公開作者ページとは別の、本人用活動ハブ。
プロフィール表現と作品一覧の土台は作者ページと揃えつつ、執筆、管理、朗読、新規作成の導線はこのページ側へ集約する。`}
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
            { href: "/write", label: "執筆ページへ" },
            { href: "/manage", label: "管理トップへ" },
            { href: "/record", label: "朗読ページへ" },
            { href: "/write/series/new", label: "新しい作品を作る" },
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
          notice="公開プロフィールとして見せる面は /authors/[authorId] に残し、本人専用の行動導線は /mypage に残す。"
        />

        <div className="mt-6 grid gap-6">
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <EntryCard
              eyebrow="WRITE"
              title="執筆ページ"
              description="作品作成、話追加、本文編集など、執筆作業そのものは既存の /write に寄せる。"
              href="/write"
              cta="執筆ページを開く"
            />

            <EntryCard
              eyebrow="MANAGE"
              title="管理トップ"
              description="BGM、タグ、朗読許可などの作品管理は既存の /manage に寄せる。"
              href="/manage"
              cta="管理トップを開く"
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
            description="ここでは自分の作品を、公開前のものも含めてまとめて確認する。公開作品としての見え方は作者ページ側に寄せる。"
            cards={seriesCards}
            emptyMessage="まだ作品がない。まずは「新しい作品を作る」から1本目を作成する。"
            mode="private"
            headerAction={{
              href: "/write/series/new",
              label: "作品を追加",
            }}
          />

          <section className="rounded-[28px] border border-white/10 bg-black/20 p-5">
            <p className="text-xs tracking-[0.18em] text-neutral-500">
              FUTURE SLOTS
            </p>
            <h2 className="mt-2 text-xl font-semibold text-white">
              今後ここに載せる予定のもの
            </h2>
            <p className="mt-3 text-sm leading-7 text-neutral-400">
              今回は土台共通化までに絞る。
              本体未着手のものだけを Future Slot として残し、本人用の拡張受け皿にする。
            </p>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <FutureSlotCard
                title="ブックマーク"
                description="お気に入り作品や途中まで読んだ作品の一覧を、将来的にここへ載せられるようにする。"
              />
              <FutureSlotCard
                title="評価 / レビュー"
                description="自分が付けた評価やレビュー履歴を、将来的にここへ整理して載せられるようにする。"
              />
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}