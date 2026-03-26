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
      <span className="rounded-full border border-sky-400/20 bg-sky-400/10 px-3 py-1 text-xs text-sky-200">
        保存中...
      </span>
    );
  }

  if (state === "success") {
    return (
      <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-200">
        保存済み
      </span>
    );
  }

  if (state === "error") {
    return (
      <span className="rounded-full border border-red-400/20 bg-red-400/10 px-3 py-1 text-xs text-red-200">
        保存失敗
      </span>
    );
  }

  return (
    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-neutral-500">
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
          ? "border-white/30 bg-white/[0.06]"
          : "border-white/10 bg-white/[0.03] hover:bg-white/[0.05]",
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
          <p className="text-base font-semibold text-white">{title}</p>
          <p className="mt-2 text-sm leading-7 text-neutral-400">
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
    <main className="min-h-screen bg-[#0a0a0a] text-neutral-100">
      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-4 text-sm text-neutral-500">
          <span className="text-neutral-300">朗読許可管理</span>
        </div>

        <section className="rounded-[32px] border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] shadow-2xl">
          <div className="border-b border-white/10 px-5 py-6 sm:px-8">
            <p className="text-xs tracking-[0.22em] text-neutral-500">
              DUONOVEL MANAGE
            </p>

            <h1 className="mt-3 text-3xl font-bold text-white">{seriesTitle}</h1>

            <p className="mt-3 text-sm leading-7 text-neutral-400">
              作品ごとの第三者朗読可否を管理する。
              <br />
              今回の正史は <code>series.recording_permission_mode</code>。
              <br />
              申請テーブルや申請フォーム本体はまだ作らず、まずは 3状態の管理だけを先に固める。
            </p>

            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href="/manage"
                className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
              >
                管理トップへ
              </Link>

              <Link
                href={`/manage/series/${seriesId}`}
                className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
              >
                管理ハブへ戻る
              </Link>

              <Link
                href={`/works/${seriesId}`}
                className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
              >
                作品ページを見る
              </Link>
            </div>
          </div>

          <div className="grid gap-6 px-5 py-6 sm:px-8">
            <section className="rounded-[28px] border border-white/10 bg-black/20 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs tracking-[0.18em] text-neutral-500">
                    RECORDING PERMISSION
                  </p>
                  <h2 className="mt-2 text-xl font-semibold text-white">
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
                  className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-black transition hover:opacity-90"
                >
                  朗読可否を保存
                </button>

                <button
                  type="button"
                  onClick={handleReset}
                  className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-neutral-200 transition hover:bg-white/10"
                >
                  直前保存状態へ戻す
                </button>
              </div>

              {errorMessage ? (
                <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">
                  {errorMessage}
                </div>
              ) : null}

              {successMessage ? (
                <div className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">
                  {successMessage}
                </div>
              ) : null}
            </section>

            <section className="rounded-[28px] border border-white/10 bg-black/20 p-5">
              <p className="text-xs tracking-[0.18em] text-neutral-500">
                PREVIEW
              </p>
              <h2 className="mt-2 text-xl font-semibold text-white">
                現在の選択内容
              </h2>

              <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm leading-7 text-neutral-400">
                選択中:
                <span className="ml-2 font-semibold text-white">
                  {getModeLabel(selectedMode)}
                </span>
                <br />
                {getModeDescription(selectedMode)}
              </div>
            </section>

            <section className="rounded-[28px] border border-white/10 bg-black/20 p-5">
              <p className="text-xs tracking-[0.18em] text-neutral-500">
                CURRENT SCOPE
              </p>
              <h2 className="mt-2 text-xl font-semibold text-white">
                今回まだやらないこと
              </h2>

              <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm leading-7 text-neutral-400">
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