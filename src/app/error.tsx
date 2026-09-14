"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getUiLocaleFromPathname, type UiLocale } from "@/i18n/config";
import { localizePath } from "@/i18n/navigation";

type ErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

const copy: Record<
  UiLocale,
  { title: string; description: string; retry: string; home: string; contact: string }
> = {
  ja: {
    title: "ページを表示できませんでした",
    description:
      "一時的な問題が発生した可能性があります。再試行しても解決しない場合は、時間をおいてからアクセスしてください。",
    retry: "もう一度試す",
    home: "トップへ戻る",
    contact: "お問い合わせ",
  },
  en: {
    title: "We could not display this page",
    description:
      "A temporary problem may have occurred. Please try again later if retrying does not resolve it.",
    retry: "Try again",
    home: "Back to home",
    contact: "Contact",
  },
  ko: {
    title: "페이지를 표시할 수 없습니다",
    description:
      "일시적인 문제가 발생했을 수 있습니다. 다시 시도해도 해결되지 않으면 잠시 후 다시 접속해 주세요.",
    retry: "다시 시도",
    home: "홈으로 돌아가기",
    contact: "문의하기",
  },
};

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  const pathname = usePathname();
  const locale = getUiLocaleFromPathname(pathname ?? "/");
  const text = copy[locale];

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="min-h-screen bg-white text-black">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-16 sm:px-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
          Error
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
          <button
            type="button"
            onClick={reset}
            className="rounded-full bg-black px-5 py-3 font-semibold text-white transition hover:bg-neutral-800"
          >
            {text.retry}
          </button>
          <Link
            href={localizePath("/", locale)}
            className="rounded-full border border-black/15 px-5 py-3 font-semibold text-black transition hover:bg-black/5"
          >
            {text.home}
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
