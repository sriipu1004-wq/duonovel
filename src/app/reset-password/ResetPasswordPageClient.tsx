"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { normalizeNextPath } from "@/lib/auth/accountSignupConsent";
import { supabase } from "@/lib/supabaseClient";
import { useUiLocale } from "@/i18n/UiLocaleProvider";
import { accountDictionaries } from "@/i18n/dictionaries/account";
import { localizePath } from "@/i18n/navigation";

const PASSWORD_MIN_LENGTH = 8;

export default function ResetPasswordPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const locale = useUiLocale();
  const dictionary = accountDictionaries[locale];
  const nextPath = useMemo(
    () => normalizeNextPath(searchParams.get("next"), localizePath("/mypage", locale)),
    [searchParams, locale]
  );

  const [user, setUser] = useState<User | null>(null);
  const [loadedUser, setLoadedUser] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

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
      setLoadedUser(true);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");

    if (password.length < PASSWORD_MIN_LENGTH) {
      setErrorMessage(dictionary.passwordTooShort(PASSWORD_MIN_LENGTH));
      return;
    }

    if (password !== passwordConfirmation) {
      setErrorMessage(dictionary.passwordMismatch);
      return;
    }

    setPending(true);
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setErrorMessage(
        error.message.toLowerCase().includes("new password should be different")
          ? dictionary.passwordMustDiffer
          : error.message
      );
      setPending(false);
      return;
    }

    router.replace(nextPath);
    router.refresh();
  }

  return (
    <main className="min-h-screen bg-white px-6 py-8 text-black">
      <div className="mx-auto w-full max-w-3xl">
        <section className="overflow-hidden rounded-[32px] border border-black/10 bg-white shadow-sm">
          <div className="px-6 py-8 sm:px-8 sm:py-10">
            <p className="text-xs tracking-[0.24em] text-neutral-500">AUTH</p>
            <h1 className="mt-3 text-3xl font-bold leading-tight text-black sm:text-4xl">
              {dictionary.resetTitle}
            </h1>
            <p className="mt-4 text-sm leading-7 text-neutral-600">
              {dictionary.resetDescription}
            </p>

            {!loadedUser ? (
              <div className="mt-8 rounded-[28px] border border-black/10 bg-neutral-50 p-6 text-sm text-neutral-600">
                {dictionary.checkingAuth}
              </div>
            ) : user ? (
              <form onSubmit={handleSubmit} className="mt-8">
                <div className="rounded-[28px] border border-black/10 bg-white p-6">
                  <p className="text-sm text-neutral-600">
                    {user.email ?? dictionary.unknownEmail}
                  </p>

                  <label className="mt-4 block">
                    <span className="text-sm text-neutral-700">{dictionary.newPassword}</span>
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

                  <label className="mt-4 block">
                    <span className="text-sm text-neutral-700">
                      {dictionary.newPasswordConfirm}
                    </span>
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

                  <button
                    type="submit"
                    disabled={pending}
                    className="mt-6 inline-flex rounded-full bg-black px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {pending ? dictionary.settingPassword : dictionary.setPassword}
                  </button>
                </div>
              </form>
            ) : (
              <div className="mt-8 rounded-[28px] border border-amber-200 bg-amber-50 p-6 text-sm leading-7 text-neutral-700">
                <p>{dictionary.resetInvalid}</p>
                <Link
                  href={`${localizePath("/login", locale)}?next=${encodeURIComponent(nextPath)}`}
                  className="mt-3 inline-flex font-medium text-sky-700 underline underline-offset-4"
                >
                  {dictionary.resetFromLogin}
                </Link>
              </div>
            )}

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
