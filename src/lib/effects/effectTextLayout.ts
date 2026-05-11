import type {
  EffectIllustration,
  EffectSceneCue,
  EffectSentenceTimestamp,
} from "@/lib/effects/effectSettings";

export type SentenceSegment = {
  index: number;
  text: string;
};

export type ParagraphBlock = {
  paragraphIndex: number;
  segments: SentenceSegment[];
};

export type SceneCueRuntime = EffectSceneCue & {
  sentenceIndex: number;
};

export type SceneBreakRuntime = EffectIllustration & {
  sentenceIndex: number;
};

export type SentenceTimestampRuntime = EffectSentenceTimestamp & {
  sentenceIndex: number;
};

export type EffectContentBlock =
  | {
      kind: "paragraph";
      key: string;
      paragraphIndex: number;
      sentences: SentenceSegment[];
    }
  | {
      kind: "scene_break";
      key: string;
      afterSentenceIndex: number;
      illustrations: SceneBreakRuntime[];
    };

const INLINE_RUBY_WITH_PIPE_PATTERN =
  /｜([^《》\r\n]+)《([^《》\r\n]+)》/gu;

const INLINE_RUBY_PATTERN =
  /([一-龯々〆ヵヶ〓]+)《([^《》\r\n]+)》/gu;

function replaceRubyWithBaseText(text: string): string {
  return text
    .replace(INLINE_RUBY_WITH_PIPE_PATTERN, "$1")
    .replace(INLINE_RUBY_PATTERN, "$1");
}

function replaceRubyWithReadingText(text: string): string {
  return text
    .replace(INLINE_RUBY_WITH_PIPE_PATTERN, "$2")
    .replace(INLINE_RUBY_PATTERN, "$2");
}

function normalizeComparableText(text: string): string {
  return text
    .replace(/\s+/gu, "")
    .replace(/[「」『』（）()［］【】]/gu, "")
    .trim();
}

function isComparableNumberOnly(text: string): boolean {
  const normalized = normalizeComparableText(text).replace(
    /[.,，．:：\-─―—]/gu,
    ""
  );

  if (!normalized) {
    return false;
  }

  return /^[0-9０-９一二三四五六七八九十百千上下前後序章終幕ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩivxIVX]+$/u.test(
    normalized
  );
}

function buildLooseComparableCandidates(text: string): string[] {
  const baseText = replaceRubyWithBaseText(text);
  const readingText = replaceRubyWithReadingText(text);

  const candidates = [
    text,
    baseText,
    readingText,
  ]
    .map((value) => normalizeComparableText(value))
    .filter(
      (value) => value.length > 0 && !isComparableNumberOnly(value)
    );

  return Array.from(new Set(candidates));
}

function computeLooseMatchScore(source: string, target: string): number {
  if (!source || !target) {
    return 0;
  }

  if (source === target) {
    return 1;
  }

  const shorterLength = Math.min(source.length, target.length);
  const longerLength = Math.max(source.length, target.length);

  if (shorterLength <= 1) {
    return 0;
  }

  if (source.includes(target) || target.includes(source)) {
    return shorterLength / longerLength;
  }

  const sourceCounts = new Map<string, number>();

  for (const char of source) {
    sourceCounts.set(char, (sourceCounts.get(char) ?? 0) + 1);
  }

  let commonCount = 0;

  for (const char of target) {
    const remaining = sourceCounts.get(char) ?? 0;
    if (remaining <= 0) {
      continue;
    }

    commonCount += 1;
    sourceCounts.set(char, remaining - 1);
  }

  return commonCount / longerLength;
}

export function splitParagraphIntoSentences(paragraph: string): string[] {
  const normalized = paragraph.trim();
  if (!normalized) return [];

  const matched = normalized.match(/[^。！？!?]+[。！？!?]?/g);
  if (!matched || matched.length === 0) {
    return [normalized];
  }

  return matched.map((item) => item.trim()).filter((item) => item.length > 0);
}

export function buildParagraphBlocks(body: string): ParagraphBlock[] {
  const paragraphs = body
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const sentenceGroups = paragraphs.map((paragraph) =>
    splitParagraphIntoSentences(paragraph)
  );

  return sentenceGroups.map((sentences, paragraphIndex) => {
    const baseIndex = sentenceGroups
      .slice(0, paragraphIndex)
      .reduce((sum, group) => sum + group.length, 0);

    return {
      paragraphIndex,
      segments: sentences.map((text, sentenceIndex) => ({
        index: baseIndex + sentenceIndex,
        text,
      })),
    };
  });
}

export function resolveSentenceIndexByTargetText(
  paragraphBlocks: ParagraphBlock[],
  targetText: string
): number | null {
  const targetCandidates = buildLooseComparableCandidates(targetText);

  if (targetCandidates.length === 0) {
    return null;
  }

  let bestSentenceIndex: number | null = null;
  let bestScore = 0;

  for (const block of paragraphBlocks) {
    for (const segment of block.segments) {
      const segmentCandidates = buildLooseComparableCandidates(segment.text);

      if (segmentCandidates.length === 0) {
        continue;
      }

      for (const targetCandidate of targetCandidates) {
        for (const segmentCandidate of segmentCandidates) {
          const score = computeLooseMatchScore(
            segmentCandidate,
            targetCandidate
          );

          if (score > bestScore) {
            bestScore = score;
            bestSentenceIndex = segment.index;
          }
        }
      }
    }
  }

  if (bestSentenceIndex === null) {
    return null;
  }

  return bestScore >= 0.12 ? bestSentenceIndex : null;
}

export function buildSceneCueRuntimeList(
  paragraphBlocks: ParagraphBlock[],
  sceneCues: EffectSceneCue[]
): SceneCueRuntime[] {
  return sceneCues
    .map((sceneCue) => {
      const sentenceIndex = resolveSentenceIndexByTargetText(
        paragraphBlocks,
        sceneCue.triggerText
      );

      if (sentenceIndex === null) return null;

      return {
        ...sceneCue,
        sentenceIndex,
      };
    })
    .filter((sceneCue): sceneCue is SceneCueRuntime => sceneCue !== null)
    .sort((left, right) => left.sentenceIndex - right.sentenceIndex);
}

export function buildSceneBreakRuntimeList(
  paragraphBlocks: ParagraphBlock[],
  illustrations: EffectIllustration[]
): SceneBreakRuntime[] {
  const segments = paragraphBlocks.flatMap((block) => block.segments);
  const maxSentenceIndex =
    segments.length > 0
      ? Math.max(...segments.map((segment) => segment.index))
      : -1;

  return illustrations
    .filter((illustration) => illustration.placement === "scene_break")
    .map((illustration) => {
      const explicitSentenceIndex =
        typeof illustration.sentenceIndex === "number" &&
        Number.isFinite(illustration.sentenceIndex) &&
        illustration.sentenceIndex >= 0
          ? Math.floor(illustration.sentenceIndex)
          : null;

      const clampedExplicitSentenceIndex =
        explicitSentenceIndex !== null && maxSentenceIndex >= 0
          ? Math.min(explicitSentenceIndex, maxSentenceIndex)
          : explicitSentenceIndex;

      const sentenceIndex =
        clampedExplicitSentenceIndex ??
        resolveSentenceIndexByTargetText(
          paragraphBlocks,
          illustration.anchorText ?? ""
        );

      if (sentenceIndex === null) return null;

      return {
        ...illustration,
        sentenceIndex,
      };
    })
    .filter(
      (illustration): illustration is SceneBreakRuntime => illustration !== null
    )
    .sort((left, right) => left.sentenceIndex - right.sentenceIndex);
}

const TIMESTAMP_INLINE_RUBY_WITH_PIPE_PATTERN =
  /｜([^《》\r\n]+)《([^《》\r\n]+)》/gu;

const TIMESTAMP_INLINE_RUBY_PATTERN =
  /([一-龯々〆ヵヶ〓]+)《([^《》\r\n]+)》/gu;

function replaceRubyBaseForTimestamp(text: string): string {
  return text
    .replace(TIMESTAMP_INLINE_RUBY_WITH_PIPE_PATTERN, "$1")
    .replace(TIMESTAMP_INLINE_RUBY_PATTERN, "$1");
}

function replaceRubyReadingForTimestamp(text: string): string {
  return text
    .replace(TIMESTAMP_INLINE_RUBY_WITH_PIPE_PATTERN, "$2")
    .replace(TIMESTAMP_INLINE_RUBY_PATTERN, "$2");
}

function normalizeTimestampComparableText(text: string): string {
  return text
    .replace(/\s+/gu, "")
    .replace(/[「」『』（）()［］【】]/gu, "")
    .trim();
}

function buildTimestampComparableCandidates(text: string): string[] {
  return Array.from(
    new Set(
      [
        text,
        replaceRubyBaseForTimestamp(text),
        replaceRubyReadingForTimestamp(text),
      ]
        .map((value) => normalizeTimestampComparableText(value))
        .filter((value) => value.length > 0)
    )
  );
}

function computeTimestampTextScore(left: string, right: string): number {
  if (!left || !right) {
    return 0;
  }

  if (left === right) {
    return 1;
  }

  const shorterLength = Math.min(left.length, right.length);
  const longerLength = Math.max(left.length, right.length);

  if (left.includes(right) || right.includes(left)) {
    return shorterLength / longerLength;
  }

  const leftCounts = new Map<string, number>();

  for (const char of left) {
    leftCounts.set(char, (leftCounts.get(char) ?? 0) + 1);
  }

  let commonCount = 0;

  for (const char of right) {
    const remaining = leftCounts.get(char) ?? 0;

    if (remaining <= 0) {
      continue;
    }

    commonCount += 1;
    leftCounts.set(char, remaining - 1);
  }

  return commonCount / longerLength;
}

function getRequiredTimestampScore(textLength: number): number {
  if (textLength <= 4) {
    return 0.55;
  }

  if (textLength <= 8) {
    return 0.5;
  }

  if (textLength <= 16) {
    return 0.44;
  }

  return 0.38;
}

function resolveSentenceIndexByTargetTextForward(args: {
  paragraphBlocks: ParagraphBlock[];
  targetText: string;
  startSentenceIndex: number;
}): number | null {
  const { paragraphBlocks, targetText, startSentenceIndex } = args;

  const targetCandidates = buildTimestampComparableCandidates(targetText);

  if (targetCandidates.length === 0) {
    return null;
  }

  const sentences = paragraphBlocks.flatMap((block) => block.segments);
  const startIndex = Math.max(0, startSentenceIndex);

  const searchRanges = [
    { start: startIndex, end: Math.min(sentences.length, startIndex + 8) },
    { start: startIndex, end: Math.min(sentences.length, startIndex + 18) },
    { start: startIndex, end: Math.min(sentences.length, startIndex + 32) },
  ];

  let bestSentenceIndex: number | null = null;
  let bestScore = 0;

  for (const range of searchRanges) {
    let rangeBestSentenceIndex: number | null = null;
    let rangeBestScore = 0;

    for (let index = range.start; index < range.end; index += 1) {
      const segment = sentences[index];
      const segmentCandidates = buildTimestampComparableCandidates(segment.text);

      if (segmentCandidates.length === 0) {
        continue;
      }

      for (const targetCandidate of targetCandidates) {
        for (const segmentCandidate of segmentCandidates) {
          const score = computeTimestampTextScore(
            targetCandidate,
            segmentCandidate
          );

          const targetLength = targetCandidate.length;
          const segmentLength = segmentCandidate.length;
          const lengthRatio =
            targetLength > 0 ? segmentLength / targetLength : 999;

          if (lengthRatio < 0.45 || lengthRatio > 1.9) {
            continue;
          }

          if (score > rangeBestScore) {
            rangeBestScore = score;
            rangeBestSentenceIndex = segment.index;
          }
        }
      }
    }

    if (
      rangeBestSentenceIndex !== null &&
      rangeBestScore >=
        getRequiredTimestampScore(
          Math.max(...targetCandidates.map((candidate) => candidate.length), 1)
        )
    ) {
      return rangeBestSentenceIndex;
    }

    if (rangeBestSentenceIndex !== null && rangeBestScore > bestScore) {
      bestScore = rangeBestScore;
      bestSentenceIndex = rangeBestSentenceIndex;
    }
  }

  return null;
}

function buildTimestampComparableCandidatesConservative(text: string): string[] {
  const baseText = text
    .replace(/｜([^《》\r\n]+)《([^《》\r\n]+)》/gu, "$1")
    .replace(/([一-龯々〆ヵヶ〓]+)《([^《》\r\n]+)》/gu, "$1");

  const readingText = text
    .replace(/｜([^《》\r\n]+)《([^《》\r\n]+)》/gu, "$2")
    .replace(/([一-龯々〆ヵヶ〓]+)《([^《》\r\n]+)》/gu, "$2");

  return Array.from(
    new Set(
      [text, baseText, readingText]
        .map((value) =>
          value
            .replace(/\s+/gu, "")
            .replace(/[「」『』（）()［］【】]/gu, "")
            .trim()
        )
        .filter((value) => value.length > 0)
    )
  );
}

function computeTimestampMatchScoreConservative(
  left: string,
  right: string
): number {
  if (!left || !right) {
    return 0;
  }

  if (left === right) {
    return 1;
  }

  const shorterLength = Math.min(left.length, right.length);
  const longerLength = Math.max(left.length, right.length);

  if (left.includes(right) || right.includes(left)) {
    return shorterLength / longerLength;
  }

  const leftCounts = new Map<string, number>();

  for (const char of left) {
    leftCounts.set(char, (leftCounts.get(char) ?? 0) + 1);
  }

  let commonCount = 0;

  for (const char of right) {
    const remaining = leftCounts.get(char) ?? 0;

    if (remaining <= 0) {
      continue;
    }

    commonCount += 1;
    leftCounts.set(char, remaining - 1);
  }

  return commonCount / longerLength;
}

function resolveSentenceIndexByTargetTextForwardConservative(args: {
  paragraphBlocks: ParagraphBlock[];
  targetText: string;
  startSentenceIndex: number;
}): number | null {
  const { paragraphBlocks, targetText, startSentenceIndex } = args;

  const targetCandidates =
    buildTimestampComparableCandidatesConservative(targetText);

  if (targetCandidates.length === 0) {
    return null;
  }

  const segments = paragraphBlocks.flatMap((block) => block.segments);
  const startIndex = Math.max(0, startSentenceIndex);
  const endIndex = Math.min(segments.length, startIndex + 18);

  let bestSentenceIndex: number | null = null;
  let bestScore = 0;

  for (let index = startIndex; index < endIndex; index += 1) {
    const segment = segments[index];
    const segmentCandidates =
      buildTimestampComparableCandidatesConservative(segment.text);

    if (segmentCandidates.length === 0) {
      continue;
    }

    for (const targetCandidate of targetCandidates) {
      for (const segmentCandidate of segmentCandidates) {
        const score = computeTimestampMatchScoreConservative(
          targetCandidate,
          segmentCandidate
        );

        const targetLength = targetCandidate.length;
        const segmentLength = segmentCandidate.length;
        const lengthRatio =
          targetLength > 0 ? segmentLength / targetLength : 999;

        if (lengthRatio < 0.55 || lengthRatio > 1.7) {
          continue;
        }

        if (score > bestScore) {
          bestScore = score;
          bestSentenceIndex = segment.index;
        }
      }
    }
  }

  if (bestSentenceIndex === null) {
    return null;
  }

  return bestScore >= 0.56 ? bestSentenceIndex : null;
}

function isExplicitSentenceIndexStillPlausible(args: {
  paragraphBlocks: ParagraphBlock[];
  sentenceIndex: number;
  targetText: string;
}): boolean {
  const { paragraphBlocks, sentenceIndex, targetText } = args;

  const segments = paragraphBlocks.flatMap((block) => block.segments);
  const segment = segments.find((item) => item.index === sentenceIndex);

  if (!segment) {
    return false;
  }

  const targetCandidates =
    buildTimestampComparableCandidatesConservative(targetText);
  const segmentCandidates =
    buildTimestampComparableCandidatesConservative(segment.text);

  if (targetCandidates.length === 0 || segmentCandidates.length === 0) {
    return false;
  }

  let bestScore = 0;

  for (const targetCandidate of targetCandidates) {
    for (const segmentCandidate of segmentCandidates) {
      const score = computeTimestampMatchScoreConservative(
        targetCandidate,
        segmentCandidate
      );

      const targetLength = targetCandidate.length;
      const segmentLength = segmentCandidate.length;
      const lengthRatio =
        targetLength > 0 ? segmentLength / targetLength : 999;

      if (lengthRatio < 0.55 || lengthRatio > 1.7) {
        continue;
      }

      if (score > bestScore) {
        bestScore = score;
      }
    }
  }

  return bestScore >= 0.56;
}

export function buildSentenceTimestampRuntimeList(
  paragraphBlocks: ParagraphBlock[],
  sentenceTimestamps: EffectSentenceTimestamp[]
): SentenceTimestampRuntime[] {
  const ordered = [...sentenceTimestamps]
    .filter(
      (timestamp) =>
        Number.isFinite(timestamp.timeSeconds) && timestamp.timeSeconds >= 0
    )
    .sort((left, right) => {
      if (left.timeSeconds !== right.timeSeconds) {
        return left.timeSeconds - right.timeSeconds;
      }

      const leftSentenceIndex =
        typeof (left as { sentenceIndex?: unknown }).sentenceIndex === "number"
          ? ((left as { sentenceIndex?: number }).sentenceIndex ?? 0)
          : 0;

      const rightSentenceIndex =
        typeof (right as { sentenceIndex?: unknown }).sentenceIndex === "number"
          ? ((right as { sentenceIndex?: number }).sentenceIndex ?? 0)
          : 0;

      return leftSentenceIndex - rightSentenceIndex;
    });

  let searchStartSentenceIndex = 0;

  const next = ordered
    .map((timestamp) => {
      const explicitSentenceIndex = (timestamp as { sentenceIndex?: unknown })
        .sentenceIndex;

      let sentenceIndex: number | null = null;

      const canTrustExplicitSentenceIndex =
        typeof explicitSentenceIndex === "number" &&
        Number.isFinite(explicitSentenceIndex) &&
        explicitSentenceIndex >= searchStartSentenceIndex &&
        isExplicitSentenceIndexStillPlausible({
          paragraphBlocks,
          sentenceIndex: explicitSentenceIndex,
          targetText: timestamp.targetText,
        });

      if (canTrustExplicitSentenceIndex) {
        sentenceIndex = explicitSentenceIndex;
      } else {
        sentenceIndex = resolveSentenceIndexByTargetTextForwardConservative({
          paragraphBlocks,
          targetText: timestamp.targetText,
          startSentenceIndex: searchStartSentenceIndex,
        });
      }

      if (sentenceIndex === null) {
        return null;
      }

      searchStartSentenceIndex = sentenceIndex + 1;

      return {
        ...timestamp,
        sentenceIndex,
      };
    })
    .filter(
      (timestamp): timestamp is SentenceTimestampRuntime => timestamp !== null
    );

  return next.sort((left, right) => {
    if (left.timeSeconds !== right.timeSeconds) {
      return left.timeSeconds - right.timeSeconds;
    }

    return left.sentenceIndex - right.sentenceIndex;
  });
}

export function buildContentBlocks(
  paragraphBlocks: ParagraphBlock[],
  sceneBreaks: SceneBreakRuntime[]
): EffectContentBlock[] {
  const sceneBreakMap = new Map<number, SceneBreakRuntime[]>();

  for (const sceneBreak of sceneBreaks) {
    const current = sceneBreakMap.get(sceneBreak.sentenceIndex) ?? [];
    current.push(sceneBreak);
    sceneBreakMap.set(sceneBreak.sentenceIndex, current);
  }

  const contentBlocks: EffectContentBlock[] = [];

  for (const paragraphBlock of paragraphBlocks) {
    let chunk: SentenceSegment[] = [];
    let chunkIndex = 0;

    for (const segment of paragraphBlock.segments) {
      chunk.push(segment);

      const matchedSceneBreaks = sceneBreakMap.get(segment.index) ?? [];
      if (matchedSceneBreaks.length === 0) {
        continue;
      }

      contentBlocks.push({
        kind: "paragraph",
        key: `paragraph-${paragraphBlock.paragraphIndex}-${chunkIndex}`,
        paragraphIndex: paragraphBlock.paragraphIndex,
        sentences: chunk,
      });

      contentBlocks.push({
        kind: "scene_break",
        key: `scene-break-${paragraphBlock.paragraphIndex}-${segment.index}`,
        afterSentenceIndex: segment.index,
        illustrations: matchedSceneBreaks,
      });

      chunk = [];
      chunkIndex += 1;
    }

    if (chunk.length > 0) {
      contentBlocks.push({
        kind: "paragraph",
        key: `paragraph-${paragraphBlock.paragraphIndex}-${chunkIndex}`,
        paragraphIndex: paragraphBlock.paragraphIndex,
        sentences: chunk,
      });
    }
  }

  return contentBlocks;
}

export function resolveActiveSentenceIndex(args: {
  currentTime: number;
  duration: number;
  totalSentenceCount: number;
  sentenceTimestamps: SentenceTimestampRuntime[];
  disableEstimatedFallback?: boolean;
}): number {
  const {
    currentTime,
    duration,
    totalSentenceCount,
    sentenceTimestamps,
    disableEstimatedFallback = false,
  } = args;

  if (sentenceTimestamps.length > 0) {
    let activeSentenceIndex = -1;

    for (const sentenceTimestamp of sentenceTimestamps) {
      if (currentTime + 0.000001 >= sentenceTimestamp.timeSeconds) {
        activeSentenceIndex = sentenceTimestamp.sentenceIndex;
        continue;
      }

      break;
    }

    return activeSentenceIndex;
  }

  if (disableEstimatedFallback) {
    return -1;
  }

  if (totalSentenceCount <= 0) return -1;
  if (!Number.isFinite(duration) || duration <= 0) return -1;

  const rawRatio = currentTime / duration;
  const ratio = Math.min(Math.max(rawRatio, 0), 0.999999);

  return Math.min(
    totalSentenceCount - 1,
    Math.floor(ratio * totalSentenceCount)
  );
}