import {
  getSeriesPublicationStatus,
  type SeriesRow,
} from "@/features/write/writeShared";
import {
  getSeriesContentRating,
  type SeriesContentRating,
} from "@/lib/contentRating";
import { isSchemaCompatibilityReadFailure } from "@/lib/reliability/readOnly";
import { createPublicServerClient } from "@/lib/supabase/serverPublic";

/**
 * Issue #137 R0-1 PR-F (案 D): the public catalog cards come from one shared
 * 60 s `unstable_cache` entry. A stale entry (a rebuild racing an author's
 * write, a rebuild that keeps failing, or a direct Data API write that never
 * calls `updateTag`) could keep showing a withdrawn work, or a work changed to
 * R18 with its old general rating. Before any card leaves the server, it is
 * checked against an UNcached projection of the two fields that gate
 * exposure: publication status and effective content rating.
 *
 * Title/summary and other display fields still follow the cache (about 60 s);
 * that delay is accepted as S3 and is intentionally not covered here.
 */

export type PublicCatalogProjection = Map<string, SeriesContentRating>;

type ProjectionCardFields = {
  seriesId: string;
  contentRating: SeriesContentRating;
};

const PUBLIC_CATALOG_PROJECTION_SELECT =
  "id, content_rating, content_warnings, publication_status";
const PUBLIC_CATALOG_PROJECTION_PAGE_SIZE = 1000;

type ProjectionQueryResult = {
  data: unknown[] | null;
  error: { message: string } | null;
};

type ProjectionClient = {
  from(table: "series"): {
    select(columns: string): {
      eq(column: "publication_status", value: "public"): {
        order(column: "id", options: { ascending: true }): {
          range(from: number, to: number): PromiseLike<ProjectionQueryResult>;
        };
      };
    };
  };
};

/**
 * Reads, without any cache, the id and effective content rating of every
 * series that is public right now. Schema-compatibility failures retry with
 * `*` exactly like fetchPublicSeriesRows; every other failure throws so the
 * caller fails closed instead of returning stale cards.
 */
export async function fetchFreshPublicCatalogProjection(
  client: ProjectionClient = createPublicServerClient() as unknown as ProjectionClient
): Promise<PublicCatalogProjection> {
  const PAGE_SIZE = PUBLIC_CATALOG_PROJECTION_PAGE_SIZE;
  const projection: PublicCatalogProjection = new Map();

  const fetchPage = (start: number, selectClause: string) =>
    client
      .from("series")
      .select(selectClause)
      .eq("publication_status", "public")
      .order("id", { ascending: true })
      .range(start, start + PAGE_SIZE - 1);

  for (let start = 0; ; start += PAGE_SIZE) {
    let result = await fetchPage(start, PUBLIC_CATALOG_PROJECTION_SELECT);
    if (result.error && isSchemaCompatibilityReadFailure(result.error)) {
      result = await fetchPage(start, "*");
    }
    if (result.error) {
      throw new Error(`public catalog projection の取得に失敗: ${result.error.message}`);
    }

    const pageRows = (result.data ?? []) as SeriesRow[];
    for (const row of pageRows) {
      if (typeof row?.id !== "string" || row.id.length === 0) continue;
      if (getSeriesPublicationStatus(row) !== "public") continue;
      projection.set(row.id, getSeriesContentRating(row));
    }

    if (pageRows.length < PAGE_SIZE) break;
  }

  return projection;
}

/**
 * Keeps only cards whose work is still public AND whose current effective
 * content rating equals the cached card's rating. Any disagreement drops the
 * card (never "upgrades" it), so a stale general card for a work that is now
 * R18 cannot reach a viewer who has not opted in.
 */
export function reconcileCardsWithFreshProjection<T extends ProjectionCardFields>(
  cards: readonly T[],
  projection: PublicCatalogProjection
): T[] {
  return cards.filter((card) => {
    const currentRating = projection.get(card.seriesId);
    return currentRating !== undefined && currentRating === card.contentRating;
  });
}

/**
 * Loads the cached cards and the fresh projection in parallel and returns only
 * the reconciled cards. If either side fails the whole call rejects: stale
 * cards are never returned as a fallback.
 */
export async function loadFreshlyReconciledPublicCards<T extends ProjectionCardFields>(
  loadCachedCards: () => Promise<T[]>,
  loadProjection: () => Promise<PublicCatalogProjection> = () =>
    fetchFreshPublicCatalogProjection()
): Promise<T[]> {
  const [cards, projection] = await Promise.all([
    loadCachedCards(),
    loadProjection(),
  ]);
  return reconcileCardsWithFreshProjection(cards, projection);
}
