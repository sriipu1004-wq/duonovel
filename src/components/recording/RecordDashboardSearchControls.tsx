"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import SearchNavButton from "@/components/search/SearchNavButton";
import PublicSearchLanguageFilters from "@/components/search/PublicSearchLanguageFilters";
import type { SupportedLanguageTag } from "@/lib/translation/languageRegistry";
import { useUiLocale } from "@/i18n/UiLocaleProvider";
import { localizePath } from "@/i18n/navigation";
import type { UiLocale } from "@/i18n/config";

type RecordFilter = "all" | "submitted" | "ready" | "bookmarked";
type LanguageCounts = Partial<Record<SupportedLanguageTag, number>>;
type RecordOrderKey = "popular" | "updated" | "narration";

type TagChip = { value: string; label: string; count: number };
type GenreChip = { key: string; label: string; count: number };

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
  sourceLanguages: SupportedLanguageTag[];
  sourceLanguageCounts: LanguageCounts;
};

type Copy = {
  title: string;
  description: string;
  placeholder: string;
  emptyFilters: string;
  clear: string;
  narrationFilter: string;
  all: string;
  submitted: string;
  ready: string;
  bookmarked: string;
  genre: string;
  tags: string;
  collapse: string;
  more: string;
  genreLimit: string;
  popular: string;
  updated: string;
  narration: string;
  search: string;
};

const COPY: Record<UiLocale, Copy> = {
  ja: {
    title: "朗読作品を探す",
    description:
      "公開中の朗読関連作品を、検索語、ジャンル、タグ、期間、並び順、朗読向けフィルタで絞り込む。",
    placeholder: "作品名、作者名、あらすじなどで検索",
    emptyFilters: "ジャンル / タグで絞る（左に表示されてるものほど強く参照される）",
    clear: "条件をクリア",
    narrationFilter: "朗読フィルタ",
    all: "公開朗読",
    submitted: "投稿済",
    ready: "朗読可",
    bookmarked: "ブックマーク",
    genre: "ジャンル",
    tags: "タグ",
    collapse: "閉じる",
    more: "さらに表示",
    genreLimit: "ジャンルは3つまで選択可能",
    popular: "人気順",
    updated: "更新順",
    narration: "朗読視聴順",
    search: "検索する",
  },
  en: {
    title: "Find narration-ready works",
    description:
      "Filter public narration-related works by keyword, genre, tag, period, sort order, and narration status.",
    placeholder: "Search by title, author, summary, and more",
    emptyFilters: "Filter by genre / tag (items further left are weighted more strongly)",
    clear: "Clear filters",
    narrationFilter: "Narration filter",
    all: "Published narration",
    submitted: "Submitted",
    ready: "Available",
    bookmarked: "Bookmarked",
    genre: "Genre",
    tags: "Tags",
    collapse: "Collapse",
    more: "Show more",
    genreLimit: "You can select up to 3 genres.",
    popular: "Popular",
    updated: "Updated",
    narration: "Narration plays",
    search: "Search",
  },
  ko: {
    title: "낭독 가능한 작품 찾기",
    description:
      "공개 중인 낭독 관련 작품을 검색어, 장르, 태그, 기간, 정렬, 낭독 상태로 필터링합니다.",
    placeholder: "작품명, 작가명, 줄거리 등으로 검색",
    emptyFilters: "장르 / 태그로 필터링 (왼쪽 항목일수록 더 강하게 반영)",
    clear: "조건 지우기",
    narrationFilter: "낭독 필터",
    all: "공개 낭독",
    submitted: "제출 완료",
    ready: "낭독 가능",
    bookmarked: "북마크",
    genre: "장르",
    tags: "태그",
    collapse: "접기",
    more: "더 보기",
    genreLimit: "장르는 최대 3개까지 선택할 수 있습니다.",
    popular: "인기순",
    updated: "업데이트순",
    narration: "낭독 재생순",
    search: "검색",
  },
};

const FILTER_VALUES: RecordFilter[] = [
  "all",
  "submitted",
  "ready",
  "bookmarked",
];

function normalizeTagToken(value: string): string {
  return value.trim().replace(/^#+/, "").toLowerCase();
}

function formatTagLabel(value: string): string {
  const trimmed = value.trim().replace(/^#+/, "");
  return trimmed ? `#${trimmed}` : "";
}

function toggleSelectedTagLabels(current: string[], nextLabel: string): string[] {
  const formatted = formatTagLabel(nextLabel);
  if (!formatted) return current;
  const normalizedTarget = normalizeTagToken(formatted);
  const exists = current.some((item) => normalizeTagToken(item) === normalizedTarget);
  return exists
    ? current.filter((item) => normalizeTagToken(item) !== normalizedTarget)
    : [...current, formatted];
}

function toggleSelectedGenreLabels(current: string[], nextLabel: string): {
  nextLabels: string[];
  overLimit: boolean;
} {
  const trimmed = nextLabel.trim();
  if (!trimmed) return { nextLabels: current, overLimit: false };
  if (current.includes(trimmed)) {
    return { nextLabels: current.filter((item) => item !== trimmed), overLimit: false };
  }
  if (current.length >= 3) return { nextLabels: current, overLimit: true };
  return { nextLabels: [...current, trimmed], overLimit: false };
}

function buildRecordSearchHref(
  locale: UiLocale,
  params: {
    q?: string;
    filter?: RecordFilter;
    selectedTags?: string[];
    selectedGenres?: string[];
    order?: RecordOrderKey;
    start?: string;
    end?: string;
    showTags?: boolean;
    showGenres?: boolean;
  }
): string {
  const query = new URLSearchParams();
  if (params.q?.trim()) query.set("q", params.q.trim());
  if (params.filter && params.filter !== "all") query.set("filter", params.filter);
  if (params.selectedTags?.length) query.set("tags", params.selectedTags.join(","));
  if (params.selectedGenres?.length) query.set("genres", params.selectedGenres.join(","));
  if (params.order) query.set("order", params.order);
  if (params.start) query.set("start", params.start);
  if (params.end) query.set("end", params.end);
  if (params.showTags) query.set("showTags", "1");
  if (params.showGenres) query.set("showGenres", "1");
  if (params.sourceLanguages?.length) {
    query.set("source_language", params.sourceLanguages.join(","));
  }
  const base = localizePath("/record", locale);
  const queryString = query.toString();
  return queryString ? `${base}?${queryString}` : base;
}

export default function RecordDashboardSearchControls(props: RecordDashboardSearchControlsProps) {
  const {
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
    sourceLanguages: initialSourceLanguages,
    sourceLanguageCounts,
  } = props;
  const locale = useUiLocale();
  const copy = COPY[locale];
  const router = useRouter();
  const [queryValue, setQueryValue] = useState(query);
  const [startValue, setStartValue] = useState(selectedStartInput);
  const [endValue, setEndValue] = useState(selectedEndInput);
  const [genreLimitMessage, setGenreLimitMessage] = useState("");
  const [sourceLanguages, setSourceLanguages] =
    useState<SupportedLanguageTag[]>(initialSourceLanguages);

  useEffect(() => setQueryValue(query), [query]);
  useEffect(() => setStartValue(selectedStartInput), [selectedStartInput]);
  useEffect(() => setEndValue(selectedEndInput), [selectedEndInput]);
  useEffect(() => setGenreLimitMessage(""), [selectedGenreLabels]);
  useEffect(() => setSourceLanguages(initialSourceLanguages), [initialSourceLanguages]);

  const selectedFilterChips = useMemo(
    () => [
      ...selectedGenreLabels.map((label) => ({ type: "genre" as const, label })),
      ...selectedTagLabels.map((label) => ({ type: "tag" as const, label })),
    ],
    [selectedGenreLabels, selectedTagLabels]
  );

  const href = (overrides: Parameters<typeof buildRecordSearchHref>[1] = {}) =>
    buildRecordSearchHref(locale, {
      q: queryValue,
      filter,
      selectedTags: selectedTagLabels,
      selectedGenres: selectedGenreLabels,
      order,
      start: startValue,
      end: endValue,
      showTags: showAllTags,
      showGenres: showAllGenres,
      sourceLanguages,
      ...overrides,
    });

  function navigate(nextHref: string, scrollTargetId?: string) {
    router.replace(nextHref, { scroll: false });
    if (!scrollTargetId || typeof window === "undefined") return;
    let attempts = 0;
    const tryScroll = () => {
      const target = document.getElementById(scrollTargetId);
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
      attempts += 1;
      if (attempts < 12) window.setTimeout(tryScroll, 120);
    };
    window.setTimeout(tryScroll, 0);
  }

  function handleSearch() {
    navigate(
      href({
        start: startValue.trim() || defaultStartInput,
        end: endValue.trim() || defaultEndInput,
      }),
      "record-search-results"
    );
  }

  function handleClear() {
    setQueryValue("");
    setStartValue(defaultStartInput);
    setEndValue(defaultEndInput);
    setGenreLimitMessage("");
    setSourceLanguages([]);
    navigate(buildRecordSearchHref(locale, {}));
  }

  function handleGenreToggle(label: string) {
    const result = toggleSelectedGenreLabels(selectedGenreLabels, label);
    if (result.overLimit) {
      setGenreLimitMessage(copy.genreLimit);
      return;
    }
    setGenreLimitMessage("");
    navigate(href({ selectedGenres: result.nextLabels }));
  }

  const filterLabels: Record<RecordFilter, string> = {
    all: copy.all,
    submitted: copy.submitted,
    ready: copy.ready,
    bookmarked: copy.bookmarked,
  };

  return (
    <section className="rounded-[28px] border border-black/10 bg-white p-5 shadow-sm sm:p-6 lg:p-8">
      <div>
        <p className="text-[11px] tracking-[0.24em] text-neutral-500">RECORD SEARCH</p>
        <h2 className="mt-3 text-2xl font-bold leading-tight text-black sm:text-3xl">{copy.title}</h2>
        <p className="mt-3 max-w-3xl text-sm leading-8 text-neutral-600 sm:text-[15px]">{copy.description}</p>
      </div>

      <PublicSearchLanguageFilters
        sourceLanguages={sourceLanguages}
        countsOverride={sourceLanguageCounts}
        onSourceLanguagesChange={(nextLanguages) => {
          setSourceLanguages(nextLanguages);
          navigate(
            href({ sourceLanguages: nextLanguages }),
            "record-search-results"
          );
        }}
      />

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
          placeholder={copy.placeholder}
          className="h-12 rounded-2xl border border-black/10 bg-white px-4 text-sm text-black outline-none placeholder:text-neutral-400 focus:border-sky-200"
        />
      </div>

      <div className="mt-6 grid gap-3">
        <div className="min-h-12 rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm">
          {selectedFilterChips.length === 0 ? (
            <div className="flex min-h-6 items-center text-neutral-400">{copy.emptyFilters}</div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {selectedFilterChips.map((chip) => (
                <SearchNavButton
                  key={`${chip.type}-${chip.label}`}
                  href={href(
                    chip.type === "genre"
                      ? { selectedGenres: selectedGenreLabels.filter((item) => item !== chip.label) }
                      : {
                          selectedTags: selectedTagLabels.filter(
                            (item) => normalizeTagToken(item) !== normalizeTagToken(chip.label)
                          ),
                        }
                  )}
                  className={
                    chip.type === "genre"
                      ? "rounded-full border border-violet-200 bg-violet-50 px-4 py-2 text-sm text-violet-700 transition hover:bg-violet-100"
                      : "rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-sm text-black transition hover:bg-sky-100"
                  }
                >
                  {chip.label} ×
                </SearchNavButton>
              ))}
            </div>
          )}
        </div>

        {query.length > 0 ||
        selectedTagLabels.length > 0 ||
        selectedGenreLabels.length > 0 ||
        selectedStartInput !== defaultStartInput ||
        selectedEndInput !== defaultEndInput ||
        filter !== "all" ||
        order !== "popular" ? (
          <div className="flex justify-end">
            <button type="button" onClick={handleClear} className="text-sm text-neutral-500 transition hover:text-black">
              {copy.clear}
            </button>
          </div>
        ) : null}
      </div>

      <div className="mt-6 grid gap-4">
        <div>
          <p className="text-[11px] tracking-[0.18em] text-neutral-500">{copy.narrationFilter}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {FILTER_VALUES.map((value) => (
              <SearchNavButton
                key={value}
                href={href({ filter: value })}
                className={[
                  "rounded-full border px-4 py-2 text-sm transition",
                  filter === value
                    ? "border-sky-200 bg-sky-50 text-black"
                    : "border-black/10 bg-white text-neutral-700 hover:bg-neutral-50",
                ].join(" ")}
              >
                {filterLabels[value]}
              </SearchNavButton>
            ))}
          </div>
        </div>

        <div>
          <p className="text-[11px] tracking-[0.18em] text-neutral-500">{copy.genre}</p>
          <div className="mt-2 flex items-center gap-2 overflow-hidden">
            <div className="min-w-0 flex-1 overflow-hidden">
              <div className={showAllGenres ? "flex flex-wrap gap-2" : "flex flex-nowrap gap-2 overflow-hidden"}>
                {visibleGenreChips.map((genre) => {
                  const active = selectedGenreLabels.includes(genre.label);
                  return (
                    <button
                      key={genre.key}
                      type="button"
                      onClick={() => handleGenreToggle(genre.label)}
                      className={[
                        showAllGenres ? "" : "shrink-0",
                        "rounded-full border px-3 py-2 text-sm transition",
                        active
                          ? "border-violet-300 bg-violet-100 text-violet-800"
                          : "border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100",
                      ].join(" ")}
                    >
                      {genre.label}<span className="ml-2 text-violet-400">{genre.count}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            {hasHiddenGenres ? (
              <SearchNavButton href={href({ showGenres: !showAllGenres })} className="shrink-0 text-sm text-neutral-500 transition hover:text-black">
                {showAllGenres ? copy.collapse : copy.more}
              </SearchNavButton>
            ) : null}
          </div>
          {genreLimitMessage ? <p className="mt-2 text-sm text-red-500">{genreLimitMessage}</p> : null}
        </div>

        <div>
          <p className="text-[11px] tracking-[0.18em] text-neutral-500">{copy.tags}</p>
          <div className="mt-2 flex items-center gap-2 overflow-hidden">
            <div className="min-w-0 flex-1 overflow-hidden">
              <div className={showAllTags ? "flex flex-wrap gap-2" : "flex flex-nowrap gap-2 overflow-hidden"}>
                {visibleTagChips.map((tag) => {
                  const active = selectedTagLabels.some((item) => normalizeTagToken(item) === tag.value);
                  return (
                    <SearchNavButton
                      key={tag.value}
                      href={href({
                        selectedTags: toggleSelectedTagLabels(selectedTagLabels, tag.label),
                        showTags: showAllTags,
                      })}
                      className={[
                        showAllTags ? "" : "shrink-0",
                        "rounded-full border px-3 py-2 text-sm transition",
                        active
                          ? "border-sky-200 bg-sky-50 text-black"
                          : "border-black/10 bg-white text-neutral-700 hover:border-sky-200 hover:bg-sky-50 hover:text-black",
                      ].join(" ")}
                    >
                      {tag.label}<span className="ml-2 text-neutral-400">{tag.count}</span>
                    </SearchNavButton>
                  );
                })}
              </div>
            </div>
            {hasHiddenTags ? (
              <SearchNavButton href={href({ showTags: !showAllTags })} className="shrink-0 text-sm text-neutral-500 transition hover:text-black">
                {showAllTags ? copy.collapse : copy.more}
              </SearchNavButton>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div>
          <p className="text-[11px] tracking-[0.18em] text-neutral-500">ORDER</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {([
              ["popular", copy.popular],
              ["updated", copy.updated],
              ["narration", copy.narration],
            ] as const).map(([value, label]) => (
              <SearchNavButton
                key={value}
                href={href({ order: value })}
                className={[
                  "rounded-full border px-4 py-2 text-sm transition",
                  order === value
                    ? "border-sky-200 bg-sky-50 text-black"
                    : "border-black/10 bg-white text-neutral-700 hover:bg-neutral-50",
                ].join(" ")}
              >
                {label}
              </SearchNavButton>
            ))}
          </div>
        </div>

        <div>
          <p className="text-[11px] tracking-[0.18em] text-neutral-500">PERIOD</p>
          <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
            <input
              type="date"
              value={startValue}
              onChange={(event) => setStartValue(event.target.value)}
              className="h-12 min-w-0 rounded-2xl border border-black/10 bg-white px-4 text-sm text-black outline-none focus:border-sky-200"
            />
            <span className="text-sm text-neutral-500">–</span>
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
          {copy.search}
        </button>
      </div>
    </section>
  );
}
