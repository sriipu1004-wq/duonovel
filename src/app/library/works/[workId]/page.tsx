import Link from "next/link";
import { notFound } from "next/navigation";
import { requireLoggedInUser } from "@/lib/auth/requireLoggedInUser";
import PrivateLibraryWorkManager from "@/features/library/PrivateLibraryWorkManager";
import PrivateLibrarySectionList, {
  type PrivateLibraryUnitListItem,
} from "@/features/library/PrivateLibrarySectionList";
import {
  formatCharacterCount,
  type PrivateLibraryWork,
} from "@/lib/library/privateLibrary";
import {
  getSupportedLanguage,
  parseSupportedLanguageTag,
} from "@/lib/translation/languageRegistry";
import { isSubscriber } from "@/lib/aiUsage/aiUsage.server";
import { createAdminClient } from "@/lib/supabase/admin";

type PageProps = {
  params: Promise<{ workId: string }>;
  searchParams: Promise<{ page?: string }>;
};

type PrivateLibraryUnitRow = {
  id: string;
  chapter_number: number;
  title: string;
  section_number: number;
  part_number: number;
  part_count: number;
  source_char_count: number;
};

const UNITS_PER_PAGE = 100;

function parsePageNumber(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

export default async function PrivateLibraryWorkPage({
  params,
  searchParams,
}: PageProps) {
  const { workId } = await params;
  const { page: rawPage } = await searchParams;
  const page = parsePageNumber(rawPage);
  const { supabase, user } = await requireLoggedInUser(
    `/library/works/${encodeURIComponent(workId)}`
  );
  const [workResult, subscriber] = await Promise.all([
    supabase
      .from("private_library_works")
      .select("*")
      .eq("id", workId)
      .eq("owner_user_id", user.id)
      .eq("import_status", "ready")
      .maybeSingle(),
    isSubscriber(user.id),
  ]);

  if (workResult.error || !workResult.data) {
    notFound();
  }

  const work = workResult.data as PrivateLibraryWork;
  const totalPages = Math.max(1, Math.ceil(work.chapter_count / UNITS_PER_PAGE));
  if (page > totalPages) notFound();

  const firstUnitIndex = (page - 1) * UNITS_PER_PAGE;
  const unitsResult = await supabase
    .from("private_library_chapters")
    .select("id, chapter_number, title, section_number, part_number, part_count, source_char_count")
    .eq("work_id", workId)
    .order("chapter_number", { ascending: true })
    .range(firstUnitIndex, firstUnitIndex + UNITS_PER_PAGE - 1);
  if (unitsResult.error) notFound();
  const units = (unitsResult.data ?? []) as PrivateLibraryUnitRow[];
  const unitIds = units.map((unit) => unit.id);
  const admin = createAdminClient();
  const [progressResult, translationsResult] = unitIds.length > 0
    ? await Promise.all([
        admin
          .from("private_library_reading_progress")
          .select("chapter_id, max_progress_ratio, completed")
          .eq("user_id", user.id)
          .in("chapter_id", unitIds),
        admin
          .from("private_library_chapter_translations")
          .select("chapter_id")
          .eq("status", "ready")
          .in("chapter_id", unitIds),
      ])
    : [{ data: [], error: null }, { data: [], error: null }];
  if (progressResult.error || translationsResult.error) notFound();
  const progressByChapter = new Map(
    (progressResult.data ?? []).map((row) => [String(row.chapter_id), row])
  );
  const translatedChapterIds = new Set(
    (translationsResult.data ?? []).map((row) => String(row.chapter_id))
  );
  const unitItems: PrivateLibraryUnitListItem[] = units.map((unit) => {
    const progress = progressByChapter.get(unit.id);
    return {
      ...unit,
      progress_ratio: Number(progress?.max_progress_ratio ?? 0),
      is_completed: progress?.completed === true,
      has_ready_translation: translatedChapterIds.has(unit.id),
    };
  });
  const language = parseSupportedLanguageTag(work.source_language);

  return (
    <main className="min-h-screen bg-white text-black">
      <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-4 text-sm text-neutral-500">
          <Link href="/library" className="hover:text-black">
            個人本棚
          </Link>
          <span className="mx-2">/</span>
          <span className="text-neutral-700">作品目次</span>
        </div>

        <section className="overflow-hidden rounded-[32px] border border-black/10 bg-white shadow-sm">
          <div className="border-b border-black/10 px-5 py-6 sm:px-8">
            <p className="text-xs tracking-[0.22em] text-neutral-500">
              PRIVATE WORK
            </p>
            <h1 className="mt-3 text-3xl font-bold text-black">{work.title}</h1>
            {work.author_name ? (
              <p className="mt-3 text-sm text-neutral-600">{work.author_name}</p>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-2 text-xs text-neutral-600">
              <span className="rounded-full border border-black/10 bg-neutral-50 px-3 py-1.5">
                本人限定
              </span>
              <span className="rounded-full border border-black/10 bg-neutral-50 px-3 py-1.5">
                {language
                  ? getSupportedLanguage(language).nativeLabel
                  : work.source_language}
              </span>
              <span className="rounded-full border border-black/10 bg-neutral-50 px-3 py-1.5">
                {work.section_count.toLocaleString("ja-JP")}章・話
              </span>
              {work.chapter_count !== work.section_count ? (
                <span className="rounded-full border border-black/10 bg-neutral-50 px-3 py-1.5">
                  {work.chapter_count.toLocaleString("ja-JP")}読書単位
                </span>
              ) : null}
              <span className="rounded-full border border-black/10 bg-neutral-50 px-3 py-1.5">
                {formatCharacterCount(work.source_char_count)}
              </span>
              <Link
                href={`/library/works/${encodeURIComponent(work.id)}/glossary`}
                className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-violet-700 hover:bg-violet-100"
              >
                作品用語を管理
              </Link>
            </div>
            <PrivateLibraryWorkManager
              workId={work.id}
              initialTitle={work.title}
              initialAuthorName={work.author_name ?? ""}
            />
          </div>

          {!subscriber ? (
            <div className="mx-5 mt-5 flex flex-col gap-3 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm sm:mx-8 sm:flex-row sm:items-center sm:justify-between">
              <p className="leading-6 text-sky-950">月額680円で単語解説が無制限。対訳生成上限と次話先読みも利用できます。</p>
              <Link href="/subscription" className="shrink-0 font-semibold text-sky-800 underline underline-offset-4">サブスクを見る</Link>
            </div>
          ) : null}

          <PrivateLibrarySectionList
            workId={work.id}
            units={unitItems}
            currentPage={page}
            unitsPerPage={UNITS_PER_PAGE}
          />

          {totalPages > 1 ? (
            <nav className="flex items-center justify-between gap-3 border-t border-black/10 px-5 py-5 text-sm sm:px-8">
              {page > 1 ? (
                <Link
                  href={`/library/works/${encodeURIComponent(work.id)}?page=${page - 1}`}
                  className="rounded-full border border-black/10 px-4 py-2 hover:bg-neutral-50"
                >
                  前の100話
                </Link>
              ) : (
                <span />
              )}
              <span className="text-xs text-neutral-500">
                {page} / {totalPages}
              </span>
              {page < totalPages ? (
                <Link
                  href={`/library/works/${encodeURIComponent(work.id)}?page=${page + 1}`}
                  className="rounded-full border border-black/10 px-4 py-2 hover:bg-neutral-50"
                >
                  次の100話
                </Link>
              ) : (
                <span />
              )}
            </nav>
          ) : null}
        </section>
      </div>
    </main>
  );
}
