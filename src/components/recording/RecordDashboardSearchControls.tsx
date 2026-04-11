"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import SearchNavButton from "@/components/search/SearchNavButton";

type RecordFilter =
  | "all"
  | "submitted"
  | "ready"
  | "approval"
  | "pending"
  | "approved"
  | "bookmarked"
  | "requested";

type RecordOrderKey = "popular" | "updated" | "narration";

type TagChip = {
  value: string;
  label: string;
  count: number;
};

type GenreChip = {
  key: string;
  label: string;
  count: number;
};

type RecordDashboardSearchControlsProps = {
  query: string;
  selectedTagLabels: string[];
  selectedGenreLabels: string[];
  filter: RecordFilter;
  order: RecordOrderKey;
  selectedStartInput: string;
  selectedEndInput: string;
  defaultStartInput: string;
  defaultEndInput: string;
  visibleTagChips: TagChip[];
  hasHiddenTags: boolean;
  visibleGenreChips: GenreChip[];
  hasHiddenGenres: boolean;
  showAllTags: boolean;
  showAllGenres: boolean;
};

const VISIBLE_FILTER_OPTIONS: Array<{
  value: Exclude<RecordFilter, "bookmarked" | "requested">;
  label: string;
}> = [
  { value: "all", label: "すべて" },
  { value: "submitted", label: "投稿済" },
  { value: "ready", label: "朗読可" },
  { value: "approval", label: "申請制" },
  { value: "pending", label: "申請中" },
  { value: "approved", label: "承認済み" },
];

function normalizeTagToken(value: string): string {
  return value.trim().replace(/^#+/, "").toLowerCase();
}

function formatTagLabel(value: string): string {
  const trimmed = value.trim().replace(/^#+/, "");
  if (!trimmed) return "";
  return `#${trimmed}`;
}

function toggleSelectedTagLabels(current: string[], nextLabel: string): string[] {
  const formatted = formatTagLabel(nextLabel);
  if (!formatted) return current;

  const normalizedTarget = normalizeTagToken(formatted);
  const exists = current.some(
    (item) => normalizeTagToken(item) === normalizedTarget
  );

  if (exists) {
    return current.filter(
      (item) => normalizeTagToken(item) !== normalizedTarget
    );
  }

  return [...current, formatted];
}

function toggleSelectedGenreLabels(current: string[], nextLabel: string): {
  nextLabels: string[];
  overLimit: boolean;
} {
  const trimmed = nextLabel.trim();
  if (!trimmed) {
    return { nextLabels: current, overLimit: false };
  }

  const exists = current.includes(trimmed);

  if (exists) {
    return {
      nextLabels: current.filter((item) => item !== trimmed),
      overLimit: false,
    };
  }

  if (current.length >= 3) {
    return {
      nextLabels: current,
      overLimit: true,
    };
  }

  return {
    nextLabels: [...current, trimmed],
    overLimit: false,
  };
}

function buildRecordSearchHref(params: {
  q?: string;
  filter?: RecordFilter;
  selectedTags?: string[];
  selectedGenres?: string[];
  order?: RecordOrderKey;
  start?: string;
  end?: string;
  showTags?: boolean;
  showGenres?: boolean;
}): string {
  const query = new URLSearchParams();

  if (params.q && params.q.trim().length > 0) {
    query.set("q", params.q.trim());
  }

  if (params.filter && params.filter !== "all") {
    query.set("filter", params.filter);
  }

  if (params.selectedTags && params.selectedTags.length > 0) {
    query.set("tags", params.selectedTags.join(","));
  }

  if (params.selectedGenres && params.selectedGenres.length > 0) {
    query.set("genres", params.selectedGenres.join(","));
  }

  if (params.order) {
    query.set("order", params.order);
  }

  if (params.start) {
    query.set("start", params.start);
  }

  if (params.end) {
    query.set("end", params.end);
  }

  if (params.showTags) {
    query.set("showTags", "1");
  }

  if (params.showGenres) {
    query.set("showGenres", "1");
  }

  const queryString = query.toString();
  return queryString ? `/record?${queryString}` : "/record";
}

export default function RecordDashboardSearchControls({
  query,
  selectedTagLabels,
  selectedGenreLabels,
  filter,
  order,
  selectedStartInput,
  selectedEndInput,
  defaultStartInput,
  defaultEndInput,
  visibleTagChips,
  hasHiddenTags,
  visibleGenreChips,
  hasHiddenGenres,
  showAllTags,
  showAllGenres,
}: RecordDashboardSearchControlsProps) {
  const router = useRouter();

  const [queryValue, setQueryValue] = useState(query);
  const [startValue, setStartValue] = useState(selectedStartInput);
  const [endValue, setEndValue] = useState(selectedEndInput);
  const [genreLimitMessage, setGenreLimitMessage] = useState("");

  useEffect(() => {
    setQueryValue(query);
  }, [query]);

  useEffect(() => {
    setStartValue(selectedStartInput);
  }, [selectedStartInput]);

  useEffect(() => {
    setEndValue(selectedEndInput);
  }, [selectedEndInput]);

  useEffect(() => {
    setGenreLimitMessage("");
  }, [selectedGenreLabels]);

  const selectedFilterChips = useMemo(
    () => [
      ...selectedGenreLabels.map((label) => ({
        type: "genre" as const,
        label,
      })),
      ...selectedTagLabels.map((label) => ({
        type: "tag" as const,
        label,
      })),
    ],
    [selectedGenreLabels, selectedTagLabels]
  );

  function navigate(href: string, scrollTargetId?: string) {
    router.replace(href, { scroll: false });

    if (!scrollTargetId || typeof window === "undefined") {
      return;
    }

    let attempts = 0;

    const tryScroll = () => {
      const target = document.getElementById(scrollTargetId);

      if (target) {
        target.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
        return;
      }

      attempts += 1;
      if (attempts < 12) {
        window.setTimeout(tryScroll, 120);
      }
    };

    window.setTimeout(tryScroll, 0);
  }

  function handleSearch() {
    const nextStart = startValue.trim().length > 0 ? startValue : defaultStartInput;
    const nextEnd = endValue.trim().length > 0 ? endValue : defaultEndInput;

    navigate(
      buildRecordSearchHref({
        q: queryValue,
        filter,
        selectedTags: selectedTagLabels,
        selectedGenres: selectedGenreLabels,
        order,
        start: nextStart,
        end: nextEnd,
        showTags: showAllTags,
        showGenres: showAllGenres,
      }),
      "record-search-results"
    );
  }

  function handleClear() {
    setQueryValue("");
    setStartValue(defaultStartInput);
    setEndValue(defaultEndInput);
    setGenreLimitMessage("");

    navigate(buildRecordSearchHref({}));
  }

  function handleGenreToggle(label: string) {
    const result = toggleSelectedGenreLabels(selectedGenreLabels, label);

    if (result.overLimit) {
      setGenreLimitMessage("ジャンルは3つまで選択可能");
      return;
    }

    setGenreLimitMessage("");

    navigate(
      buildRecordSearchHref({
        q: queryValue,
        filter,
        selectedTags: selectedTagLabels,
        selectedGenres: result.nextLabels,
        order,
        start: startValue,
        end: endValue,
        showTags: showAllTags,
        showGenres: showAllGenres,
      })
    );
  }

  return (
    <section className="rounded-[28px] border border-black/10 bg-white p-5 shadow-sm sm:p-6 lg:p-8">
      <div>
        <p className="text-[11px] tracking-[0.24em] text-neutral-500">
          RECORD SEARCH
        </p>
        <h2 className="mt-3 text-2xl font-bold leading-tight text-black sm:text-3xl">
          朗読作品を探す
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-8 text-neutral-600 sm:text-[15px]">
          公開中の朗読関連作品を、検索語、ジャンル、タグ、期間、並び順、朗読向けフィルタで絞り込む。
        </p>
      </div>

      <div className="mt-6 grid gap-3">
        <input
          type="text"
          value={queryValue}
          onChange={(event) => setQueryValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              handleSearch();
            }
          }}
          placeholder="作品名、作者名、あらすじなどで検索"
          className="h-12 rounded-2xl border border-black/10 bg-white px-4 text-sm text-black outline-none placeholder:text-neutral-400 focus:border-sky-200"
        />
      </div>

      <div className="mt-6 grid gap-3">
        <div className="min-h-12 rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm">
          {selectedFilterChips.length === 0 ? (
            <div className="flex min-h-6 items-center text-neutral-400">
              ジャンル / タグで絞る（左に表示されてるものほど強く参照される）
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {selectedFilterChips.map((chip) =>
                chip.type === "genre" ? (
                  <SearchNavButton
                    key={`selected-genre-${chip.label}`}
                    href={buildRecordSearchHref({
                      q: queryValue,
                      filter,
                      selectedTags: selectedTagLabels,
                      selectedGenres: selectedGenreLabels.filter(
                        (item) => item !== chip.label
                      ),
                      order,
                      start: startValue,
                      end: endValue,
                      showTags: showAllTags,
                      showGenres: showAllGenres,
                    })}
                    className="rounded-full border border-violet-200 bg-violet-50 px-4 py-2 text-sm text-violet-700 transition hover:bg-violet-100"
                  >
                    {chip.label} ×
                  </SearchNavButton>
                ) : (
                  <SearchNavButton
                    key={`selected-tag-${chip.label}`}
                    href={buildRecordSearchHref({
                      q: queryValue,
                      filter,
                      selectedTags: selectedTagLabels.filter(
                        (item) =>
                          normalizeTagToken(item) !== normalizeTagToken(chip.label)
                      ),
                      selectedGenres: selectedGenreLabels,
                      order,
                      start: startValue,
                      end: endValue,
                      showTags: showAllTags,
                      showGenres: showAllGenres,
                    })}
                    className="rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-sm text-black transition hover:bg-sky-100"
                  >
                    {chip.label} ×
                  </SearchNavButton>
                )
              )}
            </div>
          )}
        </div>

        {(query.length > 0 ||
          selectedTagLabels.length > 0 ||
          selectedGenreLabels.length > 0 ||
          selectedStartInput !== defaultStartInput ||
          selectedEndInput !== defaultEndInput ||
          filter !== "all" ||
          order !== "popular") ? (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleClear}
              className="text-sm text-neutral-500 transition hover:text-black"
            >
              条件をクリア
            </button>
          </div>
        ) : null}
      </div>

      <div className="mt-6 grid gap-4">
        <div>
          <p className="text-[11px] tracking-[0.18em] text-neutral-500">
            朗読フィルタ
          </p>

          <div className="mt-2 flex flex-wrap gap-2">
            {VISIBLE_FILTER_OPTIONS.map((option) => (
              <SearchNavButton
                key={option.value}
                href={buildRecordSearchHref({
                  q: queryValue,
                  filter: option.value,
                  selectedTags: selectedTagLabels,
                  selectedGenres: selectedGenreLabels,
                  order,
                  start: startValue,
                  end: endValue,
                  showTags: showAllTags,
                  showGenres: showAllGenres,
                })}
                className={[
                  "rounded-full border px-4 py-2 text-sm transition",
                  filter === option.value
                    ? "border-sky-200 bg-sky-50 text-black"
                    : "border-black/10 bg-white text-neutral-700 hover:bg-neutral-50",
                ].join(" ")}
              >
                {option.label}
              </SearchNavButton>
            ))}
          </div>
        </div>

        <div>
          <p className="text-[11px] tracking-[0.18em] text-neutral-500">
            ジャンル
          </p>

          <div className="mt-2 flex items-center gap-2 overflow-hidden">
            <div className="min-w-0 flex-1 overflow-hidden">
              {showAllGenres ? (
                <div className="flex flex-wrap gap-2">
                  {visibleGenreChips.map((genre) => {
                    const active = selectedGenreLabels.includes(genre.label);

                    return (
                      <button
                        key={genre.key}
                        type="button"
                        onClick={() => handleGenreToggle(genre.label)}
                        className={[
                          "rounded-full border px-3 py-2 text-sm transition",
                          active
                            ? "border-violet-300 bg-violet-100 text-violet-800"
                            : "border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100",
                        ].join(" ")}
                      >
                        {genre.label}
                        <span className="ml-2 text-violet-400">{genre.count}</span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-nowrap gap-2 overflow-hidden">
                  {visibleGenreChips.map((genre) => {
                    const active = selectedGenreLabels.includes(genre.label);

                    return (
                      <button
                        key={genre.key}
                        type="button"
                        onClick={() => handleGenreToggle(genre.label)}
                        className={[
                          "shrink-0 rounded-full border px-3 py-2 text-sm transition",
                          active
                            ? "border-violet-300 bg-violet-100 text-violet-800"
                            : "border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100",
                        ].join(" ")}
                      >
                        {genre.label}
                        <span className="ml-2 text-violet-400">{genre.count}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {hasHiddenGenres ? (
              <SearchNavButton
                href={buildRecordSearchHref({
                  q: queryValue,
                  filter,
                  selectedTags: selectedTagLabels,
                  selectedGenres: selectedGenreLabels,
                  order,
                  start: startValue,
                  end: endValue,
                  showTags: showAllTags,
                  showGenres: !showAllGenres,
                })}
                className="shrink-0 text-sm text-neutral-500 transition hover:text-black"
              >
                {showAllGenres ? "閉じる" : "さらに表示"}
              </SearchNavButton>
            ) : null}
          </div>

          {genreLimitMessage ? (
            <p className="mt-2 text-sm text-red-500">{genreLimitMessage}</p>
          ) : null}
        </div>

        <div>
          <p className="text-[11px] tracking-[0.18em] text-neutral-500">
            タグ
          </p>

          <div className="mt-2 flex items-center gap-2 overflow-hidden">
            <div className="min-w-0 flex-1 overflow-hidden">
              {showAllTags ? (
                <div className="flex flex-wrap gap-2">
                  {visibleTagChips.map((tag) => {
                    const active = selectedTagLabels.some(
                      (item) => normalizeTagToken(item) === tag.value
                    );

                    return (
                      <SearchNavButton
                        key={tag.value}
                        href={buildRecordSearchHref({
                          q: queryValue,
                          filter,
                          selectedTags: toggleSelectedTagLabels(
                            selectedTagLabels,
                            tag.label
                          ),
                          selectedGenres: selectedGenreLabels,
                          order,
                          start: startValue,
                          end: endValue,
                          showTags: true,
                          showGenres: showAllGenres,
                        })}
                        className={[
                          "rounded-full border px-3 py-2 text-sm transition",
                          active
                            ? "border-sky-200 bg-sky-50 text-black"
                            : "border-black/10 bg-white text-neutral-700 hover:border-sky-200 hover:bg-sky-50 hover:text-black",
                        ].join(" ")}
                      >
                        {tag.label}
                        <span className="ml-2 text-neutral-400">{tag.count}</span>
                      </SearchNavButton>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-nowrap gap-2 overflow-hidden">
                  {visibleTagChips.map((tag) => {
                    const active = selectedTagLabels.some(
                      (item) => normalizeTagToken(item) === tag.value
                    );

                    return (
                      <SearchNavButton
                        key={tag.value}
                        href={buildRecordSearchHref({
                          q: queryValue,
                          filter,
                          selectedTags: toggleSelectedTagLabels(
                            selectedTagLabels,
                            tag.label
                          ),
                          selectedGenres: selectedGenreLabels,
                          order,
                          start: startValue,
                          end: endValue,
                          showTags: false,
                          showGenres: showAllGenres,
                        })}
                        className={[
                          "shrink-0 rounded-full border px-3 py-2 text-sm transition",
                          active
                            ? "border-sky-200 bg-sky-50 text-black"
                            : "border-black/10 bg-white text-neutral-700 hover:border-sky-200 hover:bg-sky-50 hover:text-black",
                        ].join(" ")}
                      >
                        {tag.label}
                        <span className="ml-2 text-neutral-400">{tag.count}</span>
                      </SearchNavButton>
                    );
                  })}
                </div>
              )}
            </div>

            {hasHiddenTags ? (
              <SearchNavButton
                href={buildRecordSearchHref({
                  q: queryValue,
                  filter,
                  selectedTags: selectedTagLabels,
                  selectedGenres: selectedGenreLabels,
                  order,
                  start: startValue,
                  end: endValue,
                  showTags: !showAllTags,
                  showGenres: showAllGenres,
                })}
                className="shrink-0 text-sm text-neutral-500 transition hover:text-black"
              >
                {showAllTags ? "閉じる" : "さらに表示"}
              </SearchNavButton>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div>
          <p className="text-[11px] tracking-[0.18em] text-neutral-500">
            ORDER
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            <SearchNavButton
              href={buildRecordSearchHref({
                q: queryValue,
                filter,
                selectedTags: selectedTagLabels,
                selectedGenres: selectedGenreLabels,
                order: "popular",
                start: startValue,
                end: endValue,
                showTags: showAllTags,
                showGenres: showAllGenres,
              })}
              className={[
                "rounded-full border px-4 py-2 text-sm transition",
                order === "popular"
                  ? "border-sky-200 bg-sky-50 text-black"
                  : "border-black/10 bg-white text-neutral-700 hover:bg-neutral-50",
              ].join(" ")}
            >
              人気順
            </SearchNavButton>

            <SearchNavButton
              href={buildRecordSearchHref({
                q: queryValue,
                filter,
                selectedTags: selectedTagLabels,
                selectedGenres: selectedGenreLabels,
                order: "updated",
                start: startValue,
                end: endValue,
                showTags: showAllTags,
                showGenres: showAllGenres,
              })}
              className={[
                "rounded-full border px-4 py-2 text-sm transition",
                order === "updated"
                  ? "border-sky-200 bg-sky-50 text-black"
                  : "border-black/10 bg-white text-neutral-700 hover:bg-neutral-50",
              ].join(" ")}
            >
              更新順
            </SearchNavButton>

            <SearchNavButton
              href={buildRecordSearchHref({
                q: queryValue,
                filter,
                selectedTags: selectedTagLabels,
                selectedGenres: selectedGenreLabels,
                order: "narration",
                start: startValue,
                end: endValue,
                showTags: showAllTags,
                showGenres: showAllGenres,
              })}
              className={[
                "rounded-full border px-4 py-2 text-sm transition",
                order === "narration"
                  ? "border-sky-200 bg-sky-50 text-black"
                  : "border-black/10 bg-white text-neutral-700 hover:bg-neutral-50",
              ].join(" ")}
            >
              朗読視聴順
            </SearchNavButton>
          </div>
        </div>

        <div>
          <p className="text-[11px] tracking-[0.18em] text-neutral-500">
            PERIOD
          </p>

          <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
            <input
              type="date"
              value={startValue}
              onChange={(event) => setStartValue(event.target.value)}
              className="h-12 min-w-0 rounded-2xl border border-black/10 bg-white px-4 text-sm text-black outline-none focus:border-sky-200"
            />

            <span className="text-sm text-neutral-500">〜</span>

            <input
              type="date"
              value={endValue}
              onChange={(event) => setEndValue(event.target.value)}
              className="h-12 min-w-0 rounded-2xl border border-black/10 bg-white px-4 text-sm text-black outline-none focus:border-sky-200"
            />
          </div>
        </div>
      </div>

      <div className="mt-8 flex justify-end">
        <button
          type="button"
          onClick={handleSearch}
          className="inline-flex h-12 items-center justify-center rounded-2xl border border-black/10 bg-neutral-200 px-6 text-sm font-medium text-black transition hover:bg-neutral-300"
        >
          検索する
        </button>
      </div>
    </section>
  );
}