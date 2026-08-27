import { notFound } from "next/navigation";
import { requireLoggedInUser } from "@/lib/auth/requireLoggedInUser";
import WebSpeechEpisodePlayback from "@/features/playback/WebSpeechEpisodePlayback";
import LibraryProgressTracker from "@/features/library/LibraryProgressTracker";
import PrivateLibraryBilingualShell from "@/features/library/PrivateLibraryBilingualShell";
import {
  buildPrivateLibraryReadHref,
  buildPrivateLibraryWorkHref,
  type PrivateLibraryChapter,
  type PrivateLibraryWork,
} from "@/lib/library/privateLibrary";
import {
  getSupportedLanguage,
  parseSupportedLanguageTag,
} from "@/lib/translation/languageRegistry";

type PageProps = {
  params: Promise<{ workId: string; chapterNumber: string }>;
};

function parseChapterNumber(value: string): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}

export default async function PrivateLibraryReadPage({ params }: PageProps) {
  const { workId, chapterNumber } = await params;
  const parsedChapterNumber = parseChapterNumber(chapterNumber);

  if (!parsedChapterNumber) notFound();

  const currentPath = `/library/read/${encodeURIComponent(workId)}/${parsedChapterNumber}`;
  const { supabase, user } = await requireLoggedInUser(currentPath);
  const workResult = await supabase
    .from("private_library_works")
    .select("*")
    .eq("id", workId)
    .eq("owner_user_id", user.id)
    .eq("import_status", "ready")
    .maybeSingle();

  if (workResult.error || !workResult.data) notFound();

  const [chapterResult, previousResult, nextResult] = await Promise.all([
    supabase
      .from("private_library_chapters")
      .select("*")
      .eq("work_id", workId)
      .eq("chapter_number", parsedChapterNumber)
      .maybeSingle(),
    supabase
      .from("private_library_chapters")
      .select("id, chapter_number")
      .eq("work_id", workId)
      .lt("chapter_number", parsedChapterNumber)
      .order("chapter_number", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("private_library_chapters")
      .select("id, chapter_number")
      .eq("work_id", workId)
      .gt("chapter_number", parsedChapterNumber)
      .order("chapter_number", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  if (
    chapterResult.error ||
    !chapterResult.data ||
    previousResult.error ||
    nextResult.error
  ) {
    notFound();
  }

  const work = workResult.data as PrivateLibraryWork;
  const chapter = chapterResult.data as PrivateLibraryChapter;
  const previousChapter = previousResult.data
    ? {
        id: String(previousResult.data.id),
        chapterNumber: Number(previousResult.data.chapter_number),
      }
    : null;
  const nextChapter = nextResult.data
    ? {
        id: String(nextResult.data.id),
        chapterNumber: Number(nextResult.data.chapter_number),
      }
    : null;
  const previousNumber = previousChapter?.chapterNumber ?? null;
  const nextNumber = nextChapter?.chapterNumber ?? null;
  const sourceLanguage = parseSupportedLanguageTag(work.source_language) ?? "ja";
  const language = getSupportedLanguage(sourceLanguage);
  const workIndexHref = buildPrivateLibraryWorkHref(work.id);

  return (
    <>
      <LibraryProgressTracker
        workId={work.id}
        chapterId={chapter.id}
        chapterNumber={chapter.chapter_number}
      />
      <PrivateLibraryBilingualShell
        workId={work.id}
        chapterId={chapter.id}
        chapterNumber={chapter.chapter_number}
        sectionNumber={chapter.section_number}
        partNumber={chapter.part_number}
        partCount={chapter.part_count}
        workTitle={work.title}
        chapterTitle={chapter.section_title}
        authorName={work.author_name || undefined}
        sourceLanguage={sourceLanguage}
        workIndexHref={workIndexHref}
        nextChapterId={nextChapter?.id ?? null}
      >
        <WebSpeechEpisodePlayback
          seriesId={`private-library:${work.id}`}
          episodeId={chapter.id}
          episodeNumber={chapter.chapter_number}
          seriesTitle={work.title}
          episodeTitle={chapter.title}
          workAuthorName={work.author_name || "作者未設定"}
          body={chapter.body}
          isShortStory={false}
          prevEpisodeHref={
            previousNumber
              ? buildPrivateLibraryReadHref(work.id, previousNumber)
              : null
          }
          prevEpisodeNumber={previousNumber}
          nextEpisodeHref={
            nextNumber ? buildPrivateLibraryReadHref(work.id, nextNumber) : null
          }
          nextEpisodeNumber={nextNumber}
          workIndexHref={workIndexHref}
          showComments={false}
          speechLanguage={language.speechLanguage}
          trackPopularity={false}
        />
      </PrivateLibraryBilingualShell>
    </>
  );
}
