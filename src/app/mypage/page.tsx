import Link from "next/link";
import { requireLoggedInUser } from "@/lib/auth/requireLoggedInUser";
import {
  buildAuthorPageHref,
  buildAuthorSeriesCards,
  fetchAuthorById,
  fetchSeriesByAuthorId,
  resolveAuthorName,
} from "@/features/authorProfile/authorProfileShared";
import BookmarkedSeriesList from "@/features/bookmark/BookmarkedSeriesList";
import MyPageHeroEditable from "./MyPageHeroEditable";
import AccountSettingsCard from "./AccountSettingsCard";
import SavedSearchLinksSection from "./SavedSearchLinksSection";
import MySeriesSection from "./MySeriesSection";
import { createAdminClient } from "@/lib/supabase/admin";

function readAuthMetadataText(metadata: unknown, key: string): string {
  if (!metadata || typeof metadata !== "object") return "";
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" ? value.trim() : "";
}

function readAuthMetadataDisplayName(metadata: unknown): string {
  if (!metadata || typeof metadata !== "object") return "";
  const values = metadata as Record<string, unknown>;
  const candidates = [
    values.display_name,
    values.displayName,
    values.display_name_candidate,
    values.name,
    values.full_name,
  ];
  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    const text = candidate.trim();
    if (text.length > 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) return text;
  }
  return "";
}

export default async function MyPage() {
  const { supabase, user } = await requireLoggedInUser("/mypage");
  const adminSupabase = createAdminClient();
  const [author, ownedSeries] = await Promise.all([
    fetchAuthorById(user.id, adminSupabase),
    fetchSeriesByAuthorId(user.id, supabase),
  ]);
  const seriesCards = await buildAuthorSeriesCards(ownedSeries, supabase);
  const metadataDisplayName = readAuthMetadataDisplayName(user.user_metadata);
  const authorName = resolveAuthorName(author, metadataDisplayName);
  const initialBio =
    typeof author?.bio === "string" && author.bio.trim().length > 0
      ? author.bio
      : typeof author?.profile === "string" && author.profile.trim().length > 0
        ? author.profile
        : typeof author?.description === "string" && author.description.trim().length > 0
          ? author.description
          : "";
  const initialXUrl =
    typeof author?.x_url === "string" && author.x_url.trim().length > 0
      ? author.x_url
      : typeof author?.xUrl === "string" && author.xUrl.trim().length > 0
        ? author.xUrl
        : "";
  const initialNoteUrl =
    typeof author?.note_url === "string" && author.note_url.trim().length > 0
      ? author.note_url
      : typeof author?.noteUrl === "string" && author.noteUrl.trim().length > 0
        ? author.noteUrl
        : "";
  const initialLinkLabels = [
    readAuthMetadataText(user.user_metadata, "profile_link_1_label"),
    readAuthMetadataText(user.user_metadata, "profile_link_2_label"),
  ];
  const signedInLabel = metadataDisplayName || user.email || "ログイン中";
  const rawDisplayName = typeof author?.display_name === "string" ? author.display_name : "";
  const initialDisplayName =
    rawDisplayName.trim().length > 0
      ? rawDisplayName
      : metadataDisplayName.trim().length > 0
        ? metadataDisplayName
        : authorName !== "作者名未設定"
          ? authorName
          : "";

  return (
    <main className="min-h-screen bg-white text-black">
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-4 text-sm text-neutral-500">
          <Link href="/" className="hover:text-black">TOP</Link><span className="mx-2">/</span><span className="text-neutral-700">マイページ</span>
        </div>
        <MyPageHeroEditable
          userId={user.id}
          fallbackEmail={signedInLabel}
          initialDisplayName={initialDisplayName}
          initialBio={initialBio}
          initialXUrl={initialXUrl}
          initialNoteUrl={initialNoteUrl}
          initialLinkLabels={initialLinkLabels}
          eyebrow="LIB READ MYPAGE"
          actions={[
            { href: buildAuthorPageHref(user.id), label: "公開作者ページを見る", tone: "primary" },
            { href: "/write", label: "作品ワークスペース" },
            { href: "/record", label: "朗読ページ" },
          ]}
        />

        <div className="mt-6 grid gap-6">
          <section className="rounded-[28px] border border-black/10 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs tracking-[0.18em] text-neutral-500">BOOKMARKS</p>
                <h2 className="mt-2 text-xl font-semibold text-black">ブックマーク作品</h2>
                <p className="mt-2 text-sm leading-7 text-neutral-600">最近更新されたブックマーク作品を最大5件まで表示する。</p>
              </div>
              <Link href="/search?saved=bookmarked-works&order=updated" className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm text-neutral-800 transition hover:bg-neutral-50">一覧を見る</Link>
            </div>
            <BookmarkedSeriesList userId={user.id} surface="light" limit={5} showOrderControls />
          </section>

          <MySeriesSection cards={seriesCards} />
          <SavedSearchLinksSection />
          <AccountSettingsCard />
        </div>
      </div>
    </main>
  );
}
