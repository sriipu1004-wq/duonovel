import assert from "node:assert/strict";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { parseHTML } from "linkedom";
import BilingualPane from "../src/features/playback/BilingualPane";
import {
  applyReadingModeToHref, readEpisodeReadingPosition, readPreferredReadingPosition,
  readReadingHistory, writeReadingBookmark, writeReadingHistory,
  hasSameReadingCoordinates, resolveReadingPositionIndex,
} from "../src/lib/playback/readingBookmark";
import { claimLinkedScroll, syncOtherPaneScroll, normalizeScrollAnchors, mapScrollPosition } from "../src/lib/playback/bilingualScroll";
import { parseTranslationLearningPreference, buildTranslationLearningInstruction } from "../src/lib/translation/translationLearningPreference";
import type { StoredWebSpeechDisplaySettings } from "../src/lib/playback/webSpeechPreferences";

async function main() {
  const { window } = parseHTML("<html><body><div id='app'></div></body></html>");
  const values = new Map<string, string>();
  Object.assign(globalThis, {
    window, document: window.document, HTMLElement: window.HTMLElement,
    CustomEvent: window.CustomEvent, IS_REACT_ACT_ENVIRONMENT: true,
  });
  Object.defineProperty(window, "localStorage", { value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  } });
  Object.defineProperty(window, "location", { value: { search: "" }, configurable: true });
  window.requestAnimationFrame = ((callback: FrameRequestCallback) => setTimeout(() => callback(0), 0)) as unknown as typeof requestAnimationFrame;
  window.cancelAnimationFrame = clearTimeout as unknown as typeof cancelAnimationFrame;

  writeReadingHistory({ seriesId: "book", episodeNumber: 12, positionIndex: 20, paragraphIndex: 8, sentenceIndex: 2, mode: "bilingual", sourceLanguage: "ja", targetLanguage: "ko" });
  assert.equal(readPreferredReadingPosition("book")?.episodeNumber, 12);
  writeReadingBookmark({ seriesId: "book", episodeNumber: 3, positionIndex: 5, paragraphIndex: 2, sentenceIndex: 1, mode: "bilingual", sourceLanguage: "ja", targetLanguage: "en" });
  assert.equal(readPreferredReadingPosition("book")?.episodeNumber, 3, "bookmark takes precedence across episodes");
  assert.equal(readEpisodeReadingPosition("book", 12)?.positionIndex, 20, "another episode retains its history");
  const history = readReadingHistory("book")!;
  const href = applyReadingModeToHref("/read/book/12?readerKey=r", history);
  assert.match(href, /targetLanguage=ko/);
  assert.match(href, /resumeParagraph=8/);
  assert.match(href, /readerKey=r/);
  window.location.search = "?resumeIndex=2&resumeParagraph=1&resumeSentence=0&bilingual=1&targetLanguage=ko";
  assert.equal(readEpisodeReadingPosition("book", 3)?.positionIndex, 2, "explicit history link wins over bookmark in the same episode");
  window.location.search = "";
  assert.equal(resolveReadingPositionIndex([{ paragraphIndex: 8, sentenceIndex: 2 }, { paragraphIndex: 2, sentenceIndex: 1 }], history), 0);
  assert.equal(hasSameReadingCoordinates(history, { ...history, positionIndex: 99 }), true, "same sentence should show only bookmark");
  assert.equal(hasSameReadingCoordinates(history, { ...history, sentenceIndex: 3 }), false);
  values.set("duonovel:reading-history:broken", "{");
  assert.equal(readReadingHistory("broken"), null);

  const english = parseTranslationLearningPreference({ customRequest: "英語の対訳は中学レベルの簡単な文法にして" })!;
  assert.equal(english.language, "en");
  assert.equal(english.level, "beginner");
  const korean = parseTranslationLearningPreference({ learningLanguage: "ko", learningLevel: "starter", translationLearningRequest: "해요体で統一" })!;
  assert.match(buildTranslationLearningInstruction(korean, "ko")!, /Hangul/);
  assert.match(buildTranslationLearningInstruction(korean, "ko")!, /해요/);
  assert.equal(buildTranslationLearningInstruction(korean, "en"), null, "Korean level must not alter unrelated English translation");
  assert.equal(parseTranslationLearningPreference({ customRequest: "英語教師を主人公にした冒険" }), null);
  assert.equal(parseTranslationLearningPreference({ language: "en", level: "invalid" }), null);

  const anchors = normalizeScrollAnchors([{ source: 100, target: 200 }, { source: 100, target: 250 }, { source: 200, target: 350 }]);
  assert.equal(anchors.length, 2);
  assert.equal(mapScrollPosition(anchors, 150), 287.5);
  const scrollRoot = document.createElement("div");
  scrollRoot.innerHTML = `<section data-bilingual-pane="source"><div data-bilingual-scroll="source"><span data-bilingual-segment-id="a"></span><span data-bilingual-segment-id="b"></span></div></section><section data-bilingual-pane="target"><div data-bilingual-scroll="target"><span data-bilingual-segment-id="a"></span><span data-bilingual-segment-id="b"></span></div></section>`;
  document.body.appendChild(scrollRoot);
  const source = scrollRoot.querySelector<HTMLDivElement>('[data-bilingual-scroll="source"]')!;
  const target = scrollRoot.querySelector<HTMLDivElement>('[data-bilingual-scroll="target"]')!;
  for (const [pane, positions] of [[source, [300, 500]], [target, [600, 1000]]] as const) {
    Object.defineProperties(pane, { clientHeight: { value: 200 }, clientTop: { value: 0 }, scrollHeight: { value: 2000 } });
    pane.scrollTop = pane === source ? 250 : 650;
    pane.getBoundingClientRect = () => ({ top: 0, height: 200 }) as DOMRect;
    pane.scrollTo = ((args: ScrollToOptions) => { pane.scrollTop = args.top ?? pane.scrollTop; }) as typeof pane.scrollTo;
    pane.querySelectorAll<HTMLElement>("span").forEach((node, index) => {
      node.getBoundingClientRect = () => ({ top: positions[index] - pane.scrollTop, height: 20 }) as DOMRect;
    });
  }
  claimLinkedScroll(source, "source");
  assert.equal(syncOtherPaneScroll("source", source), false);
  assert.equal(Number(target.scrollTop), 650, "taking ownership does not snap to a different absolute alignment");
  source.scrollTop += 5;
  syncOtherPaneScroll("source", source);
  assert.equal(Number(target.scrollTop), 660, "small movement creates proportionate, continuous movement");
  assert.equal(syncOtherPaneScroll("target", target), true, "follower scroll cannot create a feedback loop");
  assert.equal(Number(source.scrollTop), 255);
  claimLinkedScroll(target, "target");
  target.scrollTop += 10;
  syncOtherPaneScroll("target", target);
  assert.equal(Number(source.scrollTop), 260, "the other pane can take over immediately");
  scrollRoot.remove();

  const host = document.getElementById("app")!;
  const root = createRoot(host);
  let sentenceTaps = 0;
  const segment = { id: "s", sourceText: "私は行く必要がある。", translatedText: "I have to have it.", paragraphIndex: 0, sentenceIndex: 0, startOffset: 0, endOffset: 10 };
  const common = {
    languageLabel: "English", languageTag: "en" as const, segments: [segment],
    selectedSegmentId: "s", hoveredSegmentId: null, scrollRef: { current: null },
    registerSegmentRef: () => {}, onSelectSegment: () => { sentenceTaps += 1; },
    onHoverSegment: () => {}, onReadingPositionChange: () => {},
    displaySettings: { fontScale: 1, lineHeight: "normal", showMarker: true, hideEffects: false } as StoredWebSpeechDisplaySettings,
  };
  await act(async () => { root.render(<BilingualPane {...common} side="source" />); });
  assert.equal(host.querySelectorAll("button").length, 0, "upper pane does not offer word lookup");
  const span = host.querySelector<HTMLElement>('[data-bilingual-segment-id="s"]')!;
  await act(async () => { span.click(); span.click(); });
  assert.equal(sentenceTaps, 2, "repeated tap on highlighted upper sentence recenters it");
  await act(async () => {
    root.render(
      <BilingualPane
        {...common}
        side="target"
        onSelectWord={() => {
          throw new Error("tap word lookup must not be invoked");
        }}
      />
    );
  });
  assert.equal(
    host.querySelectorAll("button").length,
    0,
    "the current Reader must not render removed tap word-lookup controls"
  );
  await act(async () => { root.unmount(); });
  console.log("PASS: reading positions, learning preferences, linked scrolling and current bilingual sentence controls");
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
