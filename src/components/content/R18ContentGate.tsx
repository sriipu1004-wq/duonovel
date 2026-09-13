import Link from "next/link";
import type { UiLocale } from "@/i18n/config";
import { readPageDictionaries } from "@/i18n/dictionaries/readPage";
import { localizePath } from "@/i18n/navigation";

type Props = {
  signedIn: boolean;
  returnHref: string;
  locale: UiLocale;
};

export default function R18ContentGate({
  signedIn,
  returnHref,
  locale,
}: Props) {
  const dictionary = readPageDictionaries[locale];
  const localizedReturnHref = localizePath(returnHref, locale);
  const settingsHref = signedIn
    ? localizePath("/mypage#content-display", locale)
    : localizePath(
        `/login?next=${encodeURIComponent(localizedReturnHref)}`,
        locale
      );

  return (
    <main
      data-content-rating="r18"
      data-ad-eligible="false"
      className="min-h-screen bg-white text-black"
    >
      <div className="mx-auto flex min-h-[70vh] w-full max-w-3xl items-center px-4 py-12 sm:px-6">
        <section className="w-full rounded-[28px] border border-red-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">
              R18
            </span>
            <span className="text-xs text-neutral-500">
              {dictionary.r18AdultWork}
            </span>
          </div>

          <h1 className="mt-5 text-2xl font-bold text-black">
            {dictionary.r18GateTitle}
          </h1>
          <p className="mt-4 text-sm leading-8 text-neutral-700">
            {dictionary.r18GateHelp}
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href={settingsHref}
              className="rounded-full bg-black px-5 py-3 text-sm font-medium text-white transition hover:bg-neutral-800"
            >
              {signedIn
                ? dictionary.openDisplaySettings
                : dictionary.loginAndConfigure}
            </Link>
            <Link
              href={localizePath("/", locale)}
              className="rounded-full border border-black/10 bg-white px-5 py-3 text-sm text-neutral-700 transition hover:bg-neutral-50"
            >
              {dictionary.backTop}
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
