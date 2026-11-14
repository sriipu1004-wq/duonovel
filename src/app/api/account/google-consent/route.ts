import { NextResponse } from "next/server";
import { findDisplayNameConflict } from "@/lib/auth/displayNameAvailability";
import {
  GOOGLE_CONSENT_PROVIDER,
  checkConsentRequest,
  decideGoogleConsent,
  planConsentWrites,
} from "@/lib/auth/googleConsent";
import {
  saveMetadata,
  savePublicProfile,
  syncDisplayNameEverywhere,
} from "@/lib/auth/publicDisplayName.server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Issue #142 PR3 (PR #204 review S1): STEP 2 for an account with a Google
// identity. The consent is stored where the user cannot write it:
// 1. one row appended to public.account_consents (service role only);
// 2. app_metadata.google_consent_identity_id (+ versions, time), which the
//    app gate (registrationGate.ts) reads and RLS
//    (account_google_consent_satisfied) checks together with the row.
// The client must call supabase.auth.refreshSession() afterwards so that the
// JWT carries the new app_metadata.
//
// PR3c (PR #206 review S3):
// - S3-1: the existing account_consents row is looked up; a missing row is
//   written again even when app_metadata already has the key.
// - S3-3: this route also saves the public display name, and only AFTER the
//   consent is recorded (POST /api/account/profile refuses accounts that have
//   not finished STEP 2). Leaving STEP 2 before the consent therefore never
//   changes public.users or the names on existing recordings. If the name
//   save fails after the consent, the client gets 500 and sends the same
//   request again; every step is idempotent.

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

    // 1. Check the consent (three flags, display name format, Google identity).
    const decision = decideGoogleConsent({ user: currentUser, payload, now: new Date() });
    if (!decision.ok) {
      return NextResponse.json({ ok: false, error: decision.error }, { status: decision.status });
    }

    // 2. The display name must be free before anything is written.
    const conflict = await findDisplayNameConflict({
      supabase: admin,
      displayName: decision.displayName,
      excludeUserId: user.id,
    });
    if (conflict) {
      return NextResponse.json({ ok: false, error: "display_name_taken" }, { status: 409 });
    }

    // 3. Record the consent: both halves RLS needs, for this exact identity.
    const existing = await admin
      .from("account_consents")
      .select("id")
      .eq("user_id", user.id)
      .eq("identity_id", decision.identityId)
      .eq("provider", GOOGLE_CONSENT_PROVIDER)
      .limit(1);
    if (existing.error) throw existing.error;
    const plan = planConsentWrites({
      metadataRecorded: decision.metadataRecorded,
      rowExists: (existing.data ?? []).length > 0,
    });

    if (plan.insertRow) {
      const inserted = await admin.from("account_consents").insert(decision.row);
      if (inserted.error) throw inserted.error;
    }

    if (plan.updateAppMetadata) {
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
    }

    // 4. Only now save the public display name (same writes as
    //    POST /api/account/profile).
    const profileMetadata =
      currentUser.user_metadata && typeof currentUser.user_metadata === "object"
        ? (currentUser.user_metadata as Record<string, unknown>)
        : {};
    await saveMetadata({
      admin,
      userId: user.id,
      displayName: decision.displayName,
      metadata: profileMetadata,
    });
    await savePublicProfile({ admin, userId: user.id, displayName: decision.displayName });
    await syncDisplayNameEverywhere({ admin, userId: user.id, displayName: decision.displayName });

    return NextResponse.json({
      ok: true,
      alreadyRecorded: !plan.insertRow && !plan.updateAppMetadata,
      displayName: decision.displayName,
      refreshSession: true,
    });
  } catch (error) {
    console.error("[account-google-consent]", error);
    return NextResponse.json({ ok: false, error: "consent_save_failed" }, { status: 500 });
  }
}
