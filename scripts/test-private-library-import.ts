import assert from "node:assert/strict";
import { DOMParser, Element, HTMLElement, Node } from "linkedom";
import { strToU8, zipSync } from "fflate";
import { parseDocxImport } from "../src/lib/library/parseDocxImport";
import { parseEpubImport } from "../src/lib/library/parseEpubImport";
import { parseTxtImport } from "../src/lib/library/parseTxtImport";
import { buildParsedBookImport } from "../src/lib/library/bookImport";
import {
  normalizeImportedBodyText,
  normalizeImportedText,
} from "../src/lib/library/importTextNormalization";
import {
  PRIVATE_LIBRARY_LIMITS,
  countUnicodeCharacters,
} from "../src/lib/library/privateLibrary";
import { parsePrivateLibraryImportUnits } from "../src/lib/library/privateLibraryImportUnits";
import { collectTranslationTerminologyCandidates } from "../src/lib/translation/openAITranslation";
import { detectSourceLanguageFromText } from "../src/lib/translation/detectSourceLanguage";

Object.assign(globalThis, { DOMParser, Element, HTMLElement, Node });

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;
}

function testThousandChapterTxt() {
  const source = Array.from(
    { length: 1_000 },
    (_, index) =>
      `Chapter ${index + 1}\n\nAlice entered Silver Keep in episode ${index + 1}.`
  ).join("\n\n");
  const parsed = parseTxtImport(source);
  assert.equal(parsed.sections.length, 1_000);
  assert.equal(parsed.units.length, 1_000);
  assert.equal(parsed.sections[999]?.title, "Chapter 1000");
}

function testLongLogicalSection() {
  const source = `Chapter 1\n\n${"A long sentence about Alice and Silver Keep. ".repeat(450)}\n\nChapter 2\n\nEnd.`;
  const parsed = parseTxtImport(source);
  assert.equal(parsed.sections.length, 2);
  assert.ok((parsed.sections[0]?.partCount ?? 0) > 1);
  assert.ok(
    parsed.units.every(
      (unit) => unit.body.length <= PRIVATE_LIBRARY_LIMITS.maxChapterChars
    )
  );
  assert.equal(parsed.units[0]?.title, "Chapter 1 - 1");
  assert.equal(
    parsed.units[(parsed.sections[0]?.partCount ?? 1) - 1]?.title,
    `Chapter 1 - ${parsed.sections[0]?.partCount}`
  );
  assert.ok(parsed.warnings.some((warning) => warning.includes("対訳原価")));
  const splitLengths = parsed.units
    .filter((unit) => unit.sectionNumber === 1)
    .map((unit) => unit.body.length);
  assert.ok(Math.max(...splitLengths) - Math.min(...splitLengths) < 200);
  assert.ok(
    parsed.units
      .filter((unit) => unit.sectionNumber === 1)
      .every((unit) => /[.!?]$/u.test(unit.body))
  );
  assert.equal(parsed.units[0]?.sectionNumber, 1);
  assert.equal(parsed.units.at(-1)?.sectionNumber, 2);

  assert.throws(
    () =>
      buildParsedBookImport({
        sections: [{ title: "長すぎる一文", body: "あ".repeat(6_001) }],
        usedDetectedHeadings: true,
      }),
    /文を切らずに対訳用分割できません/u
  );
}

function testMultilingualHeadings() {
  const parsed = parseTxtImport(
    "Capítulo 1\n\nUno.\n\nCapítulo 2\n\nDos.\n\nCapítulo 3\n\nTres."
  );
  assert.equal(parsed.sections.length, 3);
}

function testJapaneseBareEpisodeHeadings() {
  const parsed = parseTxtImport(
    "１話\n\n最初の本文︒\n\n２話\n\n次の本文︑続き︒\n\n３話\n\n最後の本文︒"
  );
  assert.equal(parsed.sections.length, 3);
  assert.equal(parsed.sections[0]?.title, "１話");
  assert.equal(parsed.units[0]?.body, "　最初の本文。");
  assert.equal(parsed.units[1]?.body, "　次の本文、続き。");
}

function testVerticalGlyphNormalizationAndTitleFallback() {
  assert.equal(
    normalizeImportedText("﹁台詞︒﹂﹃引用︕﹄︙︙││││"),
    "「台詞。」『引用！』……――"
  );
  assert.equal(
    normalizeImportedBodyText(
      "一つ目の段落。\n\n二つ目の段落。\n\n「一人目の台詞。」「二人目の台詞。」"
    ),
    "　一つ目の段落。\n\n　二つ目の段落。\n\n「一人目の台詞。」\n「二人目の台詞。」"
  );
  assert.equal(
    normalizeImportedBodyText("First paragraph.\n\nSecond paragraph."),
    "First paragraph.\n\nSecond paragraph."
  );
  const parsed = buildParsedBookImport({
    sections: [
      { title: "冒頭", body: "前付け本文" },
      { title: "", body: "無題の本文" },
      { title: "１話", body: "明示タイトル本文" },
    ],
    usedDetectedHeadings: true,
  });
  assert.deepEqual(
    parsed.sections.map((section) => section.title),
    ["冒頭", "第2話", "１話"]
  );
}

function testDatabaseCompatibleCharacterCount() {
  const parsed = buildParsedBookImport({
    sections: [
      {
        title: "字下げとUnicode",
        body: "本文の段落。\n\n絵文字😀を含む段落。",
      },
    ],
    usedDetectedHeadings: true,
  });
  const body = parsed.units[0]?.body ?? "";

  assert.ok(body.startsWith("　本文"));
  assert.equal(
    parsed.sourceCharCount,
    parsed.units.reduce(
      (total, unit) => total + countUnicodeCharacters(unit.body),
      0
    )
  );
  assert.equal(countUnicodeCharacters("😀"), 1);
  assert.equal("😀".length, 2);

  const validated = parsePrivateLibraryImportUnits(parsed.units);
  assert.ok(validated);
  assert.equal(validated[0]?.body, body);
  assert.ok(validated[0]?.body.startsWith("　本文"));
}

function testEpub() {
  const epub = zipSync({
    mimetype: strToU8("application/epub+zip"),
    "META-INF/container.xml": strToU8(
      `<?xml version="1.0"?><container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`
    ),
    "OEBPS/content.opf": strToU8(
      `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Sample Book</dc:title><dc:creator>Sample Author</dc:creator><dc:language>en</dc:language></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="c1" href="chapter1.xhtml" media-type="application/xhtml+xml"/><item id="c2" href="chapter2.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c1"/><itemref idref="c2"/></spine></package>`
    ),
    "OEBPS/nav.xhtml": strToU8(
      `<html xmlns="http://www.w3.org/1999/xhtml"><body><nav epub:type="toc"><ol><li><a href="chapter1.xhtml">First Chapter</a></li><li><a href="chapter2.xhtml">Second Chapter</a></li></ol></nav></body></html>`
    ),
    "OEBPS/chapter1.xhtml": strToU8(
      `<html><head><title>One</title></head><body><h1>One</h1><p>Alice entered Silver Keep.</p><p>She looked around.</p></body></html>`
    ),
    "OEBPS/chapter2.xhtml": strToU8(
      `<html><head><title>Two</title></head><body><h1>Two</h1><p>Alice returned to Silver Keep.</p><p>The gate opened.</p></body></html>`
    ),
  });
  const parsed = parseEpubImport(asArrayBuffer(epub), "sample.epub");
  assert.equal(parsed.suggestedTitle, "Sample Book");
  assert.equal(parsed.suggestedAuthor, "Sample Author");
  assert.equal(parsed.suggestedLanguage, "en");
  assert.equal(parsed.parsed.sections.length, 2);
  assert.equal(parsed.parsed.sections[0]?.title, "First Chapter");
}

function testDocx() {
  const docx = zipSync({
    "word/document.xml": strToU8(
      `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Chapter 1</w:t></w:r></w:p><w:p><w:r><w:t>Alice entered the keep.</w:t></w:r></w:p><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Chapter 2</w:t></w:r></w:p><w:p><w:r><w:t>Alice returned home.</w:t></w:r></w:p></w:body></w:document>`
    ),
    "docProps/core.xml": strToU8(
      `<?xml version="1.0"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>DOCX Book</dc:title><dc:creator>DOCX Author</dc:creator></cp:coreProperties>`
    ),
  });
  const parsed = parseDocxImport(asArrayBuffer(docx), "sample.docx");
  assert.equal(parsed.suggestedTitle, "DOCX Book");
  assert.equal(parsed.suggestedAuthor, "DOCX Author");
  assert.equal(parsed.parsed.sections.length, 2);
}

function testTerminologyCandidates() {
  const terms = collectTranslationTerminologyCandidates([
    {
      id: "1",
      text: "Alice entered Silver Keep. Alice met Roland inside Silver Keep.",
    },
    { id: "2", text: "Roland left Silver Keep with Alice." },
  ]);
  assert.ok(terms.includes("Alice"));
  assert.ok(terms.includes("Roland"));
  assert.ok(terms.includes("Silver Keep"));
}

function testSourceLanguageDetection() {
  assert.equal(
    detectSourceLanguageFromText("彼女は古い図書館の扉を開けた。そこには不思議な本が並んでいた。"),
    "ja"
  );
  assert.equal(
    detectSourceLanguageFromText("She opened the old library door, and the lantern was waiting inside."),
    "en"
  );
  assert.equal(
    detectSourceLanguageFromText("Elle ouvrit la porte de la bibliothèque, mais la lumière était déjà là."),
    "fr"
  );
  assert.equal(
    detectSourceLanguageFromText("그녀는 오래된 도서관의 문을 열었다. 안에는 등불이 기다리고 있었다."),
    "ko"
  );
  assert.equal(
    detectSourceLanguageFromText("她打开了图书馆的门，这本书里还有一条龙。"),
    "zh-Hans"
  );
  assert.equal(
    detectSourceLanguageFromText("她打開了圖書館的門，這本書裡還有一條龍。"),
    "zh-Hant"
  );
}

testThousandChapterTxt();
testLongLogicalSection();
testMultilingualHeadings();
testJapaneseBareEpisodeHeadings();
testVerticalGlyphNormalizationAndTitleFallback();
testDatabaseCompatibleCharacterCount();
testEpub();
testDocx();
testTerminologyCandidates();
testSourceLanguageDetection();

console.log("private library import tests passed");
