"use client";

import { useState, type ReactNode } from "react";
import BilingualActionBridge from "@/features/playback/BilingualActionBridge";
import BilingualResumeBridge from "@/features/playback/BilingualResumeBridge";
import PrivateLibraryBilingualPlayback from "@/features/library/PrivateLibraryBilingualPlayback";
import type { SupportedLanguageTag } from "@/lib/translation/languageRegistry";

type PrivateLibraryBilingualShellProps = {
  children: ReactNode;
  workId: string;
  chapterId: string;
  chapterNumber: number;
  sectionNumber: number;
  partNumber: number;
  partCount: number;
  workTitle: string;
  chapterTitle: string;
  authorName?: string;
  sourceLanguage: SupportedLanguageTag;
  workIndexHref: string;
  nextChapterId: string | null;
};

export default function PrivateLibraryBilingualShell({
  children,
  workId,
  chapterId,
  chapterNumber,
  sectionNumber,
  partNumber,
  partCount,
  workTitle,
  chapterTitle,
  authorName,
  sourceLanguage,
  workIndexHref,
  nextChapterId,
}: PrivateLibraryBilingualShellProps) {
  const [mode, setMode] = useState<"standard" | "bilingual">("standard");
  const [resumeSegmentIndex, setResumeSegmentIndex] = useState<number | null>(null);
  const [restoreToken, setRestoreToken] = useState(0);

  function enableBilingual() {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }

    document.querySelectorAll<HTMLAudioElement>("main audio").forEach((audio) => {
      audio.pause();
    });

    setMode("bilingual");
  }

  function disableBilingual(segmentIndex: number) {
    setResumeSegmentIndex(segmentIndex);
    setMode("standard");
    setRestoreToken((current) => current + 1);
  }

  if (mode === "bilingual") {
    return (
      <PrivateLibraryBilingualPlayback
        workId={workId}
        chapterId={chapterId}
        chapterNumber={chapterNumber}
        sectionNumber={sectionNumber}
        partNumber={partNumber}
        partCount={partCount}
        workTitle={workTitle}
        chapterTitle={chapterTitle}
        authorName={authorName}
        sourceLanguage={sourceLanguage}
        workIndexHref={workIndexHref}
        nextChapterId={nextChapterId}
        onDisableBilingual={disableBilingual}
      />
    );
  }

  return (
    <>
      {children}
      <BilingualActionBridge enabled onEnable={enableBilingual} />
      <BilingualResumeBridge
        segmentIndex={resumeSegmentIndex}
        restoreToken={restoreToken}
      />
    </>
  );
}
