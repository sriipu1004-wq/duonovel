import { NextResponse } from "next/server";
import { normalizeDisplayName, validateDisplayName } from "@/lib/auth/accountSignupConsent";
import { findDisplayNameConflict } from "@/lib/auth/displayNameAvailability";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  H1_NON_HUMAN_PATH_POSTGREST_OR,
  isH1GuardedHumanRow,
} from "@/lib/recording/humanRecordingState";

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

type DbError = { code?: string | null; message: string } | null;

// Legacy multi-shape payloads: a column that does not exist on this schema is
// expected and skipped. Every other DB error is a real failure.
function isMissingColumnError(error: DbError): boolean {
  return error?.code === "PGRST204" || error?.code === "42703";
}

function throwUnlessMissingColumn(error: DbError, label: string): void {
  if (!error || isMissingColumnError(error)) return;
  console.error(`[account-profile-sync] ${label}`, error);
  throw new Error("表示名の反映に失敗した。もう一度保存して。");
}

// Issue #137 H1: Human narration rows can be renamed only through the
// service-role RPC (same revision lock as every other Human mutation).
async function renameHumanRecordings(args: { admin: AdminSupabase; userId: string; displayName: string }) {
  const { error } = await args.admin.rpc("issue137_h1_human_rename", {
    p_owner_id: args.userId,
    p_reader_name: args.displayName,
  });
  if (!error) return;
  if (error.code === "PGRST202") {
    // RPC not deployed yet (app shipped before the migration). Only a user
    // who has no Human rows may proceed; otherwise an old name would remain
    // on public pages, so fail instead of silently skipping.
    const lookup = await args.admin.from("recordings")
      .select("id, voice_model_id, audio_storage_path")
      .or(`reader_id.eq.${args.userId},reader_user_id.eq.${args.userId}`);
    if (lookup.error) {
      console.error("[account-profile-sync] human recording lookup", lookup.error);
      throw new Error("朗読の表示名を更新できなかった。もう一度保存して。");
    }
    const rows = (lookup.data ?? []) as Array<Record<string, unknown>>;
    if (!rows.some((row) => isH1GuardedHumanRow(row))) {
      console.warn("[account-profile-sync] issue137_h1_human_rename unavailable; no Human rows to rename");
      return;
    }
  }
  console.error("[account-profile-sync] issue137_h1_human_rename", error);
  throw new Error("朗読の表示名を更新できなかった。もう一度保存して。");
}

async function syncDisplayNameEverywhere(args: { admin: AdminSupabase; userId: string; displayName: string }) {
  const userPayloads = [{ display_name: args.displayName }, { username: args.displayName }, { pen_name: args.displayName }, { name: args.displayName }];
  for (const payload of userPayloads) {
    const { error } = await args.admin.from("users").update(payload).eq("id", args.userId);
    throwUnlessMissingColumn(error, `users ${Object.keys(payload).join(",")}`);
  }
  const recordingPayloads = [
    { reader_name: args.displayName, narrator_name: args.displayName, display_name: args.displayName, speaker_name: args.displayName },
    { reader_name: args.displayName },
  ];
  // Legacy non-Human rows only. The `or` filter mirrors the H1 trigger's path
  // predicate exactly, so this never touches a guarded Human row.
  for (const payload of recordingPayloads) {
    for (const ownerColumn of ["reader_user_id", "reader_id"] as const) {
      const { error } = await args.admin.from("recordings").update(payload)
        .eq(ownerColumn, args.userId)
        .is("voice_model_id", null)
        .or(H1_NON_HUMAN_PATH_POSTGREST_OR);
      throwUnlessMissingColumn(error, `recordings ${ownerColumn} ${Object.keys(payload).join(",")}`);
    }
  }
  await renameHumanRecordings(args);
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
