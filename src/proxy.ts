import { NextResponse, type NextRequest } from "next/server";
import {
  getUiLocaleFromPathname,
  stripUiLocalePrefix,
  UI_LOCALE_HEADER,
} from "@/i18n/config";

const SAVED_SEARCH_FILTERS = new Set([
  "bookmarked-works",
  "followed-authors",
  "liked-works",
  "liked-readers",
]);

export function proxy(request: NextRequest) {
  const locale = getUiLocaleFromPathname(request.nextUrl.pathname);
  const routePathname = stripUiLocalePrefix(request.nextUrl.pathname);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(UI_LOCALE_HEADER, locale);

  const targetUrl = request.nextUrl.clone();

  if (
    routePathname === "/search" &&
    SAVED_SEARCH_FILTERS.has(request.nextUrl.searchParams.get("saved") ?? "")
  ) {
    targetUrl.pathname = "/search/saved";
    return NextResponse.rewrite(targetUrl, {
      request: { headers: requestHeaders },
    });
  }

  if (locale === "ja") {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  targetUrl.pathname =
    routePathname === "/" ? "/_localized-home" : routePathname;

  return NextResponse.rewrite(targetUrl, {
    request: { headers: requestHeaders },
  });
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|txt|xml)$).*)",
  ],
};
