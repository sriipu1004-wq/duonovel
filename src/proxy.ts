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

  if (routePathname === "/") {
    targetUrl.pathname = "/locale-home";
  } else if (routePathname === "/search") {
    targetUrl.pathname = "/locale-search";
  } else if (routePathname === "/guide") {
    targetUrl.pathname = "/locale-guide";
  } else if (routePathname === "/faq") {
    targetUrl.pathname = "/locale-faq";
  } else if (routePathname.startsWith("/works/")) {
    targetUrl.pathname = routePathname.replace(/^\/works\//, "/locale-work/");
  } else {
    targetUrl.pathname = routePathname;
  }

  return NextResponse.rewrite(targetUrl, {
    request: { headers: requestHeaders },
  });
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|txt|xml)$).*)",
  ],
};
