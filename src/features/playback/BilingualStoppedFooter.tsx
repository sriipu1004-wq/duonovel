"use client";

import Image from "next/image";
import type { ReactNode } from "react";

const ICONS = {
  settings: "/player-icons/settings.png",
  play: "/player-icons/play.png",
  next: "/player-icons/next.png",
  prev: "/player-icons/prev.png",
  bookmark: "/player-icons/bookmark.png",
} as const;

function StoppedAction({
  label,
  icon,
}: {
  label: string;
  icon?: string;
}) {
  return (
    <button
      type="button"
      disabled
      className="flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-2xl border border-black/10 bg-neutral-50 px-1 py-2 text-[10px] leading-tight text-neutral-400"
    >
      {icon ? (
        <Image src={icon} alt="" width={18} height={18} className="opacity-35" />
      ) : null}
      <span className="whitespace-pre-line">{label}</span>
    </button>
  );
}

type BilingualStoppedFooterProps = {
  currentIndex: number;
  total: number;
  children?: ReactNode;
};

export default function BilingualStoppedFooter({
  currentIndex,
  total,
  children,
}: BilingualStoppedFooterProps) {
  const safeTotal = Math.max(0, total);
  const safeIndex =
    safeTotal > 0 ? Math.min(safeTotal - 1, Math.max(0, currentIndex)) : 0;
  const positionLabel =
    safeTotal > 0 ? `${safeIndex + 1} / ${safeTotal}` : "0 / 0";

  return (
    <section
      aria-label="対訳中の朗読フッター"
      className="mt-5 border-t border-black/10 bg-white pt-4"
    >
      <div className="rounded-3xl border border-black/10 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3 text-sm text-neutral-700">
          <span>{positionLabel}</span>
          <span className="font-medium">朗読停止中</span>
        </div>
        <input
          type="range"
          min={0}
          max={Math.max(0, safeTotal - 1)}
          value={safeIndex}
          disabled
          readOnly
          className="mt-3 w-full accent-sky-300 opacity-40"
        />
        <p className="mt-2 text-xs leading-6 text-neutral-500">
          対訳モードでは連続朗読を停止しています。1文再生は本文上部から利用できます。
        </p>
        {children}
      </div>

      <div className="mt-3 grid w-full grid-cols-7 gap-2">
        <StoppedAction label="栞" icon={ICONS.bookmark} />
        <StoppedAction label="1.0x" />
        <StoppedAction label="前話" icon={ICONS.prev} />
        <StoppedAction label="再生" icon={ICONS.play} />
        <StoppedAction label="次話" icon={ICONS.next} />
        <StoppedAction label={"自動追尾\nOFF"} />
        <StoppedAction label="設定" icon={ICONS.settings} />
      </div>
    </section>
  );
}
