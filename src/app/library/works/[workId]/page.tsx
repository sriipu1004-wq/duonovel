import Link from "next/link";
import { notFound } from "next/navigation";
import { requireLoggedInUser } from "@/lib/auth/requireLoggedInUser";
import PrivateLibraryWorkManager from "@/features/library/PrivateLibraryWorkManager";
import PrivateLibrarySectionList from "@/features/library/PrivateLibrarySectionList";
import {
  formatCharacterCount,
  type PrivateLibraryWork,
} from "@/lib/library/privateLibrary";
import {
  getSupportedLanguage,
  parseSupportedLanguageTag,
} from "@/lib/translation/languageRegistry";
import { isSubscriber } from "@/lib/aiUsage/aiUsage.server";

type PageProps = {
  params: Promise<{ workId: string }>;
  searchParams: Promise<{ page?: string }>;
};

type PrivateLibrarySectionRow = {
  section_number: number;
  section_title: string;
  first_unit_number: number;
  part_count: number;
  source_char_count: number;
  progress_ratio: number | string;
  is_completed: boolean;
  has_ready_translation: boolean;
};

const SECTIONS_PER_PAGE = 100;

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
  const totalPages = Math.max(1, Math.ceil(work.section_count / SECTIONS_PER_PAGE));
  if (page > totalPages) notFound();

  const sectionsResult = await supabase.rpc("list_private_library_sections", {
    p_work_id: workId,
    p_offset: (page - 1) * SECTIONS_PER_PAGE,
    p_limit: SECTIONS_PER_PAGE,
  });

  if (sectionsResult.error) {
    notFound();
  }

  const sections = (sectionsResult.data ?? []) as PrivateLibrarySectionRow[];
  /*
   * The RPC returns one row per logical section, so a 30,000-character EPUB
   * chapter still occupies one table-of-contents row while its internal units
   * retain the existing translation/cache model.
   */
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

          <PrivateLibrarySectionList workId={work.id} sections={sections} />

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
