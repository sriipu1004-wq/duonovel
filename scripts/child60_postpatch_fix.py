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

# Reader visibility bootstrap is deferred one frame so the effect only subscribes
# synchronously; hiding while already translated is handled by the explicit setter.
path = "src/features/playback/ReadBilingualShell.tsx"
p = Path(path)
text = p.read_text()
text = text.replace(
'''  useEffect(() => {
    const initialVisible = readTranslationReaderVisible();
    setTranslationUiVisible(initialVisible);
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ visible?: unknown }>).detail;
      if (typeof detail?.visible !== "boolean") return;
      setTranslationUiVisible(detail.visible);
    };
    window.addEventListener(TRANSLATION_READER_VISIBILITY_EVENT, handler);
    return () => window.removeEventListener(TRANSLATION_READER_VISIBILITY_EVENT, handler);
  }, []);''',
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
  }, []);'''
)
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
