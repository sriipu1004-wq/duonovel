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

export function getCanonicalNemoReaderKey(name: string): string {
  return `nemo:${name}`;
}

export function getReaderNameFromSyntheticAuthorId(authorId: string): string {
  return authorId.startsWith("nemo:") ? authorId.slice(5) : "";
}

export function buildReaderAuthorHref(
  readerKey?: unknown,
  readerName?: unknown
): string {
  const normalizedReaderName = pickText(readerName);

  const normalizedReaderKey =
    normalizedReaderName && isNemoReaderName(normalizedReaderName)
      ? getCanonicalNemoReaderKey(normalizedReaderName)
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