import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import AuthorFollowCard from "@/features/authorProfile/AuthorFollowCard";
import AuthorProfileLists, { type AuthorWork } from "@/features/authorProfile/AuthorProfileLists";
import {
  ProfileHero,
  buildAuthorSeriesCards,
  fetchAuthorById,
  fetchSeriesByAuthorId,
  getProfileSeriesSummary,
  resolveAuthorBio,
  resolveAuthorName,
  resolveAuthorNoteUrl,
  resolveAuthorXUrl,
} from "@/features/authorProfile/authorProfileShared";
import { fetchAuthorFollowSnapshot } from "@/lib/authorFollow";
import { buildSeriesPopularityMap, fetchSeriesPopularityDataset } from "@/lib/popularity";
import { isEpisodePubliclyVisible, pickText, type EpisodeRow } from "@/features/write/writeShared";

type PageProps = { params: Promise<{ authorId: string }> };
type RecordingRow = Record<string, unknown> & { id: string; series_id?: string | null; seriesId?: string | null; reader_name?: string | null; narrator_name?: string | null; display_name?: string | null; speaker_name?: string | null; is_public?: boolean | null; public?: boolean | null; like_count?: number | null; likes_count?: number | null; play_count?: number | null; plays_count?: number | null };

function decode(value: string) { try { return decodeURIComponent(value); } catch { return value; } }
function numberValue(value: unknown) { const parsed = Number(value ?? 0); return Number.isFinite(parsed) ? parsed : 0; }
function readerName(row: RecordingRow) { return pickText(row.reader_name, row.narrator_name, row.display_name, row.speaker_name); }
function isLegacy(row: RecordingRow) { const name = readerName(row); return name.startsWith("Aivis ") || name.startsWith("VOICEVOX Nemo"); }
function isPublic(row: RecordingRow) { return row.is_public !== false && row.public !== false && !isLegacy(row); }
function seriesId(row: RecordingRow) { return pickText(row.series_id, row.seriesId); }

export default async function AuthorPage({ params }: PageProps) {
  const { authorId: rawAuthorId } = await params;
  const authorId = decode(rawAuthorId);
  if (authorId.startsWith("aivis:") || authorId.startsWith("nemo:")) notFound();
  const admin = createAdminClient();
  const auth = await createServerClient();
  const [author, series, authResult, recordingA, recordingB] = await Promise.all([
    fetchAuthorById(authorId, admin),
    fetchSeriesByAuthorId(authorId, admin),
    auth.auth.getUser(),
    admin.from("recordings").select("*").eq("reader_id", authorId),
    admin.from("recordings").select("*").eq("reader_user_id", authorId),
  ]);
  if (!author) notFound();
  const currentUser = authResult.data.user;
  const isOwnPage = currentUser?.id === authorId;
  const cards = await buildAuthorSeriesCards(series, admin);
  const publicCards = cards.filter((card) => card.publishedCount > 0);
  const popularity = buildSeriesPopularityMap(await fetchSeriesPopularityDataset(publicCards.map((card) => card.series.id)));
  const works: AuthorWork[] = publicCards.map((card) => ({ id: card.series.id, title: pickText(card.series.title) || "無題", summary: getProfileSeriesSummary(card.series), episode: card.firstPublishedEpisodeNumber, updatedAt: pickText(card.series.updated_at, card.series.created_at), popularity: popularity.get(card.series.id)?.popularityScore ?? 0 }));

  const recordings = new Map<string, RecordingRow>();
  for (const row of [...(recordingA.data ?? []), ...(recordingB.data ?? [])] as RecordingRow[]) if (row.id && isPublic(row)) recordings.set(row.id, row);
  const narrationIds = Array.from(new Set(Array.from(recordings.values()).map(seriesId).filter(Boolean)));
  const [narrationSeriesResult, narrationEpisodesResult] = await Promise.all([
    narrationIds.length ? admin.from("series").select("*").in("id", narrationIds) : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    narrationIds.length ? admin.from("episodes").select("*").in("series_id", narrationIds) : Promise.resolve({ data: [] as EpisodeRow[] }),
  ]);
  const narrationSeriesMap = new Map((narrationSeriesResult.data ?? []).map((row: Record<string, unknown>) => [String(row.id), row]));
  const firstEpisodeMap = new Map<string, number>();
  for (const episode of (narrationEpisodesResult.data ?? []) as EpisodeRow[]) {
    if (!isEpisodePubliclyVisible(episode, new Date())) continue;
    const id = pickText(episode.series_id, episode.seriesId); const number = Number(episode.episode_number ?? episode.episodeNumber ?? 0);
    if (!id || !Number.isFinite(number) || number <= 0) continue;
    const current = firstEpisodeMap.get(id); if (current === undefined || number < current) firstEpisodeMap.set(id, number);
  }
  const narrationMap = new Map<string, AuthorWork>();
  for (const row of recordings.values()) {
    const id = seriesId(row); const source = narrationSeriesMap.get(id); if (!id || !source) continue;
    const item = narrationMap.get(id) ?? { id, title: pickText(source.title) || "無題", summary: pickText(source.summary, source.description, source.catch_copy) || "あらすじはまだ登録されていない。", episode: firstEpisodeMap.get(id) ?? null, updatedAt: pickText(source.updated_at, source.created_at), popularity: 0, narrationCount: 0, likes: 0, plays: 0 };
    item.narrationCount = (item.narrationCount ?? 0) + 1; item.likes = (item.likes ?? 0) + numberValue(row.like_count ?? row.likes_count); item.plays = (item.plays ?? 0) + numberValue(row.play_count ?? row.plays_count); item.popularity = (item.plays ?? 0) + (item.likes ?? 0) * 10; narrationMap.set(id, item);
  }
  const follow = !isOwnPage ? await fetchAuthorFollowSnapshot({ supabase: admin, authorId, currentUserId: currentUser?.id ?? null }) : null;
  const xUrl = resolveAuthorXUrl(author); const noteUrl = resolveAuthorNoteUrl(author);

  return <main className="min-h-screen bg-white text-black"><div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8"><div className="mb-4 text-sm text-neutral-500"><Link href="/" className="hover:text-black">TOP</Link><span className="mx-2">/</span><span className="text-neutral-700">作者ページ</span></div><ProfileHero eyebrow="AUTHOR" title={resolveAuthorName(author)} description={resolveAuthorBio(author)} actions={isOwnPage ? [{ href: "/mypage", label: "マイページへ", tone: "primary" as const }, { href: "/write", label: "作品ワークスペースへ" }] : []} extraContent={<div className="grid gap-3">{xUrl || noteUrl ? <div className="flex flex-wrap gap-2">{xUrl ? <a href={xUrl} target="_blank" rel="noreferrer" className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm text-neutral-800 transition hover:bg-neutral-50">X</a> : null}{noteUrl ? <a href={noteUrl} target="_blank" rel="noreferrer" className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm text-neutral-800 transition hover:bg-neutral-50">note</a> : null}</div> : null}{follow ? <AuthorFollowCard authorId={authorId} isOwnPage={false} initialFollowerCount={follow.followerCount} initialFollowingCount={follow.followingCount} initialIsFollowing={follow.isFollowing} /> : null}</div>} surface="light" /><AuthorProfileLists authorId={authorId} works={works} narrations={Array.from(narrationMap.values())} /></div></main>;
}
