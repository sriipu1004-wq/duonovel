import { NextResponse } from "next/server";
import { normalizeDisplayName, validateDisplayName } from "@/lib/auth/accountSignupConsent";
import { findDisplayNameConflict } from "@/lib/auth/displayNameAvailability";
import { registrationRequiredResponse } from "@/lib/auth/registrationGate.server";
import {
  saveMetadata,
  savePublicProfile,
  syncDisplayNameEverywhere,
} from "@/lib/auth/publicDisplayName.server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function readText(value: unknown): string { return typeof value === "string" ? value.trim() : ""; }
function normalizeBio(value: string): string { return value.replace(/\r\n?/g, "\n").trim(); }
function hasOwn(value: Record<string, unknown>, key: string): boolean { return Object.prototype.hasOwnProperty.call(value, key); }
function normalizeExternalUrl(value: string): string {
  const trimmed = value.trim(); if (!trimmed) return "";
  const source = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let parsed: URL; try { parsed = new URL(source); } catch { throw new Error("外部リンクのURL形式が正しくない。"); }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("外部リンクは http または https のURLだけ使える。");
  return parsed.toString();
}


export async function POST(request: Request) {
  let payload: Record<string, unknown>;
  try { payload = await request.json() as Record<string, unknown>; } catch { return NextResponse.json({ ok: false, error: "リクエストを読めなかった。" }, { status: 400 }); }
  const displayName = normalizeDisplayName(readText(payload.displayName));
  const validationError = validateDisplayName(displayName);
  if (validationError) return NextResponse.json({ ok: false, error: validationError }, { status: 400 });
  const bio = hasOwn(payload, "bio") ? normalizeBio(readText(payload.bio)) : undefined;
  if (typeof bio === "string" && bio.length > 1000) return NextResponse.json({ ok: false, error: "自己紹介は1000文字以内で入力して。" }, { status: 400 });
  let xUrl: string | undefined; let noteUrl: string | undefined;
  try { xUrl = hasOwn(payload, "xUrl") ? normalizeExternalUrl(readText(payload.xUrl)) : undefined; noteUrl = hasOwn(payload, "noteUrl") ? normalizeExternalUrl(readText(payload.noteUrl)) : undefined; } catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "外部リンクの保存に失敗した。" }, { status: 400 }); }
  if ((xUrl?.length ?? 0) > 500 || (noteUrl?.length ?? 0) > 500) return NextResponse.json({ ok: false, error: "外部リンクは500文字以内で入力して。" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return NextResponse.json({ ok: false, error: "ログイン状態を確認できなかった。" }, { status: 401 });

  // Issue #142 PR3c (PR #206 review S3-3): a Google account that has not
  // finished STEP 2 cannot write any public profile field here, the display
  // name included. STEP 2 saves the display name inside
  // POST /api/account/google-consent, after the consent is recorded, so
  // leaving STEP 2 half-way never changes the public name.
  const registrationBlocked = await registrationRequiredResponse(user, "text");
  if (registrationBlocked) return registrationBlocked;

  try {
    const admin = createAdminClient();
    const conflict = await findDisplayNameConflict({ supabase: admin, displayName, excludeUserId: user.id });
    if (conflict) return NextResponse.json({ ok: false, error: "このユーザー名はすでに使われている。" }, { status: 409 });
    await saveMetadata({ admin, userId: user.id, displayName, bio, metadata: user.user_metadata && typeof user.user_metadata === "object" ? user.user_metadata as Record<string, unknown> : {} });
    await savePublicProfile({ admin, userId: user.id, displayName, bio, xUrl, noteUrl });
    await syncDisplayNameEverywhere({ admin, userId: user.id, displayName });
    return NextResponse.json({ ok: true, displayName, bio: typeof bio === "string" ? bio : undefined, xUrl, noteUrl });
  } catch (error) {
    console.error("[account-profile-save]", error);
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "プロフィールの保存に失敗した。" }, { status: 500 });
  }
}
