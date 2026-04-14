import type { NemoPronunciationDictionary } from "@/lib/recording/nemoPronunciationDictionary";

export type NemoPreprocessOptions = {
  pronunciationDictionary?: NemoPronunciationDictionary;
};

export type NemoProcessedParagraph = {
  originalParagraph: string;
  spokenParagraph: string;
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function applyPronunciationDictionary(
  text: string,
  pronunciationDictionary: NemoPronunciationDictionary
): string {
  const entries = Object.entries(pronunciationDictionary)
    .filter(([source, target]) => source.trim().length > 0 && target.trim().length > 0)
    .sort((left, right) => right[0].length - left[0].length);

  let next = text;

  for (const [source, target] of entries) {
    next = next.replace(new RegExp(escapeRegExp(source), "g"), target);
  }

  return next;
}

function normalizeInlineWhitespace(text: string): string {
  return text
    .replace(/\t/g, " ")
    .replace(/\u3000/g, " ")
    .replace(/ {2,}/g, " ");
}

function normalizeLineBreakSurface(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
}

function replaceRubySurfaceWithReading(text: string): string {
  return text
    .replace(/｜[^《》\r\n]+《([^《》\r\n]+)》/gu, "$1")
    .replace(/([一-龠々〆ヵヶぁ-んァ-ヶーA-Za-z0-9]+)《([^《》\r\n]+)》/gu, "$2");
}

function shouldInsertClausePause(lastChar: string): boolean {
  return !/[、。！？!?…」』）】―—─]/u.test(lastChar);
}

function joinLinesWithinParagraph(lines: string[]): string {
  let result = "";

  for (const rawLine of lines) {
    const line = normalizeInlineWhitespace(rawLine).trim();

    if (!line) continue;

    if (!result) {
      result = line;
      continue;
    }

    const tail = result.charAt(result.length - 1);
    result += shouldInsertClausePause(tail) ? `、${line}` : line;
  }

  return result.trim();
}

function normalizePauseExpressionSurface(text: string): string {
  return text
    .replace(/\.{3,}/g, "……")
    .replace(/[⋯]{2,}/gu, "……")
    .replace(/…{3,}/gu, "……")
    .replace(/[―—─]{2,}/gu, "――")
    .replace(/([」』）】])(?=[^\s、。！？!?…」』）】])/gu, "$1、");
}

export function preprocessNemoBodyToParagraphs(
  body: string,
  options: NemoPreprocessOptions = {}
): NemoProcessedParagraph[] {
  const normalized = normalizeLineBreakSurface(body).trim();

  if (!normalized) {
    return [];
  }

  const rawParagraphs = normalized.split(/\n{2,}/);

  return rawParagraphs
    .map((paragraph) => joinLinesWithinParagraph(paragraph.split("\n")))
    .map((originalParagraph) => {
      const rubyResolvedParagraph =
        replaceRubySurfaceWithReading(originalParagraph);

      const dictionaryApplied = applyPronunciationDictionary(
        rubyResolvedParagraph,
        options.pronunciationDictionary ?? {}
      );

      const spokenParagraph = normalizePauseExpressionSurface(dictionaryApplied);

      return {
        originalParagraph: originalParagraph.trim(),
        spokenParagraph: spokenParagraph.trim(),
      };
    })
    .filter(
      (paragraph) =>
        paragraph.originalParagraph.length > 0 &&
        paragraph.spokenParagraph.length > 0
    );
}

export function preprocessNemoBody(
  body: string,
  options: NemoPreprocessOptions = {}
): string[] {
  return preprocessNemoBodyToParagraphs(body, options).map(
    (paragraph) => paragraph.spokenParagraph
  );
}