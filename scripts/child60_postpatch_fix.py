from pathlib import Path
import re


def repl(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"missing replacement in {path}: {old[:120]!r}")
    p.write_text(text.replace(old, new))


path = "src/features/generation/ContinueStoryAction.tsx"
repl(path, 'import { getPromptTagsInText } from "@/lib/generation/promptTags";', 'import type { PromptTag } from "@/lib/generation/promptTags";')
repl(path, '  const [continuationRequest, setContinuationRequest] = useState("");', '  const [continuationRequest, setContinuationRequest] = useState("");\n  const [promptTags, setPromptTags] = useState<PromptTag[]>([]);')
repl(path, '      const promptTags = getPromptTagsInText(normalizedRequest);\n', '')
repl(path, '''            <PromptTagSuggestions
              value={continuationRequest}
              onChange={setContinuationRequest}
              maxLength={CONTINUATION_REQUEST_MAX_LENGTH}
              disabled={isGenerating}
            />''', '''            <PromptTagSuggestions
              selectedTags={promptTags}
              onSelectedTagsChange={setPromptTags}
              disabled={isGenerating}
            />''')

# Reader visibility: remove now-unused session preference reader and make local
# preference hydration occur in an animation-frame callback, not synchronously in
# the effect body.
path = "src/features/playback/ReadBilingualShell.tsx"
p = Path(path)
text = p.read_text()
text = text.replace('  readBilingualSessionPreference,\n', '')
text, changed = re.subn(
    r'''  useEffect\(\(\) => \{\n    const initialVisible = readTranslationReaderVisible\(\);\n    setTranslationUiVisible\(initialVisible\);\n    const handler = \(event: Event\) => \{\n      const detail = \(event as CustomEvent<\{ visible\?: unknown \}>\)\.detail;\n      if \(typeof detail\?\.visible === "boolean"\)(?: return;\n      setTranslationUiVisible\(detail\.visible\);| setTranslationUiVisible\(detail\.visible\);)\n    \};\n    window\.addEventListener\(TRANSLATION_READER_VISIBILITY_EVENT, handler\);\n    return \(\) => window\.removeEventListener\(TRANSLATION_READER_VISIBILITY_EVENT, handler\);\n  \}, \[\]\);''',
    '''  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setTranslationUiVisible(readTranslationReaderVisible());
    });
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ visible?: unknown }>).detail;
      if (typeof detail?.visible !== "boolean") return;
      setTranslationUiVisible(detail.visible);
    };
    window.addEventListener(TRANSLATION_READER_VISIBILITY_EVENT, handler);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener(TRANSLATION_READER_VISIBILITY_EVENT, handler);
    };
  }, []);''',
    text,
    count=1,
)
if changed != 1:
    raise SystemExit("visibility bootstrap effect not replaced")
text = text.replace(
'''    if (!translationUiVisible) {
      replaceReaderUrl("standard");
      setMode("standard");
      return;
    }''',
'''    if (!translationUiVisible) {
      replaceReaderUrl("standard");
      return;
    }'''
)
text, removed = re.subn(
    r'''\n  function enableBilingual\(\) \{.*?\n  \}\n\n  function confirmBilingual''',
    '\n\n  function confirmBilingual',
    text,
    count=1,
    flags=re.S,
)
if removed != 1:
    raise SystemExit("enableBilingual block not removed")
p.write_text(text)
