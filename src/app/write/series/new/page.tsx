import { requireLoggedInUser } from "@/lib/auth/requireLoggedInUser";
import WriteSeriesCreateForm from "@/features/write/WriteSeriesCreateForm";

export default async function WriteSeriesNewPage() {
  const { user } = await requireLoggedInUser("/write/series/new");

  return <WriteSeriesCreateForm currentUserId={user.id} />;
}
