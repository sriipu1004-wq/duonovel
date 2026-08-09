import { isOfficialAccountEmail } from "@/lib/auth/officialAccount";
import { requireLoggedInUser } from "@/lib/auth/requireLoggedInUser";
import WriteSeriesForm from "@/features/write/WriteSeriesForm";
import TranslationPermissionWorkspaceBridge from "@/features/write/TranslationPermissionWorkspaceBridge";

export default async function WriteSeriesNewPage() {
  const { user } = await requireLoggedInUser("/write/series/new");

  return (
    <>
      <WriteSeriesForm mode="create" currentUserId={user.id} />
      <TranslationPermissionWorkspaceBridge
        initialMode="closed"
        isOfficialAuthor={isOfficialAccountEmail(user.email)}
      />
    </>
  );
}
