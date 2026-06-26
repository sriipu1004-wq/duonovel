import { NextResponse, type NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  if (
    request.nextUrl.pathname === "/search" &&
    request.nextUrl.searchParams.get("saved") === "bookmarked-works"
  ) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/search/saved";
    redirectUrl.searchParams.delete("saved");
    return NextResponse.redirect(redirectUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/search"],
};
