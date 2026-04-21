import { normalizeDisplayName } from "@/lib/auth/accountSignupConsent";

type CheckDisplayNameAvailabilityResponse = {
  ok?: boolean;
  available?: boolean;
  normalizedDisplayName?: string;
  error?: string;
};

export async function checkDisplayNameAvailability(
  displayName: string,
  excludeUserId?: string
): Promise<string> {
  const normalizedDisplayName = normalizeDisplayName(displayName);

  const response = await fetch("/api/account/display-name/check", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      displayName: normalizedDisplayName,
      excludeUserId: excludeUserId ?? "",
    }),
  });

  const payload = (await response.json().catch(() => null)) as
    | CheckDisplayNameAvailabilityResponse
    | null;

  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error ?? "ユーザー名の重複確認に失敗した。");
  }

  if (!payload.available) {
    throw new Error(payload.error || "このユーザー名はすでに使われている。");
  }

  return payload.normalizedDisplayName?.trim() || normalizedDisplayName;
}