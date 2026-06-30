"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import SearchNavButton from "@/components/search/SearchNavButton";
import {
  getSavedFilterLabel,
  type SavedFilterKey,
} from "@/lib/searchSavedFilters";

type OrderKey = "popular" | "updated";

type ShelfTabKey =
  | "overall-popular"
  | "latest"
  | "weekly-new"
  | "narration-popular";

type TagChip = {
  value: string;
  label: string;
  count: number;
};

type GenrePlaceholderChip = {
  key: string;
  label: string;
  count: number;
};

type PublicSearchControlsProps = {
  query: string;
  selectedTagLabels: string[];
  selectedGenreLabels: string[];
  savedFilterKey?: SavedFilterKey | "";
  order: OrderKey;
  selectedStartInput: string;
  selectedEndInput: string;
  defaultStartInput: string;
  defaultEndInput: string;
  showAllTags: boolean;
  showAllGenres: boolean;
  shelfTab: ShelfTabKey;
  allTagChips: TagChip[];
  allGenreChips: GenrePlaceholderChip[];
};

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

function buildSearchHref(params: {
  q?: string;
  selectedTags?: string[];
  selectedGenres?: string[];
  saved?: SavedFilterKey | "";
  order?: OrderKey;
  start?: string;
  end?: string;
  showTags?: boolean;
  showGenres?: boolean;
  shelfTab?: ShelfTabKey;
}): string {
  const query = new URLSearchParams();

  if (params.q && params.q.trim().length > 0) {
    query.set("q", params.q.trim());
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

  if (params.saved) {
    query.set("saved", params.saved);
  }

  if (params.shelfTab) {
    query.set("shelfTab", params.shelfTab);
  }

  const queryString = query.toString();
  return queryString ? `/search?${queryString}` : "/search";
}

export default function PublicSearchControls({
  query,
  selectedTagLabels: initialSelectedTagLabels,
  selectedGenreLabels: initialSelectedGenreLabels,
  savedFilterKey,
  order,
  selectedStartInput,
  selectedEndInput,
  defaultStartInput,
  defaultEndInput,
  showAllTags: initialShowAllTags,
  showAllGenres: initialShowAllGenres,
  shelfTab,
  allTagChips,
  allGenreChips,
}: PublicSearchControlsProps) {
  const router = useRouter();

  const [queryValue, setQueryValue] = useState(query);
  const [startValue, setStartValue] = useState(selectedStartInput);
  const [endValue, setEndValue] = useState(selectedEndInput);
  const [genreLimitMessage, setGenreLimitMessage] = useState("");
  const [localSelectedTagLabels, setLocalSelectedTagLabels] = useState(
    initialSelectedTagLabels
  );
  const [localSelectedGenreLabels, setLocalSelectedGenreLabels] = useState(
    initialSelectedGenreLabels
  );
  const [localShowAllTags, setLocalShowAllTags] = useState(
    initialShowAllTags
  );
  const [localShowAllGenres, setLocalShowAllGenres] = useState(
    initialShowAllGenres
  );
  const [hasHiddenTags, setHasHiddenTags] = useState(false);
  const [hasHiddenGenres, setHasHiddenGenres] = useState(false);
  const tagChipListRef = useRef<HTMLDivElement>(null);
  const genreChipListRef = useRef<HTMLDivElement>(null);

  const selectedTagLabels = localSelectedTagLabels;
  const selectedGenreLabels = localSelectedGenreLabels;
  const showAllTags = localShowAllTags;
  const showAllGenres = localShowAllGenres;

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

  useEffect(() => {
    setLocalSelectedTagLabels(initialSelectedTagLabels);
  }, [initialSelectedTagLabels]);

  useEffect(() => {
    setLocalSelectedGenreLabels(initialSelectedGenreLabels);
  }, [initialSelectedGenreLabels]);

  useEffect(() => {
    setLocalShowAllTags(initialShowAllTags);
  }, [initialShowAllTags]);

  useEffect(() => {
    setLocalShowAllGenres(initialShowAllGenres);
  }, [initialShowAllGenres]);

  useEffect(() => {
    if (showAllTags) {
      setHasHiddenTags(false);
      return;
    }

    const container = tagChipListRef.current;

    if (!container) {
      return;
    }

    const updateOverflow = () => {
      setHasHiddenTags(container.scrollHeight > container.clientHeight + 1);
    };

    updateOverflow();

    if (typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(updateOverflow);
    observer.observe(container);

    return () => observer.disconnect();
  }, [allTagChips, showAllTags]);

  useEffect(() => {
    if (showAllGenres) {
      setHasHiddenGenres(false);
      return;
    }

    const container = genreChipListRef.current;

    if (!container) {
      return;
    }

    const updateOverflow = () => {
      setHasHiddenGenres(container.scrollHeight > container.clientHeight + 1);
    };

    updateOverflow();

    if (typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(updateOverflow);
    observer.observe(container);

    return () => observer.disconnect();
  }, [allGenreChips, showAllGenres]);

  const selectedFilterChips = useMemo(
    () => [
      ...(savedFilterKey
        ? [
            {
              type: "saved" as const,
              label: getSavedFilterLabel(savedFilterKey),
            },
          ]
        : []),
      ...selectedGenreLabels.map((label) => ({
        type: "genre" as const,
        label,
      })),
      ...selectedTagLabels.map((label) => ({
        type: "tag" as const,
        label,
      })),
    ],
    [savedFilterKey, selectedGenreLabels, selectedTagLabels]
  );

  const visibleTagChips = allTagChips;
  const visibleGenreChips = allGenreChips;

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
      buildSearchHref({
        q: queryValue,
        selectedTags: selectedTagLabels,
        selectedGenres: selectedGenreLabels,
        saved: savedFilterKey,
        order,
        start: nextStart,
        end: nextEnd,
        showTags: showAllTags,
        showGenres: showAllGenres,
        shelfTab,
      }),
      "results"
    );
  }

  function handleClear() {
    setQueryValue("");
    setStartValue(defaultStartInput);
    setEndValue(defaultEndInput);
    setGenreLimitMessage("");
    setLocalSelectedTagLabels([]);
    setLocalSelectedGenreLabels([]);

    navigate(
      buildSearchHref({
        saved: savedFilterKey,
        shelfTab,
        showTags: showAllTags,
        showGenres: showAllGenres,
      })
    );
  }

  function handleGenreToggle(label: string) {
    const result = toggleSelectedGenreLabels(selectedGenreLabels, label);

    if (result.overLimit) {
      setGenreLimitMessage("ジャンルは3つまで選択可能です");
      return;
    }

    setGenreLimitMessage("");
    setLocalSelectedGenreLabels(result.nextLabels);

    navigate(
      buildSearchHref({
        q: queryValue,
        selectedTags: selectedTagLabels,
        selectedGenres: result.nextLabels,
        saved: savedFilterKey,
        order,
        start: startValue,
        end: endValue,
        showTags: showAllTags,
        showGenres: showAllGenres,
        shelfTab,
      })
    );
  }

  function handleTagToggle(label: string) {
    const nextLabels = toggleSelectedTagLabels(selectedTagLabels, label);

    setLocalSelectedTagLabels(nextLabels);

    navigate(
      buildSearchHref({
        q: queryValue,
        selectedTags: nextLabels,
        selectedGenres: selectedGenreLabels,
        saved: savedFilterKey,
        order,
        start: startValue,
        end: endValue,
        showTags: showAllTags,
        showGenres: showAllGenres,
        shelfTab,
      })
    );
  }

  return (
    <section className="rounded-[28px] border border-black/10 bg-white p-5 shadow-sm sm:p-6 lg:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] tracking-[0.24em] text-neutral-500">
            PUBLIC SEARCH
          </p>
          <h1 className="mt-3 text-2xl font-bold leading-tight text-black sm:text-3xl">
            公開作品を探す
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-8 text-neutral-600 sm:text-[15px]">
            公開されている作品を、タグやジャンル、公開時期などから絞り込めます。
          </p>
        </div>
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
                chip.type === "saved" ? (
                  <SearchNavButton
                    key={`selected-saved-${chip.label}`}
                    href={buildSearchHref({
                      q: queryValue,
                      selectedTags: selectedTagLabels,
                      selectedGenres: selectedGenreLabels,
                      order,
                      start: startValue,
                      end: endValue,
                      showTags: showAllTags,
                      showGenres: showAllGenres,
                      shelfTab,
                    })}
                    className="rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-700 transition hover:bg-amber-100"
                  >
                    {chip.label} ×
                  </SearchNavButton>
                ) : chip.type === "genre" ? (
                  <SearchNavButton
                    key={`selected-genre-${chip.label}`}
                    href={buildSearchHref({
                      q: queryValue,
                      selectedTags: selectedTagLabels,
                      selectedGenres: selectedGenreLabels.filter(
                        (item) => item !== chip.label
                      ),
                      saved: savedFilterKey,
                      order,
                      start: startValue,
                      end: endValue,
                      showTags: showAllTags,
                      showGenres: showAllGenres,
                      shelfTab,
                    })}
                    className="rounded-full border border-violet-200 bg-violet-50 px-4 py-2 text-sm text-violet-700 transition hover:bg-violet-100"
                  >
                    {chip.label} ×
                  </SearchNavButton>
                ) : (
                  <SearchNavButton
                    key={`selected-tag-${chip.label}`}
                    href={buildSearchHref({
                      q: queryValue,
                      selectedTags: selectedTagLabels.filter(
                        (item) =>
                          normalizeTagToken(item) !== normalizeTagToken(chip.label)
                      ),
                      selectedGenres: selectedGenreLabels,
                      saved: savedFilterKey,
                      order,
                      start: startValue,
                      end: endValue,
                      showTags: showAllTags,
                      showGenres: showAllGenres,
                      shelfTab,
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
            ジャンル
          </p>

          <div className="relative mt-2 max-w-full">
            <div
              ref={genreChipListRef}
              className={
                showAllGenres
                  ? "flex flex-wrap gap-2"
                  : "flex max-h-[64px] flex-wrap gap-2 overflow-hidden pr-[88px]"
              }
            >
              {visibleGenreChips.map((genre) => {
                const active = selectedGenreLabels.includes(genre.label);

                return (
                  <button
                    key={genre.key}
                    type="button"
                    title={genre.label}
                    onClick={() => handleGenreToggle(genre.label)}
                    className={[
                      "inline-flex max-w-full items-center overflow-hidden rounded-full border px-2.5 py-1.5 text-xs leading-tight transition",
                      active
                        ? "border-violet-300 bg-violet-100 text-violet-800"
                        : "border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100",
                    ].join(" ")}
                  >
                    <span className="truncate">{genre.label}</span>
                    <span className="ml-1.5 shrink-0 text-[10px] text-violet-400">
                      {genre.count}
                    </span>
                  </button>
                );
              })}
            </div>

            {showAllGenres ? (
              <div className="mt-2">
                <button
                  type="button"
                  onClick={() => setLocalShowAllGenres(false)}
                  className="rounded-full border border-black/10 bg-white px-2.5 py-1.5 text-xs text-neutral-600 transition hover:bg-neutral-50"
                >
                  閉じる
                </button>
              </div>
            ) : hasHiddenGenres ? (
              <button
                type="button"
                onClick={() => setLocalShowAllGenres(true)}
                className="absolute bottom-0 right-0 rounded-full border border-black/10 bg-white px-2.5 py-1.5 text-xs text-neutral-600 shadow-[0_0_0_4px_white] transition hover:bg-neutral-50"
              >
                続きを表示
              </button>
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

          <div className="relative mt-2 max-w-full">
            <div
              ref={tagChipListRef}
              className={
                showAllTags
                  ? "flex flex-wrap gap-2"
                  : "flex max-h-[64px] flex-wrap gap-2 overflow-hidden pr-[88px]"
              }
            >
              {visibleTagChips.map((tag) => {
                const active = selectedTagLabels.some(
                  (item) => normalizeTagToken(item) === tag.value
                );

                return (
                  <button
                    key={tag.value}
                    type="button"
                    title={tag.label}
                    onClick={() => handleTagToggle(tag.label)}
                    className={[
                      "inline-flex max-w-full items-center overflow-hidden rounded-full border px-2.5 py-1.5 text-xs leading-tight transition",
                      active
                        ? "border-sky-200 bg-sky-50 text-black"
                        : "border-black/10 bg-white text-neutral-700 hover:border-sky-200 hover:bg-sky-50 hover:text-black",
                    ].join(" ")}
                  >
                    <span className="truncate">{tag.label}</span>
                    <span className="ml-2 shrink-0 text-neutral-400">
                      {tag.count}
                    </span>
                  </button>
                );
              })}
            </div>

            {showAllTags ? (
              <div className="mt-2">
                <button
                  type="button"
                  onClick={() => setLocalShowAllTags(false)}
                  className="rounded-full border border-black/10 bg-white px-2.5 py-1.5 text-xs text-neutral-600 transition hover:bg-neutral-50"
                >
                  閉じる
                </button>
              </div>
            ) : hasHiddenTags ? (
              <button
                type="button"
                onClick={() => setLocalShowAllTags(true)}
                className="absolute bottom-0 right-0 rounded-full border border-black/10 bg-white px-2.5 py-1.5 text-xs text-neutral-600 shadow-[0_0_0_4px_white] transition hover:bg-neutral-50"
              >
                続きを表示
              </button>
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
              href={buildSearchHref({
                q: queryValue,
                selectedTags: selectedTagLabels,
                selectedGenres: selectedGenreLabels,
                order: "popular",
                start: startValue,
                end: endValue,
                showTags: showAllTags,
                showGenres: showAllGenres,
                shelfTab,
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
              href={buildSearchHref({
                q: queryValue,
                selectedTags: selectedTagLabels,
                selectedGenres: selectedGenreLabels,
                order: "updated",
                start: startValue,
                end: endValue,
                showTags: showAllTags,
                showGenres: showAllGenres,
                shelfTab,
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