import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { isOfficialAccountEmail } from "@/lib/auth/officialAccount";
import { getProxyAuthState } from "@/lib/supabase/proxy";
import {
  getUiLocaleFromPathname,
  stripUiLocalePrefix,
  UI_LOCALE_HEADER,
  type UiLocale,
} from "@/i18n/config";

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
  if (PUBLIC_EXACT_PATHS.has(pathname)) {
    return true;
  }

  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function copyResponseCookies(source: NextResponse, target: NextResponse): NextResponse {
  source.cookies.getAll().forEach((cookie) => {
    target.cookies.set(cookie);
  });
  return target;
}

function buildPreparingRedirectResponse(
  request: NextRequest,
  authResponse: NextResponse
): NextResponse {
  const redirectUrl = request.nextUrl.clone();
  redirectUrl.pathname = "/preparing";
  redirectUrl.search = "";

  return copyResponseCookies(authResponse, NextResponse.redirect(redirectUrl));
}

function buildLocaleAwareResponse(
  request: NextRequest,
  authResponse: NextResponse,
  locale: UiLocale,
  routePathname: string
): NextResponse {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(UI_LOCALE_HEADER, locale);

  const savedFilter = request.nextUrl.searchParams.get("saved") ?? "";
  const targetUrl = request.nextUrl.clone();

  if (routePathname === "/search" && SAVED_SEARCH_FILTERS.has(savedFilter)) {
    targetUrl.pathname = "/search/saved";
    return copyResponseCookies(
      authResponse,
      NextResponse.rewrite(targetUrl, {
        request: { headers: requestHeaders },
      })
    );
  }

  if (locale === "ja") {
    return copyResponseCookies(
      authResponse,
      NextResponse.next({ request: { headers: requestHeaders } })
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

  return copyResponseCookies(
    authResponse,
    NextResponse.rewrite(targetUrl, {
      request: { headers: requestHeaders },
    })
  );
}

export async function proxy(request: NextRequest) {
  const locale = getUiLocaleFromPathname(request.nextUrl.pathname);
  const routePathname = stripUiLocalePrefix(request.nextUrl.pathname);
  const authState = await getProxyAuthState(request);

  if (
    !isOfficialAccountEmail(authState.userEmail) &&
    !isPublicPath(routePathname)
  ) {
    return buildPreparingRedirectResponse(request, authState.response);
  }

  return buildLocaleAwareResponse(
    request,
    authState.response,
    locale,
    routePathname
  );
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|txt|xml)$).*)",
  ],
};
