import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type Genre = {
  id: number;
  name: string;
};

export default async function Home() {
  const { data: genres, error } = await supabase
    .from("genres")
    .select("id, name")
    .order("id", { ascending: true });

  if (error) {
    console.error("ジャンル取得エラー:", error);
  }

  return (
    <main className="min-h-screen bg-[#050510] px-6 py-8 text-[#f5f5f5]">
      <div className="mx-auto w-full max-w-5xl">
        <section className="overflow-hidden rounded-[32px] border border-white/10 bg-white/[0.04] shadow-2xl">
          <div className="grid gap-8 px-6 py-8 lg:grid-cols-[1.15fr_0.85fr] lg:px-8 lg:py-10">
            <div>
              <p className="text-xs tracking-[0.24em] text-neutral-500">
                DUONOVEL
              </p>

              <h1 className="mt-3 text-3xl font-bold leading-tight text-white sm:text-4xl">
                作品を探す
              </h1>

              <p className="mt-4 max-w-2xl text-sm leading-7 text-neutral-300 sm:text-base">
                タイトルやあらすじから作品を探したり、人気作品ランキングから気になる作品を見つけたりできる入口です。
                まずは検索とランキングの最小導線をまとめています。
              </p>

              <form
                action="/search"
                method="get"
                className="mt-6 flex flex-col gap-3 sm:flex-row"
              >
                <input
                  type="text"
                  name="q"
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

              <div className="mt-4 flex flex-wrap gap-3">
                <Link
                  href="/search"
                  className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-neutral-200 transition hover:bg-white/10"
                >
                  検索ページへ
                </Link>

                <Link
                  href="/ranking"
                  className="rounded-full border border-white/10 bg-white px-4 py-2 text-sm font-semibold text-black transition hover:opacity-90"
                >
                  ランキングを見る
                </Link>
              </div>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-black/20 p-5">
              <p className="text-xs tracking-[0.18em] text-neutral-500">
                DISCOVER GUIDE
              </p>
              <h2 className="mt-2 text-lg font-semibold text-white">
                今できる発見導線
              </h2>

              <ul className="mt-4 space-y-3 text-sm leading-7 text-neutral-300">
                <li className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                  作品タイトルから検索できる
                </li>
                <li className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                  あらすじ・説明文に含まれる語も拾える
                </li>
                <li className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                  ランキング一覧から人気作品を見られる
                </li>
                <li className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                  一覧からそのまま作品ページへ移動できる
                </li>
              </ul>
            </div>
          </div>
        </section>

        <section className="mt-8 rounded-[28px] border border-white/10 bg-white/[0.03] p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs tracking-[0.18em] text-neutral-500">
                GENRES
              </p>
              <h2 className="mt-2 text-xl font-semibold text-white">
                登録されているジャンル
              </h2>
            </div>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-neutral-400">
              接続確認用
            </span>
          </div>

          {error && (
            <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">
              ジャンルの取得中にエラーが発生しました。コンソールを確認してください。
            </div>
          )}

          <div className="mt-5">
            <ul className="flex flex-wrap gap-2">
              {genres?.map((genre: Genre) => (
                <li
                  key={genre.id}
                  className="rounded-full border border-white/10 bg-black/20 px-3 py-2 text-sm text-neutral-200"
                >
                  {genre.name}
                </li>
              ))}
            </ul>

            {!genres?.length && !error && (
              <p className="mt-3 text-sm text-neutral-400">
                ジャンルがまだ登録されていません。
              </p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}