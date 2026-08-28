"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import PrivateLibraryDeleteButton from "@/features/library/PrivateLibraryDeleteButton";

type Props = {
  workId: string;
  initialTitle: string;
  initialAuthorName: string;
};

export default function PrivateLibraryWorkManager({
  workId,
  initialTitle,
  initialAuthorName,
}: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(initialTitle);
  const [authorName, setAuthorName] = useState(initialAuthorName);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function save() {
    if (!title.trim() || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(
        `/api/library/works/${encodeURIComponent(workId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: title.trim(), authorName: authorName.trim() }),
        }
      );
      if (!response.ok) {
        setMessage("作品情報を更新できませんでした。");
        return;
      }
      setEditing(false);
      router.refresh();
    } catch {
      setMessage("通信が中断されました。");
    } finally {
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => setEditing(true)}
          className="rounded-full border border-black/10 px-3 py-1.5 text-xs text-neutral-600 hover:bg-neutral-50"
        >
          作品情報を編集
        </button>
        <PrivateLibraryDeleteButton
          workId={workId}
          workTitle={initialTitle}
          redirectAfterDelete="/library"
        />
        {message ? <span className="text-xs text-red-700">{message}</span> : null}
      </div>
    );
  }

  return (
    <div className="mt-5 grid gap-3 rounded-2xl border border-black/10 bg-neutral-50 p-4">
      <label className="grid gap-1.5">
        <span className="text-xs text-neutral-600">タイトル</span>
        <input
          value={title}
          maxLength={200}
          onChange={(event) => setTitle(event.target.value)}
          className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
        />
      </label>
      <label className="grid gap-1.5">
        <span className="text-xs text-neutral-600">作者名</span>
        <input
          value={authorName}
          maxLength={200}
          onChange={(event) => setAuthorName(event.target.value)}
          className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
        />
      </label>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => setEditing(false)}
          className="rounded-full border border-black/10 px-4 py-2 text-xs"
        >
          キャンセル
        </button>
        <button
          type="button"
          disabled={busy || !title.trim()}
          onClick={() => void save()}
          className="rounded-full bg-black px-4 py-2 text-xs font-semibold text-white disabled:opacity-40"
        >
          {busy ? "保存中…" : "保存"}
        </button>
      </div>
      {message ? <p className="text-xs text-red-700">{message}</p> : null}
    </div>
  );
}
