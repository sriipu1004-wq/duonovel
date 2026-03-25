import { notFound } from "next/navigation";
import { requireLoggedInUser } from "@/lib/auth/requireLoggedInUser";

type SeriesOwnershipRow = {
  id: string;
  author_id?: string | null;
};

export async function requireOwnedSeries(
  seriesId: string,
  nextPath: string
) {
  const { supabase, user } = await requireLoggedInUser(nextPath);

  const { data, error } = await supabase
    .from("series")
    .select("id, author_id")
    .eq("id", seriesId)
    .single();

  if (error || !data) {
    notFound();
  }

  const series = data as SeriesOwnershipRow;
  const ownerId =
    typeof series.author_id === "string" ? series.author_id.trim() : "";

  if (!ownerId || ownerId !== user.id) {
    notFound();
  }

  return {
    supabase,
    user,
  };
}