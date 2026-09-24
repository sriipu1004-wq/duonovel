"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

const EpisodeCommentSection = dynamic(
  () => import("@/features/comment/EpisodeCommentSection"),
  {
    ssr: false,
    loading: () => (
      <div
        className="mt-6 h-48 rounded-3xl border border-black/10 bg-neutral-50"
        aria-hidden="true"
      />
    ),
  }
);

type DeferredEpisodeCommentSectionProps = {
  episodeId: string;
  episodeNumber: number;
  loginHref?: string;
};

export default function DeferredEpisodeCommentSection({
  episodeId,
  episodeNumber,
  loginHref,
}: DeferredEpisodeCommentSectionProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (enabled) return;
    const node = hostRef.current;
    if (!node) return;

    if (!("IntersectionObserver" in window)) {
      setEnabled(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setEnabled(true);
        observer.disconnect();
      },
      { rootMargin: "800px 0px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [enabled]);

  return (
    <div ref={hostRef} className="mt-6 min-h-48">
      {enabled ? (
        <EpisodeCommentSection
          episodeId={episodeId}
          episodeNumber={episodeNumber}
          loginHref={loginHref}
        />
      ) : (
        <div
          className="h-48 rounded-3xl border border-black/10 bg-neutral-50"
          aria-hidden="true"
        />
      )}
    </div>
  );
}
