import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  isAccountRegistrationCompleted,
  normalizeNextPath,
} from "@/lib/auth/accountSignupConsent";

function buildRedirect(request: NextRequest, pathname: string) {
  const redirectTo = request.nextUrl.clone();
  redirectTo.pathname = pathname;
  redirectTo.search = "";
  return redirectTo;
}

function buildConfirmedRedirect(
  request: NextRequest,
  kind: "register" | "completed" | "login_required",
  nextPath: string
) {
  const redirectTo = buildRedirect(request, "/confirmed");
  redirectTo.searchParams.set("kind", kind);
  redirectTo.searchParams.set("next", nextPath);
  return redirectTo;
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const nextPath = normalizeNextPath(
    requestUrl.searchParams.get("next"),
    "/mypage"
  );

  const resumeRegisterPath = `/register?stage=confirmed&next=${encodeURIComponent(nextPath)}`;
  const resumeLoginPath = `/login?confirmed=1&next=${encodeURIComponent(
    resumeRegisterPath
  )}`;

  if (!code) {
    const redirectTo = buildRedirect(request, "/login");
    redirectTo.searchParams.set("error", "missing_auth_code");
    redirectTo.searchParams.set("next", nextPath);
    return NextResponse.redirect(redirectTo);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    const redirectTo = buildRedirect(request, "/login");
    redirectTo.searchParams.set("error", "email_confirm_callback_failed");
    redirectTo.searchParams.set("next", resumeRegisterPath);
    return NextResponse.redirect(redirectTo);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(
      buildConfirmedRedirect(request, "login_required", resumeLoginPath)
    );
  }

  const completed = isAccountRegistrationCompleted(user.user_metadata);

  if (completed) {
    return NextResponse.redirect(
      buildConfirmedRedirect(request, "completed", nextPath)
    );
  }

  return NextResponse.redirect(
    buildConfirmedRedirect(request, "register", resumeRegisterPath)
  );
}