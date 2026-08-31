import { buildParsedBookImport, type ParsedBookImport } from "@/lib/library/bookImport";
import { normalizeImportedText } from "@/lib/library/importTextNormalization";
import { detectTextSections, isChapterHeading } from "@/lib/library/parseTxtImport";
import {
  PRIVATE_LIBRARY_LIMITS,
  countUnicodeCharacters,
} from "@/lib/library/privateLibrary";

export type ParsedPdfFile = {
  parsed: ParsedBookImport;
  suggestedTitle: string;
  suggestedAuthor: string;
  formatLabel: string;
};

type PdfTextItem = {
  str: string;
  dir?: string;
  transform?: number[];
  height?: number;
  fontName?: string;
  hasEOL?: boolean;
};

const PDF_STYLED_HEADING_MARKER = "\uE000";

function isPdfTextItem(value: unknown): value is PdfTextItem {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    typeof (value as { str?: unknown }).str === "string"
  );
}

function needsSpace(left: string, right: string): boolean {
  return /[A-Za-zÀ-ÖØ-öø-ÿ0-9]$/u.test(left) &&
    /^[A-Za-zÀ-ÖØ-öø-ÿ0-9]/u.test(right);
}

function horizontalPageText(items: PdfTextItem[]): string {
  const lines: string[] = [];
  let currentLine = "";
  let previousCoordinate: number | null = null;
  let previousDirection = "";

  const flush = () => {
    const normalized = currentLine.replace(/[\t ]+/gu, " ").trim();
    if (normalized) lines.push(normalized);
    currentLine = "";
  };

  for (const item of items) {
    if (!item.str) {
      if (item.hasEOL) flush();
      continue;
    }

    const direction = item.dir ?? "";
    const coordinate = Array.isArray(item.transform)
      ? Number(direction === "ttb" ? item.transform[4] : item.transform[5])
      : NaN;
    if (
      currentLine &&
      ((previousDirection && direction && previousDirection !== direction) ||
        (previousCoordinate !== null &&
          Number.isFinite(coordinate) &&
          Math.abs(coordinate - previousCoordinate) > 3))
    ) {
      flush();
    }

    if (currentLine && needsSpace(currentLine, item.str)) currentLine += " ";
    currentLine += item.str;

    if (item.hasEOL) flush();
    if (Number.isFinite(coordinate)) previousCoordinate = coordinate;
    previousDirection = direction;
  }

  flush();
  return lines.join("\n");
}

type VerticalColumn = {
  x: number;
  startY: number;
  fontSize: number;
  text: string;
};

function verticalPageText(items: PdfTextItem[]): string {
  const columns: VerticalColumn[] = [];

  for (const item of items) {
    if (item.dir !== "ttb" || !item.str.trim() || !item.transform) continue;
    const x = Number(item.transform[4]);
    const y = Number(item.transform[5]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const fontSize = Math.max(
      Number(item.height ?? 0),
      ...item.transform.slice(0, 4).map((value) => Math.abs(Number(value) || 0))
    );
    const previous = columns.at(-1);
    if (previous && Math.abs(previous.x - x) <= 2) {
      if (needsSpace(previous.text, item.str)) previous.text += " ";
      previous.text += item.str;
      continue;
    }
    columns.push({ x, startY: y, fontSize, text: item.str });
  }

  if (columns.length === 0) return "";
  const gaps = columns
    .slice(1)
    .map((column, index) => Math.abs(column.x - columns[index].x))
    .filter((gap) => gap > 3 && gap < 100)
    .sort((left, right) => left - right);
  const typicalGap = gaps.length > 0 ? gaps[Math.floor((gaps.length - 1) * 0.25)] : 24;
  const startYs = columns
    .map((column) => column.startY)
    .sort((left, right) => left - right);
  const normalStartY = startYs[Math.floor((startYs.length - 1) * 0.75)];
  const fontSizes = columns
    .map((column) => column.fontSize)
    .filter((size) => Number.isFinite(size) && size > 0)
    .sort((left, right) => left - right);
  const typicalFontSize = fontSizes.length > 0
    ? fontSizes[Math.floor(fontSizes.length / 2)]
    : 14;
  const indentThreshold = Math.max(6, typicalFontSize * 0.45);

  const paragraphs: string[] = [];
  let paragraph = columns[0].text;
  for (let index = 1; index < columns.length; index += 1) {
    const previous = columns[index - 1];
    const current = columns[index];
    const gap = Math.abs(current.x - previous.x);
    const beginsIndentedParagraph = current.startY < normalStartY - indentThreshold;
    const hasParagraphGap = gap > Math.max(10, typicalGap * 1.45);

    if (beginsIndentedParagraph || hasParagraphGap) {
      const normalized = paragraph.replace(/[\t ]+/gu, " ").trim();
      if (normalized) paragraphs.push(normalized);
      paragraph = current.text;
    } else {
      if (needsSpace(paragraph, current.text)) paragraph += " ";
      paragraph += current.text;
    }
  }
  const normalized = paragraph.replace(/[\t ]+/gu, " ").trim();
  if (normalized) paragraphs.push(normalized);
  return paragraphs.join("\n\n");
}

function pageTextFromItems(items: unknown[]): string {
  const textItems = items.filter(isPdfTextItem);
  const visibleItems = textItems.filter((item) => item.str.trim());
  const verticalCount = visibleItems.filter((item) => item.dir === "ttb").length;
  return verticalCount > visibleItems.length * 0.55
    ? verticalPageText(textItems)
    : horizontalPageText(textItems);
}

function pdfItemFontSize(item: PdfTextItem): number {
  if (!Array.isArray(item.transform)) return 0;
  return Math.max(
    0,
    ...item.transform.slice(0, 4).map((value) => Math.abs(Number(value) || 0))
  );
}

/** Detect a visually isolated heading at the start of a vertical PDF page. */
export function detectProminentPdfPageHeading(items: unknown[]): string {
  const verticalItems = items
    .filter(isPdfTextItem)
    .filter(
      (item) =>
        item.dir === "ttb" &&
        Boolean(item.str.trim()) &&
        Array.isArray(item.transform) &&
        Number.isFinite(Number(item.transform[4]))
    );
  if (verticalItems.length < 2) return "";

  const first = verticalItems[0];
  const firstX = Number(first.transform?.[4]);
  const rightmostX = Math.max(
    ...verticalItems.map((item) => Number(item.transform?.[4]))
  );
  if (firstX < rightmostX - 3) return "";

  const nextColumn = verticalItems.find(
    (item) => Math.abs(Number(item.transform?.[4]) - firstX) > 2
  );
  if (!nextColumn) return "";

  const columnXs: number[] = [];
  for (const item of verticalItems) {
    const x = Number(item.transform?.[4]);
    if (columnXs.every((knownX) => Math.abs(knownX - x) > 2)) {
      columnXs.push(x);
    }
  }
  const ordinaryGaps = columnXs
    .slice(1)
    .map((x, index) => Math.abs(x - columnXs[index]))
    .filter((gap) => gap > 3 && gap < 80)
    .sort((left, right) => left - right);
  const typicalGap = ordinaryGaps.length > 0
    ? ordinaryGaps[Math.floor(ordinaryGaps.length / 2)]
    : 24;
  const firstGap = Math.abs(Number(nextColumn.transform?.[4]) - firstX);
  const visuallyDistinct =
    Boolean(
      first.fontName &&
      nextColumn.fontName &&
      first.fontName !== nextColumn.fontName
    ) || pdfItemFontSize(first) > pdfItemFontSize(nextColumn) * 1.15;

  if (!visuallyDistinct || firstGap < Math.max(48, typicalGap * 2.2)) {
    return "";
  }

  const heading = normalizeImportedText(first.str);
  if (
    !heading ||
    countUnicodeCharacters(heading) > 80 ||
    /[。！？!?]$/u.test(heading)
  ) {
    return "";
  }
  return heading;
}

function stripRepeatedMargins(pages: string[]): string[] {
  const firstLineCounts = new Map<string, number>();
  const lastLineCounts = new Map<string, number>();
  const firstPageNumberOffsets = new Map<number, number>();
  const lastPageNumberOffsets = new Map<number, number>();

  const pageNumberValue = (line: string): number | null => {
    const match = line.match(/^[-–—]?\s*([0-9０-９]+)\s*[-–—]?$/u);
    if (!match?.[1]) return null;
    const parsed = Number(
      match[1].replace(/[０-９]/gu, (character) =>
        String(character.codePointAt(0)! - 0xff10)
      )
    );
    return Number.isSafeInteger(parsed) ? parsed : null;
  };

  pages.forEach((page, pageIndex) => {
    const lines = page.split("\n").map((line) => line.trim()).filter(Boolean);
    const first = lines[0] ?? "";
    const last = lines.at(-1) ?? "";
    if (first) firstLineCounts.set(first, (firstLineCounts.get(first) ?? 0) + 1);
    if (last) lastLineCounts.set(last, (lastLineCounts.get(last) ?? 0) + 1);
    const firstPageNumber = pageNumberValue(first);
    const lastPageNumber = pageNumberValue(last);
    if (firstPageNumber !== null) {
      const offset = firstPageNumber - (pageIndex + 1);
      firstPageNumberOffsets.set(offset, (firstPageNumberOffsets.get(offset) ?? 0) + 1);
    }
    if (lastPageNumber !== null) {
      const offset = lastPageNumber - (pageIndex + 1);
      lastPageNumberOffsets.set(offset, (lastPageNumberOffsets.get(offset) ?? 0) + 1);
    }
  });

  const repeatThreshold = Math.max(3, Math.ceil(pages.length * 0.55));
  const dominantSequentialOffset = (offsets: Map<number, number>): number | null => {
    let selected: number | null = null;
    let selectedCount = 0;
    for (const [offset, count] of offsets) {
      if (count > selectedCount) {
        selected = offset;
        selectedCount = count;
      }
    }
    return selectedCount >= repeatThreshold ? selected : null;
  };
  const firstSequentialOffset = dominantSequentialOffset(firstPageNumberOffsets);
  const lastSequentialOffset = dominantSequentialOffset(lastPageNumberOffsets);

  return pages.map((page, pageIndex) => {
    const lines = page.split("\n");
    const firstIndex = lines.findIndex((line) => Boolean(line.trim()));
    const lastIndex = lines.findLastIndex((line) => Boolean(line.trim()));
    const first = firstIndex >= 0 ? lines[firstIndex].trim() : "";
    const last = lastIndex >= 0 ? lines[lastIndex].trim() : "";
    if (
      first &&
      ((firstLineCounts.get(first) ?? 0) >= repeatThreshold ||
        (firstSequentialOffset !== null &&
          pageNumberValue(first) === pageIndex + 1 + firstSequentialOffset))
    ) {
      lines.splice(firstIndex, 1);
    }
    const updatedLastIndex = lines.findLastIndex((line) => Boolean(line.trim()));
    const updatedLast = updatedLastIndex >= 0 ? lines[updatedLastIndex].trim() : "";
    if (
      updatedLast &&
      ((lastLineCounts.get(last) ?? 0) >= repeatThreshold ||
        (lastSequentialOffset !== null &&
          pageNumberValue(updatedLast) === pageIndex + 1 + lastSequentialOffset))
    ) {
      lines.splice(updatedLastIndex, 1);
    }
    return lines.join("\n").replace(/^\s+|\s+$/gu, "").replace(/\n{3,}/gu, "\n\n");
  });
}

function joinPdfPages(pages: string[]): string {
  let result = "";
  for (const page of pages) {
    const next = page.trim();
    if (!next) continue;
    if (!result) {
      result = next;
      continue;
    }
    const nextFirstLine = next.split("\n").find((line) => Boolean(line.trim())) ?? "";
    if (
      isChapterHeading(nextFirstLine) ||
      nextFirstLine.startsWith(PDF_STYLED_HEADING_MARKER)
    ) {
      result += `\n\n${next}`;
      continue;
    }
    const previousEndsParagraph = /[。！？!?」』）】〉》…]$/u.test(result);
    result += previousEndsParagraph
      ? `\n\n${next}`
      : `${needsSpace(result, next) ? " " : ""}${next}`;
  }
  return result;
}

function detectPdfTextSections(text: string): ReturnType<typeof detectTextSections> {
  const lines = text.split("\n");
  const styledHeadingCount = lines.filter((line) =>
    line.trimStart().startsWith(PDF_STYLED_HEADING_MARKER)
  ).length;
  const cleanText = text.replaceAll(PDF_STYLED_HEADING_MARKER, "");
  if (styledHeadingCount < 2) return detectTextSections(cleanText);

  const sections: Array<{ title: string; body: string }> = [];
  let currentTitle = "冒頭";
  let currentLines: string[] = [];
  const flush = () => {
    const body = currentLines.join("\n").trim();
    if (body) sections.push({ title: currentTitle.slice(0, 200), body });
    currentLines = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    const isStyledHeading = trimmed.startsWith(PDF_STYLED_HEADING_MARKER);
    if (isStyledHeading || isChapterHeading(trimmed)) {
      flush();
      currentTitle = normalizeImportedText(
        isStyledHeading
          ? trimmed.slice(PDF_STYLED_HEADING_MARKER.length)
          : trimmed
      );
      continue;
    }
    currentLines.push(line.replaceAll(PDF_STYLED_HEADING_MARKER, ""));
  }
  flush();

  return sections.length >= 2
    ? { sections, usedDetectedHeadings: true }
    : detectTextSections(cleanText);
}

function labeledPdfMetadataValue(text: string, label: string): string {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const match = text.match(
    new RegExp(`(?:【|︻)${escapedLabel}(?:】|︼)\\s*([^\\n]+)`, "u")
  );
  return match?.[1]?.trim() ?? "";
}

export async function parsePdfImport(
  buffer: ArrayBuffer,
  fileName: string
): Promise<ParsedPdfFile> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdfAssetBaseUrl =
    typeof window === "undefined"
      ? "./node_modules/pdfjs-dist"
      : new URL("/api/pdf-assets", window.location.origin).toString();
  if (typeof window !== "undefined") {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
      import.meta.url
    ).toString();
  }
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    cMapUrl: `${pdfAssetBaseUrl}/cmaps/`,
    cMapPacked: true,
    isEvalSupported: false,
    standardFontDataUrl: `${pdfAssetBaseUrl}/standard_fonts/`,
    useWorkerFetch: false,
  });
  const document = await loadingTask.promise;

  try {
    if (document.numPages < 1 || document.numPages > 5_000) {
      throw new Error("PDFは5,000ページ以内にしてください。");
    }

    const pages: string[] = [];
    const pageHeadings: string[] = [];
    let extractedChars = 0;

    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = pageTextFromItems(content.items);
      pages.push(text);
      pageHeadings.push(detectProminentPdfPageHeading(content.items));
      extractedChars += countUnicodeCharacters(text);

      if (extractedChars > PRIVATE_LIBRARY_LIMITS.maxSourceChars * 1.2) {
        throw new Error(
          `PDF本文は${PRIVATE_LIBRARY_LIMITS.maxSourceChars.toLocaleString("ja-JP")}文字以内にしてください。`
        );
      }
    }

    if (extractedChars < Math.max(100, document.numPages * 10)) {
      throw new Error(
        "文字本文を取得できませんでした。画像だけのスキャンPDFとOCRには現在対応していません。"
      );
    }

    const pagesWithoutMargins = stripRepeatedMargins(pages);
    const rawMetadataText = pagesWithoutMargins.slice(0, 8).join("\n");
    // Normalize vertical punctuation before joining pages. Otherwise a page that
    // ends in `﹂` is mistaken for an unfinished sentence and the next page's
    // narration is appended directly after the closing quote.
    const normalizedPages = pagesWithoutMargins.map((page, pageIndex) => {
      const normalizedPage = normalizeImportedText(page);
      const heading = normalizeImportedText(pageHeadings[pageIndex] ?? "");
      return heading && normalizedPage.startsWith(heading)
        ? `${PDF_STYLED_HEADING_MARKER}${normalizedPage}`
        : normalizedPage;
    });
    const normalized = normalizeImportedText(joinPdfPages(normalizedPages));
    const detected = detectPdfTextSections(normalized);
    const metadata = await document.getMetadata().catch(() => null);
    const info = (metadata?.info ?? {}) as Record<string, unknown>;
    const labeledTitle = normalizeImportedText(
      labeledPdfMetadataValue(rawMetadataText, "作品タイトル")
    );
    const labeledAuthor = normalizeImportedText(
      labeledPdfMetadataValue(rawMetadataText, "作者名")
    );
    const title = normalizeImportedText(
      labeledTitle ||
      (typeof info.Title === "string" ? info.Title.trim() : "") ||
      fileName.replace(/\.pdf$/iu, "")
    );
    const author = normalizeImportedText(
      labeledAuthor ||
      (typeof info.Author === "string" ? info.Author.trim() : "")
    );

    return {
      parsed: buildParsedBookImport({
        ...detected,
        warnings: [
          "テキストPDFから抽出しました。段組み、ルビ、脚注が多いPDFでは順序を確認してください。",
        ],
      }),
      suggestedTitle: [...title].slice(0, 200).join(""),
      suggestedAuthor: [...author].slice(0, 200).join(""),
      formatLabel: "PDF（テキスト抽出）",
    };
  } finally {
    await document.destroy();
  }
}
