import { strFromU8, unzipSync } from "fflate";

const MAX_ZIP_ENTRIES = 10_000;
const MAX_TOTAL_UNCOMPRESSED_BYTES = 150_000_000;
const MAX_TEXT_ENTRY_BYTES = 20_000_000;
const TEXT_ENTRY_PATTERN = /(?:^|\/)(?:mimetype|[^/]+\.(?:xml|opf|xhtml|html?|ncx|txt|rels))$/iu;

function readUint16(view: DataView, offset: number): number {
  return view.getUint16(offset, true);
}

function readUint32(view: DataView, offset: number): number {
  return view.getUint32(offset, true);
}

function findEndOfCentralDirectory(view: DataView): number {
  const minimumOffset = Math.max(0, view.byteLength - 65_557);
  for (let offset = view.byteLength - 22; offset >= minimumOffset; offset -= 1) {
    if (readUint32(view, offset) === 0x06054b50) return offset;
  }
  return -1;
}

function assertSafeZip(bytes: Uint8Array): void {
  if (bytes.byteLength < 22) throw new Error("ZIPファイルが壊れています。");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const endOffset = findEndOfCentralDirectory(view);
  if (endOffset < 0) throw new Error("ZIPファイルの目次を確認できませんでした。");

  const entryCount = readUint16(view, endOffset + 10);
  const centralOffset = readUint32(view, endOffset + 16);
  if (entryCount < 1 || entryCount > MAX_ZIP_ENTRIES) {
    throw new Error("ファイル内の項目数が多すぎます。");
  }

  let offset = centralOffset;
  let totalUncompressed = 0;

  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > view.byteLength || readUint32(view, offset) !== 0x02014b50) {
      throw new Error("ZIPファイルの構造が壊れています。");
    }

    const flags = readUint16(view, offset + 8);
    if ((flags & 0x1) !== 0) {
      throw new Error("パスワードまたは暗号化されたファイルには対応していません。");
    }

    const uncompressedSize = readUint32(view, offset + 24);
    const fileNameLength = readUint16(view, offset + 28);
    const extraLength = readUint16(view, offset + 30);
    const commentLength = readUint16(view, offset + 32);
    totalUncompressed += uncompressedSize;

    if (totalUncompressed > MAX_TOTAL_UNCOMPRESSED_BYTES) {
      throw new Error("展開後のファイルサイズが大きすぎます。");
    }

    offset += 46 + fileNameLength + extraLength + commentLength;
  }
}

function normalizeZipEntryName(value: string): string {
  const parts: string[] = [];
  for (const part of value.replace(/\\/gu, "/").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      parts.pop();
      continue;
    }
    parts.push(part);
  }
  return parts.join("/");
}

export function resolveZipPath(baseFilePath: string, relativePath: string): string {
  const cleanRelative = relativePath.split("#", 1)[0]?.split("?", 1)[0] ?? "";
  const baseDirectory = baseFilePath.includes("/")
    ? baseFilePath.slice(0, baseFilePath.lastIndexOf("/") + 1)
    : "";

  try {
    const url = new URL(cleanRelative, `https://book.invalid/${baseDirectory}`);
    return normalizeZipEntryName(decodeURIComponent(url.pathname.slice(1)));
  } catch {
    return normalizeZipEntryName(baseDirectory + cleanRelative);
  }
}

export function readSafeZipTextEntries(buffer: ArrayBuffer): Map<string, string> {
  const bytes = new Uint8Array(buffer);
  assertSafeZip(bytes);

  const inflated = unzipSync(bytes, {
    filter(file) {
      return (
        file.originalSize <= MAX_TEXT_ENTRY_BYTES &&
        TEXT_ENTRY_PATTERN.test(file.name)
      );
    },
  });
  const entries = new Map<string, string>();

  for (const [rawName, value] of Object.entries(inflated)) {
    const name = normalizeZipEntryName(rawName);
    if (value.byteLength > MAX_TEXT_ENTRY_BYTES) {
      throw new Error("本文ファイルが大きすぎます。");
    }
    entries.set(name, strFromU8(value));
  }

  return entries;
}

export function findZipEntry(
  entries: Map<string, string>,
  wantedPath: string
): string | null {
  const normalized = normalizeZipEntryName(wantedPath);
  const exact = entries.get(normalized);
  if (typeof exact === "string") return exact;

  const lower = normalized.toLowerCase();
  for (const [name, value] of entries) {
    if (name.toLowerCase() === lower) return value;
  }
  return null;
}
