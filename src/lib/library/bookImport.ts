import { PRIVATE_LIBRARY_LIMITS } from "@/lib/library/privateLibrary";
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

function trimSplitPart(value: string): string {
  return value
    .replace(/^[\n\r\t ]+/u, "")
    .replace(/[\s\u3000]+$/u, "");
}

function collectNaturalSplitBoundaries(value: string): number[] {
  const boundaries = new Set<number>();

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === "\n") {
      while (value[index + 1] === "\n") index += 1;
      boundaries.add(index + 1);
      continue;
    }
    if (!SENTENCE_ENDINGS.has(character)) continue;
    if (
      (character === "." || character === "．") &&
      /[0-9０-９]/u.test(value[index - 1] ?? "") &&
      /[0-9０-９]/u.test(value[index + 1] ?? "")
    ) {
      continue;
    }

    let boundary = index + 1;
    while (boundary < value.length && SENTENCE_ENDINGS.has(value[boundary])) {
      boundary += 1;
    }
    while (boundary < value.length && SENTENCE_CLOSERS.has(value[boundary])) {
      boundary += 1;
    }
    boundaries.add(boundary);
    index = boundary - 1;
  }

  boundaries.add(value.length);
  return [...boundaries].sort((left, right) => left - right);
}

function splitSectionBody(body: string): string[] {
  const maxChars = PRIVATE_LIBRARY_LIMITS.maxChapterChars;
  if (body.length <= maxChars) return [body];

  const partCount = Math.ceil(body.length / maxChars);
  const boundaries = collectNaturalSplitBoundaries(body);
  const bodies: string[] = [];
  let previousBoundary = 0;

  for (let partIndex = 1; partIndex < partCount; partIndex += 1) {
    const remainingParts = partCount - partIndex;
    const target = Math.round((body.length * partIndex) / partCount);
    const minimumBoundary = Math.max(
      previousBoundary + 1,
      body.length - maxChars * remainingParts
    );
    const maximumBoundary = Math.min(
      previousBoundary + maxChars,
      body.length - remainingParts
    );
    const candidates = boundaries.filter(
      (boundary) =>
        boundary >= minimumBoundary &&
        boundary <= maximumBoundary &&
        boundary > previousBoundary &&
        boundary < body.length
    );
    const nextBoundary = candidates.reduce<number | null>((closest, boundary) => {
      if (closest === null) return boundary;
      return Math.abs(boundary - target) < Math.abs(closest - target)
        ? boundary
        : closest;
    }, null);

    if (nextBoundary === null) {
      throw new Error(
        `1文が${maxChars.toLocaleString("ja-JP")}文字を超えているため、文を切らずに対訳用分割できません。該当箇所へ句点または改行を追加してください。`
      );
    }

    const part = trimSplitPart(body.slice(previousBoundary, nextBoundary));
    if (part) bodies.push(part);
    previousBoundary = nextBoundary;
  }

  const finalPart = trimSplitPart(body.slice(previousBoundary));
  if (finalPart) bodies.push(finalPart);
  if (bodies.some((part) => part.length > maxChars)) {
    throw new Error(
      `本文を${maxChars.toLocaleString("ja-JP")}文字以内へ分割できませんでした。`
    );
  }
  return bodies;
}

function buildSplitUnitTitle(baseTitle: string, partNumber: number): string {
  const suffix = ` - ${partNumber}`;
  const availableLength = Math.max(1, 200 - suffix.length);
  return `${baseTitle.slice(0, availableLength).trimEnd()}${suffix}`;
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
        title: (title || `第${index + 1}話`).slice(0, 200),
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

  normalizedSections.forEach((section, sectionIndex) => {
    const bodies = splitSectionBody(section.body);
    const sectionNumber = sectionIndex + 1;
    const partCount = bodies.length;

    if (partCount === 0) return;

    sections.push({
      sectionNumber,
      title: section.title,
      sourceCharCount: bodies.reduce((total, body) => total + body.length, 0),
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
    (total, unit) => total + unit.body.length,
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
            `対訳原価を抑えるため、長い話は${PRIVATE_LIBRARY_LIMITS.maxChapterChars.toLocaleString("ja-JP")}文字以内になる最小分割数を求め、文末を保ったまま均等に「タイトル - 1」形式で分割します。`,
          ]
        : []),
    ],
  };
}
