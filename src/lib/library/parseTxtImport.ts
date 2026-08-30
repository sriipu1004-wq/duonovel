import {
  buildParsedBookImport,
  type ParsedBookImport,
  type ParsedBookSectionInput,
} from "@/lib/library/bookImport";
import { PRIVATE_LIBRARY_LIMITS } from "@/lib/library/privateLibrary";
import { normalizeImportedText } from "@/lib/library/importTextNormalization";

export { normalizeImportedText } from "@/lib/library/importTextNormalization";

export type ParsedTxtImport = ParsedBookImport;

const JAPANESE_CHAPTER_HEADING =
  /^(?:序章|終章|最終章|プロローグ|エピローグ|幕間|あとがき|まえがき|第?[0-9０-９一二三四五六七八九十百千万〇零]+(?:話|章|節|幕|編|部|回)(?:[\s　:：―—-].{0,60})?)$/u;
const ENGLISH_CHAPTER_HEADING =
  /^(?:(?:chapter|episode|part|book|section|prologue|epilogue|interlude)(?:\s+(?:[0-9０-９]+|[ivxlcdm]+))?(?:[\s:：―—-].{0,60})?)$/iu;
const FRENCH_CHAPTER_HEADING =
  /^(?:(?:chapitre|épisode|partie|livre|section|prologue|épilogue)(?:\s+(?:[0-9０-９]+|[ivxlcdm]+))?(?:[\s:：―—-].{0,60})?)$/iu;
const GERMAN_CHAPTER_HEADING =
  /^(?:(?:kapitel|episode|teil|buch|abschnitt|prolog|epilog)(?:\s+(?:[0-9０-９]+|[ivxlcdm]+))?(?:[\s:：―—-].{0,60})?)$/iu;
const SPANISH_CHAPTER_HEADING =
  /^(?:(?:capítulo|episodio|parte|libro|sección|prólogo|epílogo)(?:\s+(?:[0-9０-９]+|[ivxlcdm]+))?(?:[\s:：―—-].{0,60})?)$/iu;
const KOREAN_CHAPTER_HEADING =
  /^(?:(?:제\s*)?[0-9０-９일이삼사오육칠팔구십백천]+(?:화|장|부|절)|프롤로그|에필로그|막간)(?:[\s:：―—-].{0,60})?$/u;
const CHINESE_CHAPTER_HEADING =
  /^(?:序章|终章|終章|最终章|最終章|楔子|尾声|尾聲|第[0-9０-９一二三四五六七八九十百千万萬〇零两兩]+(?:章|话|話|回|卷|节|節|部)(?:[\s:：―—-].{0,60})?)$/u;

export function isChapterHeading(line: string): boolean {
  const normalized = line.trim();
  if (!normalized || normalized.length > 80) return false;
  return (
    JAPANESE_CHAPTER_HEADING.test(normalized) ||
    ENGLISH_CHAPTER_HEADING.test(normalized) ||
    FRENCH_CHAPTER_HEADING.test(normalized) ||
    GERMAN_CHAPTER_HEADING.test(normalized) ||
    SPANISH_CHAPTER_HEADING.test(normalized) ||
    KOREAN_CHAPTER_HEADING.test(normalized) ||
    CHINESE_CHAPTER_HEADING.test(normalized)
  );
}

export function detectTextSections(text: string): {
  sections: ParsedBookSectionInput[];
  usedDetectedHeadings: boolean;
} {
  // Vertical PDF generators sometimes place a chapter heading at the end of
  // the preceding visual column. Restore that heading boundary before the
  // ordinary line-based detector runs. This is also harmless for TXT/EPUB/DOCX.
  const textWithHeadingBoundaries = text.replace(
    /([^\n0-9０-９一二三四五六七八九十百千万〇零第])((?:第?[0-9０-９一二三四五六七八九十百千万〇零]+(?:話|章|節|幕|編|部|回)))(?=\n{2,})/gu,
    "$1\n\n$2"
  );
  const lines = textWithHeadingBoundaries.split("\n");
  const headingCount = lines.filter(isChapterHeading).length;

  if (headingCount < 2) {
    return {
      sections: [{ title: "本文", body: text }],
      usedDetectedHeadings: false,
    };
  }

  const sections: ParsedBookSectionInput[] = [];
  let currentTitle = "冒頭";
  let currentLines: string[] = [];

  function flush() {
    const body = currentLines.join("\n").trim();
    if (body) sections.push({ title: currentTitle.slice(0, 200), body });
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
  return { sections, usedDetectedHeadings: true };
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

  const detected = detectTextSections(normalized);
  return buildParsedBookImport(detected);
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
