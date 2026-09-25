"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useUiLocale } from "@/i18n/UiLocaleProvider";

type Mode = "open" | "closed";
type Props = { seriesId?: string | null; initialMode: Mode };

const COPY = {
  ja: {
    heading: "人による翻訳",
    allow: "人による翻訳を許可",
    deny: "人による翻訳を許可しない",
    description: "許可すると、他のユーザーがこの作品を自分で翻訳し、LIB read上で公開できます。AI翻訳とは別の許可で、ONにしても本文をAIサービスへ送信しません。",
    closedNote: "OFFにすると新しいHuman translationの作成・公開を停止します。すでに公開済みの翻訳は削除されません。",
    saved: "保存済み",
    failed: "人による翻訳の許可設定を更新できませんでした。",
    restore: "保存済みに戻す",
  },
  en: {
    heading: "Human translation",
    allow: "Allow Human translations",
    deny: "Do not allow Human translations",
    description: "If allowed, other users can translate this work themselves and publish the translation on LIB read. This is separate from AI translation, and enabling it does not send the text to an AI provider.",
    closedNote: "Turning this off stops new Human translations from being created or published. Already-published translations are not deleted.",
    saved: "Saved",
    failed: "Could not update the Human translation permission.",
    restore: "Restore saved value",
  },
  ko: {
    heading: "사람 번역",
    allow: "사람 번역 허용",
    deny: "사람 번역 허용 안 함",
    description: "허용하면 다른 사용자가 이 작품을 직접 번역해 LIB read에 공개할 수 있습니다. AI 번역과는 별도 권한이며, 이 설정을 켜도 본문을 AI 서비스로 보내지 않습니다.",
    closedNote: "끄면 새로운 사람 번역의 작성·공개가 중지됩니다. 이미 공개된 번역은 삭제되지 않습니다.",
    saved: "저장됨",
    failed: "사람 번역 허용 설정을 업데이트하지 못했습니다.",
    restore: "저장된 값으로 되돌리기",
  },
} as const;

function findPanel(): HTMLElement | null {
  const translationHost = document.querySelector<HTMLElement>("[data-translation-permission-host='true']");
  if (translationHost?.parentElement) return translationHost.parentElement;
  const headings = Array.from(document.querySelectorAll<HTMLElement>("main p"));
  return headings.find((node) => node.textContent?.trim() === "許可")?.parentElement ?? null;
}

export default function HumanTranslationPermissionWorkspaceBridge({ seriesId, initialMode }: Props) {
  const locale = useUiLocale();
  const copy = COPY[locale];
  const [mode, setMode] = useState<Mode>(initialMode);
  const [savedMode, setSavedMode] = useState<Mode>(initialMode);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setMode(initialMode);
    setSavedMode(initialMode);
  }, [initialMode, seriesId]);

  useEffect(() => {
    let current: HTMLElement | null = null;
    const ensure = () => {
      const panel = findPanel();
      if (!panel) return;
      let next = panel.querySelector<HTMLElement>(":scope > [data-human-translation-permission-host='true']");
      if (!next) {
        next = document.createElement("div");
        next.dataset.humanTranslationPermissionHost = "true";
        panel.appendChild(next);
      }
      if (current !== next) {
        current = next;
        setHost(next);
      }
    };
    ensure();
    const observer = new MutationObserver(ensure);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  async function updateMode(next: Mode) {
    if (saving || next === mode) return;
    if (!seriesId) {
      setMode(next);
      setMessage("");
      window.dispatchEvent(new CustomEvent("libread:human-translation-permission-selection-changed", { detail: { mode: next } }));
      return;
    }

    setSaving(true);
    setMessage("");
    try {
      const response = await fetch(`/api/series/${encodeURIComponent(seriesId)}/human-translation-permission`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: next }),
      });
      const payload = (await response.json().catch(() => null)) as { ok?: boolean; mode?: Mode } | null;
      if (!response.ok || !payload?.ok) {
        setMessage(copy.failed);
        return;
      }
      const actual: Mode = payload.mode === "closed" ? "closed" : "open";
      setMode(actual);
      setSavedMode(actual);
      setMessage(copy.saved);
    } catch {
      setMessage(copy.failed);
    } finally {
      setSaving(false);
    }
  }

  if (!host) return null;

  return createPortal(
    <div className="mt-4 border-t border-black/10 pt-4">
      <p className="text-xs tracking-[0.16em] text-neutral-500">{copy.heading}</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {([["open", copy.allow], ["closed", copy.deny]] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            disabled={saving}
            onClick={() => void updateMode(value)}
            className={[
              "rounded-2xl border px-3 py-3 text-left text-sm transition disabled:cursor-not-allowed disabled:opacity-50",
              mode === value
                ? "border-sky-200 bg-sky-50 text-black"
                : "border-black/10 bg-white text-neutral-700 hover:bg-neutral-50",
            ].join(" ")}
          >
            <span className="block font-semibold">{label}</span>
          </button>
        ))}
      </div>
      <p className="mt-3 text-xs leading-6 text-neutral-600">{copy.description}</p>
      <p className="mt-1 text-xs leading-6 text-neutral-500">{copy.closedNote}</p>
      {message ? (
        <p className={`mt-3 text-xs ${message === copy.saved ? "text-emerald-700" : "text-red-700"}`}>
          {message}
        </p>
      ) : null}
      {mode !== savedMode ? (
        <button
          type="button"
          onClick={() => {
            setMode(savedMode);
            setMessage("");
            window.dispatchEvent(new CustomEvent("libread:human-translation-permission-selection-changed", { detail: { mode: savedMode } }));
          }}
          className="mt-4 rounded-full border border-black/10 bg-white px-3 py-1.5 text-xs text-neutral-700"
        >
          {copy.restore}
        </button>
      ) : null}
    </div>,
    host
  );
}
