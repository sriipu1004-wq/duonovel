"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type BgmTrack = {
  id: string;
  title: string;
  description: string;
  mood: string;
  usage: string;
  durationLabel: string;
  loopable: boolean;
  audioPath: string;
  sourceLabel: string;
  rightsLabel: string;
  tags: string[];
};

const BGM_LIBRARY: BgmTrack[] = [
  {
    id: "demo-bgm-001",
    title: "デモBGM 01",
    description:
      "BGM素材ページ最小版の試聴用デモ音源。まずはサイト側で用意したBGMだけを探して試せる状態を優先している。",
    mood: "穏やか",
    usage: "日常",
    durationLabel: "確認中",
    loopable: true,
    audioPath: "/test-audio/demo-bgm.mp3",
    sourceLabel: "サイト用意BGM",
    rightsLabel: "LIB read内利用想定",
    tags: ["デモ", "試聴", "最小版", "穏やか", "日常"],
  },
];

const LOOP_FILTERS = [
  { value: "all", label: "すべて" },
  { value: "loopable", label: "ループ可のみ" },
  { value: "non-loopable", label: "ループ不可のみ" },
] as const;

type LoopFilter = (typeof LOOP_FILTERS)[number]["value"];

function matchesLoopFilter(track: BgmTrack, loopFilter: LoopFilter): boolean {
  if (loopFilter === "loopable") return track.loopable;
  if (loopFilter === "non-loopable") return !track.loopable;
  return true;
}

function includesQuery(track: BgmTrack, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;

  const haystack = [
    track.title,
    track.description,
    track.mood,
    track.usage,
    track.durationLabel,
    track.sourceLabel,
    track.rightsLabel,
    ...track.tags,
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(normalized);
}

function FilterBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs text-neutral-300">
      {children}
    </span>
  );
}

export default function BgmLibraryPage() {
  const [query, setQuery] = useState("");
  const [moodFilter, setMoodFilter] = useState("all");
  const [usageFilter, setUsageFilter] = useState("all");
  const [loopFilter, setLoopFilter] = useState<LoopFilter>("all");

  const moodOptions = useMemo(
    () => ["all", ...new Set(BGM_LIBRARY.map((track) => track.mood))],
    []
  );
  const usageOptions = useMemo(
    () => ["all", ...new Set(BGM_LIBRARY.map((track) => track.usage))],
    []
  );

  const filteredTracks = useMemo(() => {
    return BGM_LIBRARY.filter((track) => {
      const matchesMood = moodFilter === "all" || track.mood === moodFilter;
      const matchesUsage = usageFilter === "all" || track.usage === usageFilter;
      return (
        matchesMood &&
        matchesUsage &&
        matchesLoopFilter(track, loopFilter) &&
        includesQuery(track, query)
      );
    });
  }, [loopFilter, moodFilter, query, usageFilter]);

  return (
    <main className="min-h-screen bg-[#050510] px-4 py-6 text-[#f5f5f5] sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-6xl">
        <div className="mb-4 text-sm text-neutral-500">
          <span className="text-neutral-300">BGM素材ページ</span>
        </div>

        <section className="overflow-hidden rounded-[32px] border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] shadow-2xl">
          <div className="border-b border-white/10 px-5 py-6 sm:px-8">
            <p className="text-xs tracking-[0.22em] text-neutral-500">
              LIB READ BGM LIBRARY
            </p>

            <h1 className="mt-3 text-3xl font-bold text-white sm:text-4xl">
              BGM素材を探す
            </h1>

            <p className="mt-4 max-w-3xl text-sm leading-7 text-neutral-300 sm:text-base">
              まずは、LIB read がサイト内で用意したBGMだけを探して試せる最小版。
              一覧、検索、絞り込み、試聴をここにまとめて、将来は朗読制作ページやBGM管理画面から参照できる前提を作る。
            </p>

            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href="/"
                className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
              >
                ホームへ
              </Link>

              <Link
                href="/manage"
                className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
              >
                管理トップへ
              </Link>
            </div>
          </div>

          <div className="grid gap-6 px-5 py-6 sm:px-8">
            <section className="rounded-[28px] border border-white/10 bg-black/20 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs tracking-[0.18em] text-neutral-500">
                    FILTERS
                  </p>
                  <h2 className="mt-2 text-xl font-semibold text-white">
                    検索と絞り込み
                  </h2>
                </div>

                <FilterBadge>{filteredTracks.length}件ヒット</FilterBadge>
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-[1.3fr_0.8fr_0.8fr_0.8fr]">
                <label className="grid gap-2">
                  <span className="text-sm text-neutral-300">検索</span>
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="タイトル / 雰囲気 / 用途 / タグで検索"
                    className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-neutral-500"
                  />
                </label>

                <label className="grid gap-2">
                  <span className="text-sm text-neutral-300">雰囲気</span>
                  <select
                    value={moodFilter}
                    onChange={(event) => setMoodFilter(event.target.value)}
                    className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none"
                  >
                    {moodOptions.map((option) => (
                      <option key={option} value={option} className="bg-[#111] text-white">
                        {option === "all" ? "すべて" : option}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="grid gap-2">
                  <span className="text-sm text-neutral-300">用途</span>
                  <select
                    value={usageFilter}
                    onChange={(event) => setUsageFilter(event.target.value)}
                    className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none"
                  >
                    {usageOptions.map((option) => (
                      <option key={option} value={option} className="bg-[#111] text-white">
                        {option === "all" ? "すべて" : option}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="grid gap-2">
                  <span className="text-sm text-neutral-300">ループ</span>
                  <select
                    value={loopFilter}
                    onChange={(event) => setLoopFilter(event.target.value as LoopFilter)}
                    className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none"
                  >
                    {LOOP_FILTERS.map((option) => (
                      <option
                        key={option.value}
                        value={option.value}
                        className="bg-[#111] text-white"
                      >
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setMoodFilter("all");
                    setUsageFilter("all");
                    setLoopFilter("all");
                  }}
                  className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
                >
                  条件をクリア
                </button>

                <FilterBadge>サイト用意BGMのみ</FilterBadge>
                <FilterBadge>外部持ち込み前提なし</FilterBadge>
                <FilterBadge>試聴あり</FilterBadge>
              </div>
            </section>

            <section className="grid gap-4">
              {filteredTracks.length > 0 ? (
                filteredTracks.map((track) => (
                  <article
                    key={track.id}
                    className="rounded-[28px] border border-white/10 bg-black/20 p-5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <p className="text-xs tracking-[0.18em] text-neutral-500">
                          SITE BGM
                        </p>
                        <h2 className="mt-2 text-2xl font-semibold text-white">
                          {track.title}
                        </h2>
                        <p className="mt-3 max-w-3xl text-sm leading-7 text-neutral-400">
                          {track.description}
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <FilterBadge>{track.mood}</FilterBadge>
                        <FilterBadge>{track.usage}</FilterBadge>
                        <FilterBadge>
                          {track.loopable ? "ループ可" : "ループ不可"}
                        </FilterBadge>
                      </div>
                    </div>

                    <div className="mt-5 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
                      <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
                        <p className="text-sm font-semibold text-white">サイト内試聴</p>
                        <p className="mt-2 text-sm leading-7 text-neutral-400">
                          音量や再生タイミングの雰囲気確認用。将来はここから朗読制作ページやBGM管理画面へ接続する前提。
                        </p>

                        <audio
                          controls
                          preload="none"
                          src={track.audioPath}
                          className="mt-4 w-full"
                        >
                          お使いのブラウザは audio 要素に対応していません。
                        </audio>
                      </div>

                      <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4 text-sm leading-7 text-neutral-300">
                        <p className="text-sm font-semibold text-white">素材メタ情報</p>
                        <dl className="mt-3 grid gap-2">
                          <div>
                            <dt className="text-neutral-500">用途</dt>
                            <dd>{track.usage}</dd>
                          </div>
                          <div>
                            <dt className="text-neutral-500">長さ</dt>
                            <dd>{track.durationLabel}</dd>
                          </div>
                          <div>
                            <dt className="text-neutral-500">出所</dt>
                            <dd>{track.sourceLabel}</dd>
                          </div>
                          <div>
                            <dt className="text-neutral-500">利用ラベル</dt>
                            <dd>{track.rightsLabel}</dd>
                          </div>
                          <div>
                            <dt className="text-neutral-500">設定用パス</dt>
                            <dd className="break-all text-neutral-200">{track.audioPath}</dd>
                          </div>
                        </dl>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {track.tags.map((tag) => (
                        <span
                          key={`${track.id}-${tag}`}
                          className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-neutral-300"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  </article>
                ))
              ) : (
                <div className="rounded-[28px] border border-dashed border-white/10 bg-black/20 p-6 text-sm leading-7 text-neutral-400">
                  条件に一致するBGMがまだない。検索語や絞り込み条件を変えて再確認してほしい。
                </div>
              )}
            </section>

            <section className="rounded-[28px] border border-white/10 bg-black/20 p-5">
              <p className="text-xs tracking-[0.18em] text-neutral-500">
                NEXT CONNECTION
              </p>
              <h2 className="mt-2 text-xl font-semibold text-white">
                このページの役割
              </h2>

              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm leading-7 text-neutral-400">
                  まずは BGM素材を一覧で見て、検索して、絞り込んで、試聴できる最小導線を担う。
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm leading-7 text-neutral-400">
                  今は site-curated BGM 前提。外部持ち込みBGMや権利管理本体までは今回の範囲外。
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm leading-7 text-neutral-400">
                  将来は /manage/bgm/[seriesId] や朗読制作ページからこの素材庫を参照する想定。
                </div>
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}
