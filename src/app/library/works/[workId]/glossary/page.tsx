import Link from "next/link";
import { notFound } from "next/navigation";
import { requireLoggedInUser } from "@/lib/auth/requireLoggedInUser";
import PrivateLibraryGlossaryEditor, {
  type PrivateLibraryGlossaryTerm,
} from "@/features/library/PrivateLibraryGlossaryEditor";
import { parseSupportedLanguageTag } from "@/lib/translation/languageRegistry";

type PageProps = {
  params: Promise<{ workId: string }>;
};

export default async function PrivateLibraryGlossaryPage({ params }: PageProps) {
  const { workId } = await params;
  const currentPath = `/library/works/${encodeURIComponent(workId)}/glossary`;
  const { supabase, user } = await requireLoggedInUser(currentPath);
  const [workResult, termsResult] = await Promise.all([
    supabase
      .from("private_library_works")
      .select("id, title, source_language")
      .eq("id", workId)
      .eq("owner_user_id", user.id)
      .eq("import_status", "ready")
      .maybeSingle(),
    supabase
      .from("private_library_glossary_terms")
      .select("*")
      .eq("work_id", workId)
      .order("is_locked", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(500),
  ]);

  const sourceLanguage = parseSupportedLanguageTag(
    workResult.data?.source_language
  );
  if (workResult.error || !workResult.data || !sourceLanguage || termsResult.error) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-white text-black">
      <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-4 text-sm text-neutral-500">
          <Link href="/library" className="hover:text-black">
            個人本棚
          </Link>
          <span className="mx-2">/</span>
          <Link
            href={`/library/works/${encodeURIComponent(workId)}`}
            className="hover:text-black"
          >
            {workResult.data.title}
          </Link>
          <span className="mx-2">/</span>
          <span className="text-neutral-700">作品用語</span>
        </div>
        <section className="overflow-hidden rounded-[32px] border border-black/10 bg-white shadow-sm">
          <div className="border-b border-black/10 px-5 py-6 sm:px-8">
            <p className="text-xs tracking-[0.22em] text-neutral-500">
              WORK GLOSSARY
            </p>
            <h1 className="mt-3 text-3xl font-bold">作品全体の用語を統一</h1>
            <p className="mt-3 text-sm leading-7 text-neutral-600">
              対訳から用語候補を蓄積し、次の話でも同じ表記を使います。重要な訳は手動で固定できます。
            </p>
          </div>
          <div className="px-5 py-6 sm:px-8">
            <PrivateLibraryGlossaryEditor
              workId={workId}
              sourceLanguage={sourceLanguage}
              initialTerms={(termsResult.data ?? []) as PrivateLibraryGlossaryTerm[]}
            />
          </div>
        </section>
      </div>
    </main>
  );
}
