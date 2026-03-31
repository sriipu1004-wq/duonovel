type BgmLibraryRow = Record<string, unknown> & {
  id: string;
  slug?: string | null;
  title?: string | null;
  description?: string | null;
  mood?: string | null;
  use_case?: string | null;
  duration_label?: string | null;
  loopable?: boolean | null;
  audio_path?: string | null;
  source_label?: string | null;
  rights_label?: string | null;
  tags?: unknown;
  is_active?: boolean | null;
  sort_order?: number | null;
};

type BgmLibraryFavoriteRow = Record<string, unknown> & {
  bgm_library_id?: string | null;
};

export type BgmLibraryTrack = {
  id: string;
  slug: string;
  title: string;
  description: string;
  mood: string;
  useCase: string;
  durationLabel: string;
  loopable: boolean;
  audioPath: string;
  sourceLabel: string;
  rightsLabel: string;
  tags: string[];
  isActive: boolean;
  sortOrder: number;
};

type SimpleQueryResult<T> = PromiseLike<{
  data: T[] | null;
  error: { message: string } | null;
}>;

type SimpleSupabaseSelectQuery<T> = SimpleQueryResult<T> & {
  eq: (column: string, value: unknown) => SimpleSupabaseSelectQuery<T>;
  order: (
    column: string,
    options?: { ascending?: boolean }
  ) => SimpleSupabaseSelectQuery<T>;
};

type SimpleSupabaseLike = {
  from: (table: string) => {
    select: <T = Record<string, unknown>>(
      columns: string
    ) => SimpleSupabaseSelectQuery<T>;
  };
};

function pickText(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return "";
}

function parseTags(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw
      .map((item) => String(item).trim())
      .filter((item) => item.length > 0);
  }

  if (typeof raw === "string" && raw.trim().length > 0) {
    return raw
      .split(/[\n,、]/)
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }

  return [];
}

function normalizeBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") return value === "true" || value === "1";
  return false;
}

function normalizeSortOrder(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function mapBgmLibraryRow(row: BgmLibraryRow): BgmLibraryTrack {
  return {
    id: row.id,
    slug: pickText(row.slug) || row.id,
    title: pickText(row.title) || "無題BGM",
    description: pickText(row.description),
    mood: pickText(row.mood) || "未分類",
    useCase: pickText(row.use_case) || "未分類",
    durationLabel: pickText(row.duration_label) || "不明",
    loopable: normalizeBoolean(row.loopable),
    audioPath: pickText(row.audio_path),
    sourceLabel: pickText(row.source_label) || "サイト用意BGM",
    rightsLabel: pickText(row.rights_label) || "LIB read内利用想定",
    tags: parseTags(row.tags),
    isActive: normalizeBoolean(row.is_active ?? true),
    sortOrder: normalizeSortOrder(row.sort_order),
  };
}

export async function fetchBgmLibraryTracks(
  supabase: SimpleSupabaseLike
): Promise<BgmLibraryTrack[]> {
  const result = await supabase
    .from("bgm_library")
    .select<BgmLibraryRow>("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("title", { ascending: true });

  if (result.error) {
    console.error("bgm_library fetch failed:", result.error.message);
    return [];
  }

  return (result.data ?? []).map(mapBgmLibraryRow);
}

export async function fetchAllBgmLibraryTracks(
  supabase: SimpleSupabaseLike
): Promise<BgmLibraryTrack[]> {
  const result = await supabase
    .from("bgm_library")
    .select<BgmLibraryRow>("*")
    .order("sort_order", { ascending: true })
    .order("title", { ascending: true });

  if (result.error) {
    console.error("bgm_library manage fetch failed:", result.error.message);
    return [];
  }

  return (result.data ?? []).map(mapBgmLibraryRow);
}

export async function fetchBgmLibraryFavoriteIds(
  supabase: SimpleSupabaseLike,
  userId: string
): Promise<string[]> {
  if (!userId.trim()) {
    return [];
  }

  const result = await supabase
    .from("bgm_library_favorites")
    .select<BgmLibraryFavoriteRow>("bgm_library_id")
    .eq("user_id", userId);

  if (result.error) {
    console.error("bgm_library_favorites fetch failed:", result.error.message);
    return [];
  }

  return (result.data ?? [])
    .map((row) => pickText(row.bgm_library_id))
    .filter((id, index, array) => id.length > 0 && array.indexOf(id) === index);
}

export function sortBgmLibraryTracksByFavorites(
  tracks: BgmLibraryTrack[],
  favoriteTrackIds: string[]
): BgmLibraryTrack[] {
  if (favoriteTrackIds.length === 0) {
    return tracks.slice();
  }

  const favoriteSet = new Set(favoriteTrackIds);
  const favorites: BgmLibraryTrack[] = [];
  const others: BgmLibraryTrack[] = [];

  for (const track of tracks) {
    if (favoriteSet.has(track.id)) {
      favorites.push(track);
      continue;
    }

    others.push(track);
  }

  return [...favorites, ...others];
}

export function findBgmLibraryTrack(
  tracks: BgmLibraryTrack[],
  trackId: string
): BgmLibraryTrack | null {
  return tracks.find((track) => track.id === trackId) ?? null;
}

export function resolveBgmLibraryTrackId(
  tracks: BgmLibraryTrack[],
  values: {
    id?: string | null;
    title?: string | null;
    audioPath?: string | null;
  }
): string {
  const normalizedId = typeof values.id === "string" ? values.id.trim() : "";
  if (normalizedId) {
    const byId = tracks.find((track) => track.id === normalizedId);
    if (byId) return byId.id;
  }

  const normalizedAudioPath =
    typeof values.audioPath === "string" ? values.audioPath.trim() : "";
  if (normalizedAudioPath) {
    const byAudioPath = tracks.find(
      (track) => track.audioPath === normalizedAudioPath
    );
    if (byAudioPath) return byAudioPath.id;
  }

  const normalizedTitle =
    typeof values.title === "string" ? values.title.trim() : "";
  if (normalizedTitle) {
    const byTitle = tracks.find((track) => track.title === normalizedTitle);
    if (byTitle) return byTitle.id;
  }

  return "";
}