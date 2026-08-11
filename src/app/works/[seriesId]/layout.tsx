import type { ReactNode } from "react";
import R18ContentGate from "@/components/content/R18ContentGate";
import { createAdminClient } from "@/lib/supabase/admin";
import { isR18Series } from "@/lib/contentRating";
import { getCurrentR18ViewerPreference } from "@/lib/contentRatingServer";

type Props = {
  children: ReactNode;
  params: Promise<{ seriesId: string }>;
};

export default async function WorkLayout({ children, params }: Props) {
  const { seriesId } = await params;

  try {
    const admin = createAdminClient();
    const result = await admin
      .from("series")
      .select("id, content_rating")
      .eq("id", seriesId)
      .maybeSingle();

    if (!result.error && result.data && isR18Series(result.data)) {
      const preference = await getCurrentR18ViewerPreference();

      if (!preference.showR18Content) {
        return (
          <R18ContentGate
            signedIn={preference.signedIn}
            returnHref={`/works/${encodeURIComponent(seriesId)}`}
          />
        );
      }

      return (
        <div data-content-rating="r18" data-ad-eligible="false">
          <div className="mx-auto w-full max-w-6xl px-4 pt-4 sm:px-6 lg:px-8">
            <span className="inline-flex rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">
              R18
            </span>
          </div>
          {children}
        </div>
      );
    }
  } catch {
    // Existing not-found/error behavior remains owned by the page.
  }

  return <>{children}</>;
}
