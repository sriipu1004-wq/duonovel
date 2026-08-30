"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  workId: string;
  workTitle: string;
  redirectAfterDelete?: string;
};

export default function PrivateLibraryDeleteButton({
  workId,
  workTitle,
  redirectAfterDelete,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function deleteWork() {
    if (
      busy ||
      !window.confirm(
        `「${workTitle}」を本棚から削除します。原文、読書進捗、生成済み対訳、作品用語も削除され、元に戻せません。削除しますか？`
      )
    ) {
      return;
    }

    setBusy(true);
    setMessage("");

    try {
      const response = await fetch(
        `/api/library/works/${encodeURIComponent(workId)}`,
        { method: "DELETE" }
      );

      if (!response.ok) {
        setMessage("作品を削除できませんでした。");
        return;
      }

      if (redirectAfterDelete) {
        router.push(redirectAfterDelete);
      }
      router.refresh();
    } catch {
      setMessage("通信が中断されました。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={() => void deleteWork()}
        className="rounded-full border border-red-200 bg-white px-4 py-2 text-sm text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? "削除中…" : "本棚から削除"}
      </button>
      {message ? <span className="text-xs text-red-700">{message}</span> : null}
    </div>
  );
}
