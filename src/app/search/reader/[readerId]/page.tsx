import Link from "next/link";
import PublicWorkBoardCard from "@/components/public/PublicWorkBoardCard";
import { createAdminClient } from "@/lib/supabase/admin";
import { pickText } from "@/features/write/writeShared";

type Props = { params: Promise<{ readerId: string }>; searchParams?: Promise<{ order?: string }> };
type Row = Record<string, unknown> & { id: string };
const text = (...values: unknown[]) => values.find((value) => typeof value === "string" && value.trim()) as string | undefined;
const count = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const time = (value: string) => { const parsed = new Date(value).getTime(); return Number.isNaN(parsed) ? 0 : parsed; };

export default async function ReaderSearchPage({ params, searchParams }: Props) {
  const { readerId } = await params;
  const query = searchParams ? await searchParams : undefined;
  const order = query?.order === "popular" ? "popular" : "updated";
  const db = createAdminClient();
  const [first, second] = await Promise.all([db.from("recordings").select("*").eq("reader_id", readerId), db.from("recordings").select("*").eq("reader_user_id", readerId)]);
  const recordings = new Map<string, Row>();
  for (const row of [...(first.data ?? []), ...(second.data ?? [])] as Row[]) {
    const name = text(row.reader_name, row.narrator_name, row.display_name, row.speaker_name) ?? "";
    if (row.id && row.is_public !== false && row.public !== false && !name.startsWith("Aivis ") && !name.startsWith("VOICEVOX Nemo")) recordings.set(row.id, row);
  }
  const ids = [...new Set([...recordings.values()].map((row) => text(row.series_id, row.seriesId) ?? "").filter(Boolean))];
  const { data } = ids.length ? await db.from("series").select("*").in("id", ids) : { data: [] as Row[] };
  const series = new Map((data ?? []).map((row: Row) => [String(row.id), row]));
  const works = new Map<string, { id: string; title: string; summary: string; updatedAt: string; count: number; likes: number; plays: number; tags: string[] }>();
  for (const row of recordings.values()) {
    const id = text(row.series_id, row.seriesId) ?? ""; const source = series.get(id); if (!id || !source) continue;
    const item = works.get(id) ?? { id, title: text(source.title) ?? "無題", summary: text(source.summary, source.description, source.catch_copy) ?? "あらすじはまだ登録されていない。", updatedAt: text(source.updated_at, source.created_at) ?? "", count: 0, likes: 0, plays: 0, tags: Array.isArray(source.tags) ? source.tags.map(String) : [] };
    item.count += 1; item.likes += count(row.like_count ?? row.likes_count); item.plays += count(row.play_count ?? row.plays_count); works.set(id, item);
  }
  const sorted = [...works.values()].sort((a, b) => order === "popular" ? (b.plays + b.likes * 10) - (a.plays + a.likes * 10) : time(b.updatedAt) - time(a.updatedAt));
  return <main className="min-h-screen bg-white text-black"><div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8"><p className="text-sm text-neutral-500">朗読作品一覧</p><div className="mt-6 flex flex-wrap items-end justify-between gap-4 border-b border-black/10 pb-4"><div><p className="text-xs tracking-[0.18em] text-neutral-500">NARRATIONS</p><h1 className="mt-2 text-2xl font-semibold">この朗読者の公開作品</h1></div><div className="flex gap-2 text-sm"><Link href={`/search/reader/${encodeURIComponent(readerId)}?order=updated`} className={order === "updated" ? "rounded-full bg-black px-4 py-2 text-white" : "rounded-full border border-black/10 px-4 py-2"}>更新順</Link><Link href={`/search/reader/${encodeURIComponent(readerId)}?order=popular`} className={order === "popular" ? "rounded-full bg-black px-4 py-2 text-white" : "rounded-full border border-black/10 px-4 py-2"}>人気順</Link></div></div>{sorted.length ? <div className="mt-6 grid gap-3 md:grid-cols-2">{sorted.map((work) => <PublicWorkBoardCard key={work.id} title={work.title} workHref={`/works/${work.id}`} authorName={`朗読 ${work.count}件 / いいね ${work.likes} / 再生 ${work.plays}`} latestPostedLabel={work.updatedAt} summary={work.summary} tags={work.tags} />)}</div> : <div className="mt-6 rounded-[28px] border border-dashed border-black/15 bg-neutral-50 p-6 text-sm text-neutral-600">まだ公開中の朗読作品がない。</div>}</div></main>;
}
