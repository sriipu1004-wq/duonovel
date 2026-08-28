import Link from "next/link";
import PrivateLibraryDeleteButton from "@/features/library/PrivateLibraryDeleteButton";
import { requireLoggedInUser } from "@/lib/auth/requireLoggedInUser";
import {
  buildPrivateLibraryReadHref,
  buildPrivateLibraryWorkHref,
  formatCharacterCount,
  type PrivateLibraryWork,
} from "@/lib/library/privateLibrary";
import {
  getSupportedLanguage,
  parseSupportedLanguageTag,
} from "@/lib/translation/languageRegistry";

function formatDate(value: string | null): string {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(parsed);
}

export default async function PrivateLibraryPage() {
  const { supabase, user } = await requireLoggedInUser("/library");
  const result = await supabase
    .from("private_library_works")
    .select("*")
    .eq("owner_user_id", user.id)
    .eq("import_status", "ready")
    .order("last_opened_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  const works = (result.data ?? []) as PrivateLibraryWork[];

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
                <h1 className="text-3xl font-bold text-black">個人本棚</h1>
                <p className="mt-3 text-sm leading-7 text-neutral-600">
                  自分で取り込んだ作品を、本人だけが読める本棚です。
                </p>
              </div>
              <Link
                href="/library/import"
                className="rounded-full bg-black px-5 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800"
              >
                作品を取り込む
              </Link>
            </div>
          </div>

          <div className="grid gap-4 px-5 py-6 sm:px-8">
            {result.error ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm leading-7 text-amber-900">
                個人本棚を準備できませんでした。データベース設定を確認してください。
              </div>
            ) : works.length === 0 ? (
              <div className="rounded-[24px] border border-dashed border-black/15 bg-neutral-50 px-5 py-8 text-center">
                <p className="text-base font-medium text-black">
                  まだ作品がありません
                </p>
                <p className="mt-2 text-sm leading-7 text-neutral-600">
                  TXT・EPUB・DOCXなどを取り込むと、章構造を保って自動分割します。
                </p>
              </div>
            ) : (
              works.map((work) => {
                const parsedLanguage = parseSupportedLanguageTag(
                  work.source_language
                );
                const languageLabel = parsedLanguage
                  ? getSupportedLanguage(parsedLanguage).nativeLabel
                  : work.source_language;
                const resumeNumber = work.last_opened_chapter_number ?? 1;

                return (
                  <article
                    key={work.id}
                    className="rounded-[24px] border border-black/10 bg-white p-5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap gap-2 text-[11px] text-neutral-600">
                          <span className="rounded-full border border-black/10 bg-neutral-50 px-2.5 py-1">
                            本人限定
                          </span>
                          <span className="rounded-full border border-black/10 bg-neutral-50 px-2.5 py-1">
                            {languageLabel}
                          </span>
                          <span className="rounded-full border border-black/10 bg-neutral-50 px-2.5 py-1">
                            {work.section_count}章・話
                          </span>
                        </div>
                        <h2 className="mt-3 text-xl font-semibold text-black">
                          {work.title}
                        </h2>
                        {work.author_name ? (
                          <p className="mt-2 text-sm text-neutral-600">
                            {work.author_name}
                          </p>
                        ) : null}
                        <p className="mt-3 text-xs text-neutral-500">
                          {formatCharacterCount(work.source_char_count)}
                          {work.last_opened_at
                            ? `・最終閲覧 ${formatDate(work.last_opened_at)}`
                            : `・追加日 ${formatDate(work.created_at)}`}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Link
                          href={buildPrivateLibraryWorkHref(work.id)}
                          className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm text-neutral-800 transition hover:bg-neutral-50"
                        >
                          作品目次
                        </Link>
                        <Link
                          href={buildPrivateLibraryReadHref(work.id, resumeNumber)}
                          className="rounded-full bg-black px-4 py-2 text-sm font-semibold text-white transition hover:bg-neutral-800"
                        >
                          {work.last_opened_chapter_number
                            ? "続きから読む"
                            : "読み始める"}
                        </Link>
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
