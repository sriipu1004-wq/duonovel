"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import {
  ACCOUNT_GENDER_OPTIONS,
  ACCOUNT_SIGNUP_CONSENT_VERSION,
  AccountRegistrationMethod,
  buildCompletedAccountRegistrationMetadata,
  buildPendingAccountRegistrationMetadata,
  hasRequiredAccountRegistrationConsent,
  isAccountRegistrationCompleted,
  normalizeAccountRegistrationMethod,
  normalizeNextPath,
  readAccountRegistrationBirthdate,
  readAccountRegistrationConsent,
  readAccountRegistrationDisplayName,
  readAccountRegistrationGender,
} from "@/lib/auth/accountSignupConsent";

type PendingAction = "email-signup" | "complete-profile" | null;

function isEmailConfirmed(user: User | null): boolean {
  return typeof user?.email_confirmed_at === "string" && user.email_confirmed_at.length > 0;
}

async function syncPublicUserProfile(userId: string, displayName: string) {
  const trimmedDisplayName = displayName.trim();
  const nowIso = new Date().toISOString();

  const updatePayloads: Array<Record<string, unknown>> = [
    { display_name: trimmedDisplayName, updated_at: nowIso },
    { display_name: trimmedDisplayName },
  ];

  for (const payload of updatePayloads) {
    const result = await supabase
      .from("users")
      .update(payload)
      .eq("id", userId)
      .select("id, display_name")
      .maybeSingle();

    if (!result.error && result.data?.id) {
      return;
    }
  }

  const upsertPayloads: Array<Record<string, unknown>> = [
    { id: userId, display_name: trimmedDisplayName, updated_at: nowIso },
    { id: userId, display_name: trimmedDisplayName },
  ];

  let lastErrorMessage = "ユーザー名の保存に失敗した。";

  for (const payload of upsertPayloads) {
    const result = await supabase
      .from("users")
      .upsert(payload, { onConflict: "id" })
      .select("id, display_name")
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

export default function RegisterPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const method = useMemo(
    () =>
      normalizeAccountRegistrationMethod(searchParams.get("method"), "email"),
    [searchParams]
  );
  const nextPath = useMemo(
    () => normalizeNextPath(searchParams.get("next"), "/mypage"),
    [searchParams]
  );
  const stage = useMemo(
    () => (typeof searchParams.get("stage") === "string" ? searchParams.get("stage") : ""),
    [searchParams]
  );
  const initialEmail = useMemo(
    () => (typeof searchParams.get("email") === "string" ? searchParams.get("email") ?? "" : ""),
    [searchParams]
  );

  const isOAuthMethod = method === "google" || method === "apple";
  const providerLabel =
    method === "google" ? "Google" : method === "apple" ? "Apple" : "メール";

  const [user, setUser] = useState<User | null>(null);
  const [loadedUser, setLoadedUser] = useState(false);
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [birthdate, setBirthdate] = useState("");
  const [gender, setGender] = useState("");
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

  const profileComplete =
    displayName.trim().length > 0 &&
    birthdate.trim().length > 0 &&
    gender.trim().length > 0 &&
    consentComplete;

  useEffect(() => {
    let active = true;

    async function loadUser() {
      const { data, error } = await supabase.auth.getUser();

      if (!active) return;

      if (error) {
        setErrorMessage("ユーザー状態の取得に失敗した。");
        setLoadedUser(true);
        return;
      }

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
    setBirthdate((prev) =>
      prev.trim().length > 0 ? prev : readAccountRegistrationBirthdate(metadata)
    );
    setGender((prev) =>
      prev.trim().length > 0 ? prev : readAccountRegistrationGender(metadata)
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

  async function completeSignedInRegistration(
    sessionUser: User,
    registrationMethod: AccountRegistrationMethod
  ) {
    if (!profileComplete) {
      setErrorMessage("ユーザー登録に必要な入力がまだ不足している。");
      return;
    }

    setPendingAction("complete-profile");
    setMessage("");
    setErrorMessage("");

    const metadata = buildCompletedAccountRegistrationMetadata({
      method: registrationMethod,
      displayName,
      birthdate,
      gender,
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
      await syncPublicUserProfile(sessionUser.id, displayName);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "プロフィール保存に失敗した。"
      );
      setPendingAction(null);
      return;
    }

    setMessage("ユーザー登録を完了した。マイページへ移動する。");
    setPendingAction(null);
    router.push(nextPath);
    router.refresh();
  }

  async function handleEmailRegistration(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isOAuthMethod) {
      return;
    }

    if (!profileComplete) {
      setErrorMessage("ユーザー登録に必要な入力がまだ不足している。");
      return;
    }

    if (!email.trim() || !password.trim()) {
      setErrorMessage("メールアドレスとパスワードが必要。");
      return;
    }

    setPendingAction("email-signup");
    setMessage("");
    setErrorMessage("");

    const emailRedirectTo =
      typeof window !== "undefined"
        ? `${window.location.origin}/auth/callback?mode=email-confirm&provider=email`
        : undefined;

    const metadata = buildPendingAccountRegistrationMetadata({
      method: "email",
      displayName,
      birthdate,
      gender,
      agreedToTerms,
      agreedToPrivacy,
      acknowledgedPublicSurface,
    });

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo,
        data: metadata,
      },
    });

    if (error) {
      setErrorMessage(error.message);
      setPendingAction(null);
      return;
    }

    if (data.session?.user) {
      await completeSignedInRegistration(data.session.user, "email");
      return;
    }

    setMessage(
      "確認メールを送った。メール内リンクを開くと、この登録導線に戻って続きへ進める。"
    );
    setPendingAction(null);
  }

  async function handleOAuthCompletion(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!user) {
      setErrorMessage("先に Google または Apple で認証してから戻ってきて。");
      return;
    }

    await completeSignedInRegistration(user, method);
  }

  const registrationButtonLabel = isOAuthMethod
    ? "ユーザー登録を完了"
    : pendingAction === "email-signup"
      ? "アカウント作成中..."
      : "メールアドレスでアカウント作成";

  return (
    <main className="min-h-screen bg-white px-6 py-8 text-black">
      <div className="mx-auto w-full max-w-3xl">
        <section className="overflow-hidden rounded-[32px] border border-black/10 bg-white shadow-sm">
          <div className="px-6 py-8 sm:px-8 sm:py-10">
            <p className="text-xs tracking-[0.24em] text-neutral-500">
              ACCOUNT REGISTER
            </p>

            <h1 className="mt-3 text-3xl font-bold leading-tight text-black sm:text-4xl">
              ユーザー登録
            </h1>

            <p className="mt-4 text-sm leading-7 text-neutral-600">
              {isOAuthMethod
                ? `${providerLabel} の認証後に、公開プロフィール用の基本情報を登録する。`
                : "メールアドレス・パスワード・基本プロフィール・規約同意をまとめて登録する。"}
            </p>

            {isOAuthMethod ? (
              <div className="mt-6 rounded-[24px] border border-sky-200 bg-sky-50 p-4 text-sm leading-7 text-neutral-700">
                {!loadedUser ? (
                  <p>認証状態を確認中...</p>
                ) : user ? (
                  <>
                    <p>認証済みアカウント: {user.email ?? "メールアドレス不明"}</p>
                    <p className="mt-2">
                      ここで入力するユーザー名は、公開プロフィール表示用として扱う。
                    </p>
                  </>
                ) : (
                  <>
                    <p>まだ {providerLabel} 認証後のセッションが見つかっていない。</p>
                    <p className="mt-2">
                      先に新規作成ページから {providerLabel} で認証してから戻る。
                    </p>
                  </>
                )}
              </div>
            ) : (
              <div className="mt-6 rounded-[24px] border border-sky-200 bg-sky-50 p-4 text-sm leading-7 text-neutral-700">
                <p>メールアドレス登録では、確認メールが必要な環境では認証完了後に利用を続けられる。</p>
                <p className="mt-2">
                  {stage === "confirmed"
                    ? "メール認証後に戻ってきた場合は、必要情報を確認して登録を完了する。"
                    : "先にこの画面でメールアドレス・パスワードも含めて入力する。"}
                </p>
              </div>
            )}

            <form
              onSubmit={isOAuthMethod ? handleOAuthCompletion : handleEmailRegistration}
              className="mt-8"
            >
              <div className="rounded-[28px] border border-black/10 bg-white p-6">
                {!isOAuthMethod ? (
                  <>
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

                    <label className="mt-4 block">
                      <span className="text-sm text-neutral-700">パスワード</span>

                      <div className="mt-2 flex items-center gap-2">
                        <input
                          type={showPassword ? "text" : "password"}
                          autoComplete="new-password"
                          autoCapitalize="none"
                          autoCorrect="off"
                          spellCheck={false}
                          inputMode="text"
                          value={password}
                          onChange={(event) => setPassword(event.target.value)}
                          className="h-12 flex-1 rounded-2xl border border-black/10 bg-white px-4 text-sm text-black outline-none placeholder:text-neutral-400 focus:border-sky-200"
                          placeholder="英数字で入力"
                          required
                        />

                        <button
                          type="button"
                          onClick={() => setShowPassword((prev) => !prev)}
                          className="inline-flex h-12 shrink-0 items-center justify-center rounded-2xl border border-black/10 bg-neutral-50 px-4 text-sm text-neutral-700 transition hover:bg-neutral-100"
                          aria-label={showPassword ? "パスワードを隠す" : "パスワードを表示する"}
                          aria-pressed={showPassword}
                        >
                          {showPassword ? "隠す" : "表示"}
                        </button>
                      </div>
                    </label>
                  </>
                ) : null}

                <label className="mt-4 block">
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

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-sm text-neutral-700">生年月日</span>
                    <input
                      type="date"
                      value={birthdate}
                      onChange={(event) => setBirthdate(event.target.value)}
                      className="mt-2 h-12 w-full rounded-2xl border border-black/10 bg-white px-4 text-sm text-black outline-none focus:border-sky-200"
                      required
                    />
                  </label>

                  <label className="block">
                    <span className="text-sm text-neutral-700">性別</span>
                    <select
                      value={gender}
                      onChange={(event) => setGender(event.target.value)}
                      className="mt-2 h-12 w-full rounded-2xl border border-black/10 bg-white px-4 text-sm text-black outline-none focus:border-sky-200"
                      required
                    >
                      <option value="">選択する</option>
                      {ACCOUNT_GENDER_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

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
                        表示名、プロフィール、投稿コンテンツが公開されうること、
                        および違反時に削除、公開停止、機能制限、利用停止の可能性があることを確認した
                      </span>
                    </label>
                  </div>

                  <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-xs leading-6 text-neutral-700">
                    <p>基本同意 version: {ACCOUNT_SIGNUP_CONSENT_VERSION}</p>
                    <p className="mt-2">
                      今回の同意状態は、今後の Google / Apple 導線でも流用しやすい形で metadata に保持する。
                    </p>
                  </div>
                </div>

                <div className="mt-6 flex flex-wrap gap-3">
                  <button
                    type="submit"
                    disabled={
                      pendingAction !== null ||
                      !profileComplete ||
                      (isOAuthMethod ? !user : false)
                    }
                    className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-5 py-2.5 text-sm font-medium text-black transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {pendingAction === "complete-profile"
                      ? "登録完了中..."
                      : registrationButtonLabel}
                  </button>

                  <Link
                    href={isOAuthMethod ? "/signup" : "/login"}
                    className="inline-flex rounded-full border border-black/10 bg-white px-5 py-2.5 text-sm text-neutral-700 transition hover:bg-neutral-50"
                  >
                    戻る
                  </Link>
                </div>

                {method === "email" && user ? (
                  <div className="mt-5 rounded-2xl border border-black/10 bg-neutral-50 p-4 text-xs leading-6 text-neutral-600">
                    <p>
                      現在のメール認証状態: {isEmailConfirmed(user) ? "認証済み" : "未認証"}
                    </p>
                    <p className="mt-2">
                      認証済みなら、この画面で登録完了まで進める。未認証なら確認メールの案内を先に確認する。
                    </p>
                  </div>
                ) : null}
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