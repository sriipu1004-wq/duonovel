import { PRIVATE_LIBRARY_LIMITS } from "@/lib/library/privateLibrary";

export type ParsedTxtChapter = {
  title: string;
  body: string;
};

export type ParsedTxtImport = {
  chapters: ParsedTxtChapter[];
  sourceCharCount: number;
  usedDetectedHeadings: boolean;
};

type DraftChapter = {
  title: string;
  body: string;
};

const JAPANESE_CHAPTER_HEADING = /^(?:序章|終章|最終章|プロローグ|エピローグ|幕間|あとがき|まえがき|第[0-9０-９一二三四五六七八九十百千万〇零]+(?:話|章|節|幕|編|部)(?:[\s　:：―—-].{0,60})?)$/u;
const LATIN_CHAPTER_HEADING = /^(?:(?:chapter|episode|part|book|section)\s+(?:[0-9０-９]+|[ivxlcdm]+)(?:[\s:：―—-].{0,60})?)$/iu;

function normalizeImportedText(value: string): string {
  return value
    .replace(/^\uFEFF/u, "")
    .replace(/\u0000/gu, "")
    .replace(/\r\n?/gu, "\n")
    .replace(/[\t\u00a0]+/gu, " ")
    .replace(/[ \u3000]+$/gmu, "")
    .replace(/\n{4,}/gu, "\n\n\n")
    .trim();
}

function isChapterHeading(line: string): boolean {
  const normalized = line.trim();
  if (!normalized || normalized.length > 80) return false;
  return (
    JAPANESE_CHAPTER_HEADING.test(normalized) ||
    LATIN_CHAPTER_HEADING.test(normalized)
  );
}

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
    const splitAt = bestBoundary >= Math.floor(maxChars * 0.55)
      ? bestBoundary + 1
      : maxChars;

    chunks.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }

  if (remaining) chunks.push(remaining);
  return chunks;
}

function chunkChapter(chapter: DraftChapter): ParsedTxtChapter[] {
  const maxChars = PRIVATE_LIBRARY_LIMITS.maxChapterChars;
  const paragraphs = splitParagraphs(chapter.body).flatMap((paragraph) =>
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

  if (bodies.length <= 1) {
    return bodies.map((body) => ({ title: chapter.title, body }));
  }

  return bodies.map((body, index) => ({
    title: `${chapter.title}（${index + 1}/${bodies.length}）`.slice(0, 200),
    body,
  }));
}

function detectDraftChapters(text: string): {
  chapters: DraftChapter[];
  usedDetectedHeadings: boolean;
} {
  const lines = text.split("\n");
  const headingCount = lines.filter(isChapterHeading).length;

  if (headingCount < 2) {
    return {
      chapters: [{ title: "本文", body: text }],
      usedDetectedHeadings: false,
    };
  }

  const chapters: DraftChapter[] = [];
  let currentTitle = "冒頭";
  let currentLines: string[] = [];

  function flush() {
    const body = currentLines.join("\n").trim();
    if (body) chapters.push({ title: currentTitle.slice(0, 200), body });
    currentLines = [];
  }

  for (const line of lines) {
    if (isChapterHeading(line)) {
      flush();
      currentTitle = line.trim();
    } else {
      currentLines.push(line);
    }
  }

  flush();

  return {
    chapters,
    usedDetectedHeadings: true,
  };
}

export function parseTxtImport(value: string): ParsedTxtImport {
  const normalized = normalizeImportedText(value);

  if (!normalized) {
    throw new Error("本文が空のTXTファイルです。");
  }

  if (normalized.length > PRIVATE_LIBRARY_LIMITS.maxSourceChars) {
    throw new Error(
      `TXTは${PRIVATE_LIBRARY_LIMITS.maxSourceChars.toLocaleString("ja-JP")}文字以内にしてください。`
    );
  }

  const detected = detectDraftChapters(normalized);
  const chapters = detected.chapters.flatMap(chunkChapter);

  if (chapters.length === 0) {
    throw new Error("取り込める本文が見つかりませんでした。");
  }

  if (chapters.length > PRIVATE_LIBRARY_LIMITS.maxChapters) {
    throw new Error(
      `分割後の話数が${PRIVATE_LIBRARY_LIMITS.maxChapters}話を超えています。TXTを複数ファイルに分けてください。`
    );
  }

  return {
    chapters,
    sourceCharCount: chapters.reduce(
      (total, chapter) => total + chapter.body.length,
      0
    ),
    usedDetectedHeadings: detected.usedDetectedHeadings,
  };
}

export function decodeTxtBuffer(buffer: ArrayBuffer): {
  text: string;
  encodingLabel: string;
} {
  const bytes = new Uint8Array(buffer);

  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return {
      text: new TextDecoder("utf-16le").decode(bytes),
      encodingLabel: "UTF-16 LE",
    };
  }

  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return {
      text: new TextDecoder("utf-16be").decode(bytes),
      encodingLabel: "UTF-16 BE",
    };
  }

  try {
    return {
      text: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
      encodingLabel: "UTF-8",
    };
  } catch {
    return {
      text: new TextDecoder("shift_jis").decode(bytes),
      encodingLabel: "Shift_JIS",
    };
  }
}
