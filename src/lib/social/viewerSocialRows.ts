// KD-2: the signed-in viewer's own follow / like rows.
//
// author_follows, author_profile_likes and reader_card_likes have RLS enabled
// with no policies, so a read with the viewer's session always comes back
// empty. These rows are read on the server with the service role instead,
// but only for a user id the server itself verified (auth.getUser()); no
// caller-supplied user id is accepted. Pure logic shared by the server
// wrapper and the tests (no server-only imports here).

export type ViewerSocialKind = "followed-authors" | "liked-authors" | "liked-readers";

export const VIEWER_SOCIAL_KINDS: readonly ViewerSocialKind[] = [
  "followed-authors",
  "liked-authors",
  "liked-readers",
];

type SocialTableSpec = {
  table: "author_follows" | "author_profile_likes" | "reader_card_likes";
  ownerColumn: "follower_user_id" | "user_id";
  targetColumn: "followed_author_id" | "author_id" | "series_id";
};

export const VIEWER_SOCIAL_TABLES: Readonly<Record<ViewerSocialKind, SocialTableSpec>> = {
  "followed-authors": {
    table: "author_follows",
    ownerColumn: "follower_user_id",
    targetColumn: "followed_author_id",
  },
  "liked-authors": {
    table: "author_profile_likes",
    ownerColumn: "user_id",
    targetColumn: "author_id",
  },
  "liked-readers": {
    table: "reader_card_likes",
    ownerColumn: "user_id",
    targetColumn: "series_id",
  },
};

/** One followed author, liked author or liked work (narration card). */
export type ViewerSocialTarget = { targetId: string; createdAt: string };

export type ViewerSocialResult =
  | { signedIn: false; userId: null; targets: [] }
  | { signedIn: true; userId: string; targets: ViewerSocialTarget[] };

export function isViewerSocialKind(value: unknown): value is ViewerSocialKind {
  return typeof value === "string" && (VIEWER_SOCIAL_KINDS as readonly string[]).includes(value);
}

function readText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

type QueryResult = { data: unknown; error: { message: string } | null };
type SelectEq = {
  select(columns: string): { eq(column: string, value: string): PromiseLike<QueryResult> };
};
/** The part of a Supabase client used here (service role on the server). */
export type SocialRowsReader = { from(table: string): SelectEq };

/** Reads the rows of an already verified user. Throws on a read error. */
export async function readSocialTargetsForVerifiedUser(args: {
  reader: SocialRowsReader;
  verifiedUserId: string;
  kind: ViewerSocialKind;
}): Promise<ViewerSocialTarget[]> {
  const userId = readText(args.verifiedUserId);
  if (!userId) throw new Error("viewer social rows: missing verified user id");
  const spec = VIEWER_SOCIAL_TABLES[args.kind];
  const result = await args.reader
    .from(spec.table)
    .select(`${spec.ownerColumn}, ${spec.targetColumn}, created_at`)
    .eq(spec.ownerColumn, userId);
  if (result.error) throw new Error(`${spec.table}: ${result.error.message}`);

  const seen = new Set<string>();
  const targets: ViewerSocialTarget[] = [];
  for (const row of (result.data ?? []) as Array<Record<string, unknown>>) {
    // Defense in depth: drop any row that is not the viewer's own.
    if (readText(row[spec.ownerColumn]) !== userId) continue;
    const targetId = readText(row[spec.targetColumn]);
    if (!targetId || seen.has(targetId)) continue;
    seen.add(targetId);
    targets.push({ targetId, createdAt: readText(row.created_at) });
  }
  return targets;
}

/** Signed-in check result of auth.getUser() (session missing = signed out). */
export type VerifiedViewer = { userId: string } | null;

export async function readViewerSocialTargetsWith(args: {
  kind: ViewerSocialKind;
  getVerifiedViewer: () => Promise<VerifiedViewer>;
  createReader: () => SocialRowsReader;
}): Promise<ViewerSocialResult> {
  if (!isViewerSocialKind(args.kind)) throw new Error("viewer social rows: unknown kind");
  const viewer = await args.getVerifiedViewer();
  const userId = viewer ? readText(viewer.userId) : "";
  if (!userId) return { signedIn: false, userId: null, targets: [] };
  const targets = await readSocialTargetsForVerifiedUser({
    reader: args.createReader(),
    verifiedUserId: userId,
    kind: args.kind,
  });
  return { signedIn: true, userId, targets };
}
