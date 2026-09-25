export const PUBLIC_SEARCH_PAGE_SIZE = 24;

export type PublicSearchPaginationItem = number | "ellipsis";

export function parsePublicSearchPage(value: unknown): number {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string" && typeof raw !== "number") return 1;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return 1;

  const integer = Math.floor(parsed);
  return integer >= 1 ? integer : 1;
}

export function clampPublicSearchPage(page: number, totalPages: number): number {
  const safeTotalPages = Math.max(1, Math.floor(totalPages));
  return Math.min(Math.max(1, Math.floor(page)), safeTotalPages);
}

export function buildPublicSearchPaginationItems(
  currentPage: number,
  totalPages: number
): PublicSearchPaginationItem[] {
  const safeTotalPages = Math.max(1, Math.floor(totalPages));
  const safeCurrentPage = clampPublicSearchPage(currentPage, safeTotalPages);

  if (safeTotalPages <= 7) {
    return Array.from({ length: safeTotalPages }, (_, index) => index + 1);
  }

  const pages = new Set<number>([
    1,
    safeTotalPages,
    safeCurrentPage - 1,
    safeCurrentPage,
    safeCurrentPage + 1,
  ]);

  if (safeCurrentPage <= 3) {
    pages.add(2);
    pages.add(3);
    pages.add(4);
  }

  if (safeCurrentPage >= safeTotalPages - 2) {
    pages.add(safeTotalPages - 1);
    pages.add(safeTotalPages - 2);
    pages.add(safeTotalPages - 3);
  }

  const sorted = Array.from(pages)
    .filter((page) => page >= 1 && page <= safeTotalPages)
    .sort((left, right) => left - right);

  const items: PublicSearchPaginationItem[] = [];
  let previous = 0;

  for (const page of sorted) {
    if (previous > 0 && page - previous > 1) {
      items.push("ellipsis");
    }
    items.push(page);
    previous = page;
  }

  return items;
}
