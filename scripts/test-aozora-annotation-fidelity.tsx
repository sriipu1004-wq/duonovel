/**
 * Issue #140: Aozora notation fidelity in the Reader for the four
 * owner-approved #139 works (aozora-000692, -033200, -053520, -004386).
 *
 * Part A (always): synthetic regressions for the display-only tokenizer,
 * verified gaiji table, split-directive rebalance and literal fallback.
 * Part B (only when the git-ignored raw TXT is present, otherwise SKIP):
 * source-vs-rendered comparison through the real Reader pipeline
 * (Original/WebSpeech display units and the Bilingual source pane).
 *
 * Read-only: no network, no database, no stored-body mutation.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  normalizeAozoraTextForDisplay,
  normalizeAozoraTextForLayout,
  renderTextWithAozoraRuby,
} from "../src/features/effects/EffectPreviewRenderer";
import {
  AOZORA_VERIFIED_GAIJI,
  aozoraTokensToVisibleText,
  buildAozoraRenderTextMap,
  formatAozoraNoteLabel,
  lookupAozoraGaiji,
  rebalanceAozoraDirectivesAcrossUnits,
  rebalanceAozoraNotationAcrossUnits,
  rebalanceAozoraRubyAcrossUnits,
  tokenizeAozoraDisplayText,
} from "../src/lib/aozora/aozoraNotation";
import {
  buildNemoAlignedParagraphBlocks,
  splitSentenceIntoDisplayClauses,
} from "../src/lib/recording/humanTimingShared";
import { segmentSourceDocument } from "../src/lib/translation/segmentSourceDocument";
import { prepareArtifact, validateManifest } from "./public-domain/core";
import { classifyAozoraAnnotation } from "./public-domain/aozora-annotation-fidelity";

function html(node: React.ReactNode): string {
  return renderToStaticMarkup(<>{node}</>);
}

function visibleTextFromHtml(markup: string): string {
  return markup
    .replace(/<rt[^>]*>[\s\S]*?<\/rt>/gu, "")
    .replace(/<[^>]+>/gu, "")
    .replace(/&quot;/gu, '"')
    .replace(/&#x27;/gu, "'")
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">")
    .replace(/&amp;/gu, "&");
}

/**
 * Independent string-level expectation of what the reader should show for a
 * display unit (ruby readings hidden in <rt>), used to detect lost or doubled
 * characters. Mirrors the documented policy, not the tokenizer code.
 */
function expectedVisibleText(unit: string): string {
  let text = normalizeAozoraTextForDisplay(unit);
  text = text.replace(
    /※［＃(?:「([^」\n］]+)」|([^、「」\n］]+))、 ?(?:第[34]水準)?([12]-\d{1,2}-\d{1,2})］/gu,
    (whole, quoted, plain, code) =>
      lookupAozoraGaiji(quoted ?? plain ?? "", code)?.char ?? whole
  );
  text = text.replace(/([^［］]*?)［＃「([^「」]+)」に傍点］/gu, (whole, before: string, target: string) =>
    before.endsWith(target) ? before : whole
  );
  text = text.replace(/［＃([^］\n]*底本[^］\n]*)］/gu, (_w, content: string) =>
    formatAozoraNoteLabel(content)
  );
  text = text.replace(/［＃(ルビの「[^「」]+」はママ)］/gu, (_w, content: string) =>
    formatAozoraNoteLabel(content)
  );
  text = text.replace(/［＃地より[０-９0-9]+字上げ］/gu, "");
  // Ruby outside notes: keep base only. Notes are already converted to 〔注：…〕
  // labels; protect them so that ruby written inside a note stays literal.
  const parts = text.split(/(〔注：[^〕]*〕)/u);
  return parts
    .map((part) =>
      part.startsWith("〔注：")
        ? part
        : part
            .replace(/｜([^《》\n]+)《([^《》\n]+)》/gu, "$1")
            .replace(/([一-龯々ヶヵ]+)《([^《》\n]+)》/gu, "$1")
    )
    .join("");
}

function testSynthetic() {
  // Plain text and ruby-only text keep the previous rendering.
  assert.equal(html(renderTextWithAozoraRuby("ただの本文。")), "ただの本文。");
  assert.equal(
    html(renderTextWithAozoraRuby("住所不｜定《ぢやう》の男")),
    '住所不<ruby class="align-middle"><span>定</span><rt class="text-[0.52em] font-normal not-italic leading-none opacity-80">ぢやう</rt></ruby>の男'
  );

  // Bouten: exact preceding target only.
  const emphasis = html(renderTextWithAozoraRuby("そこには、あざみ［＃「あざみ」に傍点］のとげ"));
  assert.match(emphasis, /<span data-aozora-emphasis="sesame" style="-webkit-text-emphasis:filled sesame;text-emphasis:filled sesame">あざみ<\/span>/u);
  assert.doesNotMatch(emphasis, /［＃/u);
  // Target mismatch stays literal (fail visible).
  assert.match(html(renderTextWithAozoraRuby("いばら［＃「あざみ」に傍点］")), /いばら［＃「あざみ」に傍点］/u);

  // Edition-variant and ruby notes are kept as small notes, not removed.
  const variant = html(renderTextWithAozoraRuby("爲事《しごと》を［＃「爲事《しごと》を」は底本では「爲事《しこと》を」］した"));
  assert.match(variant, /<small data-aozora-note="edition_variant"[^>]*>〔注：「爲事《しごと》を」は底本では「爲事《しこと》を」〕<\/small>/u);
  assert.equal((variant.match(/<ruby/gu) ?? []).length, 1, "ruby inside a note must stay literal");
  assert.match(html(renderTextWithAozoraRuby("考古［＃底本は「好古」］學者")), /data-aozora-note="edition_variant"[^>]*>〔注：底本は「好古」〕/u);
  assert.match(html(renderTextWithAozoraRuby("叱咜《した》［＃ルビの「した」はママ］した")), /data-aozora-note="ruby_note"/u);

  // Verified gaiji: code AND description must match the table.
  assert.deepEqual(Object.keys(AOZORA_VERIFIED_GAIJI).sort(), ["1-14-88", "1-7-84", "1-88-85", "2-88-74"]);
  const gaiji = html(renderTextWithAozoraRuby("それは※［＃「言＋墟のつくり」、第4水準2-88-74］である"));
  assert.match(gaiji, /<span data-aozora-gaiji="2-88-74" title="外字「言＋墟のつくり」（JIS X 0213 2-88-74）">譃<\/span>/u);
  assert.match(html(renderTextWithAozoraRuby("※［＃「言＋墟のつくり」、第4水準2-88-75］")), /※［＃「言＋墟のつくり」、第4水準2-88-75］/u, "unknown code stays literal");
  assert.match(html(renderTextWithAozoraRuby("※［＃「言＋虚」、第4水準2-88-74］")), /※［＃「言＋虚」、第4水準2-88-74］/u, "description mismatch stays literal");
  // Gaiji inside ruby reading and gaiji as part of ruby base.
  const rubyGaiji = html(renderTextWithAozoraRuby("淡絹《※［＃濁点付き片仮名ヱ、1-7-84］エル》をふり"));
  assert.match(rubyGaiji, /<ruby class="align-middle" data-aozora-gaiji="1-7-84"[^>]*><span>淡絹<\/span><rt[^>]*>ヹエル<\/rt><\/ruby>/u);
  const baseGaiji = html(renderTextWithAozoraRuby("叱※［＃「口＋它」、第3水準1-14-88］《した》"));
  assert.match(baseGaiji, /<ruby class="align-middle" data-aozora-gaiji="1-14-88"[^>]*><span>叱咜<\/span><rt[^>]*>した<\/rt><\/ruby>/u);

  // End alignment.
  assert.match(html(renderTextWithAozoraRuby("［＃地より２字上げ］（五年十月）")), /<span data-aozora-layout="align-end" class="block text-right">（五年十月）<\/span>/u);

  // Unknown directive stays literal.
  assert.match(html(renderTextWithAozoraRuby("本文［＃未知の指示］")), /本文［＃未知の指示］/u);

  // Rebalance: concatenation and length preserved, directive made whole.
  const units = ["すゝき［＃「すゝき」", "に傍点］のしげみ", "を見た。"];
  const rebalanced = rebalanceAozoraDirectivesAcrossUnits(units);
  assert.equal(rebalanced.length, units.length);
  assert.equal(rebalanced.join(""), units.join(""));
  assert.deepEqual(rebalanced, ["すゝき［＃「すゝき」に傍点］", "のしげみ", "を見た。"]);
  const threeWay = ["爲事を［＃「爲事を」", "は底本では「爲事を」", "］したつて"];
  assert.deepEqual(rebalanceAozoraDirectivesAcrossUnits(threeWay), ["爲事を［＃「爲事を」は底本では「爲事を」］", "", "したつて"]);
  assert.deepEqual(rebalanceAozoraDirectivesAcrossUnits(["未閉じ［＃「x」"]), ["未閉じ［＃「x」"]);
  // Gaiji ruby base split at 「、」: directive and its reading are re-joined.
  const gaijiRuby = ["叱※［＃「口＋它」、", "第3水準1-14-88］《した》［＃ルビの「した」はママ］", "した。"];
  assert.deepEqual(rebalanceAozoraDirectivesAcrossUnits(gaijiRuby), [
    "叱※［＃「口＋它」、第3水準1-14-88］《した》",
    "［＃ルビの「した」はママ］",
    "した。",
  ]);
  // Plain clause boundaries without directives are never touched.
  assert.deepEqual(rebalanceAozoraDirectivesAcrossUnits(["漢字、", "《かな》"]), ["漢字、", "《かな》"]);
  const map = buildAozoraRenderTextMap([
    { segments: [{ index: 7, text: units[0]! }, { index: 8, text: units[1]! }, { index: 9, text: units[2]! }] },
    { segments: [{ index: 10, text: "普通の段落。" }] },
  ]);
  assert.deepEqual([...map.entries()], [[7, rebalanced[0]], [8, rebalanced[1]]]);

  // Visible-text helper agrees with the tokenizer on a mixed sample.
  const mixed = "只｜舳《へさき》にすゝき［＃「すゝき」に傍点］、※［＃「目＋爭」、第3水準1-88-85］つて";
  assert.equal(
    aozoraTokensToVisibleText(tokenizeAozoraDisplayText(mixed)),
    "只舳（へさき）にすゝき、睜つて"
  );
  assert.equal(visibleTextFromHtml(html(renderTextWithAozoraRuby(mixed))), expectedVisibleText(mixed));
  console.log("PASS: Issue #140 synthetic Aozora notation rendering");
}

function rubyPairs(markup: string): string[] {
  return [...markup.matchAll(/<ruby[^>]*><span>([^<]*)<\/span><rt[^>]*>([^<]*)<\/rt><\/ruby>/gu)].map(
    (match) => `${match[1]}/${match[2]}`
  );
}

function testSyntheticRubySplit() {
  // Issue #195: a cut at EVERY position of a ruby (after ｜, inside the base,
  // before/after 《, inside the reading, before 》) is re-joined for rendering
  // only; unit count, order and concatenation are unchanged.
  const samples: Array<{ text: string; ruby: string[] }> = [
    { text: "かねて一｜場《ぢやう》の訓示", ruby: ["場/ぢやう"] },
    { text: "見ると眞岡木綿《まをかもめん》の紋付", ruby: ["眞岡木綿/まをかもめん"] },
    { text: "羊の毛《け》のやう", ruby: ["毛/け"] },
    { text: "と考《かんが》へる", ruby: ["考/かんが"] },
    { text: "淡絹《※［＃濁点付き片仮名ヱ、1-7-84］エル》をふり", ruby: ["淡絹/ヹエル"] },
  ];
  for (const sample of samples) {
    const whole = html(renderTextWithAozoraRuby(sample.text));
    assert.deepEqual(rubyPairs(whole), sample.ruby, `whole: ${sample.text}`);
    for (let cut = 1; cut < sample.text.length; cut += 1) {
      const units = [sample.text.slice(0, cut), sample.text.slice(cut)];
      const rebalanced = rebalanceAozoraNotationAcrossUnits(units);
      const label = `${units[0]}|${units[1]}`;
      assert.equal(rebalanced.length, units.length, label);
      assert.equal(rebalanced.join(""), sample.text, label);
      const markup = rebalanced.map((unit) => html(renderTextWithAozoraRuby(unit))).join("");
      assert.deepEqual(rubyPairs(markup), sample.ruby, `ruby lost or wrong: ${label}`);
      assert.doesNotMatch(markup.replace(/<rt[^>]*>[^<]*<\/rt>/gu, ""), /[《》｜]|［＃/u, `literal ruby: ${label}`);
    }
  }
  // Three units: ruby continuation is taken from the next unit only.
  assert.deepEqual(
    rebalanceAozoraRubyAcrossUnits(["前の何某《なにが", "し》である。", "次の文。"]),
    ["前の何某《なにがし》", "である。", "次の文。"]
  );
  // Unclosed in the next unit: nothing moves (stays literal, fail visible).
  assert.deepEqual(rebalanceAozoraRubyAcrossUnits(["漢字《かん", "じ", "》"]), ["漢字《かん", "じ", "》"]);
  // Not a ruby boundary: untouched.
  assert.deepEqual(rebalanceAozoraRubyAcrossUnits(["漢字、", "《かな》"]), ["漢字、", "《かな》"]);
  assert.deepEqual(rebalanceAozoraRubyAcrossUnits(["毛《け》の", "やう"]), ["毛《け》の", "やう"]);
  assert.deepEqual(rebalanceAozoraRubyAcrossUnits(["ただの文。", "次の文。"]), ["ただの文。", "次の文。"]);
  console.log("PASS: Issue #195 synthetic ruby split across Bilingual source units");
}

type ExpectedWork = {
  id: string;
  chapters: number;
  byCategory: Record<string, number>;
  // Directives that intentionally stay literal or are removed by the existing
  // layout normalizer (see docs/issue140-aozora-notation-fidelity.md).
  layoutStrippedByExistingNormalizer: number;
  literalAfterRendering: number;
  alignEnd: number;
  // Issue #195: segmentSourceDocument output per chapter, pinned from main
  // (the fix must not change segmentation).
  bilingualSegments: number[];
  bilingualSegmentFingerprint: string;
};

const EXPECTED: ExpectedWork[] = [
  { id: "aozora-000692", chapters: 1, byCategory: { edition_variant: 2, gaiji: 2 }, layoutStrippedByExistingNormalizer: 0, literalAfterRendering: 0, alignEnd: 0, bilingualSegments: [247], bilingualSegmentFingerprint: "c5b781d2904ae423" },
  { id: "aozora-033200", chapters: 1, byCategory: { edition_variant: 2, emphasis: 3, gaiji: 2 }, layoutStrippedByExistingNormalizer: 0, literalAfterRendering: 0, alignEnd: 0, bilingualSegments: [269], bilingualSegmentFingerprint: "16c25684058a8c17" },
  { id: "aozora-053520", chapters: 8, byCategory: { emphasis: 7, gaiji: 1, ruby_note: 1, layout: 4 }, layoutStrippedByExistingNormalizer: 4, literalAfterRendering: 0, alignEnd: 0, bilingualSegments: [64, 98, 93, 133, 195, 50, 52, 79], bilingualSegmentFingerprint: "e79f940ec5c5481d" },
  { id: "aozora-004386", chapters: 2, byCategory: { emphasis: 3, edition_variant: 1, layout: 1 }, layoutStrippedByExistingNormalizer: 0, literalAfterRendering: 0, alignEnd: 1, bilingualSegments: [118, 326], bilingualSegmentFingerprint: "a6f35db9bb646cb6" },
];

function countMatches(text: string, pattern: RegExp): number {
  return (text.match(pattern) ?? []).length;
}

function renderUnits(units: string[]): string[] {
  return units.map((unit) => html(renderTextWithAozoraRuby(unit)));
}

function checkUnits(label: string, originalUnits: string[], renderUnitsText: string[]) {
  assert.equal(renderUnitsText.length, originalUnits.length, `${label}: unit count changed`);
  assert.equal(renderUnitsText.join(""), originalUnits.join(""), `${label}: rebalance lost or doubled text`);
  const markups = renderUnits(renderUnitsText);
  markups.forEach((markup, position) => {
    const unit = renderUnitsText[position] ?? "";
    assert.equal(
      visibleTextFromHtml(markup),
      expectedVisibleText(unit),
      `${label}: visible text mismatch at unit ${position}`
    );
  });
  return markups.join("\n");
}

function testRealSources() {
  let checked = 0;
  const totals: Record<string, number> = {};
  for (const expected of EXPECTED) {
    const manifestResult = validateManifest(
      JSON.parse(readFileSync(`public-domain/manifests/${expected.id}.json`, "utf8"))
    );
    assert.equal(manifestResult.ok, true, expected.id);
    const manifest = manifestResult.manifest!;
    if (!existsSync(manifest.source_file)) continue;
    // prepareArtifact verifies the pinned SHA-256 of the raw bytes.
    const prepared = prepareArtifact({
      manifest,
      rawBytes: readFileSync(manifest.source_file),
      preparedAt: "2026-11-14T00:00:00.000Z",
    });
    assert.equal(prepared.chapters.length, expected.chapters, expected.id);

    const byCategory: Record<string, number> = {};
    let originalDirectives = 0;
    let afterLayout = 0;
    let literalInOriginalMode = 0;
    const literalLog: string[] = [];
    let literalInBilingualSource = 0;
    let bilingualRendered = 0;
    let emphasisSpans = 0;
    let noteSpans = 0;
    let gaijiCodes = 0;
    let alignEnd = 0;
    let sourceRuby = 0;
    let renderedRuby = 0;
    let bilingualRuby = 0;
    let literalRubyInBilingual = 0;
    const segmentCounts: number[] = [];
    const fingerprint = createHash("sha256");

    for (const chapter of prepared.chapters) {
      const body = chapter.body;
      for (const match of body.matchAll(/［＃([^］\n]{1,200})］/gu)) {
        const category = classifyAozoraAnnotation(match[1] ?? "");
        byCategory[category] = (byCategory[category] ?? 0) + 1;
        originalDirectives += 1;
      }
      // Ruby written inside a note (e.g. an edition-variant quotation) is part
      // of the note text and is intentionally not rendered as <ruby>.
      sourceRuby += countMatches(body.replace(/［＃[^］\n]*］/gu, ""), /《[^《》\n]+》/gu);
      const layoutBody = normalizeAozoraTextForLayout(body);
      afterLayout += countMatches(layoutBody, /［＃[^］\n]{1,200}］/gu);

      // Original mode (WebSpeechEpisodePlayback): the same pipeline as the
      // component, including the unchanged sentence/clause segmentation.
      const paragraphBlocks = buildNemoAlignedParagraphBlocks(layoutBody);
      let nextDisplayIndex = 0;
      const displayBlocks = paragraphBlocks.map((block) => ({
        segments: block.segments.flatMap((segment) =>
          splitSentenceIntoDisplayClauses(segment.text).map((text) => ({
            index: nextDisplayIndex++,
            text,
          }))
        ),
      }));
      const renderMap = buildAozoraRenderTextMap(displayBlocks);
      let originalMarkup = "";
      for (const [blockIndex, block] of displayBlocks.entries()) {
        const units = block.segments.map((segment) => segment.text);
        const renderTexts = block.segments.map(
          (segment) => renderMap.get(segment.index) ?? segment.text
        );
        originalMarkup += checkUnits(`${expected.id}#${chapter.number} original p${blockIndex}`, units, renderTexts);
      }
      for (const match of originalMarkup.matchAll(/［＃/gu)) {
        literalLog.push(`${expected.id}#${chapter.number}: …${originalMarkup.slice(Math.max(0, (match.index ?? 0) - 60), (match.index ?? 0) + 40)}…`);
        literalInOriginalMode += 1;
      }
      emphasisSpans += countMatches(originalMarkup, /data-aozora-emphasis=/gu);
      noteSpans += countMatches(originalMarkup, /data-aozora-note=/gu);
      gaijiCodes += countMatches(originalMarkup, /data-aozora-gaiji="[^"]+"/gu);
      alignEnd += countMatches(originalMarkup, /data-aozora-layout="align-end"/gu);
      renderedRuby += countMatches(originalMarkup, /<ruby/gu);
      {
        const outsideNotes = originalMarkup.replace(/<small data-aozora-note[^>]*>[\s\S]*?<\/small>/gu, "");
        const hit = /《|》|｜/u.exec(outsideNotes);
        assert.equal(
          hit,
          null,
          `${expected.id}#${chapter.number}: unrendered ruby markup outside notes: …${hit ? outsideNotes.slice(Math.max(0, hit.index - 80), hit.index + 40) : ""}…`
        );
      }

      // Bilingual source pane: translation segmentation of the stored body.
      const document = segmentSourceDocument(body, "ja");
      const byParagraph = new Map<number, string[]>();
      for (const segment of document.segments) {
        const list = byParagraph.get(segment.paragraphIndex) ?? [];
        list.push(segment.sourceText);
        byParagraph.set(segment.paragraphIndex, list);
      }
      // Issue #195: segmentation (count/order/id/offsets) is persisted and
      // must stay byte-identical; the fix is render-only.
      segmentCounts.push(document.segments.length);
      fingerprint.update(
        document.segments
          .map((segment) => `${segment.id}:${segment.startOffset}:${segment.endOffset}`)
          .join("\n")
      );
      fingerprint.update("\n#\n");
      let bilingualMarkup = "";
      for (const [paragraphIndex, units] of byParagraph) {
        bilingualMarkup += checkUnits(
          `${expected.id}#${chapter.number} bilingual p${paragraphIndex}`,
          units,
          rebalanceAozoraNotationAcrossUnits(units)
        );
      }
      bilingualRuby += countMatches(bilingualMarkup, /<ruby/gu);
      {
        const outsideNotes = bilingualMarkup
          .replace(/<small data-aozora-note[^>]*>[\s\S]*?<\/small>/gu, "")
          .replace(/<rt[^>]*>[\s\S]*?<\/rt>/gu, "");
        for (const hit of outsideNotes.matchAll(/[《》｜]/gu)) {
          literalRubyInBilingual += 1;
          literalLog.push(
            `${expected.id}#${chapter.number} bilingual: …${outsideNotes.slice(Math.max(0, (hit.index ?? 0) - 40), (hit.index ?? 0) + 20)}…`
          );
        }
      }
      literalInBilingualSource += countMatches(
        bilingualMarkup.replace(/<small data-aozora-note[^>]*>[\s\S]*?<\/small>/gu, ""),
        /［＃/gu
      );
      bilingualRendered += countMatches(
        bilingualMarkup,
        /data-aozora-(?:emphasis|note|gaiji|layout)=/gu
      );
    }

    assert.deepEqual(byCategory, expected.byCategory, `${expected.id}: directive classification changed`);
    assert.equal(originalDirectives - afterLayout, expected.layoutStrippedByExistingNormalizer, expected.id);
    assert.equal(
      literalInOriginalMode,
      expected.literalAfterRendering,
      `${expected.id}: literal directives remain in Original mode\n${literalLog.join("\n")}`
    );
    assert.equal(
      emphasisSpans,
      byCategory.emphasis ?? 0,
      `${expected.id}: every bouten must render once`
    );
    assert.equal(
      noteSpans,
      (byCategory.edition_variant ?? 0) + (byCategory.ruby_note ?? 0),
      `${expected.id}: every edition/ruby note must render once`
    );
    assert.equal(gaijiCodes, byCategory.gaiji ?? 0, `${expected.id}: every gaiji must render once`);
    assert.equal(sourceRuby, renderedRuby, `${expected.id}: ruby count source vs rendered`);
    assert.equal(alignEnd, expected.alignEnd, `${expected.id}: end-aligned lines`);
    assert.equal(literalInBilingualSource, 0, `${expected.id}: literal directives in Bilingual source pane`);
    assert.equal(
      literalRubyInBilingual,
      0,
      `${expected.id}: literal ruby markup in Bilingual source pane\n${literalLog.join("\n")}`
    );
    assert.equal(bilingualRuby, sourceRuby, `${expected.id}: ruby count source vs Bilingual source pane`);
    const segmentFingerprint = fingerprint.digest("hex").slice(0, 16);
    assert.deepEqual(segmentCounts, expected.bilingualSegments, `${expected.id}: Bilingual segment counts changed`);
    assert.equal(segmentFingerprint, expected.bilingualSegmentFingerprint, `${expected.id}: Bilingual segment ids/offsets changed`);
    assert.equal(
      bilingualRendered,
      emphasisSpans + noteSpans + gaijiCodes + alignEnd,
      `${expected.id}: Bilingual source pane must render the same notation as Original mode`
    );
    console.log(
      `${expected.id}: directives=${originalDirectives} ${JSON.stringify(byCategory)} layoutStripped=${originalDirectives - afterLayout} emphasis=${emphasisSpans} notes=${noteSpans} gaiji=${gaijiCodes} alignEnd=${alignEnd} ruby=${renderedRuby}/${sourceRuby} bilingualRuby=${bilingualRuby}/${sourceRuby} bilingualSegments=${JSON.stringify(segmentCounts)} fingerprint=${segmentFingerprint} literal(bilingual-ruby)=${literalRubyInBilingual} literal(original)=${literalInOriginalMode} literal(bilingual-source)=${literalInBilingualSource} bilingualNotation=${bilingualRendered}`
    );
    for (const [key, value] of Object.entries(byCategory)) totals[key] = (totals[key] ?? 0) + value;
    checked += 1;
  }
  console.log(
    checked === EXPECTED.length
      ? `PASS: Issue #140 source-vs-rendered fixture for ${checked} works ${JSON.stringify(totals)}`
      : `SKIP: Issue #140 source-vs-rendered fixture checked ${checked}/${EXPECTED.length} (raw TXT is git-ignored)`
  );
}

testSynthetic();
testSyntheticRubySplit();
testRealSources();
