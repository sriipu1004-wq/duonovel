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
import { localizePath } from "@/i18n/navigation";

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

function buildLocaleResponse(
  request: NextRequest,
  authResponse: NextResponse,
  locale: UiLocale
): NextResponse {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(UI_LOCALE_HEADER, locale);

  if (locale === "ja") {
    return copyResponseCookies(
      authResponse,
      NextResponse.next({ request: { headers: requestHeaders } })
    );
  }

  const rewriteUrl = request.nextUrl.clone();
  rewriteUrl.pathname = stripUiLocalePrefix(request.nextUrl.pathname);

  return copyResponseCookies(
    authResponse,
    NextResponse.rewrite(rewriteUrl, {
      request: { headers: requestHeaders },
    })
  );
}

function buildPreparingRedirectResponse(
  request: NextRequest,
  authResponse: NextResponse,
  locale: UiLocale
): NextResponse {
  const redirectUrl = request.nextUrl.clone();
  redirectUrl.pathname = localizePath("/preparing", locale);
  redirectUrl.search = "";

  return copyResponseCookies(authResponse, NextResponse.redirect(redirectUrl));
}

export async function proxy(request: NextRequest) {
  const authState = await getProxyAuthState(request);
  const locale = getUiLocaleFromPathname(request.nextUrl.pathname);
  const routePathname = stripUiLocalePrefix(request.nextUrl.pathname);

  if (isOfficialAccountEmail(authState.userEmail)) {
    return buildLocaleResponse(request, authState.response, locale);
  }

  if (isPublicPath(routePathname)) {
    return buildLocaleResponse(request, authState.response, locale);
  }

  return buildPreparingRedirectResponse(request, authState.response, locale);
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|txt|xml)$).*)",
  ],
};