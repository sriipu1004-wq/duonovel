import { NextResponse, type NextRequest } from "next/server";

const SAVED_SEARCH_FILTERS = new Set([
  "bookmarked-works",
  "followed-authors",
  "liked-works",
  "liked-readers",
]);

export function proxy(request: NextRequest) {
  if (
    request.nextUrl.pathname === "/search" &&
    SAVED_SEARCH_FILTERS.has(request.nextUrl.searchParams.get("saved") ?? "")
  ) {
    const targetUrl = request.nextUrl.clone();
    targetUrl.pathname = "/search/saved";
    return NextResponse.rewrite(targetUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/search"],
};
