"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { normalizeNextPath } from "@/lib/auth/accountSignupConsent";

type PendingAction = "google" | "apple" | null;

export default function SignupPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const nextPath = useMemo(
    () => normalizeNextPath(searchParams.get("next"), "/mypage"),
    [searchParams]
  );

  const [email, setEmail] = useState("");
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleOAuthSignup(provider: "google" | "apple") {
    setPendingAction(provider);
    setErrorMessage("");

    const redirectTo =
      typeof window !== "undefined"
        ? `${window.location.origin}/auth/callback?mode=signup&provider=${provider}&next=${encodeURIComponent(nextPath)}`
        : undefined;

    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo,
      },
    });

    if (error) {
      setErrorMessage(error.message);
      setPendingAction(null);
    }
  }

  function handleEmailStart() {
    const normalizedEmail = email.trim();
    const query = new URLSearchParams();

    query.set("method", "email");

    if (normalizedEmail) {
      query.set("email", normalizedEmail);
    }

    query.set("next", nextPath);

    router.push(`/register?${query.toString()}`);
  }

  const isPending = pendingAction !== null;

  return (
    <main className="min-h-screen bg-white px-6 py-8 text-black">
      <div className="mx-auto w-full max-w-3xl">
        <section className="overflow-hidden rounded-[32px] border border-black/10 bg-white shadow-sm">
          <div className="px-6 py-8 sm:px-8 sm:py-10">
            <p className="text-xs tracking-[0.24em] text-neutral-500">
              SIGN UP ENTRY
            </p>

            <h1 className="mt-3 text-3xl font-bold leading-tight text-black sm:text-4xl">
              新規作成
            </h1>

            <p className="mt-4 text-sm leading-7 text-neutral-600">
              Google / Apple / メールアドレスのどれから始めても、最後はユーザー登録画面で必要な情報をまとめて入力する。
            </p>

            <div className="mt-8 grid gap-4">
              <button
                type="button"
                onClick={() => void handleOAuthSignup("google")}
                disabled={isPending}
                className="inline-flex items-center justify-center rounded-[24px] border border-black/10 bg-white px-5 py-4 text-sm text-neutral-800 transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {pendingAction === "google"
                  ? "Googleへ移動中..."
                  : "Google で新規作成を始める"}
              </button>

              <button
                type="button"
                onClick={() => void handleOAuthSignup("apple")}
                disabled={isPending}
                className="inline-flex items-center justify-center rounded-[24px] border border-black/10 bg-white px-5 py-4 text-sm text-neutral-800 transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {pendingAction === "apple"
                  ? "Appleへ移動中..."
                  : "Apple で新規作成を始める"}
              </button>

              <div className="rounded-[24px] border border-black/10 bg-neutral-50 p-5">
                <p className="text-sm font-semibold text-black">
                  メールアドレスで始める
                </p>
                <p className="mt-2 text-sm leading-7 text-neutral-600">
                  ここでは入口としてメールアドレスだけ入れる。パスワードやプロフィール情報、規約同意は次のユーザー登録画面でまとめて入力する。
                </p>

                <label className="mt-4 block">
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
                  />
                </label>

                <div className="mt-5 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={handleEmailStart}
                    className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-5 py-2.5 text-sm font-medium text-black transition hover:bg-sky-100"
                  >
                    メールアドレスで進む
                  </button>

                  <Link
                    href="/login"
                    className="inline-flex rounded-full border border-black/10 bg-white px-5 py-2.5 text-sm text-neutral-700 transition hover:bg-neutral-50"
                  >
                    ログインへ戻る
                  </Link>
                </div>
              </div>
            </div>

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