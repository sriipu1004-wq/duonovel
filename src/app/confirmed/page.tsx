"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { normalizeNextPath } from "@/lib/auth/accountSignupConsent";

type ConfirmedKind = "register" | "completed" | "login_required";

function resolveKind(value: string | null): ConfirmedKind {
  if (value === "completed") {
    return "completed";
  }

  if (value === "login_required") {
    return "login_required";
  }

  return "register";
}

export default function ConfirmedPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const nextPath = useMemo(
    () => normalizeNextPath(searchParams.get("next"), "/"),
    [searchParams]
  );
  const kind = useMemo(
    () => resolveKind(searchParams.get("kind")),
    [searchParams]
  );

  const [secondsLeft, setSecondsLeft] = useState(3);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setSecondsLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    const timeoutId = window.setTimeout(() => {
      router.replace(nextPath);
    }, 3000);

    return () => {
      window.clearInterval(intervalId);
      window.clearTimeout(timeoutId);
    };
  }, [router, nextPath]);

  const content = useMemo(() => {
    if (kind === "completed") {
      return {
        title: "メールアドレス確認が完了した",
        description:
          "確認が終わった。まもなく元のページへ戻る。",
        buttonLabel: "元のページへ戻る",
      };
    }

    if (kind === "login_required") {
      return {
        title: "メールアドレス確認が完了した",
        description:
          "確認は終わったが、このブラウザではログイン状態を受け取れなかった。まもなくログイン画面へ移動する。",
        buttonLabel: "ログインして続ける",
      };
    }

    return {
      title: "メールアドレス確認が完了した",
      description:
        "確認が終わった。まもなく登録の続きへ移動する。",
      buttonLabel: "登録の続きへ進む",
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
              <p className="mt-3 text-sm text-neutral-600">
                {secondsLeft > 0
                  ? `${secondsLeft}秒後に自動で移動する。`
                  : "移動中..."}
              </p>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => router.replace(nextPath)}
                className="inline-flex rounded-full bg-black px-5 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800"
              >
                {content.buttonLabel}
              </button>

              <Link
                href={nextPath}
                replace
                className="inline-flex rounded-full border border-black/10 bg-white px-5 py-3 text-sm text-neutral-700 transition hover:bg-neutral-50"
              >
                いま移動する
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}