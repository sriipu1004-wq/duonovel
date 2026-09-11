import type { UiLocale } from "./config";
import { stripUiLocalePrefix } from "./config";

function splitPathSuffix(value: string): { pathname: string; suffix: string } {
  const queryIndex = value.indexOf("?");
  const hashIndex = value.indexOf("#");
  const candidates = [queryIndex, hashIndex].filter((index) => index >= 0);
  const splitAt = candidates.length > 0 ? Math.min(...candidates) : value.length;
  return {
    pathname: value.slice(0, splitAt) || "/",
    suffix: value.slice(splitAt),
  };
}

export function localizePath(value: string, locale: UiLocale): string {
  if (!value.startsWith("/") || value.startsWith("//")) return value;

  const { pathname, suffix } = splitPathSuffix(value);
  const basePath = stripUiLocalePrefix(pathname);

  if (locale === "ja") {
    return `${basePath}${suffix}`;
  }

  const localizedPath = basePath === "/" ? `/${locale}` : `/${locale}${basePath}`;
  return `${localizedPath}${suffix}`;
}

export function isReaderPath(pathname: string): boolean {
  const path = stripUiLocalePrefix(pathname);
  return path.startsWith("/read/") || path.startsWith("/library/read/");
}
