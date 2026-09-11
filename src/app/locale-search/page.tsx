import type { Metadata } from "next";
import { notFound } from "next/navigation";
import SearchPage from "../search/page";
import { getUiLocale } from "@/i18n/server";
import { searchDictionaries } from "@/i18n/dictionaries/search";

type SearchProps = Parameters<typeof SearchPage>[0];

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getUiLocale();
  if (locale === "ja") return {};
  const dictionary = searchDictionaries[locale];

  return {
    title: `${dictionary.title} | LIB read`,
    description: dictionary.description,
    robots: { index: false, follow: true },
  };
}

export default async function LocaleSearchPage(props: SearchProps) {
  const locale = await getUiLocale();
  if (locale === "ja") notFound();
  return <SearchPage {...props} />;
}
