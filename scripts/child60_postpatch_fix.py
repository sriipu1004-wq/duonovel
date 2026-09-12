from pathlib import Path


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
