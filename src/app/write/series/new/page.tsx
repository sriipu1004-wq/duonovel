import { requireLoggedInUser } from "@/lib/auth/requireLoggedInUser";
import { isOperatorUser } from "@/lib/auth/operator";
import WriteSeriesForm from "@/features/write/WriteSeriesForm";
import {
  fetchAllBgmLibraryTracks,
  fetchBgmLibraryFavoriteIds,
  fetchBgmLibraryTracks,
  sortBgmLibraryTracksByFavorites,
} from "@/lib/bgm/bgmLibrary";

export default async function WriteSeriesNewPage() {
  const { supabase, user } = await requireLoggedInUser("/write/series/new");
  const canUsePrivateTracks = isOperatorUser(user.email ?? null);
  const favoriteTrackIds = await fetchBgmLibraryFavoriteIds(supabase, user.id);
  const rawLibraryTracks = canUsePrivateTracks
    ? await fetchAllBgmLibraryTracks(supabase)
    : await fetchBgmLibraryTracks(supabase);
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