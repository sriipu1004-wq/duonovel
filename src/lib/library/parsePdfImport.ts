import { buildParsedBookImport, type ParsedBookImport } from "@/lib/library/bookImport";
import { normalizeImportedText } from "@/lib/library/importTextNormalization";
import { detectTextSections } from "@/lib/library/parseTxtImport";
import { PRIVATE_LIBRARY_LIMITS } from "@/lib/library/privateLibrary";

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
  hasEOL?: boolean;
};

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

function stripRepeatedMargins(pages: string[]): string[] {
  const firstLineCounts = new Map<string, number>();
  const lastLineCounts = new Map<string, number>();

  pages.forEach((page) => {
    const lines = page.split("\n").map((line) => line.trim()).filter(Boolean);
    const first = lines[0] ?? "";
    const last = lines.at(-1) ?? "";
    if (first) firstLineCounts.set(first, (firstLineCounts.get(first) ?? 0) + 1);
    if (last) lastLineCounts.set(last, (lastLineCounts.get(last) ?? 0) + 1);
  });

  const repeatThreshold = Math.max(3, Math.ceil(pages.length * 0.55));
  return pages.map((page) => {
    const lines = page.split("\n");
    const firstIndex = lines.findIndex((line) => Boolean(line.trim()));
    const lastIndex = lines.findLastIndex((line) => Boolean(line.trim()));
    const first = firstIndex >= 0 ? lines[firstIndex].trim() : "";
    const last = lastIndex >= 0 ? lines[lastIndex].trim() : "";
    if (
      first &&
      ((firstLineCounts.get(first) ?? 0) >= repeatThreshold || /^[-–—]?\s*\d+\s*[-–—]?$/u.test(first))
    ) {
      lines.splice(firstIndex, 1);
    }
    const updatedLastIndex = lines.findLastIndex((line) => Boolean(line.trim()));
    const updatedLast = updatedLastIndex >= 0 ? lines[updatedLastIndex].trim() : "";
    if (
      updatedLast &&
      ((lastLineCounts.get(last) ?? 0) >= repeatThreshold || /^[-–—]?\s*\d+\s*[-–—]?$/u.test(updatedLast))
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
    const previousEndsParagraph = /[。！？!?」』）】〉》…]$/u.test(result);
    result += previousEndsParagraph
      ? `\n\n${next}`
      : `${needsSpace(result, next) ? " " : ""}${next}`;
  }
  return result;
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
    let extractedChars = 0;

    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = pageTextFromItems(content.items);
      pages.push(text);
      extractedChars += text.length;

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
    const normalized = normalizeImportedText(joinPdfPages(pagesWithoutMargins));
    const detected = detectTextSections(normalized);
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
      suggestedTitle: title.slice(0, 200),
      suggestedAuthor: author.slice(0, 200),
      formatLabel: "PDF（テキスト抽出）",
    };
  } finally {
    await document.destroy();
  }
}
