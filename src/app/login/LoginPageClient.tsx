"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";

function normalizeNextPath(value: string | null): string {
  if (!value || !value.startsWith("/")) {
    return "/";
  }

  return value;
}

export default function LoginPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const nextPath = useMemo(
    () => normalizeNextPath(searchParams.get("next")),
    [searchParams]
  );

  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pendingAction, setPendingAction] = useState<
    "signin" | "signup" | "signout" | null
  >(null);
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

  async function handleSignIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setPendingAction("signin");
    setMessage("");
    setErrorMessage("");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setErrorMessage(error.message);
      setPendingAction(null);
      return;
    }

    setMessage("ログインした。続き確認ページへ戻る。");
    setPendingAction(null);
    router.push(nextPath);
    router.refresh();
  }

  async function handleSignUp() {
    setPendingAction("signup");
    setMessage("");
    setErrorMessage("");

    const emailRedirectTo =
      typeof window !== "undefined"
        ? `${window.location.origin}/login?next=${encodeURIComponent(nextPath)}`
        : undefined;

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo,
      },
    });

    if (error) {
      setErrorMessage(error.message);
      setPendingAction(null);
      return;
    }

    if (data.session?.user) {
      setMessage("アカウントを作成してログインした。");
      setPendingAction(null);
      router.push(nextPath);
      router.refresh();
      return;
    }

    setMessage(
      "アカウントを作成した。Confirm email が ON の環境では、確認メール承認後にログインが必要。開発ですぐ試したいなら Supabase Auth 側で Confirm email を OFF にするか、Dashboard で確認済みユーザーを用意する。"
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
    <main className="min-h-screen bg-[#050510] px-6 py-8 text-[#f5f5f5]">
      <div className="mx-auto w-full max-w-3xl">
        <section className="overflow-hidden rounded-[32px] border border-white/[0.1] bg-white/[0.04] shadow-2xl">
          <div className="px-6 py-8 sm:px-8 sm:py-10">
            <p className="text-xs tracking-[0.24em] text-neutral-500">AUTH</p>

            <h1 className="mt-3 text-3xl font-bold leading-tight text-white sm:text-4xl">
              最小ログイン導線
            </h1>

            <p className="mt-4 text-sm leading-7 text-neutral-300">
              今回は本格会員機能ではなく、サイト内で authenticated セッションを作って
              `play_logs` の実動作を確認するための最小版。
            </p>

            <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm leading-7 text-neutral-300">
              <p>確認したいこと</p>
              <p className="mt-2">
                1. ログイン後に作品ページの「続きから読む」が DB 優先で見えるか
              </p>
              <p>
                2. `/read` で再生位置を保存したあと、再読込で復元できるか
              </p>
            </div>

            {user ? (
              <div className="mt-8 rounded-[28px] border border-emerald-400/20 bg-emerald-400/10 p-6">
                <p className="text-xs tracking-[0.18em] text-emerald-200">
                  SIGNED IN
                </p>

                <h2 className="mt-2 text-xl font-semibold text-white">
                  ログイン中
                </h2>

                <p className="mt-3 text-sm leading-7 text-neutral-200">
                  {user.email ?? "メールアドレス不明"}
                </p>

                <div className="mt-6 flex flex-wrap gap-3">
                  <Link
                    href={nextPath}
                    className="inline-flex rounded-full bg-white px-4 py-2 text-sm font-semibold text-black transition hover:opacity-90"
                  >
                    元のページへ戻る
                  </Link>

                  <Link
                    href="/"
                    className="inline-flex rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-neutral-200 transition hover:bg-white/10"
                  >
                    ホームへ
                  </Link>

                  <button
                    type="button"
                    onClick={handleSignOut}
                    disabled={isPending}
                    className="inline-flex rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-neutral-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {pendingAction === "signout" ? "ログアウト中..." : "ログアウト"}
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSignIn} className="mt-8">
                <div className="rounded-[28px] border border-white/10 bg-black/20 p-6">
                  <label className="block">
                    <span className="text-sm text-neutral-300">メールアドレス</span>
                    <input
                      type="email"
                      autoComplete="email"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      inputMode="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-black/30 px-4 text-sm text-white outline-none placeholder:text-neutral-500 focus:border-white/30"
                      placeholder="you@example.com"
                      required
                    />
                  </label>

                  <label className="mt-4 block">
                    <span className="text-sm text-neutral-300">パスワード</span>

                    <div className="mt-2 flex items-center gap-2">
                      <input
                        type={showPassword ? "text" : "password"}
                        autoComplete="current-password"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        inputMode="text"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        className="h-12 flex-1 rounded-2xl border border-white/10 bg-black/30 px-4 text-sm text-white outline-none placeholder:text-neutral-500 focus:border-white/30"
                        placeholder="英数字で入力"
                        required
                      />

                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        className="inline-flex h-12 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-4 text-sm text-neutral-200 transition hover:bg-white/10"
                        aria-label={showPassword ? "パスワードを隠す" : "パスワードを表示する"}
                        aria-pressed={showPassword}
                      >
                        {showPassword ? "隠す" : "表示"}
                      </button>
                    </div>

                    <p className="mt-2 text-xs text-neutral-500">
                      かな入力に見えても、実際に入っている文字をこの場で確認できるようにしてある。
                    </p>
                  </label>

                  <div className="mt-6 flex flex-wrap gap-3">
                    <button
                      type="submit"
                      disabled={isPending}
                      className="inline-flex rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {pendingAction === "signin" ? "ログイン中..." : "ログイン"}
                    </button>

                    <button
                      type="button"
                      onClick={handleSignUp}
                      disabled={isPending}
                      className="inline-flex rounded-full border border-white/10 bg-white/5 px-5 py-2.5 text-sm text-neutral-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {pendingAction === "signup" ? "作成中..." : "新規作成"}
                    </button>

                    <Link
                      href={nextPath}
                      className="inline-flex rounded-full border border-white/10 bg-black/20 px-5 py-2.5 text-sm text-neutral-300 transition hover:bg-white/10"
                    >
                      戻る
                    </Link>
                  </div>

                  <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-xs leading-6 text-neutral-400">
                    <p>
                      新規作成でそのままログインできない場合は、Supabase Auth 側で
                      Confirm email が ON になっている可能性がある。
                    </p>
                    <p className="mt-2">
                      開発確認を急ぐなら、確認済みユーザーでログインするか、
                      開発環境だけ Confirm email を OFF にするのが最短。
                    </p>
                  </div>
                </div>
              </form>
            )}

            {message ? (
              <div className="mt-5 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">
                {message}
              </div>
            ) : null}

            {errorMessage ? (
              <div className="mt-5 rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">
                {errorMessage}
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}