"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import {
  buildCompletedAccountRegistrationMetadata,
  buildPendingAccountRegistrationMetadata,
  hasRequiredAccountRegistrationConsent,
  isAccountRegistrationCompleted,
  normalizeDisplayName,
  normalizeNextPath,
  readAccountRegistrationConsent,
  readAccountRegistrationDisplayName,
  validateDisplayName,
} from "@/lib/auth/accountSignupConsent";
import { checkDisplayNameAvailability } from "@/lib/auth/checkDisplayNameAvailability";
import { syncPublicUserProfile } from "@/lib/auth/syncPublicUserProfile";

type PendingAction = "email-signup" | "complete-profile" | null;

type PrepareSignupEmailResponse = {
  ok?: boolean;
  normalizedEmail?: string;
  status?: "available" | "deleted_unconfirmed" | "confirmed";
  error?: string;
};

function isEmailConfirmed(user: User | null): boolean {
  return (
    typeof user?.email_confirmed_at === "string" &&
    user.email_confirmed_at.length > 0
  );
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function resolveAuthRedirectOrigin(): string {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() ?? "";

  if (siteUrl.length > 0) {
    return siteUrl.replace(/\/+$/, "");
  }

  if (typeof window !== "undefined") {
    return window.location.origin.replace(/\/+$/, "");
  }

  return "";
}

async function prepareSignupEmail(email: string): Promise<string> {
  const normalizedEmail = normalizeEmail(email);

  const response = await fetch("/api/account/email/prepare-signup", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: normalizedEmail,
    }),
  });

  const payload = (await response.json().catch(() => null)) as
    | PrepareSignupEmailResponse
    | null;

  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error ?? "確認メール送信の準備に失敗した。");
  }

  return payload.normalizedEmail?.trim() || normalizedEmail;
}

export default function RegisterPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const nextPath = useMemo(
    () => normalizeNextPath(searchParams.get("next"), "/mypage"),
    [searchParams]
  );

  const initialEmail = useMemo(
    () =>
      typeof searchParams.get("email") === "string"
        ? searchParams.get("email") ?? ""
        : "",
    [searchParams]
  );

  const [user, setUser] = useState<User | null>(null);
  const [loadedUser, setLoadedUser] = useState(false);
  const [email, setEmail] = useState(initialEmail);
  const [displayName, setDisplayName] = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [agreedToPrivacy, setAgreedToPrivacy] = useState(false);
  const [acknowledgedPublicSurface, setAcknowledgedPublicSurface] =
    useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const consentComplete = hasRequiredAccountRegistrationConsent({
    agreedToTerms,
    agreedToPrivacy,
    acknowledgedPublicSurface,
  });

  const normalizedDisplayName = normalizeDisplayName(displayName);
  const displayNameError = validateDisplayName(displayName);

  const profileComplete =
    normalizedDisplayName.length > 0 &&
    consentComplete &&
    !displayNameError;

  useEffect(() => {
    let active = true;

    async function loadUser() {
      const { data } = await supabase.auth.getUser();

      if (!active) return;

      setUser(data.user ?? null);
      setLoadedUser(true);
    }

    void loadUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setUser(session?.user ?? null);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!user) {
      return;
    }

    const metadata = user.user_metadata ?? {};

    setEmail((prev) => (prev.trim().length > 0 ? prev : user.email ?? ""));
    setDisplayName((prev) =>
      prev.trim().length > 0 ? prev : readAccountRegistrationDisplayName(metadata)
    );
    setAgreedToTerms((prev) =>
      prev || readAccountRegistrationConsent(metadata, "account_public_profile_ack")
    );
    setAgreedToPrivacy((prev) =>
      prev || readAccountRegistrationConsent(metadata, "account_public_content_ack")
    );
    setAcknowledgedPublicSurface((prev) =>
      prev || readAccountRegistrationConsent(metadata, "account_enforcement_ack")
    );

    if (isAccountRegistrationCompleted(metadata)) {
      router.replace(nextPath);
    }
  }, [user, router, nextPath]);

  async function ensureDisplayNameAvailable(
    candidateDisplayName: string,
    excludeUserId?: string
  ): Promise<string> {
    return checkDisplayNameAvailability(candidateDisplayName, excludeUserId);
  }

  async function completeSignedInRegistration(sessionUser: User) {
    if (!isEmailConfirmed(sessionUser)) {
      setErrorMessage("確認メールのリンクを開いてからやり直して。");
      return;
    }

    if (displayNameError) {
      setErrorMessage(displayNameError);
      return;
    }

    if (!profileComplete) {
      setErrorMessage("登録に必要な入力がまだ不足している。");
      return;
    }

    setPendingAction("complete-profile");
    setMessage("");
    setErrorMessage("");

    let availableDisplayName = normalizedDisplayName;

    try {
      availableDisplayName = await ensureDisplayNameAvailable(
        normalizedDisplayName,
        sessionUser.id
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "ユーザー名の重複確認に失敗した。"
      );
      setPendingAction(null);
      return;
    }

    const metadata = buildCompletedAccountRegistrationMetadata({
      displayName: availableDisplayName,
      agreedToTerms,
      agreedToPrivacy,
      acknowledgedPublicSurface,
    });

    const authResult = await supabase.auth.updateUser({
      data: metadata,
    });

    if (authResult.error) {
      setErrorMessage(authResult.error.message);
      setPendingAction(null);
      return;
    }

    try {
      await syncPublicUserProfile(availableDisplayName);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "プロフィール保存に失敗した。"
      );
      setPendingAction(null);
      return;
    }

    setMessage("登録を完了した。次のページへ移動する。");
    setPendingAction(null);
    router.push(nextPath);
    router.refresh();
  }

  async function handleEmailRegistration(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (user) {
      await completeSignedInRegistration(user);
      return;
    }

    if (displayNameError) {
      setErrorMessage(displayNameError);
      return;
    }

    if (!profileComplete) {
      setErrorMessage("登録に必要な入力がまだ不足している。");
      return;
    }

    if (!email.trim()) {
      setErrorMessage("メールアドレスが必要。");
      return;
    }

    setPendingAction("email-signup");
    setMessage("");
    setErrorMessage("");

    let availableDisplayName = normalizedDisplayName;
    let availableEmail = normalizeEmail(email);

    try {
      availableEmail = await prepareSignupEmail(email);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "メールアドレスの重複確認に失敗した。"
      );
      setPendingAction(null);
      return;
    }

    try {
      availableDisplayName =
        await ensureDisplayNameAvailable(normalizedDisplayName);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "ユーザー名の重複確認に失敗した。"
      );
      setPendingAction(null);
      return;
    }

    const redirectOrigin = resolveAuthRedirectOrigin();
    const emailRedirectTo = redirectOrigin
      ? `${redirectOrigin}/auth/callback?next=${encodeURIComponent(nextPath)}`
      : undefined;

    const metadata = buildPendingAccountRegistrationMetadata({
      displayName: availableDisplayName,
      agreedToTerms,
      agreedToPrivacy,
      acknowledgedPublicSurface,
    });

    const { error } = await supabase.auth.signInWithOtp({
      email: availableEmail,
      options: {
        emailRedirectTo,
        shouldCreateUser: true,
        data: metadata,
      },
    });

    if (error) {
      setErrorMessage(error.message);
      setPendingAction(null);
      return;
    }

    setMessage("確認メールを送った。メール内のリンクからログインして。");
    setPendingAction(null);
  }

  const primaryLabel = user
    ? pendingAction === "complete-profile"
      ? "登録完了中..."
      : "登録を完了して進む"
    : pendingAction === "email-signup"
      ? "確認メールを送信中..."
      : "確認メールを送る";

  return (
    <main className="min-h-screen bg-white px-6 py-8 text-black">
      <div className="mx-auto w-full max-w-4xl">
        <section className="overflow-hidden rounded-[32px] border border-black/10 bg-white shadow-sm">
          <div className="px-6 py-8 sm:px-8 sm:py-10">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700">
                {user ? "STEP 2" : "STEP 1"}
              </span>
              <span className="rounded-full border border-black/10 bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-700">
                メールリンク登録
              </span>
            </div>

            <p className="mt-4 text-xs tracking-[0.24em] text-neutral-500">
              ACCOUNT REGISTER
            </p>

            <h1 className="mt-3 text-3xl font-bold leading-tight text-black sm:text-4xl">
              アカウント作成
            </h1>

            <p className="mt-4 text-sm leading-7 text-neutral-600">
              登録に必要なのはメールアドレスとユーザー名だけ。
            </p>

            <div className="mt-5 rounded-[24px] border border-black/10 bg-neutral-50 p-4 text-sm leading-7 text-neutral-600">
              本名、住所、電話番号、支払い情報は求めない。
            </div>

            {user ? (
              <div className="mt-6 rounded-[24px] border border-sky-200 bg-sky-50 p-4 text-sm leading-7 text-neutral-700">
                {!loadedUser ? (
                  <p>認証状態を確認中...</p>
                ) : (
                  <>
                    <p>ログイン中: {user.email ?? "メールアドレス不明"}</p>
                    <p className="mt-2">
                      確認済みメールアドレスなら、この画面で登録を完了できる。
                    </p>
                  </>
                )}
              </div>
            ) : null}

            <form onSubmit={handleEmailRegistration} className="mt-8">
              <div className="rounded-[28px] border border-black/10 bg-white p-6">
                {!user ? (
                  <label className="block">
                    <span className="text-sm text-neutral-700">メールアドレス</span>
                    <input
                      type="email"
                      autoComplete="email"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      inputMode="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      className="mt-2 h-12 w-full rounded-2xl border border-black/10 bg-white px-4 text-sm text-black outline-none placeholder:text-neutral-400 focus:border-sky-200"
                      placeholder="you@example.com"
                      required
                    />
                  </label>
                ) : null}

                <label className={user ? "block" : "mt-4 block"}>
                  <span className="text-sm text-neutral-700">ユーザー名</span>
                  <input
                    type="text"
                    autoComplete="nickname"
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    className="mt-2 h-12 w-full rounded-2xl border border-black/10 bg-white px-4 text-sm text-black outline-none placeholder:text-neutral-400 focus:border-sky-200"
                    placeholder="公開プロフィールに出す名前"
                    required
                  />
                </label>

                {displayNameError ? (
                  <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {displayNameError}
                  </div>
                ) : null}

                <div className="mt-6 rounded-[24px] border border-black/10 bg-neutral-50 p-4">
                  <p className="text-sm font-semibold text-black">規約・同意</p>

                  <div className="mt-4 space-y-4 text-sm leading-7 text-neutral-700">
                    <label className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={agreedToTerms}
                        onChange={(event) => setAgreedToTerms(event.target.checked)}
                        className="mt-1 h-4 w-4 rounded border-black/20"
                      />
                      <span>
                        <Link
                          href="/terms"
                          target="_blank"
                          className="underline underline-offset-4"
                        >
                          利用規約
                        </Link>
                        に同意する
                      </span>
                    </label>

                    <label className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={agreedToPrivacy}
                        onChange={(event) => setAgreedToPrivacy(event.target.checked)}
                        className="mt-1 h-4 w-4 rounded border-black/20"
                      />
                      <span>
                        <Link
                          href="/privacy"
                          target="_blank"
                          className="underline underline-offset-4"
                        >
                          プライバシーポリシー
                        </Link>
                        に同意する
                      </span>
                    </label>

                    <label className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={acknowledgedPublicSurface}
                        onChange={(event) =>
                          setAcknowledgedPublicSurface(event.target.checked)
                        }
                        className="mt-1 h-4 w-4 rounded border-black/20"
                      />
                      <span>
                        表示名、プロフィール、投稿コンテンツが公開されうることを確認した
                      </span>
                    </label>
                  </div>
                </div>

                <div className="mt-6 flex flex-wrap gap-3">
                  <button
                    type="submit"
                    disabled={
                      pendingAction !== null ||
                      !profileComplete ||
                      !!displayNameError
                    }
                    className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-5 py-2.5 text-sm font-medium text-black transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {primaryLabel}
                  </button>

                  <Link
                    href="/login"
                    className="inline-flex rounded-full border border-black/10 bg-white px-5 py-2.5 text-sm text-neutral-700 transition hover:bg-neutral-50"
                  >
                    ログインへ戻る
                  </Link>
                </div>
              </div>
            </form>

            {message ? (
              <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {message}
              </div>
            ) : null}

            {errorMessage ? (
              <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {errorMessage}
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}
