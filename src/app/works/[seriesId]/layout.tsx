import type { ReactNode } from "react";
import R18ContentGate from "@/components/content/R18ContentGate";
import WorkTranslationAvailability from "@/features/works/WorkTranslationAvailability";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getSeriesContentWarnings,
  isR18Series,
  type SeriesContentWarning,
} from "@/lib/contentRating";
import { getCurrentR18ViewerPreference } from "@/lib/contentRatingServer";
import { getUiLocale } from "@/i18n/server";
import {
  readPageDictionaries,
  type ReadPageDictionary,
} from "@/i18n/dictionaries/readPage";
import { runReadOnlyWithRetry } from "@/lib/reliability/readOnly";

type Props = {
  children: ReactNode;
  params: Promise<{ seriesId: string }>;
};

type WorkSurfaceState = {
  warnings: SeriesContentWarning[];
  r18: boolean;
  r18Blocked: boolean;
  viewerSignedIn: boolean;
};

type WorkSurfaceLoadResult =
  | { status: "loaded"; surface: WorkSurfaceState }
  | { status: "missing" }
  | { status: "unavailable" };

function WarningBadges({
  warnings,
  dictionary,
}: {
  warnings: SeriesContentWarning[];
  dictionary: ReadPageDictionary;
}) {
  if (warnings.length === 0) return null;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-wrap gap-2 px-4 pt-4 sm:px-6 lg:px-8">
      {warnings.includes("sexual_r18") ? (
        <span className="inline-flex rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">
          {dictionary.sexualR18Warning}
        </span>
      ) : null}
      {warnings.includes("violence") ? (
        <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
          {dictionary.violenceWarning}
        </span>
      ) : null}
    </div>
  );
}

async function loadWorkSurfaceState(
  seriesId: string
): Promise<WorkSurfaceLoadResult> {
  try {
    const admin = createAdminClient();
    const result = await runReadOnlyWithRetry(
      async (signal) =>
        await admin
          .from("series")
          .select("id, content_rating, content_warnings")
          .eq("id", seriesId)
          .abortSignal(signal)
          .maybeSingle(),
      { operation: "work layout series", timeoutMs: 2200, retries: 0 }
    );

    if (result.error) {
      throw new Error(`work layout series failed: ${result.error.message}`);
    }
    if (!result.data) {
      return { status: "missing" };
    }

    const warnings = getSeriesContentWarnings(result.data);
    const r18 = isR18Series(result.data);
    if (!r18) {
      return {
        status: "loaded",
        surface: {
          warnings,
          r18,
          r18Blocked: false,
          viewerSignedIn: false,
        },
      };
    }

    const preference = await runReadOnlyWithRetry(
      () => getCurrentR18ViewerPreference(),
      { operation: "work layout r18 preference", timeoutMs: 1800, retries: 0 }
    );
    return {
      status: "loaded",
      surface: {
        warnings,
        r18,
        r18Blocked: !preference.showR18Content,
        viewerSignedIn: preference.signedIn,
      },
    };
  } catch (error) {
    console.warn(
      "[work-layout] content safety unavailable",
      error instanceof Error ? error.message : String(error)
    );
    return { status: "unavailable" };
  }
}

function WorkSafetyUnavailable({
  locale,
}: {
  locale: Awaited<ReturnType<typeof getUiLocale>>;
}) {
  const message =
    locale === "en"
      ? "This work is temporarily unavailable because its content-safety state could not be verified."
      : locale === "ko"
        ? "콘텐츠 안전 상태를 확인할 수 없어 이 작품을 일시적으로 표시하지 않습니다."
        : "コンテンツ安全情報を確認できないため、この作品は一時的に表示していない。";

  return (
    <main className="min-h-screen bg-white text-black">
      <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6">
        <section className="rounded-[28px] border border-black/10 bg-white p-6 shadow-sm sm:p-8">
          <p className="text-[11px] tracking-[0.22em] text-neutral-500">
            TEMPORARILY UNAVAILABLE
          </p>
          <h1 className="mt-3 text-2xl font-bold text-black">
            {message}
          </h1>
        </section>
      </div>
    </main>
  );
}

export default async function WorkLayout({ children, params }: Props) {
  const locale = await getUiLocale();
  const dictionary = readPageDictionaries[locale];
  const { seriesId } = await params;
  const surfaceResult = await loadWorkSurfaceState(seriesId);

  if (surfaceResult.status === "unavailable") {
    return <WorkSafetyUnavailable locale={locale} />;
  }

  const surface =
    surfaceResult.status === "loaded" ? surfaceResult.surface : null;

  if (surface?.r18Blocked) {
    return (
      <R18ContentGate
        signedIn={surface.viewerSignedIn}
        returnHref={`/works/${encodeURIComponent(seriesId)}`}
        locale={locale}
      />
    );
  }

  const body = (
    <>
      <WorkTranslationAvailability seriesId={seriesId} />
      {children}
    </>
  );

  if (surface && surface.warnings.length > 0) {
    return (
      <div
        data-content-rating={surface.r18 ? "r18" : "general"}
        data-ad-eligible={surface.r18 ? "false" : undefined}
      >
        <WarningBadges warnings={surface.warnings} dictionary={dictionary} />
        {body}
      </div>
    );
  }

  return body;
}
