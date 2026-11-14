import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  buildCompletedAccountRegistrationMetadata,
  hasRequiredAccountRegistrationConsent,
  isAccountRegistrationCompleted,
  normalizeNextPath,
  readAccountRegistrationConsent,
  readAccountRegistrationDisplayName,
} from "@/lib/auth/accountSignupConsent";
import { getUiLocaleFromPathname, stripUiLocalePrefix } from "@/i18n/config";
import { localizePath } from "@/i18n/navigation";
import {
  buildAuthCallbackErrorRedirect,
  classifyAuthCallbackRequest,
  resolveExchangeFailureCode,
} from "@/lib/auth/authCallbackError";
import { decideAuthCallbackDestination } from "@/lib/auth/registrationGate";

function isPasswordResetPath(nextPath: string): boolean {
  const normalizedNextPath = stripUiLocalePrefix(nextPath);
  return (
    normalizedNextPath === "/reset-password" ||
    normalizedNextPath.startsWith("/reset-password?")
  );
}

function buildRedirect(request: NextRequest, pathname: string) {
  const redirectTo = request.nextUrl.clone();
  redirectTo.pathname = pathname;
  redirectTo.search = "";
  return redirectTo;
}

async function savePublicDisplayName(userId: string, displayName: string) {
  const adminSupabase = createAdminClient();
  const updatedAt = new Date().toISOString();

  const updatePayloads = [
    {
      display_name: displayName,
      updated_at: updatedAt,
    },
    {
      display_name: displayName,
    },
  ];

  for (const payload of updatePayloads) {
    const result = await adminSupabase
      .from("users")
      .update(payload)
      .eq("id", userId)
      .select("id")
      .maybeSingle();

    if (!result.error && result.data?.id) {
      return;
    }
  }

  const upsertPayloads = [
    {
      id: userId,
      display_name: displayName,
      updated_at: updatedAt,
    },
    {
      id: userId,
      display_name: displayName,
    },
  ];

  let lastErrorMessage = "display_name_save_failed";

  for (const payload of upsertPayloads) {
    const result = await adminSupabase
      .from("users")
      .upsert(payload, { onConflict: "id" })
      .select("id")
      .maybeSingle();

    if (!result.error && result.data?.id) {
      return;
    }

    if (result.error?.message) {
      lastErrorMessage = result.error.message;
    }
  }

  throw new Error(lastErrorMessage);
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const nextPath = normalizeNextPath(
    requestUrl.searchParams.get("next"),
    "/"
  );
  const locale = getUiLocaleFromPathname(nextPath);
  const loginPath = localizePath("/login", locale);

  // Provider errors (error / error_code / error_description) and a missing
  // code are mapped to a fixed code; the provider's text is never forwarded
  // (Issue #142 PR1).
  const earlyError = classifyAuthCallbackRequest(requestUrl.searchParams);
  if (earlyError || !code) {
    return NextResponse.redirect(
      buildAuthCallbackErrorRedirect(
        request.nextUrl.href,
        loginPath,
        earlyError ?? "missing_auth_code",
        nextPath
      )
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      buildAuthCallbackErrorRedirect(
        request.nextUrl.href,
        loginPath,
        resolveExchangeFailureCode(requestUrl.searchParams),
        nextPath
      )
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const redirectTo = buildRedirect(request, loginPath);
  redirectTo.searchParams.set("confirmed", "1");
  redirectTo.searchParams.set("next", nextPath);

  if (!user) {
    return NextResponse.redirect(redirectTo);
  }

  // Issue #142 PR2: accounts with a Google identity. Their metadata flags are
  // not trusted on their own (an auto-linked, previously unconfirmed account
  // may carry flags someone else wrote), so the email finalize below is
  // skipped and STEP 2 is required until the consent is bound to the current
  // Google identity (registrationGate.ts). Email-only accounts fall through
  // to the unchanged email flow.
  const destination = decideAuthCallbackDestination(
    user,
    isPasswordResetPath(nextPath)
  );
  if (destination === "register") {
    const registerTo = buildRedirect(request, localizePath("/register", locale));
    registerTo.searchParams.set("next", nextPath);
    return NextResponse.redirect(registerTo);
  }
  if (destination === "next") {
    return NextResponse.redirect(new URL(nextPath, request.url));
  }

  const metadata = user.user_metadata ?? {};
  const displayName = readAccountRegistrationDisplayName(metadata);
  const agreedToTerms = readAccountRegistrationConsent(
    metadata,
    "account_public_profile_ack"
  );
  const agreedToPrivacy = readAccountRegistrationConsent(
    metadata,
    "account_public_content_ack"
  );
  const acknowledgedPublicSurface = readAccountRegistrationConsent(
    metadata,
    "account_enforcement_ack"
  );

  try {
    if (displayName) {
      await savePublicDisplayName(user.id, displayName);
    }

    if (!isAccountRegistrationCompleted(metadata)) {
      const hasRequiredInput =
        displayName.length > 0 &&
        hasRequiredAccountRegistrationConsent({
          agreedToTerms,
          agreedToPrivacy,
          acknowledgedPublicSurface,
        });

      if (hasRequiredInput) {
        const completedMetadata = buildCompletedAccountRegistrationMetadata({
          displayName,
          agreedToTerms,
          agreedToPrivacy,
          acknowledgedPublicSurface,
        });

        const { error: updateError } = await supabase.auth.updateUser({
          data: completedMetadata,
        });

        if (updateError) {
          throw updateError;
        }
      }
    }
  } catch (finalizeError) {
    console.error("[auth-callback finalize]", finalizeError);
  }

  if (isPasswordResetPath(nextPath)) {
    return NextResponse.redirect(new URL(nextPath, request.url));
  }

  return NextResponse.redirect(redirectTo);
}
