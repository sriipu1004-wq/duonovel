"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type HeroBadge = {
  label: string;
};

type HeroAction = {
  href: string;
  label: string;
  tone?: "primary" | "secondary";
};

type HeroStat = {
  label: string;
  value: string | number;
  sub: string;
};

type SaveState = "idle" | "saving" | "success" | "error";

type MyPageHeroEditableProps = {
  userId: string;
  fallbackEmail: string;
  initialDisplayName: string;
  eyebrow: string;
  description: string;
  badges?: HeroBadge[];
  actions?: HeroAction[];
  stats?: HeroStat[];
  notice?: string;
};

function PencilIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
    </svg>
  );
}

export default function MyPageHeroEditable({
  userId,
  fallbackEmail,
  initialDisplayName,
  eyebrow,
  description,
  badges = [],
  actions = [],
  stats = [],
  notice,
}: MyPageHeroEditableProps) {
  const router = useRouter();

  const normalizedInitialDisplayName = initialDisplayName.trim();

  const [displayName, setDisplayName] = useState(normalizedInitialDisplayName);
  const [draftName, setDraftName] = useState(normalizedInitialDisplayName);
  const [isEditing, setIsEditing] = useState(
    normalizedInitialDisplayName.length === 0
  );
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const visibleTitle =
    displayName.trim().length > 0
      ? displayName.trim()
      : fallbackEmail || "作者名未設定";

  function resetNotice() {
    setSaveState("idle");
    setErrorMessage("");
    setSuccessMessage("");
  }

  function handleEditStart() {
    setDraftName(displayName.trim());
    setIsEditing(true);
    resetNotice();
  }

  function handleCancel() {
    setDraftName(displayName.trim());
    setIsEditing(false);
    resetNotice();
  }

  async function handleSave() {
    const trimmedName = draftName.trim();

    if (!trimmedName) {
      setSaveState("error");
      setErrorMessage("表示名は1文字以上で入れる。");
      setSuccessMessage("");
      return;
    }

    setSaveState("saving");
    setErrorMessage("");
    setSuccessMessage("");

    const nowIso = new Date().toISOString();

    const payloads: Array<Record<string, unknown>> = [
      { display_name: trimmedName, updated_at: nowIso },
      { display_name: trimmedName },
    ];

    let updated = false;
    let lastError = "表示名の保存に失敗した。";

    for (const payload of payloads) {
      const result = await supabase
        .from("users")
        .update(payload)
        .eq("id", userId)
        .select("id, display_name")
        .maybeSingle();

      if (result.error) {
        lastError = result.error.message;
        continue;
      }

      if (result.data?.id) {
        updated = true;
        break;
      }
    }

    if (!updated) {
      setSaveState("error");
      setErrorMessage(lastError);
      setSuccessMessage("");
      return;
    }

    setDisplayName(trimmedName);
    setDraftName(trimmedName);
    setIsEditing(false);
    setSaveState("success");
    setSuccessMessage("表示名を保存した。");
    router.refresh();
  }

  return (
    <section className="overflow-hidden rounded-[32px] border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] shadow-2xl">
      <div className="border-b border-white/10 px-5 py-6 sm:px-8">
        <p className="text-xs tracking-[0.22em] text-neutral-500">{eyebrow}</p>

        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {isEditing ? (
              <div className="relative min-h-[52px] sm:min-h-[60px]">
                <p className="pointer-events-none select-none truncate text-3xl font-bold text-neutral-600 sm:text-4xl">
                  {fallbackEmail || "表示名を入力"}
                </p>

                <input
                  value={draftName}
                  onChange={(event) => {
                    setDraftName(event.target.value);
                    resetNotice();
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void handleSave();
                    }

                    if (event.key === "Escape") {
                      event.preventDefault();
                      handleCancel();
                    }
                  }}
                  autoFocus
                  className="absolute inset-0 h-full w-full border-none bg-transparent p-0 text-3xl font-bold text-white outline-none placeholder:text-neutral-600 sm:text-4xl"
                />
              </div>
            ) : (
              <h1 className="truncate text-3xl font-bold text-white sm:text-4xl">
                {visibleTitle}
              </h1>
            )}
          </div>

          <div className="flex shrink-0 flex-wrap gap-2">
            {isEditing ? (
              <>
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={saveState === "saving"}
                  className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saveState === "saving" ? "保存中..." : "保存"}
                </button>

                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={saveState === "saving"}
                  className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-neutral-200 transition hover:bg-white hover:text-black disabled:cursor-not-allowed disabled:opacity-60"
                >
                  キャンセル
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={handleEditStart}
                aria-label="表示名を編集"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-neutral-200 transition hover:bg-white hover:text-black"
              >
                <PencilIcon />
              </button>
            )}
          </div>
        </div>

        <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-neutral-300 sm:text-base">
          {description}
        </p>

        {badges.length > 0 ? (
          <div className="mt-5 flex flex-wrap items-center gap-3">
            {badges.map((badge) => (
              <span
                key={badge.label}
                className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs text-neutral-300"
              >
                {badge.label}
              </span>
            ))}
          </div>
        ) : null}

        {actions.length > 0 ? (
          <div className="mt-5 flex flex-wrap gap-3">
            {actions.map((action) => (
              <Link
                key={`${action.href}-${action.label}`}
                href={action.href}
                className={
                  action.tone === "primary"
                    ? "rounded-full bg-white px-5 py-3 text-sm font-semibold text-black transition hover:opacity-90"
                    : "rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
                }
              >
                {action.label}
              </Link>
            ))}
          </div>
        ) : null}

        {notice ? (
          <div className="mt-5 rounded-[24px] border border-sky-400/20 bg-sky-400/10 p-4 text-sm leading-7 text-sky-200">
            {notice}
          </div>
        ) : null}

        {errorMessage ? (
          <div className="mt-5 rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">
            {errorMessage}
          </div>
        ) : null}

        {successMessage ? (
          <div className="mt-5 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">
            {successMessage}
          </div>
        ) : null}
      </div>

      {stats.length > 0 ? (
        <div className="grid gap-4 px-5 py-6 sm:px-8 md:grid-cols-3">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="rounded-[28px] border border-white/10 bg-black/20 p-5"
            >
              <p className="text-xs tracking-[0.18em] text-neutral-500">
                {stat.label}
              </p>
              <p className="mt-2 text-3xl font-semibold text-white">
                {stat.value}
              </p>
              <p className="mt-2 text-sm text-neutral-400">{stat.sub}</p>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}