"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
  pickText,
  type SeriesRow,
  type EpisodeRow,
  type RecordingPermissionMode,
  getEpisodeNumber,
  isPublishedEpisode,
  sortEpisodes,
} from "@/features/write/writeShared";
import {
  clampBgmSeconds,
  parseBgmSettingsFromRow,
  serializeBgmSettingsForSave,
  type BgmSettings,
} from "@/lib/bgm/bgmSettings";

type Mode = "create" | "edit";

type WriteSeriesFormProps = {
  mode: Mode;
  currentUserId: string;
  series?: SeriesRow | null;
  episodes?: EpisodeRow[];
};

type SaveState = "idle" | "saving" | "success" | "error";

function buildSummaryValue(summary: string) {
  const trimmed = summary.trim();
  return [
    { summary: trimmed, description: trimmed, catch_copy: trimmed },
    { summary: trimmed },
    { description: trimmed },
    { catch_copy: trimmed },
  ];
}

function getTitle(series?: SeriesRow | null): string {
  return pickText(series?.title);
}

function getSummary(series?: SeriesRow | null): string {
  return pickText(series?.summary, series?.description, series?.catch_copy);
}

function getInitialSeriesBgmTitle(series?: SeriesRow | null): string {
  return pickText(series?.bgm_title, series?.bgmTitle);
}

function getInitialSeriesBgmAudioPath(series?: SeriesRow | null): string {
  return pickText(series?.bgm_audio_path, series?.bgmAudioPath);
}

function getInitialSeriesBgmSettings(series?: SeriesRow | null): BgmSettings {
  return parseBgmSettingsFromRow(series?.bgm_settings, series?.bgmSettings);
}

function parseTags(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw
      .map((tag) => String(tag).trim())
      .filter((tag) => tag.length > 0);
  }

  if (typeof raw === "string" && raw.trim().length > 0) {
    return raw
      .split(/[\n,、]/)
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);
  }

  return [];
}

function getRecordingPermissionLabel(
  mode: RecordingPermissionMode | null | undefined
): string {
  if (mode === "open") return "無条件許可";
  if (mode === "approval_required") return "承認制";
  return "非許可";
}

function buildWorkspaceFields(args: {
  bgmTitle: string;
  bgmAudioPath: string;
  bgmSettings: BgmSettings;
}) {
  return {
    bgm_title: args.bgmTitle.trim() || null,
    bgm_audio_path: args.bgmAudioPath.trim() || null,
    bgm_settings: serializeBgmSettingsForSave(args.bgmSettings),
  };
}

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

function StepCard({
  step,
  title,
  description,
}: {
  step: string;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <p className="text-xs tracking-[0.18em] text-neutral-500">{step}</p>
      <p className="mt-2 text-sm font-semibold text-white">{title}</p>
      <p className="mt-2 text-sm leading-7 text-neutral-400">{description}</p>
    </div>
  );
}

function WorkspaceLinkCard({
  eyebrow,
  title,
  description,
  href,
  cta,
}: {
  eyebrow: string;
  title: string;
  description: string;
  href: string;
  cta: string;
}) {
  return (
    <article className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
      <p className="text-xs tracking-[0.18em] text-neutral-500">{eyebrow}</p>
      <h3 className="mt-2 text-lg font-semibold text-white">{title}</h3>
      <p className="mt-3 text-sm leading-7 text-neutral-400">{description}</p>

      <div className="mt-4">
        <Link
          href={href}
          className="inline-flex rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
        >
          {cta}
        </Link>
      </div>
    </article>
  );
}

function BasicEffectFields({
  value,
  onChange,
}: {
  value: BgmSettings;
  onChange: (next: BgmSettings) => void;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <label className="grid gap-2">
        <span className="text-sm text-neutral-300">フェードイン秒数</span>
        <input
          type="number"
          min={0}
          max={20}
          step={0.1}
          value={value.fadeInSeconds ?? ""}
          onChange={(event) =>
            onChange({
              ...value,
              fadeInSeconds: clampBgmSeconds(event.target.value),
            })
          }
          placeholder="例: 1.5"
          className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-neutral-500"
        />
      </label>

      <label className="grid gap-2">
        <span className="text-sm text-neutral-300">フェードアウト秒数</span>
        <input
          type="number"
          min={0}
          max={20}
          step={0.1}
          value={value.fadeOutSeconds ?? ""}
          onChange={(event) =>
            onChange({
              ...value,
              fadeOutSeconds: clampBgmSeconds(event.target.value),
            })
          }
          placeholder="例: 2.0"
          className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-neutral-500"
        />
      </label>
    </div>
  );
}

export default function WriteSeriesForm({
  mode,
  currentUserId,
  series,
  episodes = [],
}: WriteSeriesFormProps) {
  const router = useRouter();

  const [title, setTitle] = useState(getTitle(series));
  const [summary, setSummary] = useState(getSummary(series));
  const [seriesBgmTitle, setSeriesBgmTitle] = useState(
    getInitialSeriesBgmTitle(series)
  );
  const [seriesBgmAudioPath, setSeriesBgmAudioPath] = useState(
    getInitialSeriesBgmAudioPath(series)
  );
  const [seriesBgmSettings, setSeriesBgmSettings] = useState<BgmSettings>(
    getInitialSeriesBgmSettings(series)
  );
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const sortedEpisodes = sortEpisodes(episodes);
  const publishedCount = sortedEpisodes.filter(isPublishedEpisode).length;
  const draftCount = sortedEpisodes.length - publishedCount;
  const latestEpisode =
    sortedEpisodes.length > 0 ? sortedEpisodes[sortedEpisodes.length - 1] : null;
  const latestDraft =
    [...sortedEpisodes].reverse().find((episode) => !isPublishedEpisode(episode)) ??
    null;

  const nextStepHref =
    !series?.id
      ? null
      : sortedEpisodes.length === 0
        ? `/write/series/${series.id}/episodes/new`
        : latestDraft
          ? `/write/series/${series.id}/episodes/${latestDraft.id}`
          : `/write/series/${series.id}/episodes/new`;

  const nextStepLabel =
    !series?.id
      ? null
      : sortedEpisodes.length === 0
        ? "1話目を作る"
        : latestDraft
          ? `下書き中の第${getEpisodeNumber(latestDraft)}話を開く`
          : latestEpisode
            ? `第${getEpisodeNumber(latestEpisode) + 1}話を追加する`
            : "話を追加する";

  const nextStepDescription =
    !series?.id
      ? null
      : sortedEpisodes.length === 0
        ? "まずはこの作品の最初の話を作る。"
        : latestDraft
          ? "まだ公開していない話の続きを書く。"
          : "公開済みの流れを保ったまま次の話へ進む。";

  const tags = parseTags(series?.tags);
  const recordingPermissionLabel = getRecordingPermissionLabel(
    series?.recording_permission_mode
  );
  const hasCommonBgm =
    pickText(seriesBgmTitle, seriesBgmAudioPath).length > 0 ||
    serializeBgmSettingsForSave(seriesBgmSettings) !== null;

  function resetSaveUi() {
    setSaveState("idle");
    setErrorMessage("");
    setSuccessMessage("");
  }

  async function handleCreate() {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setSaveState("error");
      setErrorMessage("タイトルは必須。");
      setSuccessMessage("");
      return;
    }

    setSaveState("saving");
    setErrorMessage("");
    setSuccessMessage("");

    const summaryVariants = buildSummaryValue(summary);
    const workspaceFields = buildWorkspaceFields({
      bgmTitle: seriesBgmTitle,
      bgmAudioPath: seriesBgmAudioPath,
      bgmSettings: seriesBgmSettings,
    });

    const payloads: Array<Record<string, unknown>> = summaryVariants.map(
      (summaryFields) => ({
        title: trimmedTitle,
        author_id: currentUserId,
        ...summaryFields,
        ...workspaceFields,
      })
    );

    payloads.push({
      title: trimmedTitle,
      author_id: currentUserId,
      ...workspaceFields,
    });

    let lastError = "作品作成に失敗した。";

    for (const payload of payloads) {
      const result = await supabase
        .from("series")
        .insert(payload)
        .select("id")
        .single();

      if (!result.error && result.data?.id) {
        setSaveState("success");
        setSuccessMessage("作品を作成した。");
        router.push(`/write/series/${result.data.id}`);
        router.refresh();
        return;
      }

      if (result.error) {
        lastError = result.error.message;
      }
    }

    setSaveState("error");
    setErrorMessage(lastError);
  }

  async function handleUpdate() {
    if (!series?.id) {
      setSaveState("error");
      setErrorMessage("作品IDが取れない。");
      setSuccessMessage("");
      return;
    }

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setSaveState("error");
      setErrorMessage("タイトルは必須。");
      setSuccessMessage("");
      return;
    }

    setSaveState("saving");
    setErrorMessage("");
    setSuccessMessage("");

    const summaryVariants = buildSummaryValue(summary);
    const workspaceFields = buildWorkspaceFields({
      bgmTitle: seriesBgmTitle,
      bgmAudioPath: seriesBgmAudioPath,
      bgmSettings: seriesBgmSettings,
    });

    const payloads: Array<Record<string, unknown>> = summaryVariants.map(
      (summaryFields) => ({
        title: trimmedTitle,
        author_id: currentUserId,
        ...summaryFields,
        ...workspaceFields,
      })
    );

    payloads.push({
      title: trimmedTitle,
      ...workspaceFields,
    });

    let lastError = "作品ワークスペースの保存に失敗した。";

    for (const payload of payloads) {
      const result = await supabase.from("series").update(payload).eq("id", series.id);

      if (!result.error) {
        setSaveState("success");
        setSuccessMessage("作品ワークスペースを保存した。");
        router.refresh();
        return;
      }

      lastError = result.error.message;
    }

    setSaveState("error");
    setErrorMessage(lastError);
  }

  async function handleSubmit() {
    if (mode === "create") {
      await handleCreate();
      return;
    }

    await handleUpdate();
  }

  const heading =
    mode === "create" ? "新しい作品を作る" : "作品ワークスペース";
  const sub =
    mode === "create"
      ? "まずはタイトル、あらすじ、作品共通BGM、基本演出の土台を作る。保存後はそのまま作品ワークスペースへ入り、1話目追加や作品の肉付けへ進める。"
      : "ここは作品ごとの作業場所。作品情報編集、作品共通BGM、基本演出、話一覧、次話追加をここに寄せ、話ごとの細かい作業だけ別ページへ逃がす。";

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-neutral-100">
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-4 text-sm text-neutral-500">
          <span className="text-neutral-300">
            {mode === "create" ? "作品作成" : "作品ワークスペース"}
          </span>
        </div>

        <section className="overflow-hidden rounded-[32px] border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] shadow-2xl">
          <div className="border-b border-white/10 px-5 py-6 sm:px-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-3xl">
                <p className="text-xs tracking-[0.22em] text-neutral-500">
                  LIB READ WRITE WORKSPACE
                </p>
                <h1 className="mt-3 text-3xl font-bold text-white">{heading}</h1>
                <p className="mt-3 text-sm leading-7 text-neutral-400">{sub}</p>
              </div>

              <StatusBadge state={saveState} />
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href="/write"
                className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
              >
                執筆トップへ
              </Link>

              <Link
                href="/manage"
                className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
              >
                管理トップへ
              </Link>

              {series?.id ? (
                <>
                  <Link
                    href={`/works/${series.id}`}
                    className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
                  >
                    作品ページを見る
                  </Link>

                  <Link
                    href={`/manage/series/${series.id}`}
                    className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
                  >
                    詳細管理へ
                  </Link>
                </>
              ) : null}
            </div>
          </div>

          <div className="grid gap-6 px-5 py-6 sm:px-8">
            <section className="rounded-[28px] border border-white/10 bg-black/20 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs tracking-[0.18em] text-neutral-500">
                    WORKSPACE CORE
                  </p>
                  <h2 className="mt-2 text-xl font-semibold text-white">
                    作品情報と作品共通演出
                  </h2>
                  <p className="mt-2 text-sm leading-7 text-neutral-400">
                    ここでは、作品タイトル・あらすじ・作品共通BGM・基本演出までを一緒に触る。
                    話ごとの細かいBGMや将来の重い演出設定は詳細ページへ逃がす。
                  </p>
                </div>

                {series?.id ? (
                  <Link
                    href={`/manage/bgm/${series.id}`}
                    className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
                  >
                    BGM / 演出詳細へ
                  </Link>
                ) : null}
              </div>

              <div className="mt-5 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
                <div className="grid gap-4">
                  <label className="grid gap-2">
                    <span className="text-sm text-neutral-300">作品タイトル</span>
                    <input
                      value={title}
                      onChange={(event) => {
                        setTitle(event.target.value);
                        resetSaveUi();
                      }}
                      placeholder="作品タイトル"
                      className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-neutral-500"
                    />
                  </label>

                  <label className="grid gap-2">
                    <span className="text-sm text-neutral-300">あらすじ</span>
                    <textarea
                      value={summary}
                      onChange={(event) => {
                        setSummary(event.target.value);
                        resetSaveUi();
                      }}
                      rows={8}
                      placeholder="作品の概要を書く"
                      className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm leading-7 text-white outline-none placeholder:text-neutral-500"
                    />
                  </label>

                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="grid gap-2">
                      <span className="text-sm text-neutral-300">作品共通BGMタイトル</span>
                      <input
                        value={seriesBgmTitle}
                        onChange={(event) => {
                          setSeriesBgmTitle(event.target.value);
                          resetSaveUi();
                        }}
                        placeholder="例: メインテーマ"
                        className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-neutral-500"
                      />
                    </label>

                    <label className="grid gap-2">
                      <span className="text-sm text-neutral-300">作品共通BGMパス</span>
                      <input
                        value={seriesBgmAudioPath}
                        onChange={(event) => {
                          setSeriesBgmAudioPath(event.target.value);
                          resetSaveUi();
                        }}
                        placeholder="/test-audio/demo-bgm.mp3"
                        className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-neutral-500"
                      />
                    </label>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <p className="text-sm font-semibold text-white">
                      基本演出
                    </p>
                    <p className="mt-2 text-sm leading-7 text-neutral-400">
                      ここでは作品全体の最小演出として、共通フェードだけを扱う。
                      詳しい話ごと演出や将来のシーン切り替え演出は詳細ページへ回す。
                    </p>

                    <div className="mt-4">
                      <BasicEffectFields
                        value={seriesBgmSettings}
                        onChange={(next) => {
                          setSeriesBgmSettings(next);
                          resetSaveUi();
                        }}
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={handleSubmit}
                      className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-black transition hover:opacity-90"
                    >
                      {saveState === "saving"
                        ? "保存中..."
                        : mode === "create"
                          ? "作品を作成してワークスペースへ"
                          : "作品ワークスペースを保存"}
                    </button>

                    {series?.id ? (
                      <Link
                        href={`/write/series/${series.id}/episodes/new`}
                        className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
                      >
                        新しい話を追加
                      </Link>
                    ) : null}
                  </div>

                  {errorMessage ? (
                    <div className="rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">
                      {errorMessage}
                    </div>
                  ) : null}

                  {successMessage ? (
                    <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">
                      {successMessage}
                    </div>
                  ) : null}
                </div>

                <div className="grid gap-4">
                  <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
                    <p className="text-xs tracking-[0.18em] text-neutral-500">
                      CURRENT STATE
                    </p>
                    <div className="mt-3 grid gap-3">
                      <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-neutral-300">
                        共通BGM:{" "}
                        <span className="font-semibold text-white">
                          {hasCommonBgm ? "設定あり" : "未設定"}
                        </span>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-neutral-300">
                        タグ:{" "}
                        <span className="font-semibold text-white">
                          {tags.length}件
                        </span>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-neutral-300">
                        朗読許可:{" "}
                        <span className="font-semibold text-white">
                          {recordingPermissionLabel}
                        </span>
                      </div>
                    </div>
                  </div>

                  {series?.id ? (
                    <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
                      <p className="text-xs tracking-[0.18em] text-neutral-500">
                        RELATED SETTINGS
                      </p>
                      <div className="mt-3 grid gap-3">
                        <WorkspaceLinkCard
                          eyebrow="DETAIL BGM"
                          title="BGM / 演出詳細"
                          description="話ごとのBGMや、より細かい演出設定はこちらで調整する。"
                          href={`/manage/bgm/${series.id}`}
                          cta="詳細を開く"
                        />
                        <WorkspaceLinkCard
                          eyebrow="TAGS"
                          title="タグ管理"
                          description="作品タグは専用ページで編集する。ここでは状態だけ見せる。"
                          href={`/manage/tags/${series.id}`}
                          cta="タグ管理へ"
                        />
                        <WorkspaceLinkCard
                          eyebrow="RECORDING"
                          title="朗読許可管理"
                          description="第三者朗読の可否は専用ページで管理する。"
                          href={`/manage/recording-permission/${series.id}`}
                          cta="朗読許可へ"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4 text-sm leading-7 text-neutral-400">
                      まず作品を作成すると、タグ管理や朗読許可管理へも進めるようになる。
                    </div>
                  )}
                </div>
              </div>
            </section>

            {mode === "create" ? (
              <section className="rounded-[28px] border border-white/10 bg-black/20 p-5">
                <p className="text-xs tracking-[0.18em] text-neutral-500">FLOW</p>
                <h2 className="mt-2 text-xl font-semibold text-white">
                  作品作成後の流れ
                </h2>
                <div className="mt-4 grid gap-4 md:grid-cols-4">
                  <StepCard
                    step="STEP 1"
                    title="作品を作成する"
                    description="まずはタイトル・あらすじ・共通BGM・基本演出の土台を作る。"
                  />
                  <StepCard
                    step="STEP 2"
                    title="ワークスペースへ入る"
                    description="保存後、そのまま作品ワークスペースへ移る。"
                  />
                  <StepCard
                    step="STEP 3"
                    title="1話目を追加する"
                    description="作品単位の流れを保ったまま、そのまま話作成へ進む。"
                  />
                  <StepCard
                    step="STEP 4"
                    title="必要なら管理を足す"
                    description="タグや朗読許可、細かいBGM設定だけ詳細ページへ移る。"
                  />
                </div>
              </section>
            ) : null}

            {series?.id ? (
              <section className="grid gap-4 lg:grid-cols-4">
                <div className="rounded-[28px] border border-white/10 bg-black/20 p-5">
                  <p className="text-xs tracking-[0.18em] text-neutral-500">EPISODES</p>
                  <p className="mt-2 text-3xl font-semibold text-white">
                    {sortedEpisodes.length}話
                  </p>
                  <p className="mt-2 text-sm text-neutral-400">
                    この作品に紐づく話数の合計
                  </p>
                </div>

                <div className="rounded-[28px] border border-white/10 bg-black/20 p-5">
                  <p className="text-xs tracking-[0.18em] text-neutral-500">PUBLISHED</p>
                  <p className="mt-2 text-3xl font-semibold text-white">
                    {publishedCount}話
                  </p>
                  <p className="mt-2 text-sm text-neutral-400">
                    公開状態として読める話数
                  </p>
                </div>

                <div className="rounded-[28px] border border-white/10 bg-black/20 p-5">
                  <p className="text-xs tracking-[0.18em] text-neutral-500">DRAFT</p>
                  <p className="mt-2 text-3xl font-semibold text-white">
                    {draftCount}話
                  </p>
                  <p className="mt-2 text-sm text-neutral-400">
                    まだ公開していない話数
                  </p>
                </div>

                <div className="rounded-[28px] border border-white/10 bg-black/20 p-5">
                  <p className="text-xs tracking-[0.18em] text-neutral-500">LATEST</p>
                  <p className="mt-2 text-3xl font-semibold text-white">
                    {latestEpisode ? `第${getEpisodeNumber(latestEpisode)}話` : "未作成"}
                  </p>
                  <p className="mt-2 text-sm text-neutral-400">最新の話番号</p>
                </div>
              </section>
            ) : null}

            {series?.id ? (
              <section className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
                <div className="rounded-[28px] border border-white/10 bg-black/20 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs tracking-[0.18em] text-neutral-500">
                        EPISODE LIST
                      </p>
                      <h2 className="mt-2 text-xl font-semibold text-white">
                        この作品の話一覧
                      </h2>
                      <p className="mt-2 text-sm leading-7 text-neutral-400">
                        本文は各話ページで編集し、作品全体の方向付けはこのワークスペースで行う。
                      </p>
                    </div>

                    <Link
                      href={`/write/series/${series.id}/episodes/new`}
                      className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
                    >
                      話を追加
                    </Link>
                  </div>

                  <div className="mt-4 grid gap-3">
                    {sortedEpisodes.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.03] px-4 py-4 text-sm text-neutral-400">
                        まだ話はない。まずは1話目を作る。
                      </div>
                    ) : (
                      sortedEpisodes.map((episode) => {
                        const episodeNumber = getEpisodeNumber(episode);
                        const published = isPublishedEpisode(episode);

                        return (
                          <div
                            key={episode.id}
                            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4"
                          >
                            <div>
                              <div className="flex flex-wrap items-center gap-3">
                                <p className="text-sm text-neutral-500">
                                  第{episodeNumber}話
                                </p>
                                <span
                                  className={`rounded-full border px-3 py-1 text-xs ${
                                    published
                                      ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200"
                                      : "border-amber-400/20 bg-amber-400/10 text-amber-200"
                                  }`}
                                >
                                  {published ? "公開" : "下書き"}
                                </span>
                              </div>

                              <p className="mt-2 text-base font-semibold text-white">
                                {pickText(episode.title) || `第${episodeNumber}話`}
                              </p>
                            </div>

                            <div className="flex flex-wrap gap-3">
                              <Link
                                href={`/write/series/${series.id}/episodes/${episode.id}`}
                                className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
                              >
                                本文編集
                              </Link>

                              {episodeNumber > 0 ? (
                                <Link
                                  href={`/read/${series.id}/${episodeNumber}`}
                                  className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
                                >
                                  読む
                                </Link>
                              ) : null}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                <div className="rounded-[28px] border border-white/10 bg-black/20 p-5">
                  <p className="text-xs tracking-[0.18em] text-neutral-500">NEXT STEP</p>
                  <h2 className="mt-2 text-xl font-semibold text-white">
                    この作品で次にやること
                  </h2>

                  {nextStepHref && nextStepLabel ? (
                    <>
                      <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
                        <p className="text-base font-semibold text-white">
                          {nextStepLabel}
                        </p>
                        <p className="mt-2 text-sm leading-7 text-neutral-400">
                          {nextStepDescription}
                        </p>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-3">
                        <Link
                          href={nextStepHref}
                          className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-black transition hover:opacity-90"
                        >
                          {nextStepLabel}
                        </Link>

                        <Link
                          href={`/manage/bgm/${series.id}`}
                          className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-neutral-200 transition hover:bg-white hover:text-black"
                        >
                          BGM / 演出詳細
                        </Link>
                      </div>
                    </>
                  ) : null}

                  <div className="mt-6 grid gap-3">
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
                      <p className="text-sm font-semibold text-white">
                        作品共通の空気感を先に作る
                      </p>
                      <p className="mt-2 text-sm leading-7 text-neutral-400">
                        作品共通BGMと基本演出を先に置いておくと、各話を書き始めた時の方向がぶれにくい。
                      </p>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
                      <p className="text-sm font-semibold text-white">
                        下書きを減らす
                      </p>
                      <p className="mt-2 text-sm leading-7 text-neutral-400">
                        公開前の話が残っているなら、まずその話を仕上げると流れが途切れにくい。
                      </p>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
                      <p className="text-sm font-semibold text-white">
                        細かい設定だけ詳細へ
                      </p>
                      <p className="mt-2 text-sm leading-7 text-neutral-400">
                        毎回触らない設定は、詳細ページへ逃がしてこのワークスペースを重くしすぎない。
                      </p>
                    </div>
                  </div>
                </div>
              </section>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}