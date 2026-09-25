import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

function main() {
  const original = source(
    "src/features/playback/WebSpeechEpisodePlayback.tsx"
  );
  assert.ok(
    original.includes("visibleMarkerUnitIndex") &&
      original.includes("bookmarkUnitIndex") &&
      original.includes("readerBodyScrollRef"),
    "Original must separate the visible marker from scroll/narration reading anchor"
  );
  assert.equal(
    original.includes("markerUnitIndex"),
    false,
    "Original must not reuse the active reading index as its visible marker"
  );

  const translationOnly = source(
    "src/features/playback/TranslationOnlyEpisodePlayback.tsx"
  );
  assert.equal(
    translationOnly.includes("setSelectedSegmentId(best.id)"),
    false,
    "manual scroll must not move the visible marker in Translation only"
  );
  assert.ok(
    translationOnly.includes("bookmarkPositionIndex"),
    "Translation only must prefer a tapped marker and otherwise use the current reading anchor"
  );

  const bilingual = source(
    "src/features/playback/BilingualEpisodePlayback.tsx"
  );
  assert.ok(
    bilingual.includes("settingsPortalId") &&
      bilingual.includes("settingsResumeSegmentIdRef") &&
      bilingual.includes("alignSegmentToTop(resumeId)"),
    "Bilingual settings must replace content and restore the saved reading anchor"
  );
  assert.equal(
    bilingual.includes("setSelectedSegmentId((current) => current ?? firstId)"),
    false,
    "Bilingual loading must not create a visible marker without user tap or saved position"
  );

  const privateShell = source(
    "src/features/library/PrivateLibraryBilingualShell.tsx"
  );
  assert.ok(
    privateShell.includes("<ReaderModeSelector") &&
      privateShell.includes('"translation"') &&
      privateShell.includes("<TranslationLanguageSelect"),
    "Private Library must expose the canonical three Reader modes"
  );

  const privatePlayback = source(
    "src/features/library/PrivateLibraryBilingualPlayback.tsx"
  );
  assert.ok(
    privatePlayback.includes('mode === "translation"') &&
      privatePlayback.includes("<TranslationOnlyFooter"),
    "Private Library Translation only must reuse the private translation backend"
  );

  const footer = source("src/features/playback/BilingualStoppedFooter.tsx");
  assert.ok(
    footer.includes("createPortal") &&
      footer.includes("settingsPortalId") &&
      footer.includes("inlineSettingsHostRef"),
    "Bilingual settings must portal into Public content while retaining a fallback for other surfaces"
  );

  console.log(
    "PASS: Reader marker separation, settings replacement, and Public/Private three-mode structure"
  );
}

main();
