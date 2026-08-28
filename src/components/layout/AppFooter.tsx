"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const serviceLinks = [
  { href: "/guide", label: "使い方" },
  { href: "/faq", label: "よくある質問" },
  { href: "/status", label: "運営状況" },
  { href: "/news", label: "お知らせ" },
];

const legalLinks = [
  { href: "/terms", label: "利用規約" },
  { href: "/privacy", label: "プライバシーポリシー" },
  { href: "/contact", label: "お問い合わせ" },
];

export default function AppFooter() {
  const pathname = usePathname();
  const isReaderPage = pathname.startsWith("/read/");
  const isHome = pathname === "/";

  if (isHome || isReaderPage) {
    return null;
  }

  return (
    <footer className="border-t border-black/10 bg-white">
      <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-xl">
            <Link href="/" className="text-base font-semibold tracking-tight text-neutral-900">
              LIB read
            </Link>
            <p className="mt-2 text-sm leading-6 text-neutral-600">
              外国語の長編を個人本棚で読み続け、多言語対訳・読み上げ・AI物語・Web小説を作品単位で楽しめる読書サービスです。
            </p>
          </div>

          <div className="grid grid-cols-2 gap-x-10 gap-y-3 text-sm text-neutral-600 sm:text-right">
            {serviceLinks.map((item) => (
              <Link key={item.href} href={item.href} className="transition hover:text-black">
                {item.label}
              </Link>
            ))}
            {legalLinks.map((item) => (
              <Link key={item.href} href={item.href} className="transition hover:text-black">
                {item.label}
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
