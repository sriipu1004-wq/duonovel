"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type PendingAction = "change-email" | "delete" | null;

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export default function AccountSettingsCard() {
  const router = useRouter();

  const [currentEmail, setCurrentEmail] = useState("");
  const [loadedUser, setLoadedUser] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const isPending = pendingAction !== null;

  useEffect(() => {
    let active = true;

    async function loadUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!active) return;

      const email = typeof user?.email === "string" ? user.email.trim() : "";
      setCurrentEmail(email);
      setNewEmail(email);
      setLoadedUser(true);
    }

    void loadUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;

      const email =
        typeof session?.user?.email === "string"
          ? session.user.email.trim()
          : "";

      setCurrentEmail(email);
      setLoadedUser(true);
      setNewEmail((prev) => (prev.trim().length > 0 ? prev : email));
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  function resetNotice() {
    setMessage("");
    setErrorMessage("");
  }

  async function handleChangeEmail() {
    resetNotice();

    const trimmedEmail = newEmail.trim();

    if (!trimmedEmail) {
      setErrorMessage("新しいメールアドレスを入力して。");
      return;
    }

    if (!isValidEmail(trimmedEmail)) {
      setErrorMessage("メールアドレスの形式が正しくない。");
      return;
    }

    if (trimmedEmail === currentEmail) {
      setErrorMessage("今のメールアドレスと同じ。");
      return;
    }

    setPendingAction("change-email");

    const { error } = await supabase.auth.updateUser({
      email: trimmedEmail,
    });

    if (error) {
      setErrorMessage(error.message);
      setPendingAction(null);
      return;
    }

    setMessage("メールアドレス変更を開始した。確認メールの案内に従って更新して。");
    setPendingAction(null);
  }

  async function handleDelete() {
    resetNotice();

    if (!confirmed) {
      setErrorMessage("削除前の確認チェックを入れて。");
      return;
    }

    setPendingAction("delete");

    const response = await fetch("/api/account/delete", {
      method: "POST",
    });

    const json = (await response.json().catch(() => null)) as
      | { ok?: boolean; error?: string }
      | null;

    if (!response.ok) {
      setErrorMessage(json?.error ?? "アカウント削除に失敗した。");
      setPendingAction(null);
      return;
    }

    await supabase.auth.signOut();

    setMessage("アカウントを削除した。トップへ戻る。");
    setPendingAction(null);
    router.push("/");
    router.refresh();
  }

  return (
    <section className="rounded-[28px] border border-black/10 bg-white p-5 shadow-sm">
      <p className="text-xs tracking-[0.18em] text-neutral-500">SETTINGS</p>
      <h2 className="mt-2 text-xl font-semibold text-black">設定</h2>
      <p className="mt-3 text-sm leading-7 text-neutral-600">
        表示名は上のプロフィール欄から変更できる。
        ここではメールアドレスとアカウント削除を扱う。
      </p>

      <div className="mt-5 grid gap-5">
        <div className="rounded-[24px] border border-black/10 bg-neutral-50 p-4">
          <p className="text-sm font-semibold text-black">現在のログイン情報</p>

          <div className="mt-3 rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-neutral-700">
            {loadedUser
              ? currentEmail || "メールアドレス未取得"
              : "認証状態を確認中..."}
          </div>
        </div>

        <div className="rounded-[24px] border border-black/10 bg-neutral-50 p-4">
          <p className="text-sm font-semibold text-black">
            メールアドレス変更
          </p>
          <p className="mt-2 text-sm leading-7 text-neutral-600">
            新しいメールアドレスへ変更する。
          </p>

          <div className="mt-4 grid gap-3">
            <label className="grid gap-2">
              <span className="text-sm text-neutral-700">
                新しいメールアドレス
              </span>
              <input
                type="email"
                value={newEmail}
                onChange={(event) => setNewEmail(event.target.value)}
                className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black outline-none placeholder:text-neutral-400 focus:border-sky-200"
                placeholder="you@example.com"
              />
            </label>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void handleChangeEmail()}
                disabled={isPending}
                className="rounded-full border border-sky-200 bg-sky-50 px-5 py-2.5 text-sm font-medium text-black transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {pendingAction === "change-email"
                  ? "変更中..."
                  : "メールアドレスを変更"}
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-[24px] border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-semibold text-red-700">アカウント削除</p>
          <p className="mt-2 text-sm leading-7 text-red-700">
            削除すると、このアカウントではログインできなくなる。
          </p>

          <label className="mt-4 flex items-start gap-3 text-sm leading-7 text-red-700">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
              className="mt-1 h-4 w-4 rounded border-red-300"
            />
            <span>削除すると元に戻せないことを確認した</span>
          </label>

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void handleDelete()}
              disabled={isPending}
              className="inline-flex rounded-full bg-red-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pendingAction === "delete" ? "削除中..." : "アカウントを削除"}
            </button>
          </div>
        </div>
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
    </section>
  );
}
