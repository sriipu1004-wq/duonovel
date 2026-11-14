import { NextResponse } from "next/server";
import { checkConsentRequest, decideGoogleConsent } from "@/lib/auth/googleConsent";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Issue #142 PR3 (PR #204 review S1): STEP 2 for an account with a Google
// identity. The consent is stored where the user cannot write it:
// 1. one row appended to public.account_consents (service role only);
// 2. app_metadata.google_consent_identity_id (+ versions, time), which the
//    app gate (registrationGate.ts) and RLS (account_google_consent_satisfied)
//    read from the JWT.
// The client must call supabase.auth.refreshSession() afterwards so that the
// JWT carries the new app_metadata.

export async function POST(request: Request) {
  // JSON from this site only (PR #205 review S3).
  const requestCheck = checkConsentRequest({
    requestUrl: request.url,
    contentType: request.headers.get("content-type"),
    origin: request.headers.get("origin"),
    host: request.headers.get("x-forwarded-host") ?? request.headers.get("host"),
  });
  if (!requestCheck.ok) {
    return NextResponse.json({ ok: false, error: requestCheck.error }, { status: requestCheck.status });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const admin = createAdminClient();

    // Fresh copy from the Auth server (service role), not the request JWT.
    const fresh = await admin.auth.admin.getUserById(user.id);
    if (fresh.error || !fresh.data.user) throw fresh.error ?? new Error("user lookup failed");
    const currentUser = fresh.data.user;

    const profile = await admin
      .from("users")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle();
    if (profile.error) throw profile.error;

    const decision = decideGoogleConsent({
      user: currentUser,
      payload,
      storedDisplayName: (profile.data as { display_name?: string | null } | null)?.display_name,
      now: new Date(),
    });
    if (!decision.ok) {
      return NextResponse.json({ ok: false, error: decision.error }, { status: decision.status });
    }
    if (decision.alreadyRecorded) {
      return NextResponse.json({ ok: true, alreadyRecorded: true, refreshSession: true });
    }

    const inserted = await admin.from("account_consents").insert(decision.row);
    if (inserted.error) throw inserted.error;

    // Only the new keys are sent. The Auth server merges app_metadata per
    // top-level key (supabase/auth internal/models/user.go
    // User.UpdateAppMetaData: "u.AppMetaData[key] = value" for each key, a
    // null value deletes; called from the admin user update in
    // internal/api/admin.go; read at commit 3e79d851, 2026-11-15), so
    // provider/providers are kept and are not overwritten with a stale copy.
    const updated = await admin.auth.admin.updateUserById(user.id, {
      app_metadata: decision.appMetadata,
    });
    if (updated.error) throw updated.error;

    return NextResponse.json({ ok: true, alreadyRecorded: false, refreshSession: true });
  } catch (error) {
    console.error("[account-google-consent]", error);
    return NextResponse.json({ ok: false, error: "consent_save_failed" }, { status: 500 });
  }
}
