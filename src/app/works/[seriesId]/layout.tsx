import type { ReactNode } from "react";
import R18ContentGate from "@/components/content/R18ContentGate";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getSeriesContentWarnings,
  isR18Series,
  type SeriesContentWarning,
} from "@/lib/contentRating";
import { getCurrentR18ViewerPreference } from "@/lib/contentRatingServer";

type Props = {
  children: ReactNode;
  params: Promise<{ seriesId: string }>;
};

function WarningBadges({ warnings }: { warnings: SeriesContentWarning[] }) {
  if (warnings.length === 0) return null;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-wrap gap-2 px-4 pt-4 sm:px-6 lg:px-8">
      {warnings.includes("sexual_r18") ? (
        <span className="inline-flex rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">
          R18・性的コンテンツ
        </span>
      ) : null}
      {warnings.includes("violence") ? (
        <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
          暴力描写あり
        </span>
      ) : null}
    </div>
  );
}

export default async function WorkLayout({ children, params }: Props) {
  const { seriesId } = await params;

  try {
    const admin = createAdminClient();
    const result = await admin
      .from("series")
      .select("id, content_rating, content_warnings")
      .eq("id", seriesId)
      .maybeSingle();

    if (!result.error && result.data) {
      const warnings = getSeriesContentWarnings(result.data);
      const r18 = isR18Series(result.data);

      if (r18) {
        const preference = await getCurrentR18ViewerPreference();

        if (!preference.showR18Content) {
          return (
            <R18ContentGate
              signedIn={preference.signedIn}
              returnHref={`/works/${encodeURIComponent(seriesId)}`}
            />
          );
        }
      }

      if (warnings.length > 0) {
        return (
          <div
            data-content-rating={r18 ? "r18" : "general"}
            data-ad-eligible={r18 ? "false" : undefined}
          >
            <WarningBadges warnings={warnings} />
            {children}
          </div>
        );
      }
    }
  } catch {
    // Existing not-found/error behavior remains owned by the page.
  }

  return <>{children}</>;
}
