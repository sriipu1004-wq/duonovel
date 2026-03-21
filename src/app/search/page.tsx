import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type SearchPageProps = {
  searchParams?: Promise<{
    q?: string | string[];
    genre?: string | string[];
  }>;
};

type GenreRow = {
  id: number | string;
  name?: string | null;
};

type SeriesSearchRow = Record<string, unknown> & {
  id: string;
  title?: string | null;
  summary?: string | null;
  description?: string | null;
  catch_copy?: string | null;
  synopsis?: string | null;
  body?: string | null;
  genre?: string | null;
  genre_name?: string | null;
  genre_label?: string | null;
  category?: string | null;
  genre_id?: string | number | null;
  genreId?: string | number | null;
  main_genre_id?: string | number | null;
  mainGenreId?: string | number | null;
  genres?: unknown;
  genre_ids?: unknown;
  genreIds?: unknown;
  genre_names?: unknown;
  genreNames?: unknown;
};

function normalizeQuery(raw: string | string[] | undefined): string {
  if (Array.isArray(raw)) {
    return raw[0]?.trim() ?? "";
  }
  return raw?.trim() ?? "";
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

function pickText(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return "";
}

function toFlatStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .flatMap((item) => toFlatStringArray(item))
      .filter((item) => item.length > 0);
  }

  if (typeof value === "number") {
    return [String(value)];
  }

  if (typeof value !== "string") {
    return [];
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return [];
  }

  if (
    (trimmed.startsWith("[") && trimmed.endsWith("]")) ||
    (trimmed.startsWith("{") && trimmed.endsWith("}"))
  ) {
    try {
      const parsed = JSON.parse(trimmed);
      return toFlatStringArray(parsed);
    } catch {
      return trimmed
        .split(/[,、]/)
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
    }
  }

  return trimmed
    .split(/[,、]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function buildSearchTarget(series: SeriesSearchRow): string {
  return [
    pickText(series.title),
    pickText(series.summary),
    pickText(series.description),
    pickText(series.catch_copy),
    pickText(series.synopsis),
    pickText(series.body),
  ]
    .join("\n")
    .toLowerCase();
}

function buildGenreTarget(series: SeriesSearchRow): string[] {
  return [
    pickText(series.genre),
    pickText(series.genre_name),
    pickText(series.genre_label),
    pickText(series.category),
    ...toFlatStringArray(series.genres),
    ...toFlatStringArray(series.genre_names),
    ...toFlatStringArray(series.genreNames),
    ...toFlatStringArray(series.genre_ids),
    ...toFlatStringArray(series.genreIds),
    ...toFlatStringArray(series.genre_id),
    ...toFlatStringArray(series.genreId),
    ...toFlatStringArray(series.main_genre_id),
    ...toFlatStringArray(series.mainGenreId),
  ]
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function pickSnippet(series: SeriesSearchRow): string {
  return (
    pickText(
      series.summary,
      series.description,
      series.catch_copy,
      series.synopsis,
      series.body
    ) || "この作品にはまだ説明文が登録されていません。"
  );
}

function matchesGenre(
  series: SeriesSearchRow,
  selectedGenreName: string,
  selectedGenreId: string
): boolean {
  if (!selectedGenreName && !selectedGenreId) {
    return true;
  }

  const normalizedGenreName = normalizeText(selectedGenreName);
  const genreTargets = buildGenreTarget(series);

  if (
    selectedGenreId &&
    genreTargets.some((item) => item === selectedGenreId)
  ) {
    return true;
  }

  if (
    normalizedGenreName &&
    genreTargets.some((item) => normalizeText(item).includes(normalizedGenreName))
  ) {
    return true;
  }

  if (
    normalizedGenreName &&
    buildSearchTarget(series).includes(normalizedGenreName)
  ) {
    return true;
  }

  return false;
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const query = normalizeQuery(resolvedSearchParams?.q);
  const selectedGenreName = normalizeQuery(resolvedSearchParams?.genre);

  const [
    { data: seriesData, error: seriesError },
    { data: genresData, error: genresError },
  ] = await Promise.all([
    supabase.from("series").select("*").limit(100),
    supabase.from("genres").select("id, name").order("id", { ascending: true }),
  ]);

  const genres = (genresData ?? []) as GenreRow[];
  const selectedGenre =
    genres.find(
      (genre) =>
        normalizeText(genre.name ?? "") === normalizeText(selectedGenreName)
    ) ?? null;

  const selectedGenreId = selectedGenre ? String(selectedGenre.id) : "";

  let errorMessage = "";
  let results: SeriesSearchRow[] = [];

  if (seriesError) {
    console.error("作品検索エラー:", seriesError);
    errorMessage = "検索中にエラーが発生しました。";
  } else {
    if (genresError) {
      console.error("ジャンル取得エラー:", genresError);
    }

    const rows = ((seriesData ?? []) as SeriesSearchRow[]).filter(
      (series) => typeof series.id === "string" && series.id.length > 0
    );

    const normalizedQuery = normalizeText(query);

    results = rows.filter((series) => {
      const queryOk =
        !normalizedQuery || buildSearchTarget(series).includes(normalizedQuery);

      const genreOk = matchesGenre(series, selectedGenreName, selectedGenreId);

      return queryOk && genreOk;
    });
  }

  const hasActiveFilter = query.length > 0 || selectedGenreName.length > 0;

  return (
    <main className="min-h-screen bg-[#050510] px-6 py-8 text-[#f5f5f5]">
      <div className="mx-auto w-full max-w-5xl">
        <div className="mb-4 text-sm text-neutral-500">
          <Link href="/" className="hover:text-neutral-300">
            TOP
          </Link>
          <span className="mx-2">/</span>
          <span className="text-neutral-300">検索</span>
        </div>

        <section className="rounded-[32px] border border-white/10 bg-white/[0.04] p-6 shadow-2xl sm:p-8">
          <p className="text-xs tracking-[0.24em] text-neutral-500">SEARCH</p>
          <h1 className="mt-3 text-3xl font-bold text-white">作品検索</h1>
          <p className="mt-3 text-sm leading-7 text-neutral-300">
            キーワード検索に加えて、ジャンルからの最小絞り込みにも対応しています。
          </p>

          <form
            action="/search"
            method="get"
            className="mt-6 flex flex-col gap-3"
          >
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                type="text"
                name="q"
                defaultValue={query}
                placeholder="作品タイトル / キーワードで検索"
                className="h-12 flex-1 rounded-2xl border border-white/10 bg-black/30 px-4 text-sm text-white outline-none placeholder:text-neutral-500 focus:border-white/30"
              />
              <button
                type="submit"
                className="inline-flex h-12 items-center justify-center rounded-2xl bg-white px-5 text-sm font-semibold text-black transition hover:opacity-90"
              >
                検索する
              </button>
            </div>

            {selectedGenreName ? (
              <input type="hidden" name="genre" value={selectedGenreName} />
            ) : null}
          </form>

          <div className="mt-6">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <p className="text-xs tracking-[0.18em] text-neutral-500">
                GENRE FILTER
              </p>

              {selectedGenreName ? (
                <Link
                  href={query ? `/search?q=${encodeURIComponent(query)}` : "/search"}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-neutral-300 transition hover:bg-white hover:text-black"
                >
                  ジャンル解除
                </Link>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2">
              {genres.map((genre) => {
                const name = pickText(genre.name);
                const active =
                  normalizeText(name) === normalizeText(selectedGenreName);

                const href = query
                  ? `/search?q=${encodeURIComponent(query)}&genre=${encodeURIComponent(name)}`
                  : `/search?genre=${encodeURIComponent(name)}`;

                return (
                  <Link
                    key={String(genre.id)}
                    href={href}
                    className={[
                      "rounded-full border px-3 py-2 text-sm transition",
                      active
                        ? "border-white bg-white text-black"
                        : "border-white/10 bg-black/20 text-neutral-200 hover:bg-white hover:text-black",
                    ].join(" ")}
                  >
                    {name}
                  </Link>
                );
              })}
            </div>
          </div>
        </section>

        <section className="mt-8">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs tracking-[0.18em] text-neutral-500">
                RESULTS
              </p>
              <h2 className="mt-2 text-xl font-semibold text-white">
                絞り込み結果
              </h2>
            </div>

            {hasActiveFilter ? (
              <div className="flex flex-wrap items-center gap-2">
                {query ? (
                  <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-neutral-300">
                    キーワード: {query}
                  </span>
                ) : null}

                {selectedGenreName ? (
                  <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-neutral-300">
                    ジャンル: {selectedGenreName}
                  </span>
                ) : null}

                <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-neutral-300">
                  結果: {results.length}件
                </span>
              </div>
            ) : (
              <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-neutral-400">
                まずはキーワードかジャンルを選ぶ
              </div>
            )}
          </div>

          {errorMessage ? (
            <div className="rounded-[24px] border border-red-400/20 bg-red-400/10 p-4 text-sm leading-7 text-red-200">
              {errorMessage}
            </div>
          ) : null}

          {!hasActiveFilter && !errorMessage ? (
            <div className="rounded-[24px] border border-dashed border-white/10 bg-black/20 p-6 text-sm leading-7 text-neutral-400">
              キーワードを入れるか、ジャンルを選んで作品を絞り込んでください。
            </div>
          ) : null}

          {hasActiveFilter && !errorMessage && results.length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-white/10 bg-black/20 p-6 text-sm leading-7 text-neutral-400">
              条件に一致する作品は見つかりませんでした。
            </div>
          ) : null}

          {results.length > 0 ? (
            <div className="grid gap-4">
              {results.map((series) => {
                const title = pickText(series.title) || "無題";
                const snippet = pickSnippet(series);

                return (
                  <article
                    key={series.id}
                    className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5"
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs tracking-[0.18em] text-neutral-500">
                          WORK
                        </p>
                        <h3 className="mt-2 text-xl font-semibold text-white">
                          {title}
                        </h3>
                        <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-neutral-300">
                          {snippet}
                        </p>
                      </div>

                      <div className="shrink-0">
                        <Link
                          href={`/works/${series.id}`}
                          className="inline-flex h-11 items-center justify-center rounded-2xl border border-white/10 bg-white px-4 text-sm font-semibold text-black transition hover:opacity-90"
                        >
                          作品ページへ
                        </Link>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}