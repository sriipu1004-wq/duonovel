import { stripUiLocalePrefix, type UiLocale } from "@/i18n/config";
import { localizePath } from "@/i18n/navigation";

export function buildCurrentLoginHref(args: {
  pathname: string | null;
  search: string;
  locale: UiLocale;
}): string {
  const loginPath = localizePath("/login", args.locale);
  const pathname =
    args.pathname && args.pathname.startsWith("/")
      ? args.pathname
      : localizePath("/", args.locale);

  if (stripUiLocalePrefix(pathname) === "/login") {
    return loginPath;
  }

  const search = args.search.replace(/^\?/, "");
  const nextPath = search ? `${pathname}?${search}` : pathname;

  return stripUiLocalePrefix(pathname) === "/" && !search
    ? loginPath
    : `${loginPath}?next=${encodeURIComponent(nextPath)}`;
}
