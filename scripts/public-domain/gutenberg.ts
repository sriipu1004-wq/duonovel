export function isAllowedGutenbergTextUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "www.gutenberg.org" ||
      url.username ||
      url.password ||
      url.port ||
      url.search ||
      url.hash
    ) {
      return false;
    }
    const match = /^\/cache\/epub\/(\d+)\/pg(\d+)\.txt$/u.exec(url.pathname);
    return Boolean(match && match[1] === match[2]);
  } catch {
    return false;
  }
}

export function gutenbergEbookNumberFromTextUrl(value: string): number | null {
  if (!isAllowedGutenbergTextUrl(value)) return null;
  const url = new URL(value);
  const match = /^\/cache\/epub\/(\d+)\/pg\d+\.txt$/u.exec(url.pathname);
  return match ? Number(match[1]) : null;
}
