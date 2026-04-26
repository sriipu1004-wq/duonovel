import type { NemoPronunciationDictionary } from "@/lib/recording/nemoPronunciationDictionary";

export type NemoPreprocessOptions = {
  pronunciationDictionary?: NemoPronunciationDictionary;
};

export type NemoProcessedParagraph = {
  originalParagraph: string;
  spokenParagraph: string;
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function applyPronunciationDictionary(
  text: string,
  pronunciationDictionary: NemoPronunciationDictionary
): string {
  const entries = Object.entries(pronunciationDictionary)
    .filter(([source, target]) => source.trim().length > 0 && target.trim().length > 0)
    .sort((left, right) => right[0].length - left[0].length);

  let next = text;

  for (const [source, target] of entries) {
    next = next.replace(new RegExp(escapeRegExp(source), "g"), target);
  }

  return next;
}

function normalizeClassicalJapanese(text: string): string {
  let t = text;

  // ===== 記号（Aivis対策）=====
  t = t
    .replace(/[―—─]{2,}/gu, "、") // 「――」を読ませない
    .replace(/\.{3,}/g, "……")
    .replace(/[⋯]{2,}/gu, "……")
    .replace(/…{3,}/gu, "……");

  // ===== 安全な旧仮名変換 =====
  const SAFE_REPLACEMENTS: [RegExp, string][] = [
    [/云ふ/g, "いう"],
    [/言ふ/g, "いう"],
    [/云つた/g, "いった"],
    [/言つた/g, "いった"],
    [/云はれ/g, "いわれ"],
    [/言はれ/g, "いわれ"],

    [/思ふ/g, "おもう"],
    [/思つた/g, "おもった"],
    [/思はれ/g, "おもわれ"],

    [/違ふ/g, "ちがう"],
    [/違つた/g, "ちがった"],

    [/行つた/g, "いった"],

    [/云々/g, "うんぬん"],

    [/大分/g, "だいぶ"],
    [/可成/g, "かなり"],

    [/此の/g, "この"],
    [/其の/g, "その"],
    [/彼の/g, "あの"],

    [/何故/g, "なぜ"],
    [/兎に角/g, "とにかく"],
    [/矢張/g, "やはり"],
    [/成程/g, "なるほど"],
  ];

  for (const [pattern, value] of SAFE_REPLACEMENTS) {
    t = t.replace(pattern, value);
  }

  // ===== 文脈依存（単独語のみ）=====
  t = t
    // 者 → もの（単独のみ）
    .replace(/(^|[^\p{Script=Han}])者(?!\p{Script=Han})/gu, "$1もの")

    // 事 → こと（単独のみ）
    .replace(/(^|[^\p{Script=Han}])事(?!\p{Script=Han})/gu, "$1こと");

  return t;
}

function normalizeInlineWhitespace(text: string): string {
  return text
    .replace(/\t/g, " ")
    .replace(/\u3000/g, " ")
    .replace(/ {2,}/g, " ");
}

function normalizeLineBreakSurface(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
}

function replaceRubySurfaceWithReading(text: string): string {
  return text
    .replace(/｜([^《》\r\n]+)《([^《》\r\n]+)》/gu, "$2")
    .replace(/([一-龯々〆ヵヶ〓]+)《([^《》\r\n]+)》/gu, "$2");
}

function shouldInsertClausePause(lastChar: string): boolean {
  return !/[、。！？!?…」』）】―—─]/u.test(lastChar);
}

function joinLinesWithinParagraph(lines: string[]): string {
  let result = "";

  for (const rawLine of lines) {
    const line = normalizeInlineWhitespace(rawLine).trim();

    if (!line) continue;

    if (!result) {
      result = line;
      continue;
    }

    const tail = result.charAt(result.length - 1);
    result += shouldInsertClausePause(tail) ? `、${line}` : line;
  }

  return result.trim();
}

function normalizePauseExpressionSurface(text: string): string {
  return text
    .replace(/\.{3,}/g, "……")
    .replace(/[⋯]{2,}/gu, "……")
    .replace(/…{3,}/gu, "……")
    .replace(/[―—─]{2,}/gu, "――")
    .replace(/([」』）】])(?=[^\s、。！？!?…」』）】])/gu, "$1、");
}

export function preprocessNemoBodyToParagraphs(
  body: string,
  options: NemoPreprocessOptions = {}
): NemoProcessedParagraph[] {
  const normalized = normalizeLineBreakSurface(body).trim();

  if (!normalized) {
    return [];
  }

  const rawParagraphs = normalized.split(/\n{2,}/);

  return rawParagraphs
    .map((paragraph) => joinLinesWithinParagraph(paragraph.split("\n")))
    .map((originalParagraph) => {
      const rubyResolvedParagraph =
        replaceRubySurfaceWithReading(originalParagraph);

      const dictionaryApplied = applyPronunciationDictionary(
        rubyResolvedParagraph,
        options.pronunciationDictionary ?? {}
      );

      const normalizedClassical = normalizeClassicalJapanese(dictionaryApplied);

      const spokenParagraph = normalizePauseExpressionSurface(normalizedClassical);

      return {
        originalParagraph: originalParagraph.trim(),
        spokenParagraph: spokenParagraph.trim(),
      };
    })
    .filter(
      (paragraph) =>
        paragraph.originalParagraph.length > 0 &&
        paragraph.spokenParagraph.length > 0
    );
}

export function preprocessNemoBody(
  body: string,
  options: NemoPreprocessOptions = {}
): string[] {
  return preprocessNemoBodyToParagraphs(body, options).map(
    (paragraph) => paragraph.spokenParagraph
  );
}