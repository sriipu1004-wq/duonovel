type EmailAvailabilityStatus = "available" | "confirmed" | "unconfirmed";

type CheckEmailAvailabilityResponse = {
  ok?: boolean;
  available?: boolean;
  status?: EmailAvailabilityStatus;
  normalizedEmail?: string;
  error?: string;
};

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export async function checkEmailAvailability(email: string): Promise<string> {
  const normalizedEmail = normalizeEmail(email);

  const response = await fetch("/api/account/email/check", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: normalizedEmail,
    }),
  });

  const payload = (await response.json().catch(() => null)) as
    | CheckEmailAvailabilityResponse
    | null;

  if (!response.ok || !payload?.ok) {
    throw new Error(
      payload?.error ?? "メールアドレスの重複確認に失敗した。"
    );
  }

  if (!payload.available) {
    throw new Error(
      payload.error ||
        (payload.status === "unconfirmed"
          ? "このメールアドレスは確認待ち。確認メールのリンクを開いてからログインして。確認がまだなら作成を続けられない。"
          : "このメールアドレスはすでに登録済み。ログインへ進んで。")
    );
  }

  return payload.normalizedEmail?.trim() || normalizedEmail;
}