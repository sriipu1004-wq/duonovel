"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import AuthStatus from "@/components/auth/AuthStatus";

const navItems = [
  { href: "/generate", label: "AI生成" },
  { href: "/search", label: "探す" },
  { href: "/record", label: "朗読" },
  { href: "/write", label: "投稿" },
];

export default function AppHeader() {
  const pathname = usePathname();
  const isReaderPage = pathname.startsWith("/read/");

  return (
    <header className={`${isReaderPage ? "relative" : "sticky top-0"} z-40 border-b border-black/10 bg-white/95 backdrop-blur`}>
      <div className="mx-auto w-full max-w-7xl px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-2 sm:gap-3">
          <div className="flex min-w-0 items-center justify-between gap-2 sm:gap-4">
            <Link href="/" className="inline-flex min-w-0 items-center gap-2 sm:gap-3" aria-label="LIB read トップへ">
              <Image src="/brand/libread-mark.jpg" alt="LIB read シンボル" width={900} height={900} priority className="h-8 w-8 shrink-0 rounded-full border border-black/10 object-cover sm:h-12 sm:w-12" />
              <Image src="/brand/libread-logo-wide.jpg" alt="LIB read" width={1600} height={520} priority className="h-7 w-auto max-w-[104px] object-contain sm:h-10 sm:max-w-none" />
            </Link>
            <AuthStatus />
          </div>
          <nav className="flex min-w-0 flex-nowrap items-center gap-1 overflow-x-auto text-xs text-neutral-600 sm:gap-2 sm:text-sm">
            {navItems.map((item) => <Link key={item.href} href={item.href} className="shrink-0 whitespace-nowrap rounded-full px-2.5 py-1.5 transition hover:bg-black/5 hover:text-black sm:px-4 sm:py-2">{item.label}</Link>)}
          </nav>
        </div>
      </div>
    </header>
  );
}
