"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

type FeedbackKind = "navigation" | "action";

type FeedbackState = {
  kind: FeedbackKind;
  label: string;
};

type LoadingFeedbackEventDetail = {
  label?: string;
  timeoutMs?: number;
};

declare global {
  interface WindowEventMap {
    "libread:loading-feedback": CustomEvent<LoadingFeedbackEventDetail>;
    "libread:loading-feedback-done": CustomEvent<void>;
  }
}

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

function readSubmitterLabel(event: SubmitEvent): string {
  const submitter = event.submitter;

  if (submitter instanceof HTMLButtonElement) {
    const label = submitter.innerText.trim();
    if (label) {
      if (label.includes("保存")) return "保存中...";
      if (label.includes("登録")) return "登録中...";
      if (label.includes("送信")) return "送信中...";
      if (label.includes("確認")) return "確認中...";
      if (label.includes("作成")) return "作成中...";
    }
  }

  if (submitter instanceof HTMLInputElement) {
    const label = submitter.value.trim();
    if (label) {
      if (label.includes("保存")) return "保存中...";
      if (label.includes("登録")) return "登録中...";
      if (label.includes("送信")) return "送信中...";
      if (label.includes("確認")) return "確認中...";
      if (label.includes("作成")) return "作成中...";
    }
  }

  return "送信中...";
}

export default function GlobalNavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
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

    function startFeedback(args: {
      kind: FeedbackKind;
      label: string;
      showDelayMs?: number;
      timeoutMs?: number;
    }) {
      clearTimers();

      showDelayTimerRef.current = setTimeout(() => {
        setFeedback({
          kind: args.kind,
          label: args.label,
        });
      }, args.showDelayMs ?? 120);

      fallbackTimerRef.current = setTimeout(() => {
        setFeedback(null);
      }, args.timeoutMs ?? 8000);
    }

    function stopFeedback() {
      clearTimers();
      setFeedback(null);
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

      startFeedback({
        kind: "navigation",
        label: "読み込み中...",
        timeoutMs: 8000,
      });
    }

    function handleSubmit(event: SubmitEvent) {
      if (event.defaultPrevented) {
        return;
      }

      startFeedback({
        kind: "action",
        label: readSubmitterLabel(event),
        showDelayMs: 80,
        timeoutMs: 5000,
      });
    }

    function handleCustomFeedback(
      event: CustomEvent<LoadingFeedbackEventDetail>
    ) {
      startFeedback({
        kind: "action",
        label: event.detail?.label?.trim() || "処理中...",
        showDelayMs: 0,
        timeoutMs: event.detail?.timeoutMs ?? 5000,
      });
    }

    window.addEventListener("click", handleClick, true);
    window.addEventListener("submit", handleSubmit, true);
    window.addEventListener("libread:loading-feedback", handleCustomFeedback);
    window.addEventListener("libread:loading-feedback-done", stopFeedback);

    return () => {
      window.removeEventListener("click", handleClick, true);
      window.removeEventListener("submit", handleSubmit, true);
      window.removeEventListener(
        "libread:loading-feedback",
        handleCustomFeedback
      );
      window.removeEventListener("libread:loading-feedback-done", stopFeedback);
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

    setFeedback(null);
  }, [pathname, searchParams]);

  if (!feedback) {
    return null;
  }

  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 top-0 z-[9999] h-1 overflow-hidden bg-sky-100">
        <div className="h-full w-2/5 animate-[libread-progress_1.1s_ease-in-out_infinite] rounded-full bg-sky-400" />
      </div>

      <div className="pointer-events-none fixed bottom-4 right-4 z-[9999] rounded-full border border-black/10 bg-white/95 px-4 py-2 text-xs font-semibold text-neutral-700 shadow-lg backdrop-blur">
        {feedback.label}
      </div>
    </>
  );
}