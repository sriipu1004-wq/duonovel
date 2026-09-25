export const PUBLIC_SEARCH_QUERY_MAX_LENGTH = 120;

export type PublicSearchMatchCandidate = {
  title: string;
  originalTitle?: string | null;
  summary: string;
  authorName: string;
  tags: string[];
  genres: string[];
};

export function clampPublicSearchQuery(value: string): string {
  return value.trim().slice(0, PUBLIC_SEARCH_QUERY_MAX_LENGTH);
}

export function normalizePublicSearchText(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[\u2018\u2019\u201B\u2032']/gu, "")
    .replace(/[\p{P}\p{S}]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function compactSearchText(value: string): string {
  return normalizePublicSearchText(value).replace(/\s+/gu, "");
}

function tokenize(value: string): string[] {
  return normalizePublicSearchText(value)
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean);
}

function isLatinToken(value: string): boolean {
  return /^[a-z0-9]+$/u.test(value);
}

function isCjkToken(value: string): boolean {
  return /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(
    value
  );
}

function tokenMatches(queryToken: string, targetToken: string): boolean {
  if (!queryToken || !targetToken) return false;
  if (queryToken === targetToken) return true;
  if (targetToken.startsWith(queryToken) || queryToken.startsWith(targetToken)) {
    return true;
  }
  if (isCjkToken(queryToken) && queryToken.length >= 2 && targetToken.includes(queryToken)) {
    return true;
  }
  return false;
}

function boundedLevenshtein(left: string, right: string, maxDistance: number): number {
  if (left === right) return 0;
  if (Math.abs(left.length - right.length) > maxDistance) return maxDistance + 1;

  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let i = 1; i <= left.length; i += 1) {
    const current = [i];
    let rowMinimum = current[0];

    for (let j = 1; j <= right.length; j += 1) {
      const substitutionCost = left[i - 1] === right[j - 1] ? 0 : 1;
      const value = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + substitutionCost
      );
      current.push(value);
      rowMinimum = Math.min(rowMinimum, value);
    }

    if (rowMinimum > maxDistance) return maxDistance + 1;
    previous = current;
  }

  return previous[right.length] ?? maxDistance + 1;
}

function fuzzyTokenMatches(queryToken: string, targetToken: string): boolean {
  if (tokenMatches(queryToken, targetToken)) return true;
  if (!isLatinToken(queryToken) || !isLatinToken(targetToken)) return false;
  if (queryToken.length < 4 || targetToken.length < 4) return false;

  const maxDistance = Math.max(queryToken.length, targetToken.length) >= 9 ? 2 : 1;
  return boundedLevenshtein(queryToken, targetToken, maxDistance) <= maxDistance;
}

function everyQueryTokenMatches(
  queryTokens: string[],
  targetTokens: string[],
  matcher: (queryToken: string, targetToken: string) => boolean
): boolean {
  return queryTokens.every((queryToken) =>
    targetTokens.some((targetToken) => matcher(queryToken, targetToken))
  );
}

export function getPublicSearchMatchScore(
  rawQuery: string,
  work: PublicSearchMatchCandidate
): number {
  const query = clampPublicSearchQuery(rawQuery);
  if (!query) return 1;

  const normalizedQuery = normalizePublicSearchText(query);
  const compactQuery = compactSearchText(query);
  if (!normalizedQuery || !compactQuery) return 0;

  const normalizedTitle = normalizePublicSearchText(work.title);
  const compactTitle = compactSearchText(work.title);
  const normalizedOriginalTitle = normalizePublicSearchText(work.originalTitle ?? "");
  const compactOriginalTitle = compactSearchText(work.originalTitle ?? "");
  const normalizedAuthor = normalizePublicSearchText(work.authorName);
  const compactAuthor = compactSearchText(work.authorName);

  if (normalizedTitle === normalizedQuery) return 1000;
  if (compactTitle === compactQuery) return 990;
  if (normalizedOriginalTitle && normalizedOriginalTitle === normalizedQuery) return 980;
  if (compactOriginalTitle && compactOriginalTitle === compactQuery) return 970;
  if (normalizedAuthor === normalizedQuery || compactAuthor === compactQuery) return 960;

  if (
    normalizedTitle.startsWith(normalizedQuery) ||
    compactTitle.startsWith(compactQuery)
  ) {
    return 930;
  }
  if (
    normalizedOriginalTitle &&
    (normalizedOriginalTitle.startsWith(normalizedQuery) ||
      compactOriginalTitle.startsWith(compactQuery))
  ) {
    return 920;
  }

  const searchableText = [
    work.title,
    work.originalTitle ?? "",
    work.authorName,
    work.summary,
    work.tags.join(" "),
    work.genres.join(" "),
  ].join(" ");
  const normalizedTarget = normalizePublicSearchText(searchableText);
  const compactTarget = compactSearchText(searchableText);

  if (normalizedTarget.includes(normalizedQuery)) return 900;
  if (compactQuery.length >= 3 && compactTarget.includes(compactQuery)) return 880;

  const queryTokens = tokenize(query);
  const targetTokens = tokenize(searchableText);
  if (queryTokens.length === 0 || targetTokens.length === 0) return 0;

  if (everyQueryTokenMatches(queryTokens, targetTokens, tokenMatches)) {
    return 800;
  }

  if (everyQueryTokenMatches(queryTokens, targetTokens, fuzzyTokenMatches)) {
    return 620;
  }

  return 0;
}
