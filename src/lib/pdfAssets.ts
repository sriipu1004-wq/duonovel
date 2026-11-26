// Allow-list for pdfjs-dist asset folders served by /api/pdf-assets/[kind]/[name].
const PDF_ASSET_FOLDERS = {
  cmaps: "cmaps",
  standard_fonts: "standard_fonts",
} as const;

const SAFE_FILE_NAME = /^[A-Za-z0-9._-]+$/u;

// Only the table's own keys are accepted (inherited names such as
// "constructor" or "__proto__" are rejected).
export function resolvePdfAssetFolder(kind: string): string | null {
  return Object.hasOwn(PDF_ASSET_FOLDERS, kind)
    ? PDF_ASSET_FOLDERS[kind as keyof typeof PDF_ASSET_FOLDERS]
    : null;
}

export function isSafePdfAssetName(name: string): boolean {
  return SAFE_FILE_NAME.test(name) && name !== "." && name !== "..";
}
