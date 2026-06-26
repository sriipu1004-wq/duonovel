import Link from "next/link";
import { notFound } from "next/navigation";
import PublicWorkBoardCard from "@/components/public/PublicWorkBoardCard";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildAuthorSeriesCards, fetchAuthorById, fetchSeriesByAuthorId, getProfileSeriesSummary, resolveAuthorName } from "@/features/authorProfile/authorProfileShared";
import { buildSeriesPopularityMap, fetchSeriesPopularityDataset } from "@/lib/popularity";
import { pickText } from "@/features/write/writeShared";

type Props = { params: Promise<{ authorId: string }>; searchParams?: Promise<{ order?: string }> };
function time(value: string) { const parsed = new Date(value).getTime(); return Number.isNaN(parsed) ? 0 : parsed; }

export default async function AuthorSearchPage({ params, searchParams }: Props) {
  const { authorId } = await params;
  const query = searchParams ? await searchParams : undefined;
  const order = query?.order === "popular" ? "popular" : "updated";
  const db = createAdminClient();
  const [author, series] = await Promise.all([fetchAuthorById(authorId, db), fetchSeriesByAuthorId(authorId, db)]);
  if (!author) notFound();
  const cards = (await buildAuthorSeriesCards(series, db)).filter((card) => card.publishedCount > 0);
  const popularity = buildSeriesPopularityMap(await fetchSeriesPopularityDataset(cards.map((card) => card.series.id)));
  const works = [...cards].sort((a, b) => order === "popular" ? (popularity.get(b.series.id)?.popularityScore ?? 0) - (popularity.get(a.series.id)?.popularityScore ?? 0) : time(pickText(b.series.updated_at, b.series.created_at)) - time(pickText(a.series.updated_at, a.series.created_at)));

  return <main className="min-h-screen bg-white text-black"><div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8"><p className="text-sm text-neutral-500"><Link href={`/authors/${encodeURIComponent(authorId)}`}>作者ページ</Link><span className="mx-2">/</span>公開作品</p><div className="mt-6 flex flex-wrap items-end justify-between gap-4 border-b border-black/10 pb-4"><div><p className="text-xs tracking-[0.18em] text-neutral-500">AUTHOR WORKS</p><h1 className="mt-2 text-2xl font-semibold">{resolveAuthorName(author)} の公開作品</h1></div><div className="flex gap-2 text-sm"><Link href={`/search/author/${encodeURIComponent(authorId)}?order=updated`} className={order === "updated" ? "rounded-full bg-black px-4 py-2 text-white" : "rounded-full border border-black/10 px-4 py-2"}>更新順</Link><Link href={`/search/author/${encodeURIComponent(authorId)}?order=popular`} className={order === "popular" ? "rounded-full bg-black px-4 py-2 text-white" : "rounded-full border border-black/10 px-4 py-2"}>人気順</Link></div></div>{works.length ? <div className="mt-6 grid gap-3 md:grid-cols-2">{works.map((card) => <PublicWorkBoardCard key={card.series.id} title={pickText(card.series.title) || "無題"} workHref={`/works/${card.series.id}`} authorName={resolveAuthorName(author)} authorHref={`/authors/${encodeURIComponent(authorId)}`} latestPostedLabel={pickText(card.series.updated_at, card.series.created_at)} summary={getProfileSeriesSummary(card.series)} firstReadHref={card.firstPublishedEpisodeNumber ? `/read/${card.series.id}/${card.firstPublishedEpisodeNumber}` : undefined} tags={Array.isArray(card.series.tags) ? card.series.tags.map(String) : []} />)}</div> : <div className="mt-6 rounded-[28px] border border-dashed border-black/15 bg-neutral-50 p-6 text-sm text-neutral-600">まだ公開作品がない。</div>}</div></main>;
}
