"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { SeriesContentWarning } from "@/lib/contentRating";

type Props = {
  seriesId?: string | null;
  initialWarnings?: SeriesContentWarning[];
  lockedWarnings?: SeriesContentWarning[];
  isAiGenerated?: boolean;
};

const PENDING_KEY = "duonovel:pending-content-rating-create";

const WARNING_OPTIONS: Array<{
  value: SeriesContentWarning;
  label: string;
  description: string;
}> = [
  {
    value: "sexual_r18",
    label: "性的コンテンツを含む（R18）",
    description:
      "18歳未満の閲覧を想定しない性的表現を含む作品。R18表示設定がOFFの閲覧者には公開一覧・本文を表示しません。",
  },
  {
    value: "violence",
    label: "暴力描写あり",
    description:
      "戦闘、負傷、流血など、読者が事前に把握した方がよい暴力描写を含む作品。",
  },
];

function warningSummary(warnings: SeriesContentWarning[]): string {
  const labels: string[] = [];
  if (warnings.includes("sexual_r18")) labels.push("R18");
  if (warnings.includes("violence")) labels.push("暴力描写あり");
  return labels.length > 0 ? labels.join("・") : "なし";
}

function findStatusGrid(): HTMLElement | null {
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>("main button"));
  const publicationButton = buttons.find((button) => {
    const first = button.querySelector<HTMLElement>(":scope > span:first-child");
    return first?.textContent?.trim() === "公開状態";
  });
  return publicationButton?.parentElement instanceof HTMLElement
    ? publicationButton.parentElement
    : null;
}

function ensureHosts(): {
  statusHost: HTMLElement;
  panelHost: HTMLElement;
} | null {
  const grid = findStatusGrid();
  if (!grid) return null;

  let statusHost = grid.querySelector<HTMLElement>(
    ":scope > [data-content-warning-status-host='true']"
  );
  if (!statusHost) {
    statusHost = document.createElement("div");
    statusHost.dataset.contentWarningStatusHost = "true";
    statusHost.style.display = "contents";

    const firstNonButton = Array.from(grid.children).find(
      (node) => node.tagName !== "BUTTON"
    );
    grid.insertBefore(statusHost, firstNonButton ?? null);
  }

  let panelHost = grid.querySelector<HTMLElement>(
    ":scope > [data-content-warning-panel-host='true']"
  );
  if (!panelHost) {
    panelHost = document.createElement("div");
    panelHost.dataset.contentWarningPanelHost = "true";
    panelHost.style.gridColumn = "1 / -1";

    const firstNonButton = Array.from(grid.children).find(
      (node) =>
        node !== statusHost &&
        node.tagName !== "BUTTON" &&
        !(node instanceof HTMLElement && node.dataset.contentWarningPanelHost === "true")
    );
    grid.insertBefore(panelHost, firstNonButton ?? null);
  }

  return { statusHost, panelHost };
}

export default function ContentRatingWorkspaceBridge({
  seriesId,
  initialWarnings = [],
  lockedWarnings = [],
  isAiGenerated = false,
}: Props) {
  const normalizedInitial = useMemo(
    () => Array.from(new Set(initialWarnings)),
    [initialWarnings]
  );
  const normalizedLocks = useMemo(
    () => Array.from(new Set(lockedWarnings)),
    [lockedWarnings]
  );
  const [statusHost, setStatusHost] = useState<HTMLElement | null>(null);
  const [panelHost, setPanelHost] = useState<HTMLElement | null>(null);
  const [warnings, setWarnings] = useState<SeriesContentWarning[]>(() =>
    Array.from(new Set([...normalizedInitial, ...normalizedLocks]))
  );
  const [savedWarnings, setSavedWarnings] = useState<SeriesContentWarning[]>(() =>
    Array.from(new Set([...normalizedInitial, ...normalizedLocks]))
  );
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const next = Array.from(new Set([...normalizedInitial, ...normalizedLocks]));
    setWarnings(next);
    setSavedWarnings(next);
    setMessage("");
  }, [normalizedInitial, normalizedLocks, seriesId]);

  useEffect(() => {
    function handleApplied(event: Event) {
      const detail = (
        event as CustomEvent<{ warnings?: SeriesContentWarning[] }>
      ).detail;
      if (!Array.isArray(detail?.warnings)) return;
      const next = Array.from(new Set([...detail.warnings, ...normalizedLocks]));
      setWarnings(next);
      setSavedWarnings(next);
      setMessage("保存済み");
    }

    window.addEventListener("libread:content-rating-applied", handleApplied);
    return () =>
      window.removeEventListener("libread:content-rating-applied", handleApplied);
  }, [normalizedLocks]);

  useEffect(() => {
    let currentStatusHost: HTMLElement | null = null;
    let currentPanelHost: HTMLElement | null = null;

    function ensureUi() {
      const hosts = ensureHosts();
      if (!hosts) return;

      if (currentStatusHost !== hosts.statusHost) {
        currentStatusHost = hosts.statusHost;
        setStatusHost(hosts.statusHost);
      }
      if (currentPanelHost !== hosts.panelHost) {
        currentPanelHost = hosts.panelHost;
        setPanelHost(hosts.panelHost);
      }
    }

    ensureUi();
    const observer = new MutationObserver(ensureUi);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      currentStatusHost = null;
      currentPanelHost = null;
    };
  }, []);

  useEffect(() => {
    if (seriesId) return;

    function rememberCreateSelection(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const button = target.closest<HTMLButtonElement>("button");
      if (!button || !button.textContent?.includes("作品を作成")) return;

      if (warnings.length === 0) {
        window.sessionStorage.removeItem(PENDING_KEY);
        return;
      }

      window.sessionStorage.setItem(
        PENDING_KEY,
        JSON.stringify({
          warnings,
          startedAt: Date.now(),
          sourcePath: window.location.pathname,
        })
      );
    }

    document.addEventListener("click", rememberCreateSelection, true);
    return () => document.removeEventListener("click", rememberCreateSelection, true);
  }, [seriesId, warnings]);

  async function persistWarnings(nextWarnings: SeriesContentWarning[]) {
    const protectedWarnings = Array.from(
      new Set([...nextWarnings, ...normalizedLocks])
    );

    if (!seriesId) {
      setWarnings(protectedWarnings);
      setMessage("");
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      const response = await fetch(
        "/api/series/" + encodeURIComponent(seriesId) + "/content-rating",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ warnings: protectedWarnings }),
        }
      );
      const payload = (await response.json()) as {
        ok?: boolean;
        warnings?: SeriesContentWarning[];
        lockedWarnings?: SeriesContentWarning[];
        message?: string;
      };

      if (!response.ok || !payload.ok || !Array.isArray(payload.warnings)) {
        setMessage(payload.message || "コンテンツ警告を更新できませんでした。");
        return;
      }

      const saved = Array.from(
        new Set([...payload.warnings, ...(payload.lockedWarnings ?? normalizedLocks)])
      );
      setWarnings(saved);
      setSavedWarnings(saved);
      setMessage("保存済み");
    } catch {
      setMessage("コンテンツ警告を更新できませんでした。");
    } finally {
      setSaving(false);
    }
  }

  function toggleWarning(warning: SeriesContentWarning) {
    if (saving || normalizedLocks.includes(warning)) return;
    const next = warnings.includes(warning)
      ? warnings.filter((item) => item !== warning)
      : [...warnings, warning];
    void persistWarnings(next);
  }

  const status = statusHost
    ? createPortal(
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          className={[
            "rounded-2xl border px-3 py-3 text-left transition",
            open
              ? "border-sky-200 bg-sky-50"
              : warnings.includes("sexual_r18")
                ? "border-red-200 bg-red-50 hover:bg-red-100"
                : "border-black/10 bg-white hover:bg-neutral-50",
          ].join(" ")}
          aria-expanded={open}
        >
          <span className="block text-[11px] tracking-[0.16em] text-neutral-500">
            コンテンツ警告
          </span>
          <span className="mt-1 block text-sm font-semibold text-black">
            {warningSummary(warnings)}
          </span>
          <span className="mt-2 block text-xs text-neutral-500">
            {open ? "閉じる" : "変更"}
          </span>
        </button>,
        statusHost
      )
    : null;

  const panel = panelHost
    ? createPortal(
        open ? (
          <div className="mt-4 rounded-2xl border border-black/10 bg-white p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-black">コンテンツ警告</p>
                <p className="mt-1 text-xs leading-6 text-neutral-500">
                  読者が閲覧前に把握した方がよい内容を作品単位で設定します。
                </p>
              </div>
              {warnings.includes("sexual_r18") ? (
                <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">
                  R18
                </span>
              ) : null}
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {WARNING_OPTIONS.map((option) => {
                const active = warnings.includes(option.value);
                const locked = normalizedLocks.includes(option.value);

                return (
                  <button
                    key={option.value}
                    type="button"
                    disabled={saving || locked}
                    onClick={() => toggleWarning(option.value)}
                    className={[
                      "rounded-2xl border px-3 py-3 text-left text-sm transition disabled:cursor-not-allowed",
                      active
                        ? option.value === "sexual_r18"
                          ? "border-red-200 bg-red-50 text-red-800"
                          : "border-amber-200 bg-amber-50 text-amber-900"
                        : "border-black/10 bg-white text-neutral-700 hover:bg-neutral-50",
                      locked ? "opacity-80" : "",
                    ].join(" ")}
                    aria-pressed={active}
                  >
                    <span className="flex items-center justify-between gap-2 font-semibold">
                      <span>{option.label}</span>
                      <span className="text-xs">
                        {locked ? "固定" : active ? "ON" : "OFF"}
                      </span>
                    </span>
                    <span className="mt-2 block text-xs leading-6 text-neutral-500">
                      {option.description}
                    </span>
                  </button>
                );
              })}
            </div>

            {isAiGenerated && normalizedLocks.includes("sexual_r18") ? (
              <p className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs leading-6 text-red-700">
                この作品はAI生成時点で性的コンテンツを含むと判定されたため、R18警告を解除できません。
              </p>
            ) : null}

            {!seriesId && warnings.length > 0 ? (
              <p className="mt-3 text-xs leading-6 text-neutral-500">
                選択した警告は作品作成直後に新しい作品へ保存されます。
              </p>
            ) : null}

            {seriesId && warningSummary(warnings) !== warningSummary(savedWarnings) ? (
              <button
                type="button"
                onClick={() => {
                  setWarnings(savedWarnings);
                  setMessage("");
                }}
                className="mt-3 rounded-full border border-black/10 bg-white px-3 py-1.5 text-xs text-neutral-700 transition hover:bg-neutral-50"
              >
                保存済みに戻す
              </button>
            ) : null}

            {message ? (
              <p
                className={[
                  "mt-3 text-xs",
                  message === "保存済み" ? "text-emerald-700" : "text-red-700",
                ].join(" ")}
              >
                {message}
              </p>
            ) : null}
          </div>
        ) : null,
        panelHost
      )
    : null;

  return (
    <>
      {status}
      {panel}
    </>
  );
}
