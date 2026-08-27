import { buildParsedBookImport, type ParsedBookImport } from "@/lib/library/bookImport";
import { detectTextSections, normalizeImportedText } from "@/lib/library/parseTxtImport";
import { PRIVATE_LIBRARY_LIMITS } from "@/lib/library/privateLibrary";

export type ParsedPdfFile = {
  parsed: ParsedBookImport;
  suggestedTitle: string;
  suggestedAuthor: string;
  formatLabel: string;
};

type PdfTextItem = {
  str: string;
  transform?: number[];
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

function pageTextFromItems(items: unknown[]): string {
  const lines: string[] = [];
  let currentLine = "";
  let previousY: number | null = null;

  const flush = () => {
    const normalized = currentLine.replace(/[\t ]+/gu, " ").trim();
    if (normalized) lines.push(normalized);
    currentLine = "";
  };

  for (const item of items) {
    if (!isPdfTextItem(item) || !item.str) continue;
    const y = Array.isArray(item.transform) ? Number(item.transform[5]) : NaN;
    if (
      currentLine &&
      previousY !== null &&
      Number.isFinite(y) &&
      Math.abs(y - previousY) > 3
    ) {
      flush();
    }

    if (currentLine && needsSpace(currentLine, item.str)) currentLine += " ";
    currentLine += item.str;

    if (item.hasEOL) flush();
    if (Number.isFinite(y)) previousY = y;
  }

  flush();
  return lines.join("\n");
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
    const lines = page.split("\n").map((line) => line.trim()).filter(Boolean);
    const first = lines[0] ?? "";
    const last = lines.at(-1) ?? "";
    if (
      first &&
      ((firstLineCounts.get(first) ?? 0) >= repeatThreshold || /^[-–—]?\s*\d+\s*[-–—]?$/u.test(first))
    ) {
      lines.shift();
    }
    const updatedLast = lines.at(-1) ?? "";
    if (
      updatedLast &&
      ((lastLineCounts.get(last) ?? 0) >= repeatThreshold || /^[-–—]?\s*\d+\s*[-–—]?$/u.test(updatedLast))
    ) {
      lines.pop();
    }
    return lines.join("\n");
  });
}

export async function parsePdfImport(
  buffer: ArrayBuffer,
  fileName: string
): Promise<ParsedPdfFile> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString();
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    isEvalSupported: false,
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

    const normalized = normalizeImportedText(
      stripRepeatedMargins(pages).join("\n\n")
    );
    const detected = detectTextSections(normalized);
    const metadata = await document.getMetadata().catch(() => null);
    const info = (metadata?.info ?? {}) as Record<string, unknown>;
    const title =
      (typeof info.Title === "string" ? info.Title.trim() : "") ||
      fileName.replace(/\.pdf$/iu, "");
    const author = typeof info.Author === "string" ? info.Author.trim() : "";

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
