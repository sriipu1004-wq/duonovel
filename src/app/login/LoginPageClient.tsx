"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import { normalizeNextPath } from "@/lib/auth/accountSignupConsent";

type PendingAction =
  | "signin"
  | "email-link"
  | "reset-password"
  | "signout"
  | null;

function resolveAuthRedirectOrigin(): string {
  if (typeof window !== "undefined") {
    const currentOrigin = window.location.origin.replace(/\/+$/, "");

    if (currentOrigin.length > 0) {
      return currentOrigin;
    }
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() ?? "";

  if (siteUrl.length > 0) {
    return siteUrl.replace(/\/+$/, "");
  }

  if (typeof window !== "undefined") {
    return window.location.origin.replace(/\/+$/, "");
  }

  return "";
}

export default function LoginPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const nextPath = useMemo(
    () => normalizeNextPath(searchParams.get("next"), "/"),
    [searchParams]
  );

  const registerHref = useMemo(() => {
    const query = new URLSearchParams();
    query.set("next", nextPath);
    return `/register?${query.toString()}`;
  }, [nextPath]);

  const confirmed = searchParams.get("confirmed") === "1";

  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let active = true;

    async function loadUser() {
      const { data, error } = await supabase.auth.getUser();

      if (!active) return;

      if (error) {
        setErrorMessage("認証状態の取得に失敗した");
        setUser(null);
        return;
      }

      setUser(data.user ?? null);
    }

    void loadUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setUser(session?.user ?? null);
      setErrorMessage("");
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (confirmed) {
      setMessage("確認リンクを開いた。ログイン中なら元のページへ戻れる。");
    }
  }, [confirmed]);

  async function handleSignIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setPendingAction("signin");
    setMessage("");
    setErrorMessage("");

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (error) {
      setErrorMessage(error.message);
      setPendingAction(null);
      return;
    }

    router.push(nextPath);
    router.refresh();
    setPendingAction(null);
  }

  async function handleResetPassword() {
    const normalizedEmail = email.trim().toLowerCase();

    setMessage("");
    setErrorMessage("");

    if (!normalizedEmail) {
      setErrorMessage("パスワードを再設定するメールアドレスを入力して。");
      return;
    }

    setPendingAction("reset-password");

    const redirectOrigin = resolveAuthRedirectOrigin();
    const resetPath = `/reset-password?next=${encodeURIComponent(nextPath)}`;
    const redirectTo = redirectOrigin
      ? `${redirectOrigin}/auth/callback?next=${encodeURIComponent(resetPath)}`
      : undefined;

    const { error } = await supabase.auth.resetPasswordForEmail(
      normalizedEmail,
      redirectTo ? { redirectTo } : undefined
    );

    if (error) {
      setErrorMessage(error.message);
      setPendingAction(null);
      return;
    }

    setMessage(
      "パスワード設定・再設定用メールを送った。メール内のリンクを開いて。"
    );
    setPendingAction(null);
  }

  async function handleEmailLinkSignIn() {
    const normalizedEmail = email.trim().toLowerCase();

    setMessage("");
    setErrorMessage("");

    if (!normalizedEmail) {
      setErrorMessage("ログインするメールアドレスを入力して。");
      return;
    }

    setPendingAction("email-link");

    const redirectOrigin = resolveAuthRedirectOrigin();
    const emailRedirectTo = redirectOrigin
      ? `${redirectOrigin}/auth/callback?next=${encodeURIComponent(nextPath)}`
      : undefined;

    const { error } = await supabase.auth.signInWithOtp({
      email: normalizedEmail,
      options: {
        emailRedirectTo,
        shouldCreateUser: false,
      },
    });

    if (error) {
      setErrorMessage(error.message);
      setPendingAction(null);
      return;
    }

    setMessage(
      "移行用のログインメールを送った。ログイン後、マイページでパスワードを設定して。"
    );
    setPendingAction(null);
  }

  async function handleSignOut() {
    setPendingAction("signout");
    setMessage("");
    setErrorMessage("");

    const { error } = await supabase.auth.signOut();

    if (error) {
      setErrorMessage(error.message);
      setPendingAction(null);
      return;
    }

    setUser(null);
    setMessage("ログアウトした。");
    setPendingAction(null);
    router.refresh();
  }

  const isPending = pendingAction !== null;

  return (
    <main className="min-h-screen bg-white px-6 py-8 text-black">
      <div className="mx-auto w-full max-w-3xl">
        <section className="overflow-hidden rounded-[32px] border border-black/10 bg-white shadow-sm">
          <div className="px-6 py-8 sm:px-8 sm:py-10">
            <p className="text-xs tracking-[0.24em] text-neutral-500">AUTH</p>

            <h1 className="mt-3 text-3xl font-bold leading-tight text-black sm:text-4xl">
              ログイン
            </h1>

            <p className="mt-4 text-sm leading-7 text-neutral-600">
              メールアドレスとパスワードでログインする。
            </p>

            {user ? (
              <div className="mt-8 rounded-[28px] border border-sky-200 bg-sky-50 p-6">
                <p className="text-xs tracking-[0.18em] text-sky-700">
                  SIGNED IN
                </p>

                <h2 className="mt-2 text-xl font-semibold text-black">
                  ログイン中
                </h2>

                <p className="mt-3 text-sm leading-7 text-neutral-700">
                  {user.email ?? "メールアドレス不明"}
                </p>

                <div className="mt-6 flex flex-wrap gap-3">
                  <Link
                    href={nextPath}
                    className="inline-flex rounded-full bg-black px-4 py-2 text-sm font-semibold text-white transition hover:bg-neutral-800"
                  >
                    元のページへ戻る
                  </Link>

                  <Link
                    href="/"
                    className="inline-flex rounded-full border border-black/10 bg-white px-4 py-2 text-sm text-neutral-800 transition hover:bg-neutral-50"
                  >
                    ホームへ
                  </Link>

                  <button
                    type="button"
                    onClick={handleSignOut}
                    disabled={isPending}
                    className="inline-flex rounded-full border border-black/10 bg-neutral-50 px-4 py-2 text-sm text-neutral-700 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {pendingAction === "signout" ? "ログアウト中..." : "ログアウト"}
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSignIn} className="mt-8">
                <div className="rounded-[28px] border border-black/10 bg-white p-6">
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
                    <input
                      type="password"
                      autoComplete="current-password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      className="mt-2 h-12 w-full rounded-2xl border border-black/10 bg-white px-4 text-sm text-black outline-none placeholder:text-neutral-400 focus:border-sky-200"
                      placeholder="パスワード"
                      required
                    />
                  </label>

                  <div className="mt-6 flex flex-wrap gap-3">
                    <button
                      type="submit"
                      disabled={isPending}
                      className="inline-flex rounded-full bg-black px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {pendingAction === "signin" ? "ログイン中..." : "ログイン"}
                    </button>

                    <Link
                      href={registerHref}
                      className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-5 py-2.5 text-sm font-medium text-black transition hover:bg-sky-100"
                    >
                      アカウント作成
                    </Link>

                    <Link
                      href={nextPath}
                      className="inline-flex rounded-full border border-black/10 bg-white px-5 py-2.5 text-sm text-neutral-700 transition hover:bg-neutral-50"
                    >
                      戻る
                    </Link>
                  </div>

                  <div className="mt-5 rounded-2xl border border-black/10 bg-neutral-50 p-4 text-xs leading-6 text-neutral-600">
                    <p>
                      以前メールリンクで登録した場合は、最初にパスワードを設定する。
                    </p>
                    <button
                      type="button"
                      onClick={() => void handleResetPassword()}
                      disabled={isPending}
                      className="mt-2 font-medium text-sky-700 underline underline-offset-4 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {pendingAction === "reset-password"
                        ? "送信中..."
                        : "パスワードを設定・再設定する"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleEmailLinkSignIn()}
                      disabled={isPending}
                      className="ml-4 mt-2 font-medium text-neutral-600 underline underline-offset-4 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {pendingAction === "email-link"
                        ? "送信中..."
                        : "従来のメールリンクでログイン"}
                    </button>
                  </div>
                </div>
              </form>
            )}

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
