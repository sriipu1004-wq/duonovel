import { PRIVATE_LIBRARY_LIMITS } from "@/lib/library/privateLibrary";
import { normalizeImportedText } from "@/lib/library/importTextNormalization";

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

function splitParagraphs(value: string): string[] {
  const paragraphs = value
    .split(/\n{2,}/u)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  if (paragraphs.length > 0) return paragraphs;
  return value.trim() ? [value.trim()] : [];
}

function splitOversizedParagraph(value: string, maxChars: number): string[] {
  const chunks: string[] = [];
  let remaining = value.trim();

  while (remaining.length > maxChars) {
    const window = remaining.slice(0, maxChars + 1);
    const boundaryCandidates = [
      window.lastIndexOf("。"),
      window.lastIndexOf("！"),
      window.lastIndexOf("？"),
      window.lastIndexOf("."),
      window.lastIndexOf("!"),
      window.lastIndexOf("?"),
      window.lastIndexOf("\n"),
    ];
    const bestBoundary = Math.max(...boundaryCandidates);
    const splitAt =
      bestBoundary >= Math.floor(maxChars * 0.55)
        ? bestBoundary + 1
        : maxChars;

    chunks.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }

  if (remaining) chunks.push(remaining);
  return chunks;
}

function splitSectionBody(body: string): string[] {
  const maxChars = PRIVATE_LIBRARY_LIMITS.maxChapterChars;
  const paragraphs = splitParagraphs(body).flatMap((paragraph) =>
    paragraph.length > maxChars
      ? splitOversizedParagraph(paragraph, maxChars)
      : [paragraph]
  );

  const bodies: string[] = [];
  let current = "";

  for (const paragraph of paragraphs) {
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;

    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }

    if (current) bodies.push(current);
    current = paragraph;
  }

  if (current) bodies.push(current);
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
        body: normalizeImportedText(section.body),
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
            `対訳原価を抑えるため、長い話は最大${PRIVATE_LIBRARY_LIMITS.maxChapterChars.toLocaleString("ja-JP")}文字ごとに「タイトル - 1」形式で分割します。`,
          ]
        : []),
    ],
  };
}
