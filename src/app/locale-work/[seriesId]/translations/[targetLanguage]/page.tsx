import { notFound } from "next/navigation";
import WorkTranslationPage, {
  generateMetadata as generateCanonicalMetadata,
} from "../../../../works/[seriesId]/translations/[targetLanguage]/page";
import { getUiLocale } from "@/i18n/server";

type Props = Parameters<typeof WorkTranslationPage>[0];

export async function generateMetadata(props: Props) {
  return generateCanonicalMetadata(props);
}

export default async function LocaleWorkTranslationPage(props: Props) {
  const locale = await getUiLocale();
  if (locale === "ja") notFound();
  return <WorkTranslationPage {...props} />;
}
