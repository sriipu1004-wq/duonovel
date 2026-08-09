import type { ReactNode } from "react";
import ReadBilingualShell from "@/features/playback/ReadBilingualShell";
import {
  getEpisodeNumber,
  pickText,
} from "@/features/write/writeShared";
import { getCachedPublicReadPagePayload } from "@/lib/publicRead";
import { isEpisodeTranslationAllowlisted } from "@/lib/translation/episodeTranslationServer";

type ReadEpisodeLayoutProps = {
  children: ReactNode;
  params: Promise<{ seriesId: string; episodeNumber: string }>;
};

function parseEpisodeNumber(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export default async function ReadEpisodeLayout({
  children,
  params,
}: ReadEpisodeLayoutProps) {
  const { seriesId, episodeNumber } = await params;
  const parsedEpisodeNumber = parseEpisodeNumber(episodeNumber);

  if (!parsedEpisodeNumber) {
    return children;
  }

  try {
    const payload = await getCachedPublicReadPagePayload(
      seriesId,
      parsedEpisodeNumber
    );

    if (!payload) {
      return children;
    }

    const currentEpisodeNumber =
      getEpisodeNumber(payload.episode) || parsedEpisodeNumber;
    const translationEligible = isEpisodeTranslationAllowlisted({
      episodeId: payload.episode.id,
      seriesId,
      episodeNumber: currentEpisodeNumber,
    });

    if (!translationEligible) {
      return children;
    }

    return (
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
      >
        {children}
      </ReadBilingualShell>
    );
  } catch {
    return children;
  }
}
