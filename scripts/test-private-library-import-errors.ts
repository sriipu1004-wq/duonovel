import assert from "node:assert/strict";
import Module from "node:module";
import { PRIVATE_LIBRARY_LIMITS } from "../src/lib/library/privateLibrary";

// Characterization test: pins current behavior only (LT-002).

const moduleWithLoad = Module as unknown as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown;
};
const originalLoad = moduleWithLoad._load;
moduleWithLoad._load = function (request, parent, isMain) {
  if (request === "server-only") return {};
  return originalLoad.call(this, request, parent, isMain);
};

async function main() {
  try {
    const { getPrivateLibraryImportErrorMessage: message } = await import("../src/lib/library/privateLibraryImportServer");
    const n = (value: number) => value.toLocaleString("ja-JP");

    // Daily limit match is case-sensitive; the others are case-insensitive.
    assert.equal(
      message("ERROR: Free library import daily action limit reached"),
      "本日の無料共通枠（AI生成・対訳・個人本棚への取り込み、合計3回）を使い切りました。"
    );
    assert.equal(message("free library import daily action limit"), "作品の取り込みに失敗しました。内容を確認して、もう一度お試しください。");

    assert.equal(
      message("FREE PRIVATE LIBRARY WORK LIMIT exceeded"),
      `無料プランの個人本棚は${PRIVATE_LIBRARY_LIMITS.freeMaxWorksPerUser}作品までです。作品を削除するか、サブスクを利用してください。`
    );
    assert.equal(message("work limit exceeded"), `サブスクの個人本棚は${PRIVATE_LIBRARY_LIMITS.subscriberMaxWorksPerUser}作品までです。`);
    assert.equal(message("Text limit"), `個人本棚に保存できる本文は合計${n(PRIVATE_LIBRARY_LIMITS.maxTotalCharsPerUser)}文字までです。`);
    assert.equal(message("section count too high"), `1作品は${n(PRIVATE_LIBRARY_LIMITS.maxSections)}章・話以内にしてください。`);
    assert.equal(message("unit count too high"), `内部分割後の読書単位は${n(PRIVATE_LIBRARY_LIMITS.maxChapters)}件以内にしてください。`);
    assert.equal(message("text size too large"), `1作品は${n(PRIVATE_LIBRARY_LIMITS.maxSourceChars)}文字以内にしてください。`);
    assert.equal(message("import incomplete"), "本文の保存が完了していません。最初から取り込み直してください。");
    assert.equal(message(""), "作品の取り込みに失敗しました。内容を確認して、もう一度お試しください。");
    // Raw database text is never echoed.
    assert.equal(message("relation \"x\" does not exist").includes("relation"), false);
  } finally {
    moduleWithLoad._load = originalLoad;
  }

  console.log("PASS: private library import error messages (limit mapping, fallback, no raw DB text)");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
