import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { supabase } from "@/lib/supabaseClient";
import {
  ProfileHero,
  ProfileSeriesSection,
  buildAuthorSeriesCards,
  fetchAuthorById,
  fetchSeriesByAuthorId,
  resolveAuthorBio,
  resolveAuthorName,
} from "@/features/authorProfile/authorProfileShared";

type PageProps = {
  params: Promise<{ authorId: string }>;
};

export default async function AuthorPage({ params }: PageProps) {
  const { authorId } = await params;

  const [author, works, authSupabase] = await Promise.all([
    fetchAuthorById(authorId, supabase),
    fetchSeriesByAuthorId(authorId, supabase),
    createServerClient(),
  ]);

  const seriesCards = await buildAuthorSeriesCards(works, supabase);
  const publicSeriesCards = seriesCards.filter((card) => card.publishedCount > 0);

  if (!author && publicSeriesCards.length === 0) {
    notFound();
  }

  const {
    data: { user: currentUser },
  } = await authSupabase.auth.getUser();

  const isOwnPage = currentUser?.id === authorId;

  const authorName = resolveAuthorName(author);
  const authorBio = resolveAuthorBio(author);

  const totalPublishedEpisodes = publicSeriesCards.reduce(
    (sum, card) => sum + card.publishedCount,
    0
  );

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-neutral-100">
      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-4 text-sm text-neutral-500">
          <Link href="/" className="hover:text-neutral-300">
            TOP
          </Link>
          <span className="mx-2">/</span>
          <span className="text-neutral-300">作者ページ</span>
        </div>

        <ProfileHero
          eyebrow="AUTHOR"
          title={authorName}
          description={`${authorBio}

ここは公開プロフィールと公開作品一覧を見せるページ。
本人専用の執筆、管理、朗読導線はマイページ側に寄せ、公開面と本人面を分けたまま土台だけ共通化する。`}
          badges={[
            { label: "公開面" },
            ...(isOwnPage ? [{ label: "自分の公開ページ" }] : []),
          ]}
          actions={[
            { href: "/", label: "TOPへ" },
            ...(isOwnPage
              ? [
                  { href: "/mypage", label: "マイページへ", tone: "primary" as const },
                  { href: "/write", label: "執筆ページへ" },
                ]
              : []),
          ]}
          stats={[
            {
              label: "PUBLIC SERIES",
              value: publicSeriesCards.length,
              sub: "公開中の話を持つ作品数",
            },
            {
              label: "PUBLIC EPISODES",
              value: totalPublishedEpisodes,
              sub: "公開中の話数合計",
            },
            {
              label: "SURFACE",
              value: "PUBLIC",
              sub: "ここは他人から見える公開面",
            },
          ]}
          notice={
            isOwnPage
              ? "このページは公開面。執筆、管理、朗読、新規作成など本人専用の行動導線は /mypage に残す。"
              : undefined
          }
        />

        <div className="mt-6">
          <ProfileSeriesSection
            eyebrow="WORKS"
            title="この作者の公開作品"
            description="公開中の話が1つ以上ある作品だけをここに出す。本人用の下書き把握や管理導線はマイページ側へ寄せる。"
            cards={publicSeriesCards}
            emptyMessage="まだ公開作品がない。"
            mode="public"
          />
        </div>
      </div>
    </main>
  );
}