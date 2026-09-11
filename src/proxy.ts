import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { isOfficialAccountEmail } from "@/lib/auth/officialAccount";
import { getProxyAuthState } from "@/lib/supabase/proxy";
import {
  getUiLocaleFromPathname,
  isUiLocale,
  stripUiLocalePrefix,
  UI_LOCALE_COOKIE,
  UI_LOCALE_HEADER,
  type UiLocale,
} from "@/i18n/config";
import {
  CONTENT_LANGUAGE_FILTER_COOKIE,
  CONTENT_LANGUAGE_FILTER_HEADER,
} from "@/i18n/contentLanguage";

const PUBLIC_EXACT_PATHS = new Set([
  "/",
  "/search",
  "/guide",
  "/faq",
  "/status",
  "/news",
  "/terms",
  "/privacy",
  "/contact",
  "/login",
  "/record",
  "/mypage",
  "/preparing",
]);

const PUBLIC_PREFIXES = [
  "/works/",
  "/read/",
  "/authors/",
  "/readers/",
  "/record/",
  "/recording-request/",
];

const SAVED_SEARCH_FILTERS = new Set([
  "bookmarked-works",
  "followed-authors",
  "liked-works",
  "liked-readers",
]);

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_EXACT_PATHS.has(pathname)) return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function hasUiLocalePrefix(pathname: string): boolean {
  return pathname === "/en" || pathname.startsWith("/en/") || pathname === "/ko" || pathname.startsWith("/ko/");
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

function copyResponseCookies(source: NextResponse, target: NextResponse): NextResponse {
  source.cookies.getAll().forEach((cookie) => target.cookies.set(cookie));
  return target;
}

function withLocaleCookie(response: NextResponse, locale: UiLocale): NextResponse {
  response.cookies.set(UI_LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  return response;
}

function buildPreparingRedirectResponse(
  request: NextRequest,
  authResponse: NextResponse,
  locale: UiLocale
): NextResponse {
  const redirectUrl = request.nextUrl.clone();
  redirectUrl.pathname = localizePathname("/preparing", locale);
  redirectUrl.search = "";
  return withLocaleCookie(copyResponseCookies(authResponse, NextResponse.redirect(redirectUrl)), locale);
}

function buildLocaleAwareResponse(
  request: NextRequest,
  authResponse: NextResponse,
  locale: UiLocale,
  routePathname: string
): NextResponse {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(UI_LOCALE_HEADER, locale);

  if (routePathname === "/search") {
    const contentLanguageFilter = request.cookies.get(CONTENT_LANGUAGE_FILTER_COOKIE)?.value?.trim();
    if (contentLanguageFilter) {
      requestHeaders.set(CONTENT_LANGUAGE_FILTER_HEADER, contentLanguageFilter);
    } else {
      requestHeaders.delete(CONTENT_LANGUAGE_FILTER_HEADER);
    }
  }

  const savedFilter = request.nextUrl.searchParams.get("saved") ?? "";
  const targetUrl = request.nextUrl.clone();

  if (routePathname === "/search" && SAVED_SEARCH_FILTERS.has(savedFilter)) {
    targetUrl.pathname = "/search/saved";
    return withLocaleCookie(
      copyResponseCookies(
        authResponse,
        NextResponse.rewrite(targetUrl, { request: { headers: requestHeaders } })
      ),
      locale
    );
  }

  if (locale === "ja") {
    return withLocaleCookie(
      copyResponseCookies(
        authResponse,
        NextResponse.next({ request: { headers: requestHeaders } })
      ),
      locale
    );
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

  return withLocaleCookie(
    copyResponseCookies(
      authResponse,
      NextResponse.rewrite(targetUrl, { request: { headers: requestHeaders } })
    ),
    locale
  );
}

export async function proxy(request: NextRequest) {
  const locale = resolveRequestLocale(request);
  const routePathname = stripUiLocalePrefix(request.nextUrl.pathname);
  const authState = await getProxyAuthState(request);

  if (!hasUiLocalePrefix(request.nextUrl.pathname) && locale !== "ja") {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = localizePathname(routePathname, locale);
    return withLocaleCookie(copyResponseCookies(authState.response, NextResponse.redirect(redirectUrl)), locale);
  }

  if (!isOfficialAccountEmail(authState.userEmail) && !isPublicPath(routePathname)) {
    return buildPreparingRedirectResponse(request, authState.response, locale);
  }

  return buildLocaleAwareResponse(request, authState.response, locale, routePathname);
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|txt|xml)$).*)",
  ],
};
