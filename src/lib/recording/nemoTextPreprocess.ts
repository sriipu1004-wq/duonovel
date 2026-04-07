const DEFAULT_READING_REPLACEMENTS: Array<[RegExp, string]> = [
  [/LIB\s*read/gi, "ライブリード"],
  [/VOICEVOX\s*Nemo/gi, "ボイスボックス ニモ"],
];

function applyReadingReplacements(text: string): string {
  let next = text;

  for (const [pattern, replacement] of DEFAULT_READING_REPLACEMENTS) {
    next = next.replace(pattern, replacement);
  }

  return next;
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

function shouldInsertClausePause(lastChar: string): boolean {
  return !/[、。！？!?…」』）】]/u.test(lastChar);
}

function joinLinesWithinParagraph(lines: string[]): string {
  let result = "";

  for (const rawLine of lines) {
    const line = applyReadingReplacements(
      normalizeInlineWhitespace(rawLine).trim()
    );

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

export function preprocessNemoBody(body: string): string[] {
  const normalized = normalizeLineBreakSurface(body).trim();

  if (!normalized) {
    return [];
  }

  const rawParagraphs = normalized.split(/\n{2,}/);

  return rawParagraphs
    .map((paragraph) => joinLinesWithinParagraph(paragraph.split("\n")))
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);
}