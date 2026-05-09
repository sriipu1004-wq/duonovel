import { NextResponse } from "next/server";
import { isOperatorUser } from "@/lib/auth/operator";
import { createClient } from "@/lib/supabase/server";
import {
  fetchAllBgmLibraryTracks,
  fetchBgmLibraryFavoriteIds,
  fetchBgmLibraryTracks,
  sortBgmLibraryTracksByFavorites,
  type SimpleSupabaseLike,
} from "@/lib/bgm/bgmLibrary";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      {
        ok: false,
        error: "ログインが必要。",
        tracks: [],
      },
      { status: 401 }
    );
  }

  const bgmSupabase = supabase as unknown as SimpleSupabaseLike;
  const canUsePrivateTracks = isOperatorUser(user.email ?? null);
  const favoriteTrackIds = await fetchBgmLibraryFavoriteIds(
    bgmSupabase,
    user.id
  );
  const rawLibraryTracks = canUsePrivateTracks
    ? await fetchAllBgmLibraryTracks(bgmSupabase)
    : await fetchBgmLibraryTracks(bgmSupabase);
  const tracks = sortBgmLibraryTracksByFavorites(
    rawLibraryTracks,
    favoriteTrackIds
  );

  return NextResponse.json({
    ok: true,
    tracks,
  });
}
