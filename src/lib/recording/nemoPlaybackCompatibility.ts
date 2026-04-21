import {
  buildNemoTimingPublicUrlFromAudioPublicUrl,
  parseNemoGeneratedAudioSegments,
  parseNemoGeneratedSentenceTimings,
  type NemoGeneratedAudioSegment,
  type NemoGeneratedSentenceTiming,
} from "@/lib/recording/nemoTiming";

export type ResolvedNemoPlaybackSources = {
  primaryAudioUrl: string;
  audioUrls: string[];
  audioSegments: NemoGeneratedAudioSegment[];
  sentenceTimings: NemoGeneratedSentenceTiming[];
  isMultipart: boolean;
  totalDurationSeconds: number | null;
};

function sumDurations(segments: NemoGeneratedAudioSegment[]): number | null {
  if (segments.length === 0) {
    return null;
  }

  const total = segments.reduce((sum, segment) => sum + segment.durationSeconds, 0);
  return Number.isFinite(total) ? total : null;
}

function buildSingleSourceFallback(
  audioPublicUrl: string,
  sentenceTimings: NemoGeneratedSentenceTiming[] = []
): ResolvedNemoPlaybackSources {
  return {
    primaryAudioUrl: audioPublicUrl,
    audioUrls: [audioPublicUrl],
    audioSegments: [],
    sentenceTimings,
    isMultipart: false,
    totalDurationSeconds: null,
  };
}

export async function resolveNemoPlaybackSources(
  audioPublicUrl: string
): Promise<ResolvedNemoPlaybackSources> {
  const normalizedAudioUrl = audioPublicUrl.trim();

  if (!normalizedAudioUrl) {
    return buildSingleSourceFallback("");
  }

  const timingUrl = buildNemoTimingPublicUrlFromAudioPublicUrl(normalizedAudioUrl);

  if (!timingUrl) {
    return buildSingleSourceFallback(normalizedAudioUrl);
  }

  try {
    const response = await fetch(timingUrl, {
      method: "GET",
      cache: "no-store",
    });

    if (!response.ok) {
      return buildSingleSourceFallback(normalizedAudioUrl);
    }

    const payload = (await response.json()) as unknown;
    const audioSegments = parseNemoGeneratedAudioSegments(payload);
    const sentenceTimings = parseNemoGeneratedSentenceTimings(payload);

    if (audioSegments.length === 0) {
      return buildSingleSourceFallback(normalizedAudioUrl, sentenceTimings);
    }

    return {
      primaryAudioUrl: audioSegments[0].audioPublicUrl,
      audioUrls: audioSegments.map((segment) => segment.audioPublicUrl),
      audioSegments,
      sentenceTimings,
      isMultipart: audioSegments.length > 1,
      totalDurationSeconds: sumDurations(audioSegments),
    };
  } catch {
    return buildSingleSourceFallback(normalizedAudioUrl);
  }
}

export function getGlobalPlaybackTimeSeconds(args: {
  currentSegmentIndex: number;
  localCurrentTimeSeconds: number;
  audioSegments: NemoGeneratedAudioSegment[];
}): number {
  const { currentSegmentIndex, localCurrentTimeSeconds, audioSegments } = args;

  if (audioSegments.length === 0) {
    return localCurrentTimeSeconds;
  }

  const safeIndex = Math.max(0, Math.min(currentSegmentIndex, audioSegments.length - 1));
  const segment = audioSegments[safeIndex];
  const base = Number.isFinite(segment?.startTimeSeconds)
    ? segment.startTimeSeconds
    : 0;

  return base + Math.max(0, localCurrentTimeSeconds);
}

export function findPlaybackSegmentForGlobalTime(args: {
  targetTimeSeconds: number;
  audioSegments: NemoGeneratedAudioSegment[];
}): {
  segmentIndex: number;
  localTimeSeconds: number;
} {
  const { targetTimeSeconds, audioSegments } = args;

  if (audioSegments.length === 0) {
    return {
      segmentIndex: 0,
      localTimeSeconds: Math.max(0, targetTimeSeconds),
    };
  }

  const safeTarget = Math.max(0, targetTimeSeconds);

  for (let index = 0; index < audioSegments.length; index += 1) {
    const segment = audioSegments[index];
    const segmentStart = segment.startTimeSeconds;
    const segmentEnd = segment.startTimeSeconds + segment.durationSeconds;

    if (safeTarget >= segmentStart && safeTarget < segmentEnd) {
      return {
        segmentIndex: index,
        localTimeSeconds: safeTarget - segmentStart,
      };
    }
  }

  const lastIndex = audioSegments.length - 1;
  const lastSegment = audioSegments[lastIndex];

  return {
    segmentIndex: lastIndex,
    localTimeSeconds: Math.max(0, lastSegment.durationSeconds - 0.05),
  };
}