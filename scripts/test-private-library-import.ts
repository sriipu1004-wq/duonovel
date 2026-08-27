import assert from "node:assert/strict";
import { DOMParser, Element, HTMLElement, Node } from "linkedom";
import { strToU8, zipSync } from "fflate";
import { parseDocxImport } from "../src/lib/library/parseDocxImport";
import { parseEpubImport } from "../src/lib/library/parseEpubImport";
import { parseTxtImport } from "../src/lib/library/parseTxtImport";
import { collectTranslationTerminologyCandidates } from "../src/lib/translation/openAITranslation";

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
  assert.ok(parsed.units.every((unit) => unit.body.length <= 7_500));
  assert.equal(parsed.units[0]?.sectionNumber, 1);
  assert.equal(parsed.units.at(-1)?.sectionNumber, 2);
}

function testMultilingualHeadings() {
  const parsed = parseTxtImport(
    "Capítulo 1\n\nUno.\n\nCapítulo 2\n\nDos.\n\nCapítulo 3\n\nTres."
  );
  assert.equal(parsed.sections.length, 3);
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

testThousandChapterTxt();
testLongLogicalSection();
testMultilingualHeadings();
testEpub();
testDocx();
testTerminologyCandidates();

console.log("private library import tests passed");
