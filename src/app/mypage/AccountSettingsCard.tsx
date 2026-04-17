"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function AccountSettingsCard() {
  const router = useRouter();
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  async function handleDelete() {
    if (!confirmed) {
      setErrorMessage("削除前の確認チェックを入れて。");
      return;
    }

    setPending(true);
    setMessage("");
    setErrorMessage("");

    const response = await fetch("/api/account/delete", {
      method: "POST",
    });

    const json = (await response.json().catch(() => null)) as
      | { ok?: boolean; error?: string }
      | null;

    if (!response.ok) {
      setErrorMessage(json?.error ?? "アカウント削除に失敗した。");
      setPending(false);
      return;
    }

    await supabase.auth.signOut();

    setMessage("アカウントを削除した。トップへ戻る。");
    setPending(false);
    router.push("/");
    router.refresh();
  }

  return (
    <section className="rounded-[28px] border border-black/10 bg-white p-5 shadow-sm">
      <p className="text-xs tracking-[0.18em] text-neutral-500">SETTINGS</p>
      <h2 className="mt-2 text-xl font-semibold text-black">設定</h2>
      <p className="mt-3 text-sm leading-7 text-neutral-600">
        表示名は上のプロフィール欄から変更できる。
        ここではアカウント削除を扱う。
      </p>

      <div className="mt-5 rounded-[24px] border border-red-200 bg-red-50 p-4">
        <p className="text-sm font-semibold text-red-700">アカウント削除</p>
        <p className="mt-2 text-sm leading-7 text-red-700">
          このMVPでは、まずログインできない状態にする削除を行う。
          公開済みデータの扱いを完全にどうするかは別途拡張する。
        </p>

        <label className="mt-4 flex items-start gap-3 text-sm leading-7 text-red-700">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
            className="mt-1 h-4 w-4 rounded border-red-300"
          />
          <span>
            削除すると元に戻せないことと、今後このアカウントでログインできなくなることを確認した
          </span>
        </label>

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void handleDelete()}
            disabled={pending}
            className="inline-flex rounded-full bg-red-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "削除中..." : "アカウントを削除"}
          </button>
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