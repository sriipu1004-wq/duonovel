"use client";

import { useEffect, useRef } from "react";

function setPageScrollTop(top: number): void {
  if (typeof window === "undefined") return;

  const safeTop = Math.max(0, top);
  document.documentElement.scrollTop = safeTop;
  document.body.scrollTop = safeTop;
  window.scrollTo({ top: safeTop, left: 0, behavior: "auto" });
}

function runAfterSettingsRender(callback: () => void): void {
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(callback);
  });
  window.setTimeout(callback, 50);
}

export default function ReaderSettingsTopBridge() {
  const settingsOpenRef = useRef(false);
  const readerScrollTopRef = useRef(0);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const settingsButton = target.closest<HTMLButtonElement>(
        'button[aria-label="設定"]'
      );

      if (!settingsButton) return;

      if (!settingsOpenRef.current) {
        readerScrollTopRef.current = Math.max(
          0,
          window.scrollY,
          document.documentElement.scrollTop,
          document.body.scrollTop
        );
        settingsOpenRef.current = true;

        setPageScrollTop(0);
        runAfterSettingsRender(() => setPageScrollTop(0));
        return;
      }

      settingsOpenRef.current = false;
      const restoreTop = readerScrollTopRef.current;

      runAfterSettingsRender(() => setPageScrollTop(restoreTop));
    }

    document.addEventListener("click", handleClick, true);

    return () => {
      document.removeEventListener("click", handleClick, true);
    };
  }, []);

  return null;
}
