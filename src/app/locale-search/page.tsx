import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCachedPublicBaseWorkCards } from "@/lib/publicWorks";
import { getUiLocale } from "@/i18n/server";
import { searchDictionaries } from "@/i18n/dictionaries/search";
import { localizePath } from "@/i18n/navigation";

type PageProps = {
  searchParams?: Promise<{ q?: string }>;
};

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getUiLocale();
  if (locale === "ja") return {};
  const dictionary = searchDictionaries[locale];

  return {
    title: `${dictionary.title} | LIB read`,
    description: dictionary.description,
    robots: { index: false, follow: true },
  };
}

export default async function LocaleSearchPage({ searchParams }: PageProps) {
  const locale = await getUiLocale();
  if (locale === "ja") notFound();

  const dictionary = searchDictionaries[locale];
  const params = searchParams ? await searchParams : undefined;
  const query = typeof params?.q === "string" ? params.q.trim() : "";
  const normalizedQuery = query.toLocaleLowerCase(locale);
  const works = await getCachedPublicBaseWorkCards();
  const filteredWorks = normalizedQuery
    ? works.filter((work) =>
        [
          work.title,
          work.summary,
          work.authorName,
          ...(work.tags ?? []),
          ...(work.genres ?? []),
        ]
          .join("\n")
          .toLocaleLowerCase(locale)
          .includes(normalizedQuery)
      )
    : works;

  return (
    <main className="min-h-screen bg-white text-black">
      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        <section className="rounded-[30px] border border-black/10 bg-neutral-50 p-6 sm:p-8">
          <p className="text-xs tracking-[0.2em] text-neutral-500">EXPLORE</p>
          <h1 className="mt-3 text-3xl font-bold sm:text-4xl">{dictionary.title}</h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-neutral-600">{dictionary.description}</p>
          <form method="get" action={localizePath("/search", locale)} className="mt-6 flex flex-col gap-3 sm:flex-row">
            <input
              type="search"
              name="q"
              defaultValue={query}
              placeholder={dictionary.placeholder}
              className="min-h-12 flex-1 rounded-2xl border border-black/10 bg-white px-4 text-sm outline-none focus:border-sky-300"
            />
            <button type="submit" className="min-h-12 rounded-2xl bg-black px-6 text-sm font-semibold text-white">
              {dictionary.search}
            </button>
            {query ? (
              <Link href={localizePath("/search", locale)} className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-black/10 bg-white px-5 text-sm font-semibold text-neutral-700">
                {dictionary.clear}
              </Link>
            ) : null}
          </form>
        </section>

        <section className="mt-8">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs tracking-[0.18em] text-neutral-500">WORKS</p>
              <h2 className="mt-2 text-2xl font-semibold">{query ? dictionary.results : dictionary.allWorks}</h2>
            </div>
            <p className="text-sm text-neutral-500">{dictionary.count(filteredWorks.length)}</p>
          </div>

          {filteredWorks.length === 0 ? (
            <div className="mt-5 rounded-[24px] border border-black/10 bg-neutral-50 p-6 text-sm text-neutral-600">
              {dictionary.empty}
            </div>
          ) : (
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              {filteredWorks.map((work) => {
                const firstEpisodeNumber = work.firstEpisodeNumber;
                return (
                  <article key={work.seriesId} className="rounded-[26px] border border-black/10 bg-white p-5 shadow-sm">
                    <p className="text-xs text-neutral-500">{dictionary.episodes(work.episodeCount)}</p>
                    <h3 className="mt-2 text-xl font-semibold leading-7">{work.title}</h3>
                    <p className="mt-1 text-sm text-neutral-500">{work.authorName}</p>
                    <p className="mt-4 line-clamp-3 text-sm leading-7 text-neutral-600">{work.summary}</p>
                    <div className="mt-5 flex flex-wrap gap-2">
                      <Link href={localizePath(`/works/${work.seriesId}`, locale)} className="rounded-full border border-black/10 px-4 py-2 text-sm font-semibold text-neutral-800">
                        {dictionary.details}
                      </Link>
                      {typeof firstEpisodeNumber === "number" ? (
                        <Link href={localizePath(`/read/${work.seriesId}/${firstEpisodeNumber}`, locale)} className="rounded-full bg-black px-4 py-2 text-sm font-semibold text-white">
                          {dictionary.startReading}
                        </Link>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
