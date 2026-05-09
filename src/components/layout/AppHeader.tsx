import Image from "next/image";
import Link from "next/link";
import AuthStatus from "@/components/auth/AuthStatus";

const navItems = [
  { href: "/search", label: "作品を探す" },
  { href: "/record", label: "朗読する" },
  { href: "/write", label: "投稿する" },
];

export default function AppHeader() {
  return (
    <header className="sticky top-0 z-40 w-full max-w-[100vw] overflow-hidden border-b border-black/10 bg-white/95 backdrop-blur">
      <div className="mx-auto w-full max-w-7xl px-3 py-3 sm:px-6 lg:px-8">
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
            <Link
              href="/"
              className="inline-flex min-w-0 max-w-full shrink items-center gap-2 sm:gap-3"
              aria-label="LIB read トップへ"
            >
              <Image
                src="/brand/libread-mark.jpg"
                alt="LIB read シンボル"
                width={900}
                height={900}
                priority
                className="h-9 w-9 shrink-0 rounded-full border border-black/10 object-cover sm:h-12 sm:w-12"
              />

              <Image
                src="/brand/libread-logo-wide.jpg"
                alt="LIB read"
                width={1600}
                height={520}
                priority
                className="h-7 w-auto max-w-[170px] shrink sm:h-10 sm:max-w-[260px]"
              />
            </Link>

            <AuthStatus />
          </div>

          <nav className="grid min-w-0 grid-cols-3 gap-1 text-center text-sm text-neutral-600 sm:flex sm:flex-wrap sm:items-center sm:gap-2 sm:text-left">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="min-w-0 rounded-full px-2 py-2 transition hover:bg-black/5 hover:text-black sm:px-4"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </header>
  );
}