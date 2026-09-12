from pathlib import Path


def read(path: str) -> str:
    return Path(path).read_text()


def write(path: str, text: str) -> None:
    Path(path).write_text(text)


def repl(path: str, old: str, new: str, count: int | None = None) -> None:
    text = read(path)
    if old not in text:
        raise SystemExit(f"missing replacement in {path}: {old[:120]!r}")
    text = text.replace(old, new) if count is None else text.replace(old, new, count)
    write(path, text)


# AI story generator: localized tags remain structured metadata, and UI locale is
# the default source language while Story preferences may explicitly override it.
path = "src/app/generate/TimeFitStoryGeneratorClient.tsx"
repl(path, 'import { getPromptTagsInText } from "@/lib/generation/promptTags";', 'import type { PromptTag } from "@/lib/generation/promptTags";')
repl(path, '  tags: string[];\n  aiGenerated: true;', '  tags: string[];\n  sourceLanguage: SupportedLanguageTag;\n  aiGenerated: true;')
repl(path, '  mood: string;\n  learningLanguage?: SupportedLanguageTag;', '  mood: string;\n  outputLanguage: SupportedLanguageTag;\n  learningLanguage?: SupportedLanguageTag;')
repl(path, '  promptTags?: string[];', '  promptTags?: PromptTag[];')
repl(path, '  const [customRequest, setCustomRequest] = useState("");', '  const [customRequest, setCustomRequest] = useState("");\n  const [promptTags, setPromptTags] = useState<PromptTag[]>([]);')
repl(path, '      mood: DEFAULT_MOOD,\n      ...(learningLanguage', '      mood: DEFAULT_MOOD,\n      outputLanguage: locale as SupportedLanguageTag,\n      ...(learningLanguage')
repl(path, '    [scene, timeMinutes, genre, learningLanguage, learningLevel, translationLearningRequest]\n', '    [scene, timeMinutes, genre, locale, learningLanguage, learningLevel, translationLearningRequest]\n')
repl(path, '    const normalizedCustomRequest = customRequest.trim();\n    const promptTags = getPromptTagsInText(normalizedCustomRequest);', '    const normalizedCustomRequest = customRequest.trim();')
repl(path, '''          <PromptTagSuggestions
            value={customRequest}
            onChange={setCustomRequest}
            maxLength={CUSTOM_REQUEST_MAX_LENGTH}
            disabled={isGenerating}
          />''', '''          <PromptTagSuggestions
            selectedTags={promptTags}
            onSelectedTagsChange={setPromptTags}
            disabled={isGenerating}
          />''')

# Generation API: default output to requested UI language, but allow an explicit
# Story preferences language request to override. Detect the actual generated text.
path = "src/app/api/time-fit-stories/generate/route.ts"
repl(path, 'import { recordPromptTagUsage } from "@/lib/generation/promptTagUsage.server";', 'import { recordPromptTagUsage } from "@/lib/generation/promptTagUsage.server";\nimport { detectSourceLanguageFromText } from "@/lib/translation/detectSourceLanguage";')
repl(path, '  parseSupportedLanguageTag,\n  type SupportedLanguageTag,', '  getSupportedLanguage,\n  parseSupportedLanguageTag,\n  type SupportedLanguageTag,')
repl(path, '  promptTags?: PromptTag[];\n  learningLanguage?: SupportedLanguageTag;', '  promptTags?: PromptTag[];\n  outputLanguage: SupportedLanguageTag;\n  learningLanguage?: SupportedLanguageTag;')
repl(path, '  tags: string[];\n  aiGenerated: true;', '  tags: string[];\n  sourceLanguage: SupportedLanguageTag;\n  aiGenerated: true;')
repl(path, '  const promptTags = normalizePromptTags(payload.promptTags);\n  const learningLanguage =', '  const promptTags = normalizePromptTags(payload.promptTags);\n  const parsedOutputLanguage = parseSupportedLanguageTag(payload.outputLanguage);\n  const outputLanguage = parsedOutputLanguage ?? "ja";\n  const learningLanguage =')
repl(path, '  if (!includesString(ALLOWED_SCENES, scene)) throw new Error("利用シーンの指定を確認してください。");', '  if (payload.outputLanguage !== undefined && !parsedOutputLanguage) {\n    throw new Error("作品言語の指定を確認してください。");\n  }\n  if (!includesString(ALLOWED_SCENES, scene)) throw new Error("利用シーンの指定を確認してください。");')
repl(path, '    mood,\n    ...(customRequest', '    mood,\n    outputLanguage,\n    ...(customRequest')
repl(path, '    tags: Array.from(new Set(["AI生成", "時間指定AI短編", ...tags])).slice(0, 8),\n    aiGenerated: true,', '    tags: Array.from(new Set(["AI生成", "時間指定AI短編", ...tags])).slice(0, 8),\n    sourceLanguage: detectSourceLanguageFromText(body),\n    aiGenerated: true,')
repl(path, '    mood: request.mood,\n    ...(request.learningLanguage', '    mood: request.mood,\n    outputLanguage: request.outputLanguage,\n    ...(request.learningLanguage')
repl(path, 'function buildPrompt(request: TimeFitStoryRequest): string {\n  const range = CHARACTER_RANGES[request.timeMinutes];', 'function buildPrompt(request: TimeFitStoryRequest): string {\n  const range = CHARACTER_RANGES[request.timeMinutes];\n  const outputLanguage = getSupportedLanguage(request.outputLanguage);')
repl(path, '        "登場人物、舞台、展開、結末、文体を調整する参考にしてください。",', '        "登場人物、舞台、展開、結末、文体を調整する参考にしてください。",\n        "利用者が作品本文の言語を明示した場合、その言語指定は既定の作品言語より優先してください。",')
repl(path, '          "- 物語本文自体は自然な日本語で書き、学習対象言語や教材の説明を本文へ混ぜない",', '          "- 物語本文自体は指定された作品言語で自然に書き、学習対象言語や教材の説明を本文へ混ぜない",')
repl(path, '    "LIB readの時間フィットAI物語生成MVPとして、日本語の短編小説を生成してください。",', '    `LIB readの時間フィットAI物語生成MVPとして、既定では${outputLanguage.label} (${outputLanguage.nativeLabel})で短編小説を生成してください。`,\n    "Story preferencesで作品本文の言語が明示されている場合は、その指定言語を優先してください。学習対象言語は作品本文の言語指定として扱わないでください。",')

# AI-saved public work source language must reflect generated text, including a
# Story preferences language override.
path = "src/app/api/time-fit-stories/save-private/route.ts"
repl(path, 'import { classifyGeneratedContentWarnings } from "@/lib/generation/generatedContentWarnings.server";', 'import { classifyGeneratedContentWarnings } from "@/lib/generation/generatedContentWarnings.server";\nimport { detectSourceLanguageFromText } from "@/lib/translation/detectSourceLanguage";')
repl(path, '    author_id: authorId,\n    publication_status:', '    author_id: authorId,\n    source_language: detectSourceLanguageFromText(body),\n    publication_status:')

# Avoid en->en automatic translation when an AI story is generated in English.
path = "src/app/api/time-fit-stories/publish/route.ts"
repl(path, '  effect_settings?: unknown;\n};', '  effect_settings?: unknown;\n  source_language?: SupportedLanguageTag | null;\n};')
repl(path, '.select("id, author_id, tags, effect_settings")', '.select("id, author_id, tags, effect_settings, source_language")')
old_publish = '''    scheduleEpisodeTranslation(
      request.url,
      episode.id,
      learningPreference && learningPreference.language !== "ja"
        ? learningPreference.language
        : "en"
    );'''
new_publish = '''    const sourceLanguage = series.source_language ?? "ja";
    scheduleEpisodeTranslation(
      request.url,
      episode.id,
      learningPreference && learningPreference.language !== sourceLanguage
        ? learningPreference.language
        : sourceLanguage === "ja"
          ? "en"
          : "ja"
    );'''
text = read(path)
if text.count(old_publish) != 2:
    raise SystemExit(f"expected 2 publish translation blocks, got {text.count(old_publish)}")
write(path, text.replace(old_publish, new_publish))

# Generated-story Reader TTS must follow the generated story language.
path = "src/app/read/generated/[storyId]/GeneratedStoryReaderClient.tsx"
repl(path, 'import type { SupportedLanguageTag } from "@/lib/translation/languageRegistry";', 'import {\n  getSupportedLanguage,\n  type SupportedLanguageTag,\n} from "@/lib/translation/languageRegistry";')
repl(path, '  mood: string;\n  learningLanguage?: SupportedLanguageTag;', '  mood: string;\n  outputLanguage?: SupportedLanguageTag;\n  learningLanguage?: SupportedLanguageTag;')
repl(path, '  tags: string[];\n  aiGenerated: true;', '  tags: string[];\n  sourceLanguage?: SupportedLanguageTag;\n  aiGenerated: true;')
repl(path, '.split(/(?<=[。！？\\n])/)', '.split(/(?<=[。！？!?．.\\n])/)', 1)
repl(path, '  const bookmarkToastTimeoutRef = useRef<number | null>(null);\n\n  useEffect(() => {', '  const bookmarkToastTimeoutRef = useRef<number | null>(null);\n  const storySourceLanguage =\n    payload?.story.sourceLanguage ?? payload?.request.outputLanguage ?? "ja";\n  const storySpeechLanguage = getSupportedLanguage(storySourceLanguage).speechLanguage;\n  const storySpeechPrefix = storySpeechLanguage.toLowerCase().split("-")[0];\n\n  useEffect(() => {', 1)
repl(path, '.filter((voice) => voice.lang.toLowerCase().startsWith("ja"))', '.filter((voice) => voice.lang.toLowerCase().startsWith(storySpeechPrefix))')
repl(path, '  }, []);\n\n  useEffect(() => {\n    async function loadCurrentUserName()', '  }, [storySpeechPrefix]);\n\n  useEffect(() => {\n    async function loadCurrentUserName()', 1)
repl(path, '    utterance.lang = "ja-JP";', '    utterance.lang = storySpeechLanguage;')

# Translation-only becomes a normal document-flow reader (no nested fixed-height
# pane) so the page scrolls like Original and its footer can stay fixed.
path = "src/features/playback/TranslationOnlyEpisodePlayback.tsx"
repl(path, 'import BilingualPane, {\n  type BilingualSegment,\n} from "@/features/playback/BilingualPane";', 'import type { BilingualSegment } from "@/features/playback/BilingualPane";')
repl(path, '  getSupportedLanguage,\n  type PublicTranslationTargetLanguage,', '  type PublicTranslationTargetLanguage,')
repl(path, '  const [hoveredSegmentId, setHoveredSegmentId] = useState<string | null>(null);\n', '')
repl(path, '  const scrollRef = useRef<HTMLDivElement | null>(null);\n', '')
repl(path, '    setHoveredSegmentId(null);\n', '')
repl(path, '''    window.requestAnimationFrame(() => {
      const container = scrollRef.current;
      const node = segmentRefs.current.get(segment.id);
      if (!container || !node) return;
      const a = container.getBoundingClientRect();
      const b = node.getBoundingClientRect();
      container.scrollTop += b.top - a.top;
    });''', '''    window.requestAnimationFrame(() => {
      segmentRefs.current.get(segment.id)?.scrollIntoView({
        block: "center",
        behavior: "auto",
      });
    });''')
repl(path, '  const safeSeriesTitle = safeText(seriesTitle, "無題");\n  const safeEpisodeTitle = safeText(episodeTitle, `第${episodeNumber}話`);\n  const safeAuthorName = safeText(workAuthorName, "作者名未設定");', '  const safeSeriesTitle = safeText(seriesTitle, dictionary.untitled);\n  const safeEpisodeTitle = safeText(episodeTitle, dictionary.untitledEpisode);\n  const safeAuthorName = safeText(workAuthorName, dictionary.authorUnknown);')
repl(path, '  const targetLanguageLabel = getSupportedLanguage(targetLanguage).nativeLabel;\n', '')
repl(path, '  const narrationUnits = useMemo(\n    () => segments.map((segment) => segment.translatedText),\n    [segments]\n  );', '''  const narrationUnits = useMemo(
    () => segments.map((segment) => segment.translatedText),
    [segments]
  );
  const paragraphGroups = useMemo(() => {
    const groups = new Map<number, BilingualSegment[]>();
    for (const segment of segments) {
      const group = groups.get(segment.paragraphIndex) ?? [];
      group.push(segment);
      groups.set(segment.paragraphIndex, group);
    }
    return Array.from(groups.entries());
  }, [segments]);''')
marker = '  function handlePositionChange(id: string) {'
insert = '''  useEffect(() => {
    if (translationStatus !== "ready" || segments.length === 0) return;
    let frame: number | null = null;
    let lastId = "";

    const updatePosition = () => {
      frame = null;
      const targetY = window.innerHeight * 0.42;
      let best: BilingualSegment | null = null;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (const segment of segments) {
        const node = segmentRefs.current.get(segment.id);
        if (!node) continue;
        const rect = node.getBoundingClientRect();
        const distance = Math.abs(rect.top + rect.height / 2 - targetY);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = segment;
        }
      }
      if (!best || best.id === lastId) return;
      lastId = best.id;
      const index = segments.findIndex((segment) => segment.id === best?.id);
      if (index < 0) return;
      setCurrentPositionIndex(index);
      setSelectedSegmentId(best.id);
      writeReadingHistory({
        seriesId,
        episodeNumber,
        positionIndex: index,
        paragraphIndex: best.paragraphIndex,
        sentenceIndex: best.sentenceIndex,
        mode: "translation",
        sourceLanguage,
        targetLanguage,
      });
    };

    const schedule = () => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(updatePosition);
    };
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [episodeNumber, segments, seriesId, sourceLanguage, targetLanguage, translationStatus]);

'''
text = read(path)
if marker not in text:
    raise SystemExit("translation-only position marker missing")
write(path, text.replace(marker, insert + marker, 1))
repl(path, '<main className="min-h-screen bg-white text-black">\n      <div className="mx-auto w-full max-w-4xl px-3 py-4 sm:px-6 sm:py-6">\n        <section className="overflow-hidden rounded-[28px] border border-black/10 bg-white shadow-sm">\n          <header className="border-b border-black/10 px-4 py-4 sm:px-6">', '<main className="min-h-screen bg-white pb-36 text-black">\n      <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">\n        <section className="bg-white">\n          <header className="rounded-[28px] border border-black/10 bg-white px-5 py-6 shadow-sm sm:px-8">')
repl(path, '''          {translationStatus === "ready" && segments.length > 0 ? (
            <div className="h-[calc(100dvh-16rem)] min-h-[30rem] max-h-[64rem] bg-white">
              <BilingualPane
                side="target"
                languageLabel={targetLanguageLabel}
                languageTag={targetLanguage}
                segments={segments}
                selectedSegmentId={selectedSegmentId}
                hoveredSegmentId={hoveredSegmentId}
                scrollRef={scrollRef}
                registerSegmentRef={(id, node) => segmentRefs.current.set(id, node)}
                onSelectSegment={handleSelectSegment}
                onHoverSegment={setHoveredSegmentId}
                onReadingPositionChange={handlePositionChange}
                displaySettings={displaySettings}
              />
            </div>
          ) : (''', '''          {translationStatus === "ready" && segments.length > 0 ? (
            <div className="px-1 py-8 sm:px-3 sm:py-10">
              <article
                className="space-y-7 text-black"
                style={{
                  fontSize: `${displaySettings.fontScale}rem`,
                  lineHeight:
                    displaySettings.lineHeight === "compact"
                      ? 1.85
                      : displaySettings.lineHeight === "wide"
                        ? 2.35
                        : 2.05,
                }}
              >
                {paragraphGroups.map(([paragraphIndex, paragraphSegments]) => (
                  <p key={paragraphIndex} className="whitespace-pre-wrap">
                    {paragraphSegments.map((segment) => {
                      const selected = selectedSegmentId === segment.id;
                      return (
                        <span
                          key={segment.id}
                          ref={(node) => segmentRefs.current.set(segment.id, node)}
                          role="button"
                          tabIndex={0}
                          onClick={() => handleSelectSegment(segment.id)}
                          onKeyDown={(event) => {
                            if (event.key !== "Enter" && event.key !== " ") return;
                            event.preventDefault();
                            handleSelectSegment(segment.id);
                          }}
                          className={[
                            "inline cursor-pointer rounded-md px-1 py-1 transition-colors duration-150 hover:bg-sky-50/70",
                            selected && displaySettings.showMarker && !displaySettings.hideEffects
                              ? "bg-sky-100 text-black shadow-[0_0_0_3px_rgba(186,230,253,0.55)]"
                              : "",
                          ].join(" ")}
                        >
                          {segment.translatedText}{" "}
                        </span>
                      );
                    })}
                  </p>
                ))}
              </article>
            </div>
          ) : (''')
repl(path, '''              if (shouldFollow) {
                const container = scrollRef.current;
                const node = segmentRefs.current.get(segment.id);
                if (container && node) {
                  const a = container.getBoundingClientRect();
                  const b = node.getBoundingClientRect();
                  container.scrollTo({
                    top: container.scrollTop + b.top - a.top - container.clientHeight / 2,
                    behavior: "smooth",
                  });
                }
              }''', '''              if (shouldFollow) {
                segmentRefs.current.get(segment.id)?.scrollIntoView({
                  block: "center",
                  behavior: "smooth",
                });
              }''')

# Fixed footer, localized display copy.
path = "src/features/playback/TranslationOnlyFooter.tsx"
repl(path, '    <section className="mt-5 border-t border-black/10 bg-white pt-3">', '    <section className="fixed inset-x-0 bottom-0 z-50 border-t border-black/10 bg-white/95 backdrop-blur">\n      <div className="mx-auto max-w-3xl px-4 py-3 sm:px-6">')
repl(path, '        <div className="mb-3 grid gap-3 rounded-[24px] border border-black/10 bg-neutral-50 p-4 sm:grid-cols-2">', '        <div className="mb-3 grid max-h-[62vh] gap-3 overflow-y-auto rounded-[24px] border border-black/10 bg-neutral-50 p-4 sm:grid-cols-2">')
repl(path, '<span>Font</span>', '<span>{dictionary.fontSize}</span>')
repl(path, '<p>Line height</p>', '<p>{dictionary.lineHeight}</p>')
repl(path, '                  {value}\n', '                  {value === "compact"\n                    ? dictionary.compact\n                    : value === "wide"\n                      ? dictionary.wide\n                      : dictionary.normal}\n')
repl(path, '<span>Voice</span>', '<span>{dictionary.voice}</span>')
repl(path, '<option value="">Default</option>', '<option value="">{dictionary.defaultVoice}</option>')
text = read(path)
ending = '      </div>\n    </section>\n  );\n}'
if not text.endswith(ending):
    raise SystemExit("translation footer ending not found")
write(path, text[:-len(ending)] + '      </div>\n      </div>\n    </section>\n  );\n}')

# Settings bridge for hiding the entire translation reader feature.
Path("src/features/playback/BilingualSettingsBridge.tsx").write_text('''"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useUiLocale } from "@/i18n/UiLocaleProvider";
import { readerDictionaries } from "@/i18n/dictionaries/reader";

type Props = {
  available: boolean;
  visible: boolean;
  onVisibleChange: (visible: boolean) => void;
};

function findDisplaySettingsSection(): HTMLElement | null {
  const explicit = document.querySelector<HTMLElement>("[data-reader-display-settings='true']");
  if (explicit) return explicit;
  return Array.from(document.querySelectorAll<HTMLElement>("main section")).find(
    (section) => section.querySelector<HTMLElement>(":scope > p")?.textContent?.trim() === "DISPLAY"
  ) ?? null;
}

export default function BilingualSettingsBridge({ available, visible, onVisibleChange }: Props) {
  const dictionary = readerDictionaries[useUiLocale()];
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!available) return;
    let currentHost: HTMLElement | null = null;
    function ensureHost() {
      const section = findDisplaySettingsSection();
      if (!section) return;
      const existing = section.querySelector<HTMLElement>(":scope > [data-bilingual-settings-host='true']");
      if (existing) {
        if (currentHost !== existing) { currentHost = existing; setHost(existing); }
        return;
      }
      const nextHost = document.createElement("div");
      nextHost.dataset.bilingualSettingsHost = "true";
      section.appendChild(nextHost);
      currentHost = nextHost;
      setHost(nextHost);
    }
    ensureHost();
    const observer = new MutationObserver(ensureHost);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      if (currentHost?.isConnected) currentHost.remove();
    };
  }, [available]);

  if (!available || !host) return null;
  const chip = (active: boolean) => [
    "rounded-full border px-4 py-2 text-sm font-medium transition",
    active ? "border-sky-200 bg-sky-50 text-black" : "border-black/10 bg-white text-neutral-700 hover:bg-neutral-50",
  ].join(" ");

  return createPortal(
    <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-black/10 bg-white p-4">
      <div>
        <p className="text-sm text-neutral-700">{dictionary.translationFeatureTitle}</p>
        <p className="mt-1 text-xs leading-6 text-neutral-500">{dictionary.translationFeatureHelp}</p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        <button type="button" onClick={() => onVisibleChange(true)} className={chip(visible)}>
          {dictionary.showTranslationFeature}
        </button>
        <button type="button" onClick={() => onVisibleChange(false)} className={chip(!visible)}>
          {dictionary.hideTranslationFeature}
        </button>
      </div>
    </div>,
    host
  );
}
''')

# Shell visibility preference and duplicate title-area button removal.
path = "src/features/playback/ReadBilingualShell.tsx"
repl(path, 'import BilingualActionBridge from "@/features/playback/BilingualActionBridge";\n', '')
repl(path, 'import BilingualEpisodePlayback from "@/features/playback/BilingualEpisodePlayback";', 'import BilingualEpisodePlayback from "@/features/playback/BilingualEpisodePlayback";\nimport BilingualSettingsBridge from "@/features/playback/BilingualSettingsBridge";')
repl(path, 'import { useUiLocale } from "@/i18n/UiLocaleProvider";', 'import { useUiLocale } from "@/i18n/UiLocaleProvider";\nimport {\n  TRANSLATION_READER_VISIBILITY_EVENT,\n  readTranslationReaderVisible,\n  writeTranslationReaderVisible,\n} from "@/lib/playback/translationReaderPreference";')
repl(path, '  const [mode, setMode] = useState<ReadingMode>("standard");', '  const [mode, setMode] = useState<ReadingMode>("standard");\n  const [translationUiVisible, setTranslationUiVisible] = useState(true);')
repl(path, '  function openTranslatedMode(\n', '''  function setTranslationFeaturesVisible(visible: boolean) {
    writeTranslationReaderVisible(visible);
    setTranslationUiVisible(visible);
    if (!visible && mode !== "standard") disableTranslated(resumeSegmentIndex ?? 0);
  }

  function openTranslatedMode(
''')
repl(path, '    if (!translationEligible || nextTargetLanguage === sourceLanguage) return;', '    if (!translationEligible || !translationUiVisible || nextTargetLanguage === sourceLanguage) return;')
repl(path, '    if (!translationEligible) return;\n    openTranslatedMode(nextMode, targetLanguage, true, sessionLanguageLocked);', '    if (!translationEligible || !translationUiVisible) return;\n    openTranslatedMode(nextMode, targetLanguage, true, sessionLanguageLocked);')
marker = '  useEffect(() => {\n    const handler = (event: Event) => {\n      const detail = (event as CustomEvent<{ language?: unknown }>).detail;'
pref = '''  useEffect(() => {
    const initialVisible = readTranslationReaderVisible();
    setTranslationUiVisible(initialVisible);
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ visible?: unknown }>).detail;
      if (typeof detail?.visible === "boolean") setTranslationUiVisible(detail.visible);
    };
    window.addEventListener(TRANSLATION_READER_VISIBILITY_EVENT, handler);
    return () => window.removeEventListener(TRANSLATION_READER_VISIBILITY_EVENT, handler);
  }, []);

'''
text = read(path)
if marker not in text:
    raise SystemExit("reader shell event marker missing")
write(path, text.replace(marker, pref + marker, 1))
repl(path, '  useEffect(() => {\n    if (!translationEligible || typeof window === "undefined") return;', '  useEffect(() => {\n    if (!translationEligible || typeof window === "undefined") return;\n    if (!translationUiVisible) {\n      replaceReaderUrl("standard");\n      setMode("standard");\n      return;\n    }')
repl(path, '  }, [episodeId, episodeNumber, seriesId, sourceLanguage, translationEligible]);', '  }, [episodeId, episodeNumber, seriesId, sourceLanguage, translationEligible, translationUiVisible]);')
repl(path, '''        <ReaderModeSelector
          mode={mode}
          translationEnabled={translationEligible}
          onChange={handleModeChange}
        />''', '''        {translationUiVisible ? (
          <ReaderModeSelector
            mode={mode}
            translationEnabled={translationEligible}
            onChange={handleModeChange}
          />
        ) : null}''')
repl(path, '''      <ReaderModeSelector
        mode={mode}
        translationEnabled={translationEligible}
        onChange={handleModeChange}
      />''', '''      {translationUiVisible ? (
        <ReaderModeSelector
          mode={mode}
          translationEnabled={translationEligible}
          onChange={handleModeChange}
        />
      ) : null}''')
repl(path, '      {translationEligible ? (\n        <div className="mx-auto flex w-full max-w-4xl justify-end px-3 pt-2 sm:px-6">', '      {translationEligible && translationUiVisible ? (\n        <div className="mx-auto flex w-full max-w-4xl justify-end px-3 pt-2 sm:px-6">')
repl(path, '''      <BilingualActionBridge
        enabled={translationEligible}
        onEnable={enableBilingual}
      />''', '''      <BilingualSettingsBridge
        available={translationEligible}
        visible={translationUiVisible}
        onVisibleChange={setTranslationFeaturesVisible}
      />''')

# Localize the primary Original Reader settings/footer and provide a stable host
# for the translation-feature visibility toggle.
path = "src/features/playback/WebSpeechEpisodePlayback.tsx"
repl(path, 'import {\n  FooterActionButton,', 'import { useUiLocale } from "@/i18n/UiLocaleProvider";\nimport { readerDictionaries } from "@/i18n/dictionaries/reader";\nimport {\n  FooterActionButton,')
repl(path, '  workIndexLabel = "作品ページ（目次）",', '  workIndexLabel = "",')
repl(path, '}: EpisodePlaybackProps) {\n  const router = useRouter();', '}: EpisodePlaybackProps) {\n  const router = useRouter();\n  const dictionary = readerDictionaries[useUiLocale()];')
repl(path, '      : "無題";', '      : dictionary.untitled;', 1)
repl(path, '      : "話タイトル未設定";', '      : dictionary.untitledEpisode;', 1)
repl(path, '      : "作者名未設定";', '      : dictionary.authorUnknown;', 1)
repl(path, '      : "本文がまだ登録されていません。";', '      : dictionary.bodyMissing;', 1)
repl(path, '  const safeSpeechLanguage = speechLanguage.trim() || "ja-JP";', '  const resolvedWorkIndexLabel = workIndexLabel.trim() || dictionary.workIndex;\n  const safeSpeechLanguage = speechLanguage.trim() || "ja-JP";')
repl(path, '      setAudioError("このブラウザでは読み上げ機能を利用できません。");', '      setAudioError(dictionary.speechUnavailable);')
repl(path, '          setAudioError("公開朗読を開始できなかった。");', '          setAudioError(dictionary.narrationStartFailed);')
repl(path, '      setBookmarkMessage("栞の位置を記録しました");', '      setBookmarkMessage(dictionary.bookmarkSaved);')
repl(path, '      setBookmarkMessage("ブックマークを保存できませんでした");', '      setBookmarkMessage(dictionary.bookmarkFailed);')
repl(path, '                aria-label={`${safeSeriesTitle}の${workIndexLabel}へ`}', '                aria-label={`${safeSeriesTitle} · ${resolvedWorkIndexLabel}`}')
repl(path, '                {safeSeriesTitle} · {workIndexLabel}', '                {safeSeriesTitle} · {resolvedWorkIndexLabel}')
repl(path, '<span>作者</span>', '<span>{dictionary.author}</span>')
repl(path, '<span>編集</span>', '<span>{dictionary.editor}</span>')
repl(path, '<p className="text-xs tracking-[0.16em] text-neutral-500">あらすじ</p>', '<p className="text-xs tracking-[0.16em] text-neutral-500">{dictionary.synopsis}</p>')
repl(path, '                  朗読停止中', '                  {dictionary.narrationStopped}')
repl(path, '                    ユーザー朗読: {humanNarrationName}', '                    {dictionary.humanNarration}: {humanNarrationName}')
repl(path, '                  ブラウザ朗読', '                  {dictionary.browserNarration}')
repl(path, '<h3 className="mt-2 text-lg font-semibold text-black">\n                    朗読\n                  </h3>', '<h3 className="mt-2 text-lg font-semibold text-black">\n                    {dictionary.narrationTitle}\n                  </h3>')
repl(path, '<p className="text-sm text-neutral-700">再生方式</p>', '<p className="text-sm text-neutral-700">{dictionary.narrationMode}</p>')
repl(path, '                        label="ブラウザ朗読"', '                        label={dictionary.browserNarration}')
repl(path, '                        label={hasHumanRecording ? "ユーザー朗読" : "ユーザー朗読（未設定）"}', '                        label={hasHumanRecording ? dictionary.humanNarration : dictionary.humanNarrationUnset}')
repl(path, '                        この作品には公開中のユーザー朗読がありません。', '                        {dictionary.humanNarrationUnavailable}')
repl(path, '<p className="text-sm text-neutral-700">朗読者</p>', '<p className="text-sm text-neutral-700">{dictionary.narrator}</p>')
repl(path, '{humanNarrationName || "朗読者未設定"}', '{humanNarrationName || dictionary.narratorUnset}')
repl(path, '                          朗読者（ブラウザ音声）', '                          {dictionary.browserVoice}')
repl(path, '                          原文の言語、対訳の言語、その他の言語の順で、端末に入っている音声から選ぶ。', '                          {dictionary.browserVoiceHelp}')
repl(path, '<option value="">標準音声</option>', '<option value="">{dictionary.defaultVoice}</option>')
repl(path, '<span>声の高さ</span>', '<span>{dictionary.voicePitch}</span>')
repl(path, '<span>朗読音量</span>', '<span>{dictionary.narrationVolume}</span>')
repl(path, '<p className="text-sm text-neutral-700">朗読停止</p>', '<p className="text-sm text-neutral-700">{dictionary.narrationStopTitle}</p>')
repl(path, '                        停止中は再生を開始しない。停止解除すると、現在位置から再生できる。', '                        {dictionary.narrationStopHelp}')
repl(path, '{isNarrationStopped ? "停止解除" : "停止"}', '{isNarrationStopped ? dictionary.resumeNarration : dictionary.stop}')
repl(path, '                        次話自動再生', '                        {dictionary.autoAdvance}')
repl(path, '? "ユーザー朗読はバックグラウンド再生に対応し、話末で次の話へ移動する。"\n                            : "ブラウザ朗読は画面表示中のみ再生し、話末で次の話へ移動する。"\n                          : "有料プランで利用できます。"}', '? dictionary.autoAdvanceHumanHelp\n                            : dictionary.autoAdvanceBrowserHelp\n                          : dictionary.paidOnly}')
repl(path, '                        サブスク限定', '                        {dictionary.subscriptionOnly}')
repl(path, '<section className="rounded-[28px] border border-black/10 bg-neutral-50 p-4">\n                  <p className="text-xs tracking-[0.18em] text-neutral-500">\n                    DISPLAY', '<section data-reader-display-settings="true" className="rounded-[28px] border border-black/10 bg-neutral-50 p-4">\n                  <p className="text-xs tracking-[0.18em] text-neutral-500">\n                    DISPLAY', 1)
repl(path, '<h3 className="mt-2 text-lg font-semibold text-black">\n                    表示演出\n                  </h3>', '<h3 className="mt-2 text-lg font-semibold text-black">\n                    {dictionary.displayTitle}\n                  </h3>')
repl(path, '<p className="text-sm text-neutral-700">マーカー表示</p>', '<p className="text-sm text-neutral-700">{dictionary.markerTitle}</p>')
repl(path, '                        読み上げ中の文章を青いマーカーで強調する。', '                        {dictionary.markerHelp}')
repl(path, '<p className="text-sm text-neutral-700">表示演出</p>', '<p className="text-sm text-neutral-700">{dictionary.effectsTitle}</p>')
repl(path, '                        背景、文字装飾、挿絵を一括で隠す。', '                        {dictionary.effectsHelp}')
repl(path, '<span>文字サイズ</span>', '<span>{dictionary.fontSize}</span>')
repl(path, '<p className="text-sm text-neutral-700">行間</p>', '<p className="text-sm text-neutral-700">{dictionary.lineHeight}</p>')
repl(path, '                        label="狭め"', '                        label={dictionary.compact}')
repl(path, '                        label="標準"', '                        label={dictionary.normal}')
repl(path, '                        label="広め"', '                        label={dictionary.wide}')
repl(path, '                設定表示中。本文は一時的に隠れている。', '                {dictionary.settingsBodyHidden}')
repl(path, '{isHumanNarration ? "公開朗読" : `全${speechUnits.length}ブロック`}', '{isHumanNarration ? dictionary.publicNarration : dictionary.totalBlocks(speechUnits.length)}')
repl(path, '                label="栞"', '                label={dictionary.bookmark}')
repl(path, '              label="前話"', '              label={dictionary.previousEpisode}')
repl(path, '              label={isPlaying ? "停止" : "再生"}', '              label={isPlaying ? dictionary.stop : dictionary.play}')
repl(path, '              label="次話"', '              label={dictionary.nextEpisode}')
repl(path, '              label={autoFollow ? "自動追尾\\nON" : "自動追尾\\nOFF"}', '              label={autoFollow ? dictionary.autoFollowOn : dictionary.autoFollowOff}')
repl(path, '              label="設定"', '              label={dictionary.settings}')

# Localize contextual word-status copy in both language panes.
path = "src/features/playback/BilingualPane.tsx"
repl(path, 'import type { StoredWebSpeechDisplaySettings } from "@/lib/playback/webSpeechPreferences";', 'import type { StoredWebSpeechDisplaySettings } from "@/lib/playback/webSpeechPreferences";\nimport { useUiLocale } from "@/i18n/UiLocaleProvider";\nimport { readerDictionaries } from "@/i18n/dictionaries/reader";')
repl(path, '}: BilingualPaneProps) {\n  const paragraphMap', '}: BilingualPaneProps) {\n  const dictionary = readerDictionaries[useUiLocale()];\n  const paragraphMap')
repl(path, '? `${wordInsight.text} の文中での意味を確認中…`', '? dictionary.meaningLoading(wordInsight.text)')
repl(path, ': wordInsight.message || "文中での意味を確認できませんでした"}', ': wordInsight.message || dictionary.meaningFailed}')

# Explain source-language defaults in Story preferences.
path = "src/i18n/dictionaries/generate.ts"
text = read(path)
text = text.replace('customHelp: "登場人物、舞台、展開、結末、文体などを自由に指定できます。"', 'customHelp: "登場人物、舞台、展開、結末、文体などを自由に指定できます。既定では日本語で生成し、別言語で書きたい場合はここで明示できます。"')
text = text.replace('customHelp: "Add characters, setting, plot, ending, style, or any other preferences."', 'customHelp: "Add characters, setting, plot, ending, style, or any other preferences. Stories are generated in English by default; request another story language here if you want one."')
text = text.replace('customHelp: "등장인물, 배경, 전개, 결말, 문체 등을 자유롭게 지정할 수 있습니다."', 'customHelp: "등장인물, 배경, 전개, 결말, 문체 등을 자유롭게 지정할 수 있습니다. 기본은 한국어이며, 다른 언어로 쓰고 싶다면 여기에서 명시하세요."')
write(path, text)
