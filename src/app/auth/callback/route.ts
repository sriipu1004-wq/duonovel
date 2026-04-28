import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  buildCompletedAccountRegistrationMetadata,
  hasRequiredAccountRegistrationConsent,
  isAccountRegistrationCompleted,
  normalizeNextPath,
  readAccountRegistrationBirthdate,
  readAccountRegistrationConsent,
  readAccountRegistrationDisplayName,
  readAccountRegistrationGender,
} from "@/lib/auth/accountSignupConsent";

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
    redirectTo.searchParams.set("next", nextPath);
    return NextResponse.redirect(redirectTo);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const redirectTo = buildRedirect(request, "/login");
  redirectTo.searchParams.set("confirmed", "1");
  redirectTo.searchParams.set("next", nextPath);

  if (!user) {
    return NextResponse.redirect(redirectTo);
  }

  const metadata = user.user_metadata ?? {};
  const displayName = readAccountRegistrationDisplayName(metadata);
  const birthdate = readAccountRegistrationBirthdate(metadata);
  const gender = readAccountRegistrationGender(metadata);
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
        birthdate.length > 0 &&
        gender.length > 0 &&
        hasRequiredAccountRegistrationConsent({
          agreedToTerms,
          agreedToPrivacy,
          acknowledgedPublicSurface,
        });

      if (hasRequiredInput) {
        const completedMetadata = buildCompletedAccountRegistrationMetadata({
          displayName,
          birthdate,
          gender,
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

  return NextResponse.redirect(redirectTo);
}