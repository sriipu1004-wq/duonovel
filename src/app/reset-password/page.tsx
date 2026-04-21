"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function ResetPasswordPage() {
  const [loaded, setLoaded] = useState(false);
  const [hasRecoverySession, setHasRecoverySession] = useState(false);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let active = true;

    async function loadSession() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!active) {
        return;
      }

      setHasRecoverySession(!!session);
      setLoaded(true);
    }

    void loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) {
        return;
      }

      if (event === "PASSWORD_RECOVERY") {
        setMessage("再設定用の認証を確認した。新しいパスワードを入力して。");
        setErrorMessage("");
      }

      setHasRecoverySession(!!session);
      setLoaded(true);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setMessage("");
    setErrorMessage("");

    const trimmedPassword = password.trim();
    const trimmedConfirmPassword = confirmPassword.trim();

    if (!trimmedPassword || !trimmedConfirmPassword) {
      setErrorMessage("新しいパスワードを両方入力して。");
      return;
    }

    if (trimmedPassword.length < 8) {
      setErrorMessage("パスワードは8文字以上で入力して。");
      return;
    }

    if (trimmedPassword !== trimmedConfirmPassword) {
      setErrorMessage("新しいパスワードが一致していない。");
      return;
    }

    setPending(true);

    const { error } = await supabase.auth.updateUser({
      password: trimmedPassword,
    });

    if (error) {
      setErrorMessage(error.message);
      setPending(false);
      return;
    }

    await supabase.auth.signOut();

    setPending(false);
    setPassword("");
    setConfirmPassword("");
    setHasRecoverySession(false);
    setMessage(
      "パスワードを再設定した。次はログイン画面から新しいパスワードで入り直して。"
    );
  }

  return (
    <main className="min-h-screen bg-white px-6 py-8 text-black">
      <div className="mx-auto w-full max-w-3xl">
        <section className="overflow-hidden rounded-[32px] border border-black/10 bg-white shadow-sm">
          <div className="px-6 py-8 sm:px-8 sm:py-10">
            <p className="text-xs tracking-[0.24em] text-neutral-500">
              PASSWORD RESET
            </p>

            <h1 className="mt-3 text-3xl font-bold leading-tight text-black sm:text-4xl">
              パスワード再設定
            </h1>

            <p className="mt-4 text-sm leading-7 text-neutral-600">
              再設定メールから来た場合は、この画面で新しいパスワードを保存する。
            </p>

            {!loaded ? (
              <div className="mt-6 rounded-[24px] border border-black/10 bg-neutral-50 p-4 text-sm leading-7 text-neutral-600">
                認証状態を確認中...
              </div>
            ) : hasRecoverySession ? (
              <form onSubmit={handleSubmit} className="mt-6">
                <div className="rounded-[24px] border border-black/10 bg-neutral-50 p-4">
                  <label className="grid gap-2">
                    <span className="text-sm text-neutral-700">
                      新しいパスワード
                    </span>
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black outline-none placeholder:text-neutral-400 focus:border-sky-200"
                      placeholder="8文字以上"
                    />
                  </label>

                  <label className="mt-4 grid gap-2">
                    <span className="text-sm text-neutral-700">
                      新しいパスワード確認
                    </span>
                    <input
                      type={showPassword ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black outline-none placeholder:text-neutral-400 focus:border-sky-200"
                      placeholder="もう一度入力"
                    />
                  </label>

                  <div className="mt-5 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm text-neutral-700 transition hover:bg-neutral-50"
                    >
                      {showPassword ? "隠す" : "表示"}
                    </button>

                    <button
                      type="submit"
                      disabled={pending}
                      className="rounded-full border border-sky-200 bg-sky-50 px-5 py-2.5 text-sm font-medium text-black transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {pending ? "保存中..." : "新しいパスワードを保存"}
                    </button>
                  </div>
                </div>
              </form>
            ) : (
              <div className="mt-6 rounded-[24px] border border-black/10 bg-neutral-50 p-4 text-sm leading-7 text-neutral-600">
                <p>この画面だけを直接開いても再設定はできない。</p>
                <p className="mt-2">
                  先に設定画面などから再設定メールを送り、そのメール内リンクから入り直して。
                </p>
              </div>
            )}

            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/login"
                className="rounded-full border border-black/10 bg-white px-5 py-2.5 text-sm text-neutral-700 transition hover:bg-neutral-50"
              >
                ログインへ
              </Link>

              <Link
                href="/mypage"
                className="rounded-full border border-black/10 bg-white px-5 py-2.5 text-sm text-neutral-700 transition hover:bg-neutral-50"
              >
                マイページへ
              </Link>
            </div>

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