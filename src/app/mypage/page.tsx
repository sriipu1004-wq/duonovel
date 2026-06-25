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
  resolveAuthorName,
  type AuthorSeriesCard,
} from "@/features/authorProfile/authorProfileShared";
import BookmarkedSeriesList from "@/features/bookmark/BookmarkedSeriesList";
import MyPageHeroEditable from "./MyPageHeroEditable";
import AccountSettingsCard from "./AccountSettingsCard";
import SavedSearchLinksSection from "./SavedSearchLinksSection";
import { createAdminClient } from "@/lib/supabase/admin";

function readRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object") {
    return value as Record<string, unknown>;
  }

  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);

      if (parsed && typeof parsed === "object") {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
  }

  return null;
}

function isShortStorySeries(series: AuthorSeriesCard["series"]): boolean {
  const settings = readRecord(
    series.effect_settings ?? series["effectSettings"]
  );
  const tags = Array.isArray(series.tags)
    ? series.tags.map((item) => String(item).trim())
    : typeof series.tags === "string"
      ? series.tags.split(/[\n,、]/u).map((item) => item.trim())
      : [];

  return (
    tags.includes("AI生成") ||
    settings?.source === "time_fit_ai_story" ||
    settings?.aiGenerated === true ||
    settings?.authorName === "AI生成" ||
    settings?.storyFormat === "short"
  );
}

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
            const isShortStory = isShortStorySeries(card.series);
            const publicReadHref =
              isShortStory && card.firstPublishedEpisodeNumber !== null
                ? buildReadHref(card.series.id, card.firstPublishedEpisodeNumber)
                : "";

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
                      href={publicReadHref || buildWorksHref(card.series.id)}
                      className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm text-neutral-800 transition hover:bg-neutral-50"
                    >
                      {isShortStory ? "読むページへ" : "作品ページへ"}
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

function readAuthMetadataText(metadata: unknown, key: string): string {
  if (!metadata || typeof metadata !== "object") {
    return "";
  }

  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" ? value.trim() : "";
}

function readAuthMetadataDisplayName(metadata: unknown): string {
  if (!metadata || typeof metadata !== "object") {
    return "";
  }

  const values = metadata as Record<string, unknown>;
  const candidates = [
    values.display_name,
    values.displayName,
    values.display_name_candidate,
    values.name,
    values.full_name,
  ];

  for (const candidate of candidates) {
    if (typeof candidate !== "string") {
      continue;
    }

    const text = candidate.trim();

    if (text.length > 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) {
      return text;
    }
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
        : typeof author?.description === "string" &&
            author.description.trim().length > 0
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
  const rawDisplayName =
    typeof author?.display_name === "string" ? author.display_name : "";

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
          initialBio={initialBio}
          initialXUrl={initialXUrl}
          initialNoteUrl={initialNoteUrl}
          initialLinkLabels={initialLinkLabels}
          eyebrow="LIB READ MYPAGE"
          actions={[
            {
              href: buildAuthorPageHref(user.id),
              label: "公開作者ページを見る",
              tone: "primary",
            },
            { href: "/write", label: "作品ワークスペース一覧へ" },
            { href: "/record", label: "朗読ページへ" },
          ]}
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
              description="朗読可能作品の確認、朗読制作の開始は /record に集約する。"
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

          <SavedSearchLinksSection />          

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