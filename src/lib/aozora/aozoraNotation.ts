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

import { AOZORA_GENERATED_GAIJI } from "@/lib/aozora/aozoraGaijiGenerated";

export type AozoraGaijiInfo = {
  /** JIS X 0213 plane-row-cell, e.g. "2-88-74". */
  code: string;
  description: string;
  char: string;
};

export type AozoraNoteKind = "edition_variant" | "ruby_note" | "sic";

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
// The description may itself contain quotes (`「筑」の「凡」に代えて「卩」`), see
// `aozoraGaijiDescription`. Group 2: JIS X 0213 code, group 3: Unicode hex.
const GAIJI_PATTERN =
  /※［＃([^］\n]+?)、 ?(?:(?:第[34]水準)?([12]-\d{1,2}-\d{1,2})|U\+([0-9A-F]{4,5})、[^］\n]*)］/gu;

const DIRECTIVE_PATTERN = /［＃([^］\n]{1,200})］/gu;

// Ruby without ｜ attaches to the run of one character type right before 《
// (https://www.aozora.gr.jp/annotation/etc.html#ruby): kanji (仝々〆〇ヶ count
// as kanji, and so do resolved gaiji), full-width alphanumerics, or Latin.
const RUBY_IMPLICIT_BASE_CLASSES = [
  String.raw`[\p{Script=Han}仝々〆〇ヶヵ]`,
  "[Ａ-Ｚａ-ｚ０-９]",
  "[A-Za-z]",
] as const;

// Linear time on long runs: an implicit base may only start where its run
// starts (negative lookbehind), and base/reading lengths are bounded, so a
// long line of one character class (e.g. user text) cannot cause quadratic
// backtracking. Longer bases simply stay literal.
const RUBY_MAX_BASE = 200;
const RUBY_MAX_READING = 500;
const RUBY_PATTERN = new RegExp(
  String.raw`｜([^《》\n｜]{1,${RUBY_MAX_BASE}})《([^《》\n]{1,${RUBY_MAX_READING}})》|(` +
    RUBY_IMPLICIT_BASE_CLASSES.map(
      (cls) => `(?<!${cls})${cls}{1,${RUBY_MAX_BASE}}`
    ).join("|") +
    String.raw`)《([^《》\n]{1,${RUBY_MAX_READING}})》`,
  "gu"
);

const EMPHASIS_PATTERN = /^「([^「」]+)」に傍点$/u;
const ALIGN_END_PATTERN = /^地より[０-９0-9]+字上げ$/u;
// Headings: the heading text stays, only the notation is hidden.
const HEADING_TARGET_PATTERN = /^「(.+)」は(?:同行|窓)?[大中小]見出し$/u;
// Pure layout markers hidden in display: heading start/end markers and the
// one-line indent (the multi-line ここから…字下げ is already removed by
// normalizeAozoraTextForLayout).
const LAYOUT_ONLY_PATTERN =
  /^(?:(?:同行|窓)?[大中小]見出し(?:終わり)?|(?:天から)?[０-９0-9]+字下げ)$/u;
const SIC_PATTERN = /^「.+」はママ$/u;

function withoutRubyMarkup(text: string): string {
  return text.replace(/《[^《》\n]*》/gu, "").replace(/｜/gu, "");
}

/**
 * Key used for the gaiji tables: a description wholly wrapped in 「」 is stored
 * without the outer quotes (`「口＋它」` -> `口＋它`, `「筑」の「凡」に代えて「卩」` ->
 * `筑」の「凡」に代えて「卩`); anything else is kept as written.
 */
export function aozoraGaijiDescription(raw: string): string {
  return raw.length > 2 && raw.startsWith("「") && raw.endsWith("」") ? raw.slice(1, -1) : raw;
}

/**
 * `※［＃「門＜兒」、U+49A7、156-9］`: Aozora gives the Unicode code point itself.
 * Only a single assigned Han character is accepted; anything else stays literal.
 */
export function lookupAozoraUnicodeGaiji(
  description: string,
  hex: string
): AozoraGaijiInfo | null {
  if (!/^[0-9A-F]{4,5}$/u.test(hex)) return null;
  const codePoint = Number.parseInt(hex, 16);
  if (codePoint > 0x10ffff) return null;
  const char = String.fromCodePoint(codePoint);
  if (!/^\p{Script=Han}$/u.test(char)) return null;
  return { code: `U+${hex}`, description, char };
}

export function lookupAozoraGaiji(
  description: string,
  code: string
): AozoraGaijiInfo | null {
  // Hand-checked entries first, then the table generated from the gaiji that
  // appear in published Aozora texts (same JIS X 0213 verification).
  const verified = AOZORA_VERIFIED_GAIJI[code];
  if (verified) {
    if (verified.description !== description) return null;
    return { code, description, char: verified.char };
  }
  const generated = AOZORA_GENERATED_GAIJI[code];
  if (!generated || !generated.descriptions.includes(description)) return null;
  return { code, description, char: generated.char };
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
    const description = aozoraGaijiDescription(match[1] ?? "");
    const info = match[2]
      ? lookupAozoraGaiji(description, match[2])
      : lookupAozoraUnicodeGaiji(description, match[3] ?? "");
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

    if (SIC_PATTERN.test(content)) {
      flushRun(lastIndex, index);
      tokens.push({ kind: "note", noteKind: "sic", text: content, directive });
      lastIndex = end;
      continue;
    }

    const heading = HEADING_TARGET_PATTERN.exec(content);
    if (heading) {
      // Same rule as bouten: the heading text must be right before it (the
      // note quotes it without ruby, `按摩《あんま》の昼火事` -> 「按摩の昼火事」).
      const target = heading[1] ?? "";
      if (target && withoutRubyMarkup(substituted.slice(lastIndex, index)).endsWith(target)) {
        flushRun(lastIndex, index);
        lastIndex = end;
      }
      continue;
    }

    if (LAYOUT_ONLY_PATTERN.test(content)) {
      flushRun(lastIndex, index);
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
    let merged = false;
    while (hasUnclosedDirective(output[index] ?? "") && next < output.length) {
      merged = true;
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
    // A gaiji used in a ruby (`叱※［＃…］《した》`, `｜※［＃…］忽《…》`,
    // `淡絹《※［＃…］エル》`): once the directive is whole, the rest of the ruby
    // may start the unit that holds the remainder. Keep them together.
    const current = output[index] ?? "";
    if (next < output.length && (merged || GAIJI_TAIL.test(current))) {
      const following = output[next] ?? "";
      const continuation = takeRubyContinuation(current, following);
      if (continuation) {
        output[index] = `${current}${continuation}`;
        output[next] = following.slice(continuation.length);
      }
    }
  }
  // A heading note cut from its heading text (`前置` | `［＃「前置」は中見出し］`):
  // once whole, move the note back so the heading rule can match (render only).
  for (let index = 0; index + 1 < output.length; index += 1) {
    const heading = /^［＃「([^］\n]+)」は(?:同行|窓)?[大中小]見出し］/u.exec(output[index + 1] ?? "");
    if (heading && withoutRubyMarkup(output[index] ?? "").endsWith(heading[1] ?? "\u0000")) {
      output[index] = `${output[index]}${heading[0]}`;
      output[index + 1] = (output[index + 1] ?? "").slice(heading[0].length);
    }
  }
  return output;
}

const GAIJI_TAIL = /※［＃[^］\n]*］$/u;
const RUBY_SPAN_LIMIT = 4;

const RUBY_IMPLICIT_BASE_TAILS = RUBY_IMPLICIT_BASE_CLASSES.map((cls) => ({
  tail: new RegExp(`${cls}$`, "u"),
  head: new RegExp(String.raw`^${cls}*《[^《》\n]+》`, "u"),
}));

/**
 * If `current` ends inside a ruby (`｜親字《読み》` or `漢字《よみ》`), return the
 * prefix of `following` that completes it, else null. Only a continuation that
 * closes inside `following` is taken; anything else stays literal.
 */
function takeRubyContinuation(current: string, following: string): string | null {
  let head: RegExpExecArray | null = null;
  if (current.lastIndexOf("《") > current.lastIndexOf("》")) {
    // Cut after 《, inside the reading, or right before 》.
    head = /^[^《》\n]*》/u.exec(following);
  } else if (/｜[^《》｜\n]*$/u.test(current)) {
    // Cut right after ｜ or inside an explicit base (before 《).
    head = /^[^《》｜\n]*《[^《》\n]+》/u.exec(following);
  } else if (GAIJI_TAIL.test(current)) {
    // A gaiji counts as kanji in an implicit base (`※［＃…］《よみ》`).
    head = RUBY_IMPLICIT_BASE_TAILS[0]!.head.exec(following);
  } else {
    // Cut before 《 or inside the same-type run of an implicit base.
    const implicit = RUBY_IMPLICIT_BASE_TAILS.find(({ tail }) => tail.test(current));
    if (implicit) head = implicit.head.exec(following);
  }
  if (!head || hasUnclosedDirective(head[0])) return null;
  return head[0];
}

/**
 * Issue #195: the Bilingual source segmentation (`segmentSourceDocument`) may
 * cut long clauses inside a ruby, leaving `《…》` literal. Segment ids, count
 * and order are persisted (recordings, bookmarks, translations), so the
 * segmentation is NOT changed. For rendering only, move the ruby continuation
 * back into the unit where the ruby started. Concatenation of all units is
 * unchanged and the array length is preserved.
 */
export function rebalanceAozoraRubyAcrossUnits(texts: readonly string[]): string[] {
  const output = [...texts];
  if (!output.some((text) => text.includes("《"))) return output;
  for (let index = 0; index + 1 < output.length; index += 1) {
    const current = output[index] ?? "";
    // A long ruby may span several units (#195 S3-1): look at up to
    // RUBY_SPAN_LIMIT following units joined; take it only if it closes there.
    let joined = "";
    for (let span = 1; span <= RUBY_SPAN_LIMIT && index + span < output.length; span += 1) {
      joined += output[index + span] ?? "";
      const continuation = takeRubyContinuation(current, joined);
      if (!continuation) continue;
      output[index] = `${current}${continuation}`;
      let remaining = continuation.length;
      for (let unit = index + 1; unit <= index + span; unit += 1) {
        const text = output[unit] ?? "";
        const taken = Math.min(remaining, text.length);
        output[unit] = text.slice(taken);
        remaining -= taken;
      }
      break;
    }
  }
  return output;
}

/** Directive rebalance (#140) followed by ruby rebalance (#195). Render only. */
export function rebalanceAozoraNotationAcrossUnits(texts: readonly string[]): string[] {
  return rebalanceAozoraRubyAcrossUnits(rebalanceAozoraDirectivesAcrossUnits(texts));
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
