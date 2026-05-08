"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

function shouldIgnoreClick(event: MouseEvent, anchor: HTMLAnchorElement) {
  if (event.defaultPrevented) {
    return true;
  }

  if (event.button !== 0) {
    return true;
  }

  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return true;
  }

  const target = anchor.getAttribute("target");
  if (target && target !== "_self") {
    return true;
  }

  if (anchor.hasAttribute("download")) {
    return true;
  }

  const href = anchor.getAttribute("href");
  if (!href || href.startsWith("#")) {
    return true;
  }

  return false;
}

function isSamePageHashNavigation(currentUrl: URL, nextUrl: URL) {
  return (
    currentUrl.origin === nextUrl.origin &&
    currentUrl.pathname === nextUrl.pathname &&
    currentUrl.search === nextUrl.search &&
    currentUrl.hash !== nextUrl.hash
  );
}

export default function GlobalNavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isNavigating, setIsNavigating] = useState(false);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showDelayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function clearTimers() {
      if (fallbackTimerRef.current) {
        clearTimeout(fallbackTimerRef.current);
        fallbackTimerRef.current = null;
      }

      if (showDelayTimerRef.current) {
        clearTimeout(showDelayTimerRef.current);
        showDelayTimerRef.current = null;
      }
    }

    function startNavigationFeedback() {
      clearTimers();

      showDelayTimerRef.current = setTimeout(() => {
        setIsNavigating(true);
      }, 120);

      fallbackTimerRef.current = setTimeout(() => {
        setIsNavigating(false);
      }, 8000);
    }

    function handleClick(event: MouseEvent) {
      const target = event.target;

      if (!(target instanceof Element)) {
        return;
      }

      const anchor = target.closest("a");

      if (!(anchor instanceof HTMLAnchorElement)) {
        return;
      }

      if (shouldIgnoreClick(event, anchor)) {
        return;
      }

      const currentUrl = new URL(window.location.href);
      const nextUrl = new URL(anchor.href, window.location.href);

      if (nextUrl.origin !== currentUrl.origin) {
        return;
      }

      if (
        currentUrl.pathname === nextUrl.pathname &&
        currentUrl.search === nextUrl.search &&
        currentUrl.hash === nextUrl.hash
      ) {
        return;
      }

      if (isSamePageHashNavigation(currentUrl, nextUrl)) {
        return;
      }

      startNavigationFeedback();
    }

    window.addEventListener("click", handleClick, true);

    return () => {
      window.removeEventListener("click", handleClick, true);
      clearTimers();
    };
  }, []);

  useEffect(() => {
    if (showDelayTimerRef.current) {
      clearTimeout(showDelayTimerRef.current);
      showDelayTimerRef.current = null;
    }

    if (fallbackTimerRef.current) {
      clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }

    setIsNavigating(false);
  }, [pathname, searchParams]);

  if (!isNavigating) {
    return null;
  }

  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 top-0 z-[9999] h-1 overflow-hidden bg-sky-100">
        <div className="h-full w-2/5 animate-[libread-progress_1.1s_ease-in-out_infinite] rounded-full bg-sky-400" />
      </div>

      <div className="pointer-events-none fixed bottom-4 right-4 z-[9999] rounded-full border border-black/10 bg-white/95 px-4 py-2 text-xs font-semibold text-neutral-700 shadow-lg backdrop-blur">
        読み込み中...
      </div>
    </>
  );
}