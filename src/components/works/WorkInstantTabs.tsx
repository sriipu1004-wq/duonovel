"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

type WorkTab = "toc" | "readers";

type WorkInstantTabsProps = {
  seriesId: string;
  initialTab: WorkTab;
  currentRangeStart: number;
  children: ReactNode;
};

const ACTIVE_TAB_CLASS =
  "rounded-full border px-4 py-2 text-sm font-medium transition border-sky-200 bg-sky-50 text-black";

const INACTIVE_TAB_CLASS =
  "rounded-full border px-4 py-2 text-sm font-medium transition border-black/10 bg-white text-neutral-700 hover:bg-neutral-50";

function normalizeTab(value: string | null | undefined): WorkTab {
  return value === "readers" ? "readers" : "toc";
}

function updateCurrentUrl(args: {
  seriesId: string;
  tab: WorkTab;
  currentRangeStart: number;
}): void {
  if (typeof window === "undefined") {
    return;
  }

  const url = new URL(window.location.href);
  const worksPath = `/works/${args.seriesId}`;

  if (url.pathname !== worksPath) {
    return;
  }

  url.searchParams.set("tab", args.tab);

  if (!url.searchParams.get("range")) {
    url.searchParams.set("range", String(args.currentRangeStart));
  }

  window.history.replaceState(
    window.history.state,
    "",
    `${url.pathname}${url.search}${url.hash}`
  );
}

export default function WorkInstantTabs({
  seriesId,
  initialTab,
  currentRangeStart,
  children,
}: WorkInstantTabsProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [activeTab, setActiveTab] = useState<WorkTab>(initialTab);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) {
      return;
    }

    root
      .querySelectorAll<HTMLElement>("[data-work-tab-button]")
      .forEach((button) => {
        const tab = normalizeTab(button.dataset.workTabButton);
        const active = tab === activeTab;

        button.className = active ? ACTIVE_TAB_CLASS : INACTIVE_TAB_CLASS;
        button.setAttribute("aria-pressed", active ? "true" : "false");
      });

    root
      .querySelectorAll<HTMLElement>("[data-work-tab-panel]")
      .forEach((panel) => {
        const tab = normalizeTab(panel.dataset.workTabPanel);
        panel.hidden = tab !== activeTab;
      });
  }, [activeTab]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) {
      return;
    }

    const handleClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      const button = target.closest<HTMLElement>("[data-work-tab-button]");
      if (!button) {
        return;
      }

      event.preventDefault();

      const nextTab = normalizeTab(button.dataset.workTabButton);
      setActiveTab(nextTab);
      updateCurrentUrl({
        seriesId,
        tab: nextTab,
        currentRangeStart,
      });
    };

    root.addEventListener("click", handleClick);

    return () => {
      root.removeEventListener("click", handleClick);
    };
  }, [currentRangeStart, seriesId]);

  return (
    <div ref={rootRef} data-work-current-tab={activeTab}>
      {children}
    </div>
  );
}