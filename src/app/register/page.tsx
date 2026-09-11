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
import { useUiLocale } from "@/i18n/UiLocaleProvider";
import { accountDictionaries } from "@/i18n/dictionaries/account";
import { localizePath } from "@/i18n/navigation";

type PendingAction = "email-signup" | "complete-profile" | null;

const PASSWORD_MIN_LENGTH = 8;

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
  if (typeof window !== "undefined") {
    const currentOrigin = window.location.origin.replace(/\/+$/, "");
    if (currentOrigin.length > 0) return currentOrigin;
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() ?? "";
  if (siteUrl.length > 0) return siteUrl.replace(/\/+$/, "");

  if (typeof window !== "undefined") {
    return window.location.origin.replace(/\/+$/, "");
  }

  return "";
}

async function prepareSignupEmail(
  email: string,
  fallbackError: string
): Promise<string> {
  const normalizedEmail = normalizeEmail(email);
  const response = await fetch("/api/account/email/prepare-signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: normalizedEmail }),
  });

  const payload = (await response.json().catch(() => null)) as
    | PrepareSignupEmailResponse
    | null;

  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error ?? fallbackError);
  }

  return payload.normalizedEmail?.trim() || normalizedEmail;
}

export default function RegisterPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const locale = useUiLocale();
  const dictionary = accountDictionaries[locale];

  const nextPath = useMemo(
    () => normalizeNextPath(searchParams.get("next"), localizePath("/mypage", locale)),
    [searchParams, locale]
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
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [agreedToPrivacy, setAgreedToPrivacy] = useState(false);
  const [acknowledgedPublicSurface, setAcknowledgedPublicSurface] = useState(false);
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
    normalizedDisplayName.length > 0 && consentComplete && !displayNameError;

  const passwordError = user
    ? ""
    : password.length < PASSWORD_MIN_LENGTH
      ? dictionary.passwordTooShort(PASSWORD_MIN_LENGTH)
      : password !== passwordConfirmation
        ? dictionary.passwordMismatch
        : "";

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
    if (!user) return;

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
      setErrorMessage(dictionary.openConfirmationFirst);
      return;
    }
    if (displayNameError) {
      setErrorMessage(displayNameError);
      return;
    }
    if (!profileComplete) {
      setErrorMessage(dictionary.missingRegistrationInput);
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
        error instanceof Error ? error.message : dictionary.duplicateNameFailed
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

    const authResult = await supabase.auth.updateUser({ data: metadata });
    if (authResult.error) {
      setErrorMessage(authResult.error.message);
      setPendingAction(null);
      return;
    }

    try {
      await syncPublicUserProfile(availableDisplayName);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : dictionary.profileSaveFailed
      );
      setPendingAction(null);
      return;
    }

    setMessage(dictionary.registrationComplete);
    setPendingAction(null);
    router.push(nextPath);
    router.refresh();
  }

  async function handleEmailRegistration(event: React.FormEvent<HTMLFormElement>) {
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
      setErrorMessage(dictionary.missingRegistrationInput);
      return;
    }
    if (!email.trim()) {
      setErrorMessage(dictionary.emailRequired);
      return;
    }
    if (passwordError) {
      setErrorMessage(passwordError);
      return;
    }

    setPendingAction("email-signup");
    setMessage("");
    setErrorMessage("");

    let availableDisplayName = normalizedDisplayName;
    let availableEmail = normalizeEmail(email);

    try {
      availableEmail = await prepareSignupEmail(email, dictionary.signupPrepareFailed);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : dictionary.duplicateEmailFailed
      );
      setPendingAction(null);
      return;
    }

    try {
      availableDisplayName = await ensureDisplayNameAvailable(normalizedDisplayName);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : dictionary.duplicateNameFailed
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

    const { data, error } = await supabase.auth.signUp({
      email: availableEmail,
      password,
      options: { emailRedirectTo, data: metadata },
    });

    if (error) {
      setErrorMessage(error.message);
      setPendingAction(null);
      return;
    }

    if (data.session && data.user) {
      await completeSignedInRegistration(data.user);
      return;
    }

    setMessage(dictionary.confirmationSent);
    setPendingAction(null);
  }

  const primaryLabel = user
    ? pendingAction === "complete-profile"
      ? dictionary.completePending
      : dictionary.complete
    : pendingAction === "email-signup"
      ? dictionary.sendingConfirmation
      : dictionary.sendConfirmation;

  const loginHref = `${localizePath("/login", locale)}?next=${encodeURIComponent(nextPath)}`;

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
                {dictionary.passwordRegistration}
              </span>
            </div>

            <p className="mt-4 text-xs tracking-[0.24em] text-neutral-500">ACCOUNT REGISTER</p>
            <h1 className="mt-3 text-3xl font-bold leading-tight text-black sm:text-4xl">
              {dictionary.registerTitle}
            </h1>
            <p className="mt-4 text-sm leading-7 text-neutral-600">
              {dictionary.registerDescription}
            </p>

            {user ? (
              <div className="mt-6 rounded-[24px] border border-sky-200 bg-sky-50 p-4 text-sm leading-7 text-neutral-700">
                {!loadedUser ? (
                  <p>{dictionary.checkingAuth}</p>
                ) : (
                  <>
                    <p>{dictionary.signedInAs}: {user.email ?? dictionary.unknownEmail}</p>
                    <p className="mt-2">{dictionary.confirmedEmailHint}</p>
                  </>
                )}
              </div>
            ) : null}

            <form onSubmit={handleEmailRegistration} className="mt-8">
              <div className="rounded-[28px] border border-black/10 bg-white p-6">
                {!user ? (
                  <div className="grid gap-4">
                    <label className="block">
                      <span className="text-sm text-neutral-700">{dictionary.email}</span>
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

                    <label className="block">
                      <span className="text-sm text-neutral-700">{dictionary.password}</span>
                      <input
                        type="password"
                        autoComplete="new-password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        className="mt-2 h-12 w-full rounded-2xl border border-black/10 bg-white px-4 text-sm text-black outline-none placeholder:text-neutral-400 focus:border-sky-200"
                        placeholder={dictionary.passwordMin(PASSWORD_MIN_LENGTH)}
                        minLength={PASSWORD_MIN_LENGTH}
                        required
                      />
                    </label>

                    <label className="block">
                      <span className="text-sm text-neutral-700">{dictionary.passwordConfirm}</span>
                      <input
                        type="password"
                        autoComplete="new-password"
                        value={passwordConfirmation}
                        onChange={(event) => setPasswordConfirmation(event.target.value)}
                        className="mt-2 h-12 w-full rounded-2xl border border-black/10 bg-white px-4 text-sm text-black outline-none placeholder:text-neutral-400 focus:border-sky-200"
                        placeholder={dictionary.enterAgain}
                        minLength={PASSWORD_MIN_LENGTH}
                        required
                      />
                    </label>
                  </div>
                ) : null}

                {!user && passwordConfirmation.length > 0 && passwordError ? (
                  <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {passwordError}
                  </div>
                ) : null}

                <label className={user ? "block" : "mt-4 block"}>
                  <span className="text-sm text-neutral-700">{dictionary.displayName}</span>
                  <input
                    type="text"
                    autoComplete="nickname"
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    className="mt-2 h-12 w-full rounded-2xl border border-black/10 bg-white px-4 text-sm text-black outline-none placeholder:text-neutral-400 focus:border-sky-200"
                    placeholder={dictionary.displayNamePlaceholder}
                    required
                  />
                </label>

                {displayNameError ? (
                  <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {displayNameError}
                  </div>
                ) : null}

                <div className="mt-6 rounded-[24px] border border-black/10 bg-neutral-50 p-4">
                  <p className="text-sm font-semibold text-black">{dictionary.consentTitle}</p>
                  <div className="mt-4 space-y-4 text-sm leading-7 text-neutral-700">
                    <label className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={agreedToTerms}
                        onChange={(event) => setAgreedToTerms(event.target.checked)}
                        className="mt-1 h-4 w-4 rounded border-black/20"
                      />
                      <span>
                        <Link href="/terms" target="_blank" className="underline underline-offset-4">
                          {dictionary.terms}
                        </Link>
                        {dictionary.agreeSuffix}
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
                        <Link href="/privacy" target="_blank" className="underline underline-offset-4">
                          {dictionary.privacy}
                        </Link>
                        {dictionary.agreeSuffix}
                      </span>
                    </label>

                    <label className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={acknowledgedPublicSurface}
                        onChange={(event) => setAcknowledgedPublicSurface(event.target.checked)}
                        className="mt-1 h-4 w-4 rounded border-black/20"
                      />
                      <span>{dictionary.publicSurfaceAck}</span>
                    </label>
                  </div>
                </div>

                <div className="mt-6 flex flex-wrap gap-3">
                  <button
                    type="submit"
                    disabled={
                      pendingAction !== null ||
                      !profileComplete ||
                      !!displayNameError ||
                      !!passwordError
                    }
                    className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-5 py-2.5 text-sm font-medium text-black transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {primaryLabel}
                  </button>

                  <Link
                    href={loginHref}
                    className="inline-flex rounded-full border border-black/10 bg-white px-5 py-2.5 text-sm text-neutral-700 transition hover:bg-neutral-50"
                  >
                    {dictionary.backToLogin}
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
