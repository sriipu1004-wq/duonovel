import BgmLibraryPageClient from "@/features/bgm/BgmLibraryPageClient";
import {
  fetchAllBgmLibraryTracks,
  fetchBgmLibraryFavoriteIds,
  fetchBgmLibraryTracks,
  type SimpleSupabaseLike,
} from "@/lib/bgm/bgmLibrary";
import { isOperatorUser } from "@/lib/auth/operator";
import { createClient } from "@/lib/supabase/server";

export default async function BgmLibraryPage() {
  const supabase = await createClient();
  const bgmSupabase = supabase as unknown as SimpleSupabaseLike;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const canManageLibrary = isOperatorUser(user?.email ?? null);

  const tracks = await fetchBgmLibraryTracks(bgmSupabase);
  const manageableTracks = canManageLibrary
    ? await fetchAllBgmLibraryTracks(bgmSupabase)
    : [];
  const favoriteTrackIds = user
    ? await fetchBgmLibraryFavoriteIds(bgmSupabase, user.id)
    : [];

  return (
    <BgmLibraryPageClient
      tracks={tracks}
      canManageLibrary={canManageLibrary}
      manageableTracks={manageableTracks}
      isLoggedIn={Boolean(user)}
      initialFavoriteTrackIds={favoriteTrackIds}
    />
  );
}