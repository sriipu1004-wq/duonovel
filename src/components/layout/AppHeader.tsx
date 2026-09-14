"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import AuthStatus from "@/components/auth/AuthStatus";
import { useCommonDictionary, useUiLocale } from "@/i18n/UiLocaleProvider";
import { isReaderPath, localizePath } from "@/i18n/navigation";

export default function AppHeader() {
  const pathname = usePathname();
  const locale = useUiLocale();
  const dictionary = useCommonDictionary();
  const readerPage = isReaderPath(pathname);
  const navItems = [
    { href: "/generate", label: dictionary.navGenerate },
    { href: "/library", label: dictionary.navLibrary },
    { href: "/search", label: dictionary.navSearch },
    { href: "/record", label: dictionary.navNarration },
    { href: "/write", label: dictionary.navWrite },
  ];

  return (
    <header className={`${readerPage ? "relative" : "sticky top-0"} z-40 border-b border-black/10 bg-white/95 backdrop-blur`}>
      <div className="mx-auto w-full max-w-7xl px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-2 sm:gap-3">
          <div className="flex min-w-0 items-center justify-between gap-2 sm:gap-4">
            <Link href={localizePath("/", locale)} className="inline-flex min-w-0 items-center gap-2 sm:gap-3" aria-label={dictionary.topAria}>
              <Image src="/brand/libread-mark.jpg" alt={dictionary.symbolAlt} width={900} height={900} priority className="h-8 w-8 shrink-0 rounded-full border border-black/10 object-cover sm:h-12 sm:w-12" />
              <Image src="/brand/libread-logo-wide.jpg" alt="LIB read" width={1600} height={520} priority className="h-7 w-auto max-w-[104px] object-contain sm:h-10 sm:max-w-none" />
            </Link>
            <Suspense
              fallback={
                <div className="shrink-0 whitespace-nowrap text-[10px] text-neutral-500 dark:text-neutral-400 sm:text-xs">
                  {dictionary.authChecking}
                </div>
              }
            >
              <AuthStatus />
            </Suspense>
          </div>
          <nav className="flex min-w-0 flex-nowrap items-center gap-1 overflow-x-auto text-xs text-neutral-600 sm:gap-2 sm:text-sm">
            {navItems.map((item) => (
              <Link key={item.href} href={localizePath(item.href, locale)} className="shrink-0 whitespace-nowrap rounded-full px-2.5 py-1.5 transition hover:bg-black/5 hover:text-black sm:px-4 sm:py-2">
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </header>
  );
}
