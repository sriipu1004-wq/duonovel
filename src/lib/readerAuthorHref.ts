function pickText(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return "";
}

export function isNemoReaderName(name: string): boolean {
  return name.startsWith("VOICEVOX Nemo");
}

export function isAivisReaderName(name: string): boolean {
  return name.startsWith("Aivis ");
}

export function getCanonicalNemoReaderKey(name: string): string {
  return `nemo:${name}`;
}

export function getCanonicalAivisReaderKey(name: string): string {
  return `aivis:${name}`;
}

export function getReaderNameFromSyntheticAuthorId(authorId: string): string {
  if (authorId.startsWith("nemo:")) return authorId.slice(5);
  if (authorId.startsWith("aivis:")) return authorId.slice(6);
  return "";
}

export function buildReaderAuthorHref(
  readerKey?: unknown,
  readerName?: unknown
): string {
  const normalizedReaderName = pickText(readerName);

  const normalizedReaderKey =
    normalizedReaderName && isNemoReaderName(normalizedReaderName)
      ? getCanonicalNemoReaderKey(normalizedReaderName)
      : normalizedReaderName && isAivisReaderName(normalizedReaderName)
        ? getCanonicalAivisReaderKey(normalizedReaderName)
        : pickText(readerKey, normalizedReaderName);

  if (!normalizedReaderKey) {
    return "/";
  }

  const query = new URLSearchParams();

  if (normalizedReaderName) {
    query.set("readerName", normalizedReaderName);
  }

  const queryString = query.toString();

  return `/authors/${encodeURIComponent(normalizedReaderKey)}${
    queryString ? `?${queryString}` : ""
  }`;
}