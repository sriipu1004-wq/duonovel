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

// Private-use characters used as sentence-boundary markers while converting
// a whole paragraph (see convertNemoSentencesToSpoken).
const BOUNDARY_MARKER_BASE = 0xe000;
const BOUNDARY_MARKER_LIMIT = 0xf8ff;
const BOUNDARY_MARKER_CLASS = "[\uE000-\uF8FF]";
const BOUNDARY_MARKER_PATTERN = /[\uE000-\uF8FF]/u;

function buildDictionarySourcePattern(source: string, allowBoundaryMarkers: boolean): RegExp {
  if (!allowBoundaryMarkers) {
    return new RegExp(escapeRegExp(source), "g");
  }

  // A dictionary entry may span a sentence boundary: allow a marker between
  // any two characters. The marker is consumed, so the two sentences merge.
  return new RegExp(
    Array.from(source).map(escapeRegExp).join(`${BOUNDARY_MARKER_CLASS}?`),
    "gu"
  );
}

function applyPronunciationDictionary(
  text: string,
  pronunciationDictionary: NemoPronunciationDictionary,
  allowBoundaryMarkers = false
): string {
  const entries = Object.entries(pronunciationDictionary)
    .filter(([source, target]) => source.trim().length > 0 && target.trim().length > 0)
    .sort((left, right) => right[0].length - left[0].length);

  let next = text;

  for (const [source, target] of entries) {
    next = next.replace(buildDictionarySourcePattern(source, allowBoundaryMarkers), target);
  }

  return next;
}

function normalizeClassicalJapanese(text: string): string {
  let t = text;

  // ===== 記号（Aivis対策）=====
  t = t
    .replace(/[―—─]{2,}/gu, "、") // 「――」を読ませない
    .replace(/\.{3,}/g, "……")
    .replace(/[⋯]{2,}/gu, "……")
    .replace(/…{3,}/gu, "……");

  // ===== 安全な旧仮名変換 =====
  const SAFE_REPLACEMENTS: [RegExp, string][] = [
    [/云ふ/g, "いう"],
    [/言ふ/g, "いう"],
    [/云つた/g, "いった"],
    [/言つた/g, "いった"],
    [/云はれ/g, "いわれ"],
    [/言はれ/g, "いわれ"],

    [/思ふ/g, "おもう"],
    [/思つた/g, "おもった"],
    [/思はれ/g, "おもわれ"],

    [/違ふ/g, "ちがう"],
    [/違つた/g, "ちがった"],

    [/行つた/g, "いった"],

    [/云々/g, "うんぬん"],

    [/大分/g, "だいぶ"],
    [/可成/g, "かなり"],

    [/此の/g, "この"],
    [/其の/g, "その"],
    [/彼の/g, "あの"],

    [/何故/g, "なぜ"],
    [/兎に角/g, "とにかく"],
    [/矢張/g, "やはり"],
    [/成程/g, "なるほど"],
  ];

  for (const [pattern, value] of SAFE_REPLACEMENTS) {
    t = t.replace(pattern, value);
  }

  // ===== 文脈依存（単独語のみ）=====
  t = t
    // 者 → もの（単独のみ）
    .replace(/(^|[^\p{Script=Han}])者(?!\p{Script=Han})/gu, "$1もの")

    // 事 → こと（単独のみ）
    .replace(/(^|[^\p{Script=Han}])事(?!\p{Script=Han})/gu, "$1こと");

  return t;
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
    .replace(/｜([^《》\r\n]+)《([^《》\r\n]+)》/gu, "$2")
    .replace(/([一-龯々〆ヵヶ〓]+)《([^《》\r\n]+)》/gu, "$2");
}

function shouldInsertClausePause(lastChar: string): boolean {
  return !/[、。！？!?…」』）】―—─]/u.test(lastChar);
}

function countScriptMatches(text: string, pattern: RegExp): number {
  return Array.from(text.matchAll(pattern)).length;
}

function shouldUseSpaceForWrappedLines(lines: string[]): boolean {
  const sample = lines.join("");
  const hangulCount = countScriptMatches(sample, /\p{Script=Hangul}/gu);
  if (hangulCount > 0) return true;

  const latinCount = countScriptMatches(sample, /\p{Script=Latin}/gu);
  const japaneseCount =
    countScriptMatches(sample, /\p{Script=Hiragana}/gu) +
    countScriptMatches(sample, /\p{Script=Katakana}/gu) +
    countScriptMatches(sample, /\p{Script=Han}/gu);

  return latinCount > japaneseCount;
}

function shouldSuppressSoftWrapSpace(tail: string, head: string): boolean {
  if (!tail || !head) return true;
  if (/[-‐‑‒–—―]$/u.test(tail)) return true;
  if (/^[,.;:!?，。！？；："'”’」』）】］»]/u.test(head)) return true;
  return false;
}

function joinLinesWithinParagraph(lines: string[]): string {
  let result = "";
  const useSpaceForWrappedLines = shouldUseSpaceForWrappedLines(lines);

  for (const rawLine of lines) {
    const line = normalizeInlineWhitespace(rawLine).trim();

    if (!line) continue;

    if (!result) {
      result = line;
      continue;
    }

    const tail = result.charAt(result.length - 1);

    if (useSpaceForWrappedLines) {
      const head = line.charAt(0);
      const separator = shouldSuppressSoftWrapSpace(tail, head) ? "" : " ";
      result += `${separator}${line}`;
      continue;
    }

    result += shouldInsertClausePause(tail) ? `、${line}` : line;
  }

  return result.trim();
}

function normalizePauseExpressionSurface(
  text: string,
  allowBoundaryMarkers = false
): string {
  const replaced = text
    .replace(/\.{3,}/g, "……")
    .replace(/[⋯]{2,}/gu, "……")
    .replace(/…{3,}/gu, "……")
    .replace(/[―—─]{2,}/gu, "――");

  // A sentence boundary after 」 already gives a pause; do not add 、 there.
  return allowBoundaryMarkers
    ? replaced.replace(/([」』）】])(?=[^\s、。！？!?…」』）】\uE000-\uF8FF])/gu, "$1、")
    : replaced.replace(/([」』）】])(?=[^\s、。！？!?…」』）】])/gu, "$1、");
}

function convertToSpoken(
  text: string,
  options: NemoPreprocessOptions,
  allowBoundaryMarkers: boolean
): string {
  const rubyResolved = replaceRubySurfaceWithReading(text);

  const dictionaryApplied = applyPronunciationDictionary(
    rubyResolved,
    options.pronunciationDictionary ?? {},
    allowBoundaryMarkers
  );

  const normalizedClassical = normalizeClassicalJapanese(dictionaryApplied);

  return normalizePauseExpressionSurface(normalizedClassical, allowBoundaryMarkers);
}

/**
 * Converts one piece of already line-joined original text (a paragraph) into
 * the text sent to TTS: ruby -> reading, pronunciation dictionary, classical
 * kana, pause-expression surface.
 */
export function convertNemoTextToSpoken(
  text: string,
  options: NemoPreprocessOptions = {}
): string {
  return convertToSpoken(text, options, false).trim();
}

export type NemoSpokenSentenceGroup = {
  /** Original sentences joined (more than one only when a ruby or dictionary entry spans them). */
  originalText: string;
  /** Number of original sentences in this group (1 unless merged). */
  originalSentenceCount: number;
  spokenText: string;
};

/**
 * KD-9: converts the original sentences of one paragraph to spoken text,
 * keeping a 1:1 original/spoken pairing. The whole paragraph is converted at
 * once with a private-use marker between sentences, so ruby and dictionary
 * entries that span a sentence boundary still apply; where such an entry
 * consumes a marker, the neighbouring original sentences are merged into one
 * group instead of being duplicated or misaligned.
 */
export function convertNemoSentencesToSpoken(
  sentences: string[],
  options: NemoPreprocessOptions = {}
): NemoSpokenSentenceGroup[] {
  const markerCount = sentences.length - 1;
  const canUseMarkers =
    markerCount <= BOUNDARY_MARKER_LIMIT - BOUNDARY_MARKER_BASE + 1 &&
    sentences.every((sentence) => !BOUNDARY_MARKER_PATTERN.test(sentence));

  if (!canUseMarkers) {
    return sentences.map((sentence) => ({
      originalText: sentence,
      originalSentenceCount: 1,
      spokenText: convertToSpoken(sentence, options, false).trim(),
    }));
  }

  const joined = sentences
    .map((sentence, index) =>
      index === 0 ? sentence : `${String.fromCharCode(BOUNDARY_MARKER_BASE + index - 1)}${sentence}`
    )
    .join("");
  const spoken = convertToSpoken(joined, options, true);

  const groups: NemoSpokenSentenceGroup[] = [];
  let currentSpoken = "";
  let groupStart = 0;

  const flush = (endExclusive: number) => {
    groups.push({
      originalText: sentences.slice(groupStart, endExclusive).join(""),
      originalSentenceCount: endExclusive - groupStart,
      spokenText: currentSpoken.trim(),
    });
  };

  for (const character of spoken) {
    const code = character.charCodeAt(0);
    if (code >= BOUNDARY_MARKER_BASE && code <= BOUNDARY_MARKER_LIMIT) {
      const nextSentenceIndex = code - BOUNDARY_MARKER_BASE + 1;
      flush(nextSentenceIndex);
      currentSpoken = "";
      groupStart = nextSentenceIndex;
      continue;
    }
    currentSpoken += character;
  }
  flush(sentences.length);

  return groups;
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
    .map((originalParagraph) => ({
      originalParagraph: originalParagraph.trim(),
      spokenParagraph: convertNemoTextToSpoken(originalParagraph, options),
    }))
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