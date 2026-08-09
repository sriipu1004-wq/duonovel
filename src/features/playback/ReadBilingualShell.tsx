"use client";

import { useEffect, useState, type ReactNode } from "react";
import BilingualEpisodePlayback from "@/features/playback/BilingualEpisodePlayback";
import BilingualSettingsBridge from "@/features/playback/BilingualSettingsBridge";

type ReadBilingualShellProps = {
  children: ReactNode;
  translationEligible: boolean;
  seriesId: string;
  episodeId: string;
  episodeNumber: number;
  seriesTitle?: string;
  episodeTitle?: string;
  workAuthorName?: string;
  workEditorName?: string;
};

export default function ReadBilingualShell({
  children,
  translationEligible,
  seriesId,
  episodeId,
  episodeNumber,
  seriesTitle,
  episodeTitle,
  workAuthorName,
  workEditorName,
}: ReadBilingualShellProps) {
  const [mode, setMode] = useState<"standard" | "bilingual">("standard");

  function enableBilingual() {
    if (!translationEligible) return;

    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }

    document.querySelectorAll<HTMLAudioElement>("main audio").forEach((audio) => {
      audio.pause();
    });

    setMode("bilingual");
  }

  useEffect(() => {
    if (!translationEligible || typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    if (params.get("bilingual") !== "1") return;

    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }

    document.querySelectorAll<HTMLAudioElement>("main audio").forEach((audio) => {
      audio.pause();
    });

    setMode("bilingual");
  }, [translationEligible]);

  if (mode === "bilingual") {
    return (
      <BilingualEpisodePlayback
        seriesId={seriesId}
        episodeId={episodeId}
        episodeNumber={episodeNumber}
        seriesTitle={seriesTitle}
        episodeTitle={episodeTitle}
        workAuthorName={workAuthorName}
        workEditorName={workEditorName}
        onDisableBilingual={() => setMode("standard")}
      />
    );
  }

  return (
    <>
      {children}
      <BilingualSettingsBridge
        enabled={translationEligible}
        onEnable={enableBilingual}
      />
    </>
  );
}
