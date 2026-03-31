import BgmLibraryPageClient from "@/features/bgm/BgmLibraryPageClient";
import {
  fetchAllBgmLibraryTracks,
  fetchBgmLibraryTracks,
} from "@/lib/bgm/bgmLibrary";
import { isOperatorUser } from "@/lib/auth/operator";
import { createClient } from "@/lib/supabase/server";

export default async function BgmLibraryPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const canManageLibrary = isOperatorUser(user?.email ?? null);

  const tracks = await fetchBgmLibraryTracks(supabase);
  const manageableTracks = canManageLibrary
    ? await fetchAllBgmLibraryTracks(supabase)
    : [];

  return (
    <BgmLibraryPageClient
      tracks={tracks}
      canManageLibrary={canManageLibrary}
      manageableTracks={manageableTracks}
    />
  );
}