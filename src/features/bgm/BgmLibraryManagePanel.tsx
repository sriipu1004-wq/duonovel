"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { mapBgmLibraryRow, type BgmLibraryTrack } from "@/lib/bgm/bgmLibrary";
import { supabase } from "@/lib/supabaseClient";

type SaveState = "idle" | "saving" | "success" | "error";
type UploadState = "idle" | "uploading" | "success" | "error";

type BgmLibraryManagePanelProps = {
  tracks: BgmLibraryTrack[];
};

type LibraryFormState = {
  title: string;
  slug: string;
  description: string;
  audioPath: string;
  isActive: boolean;
  sortOrder: string;
};

const STORAGE_BUCKET_NAME = process.env.NEXT_PUBLIC_BGM_STORAGE_BUCKET ?? "";
const STORAGE_FOLDER_NAME =
  process.env.NEXT_PUBLIC_BGM_STORAGE_FOLDER ?? "bgm-library";

function slugify(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return normalized;
}

function buildDefaultSortOrder(tracks: BgmLibraryTrack[]): string {
  const maxSortOrder = tracks.reduce((max, track) => {
    return Math.max(max, track.sortOrder);
  }, 0);

  return String(maxSortOrder + 10);
}

function buildEmptyForm(tracks: BgmLibraryTrack[]): LibraryFormState {
  return {
    title: "",
    slug: "",
    description: "",
    audioPath: "",
    isActive: false,
    sortOrder: buildDefaultSortOrder(tracks),
  };
}

function buildFormFromTrack(track: BgmLibraryTrack): LibraryFormState {
  return {
    title: track.title,
    slug: track.slug,
    description: track.description,
    audioPath: track.audioPath,
    isActive: track.isActive,
    sortOrder: String(track.sortOrder),
  };
}

function buildPayload(form: LibraryFormState) {
  const normalizedSortOrder = Number(form.sortOrder);
  const generatedSlug = slugify(form.slug || form.title);

  return {
    slug: generatedSlug || crypto.randomUUID(),
    title: form.title.trim() || "無題BGM",
    description: form.description.trim() || "説明なし",
    mood: "未分類",
    use_case: "未分類",
    duration_label: "不明",
    loopable: true,
    audio_path: form.audioPath.trim() || "",
    source_label: "運営投入素材",
    rights_label: "LIB read内利用想定",
    tags: [],
    is_active: form.isActive,
    sort_order: Number.isFinite(normalizedSortOrder) ? normalizedSortOrder : 0,
  };
}

function saveTrackToList(
  tracks: BgmLibraryTrack[],
  nextTrack: BgmLibraryTrack
): BgmLibraryTrack[] {
  const withoutCurrent = tracks.filter((track) => track.id !== nextTrack.id);

  return [...withoutCurrent, nextTrack].sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) {
      return a.sortOrder - b.sortOrder;
    }

    return a.title.localeCompare(b.title, "ja");
  });
}

function StatusBadge({ state }: { state: SaveState | UploadState }) {
  if (state === "saving" || state === "uploading") {
    return (
      <span className="rounded-full border border-sky-400/20 bg-sky-400/10 px-3 py-1 text-xs text-sky-200">
        処理中...
      </span>
    );
  }

  if (state === "success") {
    return (
      <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-200">
        完了
      </span>
    );
  }

  if (state === "error") {
    return (
      <span className="rounded-full border border-red-400/20 bg-red-400/10 px-3 py-1 text-xs text-red-200">
        失敗
      </span>
    );
  }

  return (
    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-neutral-500">
      待機中
    </span>
  );
}

export default function BgmLibraryManagePanel({
  tracks,
}: BgmLibraryManagePanelProps) {
  const router = useRouter();
  const [managedTracks, setManagedTracks] = useState(tracks);
  const [selectedTrackId, setSelectedTrackId] = useState("");
  const [form, setForm] = useState<LibraryFormState>(() => buildEmptyForm(tracks));
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [uploadMessage, setUploadMessage] = useState("");

  const currentTrack = useMemo(() => {
    return managedTracks.find((track) => track.id === selectedTrackId) ?? null;
  }, [managedTracks, selectedTrackId]);

  function resetSaveUi() {
    setSaveState("idle");
    setErrorMessage("");
  }

  function patchForm(patch: Partial<LibraryFormState>) {
    setForm((prev) => ({ ...prev, ...patch }));
    resetSaveUi();
  }

  function loadTrack(track: BgmLibraryTrack) {
    setSelectedTrackId(track.id);
    setForm(buildFormFromTrack(track));
    setSaveState("idle");
    setUploadState("idle");
    setErrorMessage("");
    setUploadMessage("");
  }

  function handleCreateNew() {
    setSelectedTrackId("");
    setForm(buildEmptyForm(managedTracks));
    setSaveState("idle");
    setUploadState("idle");
    setErrorMessage("");
    setUploadMessage("");
  }

  async function handleUploadFile(file: File | null) {
    if (!file) {
      return;
    }

    if (!STORAGE_BUCKET_NAME) {
      setUploadState("error");
      setUploadMessage(
        "NEXT_PUBLIC_BGM_STORAGE_BUCKET が未設定なので、アップロードは使えない。音声パスを手入力してください。"
      );
      return;
    }

    setUploadState("uploading");
    setUploadMessage("");

    const extension = file.name.includes(".")
      ? file.name.split(".").pop()?.toLowerCase() || "mp3"
      : "mp3";
    const basename = slugify(form.slug || form.title || file.name.replace(/\.[^.]+$/, ""));
    const safeBasename = basename || "bgm";
    const folder = STORAGE_FOLDER_NAME.replace(/^\/+|\/+$/g, "");
    const storagePath = `${folder}/${Date.now()}-${safeBasename}.${extension}`;

    const { error } = await supabase.storage
      .from(STORAGE_BUCKET_NAME)
      .upload(storagePath, file, {
        cacheControl: "3600",
        upsert: false,
      });

    if (error) {
      setUploadState("error");
      setUploadMessage(error.message);
      return;
    }

    const { data } = supabase.storage
      .from(STORAGE_BUCKET_NAME)
      .getPublicUrl(storagePath);

    patchForm({
      audioPath: data.publicUrl || storagePath,
    });

    setUploadState("success");
    setUploadMessage(`保存先: ${storagePath}`);
  }

  async function handleSaveTrack() {
    if (!form.title.trim()) {
      setSaveState("error");
      setErrorMessage("タイトルは必須。");
      return;
    }

    if (!form.audioPath.trim()) {
      setSaveState("error");
      setErrorMessage("音声パスまたは保存先は必須。");
      return;
    }

    setSaveState("saving");
    setErrorMessage("");

    const payload = buildPayload(form);

    if (selectedTrackId) {
      const { data, error } = await supabase
        .from("bgm_library")
        .update(payload)
        .eq("id", selectedTrackId)
        .select("*")
        .single();

      if (error || !data) {
        setSaveState("error");
        setErrorMessage(error?.message ?? "BGM素材の更新に失敗した。");
        return;
      }

      const nextTrack = mapBgmLibraryRow(data as Record<string, unknown> & { id: string });
      setManagedTracks((prev) => saveTrackToList(prev, nextTrack));
      setForm(buildFormFromTrack(nextTrack));
      setSaveState("success");
      router.refresh();
      return;
    }

    const { data, error } = await supabase
      .from("bgm_library")
      .insert({
        id: crypto.randomUUID(),
        ...payload,
      })
      .select("*")
      .single();

    if (error || !data) {
      setSaveState("error");
      setErrorMessage(error?.message ?? "BGM素材の追加に失敗した。");
      return;
    }

    const nextTrack = mapBgmLibraryRow(data as Record<string, unknown> & { id: string });
    setManagedTracks((prev) => saveTrackToList(prev, nextTrack));
    setSelectedTrackId(nextTrack.id);
    setForm(buildFormFromTrack(nextTrack));
    setSaveState("success");
    router.refresh();
  }

  async function handleQuickVisibility(trackId: string, isActive: boolean) {
    const { data, error } = await supabase
      .from("bgm_library")
      .update({ is_active: isActive })
      .eq("id", trackId)
      .select("*")
      .single();

    if (error || !data) {
      setSaveState("error");
      setErrorMessage(error?.message ?? "公開状態の更新に失敗した。");
      return;
    }

    const nextTrack = mapBgmLibraryRow(data as Record<string, unknown> & { id: string });
    setManagedTracks((prev) => saveTrackToList(prev, nextTrack));

    if (selectedTrackId === trackId) {
      setForm(buildFormFromTrack(nextTrack));
    }

    setSaveState("success");
    router.refresh();
  }

  return (
    <section
      id="operator-bgm-library"
      className="rounded-[28px] border border-amber-400/20 bg-amber-400/[0.06] p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <p className="text-xs tracking-[0.18em] text-amber-200/80">OPERATOR ONLY</p>
          <h2 className="mt-2 text-xl font-semibold text-white">
            BGM素材の自分専用投入 / 管理
          </h2>
          <p className="mt-2 text-sm leading-7 text-neutral-300">
            ここは運営側だけが使う素材管理MVP。一般ユーザー向けの追加導線は置かず、
            追加・最低限メタ情報保存・公開/非公開・並び順だけを先に通す。
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <StatusBadge state={saveState} />
          <StatusBadge state={uploadState} />
        </div>
      </div>

      <div className="mt-5 grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="grid gap-4">
          <div className="rounded-[24px] border border-white/10 bg-black/20 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-semibold text-white">編集対象</p>

              <button
                type="button"
                onClick={handleCreateNew}
                className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
              >
                新規追加モード
              </button>
            </div>

            <label className="mt-4 grid gap-2">
              <span className="text-sm text-neutral-300">既存素材を読み込む</span>
              <select
                value={selectedTrackId}
                onChange={(event) => {
                  const nextTrack =
                    managedTracks.find((track) => track.id === event.target.value) ?? null;

                  if (nextTrack) {
                    loadTrack(nextTrack);
                    return;
                  }

                  handleCreateNew();
                }}
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none"
              >
                <option value="" className="bg-[#111] text-white">
                  新規素材を追加
                </option>
                {managedTracks.map((track) => (
                  <option key={track.id} value={track.id} className="bg-[#111] text-white">
                    [{track.isActive ? "公開" : "非公開"}] {track.sortOrder} / {track.title}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="rounded-[24px] border border-white/10 bg-black/20 p-4">
            <p className="text-sm font-semibold text-white">素材追加 / 編集フォーム</p>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="grid gap-2">
                <span className="text-sm text-neutral-300">タイトル *</span>
                <input
                  value={form.title}
                  onChange={(event) => patchForm({ title: event.target.value })}
                  placeholder="例: 深夜都市ループ"
                  className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-neutral-500"
                />
              </label>

              <label className="grid gap-2">
                <span className="text-sm text-neutral-300">slug</span>
                <input
                  value={form.slug}
                  onChange={(event) => patchForm({ slug: event.target.value })}
                  placeholder="空ならタイトルから自動生成"
                  className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-neutral-500"
                />
              </label>
            </div>

            <label className="mt-4 grid gap-2">
              <span className="text-sm text-neutral-300">説明</span>
              <textarea
                value={form.description}
                onChange={(event) => patchForm({ description: event.target.value })}
                rows={4}
                placeholder="例: 静かな緊張感を保つ夜景向けBGM"
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm leading-7 text-white outline-none placeholder:text-neutral-500"
              />
            </label>

            <div className="mt-4 grid gap-4 md:grid-cols-[1fr_auto]">
              <label className="grid gap-2">
                <span className="text-sm text-neutral-300">音声パス / 保存先 *</span>
                <input
                  value={form.audioPath}
                  onChange={(event) => patchForm({ audioPath: event.target.value })}
                  placeholder="Supabase Storage の public URL か保存先パス"
                  className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-neutral-500"
                />
              </label>

              <label className="grid gap-2">
                <span className="text-sm text-neutral-300">音声ファイル投入</span>
                <input
                  type="file"
                  accept="audio/*"
                  onChange={(event) => {
                    void handleUploadFile(event.target.files?.[0] ?? null);
                    event.currentTarget.value = "";
                  }}
                  className="block rounded-2xl border border-white/10 bg-white/5 px-4 py-[0.8rem] text-sm text-neutral-300 file:mr-3 file:rounded-full file:border-0 file:bg-white file:px-4 file:py-2 file:text-sm file:font-semibold file:text-black"
                />
              </label>
            </div>

            <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm leading-7 text-neutral-400">
              ファイル投入は
              <code className="mx-1 text-neutral-200">NEXT_PUBLIC_BGM_STORAGE_BUCKET</code>
              が設定されている時だけ使う。未設定なら音声パスを手入力する。
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="grid gap-2">
                <span className="text-sm text-neutral-300">並び順</span>
                <input
                  type="number"
                  value={form.sortOrder}
                  onChange={(event) => patchForm({ sortOrder: event.target.value })}
                  className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none"
                />
              </label>

              <label className="grid gap-2">
                <span className="text-sm text-neutral-300">公開状態</span>
                <select
                  value={form.isActive ? "public" : "private"}
                  onChange={(event) =>
                    patchForm({ isActive: event.target.value === "public" })
                  }
                  className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none"
                >
                  <option value="private" className="bg-[#111] text-white">
                    非公開
                  </option>
                  <option value="public" className="bg-[#111] text-white">
                    公開
                  </option>
                </select>
              </label>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void handleSaveTrack()}
                className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-black transition hover:opacity-90"
              >
                {selectedTrackId ? "この素材を更新" : "新しい素材を追加"}
              </button>

              <button
                type="button"
                onClick={handleCreateNew}
                className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-neutral-200 transition hover:bg-white/10"
              >
                フォームを初期化
              </button>
            </div>

            {errorMessage ? (
              <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">
                {errorMessage}
              </div>
            ) : null}

{uploadMessage ? (
  <div
    className={`mt-4 rounded-2xl px-4 py-3 text-sm ${
      uploadState === "error"
        ? "border border-red-400/20 bg-red-400/10 text-red-200"
        : "border border-white/10 bg-white/[0.03] text-neutral-300"
    }`}
  >
    {uploadMessage}
  </div>
) : null}
          </div>
        </div>

        <div className="grid gap-4">
          <div className="rounded-[24px] border border-white/10 bg-black/20 p-4">
            <p className="text-sm font-semibold text-white">登録済み素材一覧</p>
            <p className="mt-2 text-sm leading-7 text-neutral-400">
              公開ライブラリには公開素材だけが出る。非公開素材はここにだけ出る。
            </p>

            <div className="mt-4 grid gap-3">
              {managedTracks.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.03] px-4 py-4 text-sm text-neutral-400">
                  まだ素材はない。
                </div>
              ) : (
                managedTracks.map((track) => (
                  <article
                    key={track.id}
                    className={`rounded-2xl border p-4 ${
                      currentTrack?.id === track.id
                        ? "border-amber-400/30 bg-amber-400/[0.08]"
                        : "border-white/10 bg-white/[0.03]"
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-neutral-300">
                            sort {track.sortOrder}
                          </span>
                          <span
                            className={`rounded-full border px-3 py-1 text-xs ${
                              track.isActive
                                ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200"
                                : "border-amber-400/20 bg-amber-400/10 text-amber-200"
                            }`}
                          >
                            {track.isActive ? "公開" : "非公開"}
                          </span>
                        </div>

                        <h3 className="mt-2 text-base font-semibold text-white">
                          {track.title}
                        </h3>
                        <p className="mt-2 text-sm leading-7 text-neutral-400">
                          {track.description || "説明なし"}
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => loadTrack(track)}
                          className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
                        >
                          編集
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            void handleQuickVisibility(track.id, !track.isActive)
                          }
                          className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-neutral-200 transition hover:bg-white/10"
                        >
                          {track.isActive ? "非公開にする" : "公開にする"}
                        </button>
                      </div>
                    </div>

                    <p className="mt-3 break-all text-sm leading-7 text-neutral-300">
                      {track.audioPath}
                    </p>
                  </article>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}