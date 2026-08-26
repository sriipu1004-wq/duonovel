import Link from "next/link";
import { notFound } from "next/navigation";
import { requireLoggedInUser } from "@/lib/auth/requireLoggedInUser";
import {
  buildPrivateLibraryReadHref,
  formatCharacterCount,
  type PrivateLibraryChapter,
  type PrivateLibraryWork,
} from "@/lib/library/privateLibrary";
import {
  getSupportedLanguage,
  parseSupportedLanguageTag,
} from "@/lib/translation/languageRegistry";

type PageProps = {
  params: Promise<{ workId: string }>;
};

export default async function PrivateLibraryWorkPage({ params }: PageProps) {
  const { workId } = await params;
  const { supabase, user } = await requireLoggedInUser(
    `/library/works/${encodeURIComponent(workId)}`
  );
  const [workResult, chaptersResult] = await Promise.all([
    supabase
      .from("private_library_works")
      .select("*")
      .eq("id", workId)
      .eq("owner_user_id", user.id)
      .maybeSingle(),
    supabase
      .from("private_library_chapters")
      .select("id, work_id, chapter_number, title, source_char_count, created_at, updated_at")
      .eq("work_id", workId)
      .order("chapter_number", { ascending: true }),
  ]);

  if (workResult.error || !workResult.data || chaptersResult.error) {
    notFound();
  }

  const work = workResult.data as PrivateLibraryWork;
  const chapters = (chaptersResult.data ?? []) as PrivateLibraryChapter[];
  const language = parseSupportedLanguageTag(work.source_language);

  return (
    <main className="min-h-screen bg-white text-black">
      <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-4 text-sm text-neutral-500">
          <Link href="/library" className="hover:text-black">
            個人本棚
          </Link>
          <span className="mx-2">/</span>
          <span className="text-neutral-700">目次</span>
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
                {work.chapter_count}話
              </span>
              <span className="rounded-full border border-black/10 bg-neutral-50 px-3 py-1.5">
                {formatCharacterCount(work.source_char_count)}
              </span>
            </div>
          </div>

          <div className="grid gap-3 px-5 py-6 sm:px-8">
            {chapters.map((chapter) => (
              <Link
                key={chapter.id}
                href={buildPrivateLibraryReadHref(
                  work.id,
                  chapter.chapter_number
                )}
                className="flex items-center justify-between gap-4 rounded-2xl border border-black/10 bg-white px-4 py-4 transition hover:bg-neutral-50"
              >
                <span className="min-w-0">
                  <span className="block text-xs text-neutral-500">
                    第{chapter.chapter_number}話
                  </span>
                  <span className="mt-1 block truncate text-sm font-medium text-black">
                    {chapter.title}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-neutral-500">
                  {formatCharacterCount(chapter.source_char_count)}
                </span>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
