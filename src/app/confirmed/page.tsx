"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { normalizeNextPath } from "@/lib/auth/accountSignupConsent";

type ConfirmedKind = "completed" | "login_required";

function resolveKind(value: string | null): ConfirmedKind {
  if (value === "login_required") {
    return "login_required";
  }

  return "completed";
}

export default function ConfirmedPage() {
  const searchParams = useSearchParams();

  const nextPath = useMemo(
    () => normalizeNextPath(searchParams.get("next"), "/"),
    [searchParams]
  );

  const kind = useMemo(
    () => resolveKind(searchParams.get("kind")),
    [searchParams]
  );

  const content = useMemo(() => {
    if (kind === "login_required") {
      return {
        title: "メール確認を受け付けた",
        description:
          "このリンクを開いたことでメール確認を受け付けた。元の画面に戻るか、ログインして利用を続けて。",
      };
    }

    return {
      title: "メール確認を受け付けた",
      description:
        "このリンクを開いたことでメール確認を受け付けた。元の画面に戻って、そのままログインして進んで。",
    };
  }, [kind]);

  return (
    <main className="min-h-screen bg-white px-6 py-8 text-black">
      <div className="mx-auto w-full max-w-2xl">
        <section className="overflow-hidden rounded-[32px] border border-black/10 bg-white shadow-sm">
          <div className="px-6 py-10 sm:px-8 sm:py-12">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700">
                CONFIRMED
              </span>
              <span className="rounded-full border border-black/10 bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-700">
                メール確認
              </span>
            </div>

            <p className="mt-4 text-xs tracking-[0.24em] text-neutral-500">
              EMAIL CONFIRMED
            </p>

            <h1 className="mt-3 text-3xl font-bold leading-tight text-black sm:text-4xl">
              {content.title}
            </h1>

            <div className="mt-6 rounded-[24px] border border-sky-200 bg-sky-50 p-5">
              <p className="text-sm leading-7 text-neutral-700">
                {content.description}
              </p>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href={nextPath}
                className="inline-flex rounded-full bg-black px-5 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800"
              >
                元の画面へ戻る
              </Link>

              <Link
                href="/login"
                className="inline-flex rounded-full border border-black/10 bg-white px-5 py-3 text-sm text-neutral-700 transition hover:bg-neutral-50"
              >
                ログインへ
              </Link>

              <Link
                href="/"
                className="inline-flex rounded-full border border-black/10 bg-white px-5 py-3 text-sm text-neutral-700 transition hover:bg-neutral-50"
              >
                TOPへ
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}