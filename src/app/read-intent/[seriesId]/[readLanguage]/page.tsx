import { notFound, redirect } from "next/navigation";
import { getUiLocale } from "@/i18n/server";
import { localizePath } from "@/i18n/navigation";
import {
  isPublicTranslationTargetLanguage,
  parseSupportedLanguageTag,
} from "@/lib/translation/languageRegistry";
import { getPublicWorkTranslationOverview } from "@/lib/translation/publicWorkTranslations";

type Props = {
  params: Promise<{ seriesId: string; readLanguage: string }>;
};

export default async function PublicWorkReadIntentPage({ params }: Props) {
  const { seriesId, readLanguage: rawReadLanguage } = await params;
  const readLanguage = parseSupportedLanguageTag(rawReadLanguage);
  if (!readLanguage || !isPublicTranslationTargetLanguage(readLanguage)) {
    notFound();
  }

  const [overview, locale] = await Promise.all([
    getPublicWorkTranslationOverview(seriesId),
    getUiLocale(),
  ]);
  if (!overview) notFound();

  const originalHref = `/works/${encodeURIComponent(seriesId)}`;
  if (overview.sourceLanguage === readLanguage) {
    redirect(localizePath(originalHref, locale));
  }

  if (!overview.translationEligible) {
    notFound();
  }

  redirect(
    localizePath(
      `${originalHref}/translations/${encodeURIComponent(readLanguage)}`,
      locale
    )
  );
}
