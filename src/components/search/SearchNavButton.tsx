"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";

type SearchNavButtonProps = {
  href: string;
  className?: string;
  children: ReactNode;
  title?: string;
  scrollTargetId?: string;
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

export default function SearchNavButton({
  href,
  className,
  children,
  title,
  scrollTargetId,
}: SearchNavButtonProps) {
  const router = useRouter();

  useEffect(() => {
    router.prefetch(href);
  }, [href, router]);

  return (
    <button
      type="button"
      title={title}
      onClick={() => {
        router.replace(href, { scroll: false });

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