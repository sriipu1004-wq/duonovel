"use client";

import { useEffect, useMemo, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type SearchNavButtonProps = {
  href: string;
  className?: string;
  children: ReactNode;
  title?: string;
  scrollTargetId?: string;
};

type SearchParamsLike = {
  get: (name: string) => string | null;
};

function scrollToTarget(targetId: string) {
  if (typeof window === "undefined") return;

  let attempts = 0;

  const tryScroll = () => {
    const target = document.getElementById(targetId);

    if (target) {
      target.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
      return;
    }

    attempts += 1;
    if (attempts < 12) {
      window.setTimeout(tryScroll, 120);
    }
  };

  window.setTimeout(tryScroll, 0);
}

function appendSavedParamIfNeeded(
  href: string,
  currentSearchParams: SearchParamsLike
): string {
  const currentSaved = currentSearchParams.get("saved")?.trim() ?? "";

  if (!currentSaved) {
    return href;
  }

  const [pathname, rawQuery = ""] = href.split("?");
  const nextQuery = new URLSearchParams(rawQuery);

  if (!nextQuery.has("saved")) {
    nextQuery.set("saved", currentSaved);
  }

  const queryString = nextQuery.toString();
  return queryString ? `${pathname}?${queryString}` : pathname;
}

export default function SearchNavButton({
  href,
  className,
  children,
  title,
  scrollTargetId,
}: SearchNavButtonProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const resolvedHref = useMemo(
    () => appendSavedParamIfNeeded(href, searchParams),
    [href, searchParams]
  );

  useEffect(() => {
    router.prefetch(resolvedHref);
  }, [resolvedHref, router]);

  return (
    <button
      type="button"
      title={title}
      onClick={() => {
        router.replace(resolvedHref, { scroll: false });

        if (scrollTargetId) {
          scrollToTarget(scrollTargetId);
        }
      }}
      className={className}
    >
      {children}
    </button>
  );
}