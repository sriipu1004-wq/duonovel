import type { ReactNode } from "react";
import R18ContentGate from "@/components/content/R18ContentGate";
import ReadBilingualShell from "@/features/playback/ReadBilingualShell";
import ReaderSettingsTopBridge from "@/features/playback/ReaderSettingsTopBridge";
import {
  getEpisodeNumber,
  pickText,
  type SeriesRow,
} from "@/features/write/writeShared";
import { isR18Series } from "@/lib/contentRating";
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

function withContentRatingSurface(content: ReactNode, series: SeriesRow) {
  return isR18Series(series) ? (
    <div data-content-rating="r18" data-ad-eligible="false">
      {content}
    </div>
  ) : (
    <>{content}</>
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
      return withContentRatingSurface(
        withSettingsTopBridge(children),
        payload.series
      );
    }

    const attribution = resolveReadAttribution(payload.series);

    return withContentRatingSurface(
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
