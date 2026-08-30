import "server-only";

import { PRIVATE_LIBRARY_LIMITS } from "@/lib/library/privateLibrary";

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
