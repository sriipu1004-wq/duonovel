export const TRANSLATION_READER_VISIBILITY_EVENT =
  "libread:translation-reader-visibility";

const TRANSLATION_READER_VISIBLE_KEY =
  "duonovel:translation-reader-visible";

// Reader visibility is a local display preference only; it never changes translation eligibility.
export function readTranslationReaderVisible(): boolean {
  if (typeof window === "undefined") return true;

  try {
    return window.localStorage.getItem(TRANSLATION_READER_VISIBLE_KEY) !== "false";
  } catch {
    return true;
  }
}

export function writeTranslationReaderVisible(visible: boolean): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      TRANSLATION_READER_VISIBLE_KEY,
      visible ? "true" : "false"
    );
  } catch {
    // Preference persistence is non-critical.
  }

  window.dispatchEvent(
    new CustomEvent(TRANSLATION_READER_VISIBILITY_EVENT, {
      detail: { visible },
    })
  );
}
