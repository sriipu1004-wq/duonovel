import BgmLibraryPageClient from "@/features/bgm/BgmLibraryPageClient";
import {
  fetchBgmLibraryFavoriteIds,
  fetchBgmLibraryTracks,
  type SimpleSupabaseLike,
} from "@/lib/bgm/bgmLibrary";
import { createClient } from "@/lib/supabase/server";

export default async function BgmLibraryPage() {
  const supabase = await createClient();
  const bgmSupabase = supabase as unknown as SimpleSupabaseLike;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const tracks = await fetchBgmLibraryTracks(bgmSupabase);
  const favoriteTrackIds = user
    ? await fetchBgmLibraryFavoriteIds(bgmSupabase, user.id)
    : [];

  return (
    <BgmLibraryPageClient
      tracks={tracks}
      isLoggedIn={Boolean(user)}
      initialFavoriteTrackIds={favoriteTrackIds}
    />
  );
}
