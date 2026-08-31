import {
  PRIVATE_LIBRARY_LIMITS,
  countUnicodeCharacters,
} from "@/lib/library/privateLibrary";
import {
  normalizeImportedBodyText,
  normalizeImportedText,
} from "@/lib/library/importTextNormalization";

export type ParsedBookSectionInput = {
  title: string;
  body: string;
};

export type ParsedBookSectionSummary = {
  sectionNumber: number;
  title: string;
  sourceCharCount: number;
  partCount: number;
};

export type ParsedBookUnit = {
  title: string;
  body: string;
  sectionNumber: number;
  sectionTitle: string;
  partNumber: number;
  partCount: number;
};

export type ParsedBookImport = {
  sections: ParsedBookSectionSummary[];
  units: ParsedBookUnit[];
  sourceCharCount: number;
  usedDetectedHeadings: boolean;
  warnings: string[];
};

const SENTENCE_ENDINGS = new Set(["。", "！", "？", "!", "?", ".", "．"]);
const SENTENCE_CLOSERS = new Set(["」", "』", "）", "】", "〉", "》", "”", '"']);
const SECONDARY_SPLIT_ENDINGS = new Set([
  "、",
  ",",
  "，",
  ";",
  "；",
  ":",
  "：",
  "…",
  "―",
  "—",
  ...SENTENCE_CLOSERS,
]);

type SplitBoundaryKind = "sentence" | "separator" | "whitespace" | "hard";

type SplitBoundary = {
  utf16Index: number;
  characterCount: number;
  kind: SplitBoundaryKind;
};

type SplitSectionResult = {
  bodies: string[];
  usedSeparatorFallback: boolean;
  usedHardFallback: boolean;
};

function trimSplitPart(value: string): string {
  return value
    .replace(/^[\n\r\t ]+/u, "")
    .replace(/[\s\u3000]+$/u, "");
}

function truncateUnicode(value: string, maxCharacters: number): string {
  return [...value].slice(0, maxCharacters).join("");
}

function codePointAt(value: string, utf16Index: number): string {
  const point = value.codePointAt(utf16Index);
  return point === undefined ? "" : String.fromCodePoint(point);
}

function isDecimalPoint(value: string, utf16Index: number, character: string): boolean {
  if (character !== "." && character !== "．") return false;
  const previous = utf16Index > 0 ? codePointAt(value, utf16Index - 1) : "";
  const next = codePointAt(value, utf16Index + character.length);
  return /[0-9０-９]/u.test(previous) && /[0-9０-９]/u.test(next);
}

function chooseCloserBoundary(
  current: SplitBoundary | null,
  candidate: SplitBoundary,
  target: number
): SplitBoundary {
  if (!current) return candidate;
  const currentDistance = Math.abs(current.characterCount - target);
  const candidateDistance = Math.abs(candidate.characterCount - target);
  if (candidateDistance !== currentDistance) {
    return candidateDistance < currentDistance ? candidate : current;
  }
  return candidate.characterCount > current.characterCount ? candidate : current;
}

/**
 * Find a balanced split without assuming that imported layout text still has
 * reliable sentence punctuation. The returned index is always between Unicode
 * code points, so an emoji or another surrogate pair is never corrupted.
 */
function findBalancedSplitBoundary(args: {
  body: string;
  startUtf16Index: number;
  remainingCharacterCount: number;
  remainingPartCount: number;
}): SplitBoundary {
  const maxChars = PRIVATE_LIBRARY_LIMITS.maxChapterChars;
  const futurePartCount = args.remainingPartCount - 1;
  const target = Math.round(
    args.remainingCharacterCount / args.remainingPartCount
  );
  const minimum = Math.max(
    1,
    args.remainingCharacterCount - maxChars * futurePartCount
  );
  const maximum = Math.min(
    maxChars,
    args.remainingCharacterCount - futurePartCount
  );
  // Avoid the old 6,000 + 300 style result. Natural punctuation is preferred
  // only near the evenly divided target; otherwise a safer secondary boundary
  // or the exact Unicode boundary wins.
  const radius = Math.max(256, Math.floor(target * 0.2));
  const preferredMinimum = Math.max(minimum, target - radius);
  const preferredMaximum = Math.min(maximum, target + radius);
  let sentence: SplitBoundary | null = null;
  let separator: SplitBoundary | null = null;
  let whitespace: SplitBoundary | null = null;
  let hard: SplitBoundary | null = null;
  let characterCount = 0;
  let utf16Index = args.startUtf16Index;
  let sentenceEndingRun = false;

  while (
    utf16Index < args.body.length &&
    characterCount < preferredMaximum
  ) {
    const characterStart = utf16Index;
    const character = codePointAt(args.body, characterStart);
    if (!character) break;
    utf16Index += character.length;
    characterCount += 1;

    if (characterCount === target) {
      hard = {
        utf16Index,
        characterCount,
        kind: "hard",
      };
    }
    if (
      characterCount < preferredMinimum ||
      characterCount > preferredMaximum
    ) {
      continue;
    }

    const nextCharacter = codePointAt(args.body, utf16Index);
    const isSentenceEnding =
      SENTENCE_ENDINGS.has(character) &&
      !isDecimalPoint(args.body, characterStart, character);

    if (character === "\n") {
      sentence = chooseCloserBoundary(
        sentence,
        { utf16Index, characterCount, kind: "sentence" },
        target
      );
      sentenceEndingRun = false;
      continue;
    }

    if (isSentenceEnding) {
      sentenceEndingRun = true;
      if (
        !SENTENCE_ENDINGS.has(nextCharacter) &&
        !SENTENCE_CLOSERS.has(nextCharacter)
      ) {
        sentence = chooseCloserBoundary(
          sentence,
          { utf16Index, characterCount, kind: "sentence" },
          target
        );
        sentenceEndingRun = false;
      }
      continue;
    }

    if (SENTENCE_CLOSERS.has(character) && sentenceEndingRun) {
      if (!SENTENCE_CLOSERS.has(nextCharacter)) {
        sentence = chooseCloserBoundary(
          sentence,
          { utf16Index, characterCount, kind: "sentence" },
          target
        );
        sentenceEndingRun = false;
      }
      continue;
    }

    sentenceEndingRun = false;
    if (SECONDARY_SPLIT_ENDINGS.has(character)) {
      separator = chooseCloserBoundary(
        separator,
        { utf16Index, characterCount, kind: "separator" },
        target
      );
      continue;
    }
    if (/\s/u.test(character)) {
      whitespace = chooseCloserBoundary(
        whitespace,
        { utf16Index, characterCount, kind: "whitespace" },
        target
      );
    }
  }

  if (sentence) return sentence;
  if (separator) return separator;
  if (whitespace) return whitespace;
  if (hard) return hard;

  // `target` is always inside the scanned range, but retain a defensive path
  // for malformed strings or a future limit change.
  let fallbackIndex = args.startUtf16Index;
  let fallbackCount = 0;
  while (fallbackIndex < args.body.length && fallbackCount < target) {
    const character = codePointAt(args.body, fallbackIndex);
    if (!character) break;
    fallbackIndex += character.length;
    fallbackCount += 1;
  }
  return {
    utf16Index: fallbackIndex,
    characterCount: fallbackCount,
    kind: "hard",
  };
}

function splitSectionBody(body: string): SplitSectionResult {
  const maxChars = PRIVATE_LIBRARY_LIMITS.maxChapterChars;
  const totalCharacterCount = countUnicodeCharacters(body);
  if (totalCharacterCount <= maxChars) {
    return {
      bodies: [body],
      usedSeparatorFallback: false,
      usedHardFallback: false,
    };
  }

  const partCount = Math.ceil(totalCharacterCount / maxChars);
  const bodies: string[] = [];
  let previousUtf16Boundary = 0;
  let remainingCharacterCount = totalCharacterCount;
  let remainingPartCount = partCount;
  let usedSeparatorFallback = false;
  let usedHardFallback = false;

  for (let partIndex = 1; partIndex < partCount; partIndex += 1) {
    const nextBoundary = findBalancedSplitBoundary({
      body,
      startUtf16Index: previousUtf16Boundary,
      remainingCharacterCount,
      remainingPartCount,
    });
    const part = trimSplitPart(
      body.slice(previousUtf16Boundary, nextBoundary.utf16Index)
    );
    if (part) bodies.push(part);
    previousUtf16Boundary = nextBoundary.utf16Index;
    remainingCharacterCount -= nextBoundary.characterCount;
    remainingPartCount -= 1;
    if (
      nextBoundary.kind === "separator" ||
      nextBoundary.kind === "whitespace"
    ) {
      usedSeparatorFallback = true;
    }
    if (nextBoundary.kind === "hard") usedHardFallback = true;
  }

  const finalPart = trimSplitPart(body.slice(previousUtf16Boundary));
  if (finalPart) bodies.push(finalPart);
  if (
    bodies.length !== partCount ||
    bodies.some((part) => countUnicodeCharacters(part) > maxChars)
  ) {
    throw new Error(
      `本文を${maxChars.toLocaleString("ja-JP")}文字以内へ分割できませんでした。`
    );
  }
  return { bodies, usedSeparatorFallback, usedHardFallback };
}

function buildSplitUnitTitle(baseTitle: string, partNumber: number): string {
  const suffix = ` - ${partNumber}`;
  const availableLength = Math.max(
    1,
    200 - countUnicodeCharacters(suffix)
  );
  return `${truncateUnicode(baseTitle, availableLength).trimEnd()}${suffix}`;
}

export function buildParsedBookImport(args: {
  sections: ParsedBookSectionInput[];
  usedDetectedHeadings: boolean;
  warnings?: string[];
}): ParsedBookImport {
  const normalizedSections = args.sections
    .map((section, index) => {
      const title = normalizeImportedText(section.title);
      return {
        title: truncateUnicode(title || `第${index + 1}話`, 200),
        body: normalizeImportedBodyText(section.body),
      };
    })
    .filter((section) => section.body.length > 0);

  if (normalizedSections.length === 0) {
    throw new Error("取り込める本文が見つかりませんでした。");
  }

  if (normalizedSections.length > PRIVATE_LIBRARY_LIMITS.maxSections) {
    throw new Error(
      `章・話数が${PRIVATE_LIBRARY_LIMITS.maxSections.toLocaleString("ja-JP")}件を超えています。`
    );
  }

  const sections: ParsedBookSectionSummary[] = [];
  const units: ParsedBookUnit[] = [];
  let usedSeparatorFallback = false;
  let usedHardFallback = false;

  normalizedSections.forEach((section, sectionIndex) => {
    const split = splitSectionBody(section.body);
    const bodies = split.bodies;
    usedSeparatorFallback ||= split.usedSeparatorFallback;
    usedHardFallback ||= split.usedHardFallback;
    const sectionNumber = sectionIndex + 1;
    const partCount = bodies.length;

    if (partCount === 0) return;

    sections.push({
      sectionNumber,
      title: section.title,
      sourceCharCount: bodies.reduce(
        (total, body) => total + countUnicodeCharacters(body),
        0
      ),
      partCount,
    });

    bodies.forEach((body, partIndex) => {
      const partNumber = partIndex + 1;
      units.push({
        title:
          partCount === 1
            ? section.title
            : buildSplitUnitTitle(section.title, partNumber),
        body,
        sectionNumber,
        sectionTitle: section.title,
        partNumber,
        partCount,
      });
    });
  });

  if (units.length > PRIVATE_LIBRARY_LIMITS.maxChapters) {
    throw new Error(
      `内部分割後の読書単位が${PRIVATE_LIBRARY_LIMITS.maxChapters.toLocaleString("ja-JP")}件を超えています。`
    );
  }

  const sourceCharCount = units.reduce(
    (total, unit) => total + countUnicodeCharacters(unit.body),
    0
  );

  if (sourceCharCount > PRIVATE_LIBRARY_LIMITS.maxSourceChars) {
    throw new Error(
      `本文は${PRIVATE_LIBRARY_LIMITS.maxSourceChars.toLocaleString("ja-JP")}文字以内にしてください。`
    );
  }

  return {
    sections,
    units,
    sourceCharCount,
    usedDetectedHeadings: args.usedDetectedHeadings,
    warnings: [
      ...(args.warnings ?? []),
      ...(sections.some((section) => section.partCount > 1)
        ? [
            `対訳原価を抑えるため、長い話は${PRIVATE_LIBRARY_LIMITS.maxChapterChars.toLocaleString("ja-JP")}文字以内になる最小分割数を求め、できる限り文末を保ちながら均等に「タイトル - 1」形式で分割します。`,
          ]
        : []),
      ...(usedSeparatorFallback
        ? [
            "句点のない長い区間は、読点・括弧・空白など本文を欠落させない位置で均等に分割しました。",
          ]
        : []),
      ...(usedHardFallback
        ? [
            "句読点や空白がない長い区間は、文字を削除せずUnicode文字境界で均等に分割しました。分割位置だけ取り込み前に確認してください。",
          ]
        : []),
    ],
  };
}
