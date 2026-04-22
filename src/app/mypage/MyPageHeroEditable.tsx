"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  normalizeDisplayName,
  validateDisplayName,
} from "@/lib/auth/accountSignupConsent";
import { checkDisplayNameAvailability } from "@/lib/auth/checkDisplayNameAvailability";
import { syncPublicUserProfile } from "@/lib/auth/syncPublicUserProfile";

type HeroAction = {
  href: string;
  label: string;
  tone?: "primary" | "secondary";
};

type SaveState = "idle" | "saving" | "success" | "error";

type MyPageHeroEditableProps = {
  userId: string;
  fallbackEmail: string;
  initialDisplayName: string;
  initialBio: string;
  initialXUrl: string;
  initialNoteUrl: string;
  eyebrow: string;
  actions?: HeroAction[];
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

function normalizeBio(value: string): string {
  return value.replace(/\r\n?/g, "\n").trim();
}

function resolveVisibleLinkFieldCount(values: string[]): number {
  const first = values[0]?.trim().length > 0;
  const second = values[1]?.trim().length > 0;

  if (second) {
    return 2;
  }

  return first ? 1 : 1;
}

function trimLinkValues(values: string[]): string[] {
  return [values[0]?.trim() ?? "", values[1]?.trim() ?? ""];
}

export default function MyPageHeroEditable({
  userId,
  fallbackEmail,
  initialDisplayName,
  initialBio,
  initialXUrl,
  initialNoteUrl,
  eyebrow,
  actions = [],
}: MyPageHeroEditableProps) {
  const router = useRouter();

  const normalizedInitialDisplayName = normalizeDisplayName(initialDisplayName);
  const normalizedInitialBio = normalizeBio(initialBio);
  const initialLinkValues = trimLinkValues([initialXUrl, initialNoteUrl]);

  const [displayName, setDisplayName] = useState(normalizedInitialDisplayName);
  const [draftName, setDraftName] = useState(normalizedInitialDisplayName);

  const [bio, setBio] = useState(normalizedInitialBio);
  const [draftBio, setDraftBio] = useState(normalizedInitialBio);

  const [linkValues, setLinkValues] = useState<string[]>(initialLinkValues);
  const [draftLinks, setDraftLinks] = useState<string[]>(initialLinkValues);

  const [visibleLinkFieldCount, setVisibleLinkFieldCount] = useState<number>(
    resolveVisibleLinkFieldCount(initialLinkValues)
  );

  const [isEditing, setIsEditing] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const visibleTitle =
    displayName.trim().length > 0
      ? displayName.trim()
      : fallbackEmail || "作者名未設定";

  const visibleBio =
    bio.trim().length > 0 ? bio.trim() : "自己紹介未記入";

  const visibleSavedLinks = useMemo(
    () => linkValues.map((value) => value.trim()).filter((value) => value.length > 0),
    [linkValues]
  );

  const hasExternalLinks = visibleSavedLinks.length > 0;

  const canAddLinkField =
    isEditing &&
    visibleLinkFieldCount < 2 &&
    draftLinks[visibleLinkFieldCount - 1]?.trim().length > 0;

  function resetNotice() {
    setSaveState("idle");
    setErrorMessage("");
    setSuccessMessage("");
  }

  function handleEditStart() {
    setDraftName(displayName.trim());
    setDraftBio(bio);
    setDraftLinks([...linkValues]);
    setVisibleLinkFieldCount(resolveVisibleLinkFieldCount(linkValues));
    setIsEditing(true);
    resetNotice();
  }

  function handleCancel() {
    setDraftName(displayName.trim());
    setDraftBio(bio);
    setDraftLinks([...linkValues]);
    setVisibleLinkFieldCount(resolveVisibleLinkFieldCount(linkValues));
    setIsEditing(false);
    resetNotice();
  }

  function handleDraftLinkChange(index: number, value: string) {
    setDraftLinks((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
    resetNotice();
  }

  function handleAddLinkField() {
    setVisibleLinkFieldCount((prev) => Math.min(2, prev + 1));
    resetNotice();
  }

  async function ensureDisplayNameAvailable(
    candidateDisplayName: string
  ): Promise<string> {
    return checkDisplayNameAvailability(candidateDisplayName, userId);
  }

  async function handleSave() {
    const trimmedName = normalizeDisplayName(draftName);
    const normalizedBio = normalizeBio(draftBio);
    const normalizedLinks = trimLinkValues(draftLinks);
    const validationError = validateDisplayName(trimmedName);

    if (validationError) {
      setSaveState("error");
      setErrorMessage(validationError);
      setSuccessMessage("");
      return;
    }

    if (normalizedBio.length > 1000) {
      setSaveState("error");
      setErrorMessage("自己紹介は1000文字以内で入力して。");
      setSuccessMessage("");
      return;
    }

    setSaveState("saving");
    setErrorMessage("");
    setSuccessMessage("");

    let availableDisplayName = trimmedName;

    try {
      availableDisplayName = await ensureDisplayNameAvailable(trimmedName);
    } catch (error) {
      setSaveState("error");
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "ユーザー名の重複確認に失敗した。"
      );
      setSuccessMessage("");
      return;
    }

    try {
      const savedProfile = await syncPublicUserProfile(
        availableDisplayName,
        normalizedBio,
        normalizedLinks[0],
        normalizedLinks[1]
      );

      const { error: authUpdateError } = await supabase.auth.updateUser({
        data: {
          display_name: savedProfile.displayName,
          display_name_candidate: savedProfile.displayName,
        },
      });

      const nextSavedLinks = trimLinkValues([
        savedProfile.xUrl,
        savedProfile.noteUrl,
      ]);

      setDisplayName(savedProfile.displayName);
      setDraftName(savedProfile.displayName);

      setBio(savedProfile.bio);
      setDraftBio(savedProfile.bio);

      setLinkValues(nextSavedLinks);
      setDraftLinks(nextSavedLinks);
      setVisibleLinkFieldCount(resolveVisibleLinkFieldCount(nextSavedLinks));

      setIsEditing(false);

      if (authUpdateError) {
        setSaveState("success");
        setSuccessMessage(
          "プロフィールを保存した。ユーザー名の公開反映は次回更新時に再同期される。"
        );
        router.refresh();
        return;
      }

      setSaveState("success");
      setSuccessMessage("プロフィールを保存した。");
      router.refresh();
    } catch (error) {
      setSaveState("error");
      setErrorMessage(
        error instanceof Error ? error.message : "プロフィールの保存に失敗した。"
      );
      setSuccessMessage("");
    }
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
                  {fallbackEmail || "ユーザー名を入力"}
                </p>

                <input
                  value={draftName}
                  onChange={(event) => {
                    setDraftName(event.target.value);
                    resetNotice();
                  }}
                  onKeyDown={(event) => {
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
                aria-label="プロフィールを編集"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-black/10 bg-white text-neutral-700 transition hover:bg-neutral-50"
              >
                <PencilIcon />
              </button>
            )}
          </div>
        </div>

        {isEditing ? (
          <div className="mt-5 grid gap-4">
            <div>
              <label className="text-sm text-neutral-700">ユーザー名</label>
              <div className="mt-2 rounded-2xl border border-black/10 bg-white p-4">
                <input
                  value={draftName}
                  onChange={(event) => {
                    setDraftName(event.target.value);
                    resetNotice();
                  }}
                  className="w-full border-none bg-transparent p-0 text-base text-black outline-none placeholder:text-neutral-300"
                  placeholder="公開プロフィールに出る名前"
                />
              </div>
              <p className="mt-2 text-xs leading-6 text-neutral-500">
                2〜32文字、改行なし、URL風文字列なし。既存ユーザー名との重複は不可。
              </p>
            </div>

            <div>
              <label className="text-sm text-neutral-700">自己紹介</label>
              <div className="mt-2 rounded-2xl border border-black/10 bg-white p-4">
                <textarea
                  value={draftBio}
                  onChange={(event) => {
                    setDraftBio(event.target.value);
                    resetNotice();
                  }}
                  rows={6}
                  className="w-full resize-y border-none bg-transparent p-0 text-sm leading-7 text-black outline-none placeholder:text-neutral-300"
                  placeholder="自己紹介未記入"
                />
              </div>
              <p className="mt-2 text-xs leading-6 text-neutral-500">
                最大1000文字。未入力なら作者ページでは「自己紹介未記入」と表示される。
              </p>
            </div>

            <div className="grid gap-4">
              {Array.from({ length: visibleLinkFieldCount }).map((_, index) => (
                <div key={`profile-link-${index}`}>
                  <label className="text-sm text-neutral-700">
                    リンク {index + 1}
                  </label>
                  <div className="mt-2 rounded-2xl border border-black/10 bg-white p-4">
                    <input
                      value={draftLinks[index] ?? ""}
                      onChange={(event) =>
                        handleDraftLinkChange(index, event.target.value)
                      }
                      className="w-full border-none bg-transparent p-0 text-sm text-black outline-none placeholder:text-neutral-300"
                      placeholder="https://..."
                    />
                  </div>
                </div>
              ))}

              {canAddLinkField ? (
                <div>
                  <button
                    type="button"
                    onClick={handleAddLinkField}
                    className="inline-flex rounded-full border border-black/10 bg-white px-4 py-2 text-sm text-neutral-800 transition hover:bg-neutral-50"
                  >
                    次のリンクを追加
                  </button>
                  <p className="mt-2 text-xs leading-6 text-neutral-500">
                    今の安全版ではリンクは2本まで保存する。
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <>
            <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-neutral-600 sm:text-base">
              {visibleBio}
            </p>

            {hasExternalLinks ? (
              <div className="mt-5 flex flex-wrap gap-3">
                {visibleSavedLinks.map((url, index) => (
                  <a
                    key={`${url}-${index}`}
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-full border border-black/10 bg-white px-5 py-3 text-sm text-neutral-800 transition hover:bg-neutral-50"
                  >
                    リンク {index + 1}
                  </a>
                ))}
              </div>
            ) : null}
          </>
        )}

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
    </section>
  );
}