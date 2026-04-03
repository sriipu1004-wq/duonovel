"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";

type SearchNavButtonProps = {
  href: string;
  className?: string;
  children: ReactNode;
  title?: string;
};

export default function SearchNavButton({
  href,
  className,
  children,
  title,
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
      }}
      className={className}
    >
      {children}
    </button>
  );
}