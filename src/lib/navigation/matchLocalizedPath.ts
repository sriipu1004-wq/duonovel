import { stripUiLocalePrefix } from "@/i18n/config";

/**
 * Compare a browser pathname with a canonical, unprefixed application path.
 *
 * The URL visible to a user may be prefixed with `/en` or `/ko`, while most
 * feature routes are intentionally expressed without that UI-locale prefix.
 */
export function isLocalizedPath(pathname: string, canonicalPath: string): boolean {
  return stripUiLocalePrefix(pathname) === canonicalPath;
}

/**
 * Match an unprefixed route prefix while preserving the visible locale prefix.
 */
export function isLocalizedPathWithin(
  pathname: string,
  canonicalPrefix: string
): boolean {
  return stripUiLocalePrefix(pathname).startsWith(canonicalPrefix);
}
