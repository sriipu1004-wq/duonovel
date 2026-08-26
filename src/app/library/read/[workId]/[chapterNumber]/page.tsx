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
    .maybeSingle();

  if (workResult.error || !workResult.data) notFound();

  const [chapterResult, chapterNumbersResult] = await Promise.all([
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
      .order("chapter_number", { ascending: true }),
  ]);

  if (chapterResult.error || !chapterResult.data || chapterNumbersResult.error) {
    notFound();
  }

  const work = workResult.data as PrivateLibraryWork;
  const chapter = chapterResult.data as PrivateLibraryChapter;
  const chapters = (chapterNumbersResult.data ?? [])
    .map((row) => ({
      id: typeof row.id === "string" ? row.id : "",
      chapterNumber: Number(row.chapter_number),
    }))
    .filter(
      (row) =>
        row.id.length > 0 &&
        Number.isInteger(row.chapterNumber) &&
        row.chapterNumber > 0
    );
  const currentIndex = chapters.findIndex(
    (row) => row.chapterNumber === parsedChapterNumber
  );
  const previousChapter = currentIndex > 0 ? chapters[currentIndex - 1] : null;
  const nextChapter =
    currentIndex >= 0 && currentIndex < chapters.length - 1
      ? chapters[currentIndex + 1]
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
        chapterNumber={chapter.chapter_number}
      />
      <PrivateLibraryBilingualShell
        workId={work.id}
        chapterId={chapter.id}
        chapterNumber={chapter.chapter_number}
        workTitle={work.title}
        chapterTitle={chapter.title}
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
