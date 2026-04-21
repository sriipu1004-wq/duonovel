import { normalizeDisplayName } from "@/lib/auth/accountSignupConsent";

type SyncPublicUserProfileResponse = {
  ok?: boolean;
  displayName?: string;
  bio?: string;
  xUrl?: string;
  noteUrl?: string;
  error?: string;
};

function normalizeBio(value: string): string {
  return value.replace(/\r\n?/g, "\n").trim();
}

export async function syncPublicUserProfile(
  displayName: string,
  bio?: string,
  xUrl?: string,
  noteUrl?: string
): Promise<{
  displayName: string;
  bio: string;
  xUrl: string;
  noteUrl: string;
}> {
  const normalizedDisplayName = normalizeDisplayName(displayName);

  const requestBody: Record<string, unknown> = {
    displayName: normalizedDisplayName,
  };

  if (typeof bio === "string") {
    requestBody.bio = normalizeBio(bio);
  }

  if (typeof xUrl === "string") {
    requestBody.xUrl = xUrl.trim();
  }

  if (typeof noteUrl === "string") {
    requestBody.noteUrl = noteUrl.trim();
  }

  const response = await fetch("/api/account/profile", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  const payload = (await response.json().catch(() => null)) as
    | SyncPublicUserProfileResponse
    | null;

  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error ?? "プロフィールの保存に失敗した。");
  }

  return {
    displayName: payload.displayName?.trim() || normalizedDisplayName,
    bio: payload.bio?.trim() || "",
    xUrl: payload.xUrl?.trim() || "",
    noteUrl: payload.noteUrl?.trim() || "",
  };
}