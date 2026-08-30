import { requireLoggedInUser } from "@/lib/auth/requireLoggedInUser";
import LibraryImportForm from "@/features/library/LibraryImportForm";
import { isSubscriber } from "@/lib/aiUsage/aiUsage.server";

export default async function LibraryImportPage() {
  const { supabase, user } = await requireLoggedInUser("/library/import");
  const [countResult, subscriber] = await Promise.all([
    supabase
      .from("private_library_works")
      .select("id", { count: "exact", head: true })
      .eq("owner_user_id", user.id),
    isSubscriber(user.id),
  ]);

  return (
    <LibraryImportForm
      currentWorkCount={countResult.count ?? 0}
      isSubscriber={subscriber}
    />
  );
}
