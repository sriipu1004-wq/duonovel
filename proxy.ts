import { NextRequest, NextResponse } from "next/server";
import { getUiLocaleFromPathname, stripUiLocalePrefix, UI_LOCALE_HEADER } from "@/i18n/config";

export function proxy(request: NextRequest) {
  const locale = getUiLocaleFromPathname(request.nextUrl.pathname);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(UI_LOCALE_HEADER, locale);

  if (locale === "ja") {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  const rewriteUrl = request.nextUrl.clone();
  rewriteUrl.pathname = stripUiLocalePrefix(request.nextUrl.pathname);

  return NextResponse.rewrite(rewriteUrl, {
    request: { headers: requestHeaders },
  });
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|opengraph-image|.*\\..*).*)"],
};
