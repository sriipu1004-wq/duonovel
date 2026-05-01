"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
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

  const target = document.getElementById(targetId);
  if (!target) {
    return;
  }

  target.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
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
  const [isPending, setIsPending] = useState(false);

  const resolvedHref = useMemo(
    () => appendSavedParamIfNeeded(href, searchParams),
    [href, searchParams]
  );

  useEffect(() => {
    router.prefetch(resolvedHref);
  }, [resolvedHref, router]);

  useEffect(() => {
    setIsPending(false);
  }, [searchParams]);

  return (
    <>
      {isPending ? (
        <div className="fixed left-0 top-0 z-[9999] h-1 w-full overflow-hidden bg-black/10">
          <div className="h-full w-1/2 animate-pulse bg-black" />
        </div>
      ) : null}

      <button
        type="button"
        title={title}
        aria-busy={isPending}
        disabled={isPending}
        onClick={() => {
          setIsPending(true);
          router.replace(resolvedHref, { scroll: false });

          if (scrollTargetId) {
            window.setTimeout(() => scrollToTarget(scrollTargetId), 0);
          }
        }}
        className={[
          className ?? "",
          isPending ? "cursor-wait opacity-70" : "",
        ].join(" ")}
      >
        {children}
      </button>
    </>
  );
}