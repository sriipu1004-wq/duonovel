import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  isAccountRegistrationCompleted,
  normalizeAccountRegistrationMethod,
  normalizeNextPath,
} from "@/lib/auth/accountSignupConsent";

function buildRedirect(request: NextRequest, pathname: string) {
  const redirectTo = request.nextUrl.clone();
  redirectTo.pathname = pathname;
  redirectTo.search = "";
  return redirectTo;
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const mode = requestUrl.searchParams.get("mode");
  const provider = normalizeAccountRegistrationMethod(
    requestUrl.searchParams.get("provider"),
    "google"
  );
  const nextPath = normalizeNextPath(
    requestUrl.searchParams.get("next"),
    "/mypage"
  );

  if (!code) {
    const redirectTo = buildRedirect(request, "/login");
    redirectTo.searchParams.set("error", "missing_auth_code");
    return NextResponse.redirect(redirectTo);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    const redirectTo = buildRedirect(request, "/login");
    redirectTo.searchParams.set("error", "oauth_callback_failed");
    return NextResponse.redirect(redirectTo);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const completed = isAccountRegistrationCompleted(user?.user_metadata);

  if (mode === "signup") {
    const redirectTo = buildRedirect(request, "/register");
    redirectTo.searchParams.set("method", provider);
    return NextResponse.redirect(redirectTo);
  }

  if (mode === "email-confirm") {
    if (completed) {
      return NextResponse.redirect(buildRedirect(request, "/mypage"));
    }

    const redirectTo = buildRedirect(request, "/register");
    redirectTo.searchParams.set("method", "email");
    redirectTo.searchParams.set("stage", "confirmed");
    return NextResponse.redirect(redirectTo);
  }

  if (!completed) {
    const redirectTo = buildRedirect(request, "/register");
    redirectTo.searchParams.set("method", provider);
    return NextResponse.redirect(redirectTo);
  }

  return NextResponse.redirect(buildRedirect(request, nextPath));
}