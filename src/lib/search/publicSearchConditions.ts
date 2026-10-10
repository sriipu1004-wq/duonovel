/**
 * Child84: preserve the canonical Search candidate predicate while designing
 * a future DB-side result paginator. SQL cutover must match this predicate for
 * query, self-excluded facets, saved filters and updated-date windows.
 *
 * Source-language filtering, narration-only shelf eligibility, popularity
 * scores and final sort order remain separate existing Search stages.
 */
export type PublicSearchConditionWork = {
  seriesId: string;
  authorId: string | null;
  tags: string[];
  genres: string[];
  latestPostedAtValue: number;
};

export type PublicSearchConditionArgs = {
  work: PublicSearchConditionWork;
  matchScore: number;
  selectedTagTokens: readonly string[];
  selectedGenreTokens: readonly string[];
  ignoredFacet?: "tag" | "genre";
  order: "popular" | "updated";
  startAtValue: number;
  endAtValue: number;
  savedFilter: string | null;
  savedFilterRequiresLogin: boolean;
  savedAuthorIds: ReadonlySet<string>;
  savedSeriesIds: ReadonlySet<string>;
};

function normalizeTag(value: string): string {
  return value.trim().replace(/^#+/, "").toLowerCase();
}

function normalizeGenre(value: string): string {
  return value.trim().toLowerCase();
}

export function matchesPublicSearchConditions({
  work,
  matchScore,
  selectedTagTokens,
  selectedGenreTokens,
  ignoredFacet,
  order,
  startAtValue,
  endAtValue,
  savedFilter,
  savedFilterRequiresLogin,
  savedAuthorIds,
  savedSeriesIds,
}: PublicSearchConditionArgs): boolean {
  if (matchScore <= 0) return false;

  const tagOk =
    ignoredFacet === "tag" ||
    selectedTagTokens.length === 0 ||
    selectedTagTokens.every((selectedToken) =>
      work.tags.some((tag) => normalizeTag(tag) === selectedToken)
    );

  const genreOk =
    ignoredFacet === "genre" ||
    selectedGenreTokens.length === 0 ||
    selectedGenreTokens.every((selectedToken) =>
      work.genres.some((genre) => normalizeGenre(genre) === selectedToken)
    );

  const dateOk =
    order === "popular" ||
    (work.latestPostedAtValue >= startAtValue &&
      work.latestPostedAtValue <= endAtValue);

  let savedOk = true;
  if (savedFilter) {
    if (savedFilterRequiresLogin) {
      savedOk = false;
    } else if (
      savedFilter === "followed-authors" ||
      savedFilter === "liked-authors"
    ) {
      savedOk = !!work.authorId && savedAuthorIds.has(work.authorId);
    } else {
      savedOk = savedSeriesIds.has(work.seriesId);
    }
  }

  return tagOk && genreOk && dateOk && savedOk;
}
