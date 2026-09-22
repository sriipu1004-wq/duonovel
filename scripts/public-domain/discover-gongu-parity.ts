import { writeFileSync } from "node:fs";

const authors = [
  { name: "김동인", deathYear: 1951 },
  { name: "현진건", deathYear: 1943 },
  { name: "나도향", deathYear: 1926 },
  { name: "최서해", deathYear: 1932 },
  { name: "방정환", deathYear: 1931 },
  { name: "김소월", deathYear: 1934 },
  { name: "한용운", deathYear: 1944 },
  { name: "이상화", deathYear: 1943 },
  { name: "이장희", deathYear: 1929 },
  { name: "이육사", deathYear: 1944 },
  { name: "윤봉길", deathYear: 1932 },
  { name: "홍난파", deathYear: 1941 },
  { name: "나혜석", deathYear: 1948 },
] as const;

const base = "https://gongu.copyright.or.kr";
const listPath = "/gongu/wrt/wrtCl/listWrtText.do";

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    redirect: "error",
    headers: { "user-agent": "LIB-read-child73-rights-discovery/1.0" },
  });
  if (!response.ok) throw new Error(String(response.status) + " " + url);
  return await response.text();
}

function extractWorkLinks(html: string): Array<{ wrtSn: string; href: string }> {
  const seen = new Set<string>();
  const result: Array<{ wrtSn: string; href: string }> = [];
  for (const match of html.matchAll(/href=["']([^"']*wrtSn=(\d+)[^"']*)["']/giu)) {
    const href = decodeHtml(match[1] ?? "");
    const wrtSn = match[2] ?? "";
    if (!wrtSn || seen.has(wrtSn)) continue;
    seen.add(wrtSn);
    result.push({ wrtSn, href: new URL(href, base).toString() });
  }
  return result;
}

function stripTags(value: string): string {
  return decodeHtml(value.replace(/<[^>]+>/gu, " ").replace(/\s+/gu, " ").trim());
}

function pickField(html: string, label: string): string | null {
  const normalized = html.replace(/\s+/gu, " ");
  const at = normalized.indexOf(label);
  if (at < 0) return null;
  const tail = normalized.slice(at + label.length, at + label.length + 700);
  const cell = tail.match(/<\/[^>]+>\s*<[^>]+>\s*([^<]{1,300})</u)?.[1];
  return cell ? stripTags(cell) : null;
}

function extractTitle(html: string): string | null {
  const h2 = html.match(/<h2[^>]*>\s*([^<]+?)\s*<\/h2>/iu)?.[1]?.trim();
  if (h2) return decodeHtml(h2);
  return null;
}

function extractYear(value: string | null): number | null {
  const year = value?.match(/(?:18|19|20)\d{2}/u)?.[0];
  return year ? Number(year) : null;
}

async function discoverAuthor(author: (typeof authors)[number]) {
  const attempts = [
    { searchWrd: author.name },
    { searchKeyword: author.name },
    { searchText: author.name },
  ];
  let best: { html: string; links: ReturnType<typeof extractWorkLinks>; score: number } | null = null;

  for (const attempt of attempts) {
    const params = new URLSearchParams({
      licenseCd: "97",
      menuNo: "200019",
      pageIndex: "1",
      pageUnit: "100",
      sortSe: "date",
      ...attempt,
    });
    const html = await fetchText(base + listPath + "?" + params.toString());
    const links = extractWorkLinks(html);
    const score = html.split(author.name).length - 1;
    if (!best || score > best.score) best = { html, links, score };
  }

  if (!best || best.score === 0) return [];

  const results = [];
  for (const link of best.links.slice(0, 120)) {
    let html: string;
    try {
      html = await fetchText(link.href);
    } catch {
      continue;
    }
    if (!html.includes(author.name)) continue;
    const title = extractTitle(html);
    const publication =
      pickField(html, "공표년도") ?? pickField(html, "공표일자(년도)");
    const year = extractYear(publication);
    const expired =
      /만료 저작물/u.test(html) ||
      /자유이용\s*만료/u.test(html) ||
      /수집연계유형[\s\S]{0,300}만료/u.test(html);
    const hasTxt = /\.txt(?:["'<\s]|$)/iu.test(html);
    if (!title || !year || year > 1930 || !expired || !hasTxt) continue;
    results.push({
      wrtSn: link.wrtSn,
      title,
      author: author.name,
      authorDeathYear: author.deathYear,
      publicationYear: year,
      sourceUrl: link.href,
    });
  }
  return results;
}

async function main() {
  const all: Array<{
    wrtSn: string;
    title: string;
    author: string;
    authorDeathYear: number;
    publicationYear: number;
    sourceUrl: string;
  }> = [];

  for (const author of authors) {
    const found = await discoverAuthor(author);
    all.push(...found);
    console.log(author.name + ": " + found.length);
  }

  const unique = Array.from(
    new Map(all.map((item) => [item.wrtSn, item])).values()
  ).sort(
    (a, b) =>
      a.publicationYear - b.publicationYear ||
      a.wrtSn.localeCompare(b.wrtSn)
  );

  writeFileSync(
    "public-domain/audits/child73-gongu-discovered.json",
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        count: unique.length,
        works: unique,
      },
      null,
      2
    ) + "\n"
  );

  console.log("TOTAL_SAFE_CANDIDATES=" + unique.length);
  if (unique.length < 37) {
    throw new Error(
      "Need at least 37 safe Korean candidates, found " + unique.length
    );
  }
}

main();
