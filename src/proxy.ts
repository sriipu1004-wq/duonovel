import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  if (
    request.nextUrl.pathname === "/search" &&
    request.nextUrl.searchParams.get("saved") === "bookmarked-works"
  ) {
    const targetUrl = request.nextUrl.clone();
    targetUrl.pathname = "/search/saved";
    targetUrl.searchParams.delete("saved");
    return NextResponse.rewrite(targetUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/search"],
};
