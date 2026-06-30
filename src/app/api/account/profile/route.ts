import { NextResponse } from "next/server";
import { normalizeDisplayName, validateDisplayName } from "@/lib/auth/accountSignupConsent";
import { findDisplayNameConflict } from "@/lib/auth/displayNameAvailability";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type AdminSupabase = ReturnType<typeof createAdminClient>;

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

async function updateFirstWorking(args: { admin: AdminSupabase; userId: string; payloads: Array<Record<string, unknown>> }): Promise<boolean> {
  for (const payload of args.payloads) {
    const result = await args.admin.from("users").update(payload).eq("id", args.userId).select("id").maybeSingle();
    if (!result.error && result.data?.id) return true;
  }
  return false;
}

async function upsertFirstWorking(args: { admin: AdminSupabase; userId: string; payloads: Array<Record<string, unknown>> }): Promise<boolean> {
  for (const payload of args.payloads) {
    const result = await args.admin.from("users").upsert({ id: args.userId, ...payload }, { onConflict: "id" }).select("id").maybeSingle();
    if (!result.error && result.data?.id) return true;
  }
  return false;
}

async function savePublicProfile(args: { admin: AdminSupabase; userId: string; displayName: string; bio?: string; xUrl?: string; noteUrl?: string }) {
  const identity = { display_name: args.displayName };
  const profilePayloads: Array<Record<string, unknown>> = [];
  if (typeof args.bio === "string") {
    profilePayloads.push(
      { ...identity, bio: args.bio },
      { ...identity, profile: args.bio },
      { ...identity, description: args.bio }
    );
  }
  profilePayloads.push(identity);
  const updated = await updateFirstWorking({ admin: args.admin, userId: args.userId, payloads: profilePayloads });
  if (!updated) {
    const roles = ["author", "user", "member", "reader", "voice"];
    const upsertPayloads = roles.flatMap((role) => profilePayloads.map((payload) => ({ ...payload, role })));
    if (!(await upsertFirstWorking({ admin: args.admin, userId: args.userId, payloads: upsertPayloads }))) throw new Error("プロフィールの保存に失敗した。");
  }

  const linkPayloads: Array<Record<string, unknown>> = [];
  if (typeof args.xUrl === "string" && typeof args.noteUrl === "string") linkPayloads.push({ x_url: args.xUrl, note_url: args.noteUrl });
  if (typeof args.xUrl === "string") linkPayloads.push({ x_url: args.xUrl });
  if (typeof args.noteUrl === "string") linkPayloads.push({ note_url: args.noteUrl });
  for (const payload of linkPayloads) {
    const result = await args.admin.from("users").update(payload).eq("id", args.userId);
    if (!result.error) break;
  }
}

async function saveMetadata(args: { admin: AdminSupabase; userId: string; displayName: string; bio?: string; metadata: Record<string, unknown> }) {
  const { error } = await args.admin.auth.admin.updateUserById(args.userId, {
    user_metadata: {
      ...args.metadata,
      display_name_candidate: args.displayName,
      display_name: args.displayName,
      profile_bio: typeof args.bio === "string" ? args.bio : readText(args.metadata.profile_bio),
    },
  });
  if (error) throw error;
}

async function syncDisplayNameEverywhere(args: { admin: AdminSupabase; userId: string; displayName: string }) {
  const userPayloads = [{ display_name: args.displayName }, { username: args.displayName }, { pen_name: args.displayName }, { name: args.displayName }];
  for (const payload of userPayloads) await args.admin.from("users").update(payload).eq("id", args.userId);
  const recordingPayloads = [
    { reader_name: args.displayName, narrator_name: args.displayName, display_name: args.displayName, speaker_name: args.displayName },
    { reader_name: args.displayName },
  ];
  for (const payload of recordingPayloads) {
    await args.admin.from("recordings").update(payload).eq("reader_user_id", args.userId).is("voice_model_id", null);
    await args.admin.from("recordings").update(payload).eq("reader_id", args.userId).is("voice_model_id", null);
  }
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
