import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  getUiLocaleFromPathname,
  isUiLocale,
  stripUiLocalePrefix,
  UI_LOCALE_COOKIE,
  UI_LOCALE_HEADER,
  type UiLocale,
} from "@/i18n/config";
import {
  extractRegionGuardedSeriesId,
  isSeriesBlockedInCountry,
  normalizeCountryCode,
  REGION_BLOCKED_STATUS,
  regionBlockedHtml,
  REQUEST_COUNTRY_HEADER,
} from "@/lib/rights/regionRestriction";
import { loadRegionRestrictionMapForProxy } from "@/lib/rights/regionRestrictionProxy";

const SAVED_SEARCH_FILTERS = new Set([
  "bookmarked-works",
  "followed-authors",
  "liked-works",
  "liked-readers",
]);

const JAPANESE_CANONICAL_PATHS = new Set([
  "/terms",
  "/privacy",
  "/commercial-transactions",
  "/record/terms",
]);

function hasUiLocalePrefix(pathname: string): boolean {
  return (
    pathname === "/en" ||
    pathname.startsWith("/en/") ||
    pathname === "/ko" ||
    pathname.startsWith("/ko/")
  );
}

const WORK_OPEN_GRAPH_IMAGE_PATH = /^\/works\/[^/]+\/opengraph-image(?:-[^/]*)?$/;

export function isWorkOpenGraphImagePath(pathname: string): boolean {
  return WORK_OPEN_GRAPH_IMAGE_PATH.test(pathname);
}

function resolveRequestLocale(request: NextRequest): UiLocale {
  if (hasUiLocalePrefix(request.nextUrl.pathname)) {
    return getUiLocaleFromPathname(request.nextUrl.pathname);
  }

  const cookieLocale = request.cookies.get(UI_LOCALE_COOKIE)?.value;
  return isUiLocale(cookieLocale) ? cookieLocale : "ja";
}

function localizePathname(pathname: string, locale: UiLocale): string {
  const base = stripUiLocalePrefix(pathname);
  if (locale === "ja") return base;
  return base === "/" ? `/${locale}` : `/${locale}${base}`;
}

function withLocaleCookie(response: NextResponse, locale: UiLocale): NextResponse {
  response.cookies.set(UI_LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  return response;
}

function buildLocaleAwareResponse(
  request: NextRequest,
  locale: UiLocale,
  routePathname: string
): NextResponse {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(UI_LOCALE_HEADER, locale);

  const savedFilter = request.nextUrl.searchParams.get("saved") ?? "";
  const targetUrl = request.nextUrl.clone();

  if (routePathname === "/search" && SAVED_SEARCH_FILTERS.has(savedFilter)) {
    targetUrl.pathname = "/search/saved";
    return withLocaleCookie(
      NextResponse.rewrite(targetUrl, { request: { headers: requestHeaders } }),
      locale
    );
  }

  if (locale === "ja") {
    return withLocaleCookie(
      NextResponse.next({ request: { headers: requestHeaders } }),
      locale
    );
  }

  if (routePathname === "/") {
    targetUrl.pathname = "/locale-home";
  } else if (routePathname === "/search") {
    targetUrl.pathname = "/locale-search";
  } else if (routePathname === "/record") {
    targetUrl.pathname = "/locale-record";
  } else if (routePathname === "/guide") {
    targetUrl.pathname = "/locale-guide";
  } else if (routePathname === "/faq") {
    targetUrl.pathname = "/locale-faq";
  } else if (routePathname.startsWith("/works/")) {
    targetUrl.pathname = routePathname.replace(/^\/works\//, "/locale-work/");
  } else {
    targetUrl.pathname = routePathname;
  }

  return withLocaleCookie(
    NextResponse.rewrite(targetUrl, { request: { headers: requestHeaders } }),
    locale
  );
}

export async function proxy(request: NextRequest) {
  const locale = resolveRequestLocale(request);
  const hasLocalePrefix = hasUiLocalePrefix(request.nextUrl.pathname);
  const routePathname = stripUiLocalePrefix(request.nextUrl.pathname);

  // Per-country restriction (owner 2026-11-15): a restricted work is answered
  // 451 to a visitor from a blocked or unknown country before any page, server
  // action or redirect runs. Pages re-check with the service role.
  const guardedSeriesId = extractRegionGuardedSeriesId(routePathname);
  if (guardedSeriesId) {
    const restrictions = await loadRegionRestrictionMapForProxy();
    const country = normalizeCountryCode(
      request.headers.get(REQUEST_COUNTRY_HEADER)
    );
    if (
      restrictions &&
      isSeriesBlockedInCountry(restrictions, guardedSeriesId, country)
    ) {
      return new NextResponse(regionBlockedHtml(locale), {
        status: REGION_BLOCKED_STATUS,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "private, no-store",
          "X-Robots-Tag": "noindex",
        },
      });
    }
  }

  // P9 per-work Open Graph image: one locale-independent route. Never
  // redirect it by the UI-locale cookie or rewrite it to /locale-work, where
  // no image route exists.
  if (isWorkOpenGraphImagePath(routePathname)) {
    if (!hasLocalePrefix) return NextResponse.next();
    const imageUrl = request.nextUrl.clone();
    imageUrl.pathname = routePathname;
    return NextResponse.rewrite(imageUrl);
  }

  if (hasLocalePrefix && JAPANESE_CANONICAL_PATHS.has(routePathname)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = routePathname;
    return withLocaleCookie(NextResponse.redirect(redirectUrl), locale);
  }

  if (
    !hasLocalePrefix &&
    locale !== "ja" &&
    !JAPANESE_CANONICAL_PATHS.has(routePathname)
  ) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = localizePathname(routePathname, locale);
    return withLocaleCookie(NextResponse.redirect(redirectUrl), locale);
  }

  return buildLocaleAwareResponse(request, locale, routePathname);
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|txt|xml)$).*)",
  ],
};
