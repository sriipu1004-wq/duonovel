"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  normalizeDisplayName,
  validateDisplayName,
} from "@/lib/auth/accountSignupConsent";
import { syncPublicUserProfile } from "@/lib/auth/syncPublicUserProfile";

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

  const normalizedInitialDisplayName = normalizeDisplayName(initialDisplayName);

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
    const trimmedName = normalizeDisplayName(draftName);
    const validationError = validateDisplayName(trimmedName);

    if (validationError) {
      setSaveState("error");
      setErrorMessage(validationError);
      setSuccessMessage("");
      return;
    }

    setSaveState("saving");
    setErrorMessage("");
    setSuccessMessage("");

    try {
      await syncPublicUserProfile(userId, trimmedName);
    } catch (error) {
      setSaveState("error");
      setErrorMessage(
        error instanceof Error ? error.message : "表示名の保存に失敗した。"
      );
      setSuccessMessage("");
      return;
    }

    const { error: authUpdateError } = await supabase.auth.updateUser({
      data: {
        display_name: trimmedName,
        display_name_candidate: trimmedName,
      },
    });

    setDisplayName(trimmedName);
    setDraftName(trimmedName);
    setIsEditing(false);

    if (authUpdateError) {
      setSaveState("success");
      setSuccessMessage(
        "表示名を保存した。朗読用の表示反映は次回更新時に再同期される。"
      );
      router.refresh();
      return;
    }

    setSaveState("success");
    setSuccessMessage("表示名を保存した。");
    router.refresh();
  }

  return (
    <section className="overflow-hidden rounded-[32px] border border-black/10 bg-white shadow-sm">
      <div className="border-b border-black/10 px-5 py-6 sm:px-8">
        <p className="text-xs tracking-[0.22em] text-neutral-500">{eyebrow}</p>

        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {isEditing ? (
              <div className="relative min-h-[52px] sm:min-h-[60px]">
                <p className="pointer-events-none select-none truncate text-3xl font-bold text-neutral-300 sm:text-4xl">
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
                  className="absolute inset-0 h-full w-full border-none bg-transparent p-0 text-3xl font-bold text-black outline-none placeholder:text-neutral-300 sm:text-4xl"
                />
              </div>
            ) : (
              <h1 className="truncate text-3xl font-bold text-black sm:text-4xl">
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
                  className="rounded-full bg-black px-4 py-2 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saveState === "saving" ? "保存中..." : "保存"}
                </button>

                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={saveState === "saving"}
                  className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm text-neutral-800 transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  キャンセル
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={handleEditStart}
                aria-label="表示名を編集"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-black/10 bg-white text-neutral-700 transition hover:bg-neutral-50"
              >
                <PencilIcon />
              </button>
            )}
          </div>
        </div>

        <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-neutral-600 sm:text-base">
          {description}
        </p>

        {badges.length > 0 ? (
          <div className="mt-5 flex flex-wrap items-center gap-3">
            {badges.map((badge) => (
              <span
                key={badge.label}
                className="rounded-full border border-black/10 bg-neutral-50 px-4 py-2 text-xs text-neutral-700"
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
                    ? "rounded-full bg-black px-5 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800"
                    : "rounded-full border border-black/10 bg-white px-5 py-3 text-sm text-neutral-800 transition hover:bg-neutral-50"
                }
              >
                {action.label}
              </Link>
            ))}
          </div>
        ) : null}

        {notice ? (
          <div className="mt-5 rounded-[24px] border border-sky-200 bg-sky-50 p-4 text-sm leading-7 text-neutral-800">
            {notice}
          </div>
        ) : null}

        {errorMessage ? (
          <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </div>
        ) : null}

        {successMessage ? (
          <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {successMessage}
          </div>
        ) : null}
      </div>

      {stats.length > 0 ? (
        <div className="grid gap-4 px-5 py-6 sm:px-8 md:grid-cols-3">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="rounded-[28px] border border-black/10 bg-neutral-50 p-5"
            >
              <p className="text-xs tracking-[0.18em] text-neutral-500">
                {stat.label}
              </p>
              <p className="mt-2 text-3xl font-semibold text-black">
                {stat.value}
              </p>
              <p className="mt-2 text-sm text-neutral-600">{stat.sub}</p>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}