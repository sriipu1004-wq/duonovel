"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { normalizeNextPath } from "@/lib/auth/accountSignupConsent";
import { supabase } from "@/lib/supabaseClient";

const PASSWORD_MIN_LENGTH = 8;

function passwordUpdateErrorMessage(message: string): string {
  if (message.toLowerCase().includes("new password should be different")) {
    return "現在とは異なるパスワードを入力して。すでに設定済みなら、そのパスワードでログインできる。";
  }

  return message;
}

export default function ResetPasswordPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = useMemo(
    () => normalizeNextPath(searchParams.get("next"), "/mypage"),
    [searchParams]
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
      setErrorMessage(`パスワードは${PASSWORD_MIN_LENGTH}文字以上で入力して。`);
      return;
    }

    if (password !== passwordConfirmation) {
      setErrorMessage("確認用パスワードが一致していない。");
      return;
    }

    setPending(true);

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setErrorMessage(passwordUpdateErrorMessage(error.message));
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
              パスワード設定
            </h1>
            <p className="mt-4 text-sm leading-7 text-neutral-600">
              新しいパスワードを設定する。設定後はメールを待たずにログインできる。
            </p>

            {!loadedUser ? (
              <div className="mt-8 rounded-[28px] border border-black/10 bg-neutral-50 p-6 text-sm text-neutral-600">
                認証状態を確認中...
              </div>
            ) : user ? (
              <form onSubmit={handleSubmit} className="mt-8">
                <div className="rounded-[28px] border border-black/10 bg-white p-6">
                  <p className="text-sm text-neutral-600">
                    {user.email ?? "メールアドレス不明"}
                  </p>

                  <label className="mt-4 block">
                    <span className="text-sm text-neutral-700">新しいパスワード</span>
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      className="mt-2 h-12 w-full rounded-2xl border border-black/10 bg-white px-4 text-sm text-black outline-none placeholder:text-neutral-400 focus:border-sky-200"
                      placeholder={`${PASSWORD_MIN_LENGTH}文字以上`}
                      minLength={PASSWORD_MIN_LENGTH}
                      required
                    />
                  </label>

                  <label className="mt-4 block">
                    <span className="text-sm text-neutral-700">
                      新しいパスワード（確認）
                    </span>
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={passwordConfirmation}
                      onChange={(event) =>
                        setPasswordConfirmation(event.target.value)
                      }
                      className="mt-2 h-12 w-full rounded-2xl border border-black/10 bg-white px-4 text-sm text-black outline-none placeholder:text-neutral-400 focus:border-sky-200"
                      placeholder="もう一度入力"
                      minLength={PASSWORD_MIN_LENGTH}
                      required
                    />
                  </label>

                  <button
                    type="submit"
                    disabled={pending}
                    className="mt-6 inline-flex rounded-full bg-black px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {pending ? "設定中..." : "パスワードを設定して進む"}
                  </button>
                </div>
              </form>
            ) : (
              <div className="mt-8 rounded-[28px] border border-amber-200 bg-amber-50 p-6 text-sm leading-7 text-neutral-700">
                <p>再設定リンクが無効か、期限が切れている。</p>
                <Link
                  href={`/login?next=${encodeURIComponent(nextPath)}`}
                  className="mt-3 inline-flex font-medium text-sky-700 underline underline-offset-4"
                >
                  ログイン画面から再設定メールを送る
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
