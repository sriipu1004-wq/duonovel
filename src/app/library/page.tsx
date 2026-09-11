import Link from "next/link";
import PrivateLibraryDeleteButton from "@/features/library/PrivateLibraryDeleteButton";
import PrivateLibraryResumeLink from "@/features/library/PrivateLibraryResumeLink";
import { requireLoggedInUser } from "@/lib/auth/requireLoggedInUser";
import { isSubscriber } from "@/lib/aiUsage/aiUsage.server";
import {
  PRIVATE_LIBRARY_LIMITS,
  buildPrivateLibraryWorkHref,
  formatCharacterCount,
  type PrivateLibraryWork,
} from "@/lib/library/privateLibrary";
import {
  getSupportedLanguage,
  parseSupportedLanguageTag,
} from "@/lib/translation/languageRegistry";
import { getUiLocale } from "@/i18n/server";
import { libraryDictionaries } from "@/i18n/dictionaries/library";
import { localizePath } from "@/i18n/navigation";
import type { UiLocale } from "@/i18n/config";

function formatDate(value: string | null, locale: UiLocale): string {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  const dateLocale = locale === "ja" ? "ja-JP" : locale === "ko" ? "ko-KR" : "en-US";
  return new Intl.DateTimeFormat(dateLocale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(parsed);
}

export default async function PrivateLibraryPage() {
  const locale = await getUiLocale();
  const dictionary = libraryDictionaries[locale];
  const { supabase, user } = await requireLoggedInUser("/library");
  const [result, countResult, subscriber] = await Promise.all([
    supabase
      .from("private_library_works")
      .select("*")
      .eq("owner_user_id", user.id)
      .eq("import_status", "ready")
      .order("last_opened_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("private_library_works")
      .select("id", { count: "exact", head: true })
      .eq("owner_user_id", user.id),
    isSubscriber(user.id),
  ]);

  const works = (result.data ?? []) as PrivateLibraryWork[];
  const storedWorkCount = countResult.count ?? works.length;
  const workLimit = subscriber
    ? PRIVATE_LIBRARY_LIMITS.subscriberMaxWorksPerUser
    : PRIVATE_LIBRARY_LIMITS.freeMaxWorksPerUser;

  return (
    <main className="min-h-screen bg-white text-black">
      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
        <section className="overflow-hidden rounded-[32px] border border-black/10 bg-white shadow-sm">
          <div className="border-b border-black/10 px-5 py-6 sm:px-8">
            <p className="text-xs tracking-[0.22em] text-neutral-500">
              PRIVATE LIBRARY
            </p>
            <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-3xl font-bold text-black">{dictionary.title}</h1>
                <p className="mt-3 text-sm leading-7 text-neutral-600">
                  {dictionary.description}
                </p>
                <p className="mt-2 text-xs text-neutral-500">
                  {subscriber ? dictionary.subscriberPlan : dictionary.freePlan}：{storedWorkCount} / {workLimit} {dictionary.worksUnit}
                </p>
              </div>
              <Link
                href={localizePath("/library/import", locale)}
                className="rounded-full bg-black px-5 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800"
              >
                {dictionary.importWork}
              </Link>
            </div>
          </div>

          <div className="grid gap-4 px-5 py-6 sm:px-8">
            {result.error ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm leading-7 text-amber-900">
                {dictionary.loadFailed}
              </div>
            ) : works.length === 0 ? (
              <div className="rounded-[24px] border border-dashed border-black/15 bg-neutral-50 px-5 py-8 text-center">
                <p className="text-base font-medium text-black">
                  {dictionary.emptyTitle}
                </p>
                <p className="mt-2 text-sm leading-7 text-neutral-600">
                  {dictionary.emptyBody}
                </p>
              </div>
            ) : (
              works.map((work) => {
                const parsedLanguage = parseSupportedLanguageTag(work.source_language);
                const languageLabel = parsedLanguage
                  ? getSupportedLanguage(parsedLanguage).nativeLabel
                  : work.source_language;
                const resumeNumber = work.last_opened_chapter_number ?? 1;
                const contentsHref = localizePath(buildPrivateLibraryWorkHref(work.id), locale);

                return (
                  <article
                    key={work.id}
                    className="rounded-[24px] border border-black/10 bg-white p-5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap gap-2 text-[11px] text-neutral-600">
                          <span className="rounded-full border border-black/10 bg-neutral-50 px-2.5 py-1">
                            {dictionary.privateOnly}
                          </span>
                          <span className="rounded-full border border-black/10 bg-neutral-50 px-2.5 py-1">
                            {languageLabel}
                          </span>
                          <span className="rounded-full border border-black/10 bg-neutral-50 px-2.5 py-1">
                            {dictionary.sections(work.section_count)}
                          </span>
                        </div>
                        <h2 className="mt-3 text-xl font-semibold text-black">{work.title}</h2>
                        {work.author_name ? (
                          <p className="mt-2 text-sm text-neutral-600">{work.author_name}</p>
                        ) : null}
                        <p className="mt-3 text-xs text-neutral-500">
                          {formatCharacterCount(work.source_char_count)}
                          {work.last_opened_at
                            ? `・${dictionary.lastViewed(formatDate(work.last_opened_at, locale))}`
                            : `・${dictionary.added(formatDate(work.created_at, locale))}`}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Link
                          href={contentsHref}
                          className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm text-neutral-800 transition hover:bg-neutral-50"
                        >
                          {dictionary.contents}
                        </Link>
                        <PrivateLibraryResumeLink
                          workId={work.id}
                          fallbackChapterNumber={resumeNumber}
                          hasReadingHistory={Boolean(work.last_opened_chapter_number)}
                        />
                        <PrivateLibraryDeleteButton
                          workId={work.id}
                          workTitle={work.title}
                        />
                      </div>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
