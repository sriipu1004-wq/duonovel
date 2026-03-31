import BgmLibraryPageClient from "@/features/bgm/BgmLibraryPageClient";
import {
  fetchAllBgmLibraryTracks,
  fetchBgmLibraryTracks,
} from "@/lib/bgm/bgmLibrary";
import { createClient } from "@/lib/supabase/server";

export default async function BgmLibraryPage() {
  const supabase = await createClient();

  const tracks = await fetchBgmLibraryTracks(supabase);
  const manageableTracks = await fetchAllBgmLibraryTracks(supabase);

  return (
    <BgmLibraryPageClient
      tracks={tracks}
      canManageLibrary={true}
      manageableTracks={manageableTracks}
    />
  );
}