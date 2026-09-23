import { isOfficialAccountEmail } from "@/lib/auth/officialAccount";
import { requireLoggedInUser } from "@/lib/auth/requireLoggedInUser";
import WriteSeriesForm from "@/features/write/WriteSeriesForm";
import ContentRatingWorkspaceBridge from "@/features/write/ContentRatingWorkspaceBridge";
import TranslationPermissionWorkspaceBridge from "@/features/write/TranslationPermissionWorkspaceBridge";
import SourceLanguageWorkspaceBridge from "@/features/write/SourceLanguageWorkspaceBridge";
import SeriesStatusPortal from "@/features/write/SeriesStatusPortal";

export default async function WriteSeriesNewPage() {
  const { user } = await requireLoggedInUser("/write/series/new");

  return (
    <>
      <WriteSeriesForm mode="create" currentUserId={user.id} />
      <SeriesStatusPortal>
        <SourceLanguageWorkspaceBridge embedded />
      </SeriesStatusPortal>
      <TranslationPermissionWorkspaceBridge
        initialMode="open"
        isOfficialAuthor={isOfficialAccountEmail(user.email)}
      />
      <ContentRatingWorkspaceBridge initialWarnings={[]} />
    </>
  );
}
