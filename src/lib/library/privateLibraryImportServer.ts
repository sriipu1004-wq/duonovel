import "server-only";

import { PRIVATE_LIBRARY_LIMITS } from "@/lib/library/privateLibrary";
import type { ParsedBookUnit } from "@/lib/library/bookImport";

export function parsePrivateLibraryImportUnits(
  value: unknown
): ParsedBookUnit[] | null {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > PRIVATE_LIBRARY_LIMITS.importBatchSize
  ) {
    return null;
  }

  const units: ParsedBookUnit[] = [];

  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const record = item as Record<string, unknown>;
    const title = typeof record.title === "string" ? record.title.trim() : "";
    const sectionTitle =
      typeof record.sectionTitle === "string"
        ? record.sectionTitle.trim()
        : "";
    const body = typeof record.body === "string" ? record.body.trim() : "";
    const sectionNumber = Number(record.sectionNumber);
    const partNumber = Number(record.partNumber);
    const partCount = Number(record.partCount);

    if (
      !title ||
      title.length > 200 ||
      !sectionTitle ||
      sectionTitle.length > 200 ||
      !body ||
      body.length > PRIVATE_LIBRARY_LIMITS.maxChapterChars ||
      !Number.isInteger(sectionNumber) ||
      sectionNumber < 1 ||
      sectionNumber > PRIVATE_LIBRARY_LIMITS.maxSections ||
      !Number.isInteger(partNumber) ||
      partNumber < 1 ||
      !Number.isInteger(partCount) ||
      partCount < partNumber
    ) {
      return null;
    }

    units.push({
      title,
      body,
      sectionNumber,
      sectionTitle,
      partNumber,
      partCount,
    });
  }

  return units;
}

export function getPrivateLibraryImportErrorMessage(message: string): string {
  const normalized = message.toLowerCase();

  if (normalized.includes("free private library work limit")) {
    return `無料プランの個人本棚は${PRIVATE_LIBRARY_LIMITS.freeMaxWorksPerUser}作品までです。作品を削除するか、サブスクを利用してください。`;
  }

  if (normalized.includes("work limit")) {
    return `サブスクの個人本棚は${PRIVATE_LIBRARY_LIMITS.subscriberMaxWorksPerUser}作品までです。`;
  }

  if (normalized.includes("text limit")) {
    return `個人本棚に保存できる本文は合計${PRIVATE_LIBRARY_LIMITS.maxTotalCharsPerUser.toLocaleString("ja-JP")}文字までです。`;
  }

  if (normalized.includes("section count")) {
    return `1作品は${PRIVATE_LIBRARY_LIMITS.maxSections.toLocaleString("ja-JP")}章・話以内にしてください。`;
  }

  if (normalized.includes("unit count")) {
    return `内部分割後の読書単位は${PRIVATE_LIBRARY_LIMITS.maxChapters.toLocaleString("ja-JP")}件以内にしてください。`;
  }

  if (normalized.includes("text size")) {
    return `1作品は${PRIVATE_LIBRARY_LIMITS.maxSourceChars.toLocaleString("ja-JP")}文字以内にしてください。`;
  }

  if (normalized.includes("incomplete")) {
    return "本文の保存が完了していません。最初から取り込み直してください。";
  }

  return "作品の取り込みに失敗しました。内容を確認して、もう一度お試しください。";
}
