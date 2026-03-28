import BgmLibraryPageClient from "@/features/bgm/BgmLibraryPageClient";
import { fetchBgmLibraryTracks } from "@/lib/bgm/bgmLibrary";
import { createClient } from "@/lib/supabase/server";

export default async function BgmLibraryPage() {
  const supabase = await createClient();
  const tracks = await fetchBgmLibraryTracks(supabase);

  return <BgmLibraryPageClient tracks={tracks} />;
}