import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type SearchPageProps = {
  searchParams?: Promise<{
    q?: string | string[];
  }>;
};

type SeriesSearchRow = Record<string, unknown> & {
  id: string;
  title?: string | null;
  summary?: string | null;
  description?: string | null;
  catch_copy?: string | null;
  synopsis?: string | null;
  body?: string | null;
};

function normalizeQuery(raw: string | string[] | undefined): string {
  if (Array.isArray(raw)) {
    return raw[0]?.trim() ?? "";
  }
  return raw?.trim() ?? "";
}

function pickText(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return "";
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

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const query = normalizeQuery(resolvedSearchParams?.q);

  let results: SeriesSearchRow[] = [];
  let errorMessage = "";

  if (query.length > 0) {
    const { data, error } = await supabase
      .from("series")
      .select("*")
      .limit(100);

    if (error) {
      console.error("作品検索エラー:", error);
      errorMessage = "検索中にエラーが発生しました。";
    } else {
      const rows = ((data ?? []) as SeriesSearchRow[]).filter(
        (series) => typeof series.id === "string" && series.id.length > 0
      );

      const normalizedQuery = query.toLowerCase();

      results = rows.filter((series) =>
        buildSearchTarget(series).includes(normalizedQuery)
      );
    }
  }

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
            タイトルやあらすじに含まれる言葉から、作品を探せる最小版検索です。
          </p>

          <form
            action="/search"
            method="get"
            className="mt-6 flex flex-col gap-3 sm:flex-row"
          >
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
          </form>
        </section>

        <section className="mt-8">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs tracking-[0.18em] text-neutral-500">
                RESULTS
              </p>
              <h2 className="mt-2 text-xl font-semibold text-white">
                検索結果
              </h2>
            </div>

            {query ? (
              <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-neutral-300">
                「{query}」の結果: {results.length}件
              </div>
            ) : (
              <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-neutral-400">
                まずは検索ワードを入力
              </div>
            )}
          </div>

          {errorMessage ? (
            <div className="rounded-[24px] border border-red-400/20 bg-red-400/10 p-4 text-sm leading-7 text-red-200">
              {errorMessage}
            </div>
          ) : null}

          {!query && !errorMessage ? (
            <div className="rounded-[24px] border border-dashed border-white/10 bg-black/20 p-6 text-sm leading-7 text-neutral-400">
              作品タイトルや気になるキーワードを入力して検索してください。
            </div>
          ) : null}

          {query && !errorMessage && results.length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-white/10 bg-black/20 p-6 text-sm leading-7 text-neutral-400">
              「{query}」に一致する作品は見つかりませんでした。
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