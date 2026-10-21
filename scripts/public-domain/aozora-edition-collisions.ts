import {
  canonicalAozoraIdentityPart,
  groupAozoraRows,
  type CsvRow,
} from "./aozora";

export type AozoraEditionSelectedManifest = {
  id: string;
  original_title: string;
  original_author: string;
  source_url: string;
};

export type AozoraEditionCollision = {
  manifestId: string;
  originalTitle: string;
  originalAuthor: string;
  providerCardIdMatched: boolean;
  sourceCardUrlMatched: boolean;
  sourceTitleMatched: boolean;
  sourceAuthorMatched: boolean;
  sameTitleCardCount: number;
  sameAuthorSameTitleCardCount: number;
  otherEditionCardIds: string[];
  distinctAuthorCardIds: string[];
  status: "UNIQUE" | "SAME_AUTHOR_MULTIPLE_EDITIONS" | "SAME_TITLE_OTHER_AUTHOR" | "SOURCE_CARD_MISMATCH";
};

type CatalogWork = {
  id: string;
  title: string;
  author: string;
  sourceUrl: string;
};

function toCatalogWork(id: string, sourceRows: CsvRow[]): CatalogWork {
  const primary = sourceRows[0] ?? {};
  const author = sourceRows.find(row => row["役割フラグ"]?.trim() === "著者");
  return {
    id,
    title: primary["作品名"]?.trim() ?? "",
    author: author ? (author["姓"]?.trim() ?? "") + (author["名"]?.trim() ?? "") : "",
    sourceUrl: primary["図書カードURL"]?.trim() ?? "",
  };
}

/** Do not select the first matching title and accidentally hide separate editions. */
export function auditAozoraEditionCollisions(
  catalogRows: CsvRow[],
  selectedManifests: AozoraEditionSelectedManifest[]
): AozoraEditionCollision[] {
  const works = [...groupAozoraRows(catalogRows)].map(([id, rows]) => toCatalogWork(id, rows));
  const byId = new Map(works.map(work => [work.id, work]));
  const byTitle = new Map<string, CatalogWork[]>();
  for (const work of works) {
    const key = canonicalAozoraIdentityPart(work.title);
    if (!key) continue;
    const group = byTitle.get(key) ?? [];
    group.push(work);
    byTitle.set(key, group);
  }

  const manifestIds = new Set<string>();
  return selectedManifests.map(m => {
    if (!/^aozora-[0-9]{6}$/u.test(m.id) || !m.original_title || !m.original_author || !m.source_url) {
      throw new Error("AOZORA_EDITION_MANIFEST_INVALID");
    }
    if (manifestIds.has(m.id)) throw new Error("AOZORA_EDITION_DUPLICATE_MANIFEST");
    manifestIds.add(m.id);

    const exactId = m.id.slice("aozora-".length);
    const entry = byId.get(exactId);
    const titleKey = canonicalAozoraIdentityPart(m.original_title);
    const authorKey = canonicalAozoraIdentityPart(m.original_author);
    const titles = byTitle.get(titleKey) ?? [];
    const sameAuthor = titles.filter(c => canonicalAozoraIdentityPart(c.author) === authorKey);
    const sourceCardUrlMatched = entry?.sourceUrl === m.source_url;
    const sourceTitleMatched = !!entry && canonicalAozoraIdentityPart(entry.title) === titleKey;
    const sourceAuthorMatched = !!entry && canonicalAozoraIdentityPart(entry.author) === authorKey;
    const providerCardIdMatched = !!entry;
    const mismatch = !sourceCardUrlMatched || !sourceTitleMatched || !sourceAuthorMatched;
    const status = mismatch ? "SOURCE_CARD_MISMATCH"
      : titles.length > sameAuthor.length ? "SAME_TITLE_OTHER_AUTHOR"
      : sameAuthor.length > 1 ? "SAME_AUTHOR_MULTIPLE_EDITIONS"
      : "UNIQUE";
    return {
      manifestId: m.id,
      originalTitle: m.original_title,
      originalAuthor: m.original_author,
      providerCardIdMatched,
      sourceCardUrlMatched,
      sourceTitleMatched,
      sourceAuthorMatched,
      sameTitleCardCount: titles.length,
      sameAuthorSameTitleCardCount: sameAuthor.length,
      otherEditionCardIds: sameAuthor.filter(c => c.id !== exactId).map(c => c.id).sort(),
      distinctAuthorCardIds: titles.filter(c => canonicalAozoraIdentityPart(c.author) !== authorKey)
        .map(c => c.id).sort(),
      status,
    };
  });
}
