import {
  buildParsedBookImport,
  type ParsedBookImport,
  type ParsedBookSectionInput,
} from "@/lib/library/bookImport";
import { detectTextSections } from "@/lib/library/parseTxtImport";
import { findZipEntry, readSafeZipTextEntries } from "@/lib/library/zipBook";

export type ParsedDocxFile = {
  parsed: ParsedBookImport;
  suggestedTitle: string;
  suggestedAuthor: string;
  formatLabel: string;
};

function parseXml(value: string, label: string): XMLDocument {
  const document = new DOMParser().parseFromString(value, "application/xml");
  if (document.getElementsByTagName("parsererror").length > 0) {
    throw new Error(`${label}を読み取れませんでした。`);
  }
  return document;
}

function elementsByLocalName(
  parent: Document | Element,
  name: string
): Element[] {
  const namespaced = Array.from(parent.getElementsByTagNameNS("*", name));
  if (namespaced.length > 0) return namespaced;
  return Array.from(parent.querySelectorAll("*")).filter(
    (element) =>
      element.localName === name ||
      element.localName.endsWith(`:${name}`) ||
      element.tagName.endsWith(`:${name}`)
  );
}

function firstChildByLocalName(parent: Element, name: string): Element | null {
  return (
    Array.from(parent.children).find(
      (child) =>
        child.localName === name ||
        child.localName.endsWith(`:${name}`) ||
        child.tagName.endsWith(`:${name}`)
    ) ?? null
  );
}

function attributeByLocalName(element: Element | null, name: string): string {
  if (!element) return "";
  return (
    element.getAttribute(name) ??
    Array.from(element.attributes).find(
      (attribute) =>
        attribute.localName === name ||
        attribute.localName.endsWith(`:${name}`) ||
        attribute.name.endsWith(`:${name}`)
    )
      ?.value ??
    ""
  );
}

function paragraphText(paragraph: Element): string {
  let output = "";
  function visit(node: Node) {
    if (!(node instanceof Element)) return;
    const localName = node.localName.includes(":")
      ? node.localName.slice(node.localName.lastIndexOf(":") + 1)
      : node.localName;
    if (localName === "t") output += node.textContent ?? "";
    else if (localName === "tab") output += "\t";
    else if (localName === "br" || localName === "cr") output += "\n";
    else node.childNodes.forEach(visit);
  }
  paragraph.childNodes.forEach(visit);
  return output.replace(/[\t ]+/gu, " ").trim();
}

function paragraphStyle(paragraph: Element): string {
  const properties = firstChildByLocalName(paragraph, "pPr");
  const style = properties ? firstChildByLocalName(properties, "pStyle") : null;
  return attributeByLocalName(style, "val");
}

export function parseDocxImport(
  buffer: ArrayBuffer,
  fileName: string
): ParsedDocxFile {
  const entries = readSafeZipTextEntries(buffer);
  const documentSource = findZipEntry(entries, "word/document.xml");
  if (!documentSource) throw new Error("DOCXの本文が見つかりません。");
  const document = parseXml(documentSource, "DOCX本文");
  const paragraphs = elementsByLocalName(document, "p")
    .map((element) => ({
      text: paragraphText(element),
      style: paragraphStyle(element),
    }))
    .filter((paragraph) => paragraph.text);

  const headingPattern = /^(?:heading|title|titre|título|überschrift|見出し)[-_ ]?[1-6]?$/iu;
  const headingCount = paragraphs.filter((paragraph) =>
    headingPattern.test(paragraph.style)
  ).length;
  let sections: ParsedBookSectionInput[];
  let usedDetectedHeadings = false;

  if (headingCount >= 2) {
    sections = [];
    let currentTitle = "冒頭";
    let currentLines: string[] = [];
    const flush = () => {
      const body = currentLines.join("\n\n").trim();
      if (body) sections.push({ title: currentTitle, body });
      currentLines = [];
    };

    paragraphs.forEach((paragraph) => {
      if (headingPattern.test(paragraph.style)) {
        flush();
        currentTitle = paragraph.text.slice(0, 200);
      } else {
        currentLines.push(paragraph.text);
      }
    });
    flush();
    usedDetectedHeadings = true;
  } else {
    const detected = detectTextSections(
      paragraphs.map((paragraph) => paragraph.text).join("\n\n")
    );
    sections = detected.sections;
    usedDetectedHeadings = detected.usedDetectedHeadings;
  }

  const coreSource = findZipEntry(entries, "docProps/core.xml");
  let suggestedTitle = fileName.replace(/\.docx$/iu, "");
  let suggestedAuthor = "";
  if (coreSource) {
    const core = parseXml(coreSource, "DOCXメタデータ");
    suggestedTitle =
      elementsByLocalName(core, "title")[0]?.textContent?.trim() ||
      suggestedTitle;
    suggestedAuthor =
      elementsByLocalName(core, "creator")[0]?.textContent?.trim() || "";
  }

  return {
    parsed: buildParsedBookImport({
      sections,
      usedDetectedHeadings,
      warnings: usedDetectedHeadings
        ? []
        : ["DOCXに見出し設定が見つからなかったため、本文量から分割しました。"],
    }),
    suggestedTitle: suggestedTitle.slice(0, 200),
    suggestedAuthor: suggestedAuthor.slice(0, 200),
    formatLabel: "DOCX",
  };
}
