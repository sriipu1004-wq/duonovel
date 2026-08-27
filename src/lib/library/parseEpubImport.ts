import {
  buildParsedBookImport,
  type ParsedBookImport,
  type ParsedBookSectionInput,
} from "@/lib/library/bookImport";
import { findZipEntry, readSafeZipTextEntries, resolveZipPath } from "@/lib/library/zipBook";
import { parseSupportedLanguageTag, type SupportedLanguageTag } from "@/lib/translation/languageRegistry";

export type ParsedEpubFile = {
  parsed: ParsedBookImport;
  suggestedTitle: string;
  suggestedAuthor: string;
  suggestedLanguage: SupportedLanguageTag | null;
  formatLabel: string;
};

type ManifestItem = {
  id: string;
  href: string;
  mediaType: string;
  properties: string;
};

function parseXml(value: string, label: string): XMLDocument {
  const document = new DOMParser().parseFromString(value, "application/xml");
  if (document.getElementsByTagName("parsererror").length > 0) {
    throw new Error(`${label}のXMLを読み取れませんでした。`);
  }
  return document;
}

function firstElementByLocalName(
  parent: Document | Element,
  name: string
): Element | null {
  const namespaced = parent.getElementsByTagNameNS("*", name)[0] ?? null;
  if (namespaced) return namespaced;
  return (
    Array.from(parent.querySelectorAll("*")).find(
      (element) =>
        element.localName === name ||
        element.localName.endsWith(`:${name}`) ||
        element.tagName.endsWith(`:${name}`)
    ) ?? null
  );
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

function metadataText(document: XMLDocument, name: string): string {
  return firstElementByLocalName(document, name)?.textContent?.trim() ?? "";
}

function normalizeLanguage(value: string): SupportedLanguageTag | null {
  const normalized = value.trim().replace(/_/gu, "-");
  const direct = parseSupportedLanguageTag(normalized);
  if (direct) return direct;
  const lower = normalized.toLowerCase();
  if (lower.startsWith("zh-hant") || lower.includes("-tw") || lower.includes("-hk")) {
    return "zh-Hant";
  }
  if (lower.startsWith("zh")) return "zh-Hans";
  return parseSupportedLanguageTag(lower.split("-", 1)[0]);
}

function textFromContentDocument(value: string): {
  title: string;
  body: string;
} {
  const document = new DOMParser().parseFromString(value, "text/html");
  document
    .querySelectorAll("script, style, svg, nav, rt, rp, noscript")
    .forEach((element) => element.remove());

  const blockTags = new Set([
    "ADDRESS",
    "ARTICLE",
    "ASIDE",
    "BLOCKQUOTE",
    "DIV",
    "DL",
    "FIGCAPTION",
    "FIGURE",
    "FOOTER",
    "H1",
    "H2",
    "H3",
    "H4",
    "H5",
    "H6",
    "HEADER",
    "HR",
    "LI",
    "MAIN",
    "OL",
    "P",
    "PRE",
    "SECTION",
    "TABLE",
    "TR",
    "UL",
  ]);
  let output = "";

  function append(valueToAppend: string) {
    output += valueToAppend;
  }

  function visit(node: Node) {
    if (node.nodeType === Node.TEXT_NODE) {
      append((node.textContent ?? "").replace(/[\t\n\r ]+/gu, " "));
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    if (node.tagName === "BR") {
      append("\n");
      return;
    }

    const isBlock = blockTags.has(node.tagName);
    if (isBlock && output && !output.endsWith("\n")) append("\n");
    node.childNodes.forEach(visit);
    if (isBlock && !output.endsWith("\n")) append("\n");
  }

  (document.body ?? document.documentElement).childNodes.forEach(visit);
  const title =
    document.querySelector("h1, h2, h3")?.textContent?.trim() ||
    document.querySelector("title")?.textContent?.trim() ||
    "";
  const body = output
    .replace(/\u00a0/gu, " ")
    .replace(/[ ]+\n/gu, "\n")
    .replace(/\n[ ]+/gu, "\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();

  return { title, body };
}

function buildNavigationTitleMap(args: {
  entries: Map<string, string>;
  opfPath: string;
  manifest: ManifestItem[];
}): Map<string, string> {
  const titleByPath = new Map<string, string>();
  const navItem = args.manifest.find((item) =>
    item.properties.split(/\s+/u).includes("nav")
  );

  if (navItem) {
    const navPath = resolveZipPath(args.opfPath, navItem.href);
    const navSource = findZipEntry(args.entries, navPath);
    if (navSource) {
      const document = new DOMParser().parseFromString(navSource, "text/html");
      const navElements = Array.from(document.querySelectorAll("nav"));
      const toc =
        navElements.find((element) =>
          `${element.getAttribute("epub:type") ?? ""} ${element.getAttribute("type") ?? ""}`
            .toLowerCase()
            .includes("toc")
        ) ?? navElements[0];
      toc?.querySelectorAll("a[href]").forEach((anchor) => {
        const href = anchor.getAttribute("href") ?? "";
        const title = anchor.textContent?.replace(/\s+/gu, " ").trim() ?? "";
        if (href && title) {
          titleByPath.set(resolveZipPath(navPath, href), title.slice(0, 200));
        }
      });
    }
  }

  if (titleByPath.size > 0) return titleByPath;

  const ncxItem = args.manifest.find(
    (item) => item.mediaType === "application/x-dtbncx+xml"
  );
  if (!ncxItem) return titleByPath;
  const ncxPath = resolveZipPath(args.opfPath, ncxItem.href);
  const ncxSource = findZipEntry(args.entries, ncxPath);
  if (!ncxSource) return titleByPath;
  const document = parseXml(ncxSource, "EPUB目次");

  elementsByLocalName(document, "navPoint").forEach((navPoint) => {
    const content = firstElementByLocalName(navPoint, "content");
    const label = firstElementByLocalName(navPoint, "text");
    const href = content?.getAttribute("src") ?? "";
    const title = label?.textContent?.replace(/\s+/gu, " ").trim() ?? "";
    if (href && title) {
      titleByPath.set(resolveZipPath(ncxPath, href), title.slice(0, 200));
    }
  });

  return titleByPath;
}

function assertEpubContentIsNotEncrypted(entries: Map<string, string>): void {
  if (findZipEntry(entries, "META-INF/rights.xml")) {
    throw new Error("DRMで保護された可能性のあるEPUBには対応していません。");
  }

  const encryption = findZipEntry(entries, "META-INF/encryption.xml");
  if (!encryption) return;
  const document = parseXml(encryption, "EPUB暗号化情報");
  const encryptedPaths = elementsByLocalName(document, "CipherReference")
    .map((element) => element.getAttribute("URI") ?? "")
    .filter((path) => /\.(?:xhtml|html?|opf|ncx)$/iu.test(path));
  if (encryptedPaths.length > 0) {
    throw new Error("本文が暗号化されたEPUBには対応していません。");
  }
}

export function parseEpubImport(
  buffer: ArrayBuffer,
  fileName: string
): ParsedEpubFile {
  const entries = readSafeZipTextEntries(buffer);
  const mimetype = findZipEntry(entries, "mimetype")?.trim();
  if (mimetype && mimetype !== "application/epub+zip") {
    throw new Error("EPUBファイルとして認識できませんでした。");
  }
  assertEpubContentIsNotEncrypted(entries);

  const containerSource = findZipEntry(entries, "META-INF/container.xml");
  if (!containerSource) throw new Error("EPUBのcontainer.xmlが見つかりません。");
  const container = parseXml(containerSource, "EPUB構成");
  const rootfile = firstElementByLocalName(container, "rootfile");
  const opfPath = rootfile?.getAttribute("full-path") ?? "";
  const opfSource = opfPath ? findZipEntry(entries, opfPath) : null;
  if (!opfPath || !opfSource) throw new Error("EPUBの本文構成を確認できませんでした。");
  const opf = parseXml(opfSource, "EPUB本文構成");

  const manifest = elementsByLocalName(opf, "item")
    .map((element): ManifestItem => ({
      id: element.getAttribute("id") ?? "",
      href: element.getAttribute("href") ?? "",
      mediaType: element.getAttribute("media-type") ?? "",
      properties: element.getAttribute("properties") ?? "",
    }))
    .filter((item) => item.id && item.href);
  const manifestById = new Map(manifest.map((item) => [item.id, item]));
  const titleByPath = buildNavigationTitleMap({ entries, opfPath, manifest });
  const spineItems = elementsByLocalName(opf, "itemref")
    .filter((element) => element.getAttribute("linear") !== "no")
    .map((element) => manifestById.get(element.getAttribute("idref") ?? ""))
    .filter((item): item is ManifestItem => Boolean(item));

  const sections: ParsedBookSectionInput[] = [];
  spineItems.forEach((item, index) => {
    if (!/(?:xhtml|html)/iu.test(item.mediaType)) return;
    const contentPath = resolveZipPath(opfPath, item.href);
    const content = findZipEntry(entries, contentPath);
    if (!content) return;
    const extracted = textFromContentDocument(content);
    if (!/[\p{L}\p{N}]/u.test(extracted.body) || extracted.body.length < 20) {
      return;
    }
    const navigationTitle = titleByPath.get(contentPath);
    sections.push({
      title: (navigationTitle || extracted.title || `第${index + 1}章`).slice(0, 200),
      body: extracted.body,
    });
  });

  const suggestedTitle = metadataText(opf, "title") || fileName.replace(/\.epub$/iu, "");
  const suggestedAuthor = metadataText(opf, "creator");
  const suggestedLanguage = normalizeLanguage(metadataText(opf, "language"));

  return {
    parsed: buildParsedBookImport({
      sections,
      usedDetectedHeadings: titleByPath.size > 0,
      warnings:
        titleByPath.size > 0
          ? []
          : ["EPUBの目次を取得できなかったため、本文ファイルの順序で章を作成しました。"],
    }),
    suggestedTitle: suggestedTitle.slice(0, 200),
    suggestedAuthor: suggestedAuthor.slice(0, 200),
    suggestedLanguage,
    formatLabel: "EPUB",
  };
}
