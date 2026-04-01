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
  const normalizedTargetText = targetText.trim();
  if (!normalizedTargetText) return null;

  for (const block of paragraphBlocks) {
    for (const segment of block.segments) {
      if (segment.text.includes(normalizedTargetText)) {
        return segment.index;
      }
    }
  }

  return null;
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
  return illustrations
    .filter((illustration) => illustration.placement === "scene_break")
    .map((illustration) => {
      const sentenceIndex = resolveSentenceIndexByTargetText(
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

export function buildSentenceTimestampRuntimeList(
  paragraphBlocks: ParagraphBlock[],
  sentenceTimestamps: EffectSentenceTimestamp[]
): SentenceTimestampRuntime[] {
  return sentenceTimestamps
    .map((timestamp) => {
      const sentenceIndex = resolveSentenceIndexByTargetText(
        paragraphBlocks,
        timestamp.targetText
      );

      if (sentenceIndex === null) return null;

      return {
        ...timestamp,
        sentenceIndex,
      };
    })
    .filter(
      (timestamp): timestamp is SentenceTimestampRuntime => timestamp !== null
    )
    .sort((left, right) => {
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
}): number {
  const { currentTime, duration, totalSentenceCount, sentenceTimestamps } = args;

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

  if (totalSentenceCount <= 0) return -1;
  if (!Number.isFinite(duration) || duration <= 0) return -1;

  const rawRatio = currentTime / duration;
  const ratio = Math.min(Math.max(rawRatio, 0), 0.999999);

  return Math.min(
    totalSentenceCount - 1,
    Math.floor(ratio * totalSentenceCount)
  );
}