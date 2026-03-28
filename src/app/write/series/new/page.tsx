import { requireLoggedInUser } from "@/lib/auth/requireLoggedInUser";
import WriteSeriesForm from "@/features/write/WriteSeriesForm";
import { fetchBgmLibraryTracks } from "@/lib/bgm/bgmLibrary";

export default async function WriteSeriesNewPage() {
  const { supabase, user } = await requireLoggedInUser("/write/series/new");
  const libraryTracks = await fetchBgmLibraryTracks(supabase);

  return (
    <WriteSeriesForm
      mode="create"
      currentUserId={user.id}
      libraryTracks={libraryTracks}
    />
  );
}