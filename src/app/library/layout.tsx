import type { Metadata } from "next";
import { getUiLocale } from "@/i18n/server";

const LIBRARY_METADATA_TITLE = {
  ja: "個人本棚 | LIB read",
  en: "My Library | LIB read",
  ko: "개인 서재 | LIB read",
} as const;

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getUiLocale();
  return {
    title: LIBRARY_METADATA_TITLE[locale],
    robots: {
      index: false,
      follow: false,
      noarchive: true,
    },
  };
}

export default function LibraryLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
