import { redirect } from "next/navigation";
import { requireLoggedInUser } from "@/lib/auth/requireLoggedInUser";

type SeriesOwnershipRow = {
  id: string;
  author_id?: string | null;
  user_id?: string | null;
};

function normalizeId(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function requireOwnedSeries(
  seriesId: string,
  nextPath: string
) {
  const { supabase, user } = await requireLoggedInUser(nextPath);

  const { data, error } = await supabase
    .from("series")
    .select("id, author_id, user_id")
    .eq("id", seriesId)
    .single();

  if (error || !data) {
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }

  const series = data as SeriesOwnershipRow;

  const ownerIds = [normalizeId(series.author_id), normalizeId(series.user_id)].filter(
    (value) => value.length > 0
  );

  if (ownerIds.length === 0) {
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }

  if (!ownerIds.includes(user.id)) {
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }

  return {
    supabase,
    user,
  };
}