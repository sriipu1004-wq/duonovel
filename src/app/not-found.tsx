import Link from "next/link";
import { getUiLocale } from "@/i18n/server";
import { localizePath } from "@/i18n/navigation";

const copy = {
  ja: {
    title: "ページが見つかりません",
    description: "URLが変更されたか、公開されていないページにアクセスした可能性があります。",
    home: "トップへ戻る",
    search: "作品を探す",
    generate: "AI生成を試す",
    contact: "お問い合わせ",
  },
  en: {
    title: "Page not found",
    description: "The URL may have changed, or this page may not be publicly available.",
    home: "Back to home",
    search: "Explore works",
    generate: "Try AI Stories",
    contact: "Contact",
  },
  ko: {
    title: "페이지를 찾을 수 없습니다",
    description: "URL이 변경되었거나 공개되지 않은 페이지일 수 있습니다.",
    home: "홈으로 돌아가기",
    search: "작품 찾기",
    generate: "AI 이야기 사용하기",
    contact: "문의하기",
  },
} as const;

export default async function NotFound() {
  const locale = await getUiLocale();
  const text = copy[locale];

  return (
    <main className="min-h-screen bg-white text-black">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-16 sm:px-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
          404
        </p>
        <div className="space-y-4">
          <h1 className="text-3xl font-bold tracking-tight text-black">
            {text.title}
          </h1>
          <p className="max-w-2xl text-sm leading-7 text-neutral-700">
            {text.description}
          </p>
        </div>
        <div className="flex flex-wrap gap-3 text-sm">
          <Link
            href={localizePath("/", locale)}
            className="rounded-full bg-black px-5 py-3 font-semibold text-white transition hover:bg-neutral-800"
          >
            {text.home}
          </Link>
          <Link
            href={localizePath("/search", locale)}
            className="rounded-full border border-black/15 px-5 py-3 font-semibold text-black transition hover:bg-black/5"
          >
            {text.search}
          </Link>
          <Link
            href={localizePath("/generate", locale)}
            className="rounded-full border border-black/15 px-5 py-3 font-semibold text-black transition hover:bg-black/5"
          >
            {text.generate}
          </Link>
          <Link
            href={localizePath("/contact", locale)}
            className="rounded-full border border-black/15 px-5 py-3 font-semibold text-black transition hover:bg-black/5"
          >
            {text.contact}
          </Link>
        </div>
      </div>
    </main>
  );
}
