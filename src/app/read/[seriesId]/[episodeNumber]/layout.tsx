import type { ReactNode } from "react";
import R18ContentGate from "@/components/content/R18ContentGate";
import ReadBilingualShell from "@/features/playback/ReadBilingualShell";
import ReaderSettingsTopBridge from "@/features/playback/ReaderSettingsTopBridge";
import {
  getEpisodeNumber,
  pickText,
  type SeriesRow,
} from "@/features/write/writeShared";
import {
  getSeriesContentWarnings,
  isR18Series,
  type SeriesContentWarning,
} from "@/lib/contentRating";
import { getCachedPublicReadPagePayload } from "@/lib/publicRead";
import {
  isEpisodeTranslationAllowlisted,
  isSeriesTranslationEligibleIncludingOfficial,
} from "@/lib/translation/episodeTranslationServer";

type ReadEpisodeLayoutProps = {
  children: ReactNode;
  params: Promise<{ seriesId: string; episodeNumber: string }>;
};

function parseEpisodeNumber(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function parseRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object") {
    return value as Record<string, unknown>;
  }

  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object"
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }

  return null;
}

function parseTags(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(/[\n,、]/u)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function resolveReadAttribution(series: SeriesRow): {
  authorName: string;
  editorName: string;
} {
  const settings = parseRecord(series.effect_settings ?? series.effectSettings);
  const tags = parseTags(series.tags);
  const isAiGenerated =
    tags.includes("AI生成") ||
    settings?.source === "time_fit_ai_story" ||
    settings?.aiGenerated === true ||
    settings?.authorName === "AI生成";

  if (isAiGenerated) {
    return {
      authorName: "AI生成",
      editorName:
        pickText(settings?.editorName, settings?.editor_name) || "編集者未設定",
    };
  }

  return {
    authorName: pickText(series["author_name"]) || "作者名未設定",
    editorName: "",
  };
}

function withSettingsTopBridge(content: ReactNode) {
  return (
    <>
      <ReaderSettingsTopBridge />
      {content}
    </>
  );
}

function WarningBadges({ warnings }: { warnings: SeriesContentWarning[] }) {
  if (warnings.length === 0) return null;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-wrap gap-2 px-3 pt-3 sm:px-6">
      {warnings.includes("sexual_r18") ? (
        <span className="inline-flex rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">
          R18・性的コンテンツ
        </span>
      ) : null}
      {warnings.includes("violence") ? (
        <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
          暴力描写あり
        </span>
      ) : null}
    </div>
  );
}

function withContentWarningSurface(content: ReactNode, series: SeriesRow) {
  const warnings = getSeriesContentWarnings(series);
  const r18 = isR18Series(series);

  if (warnings.length === 0) return <>{content}</>;

  return (
    <div
      data-content-rating={r18 ? "r18" : "general"}
      data-ad-eligible={r18 ? "false" : undefined}
    >
      <WarningBadges warnings={warnings} />
      {content}
    </div>
  );
}

export default async function ReadEpisodeLayout({
  children,
  params,
}: ReadEpisodeLayoutProps) {
  const { seriesId, episodeNumber } = await params;
  const parsedEpisodeNumber = parseEpisodeNumber(episodeNumber);

  if (!parsedEpisodeNumber) {
    return withSettingsTopBridge(children);
  }

  try {
    const payload = await getCachedPublicReadPagePayload(
      seriesId,
      parsedEpisodeNumber
    );

    if (!payload) {
      return withSettingsTopBridge(children);
    }

    if (payload.r18Blocked) {
      return (
        <R18ContentGate
          signedIn={payload.viewerSignedIn}
          returnHref={`/read/${encodeURIComponent(seriesId)}/${parsedEpisodeNumber}`}
        />
      );
    }

    const currentEpisodeNumber =
      getEpisodeNumber(payload.episode) || parsedEpisodeNumber;
    const translationEligible =
      (await isSeriesTranslationEligibleIncludingOfficial(payload.series)) ||
      isEpisodeTranslationAllowlisted({
        episodeId: payload.episode.id,
        seriesId,
        episodeNumber: currentEpisodeNumber,
      });

    if (!translationEligible) {
      return withContentWarningSurface(
        withSettingsTopBridge(children),
        payload.series
      );
    }

    const attribution = resolveReadAttribution(payload.series);

    return withContentWarningSurface(
      withSettingsTopBridge(
        <ReadBilingualShell
          translationEligible={translationEligible}
          seriesId={seriesId}
          episodeId={payload.episode.id}
          episodeNumber={currentEpisodeNumber}
          seriesTitle={pickText(payload.series.title) || "無題"}
          episodeTitle={
            pickText(payload.episode.title, payload.episode["episode_title"]) ||
            `第${currentEpisodeNumber}話`
          }
          workAuthorName={attribution.authorName}
          workEditorName={attribution.editorName}
        >
          {children}
        </ReadBilingualShell>
      ),
      payload.series
    );
  } catch {
    return withSettingsTopBridge(children);
  }
}
