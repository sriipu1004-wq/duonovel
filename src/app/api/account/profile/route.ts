import { NextResponse } from "next/server";
import {
  normalizeDisplayName,
  validateDisplayName,
} from "@/lib/auth/accountSignupConsent";
import { findDisplayNameConflict } from "@/lib/auth/displayNameAvailability";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type AdminSupabase = ReturnType<typeof createAdminClient>;

function readText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeBio(value: string): string {
  return value.replace(/\r\n?/g, "\n").trim();
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function normalizeExternalUrl(value: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    return "";
  }

  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  let parsed: URL;

  try {
    parsed = new URL(withProtocol);
  } catch {
    throw new Error("外部リンクのURL形式が正しくない。");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("外部リンクは http または https のURLだけ使える。");
  }

  return parsed.toString();
}

function buildProfilePayloads(args: {
  userId: string;
  displayName: string;
  bio?: string;
  xUrl?: string;
  noteUrl?: string;
  includeId: boolean;
  includeUpdatedAt: boolean;
}): Array<Record<string, unknown>> {
  const identityPayload: Record<string, unknown> = {
    display_name: args.displayName,
  };

  if (args.includeId) {
    identityPayload.id = args.userId;
  }

  if (args.includeUpdatedAt) {
    identityPayload.updated_at = new Date().toISOString();
  }

  const linkedPayload: Record<string, unknown> = { ...identityPayload };

  if (typeof args.xUrl === "string") {
    linkedPayload.x_url = args.xUrl;
  }

  if (typeof args.noteUrl === "string") {
    linkedPayload.note_url = args.noteUrl;
  }

  const payloads: Array<Record<string, unknown>> = [];

  if (typeof args.bio === "string") {
    payloads.push(
      { ...linkedPayload, bio: args.bio },
      { ...linkedPayload, profile: args.bio },
      { ...identityPayload, bio: args.bio },
      { ...identityPayload, profile: args.bio }
    );
  }

  payloads.push(linkedPayload, identityPayload);

  const seen = new Set<string>();
  return payloads.filter((payload) => {
    const key = JSON.stringify(payload);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function savePublicUserProfile(args: {
  adminSupabase: AdminSupabase;
  userId: string;
  displayName: string;
  bio?: string;
  xUrl?: string;
  noteUrl?: string;
}): Promise<void> {
  const updatePayloads = [
    ...buildProfilePayloads({
      userId: args.userId,
      displayName: args.displayName,
      bio: args.bio,
      xUrl: args.xUrl,
      noteUrl: args.noteUrl,
      includeId: false,
      includeUpdatedAt: true,
    }),
    ...buildProfilePayloads({
      userId: args.userId,
      displayName: args.displayName,
      bio: args.bio,
      xUrl: args.xUrl,
      noteUrl: args.noteUrl,
      includeId: false,
      includeUpdatedAt: false,
    }),
  ];

  for (const payload of updatePayloads) {
    const result = await args.adminSupabase
      .from("users")
      .update(payload)
      .eq("id", args.userId)
      .select("id")
      .maybeSingle();

    if (!result.error && result.data?.id) {
      return;
    }
  }

  const upsertPayloads = [
    ...buildProfilePayloads({
      userId: args.userId,
      displayName: args.displayName,
      bio: args.bio,
      xUrl: args.xUrl,
      noteUrl: args.noteUrl,
      includeId: true,
      includeUpdatedAt: true,
    }),
    ...buildProfilePayloads({
      userId: args.userId,
      displayName: args.displayName,
      bio: args.bio,
      xUrl: args.xUrl,
      noteUrl: args.noteUrl,
      includeId: true,
      includeUpdatedAt: false,
    }),
  ];

  let lastErrorMessage = "プロフィールの保存に失敗した。";

  for (const payload of upsertPayloads) {
    const result = await args.adminSupabase
      .from("users")
      .upsert(payload, { onConflict: "id" })
      .select("id")
      .maybeSingle();

    if (result.error) {
      lastErrorMessage = result.error.message;
      continue;
    }

    if (result.data?.id) {
      return;
    }
  }

  throw new Error(lastErrorMessage);
}

async function saveAuthDisplayNameMetadata(args: {
  adminSupabase: AdminSupabase;
  userId: string;
  displayName: string;
  currentMetadata: Record<string, unknown>;
}): Promise<void> {
  const { error } = await args.adminSupabase.auth.admin.updateUserById(
    args.userId,
    {
      user_metadata: {
        ...args.currentMetadata,
        display_name_candidate: args.displayName,
        display_name: args.displayName,
      },
    }
  );

  if (error) {
    throw error;
  }
}

async function syncDisplayNameEverywhere(args: {
  adminSupabase: AdminSupabase;
  userId: string;
  displayName: string;
}): Promise<void> {
  const updatedAt = new Date().toISOString();

  const userColumnPayloads = [
    { display_name: args.displayName, updated_at: updatedAt },
    { display_name: args.displayName },
    { username: args.displayName, updated_at: updatedAt },
    { username: args.displayName },
    { pen_name: args.displayName, updated_at: updatedAt },
    { pen_name: args.displayName },
    { name: args.displayName, updated_at: updatedAt },
    { name: args.displayName },
  ];

  for (const payload of userColumnPayloads) {
    await args.adminSupabase
      .from("users")
      .update(payload)
      .eq("id", args.userId);
  }

  const humanRecordingPayloads = [
    {
      reader_name: args.displayName,
      narrator_name: args.displayName,
      display_name: args.displayName,
      speaker_name: args.displayName,
      updated_at: updatedAt,
    },
    {
      reader_name: args.displayName,
      narrator_name: args.displayName,
      display_name: args.displayName,
      speaker_name: args.displayName,
    },
  ];

  for (const payload of humanRecordingPayloads) {
    await args.adminSupabase
      .from("recordings")
      .update(payload)
      .eq("reader_user_id", args.userId)
      .is("voice_model_id", null);

    await args.adminSupabase
      .from("recordings")
      .update(payload)
      .eq("reader_id", args.userId)
      .is("voice_model_id", null);
  }
}

export async function POST(request: Request) {
  let payload: Record<string, unknown>;

  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { ok: false, error: "リクエストを読めなかった。" },
      { status: 400 }
    );
  }

  const normalizedDisplayName = normalizeDisplayName(
    readText(payload.displayName)
  );
  const validationError = validateDisplayName(normalizedDisplayName);

  if (validationError) {
    return NextResponse.json(
      { ok: false, error: validationError },
      { status: 400 }
    );
  }

  const bio =
    hasOwn(payload, "bio") ? normalizeBio(readText(payload.bio)) : undefined;

  if (typeof bio === "string" && bio.length > 1000) {
    return NextResponse.json(
      { ok: false, error: "自己紹介は1000文字以内で入力して。" },
      { status: 400 }
    );
  }

  let xUrl: string | undefined;
  let noteUrl: string | undefined;

  try {
    xUrl = hasOwn(payload, "xUrl")
      ? normalizeExternalUrl(readText(payload.xUrl))
      : undefined;
    noteUrl = hasOwn(payload, "noteUrl")
      ? normalizeExternalUrl(readText(payload.noteUrl))
      : undefined;
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "外部リンクの保存に失敗した。",
      },
      { status: 400 }
    );
  }

  if (typeof xUrl === "string" && xUrl.length > 500) {
    return NextResponse.json(
      { ok: false, error: "Xリンクは500文字以内で入力して。" },
      { status: 400 }
    );
  }

  if (typeof noteUrl === "string" && noteUrl.length > 500) {
    return NextResponse.json(
      { ok: false, error: "noteリンクは500文字以内で入力して。" },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json(
      { ok: false, error: "ログイン状態を確認できなかった。" },
      { status: 401 }
    );
  }

  try {
    const adminSupabase = createAdminClient();

    const conflict = await findDisplayNameConflict({
      supabase: adminSupabase,
      displayName: normalizedDisplayName,
      excludeUserId: user.id,
    });

    if (conflict) {
      return NextResponse.json(
        { ok: false, error: "このユーザー名はすでに使われている。" },
        { status: 409 }
      );
    }

    await saveAuthDisplayNameMetadata({
      adminSupabase,
      userId: user.id,
      displayName: normalizedDisplayName,
      currentMetadata:
        user.user_metadata && typeof user.user_metadata === "object"
          ? (user.user_metadata as Record<string, unknown>)
          : {},
    });

    await savePublicUserProfile({
      adminSupabase,
      userId: user.id,
      displayName: normalizedDisplayName,
      bio,
      xUrl,
      noteUrl,
    });

    await syncDisplayNameEverywhere({
      adminSupabase,
      userId: user.id,
      displayName: normalizedDisplayName,
    });

    return NextResponse.json({
      ok: true,
      displayName: normalizedDisplayName,
      bio: typeof bio === "string" ? bio : undefined,
      xUrl,
      noteUrl,
    });
  } catch (error) {
    console.error("[account-profile-save]", error);

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "プロフィールの保存に失敗した。",
      },
      { status: 500 }
    );
  }
}