/** Normalize layout-oriented Unicode glyphs into ordinary horizontal prose. */
export function normalizeImportedText(value: string): string {
  return value
    .replace(/^\uFEFF/u, "")
    .replace(/\u0000/gu, "")
    .replace(/\r\n?/gu, "\n")
    .replace(/[\t\u00a0]+/gu, " ")
    .replace(/︐/gu, "，")
    .replace(/︑/gu, "、")
    .replace(/︒/gu, "。")
    .replace(/︓/gu, "：")
    .replace(/︔/gu, "；")
    .replace(/︕/gu, "！")
    .replace(/︖/gu, "？")
    .replace(/[︵﹙]/gu, "（")
    .replace(/[︶﹚]/gu, "）")
    .replace(/︷/gu, "｛")
    .replace(/︸/gu, "｝")
    .replace(/︹/gu, "〔")
    .replace(/︺/gu, "〕")
    .replace(/︻/gu, "【")
    .replace(/︼/gu, "】")
    .replace(/︽/gu, "《")
    .replace(/︾/gu, "》")
    .replace(/︿/gu, "〈")
    .replace(/﹀/gu, "〉")
    .replace(/﹁/gu, "「")
    .replace(/﹂/gu, "」")
    .replace(/﹃/gu, "『")
    .replace(/﹄/gu, "』")
    .replace(/﹛/gu, "｛")
    .replace(/﹜/gu, "｝")
    .replace(/﹝/gu, "〔")
    .replace(/﹞/gu, "〕")
    .replace(/︙︙/gu, "……")
    .replace(/︙/gu, "…")
    .replace(/[│︱]{2,}/gu, "――")
    .replace(/[ \u3000]+$/gmu, "")
    .replace(/\n{4,}/gu, "\n\n\n")
    .trim();
}

/** Format imported prose for horizontal Japanese reading without touching titles. */
export function normalizeImportedBodyText(value: string): string {
  const normalized = normalizeImportedText(value).replace(
    /([」』])[ \u3000]*(?=[「『])/gu,
    "$1\n\n"
  );
  const usesJapaneseStyleIndent = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(
    normalized
  );

  return normalized
    .split(/\n{2,}/u)
    .map((paragraph) => {
      const lines = paragraph.split("\n").map((line) => line.trimEnd());
      const firstContentLine = lines.findIndex((line) => Boolean(line.trim()));

      return lines
        .map((line, index) => {
          if (!line.trim()) return "";
          if (!usesJapaneseStyleIndent) return line;
          const content = line.replace(/^[ \u3000]+/u, "");
          if (index !== firstContentLine || /^[「『]/u.test(content)) {
            return content;
          }
          return `　${content}`;
        })
        .join("\n");
    })
    .filter((paragraph) => Boolean(paragraph.trim()))
    .join("\n\n");
}
