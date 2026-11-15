/**
 * Bundled Noto Sans JP / KR subset fonts for next/og (server only).
 *
 * Read from the deployment's own files, never from the network. The files
 * are built by scripts/og-fonts/build_og_subset_fonts.py (source, SHA-256
 * and the SIL Open Font License are in src/assets/og-fonts/). next.config.ts
 * includes them in the image route's function bundle
 * (outputFileTracingIncludes).
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

export const OG_SUBSET_FONT_DIR = path.join("src", "assets", "og-fonts");

export const OG_SUBSET_FONT_FAMILY = {
  jp: "Noto Sans JP OG Subset",
  kr: "Noto Sans KR OG Subset",
} as const;

const FONT_FILES = [
  { family: OG_SUBSET_FONT_FAMILY.jp, weight: 400, file: "NotoSansJP-OgSubset-400.ttf" },
  { family: OG_SUBSET_FONT_FAMILY.jp, weight: 700, file: "NotoSansJP-OgSubset-700.ttf" },
  { family: OG_SUBSET_FONT_FAMILY.kr, weight: 400, file: "NotoSansKR-OgSubset-400.ttf" },
  { family: OG_SUBSET_FONT_FAMILY.kr, weight: 700, file: "NotoSansKR-OgSubset-700.ttf" },
] as const;

export type OgFontOption = {
  name: string;
  data: ArrayBuffer;
  weight: 400 | 700;
  style: "normal";
};

let cached: Promise<OgFontOption[]> | null = null;

/** The four subset fonts, read once per server instance. */
export function loadOgSubsetFonts(rootDir: string = process.cwd()): Promise<OgFontOption[]> {
  if (cached && rootDir === process.cwd()) return cached;
  const loading = Promise.all(
    FONT_FILES.map(async ({ family, weight, file }) => {
      const buffer = await readFile(path.join(rootDir, OG_SUBSET_FONT_DIR, file));
      const data = buffer.buffer.slice(
        buffer.byteOffset,
        buffer.byteOffset + buffer.byteLength
      ) as ArrayBuffer;
      return { name: family, data, weight, style: "normal" as const };
    })
  );
  if (rootDir === process.cwd()) {
    cached = loading;
    // A failed read must not stick: the next request tries again.
    loading.catch(() => {
      if (cached === loading) cached = null;
    });
  }
  return loading;
}

/** CSS font-family for the image root: Korean text prefers the KR subset. */
export function ogSubsetFontFamily(preferKorean: boolean): string {
  const order = preferKorean
    ? [OG_SUBSET_FONT_FAMILY.kr, OG_SUBSET_FONT_FAMILY.jp]
    : [OG_SUBSET_FONT_FAMILY.jp, OG_SUBSET_FONT_FAMILY.kr];
  return order.map((family) => `"${family}"`).join(", ");
}
