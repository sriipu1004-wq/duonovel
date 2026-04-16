import { requireLoggedInUser } from "@/lib/auth/requireLoggedInUser";
import { isOperatorUser } from "@/lib/auth/operator";
import WriteSeriesForm from "@/features/write/WriteSeriesForm";
import {
  fetchAllBgmLibraryTracks,
  fetchBgmLibraryFavoriteIds,
  fetchBgmLibraryTracks,
  sortBgmLibraryTracksByFavorites,
  type SimpleSupabaseLike,
} from "@/lib/bgm/bgmLibrary";

export default async function WriteSeriesNewPage() {
  const { supabase, user } = await requireLoggedInUser("/write/series/new");
  const bgmSupabase = supabase as unknown as SimpleSupabaseLike;
  const canUsePrivateTracks = isOperatorUser(user.email ?? null);
  const favoriteTrackIds = await fetchBgmLibraryFavoriteIds(
    bgmSupabase,
    user.id
  );
  const rawLibraryTracks = canUsePrivateTracks
    ? await fetchAllBgmLibraryTracks(bgmSupabase)
    : await fetchBgmLibraryTracks(bgmSupabase);
  const libraryTracks = sortBgmLibraryTracksByFavorites(
    rawLibraryTracks,
    favoriteTrackIds
  );

  return (
    <WriteSeriesForm
      mode="create"
      currentUserId={user.id}
      libraryTracks={libraryTracks}
    />
  );
}