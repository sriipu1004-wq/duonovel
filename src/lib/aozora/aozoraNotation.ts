/**
 * Issue #140: display-only parsing of Aozora Bunko inline notation.
 *
 * Contract:
 * - Never mutates stored episode bodies. Only the visual Reader rendering uses
 *   these tokens; TTS, translation input, sentence segmentation and sentence
 *   indexes keep using the unchanged text pipeline.
 * - Narrow and reversible: only exact, recognised directive shapes are
 *   converted. Anything else stays literal (fail visible, never silently
 *   dropped).
 * - Textual evidence (edition-variant notes, ruby "ママ" notes) is shown as a
 *   small note, never removed.
 */

export type AozoraGaijiInfo = {
  /** JIS X 0213 plane-row-cell, e.g. "2-88-74". */
  code: string;
  description: string;
  char: string;
};

export type AozoraNoteKind = "edition_variant" | "ruby_note";

export type AozoraDisplayToken =
  | { kind: "text"; text: string }
  | { kind: "gaiji"; gaiji: AozoraGaijiInfo }
  | {
      kind: "ruby";
      base: string;
      reading: string;
      gaiji: AozoraGaijiInfo[];
    }
  | { kind: "emphasis"; text: string; directive: string }
  | { kind: "note"; noteKind: AozoraNoteKind; text: string; directive: string }
  | { kind: "align_end"; directive: string; text: string };

/**
 * Verified gaiji table. Each mapping was checked against the JIS X 0213:2004
 * code point using Python's `euc_jisx0213` codec (plane 1: 0xA0+row,
 * 0xA0+cell; plane 2: 0x8F prefix). The Aozora description must also match,
 * so a typo in either the code or the description keeps the source literal.
 * Add entries only after the same verification.
 */
export const AOZORA_VERIFIED_GAIJI: Readonly<
  Record<string, { description: string; char: string }>
> = {
  "1-7-84": { description: "濁点付き片仮名ヱ", char: "ヹ" },
  "1-14-88": { description: "口＋它", char: "咜" },
  "1-88-85": { description: "目＋爭", char: "睜" },
  "2-88-74": { description: "言＋墟のつくり", char: "譃" },
};

// The Reader clause splitter may re-join clauses with a single space right
// after 「、」, so one optional space is tolerated there (display only).
const GAIJI_PATTERN =
  /※［＃(?:「([^」\n］]+)」|([^、「」\n］]+))、 ?(?:第[34]水準)?([12]-\d{1,2}-\d{1,2})］/gu;

const DIRECTIVE_PATTERN = /［＃([^］\n]{1,200})］/gu;

const RUBY_PATTERN =
  /｜([^《》\n]+)《([^《》\n]+)》|([一-龯々ヶヵ]+)《([^《》\n]+)》/g;

const EMPHASIS_PATTERN = /^「([^「」]+)」に傍点$/u;
const ALIGN_END_PATTERN = /^地より[０-９0-9]+字上げ$/u;

export function lookupAozoraGaiji(
  description: string,
  code: string
): AozoraGaijiInfo | null {
  const entry = AOZORA_VERIFIED_GAIJI[code];
  if (!entry || entry.description !== description) return null;
  return { code, description, char: entry.char };
}

type GaijiMark = { offset: number; info: AozoraGaijiInfo };

/** Substitute verified gaiji with their Unicode character, keeping positions. */
function substituteVerifiedGaiji(text: string): {
  text: string;
  marks: GaijiMark[];
} {
  const marks: GaijiMark[] = [];
  let output = "";
  let lastIndex = 0;
  for (const match of text.matchAll(GAIJI_PATTERN)) {
    const index = match.index ?? 0;
    const description = match[1] ?? match[2] ?? "";
    const info = lookupAozoraGaiji(description, match[3] ?? "");
    if (!info) continue;
    output += text.slice(lastIndex, index);
    marks.push({ offset: output.length, info });
    output += info.char;
    lastIndex = index + match[0].length;
  }
  output += text.slice(lastIndex);
  return { text: output, marks };
}

function pushText(tokens: AozoraDisplayToken[], text: string) {
  if (!text) return;
  const previous = tokens[tokens.length - 1];
  if (previous?.kind === "text") {
    previous.text += text;
  } else {
    tokens.push({ kind: "text", text });
  }
}

/** Tokenise ruby inside a plain (directive-free) run of text. */
function tokenizeRubyRun(
  run: string,
  runOffset: number,
  marks: GaijiMark[],
  tokens: AozoraDisplayToken[]
) {
  const gaijiAt = (start: number, end: number) =>
    marks
      .filter((mark) => mark.offset >= runOffset + start && mark.offset < runOffset + end)
      .map((mark) => mark.info);

  const pushPlain = (start: number, end: number) => {
    let cursor = start;
    for (const mark of marks) {
      const local = mark.offset - runOffset;
      if (local < start || local >= end) continue;
      pushText(tokens, run.slice(cursor, local));
      tokens.push({ kind: "gaiji", gaiji: mark.info });
      cursor = local + mark.info.char.length;
    }
    pushText(tokens, run.slice(cursor, end));
  };

  let lastIndex = 0;
  for (const match of run.matchAll(RUBY_PATTERN)) {
    const index = match.index ?? 0;
    const base = (match[1] ?? match[3] ?? "").trim();
    const reading = (match[2] ?? match[4] ?? "").trim();
    if (!base || !reading) continue;
    pushPlain(lastIndex, index);
    tokens.push({
      kind: "ruby",
      base,
      reading,
      gaiji: gaijiAt(index, index + match[0].length),
    });
    lastIndex = index + match[0].length;
  }
  pushPlain(lastIndex, run.length);
}

/**
 * Tokenise one display unit (already passed through the existing
 * `normalizeAozoraTextForDisplay`). Output text of all tokens together never
 * loses a source character: unrecognised directives remain literal text.
 */
export function tokenizeAozoraDisplayText(text: string): AozoraDisplayToken[] {
  const { text: substituted, marks } = substituteVerifiedGaiji(text);
  const tokens: AozoraDisplayToken[] = [];
  let lastIndex = 0;
  let pendingAlign: { directive: string; start: number } | null = null;

  const flushRun = (start: number, end: number) => {
    if (end > start) {
      tokenizeRubyRun(substituted.slice(start, end), start, marks, tokens);
    }
  };

  for (const match of substituted.matchAll(DIRECTIVE_PATTERN)) {
    const index = match.index ?? 0;
    const directive = match[0];
    const content = match[1] ?? "";
    const end = index + directive.length;

    const emphasis = EMPHASIS_PATTERN.exec(content);
    if (emphasis) {
      const target = emphasis[1] ?? "";
      const preceding = substituted.slice(lastIndex, index);
      if (target && preceding.endsWith(target)) {
        flushRun(lastIndex, index - target.length);
        tokens.push({ kind: "emphasis", text: target, directive });
        lastIndex = end;
      }
      // Target not directly before the directive (e.g. it contains ruby
      // markup or sits in another unit): keep the directive literal.
      continue;
    }

    if (content.includes("底本")) {
      flushRun(lastIndex, index);
      tokens.push({ kind: "note", noteKind: "edition_variant", text: content, directive });
      lastIndex = end;
      continue;
    }

    if (/^ルビの「[^「」]+」はママ$/u.test(content)) {
      flushRun(lastIndex, index);
      tokens.push({ kind: "note", noteKind: "ruby_note", text: content, directive });
      lastIndex = end;
      continue;
    }

    if (ALIGN_END_PATTERN.test(content) && pendingAlign === null) {
      flushRun(lastIndex, index);
      pendingAlign = { directive, start: end };
      lastIndex = end;
      // Everything after it in the same unit is the end-aligned line.
      break;
    }
    // Any other directive: leave literal.
  }

  if (pendingAlign) {
    const rest = substituted.slice(pendingAlign.start);
    tokens.push({ kind: "align_end", directive: pendingAlign.directive, text: rest });
    return tokens;
  }

  flushRun(lastIndex, substituted.length);
  return tokens;
}

/** Visible text of tokens, ruby as base（reading）, for fixture comparison. */
export function aozoraTokensToVisibleText(tokens: AozoraDisplayToken[]): string {
  return tokens
    .map((token) => {
      switch (token.kind) {
        case "text":
          return token.text;
        case "gaiji":
          return token.gaiji.char;
        case "ruby":
          return `${token.base}（${token.reading}）`;
        case "emphasis":
          return token.text;
        case "note":
          return formatAozoraNoteLabel(token.text);
        case "align_end":
          return token.text;
      }
    })
    .join("");
}

export function formatAozoraNoteLabel(content: string): string {
  return `〔注：${content}〕`;
}

function hasUnclosedDirective(text: string): boolean {
  return text.lastIndexOf("［＃") > text.lastIndexOf("］");
}

/**
 * The existing sentence/clause splitters can cut inside `［＃…］` (after 」 or
 * 、). Sentence indexes are persisted (recordings, bookmarks, translations),
 * so segmentation is NOT changed. Instead, for rendering only, move the
 * remainder of a split directive back into the unit where it started.
 * Concatenation of all units is unchanged and the array length is preserved.
 */
export function rebalanceAozoraDirectivesAcrossUnits(texts: readonly string[]): string[] {
  const output = [...texts];
  for (let index = 0; index < output.length; index += 1) {
    let next = index + 1;
    while (hasUnclosedDirective(output[index] ?? "") && next < output.length) {
      const following = output[next] ?? "";
      const close = following.indexOf("］");
      if (close < 0) {
        output[index] = `${output[index]}${following}`;
        output[next] = "";
        next += 1;
        continue;
      }
      output[index] = `${output[index]}${following.slice(0, close + 1)}`;
      output[next] = following.slice(close + 1);
    }
    // A gaiji used as a ruby base (`叱※［＃…］《した》`): once the directive is
    // whole, its ruby reading may start the next unit. Keep them together.
    const current = output[index] ?? "";
    const following = output[index + 1] ?? "";
    const rubyHead = /^《[^《》\n]+》/u.exec(following);
    if (rubyHead && /※［＃[^］\n]*］$/u.test(current)) {
      output[index] = `${current}${rubyHead[0]}`;
      output[index + 1] = following.slice(rubyHead[0].length);
    }
  }
  return output;
}

/**
 * Render-only text per display unit index for paragraph blocks. Units are
 * rebalanced inside each paragraph only (directives never span paragraphs).
 * Only changed units are present in the map.
 */
export function buildAozoraRenderTextMap(
  paragraphBlocks: ReadonlyArray<{
    segments: ReadonlyArray<{ index: number; text: string }>;
  }>
): Map<number, string> {
  const map = new Map<number, string>();
  for (const block of paragraphBlocks) {
    const texts = block.segments.map((segment) => segment.text);
    if (!texts.some((text) => text.includes("［＃"))) continue;
    const rebalanced = rebalanceAozoraDirectivesAcrossUnits(texts);
    block.segments.forEach((segment, position) => {
      const text = rebalanced[position] ?? segment.text;
      if (text !== segment.text) map.set(segment.index, text);
    });
  }
  return map;
}
