"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createOwnedSeries } from "@/app/actions/createOwnedSeries";
import { LANGUAGE_REGISTRY, type SupportedLanguageTag } from "@/lib/translation/languageRegistry";
import type { SeriesContentWarning } from "@/lib/contentRating";
import {
  hideGlobalLoadingFeedback,
  showGlobalLoadingFeedback,
} from "@/lib/client/loadingFeedback";

type SeriesPublicationStatus = "private" | "public";
type RecordingPermissionMode = "open" | "closed";
type ActivePanel = "publication" | "genres" | "tags" | "recording" | null;
type SaveState = "idle" | "saving" | "success" | "error";

type WriteSeriesCreateFormProps = {
  currentUserId: string;
};

function parseList(raw: string): string[] {
  return raw
    .split(/[\n,、]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function getPublicationLabel(status: SeriesPublicationStatus): string {
  return status === "public" ? "公開" : "非公開";
}

function getRecordingPermissionLabel(mode: RecordingPermissionMode): string {
  if (mode === "open") return "朗読許可";
  return "朗読不可";
}

function buildWorkspaceFields(args: {
  publicationStatus: SeriesPublicationStatus;
  genres: string[];
  tags: string[];
  recordingPermissionMode: RecordingPermissionMode;
}) {
  return {
    publication_status: args.publicationStatus,
    reviews_enabled: true,
    episode_comments_enabled: true,
    genres: args.genres,
    tags: args.tags,
    recording_permission_mode: args.recordingPermissionMode,
  };
}

export default function WriteSeriesCreateForm(_props: WriteSeriesCreateFormProps) {
  const router = useRouter();
  const submittingRef = useRef(false);

  const [title, setTitle] = useState("");
  const [sourceLanguage, setSourceLanguage] = useState<SupportedLanguageTag | "">("");
  const [contentWarnings, setContentWarnings] = useState<SeriesContentWarning[]>([]);
  const [summary, setSummary] = useState("");
  const [publicationStatus, setPublicationStatus] =
    useState<SeriesPublicationStatus>("private");
  const [genreEditorValue, setGenreEditorValue] = useState("");
  const [tagEditorValue, setTagEditorValue] = useState("");
  const [recordingPermissionMode, setRecordingPermissionMode] =
    useState<RecordingPermissionMode>("closed");
  const [activePanel, setActivePanel] = useState<ActivePanel>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const genres = parseList(genreEditorValue);
  const tags = parseList(tagEditorValue);

  const statusItems: Array<{
    id: Exclude<ActivePanel, null>;
    label: string;
    value: string;
  }> = [
    {
      id: "publication",
      label: "公開状態",
      value: getPublicationLabel(publicationStatus),
    },
    {
      id: "genres",
      label: "ジャンル",
      value: genres.length > 0 ? genres.join(" / ") : "未設定",
    },
    {
      id: "tags",
      label: "タグ",
      value: tags.length > 0 ? tags.join(" / ") : "未設定",
    },
    {
      id: "recording",
      label: "朗読許可",
      value: getRecordingPermissionLabel(recordingPermissionMode),
    },
  ];

  function resetNotice() {
    setSaveState("idle");
    setErrorMessage("");
    setSuccessMessage("");
  }

  async function handleCreate(destination: "episode" | "workspace") {
    if (submittingRef.current) return;
    const trimmedTitle = title.trim();

    if (!trimmedTitle || !sourceLanguage) {
      setSaveState("error");
      setErrorMessage(!trimmedTitle ? "タイトルは必須。" : "原文言語を選択してください。");
      setSuccessMessage("");
      return;
    }

    submittingRef.current = true;
    setSaveState("saving");
    setErrorMessage("");
    setSuccessMessage("");

    showGlobalLoadingFeedback("作成中...", 8000);

    const workspaceFields = buildWorkspaceFields({
      publicationStatus,
      genres,
      tags,
      recordingPermissionMode,
    });

    try {
      const result = await createOwnedSeries({
        title: trimmedTitle,
        description: summary.trim(),
        ...workspaceFields,
        translation_permission_mode: "open",
        human_translation_permission_mode: "open",
        effect_settings: null,
        source_language: sourceLanguage,
        content_warnings: contentWarnings,
      });

      if (result.ok || result.persisted) {
        try {
          window.sessionStorage.removeItem("duonovel:pending-source-language-create");
          window.sessionStorage.removeItem("duonovel:pending-content-rating-create");
        } catch {
          // Legacy session-only state is optional.
        }
        setSaveState(result.ok ? "success" : "error");
        setSuccessMessage(result.ok ? "作品を作成した。" : "");
        if (result.persisted) {
          setErrorMessage("作品は作成されたが、公開一覧のキャッシュ更新に失敗した。再作成せず、作品ワークスペースで状態を確認してください。");
        }
        router.push(
          destination === "episode" && result.ok
            ? `/write/series/${result.seriesId}/episodes/new`
            : `/write/series/${result.seriesId}`
        );
        router.refresh();
        return;
      }
      setSaveState("error");
      setErrorMessage(
        result.code === "authentication_required"
          ? "ログイン状態を確認してから、もう一度作成してください。"
          : "作品作成に失敗した。入力内容を確認してください。"
      );
    } catch {
      setSaveState("error");
      setErrorMessage("作成結果を確認できなかった。重複作成を避けるため、作品一覧を確認してください。");
    } finally {
      submittingRef.current = false;
      hideGlobalLoadingFeedback();
    }
  }

  const isSaving = saveState === "saving";

  return (
    <main className="min-h-screen bg-white text-black">
      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-4 text-sm text-neutral-500">
          <span className="text-neutral-700">新規作成スペース</span>
        </div>

        <section className="overflow-hidden rounded-[32px] border border-black/10 bg-white shadow-sm">
          <div className="border-b border-black/10 px-5 py-6 sm:px-8">
            <p className="text-xs tracking-[0.22em] text-neutral-500">
              LIB READ CREATE SPACE
            </p>

            <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
              <h1 className="text-3xl font-bold text-black">
                新規作成スペース
              </h1>

              <Link
                href="/write"
                className="rounded-full border border-black/10 bg-white px-5 py-3 text-sm text-neutral-800 transition hover:bg-neutral-50"
              >
                投稿データベースへ
              </Link>
            </div>
          </div>

          <div className="grid gap-6 px-5 py-6 sm:px-8">
            <section className="rounded-[28px] border border-black/10 bg-neutral-50 p-5">
              <p className="text-xs tracking-[0.18em] text-neutral-500">
                SERIES CORE
              </p>
              <h2 className="mt-2 text-xl font-semibold text-black">
                作品情報
              </h2>

              <div className="mt-5 grid gap-4">
                <label className="grid gap-2">
                  <span className="text-sm text-neutral-700">
                    作品タイトル
                  </span>
                  <input
                    value={title}
                    onChange={(event) => {
                      setTitle(event.target.value);
                      resetNotice();
                    }}
                    placeholder="作品タイトル"
                    className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black outline-none placeholder:text-neutral-500"
                  />
                </label>

                <label className="grid gap-2">
                  <span className="text-sm text-neutral-700">原文言語（必須）</span>
                  <select
                    value={sourceLanguage}
                    onChange={(event) => {
                      setSourceLanguage(event.target.value as SupportedLanguageTag);
                      resetNotice();
                    }}
                    className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black"
                  >
                    <option value="" disabled>原文言語を選択</option>
                    {(Object.keys(LANGUAGE_REGISTRY) as SupportedLanguageTag[]).map((tag) => (
                      <option key={tag} value={tag}>{LANGUAGE_REGISTRY[tag].nativeLabel}</option>
                    ))}
                  </select>
                </label>

                <fieldset className="grid gap-2">
                  <legend className="text-sm text-neutral-700">コンテンツ警告（作成時に保存）</legend>
                  {([
                    ["sexual_r18", "性的表現を含む（R18）"],
                    ["violence", "暴力描写あり"],
                  ] as const).map(([value, label]) => (
                    <label key={value} className="flex items-center gap-2 text-sm text-neutral-700">
                      <input
                        type="checkbox"
                        checked={contentWarnings.includes(value)}
                        onChange={(event) => {
                          setContentWarnings((current) => event.target.checked
                            ? [...current, value]
                            : current.filter((item) => item !== value));
                          resetNotice();
                        }}
                      />
                      {label}
                    </label>
                  ))}
                </fieldset>

                <label className="grid gap-2">
                  <span className="text-sm text-neutral-700">あらすじ</span>
                  <textarea
                    value={summary}
                    onChange={(event) => {
                      setSummary(event.target.value);
                      resetNotice();
                    }}
                    rows={8}
                    placeholder="作品の概要を書く"
                    className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm leading-7 text-black outline-none placeholder:text-neutral-500"
                  />
                </label>
              </div>
            </section>

            <section className="rounded-[28px] border border-black/10 bg-sky-50/60 p-5">
              <p className="text-xs tracking-[0.18em] text-neutral-500">
                SERIES STATUS
              </p>
              <h2 className="mt-2 text-xl font-semibold text-black">
                作品状態
              </h2>

              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {statusItems.map((item) => {
                  const active = activePanel === item.id;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() =>
                        setActivePanel((current) =>
                          current === item.id ? null : item.id
                        )
                      }
                      className={[
                        "rounded-2xl border px-3 py-3 text-left transition",
                        active
                          ? "border-sky-200 bg-sky-50"
                          : "border-black/10 bg-white hover:bg-neutral-50",
                      ].join(" ")}
                      aria-expanded={active}
                    >
                      <span className="block text-[11px] tracking-[0.16em] text-neutral-500">
                        {item.label}
                      </span>
                      <span className="mt-1 block text-sm font-semibold text-black">
                        {item.value}
                      </span>
                      <span className="mt-2 block text-xs text-neutral-500">
                        {active ? "閉じる" : "変更"}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div
                className={[
                  "mt-4 grid gap-4",
                  activePanel ? "" : "hidden",
                ].join(" ")}
              >
                <div
                  className={
                    activePanel === "publication"
                      ? "rounded-2xl border border-black/10 bg-white p-4"
                      : "hidden"
                  }
                >
                  <p className="text-sm font-semibold text-black">公開状態</p>

                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {(["private", "public"] as SeriesPublicationStatus[]).map(
                      (status) => {
                        const active = publicationStatus === status;

                        return (
                          <label
                            key={status}
                            className={[
                              "cursor-pointer rounded-2xl border px-3 py-3 text-sm transition",
                              active
                                ? "border-sky-200 bg-sky-50 text-black"
                                : "border-black/10 bg-white text-neutral-700 hover:bg-neutral-50",
                            ].join(" ")}
                          >
                            <input
                              type="radio"
                              name="series-publication-status-create"
                              value={status}
                              checked={active}
                              onChange={() => {
                                setPublicationStatus(status);
                                resetNotice();
                              }}
                              className="sr-only"
                            />
                            {getPublicationLabel(status)}
                          </label>
                        );
                      }
                    )}
                  </div>
                </div>

                <div
                  className={
                    activePanel === "genres"
                      ? "rounded-2xl border border-black/10 bg-white p-4"
                      : "hidden"
                  }
                >
                  <p className="text-sm font-semibold text-black">ジャンル</p>
                  <textarea
                    value={genreEditorValue}
                    onChange={(event) => {
                      setGenreEditorValue(event.target.value);
                      resetNotice();
                    }}
                    rows={3}
                    placeholder={"1行1ジャンル\n例: ファンタジー\n恋愛"}
                    className="mt-3 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm leading-7 text-black outline-none placeholder:text-neutral-400"
                  />
                </div>

                <div
                  className={
                    activePanel === "tags"
                      ? "rounded-2xl border border-black/10 bg-white p-4"
                      : "hidden"
                  }
                >
                  <p className="text-sm font-semibold text-black">タグ</p>
                  <textarea
                    value={tagEditorValue}
                    onChange={(event) => {
                      setTagEditorValue(event.target.value);
                      resetNotice();
                    }}
                    rows={3}
                    placeholder={"1行1タグ\n例: 異世界\nダークファンタジー"}
                    className="mt-3 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm leading-7 text-black outline-none placeholder:text-neutral-400"
                  />
                </div>

                <div
                  className={
                    activePanel === "recording"
                      ? "rounded-2xl border border-black/10 bg-white p-4"
                      : "hidden"
                  }
                >
                  <p className="text-sm font-semibold text-black">朗読許可</p>

                  <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    {(["open", "closed"] as RecordingPermissionMode[]).map(
                      (modeValue) => {
                        const active = recordingPermissionMode === modeValue;

                        return (
                          <label
                            key={modeValue}
                            className={[
                              "cursor-pointer rounded-2xl border px-3 py-3 text-sm transition",
                              active
                                ? "border-sky-200 bg-sky-50 text-black"
                                : "border-black/10 bg-white text-neutral-700 hover:bg-neutral-50",
                            ].join(" ")}
                          >
                            <input
                              type="radio"
                              name="recording-permission-create"
                              value={modeValue}
                              checked={active}
                              onChange={() => {
                                setRecordingPermissionMode(modeValue);
                                resetNotice();
                              }}
                              className="sr-only"
                            />
                            {getRecordingPermissionLabel(modeValue)}
                          </label>
                        );
                      }
                    )}
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-[28px] border border-black/10 bg-white p-5">
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => handleCreate("episode")}
                  disabled={isSaving}
                  className="rounded-full bg-black px-5 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSaving ? "作成中..." : "作品を作成して1話目へ"}
                </button>

                <button
                  type="button"
                  onClick={() => handleCreate("workspace")}
                  disabled={isSaving}
                  className="rounded-full border border-sky-200 bg-sky-50 px-5 py-3 text-sm font-semibold text-black transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSaving ? "作成中..." : "作品を作成してワークスペースへ"}
                </button>

                <Link
                  href="/write"
                  className="rounded-full border border-black/10 bg-white px-5 py-3 text-sm text-neutral-800 transition hover:bg-neutral-50"
                >
                  キャンセル
                </Link>
              </div>

              {errorMessage ? (
                <div className="mt-4 rounded-2xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {errorMessage}
                </div>
              ) : null}

              {successMessage ? (
                <div className="mt-4 rounded-2xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  {successMessage}
                </div>
              ) : null}
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}
