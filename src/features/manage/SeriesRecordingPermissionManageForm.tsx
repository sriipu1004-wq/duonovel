"use client";

import Link from "next/link";
import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type RecordingPermissionMode = "open" | "closed" | "approval_required";
type SaveState = "idle" | "saving" | "success" | "error";

type SeriesRecordingPermissionManageFormProps = {
  seriesId: string;
  seriesTitle: string;
  initialMode: RecordingPermissionMode;
};

function StatusBadge({ state }: { state: SaveState }) {
  if (state === "saving") {
    return (
      <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs text-sky-700">
        保存中...
      </span>
    );
  }

  if (state === "success") {
    return (
      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs text-emerald-700">
        保存済み
      </span>
    );
  }

  if (state === "error") {
    return (
      <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs text-red-700">
        保存失敗
      </span>
    );
  }

  return (
    <span className="rounded-full border border-black/10 bg-white px-3 py-1 text-xs text-neutral-500">
      未保存
    </span>
  );
}

function getModeLabel(mode: RecordingPermissionMode): string {
  if (mode === "open") return "無条件許可";
  if (mode === "approval_required") return "承認制";
  return "非許可";
}

function getModeDescription(mode: RecordingPermissionMode): string {
  if (mode === "open") {
    return "朗読者は申請なしで朗読制作へ進める状態。";
  }
  if (mode === "approval_required") {
    return "朗読者は申請後、承認されるまで朗読制作へ進めない状態。";
  }
  return "朗読募集なし。朗読制作ページでは非表示にする前提の状態。";
}

function OptionCard({
  value,
  checked,
  title,
  description,
  onChange,
}: {
  value: RecordingPermissionMode;
  checked: boolean;
  title: string;
  description: string;
  onChange: (value: RecordingPermissionMode) => void;
}) {
  return (
    <label
      className={[
        "block cursor-pointer rounded-[24px] border p-4 transition",
        checked
          ? "border-sky-200 bg-sky-50"
          : "border-black/10 bg-white hover:bg-neutral-50",
      ].join(" ")}
    >
      <div className="flex items-start gap-3">
        <input
          type="radio"
          name="recording_permission_mode"
          value={value}
          checked={checked}
          onChange={() => onChange(value)}
          className="mt-1"
        />
        <div>
          <p className="text-base font-semibold text-black">{title}</p>
          <p className="mt-2 text-sm leading-7 text-neutral-600">
            {description}
          </p>
        </div>
      </div>
    </label>
  );
}

export default function SeriesRecordingPermissionManageForm({
  seriesId,
  seriesTitle,
  initialMode,
}: SeriesRecordingPermissionManageFormProps) {
  const [selectedMode, setSelectedMode] =
    useState<RecordingPermissionMode>(initialMode);
  const [savedMode, setSavedMode] = useState<RecordingPermissionMode>(initialMode);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  function handleChange(nextMode: RecordingPermissionMode) {
    setSelectedMode(nextMode);
    setSaveState("idle");
    setErrorMessage("");
    setSuccessMessage("");
  }

  function handleReset() {
    setSelectedMode(savedMode);
    setSaveState("idle");
    setErrorMessage("");
    setSuccessMessage("");
  }

  async function handleSave() {
    setSaveState("saving");
    setErrorMessage("");
    setSuccessMessage("");

    const { error } = await supabase
      .from("series")
      .update({
        recording_permission_mode: selectedMode,
      })
      .eq("id", seriesId);

    if (error) {
      setSaveState("error");
      setErrorMessage(error.message);
      return;
    }

    setSavedMode(selectedMode);
    setSaveState("success");
    setSuccessMessage(
      `朗読可否を「${getModeLabel(selectedMode)}」として保存した。`
    );
  }

  return (
    <main className="min-h-screen bg-white text-black">
      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-4 text-sm text-neutral-500">
          <span className="text-neutral-700">朗読許可管理</span>
        </div>

        <section className="rounded-[32px] border border-black/10 bg-white shadow-sm">
          <div className="border-b border-black/10 px-5 py-6 sm:px-8">
            <p className="text-xs tracking-[0.22em] text-neutral-500">
              LIB READ MANAGE
            </p>

            <h1 className="mt-3 text-3xl font-bold text-black">{seriesTitle}</h1>

            <p className="mt-3 text-sm leading-7 text-neutral-600">
              作品ごとの第三者朗読可否を管理する。
              <br />
              今回の正史は <code>series.recording_permission_mode</code>。
              <br />
              申請テーブルや申請フォーム本体はまだ作らず、まずは 3状態の管理だけを先に固める。
            </p>

            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href="/manage"
                className="rounded-full border border-black/10 bg-white px-5 py-3 text-sm text-neutral-800 transition hover:bg-neutral-50"
              >
                管理トップへ
              </Link>

              <Link
                href={`/manage/series/${seriesId}`}
                className="rounded-full border border-black/10 bg-white px-5 py-3 text-sm text-neutral-800 transition hover:bg-neutral-50"
              >
                管理ハブへ戻る
              </Link>

              <Link
                href={`/works/${seriesId}`}
                className="rounded-full border border-black/10 bg-white px-5 py-3 text-sm text-neutral-800 transition hover:bg-neutral-50"
              >
                作品ページを見る
              </Link>
            </div>
          </div>

          <div className="grid gap-6 px-5 py-6 sm:px-8">
            <section className="rounded-[28px] border border-black/10 bg-neutral-50 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs tracking-[0.18em] text-neutral-500">
                    RECORDING PERMISSION
                  </p>
                  <h2 className="mt-2 text-xl font-semibold text-black">
                    朗読可否の設定
                  </h2>
                </div>

                <StatusBadge state={saveState} />
              </div>

              <div className="mt-5 grid gap-4">
                <OptionCard
                  value="open"
                  checked={selectedMode === "open"}
                  title="無条件許可"
                  description="朗読者は申請なしで朗読制作へ進める。将来の朗読制作ページでは、そのまま開始可能。"
                  onChange={handleChange}
                />

                <OptionCard
                  value="closed"
                  checked={selectedMode === "closed"}
                  title="非許可"
                  description="朗読募集なし。将来の朗読制作ページでは非表示にする前提。"
                  onChange={handleChange}
                />

                <OptionCard
                  value="approval_required"
                  checked={selectedMode === "approval_required"}
                  title="承認制"
                  description="朗読者は申請が必要。将来の朗読制作ページでは申請導線を出す前提。"
                  onChange={handleChange}
                />
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={handleSave}
                  className="rounded-full bg-black px-5 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800"
                >
                  朗読可否を保存
                </button>

                <button
                  type="button"
                  onClick={handleReset}
                  className="rounded-full border border-black/10 bg-white px-5 py-3 text-sm text-neutral-800 transition hover:bg-neutral-50"
                >
                  直前保存状態へ戻す
                </button>
              </div>

              {errorMessage ? (
                <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {errorMessage}
                </div>
              ) : null}

              {successMessage ? (
                <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  {successMessage}
                </div>
              ) : null}
            </section>

            <section className="rounded-[28px] border border-black/10 bg-neutral-50 p-5">
              <p className="text-xs tracking-[0.18em] text-neutral-500">
                PREVIEW
              </p>
              <h2 className="mt-2 text-xl font-semibold text-black">
                現在の選択内容
              </h2>

              <div className="mt-4 rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm leading-7 text-neutral-600">
                選択中:
                <span className="ml-2 font-semibold text-black">
                  {getModeLabel(selectedMode)}
                </span>
                <br />
                {getModeDescription(selectedMode)}
              </div>
            </section>

            <section className="rounded-[28px] border border-black/10 bg-neutral-50 p-5">
              <p className="text-xs tracking-[0.18em] text-neutral-500">
                CURRENT SCOPE
              </p>
              <h2 className="mt-2 text-xl font-semibold text-black">
                今回まだやらないこと
              </h2>

              <div className="mt-4 rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm leading-7 text-neutral-600">
                申請テーブル作成、申請フォーム、承認一覧、承認済み判定はまだ未実装。
                <br />
                今回は <code>series.recording_permission_mode</code> の管理だけを先に通す。
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}