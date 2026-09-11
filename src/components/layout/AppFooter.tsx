"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAiUsage } from "@/features/usage/useAiUsage";
import { useCommonDictionary, useUiLocale } from "@/i18n/UiLocaleProvider";
import { isReaderPath, localizePath } from "@/i18n/navigation";
import { stripUiLocalePrefix } from "@/i18n/config";

export default function AppFooter() {
  const pathname = usePathname();
  const readerPage = isReaderPath(pathname);
  const isHome = stripUiLocalePrefix(pathname) === "/";

  if (isHome || readerPage) {
    return null;
  }

  return <VisibleAppFooter />;
}

function VisibleAppFooter() {
  const { snapshot } = useAiUsage();
  const locale = useUiLocale();
  const dictionary = useCommonDictionary();
  const serviceLinks = [
    { href: "/guide", label: dictionary.guide, localized: true },
    { href: "/faq", label: dictionary.faq, localized: true },
    { href: "/status", label: dictionary.status, localized: true },
    { href: "/news", label: dictionary.news, localized: true },
    { href: "/subscription", label: dictionary.subscription, localized: true },
  ];
  const japaneseDiscoveryLinks = [
    { href: "/english-novel-reader", label: dictionary.englishNovel },
    { href: "/web-novel-language-learning", label: dictionary.languageLearning },
    { href: "/pdf-bilingual-reader", label: dictionary.pdfBilingual },
  ];
  const legalLinks = [
    { href: "/terms", label: dictionary.terms },
    { href: "/privacy", label: dictionary.privacy },
    { href: "/commercial-transactions", label: dictionary.commercial },
    { href: "/contact", label: dictionary.contact },
  ];

  return (
    <footer className="border-t border-black/10 bg-white">
      <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-xl">
            <Link href={localizePath("/", locale)} className="text-base font-semibold tracking-tight text-neutral-900">
              LIB read
            </Link>
            <p className="mt-2 text-sm leading-6 text-neutral-600">
              {dictionary.footerDescription}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-x-10 gap-y-3 text-sm text-neutral-600 sm:text-right">
            {serviceLinks
              .filter(
                (item) =>
                  item.href !== "/subscription" || snapshot?.isSubscriber === false
              )
              .map((item) => (
                <Link key={item.href} href={localizePath(item.href, locale)} className="transition hover:text-black">
                  {item.label}
                </Link>
              ))}
            {locale === "ja"
              ? japaneseDiscoveryLinks.map((item) => (
                  <Link key={item.href} href={item.href} className="transition hover:text-black">
                    {item.label}
                  </Link>
                ))
              : null}
            {legalLinks.map((item) => (
              <Link key={item.href} href={item.href} className="transition hover:text-black">
                {item.label}{locale === "ja" ? "" : locale === "en" ? " (Japanese)" : " (일본어)"}
              </Link>
            ))}
          </div>
        </div>

        <p className="mt-8 text-xs text-neutral-400">
          © {new Date().getFullYear()} LIB read
        </p>
      </div>
    </footer>
  );
}
