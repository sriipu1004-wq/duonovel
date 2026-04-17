import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { isOfficialAccountEmail } from "@/lib/auth/officialAccount";
import { getProxyAuthState } from "@/lib/supabase/proxy";

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

function buildPreparingRedirectResponse(
  request: NextRequest,
  authResponse: NextResponse
): NextResponse {
  const redirectUrl = request.nextUrl.clone();
  redirectUrl.pathname = "/preparing";
  redirectUrl.search = "";

  const redirectResponse = NextResponse.redirect(redirectUrl);

  authResponse.cookies.getAll().forEach((cookie) => {
    redirectResponse.cookies.set(cookie);
  });

  return redirectResponse;
}

export async function proxy(request: NextRequest) {
  const authState = await getProxyAuthState(request);
  const { pathname } = request.nextUrl;

  if (isOfficialAccountEmail(authState.userEmail)) {
    return authState.response;
  }

  if (isPublicPath(pathname)) {
    return authState.response;
  }

  return buildPreparingRedirectResponse(request, authState.response);
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|txt|xml)$).*)",
  ],
};