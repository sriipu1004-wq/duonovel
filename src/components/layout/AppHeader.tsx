import Image from "next/image";
import Link from "next/link";
import AuthStatus from "@/components/auth/AuthStatus";

const navItems = [
  { href: "/#works", label: "作品を探す" },
  { href: "/write", label: "投稿する" },
];

export default function AppHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-black/10 bg-white/95 backdrop-blur">
      <div className="mx-auto w-full max-w-7xl px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-4">
            <Link
              href="/"
              className="inline-flex items-center gap-3"
              aria-label="LIB read トップへ"
            >
              <Image
                src="/brand/libread-mark.jpg"
                alt="LIB read シンボル"
                width={900}
                height={900}
                priority
                className="h-10 w-10 rounded-full border border-black/10 object-cover sm:h-12 sm:w-12"
              />

              <Image
                src="/brand/libread-logo-wide.jpg"
                alt="LIB read"
                width={1600}
                height={520}
                priority
                className="h-8 w-auto sm:h-10"
              />
            </Link>

            <AuthStatus />
          </div>

          <nav className="flex flex-wrap items-center gap-2 text-sm text-neutral-600">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-full px-4 py-2 transition hover:bg-black/5 hover:text-black"
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