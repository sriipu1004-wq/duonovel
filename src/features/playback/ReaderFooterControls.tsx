"use client";

import Image from "next/image";

export const PLAYER_ICON_PATHS = {
  settings: "/player-icons/settings.png",
  stop: "/player-icons/stop.png",
  play: "/player-icons/play.png",
  next: "/player-icons/next.png",
  prev: "/player-icons/prev.png",
  bookmarkFilled: "/player-icons/bookmark-filled.png",
  bookmark: "/player-icons/bookmark.png",
} as const;

export function FooterActionButton({
  label,
  iconSrc,
  disabled = false,
  active = false,
  onClick,
}: {
  label: string;
  iconSrc?: string;
  disabled?: boolean;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label.replace(/\n/g, " ")}
      title={label.replace(/\n/g, " ")}
      disabled={disabled}
      onClick={onClick}
      className={[
        "flex h-12 w-full items-center justify-center rounded-2xl px-2 text-center text-[10px] font-medium leading-tight transition sm:text-sm",
        iconSrc
          ? active
            ? "border-0 bg-sky-50/70"
            : "border-0 bg-transparent hover:bg-neutral-50/70"
          : active
            ? "border border-sky-200 bg-sky-50 text-black"
            : "border border-black/10 bg-white text-black hover:bg-neutral-50",
        disabled ? "cursor-not-allowed opacity-35" : "",
      ].join(" ")}
    >
      {iconSrc ? (
        <Image
          src={iconSrc}
          alt=""
          width={28}
          height={28}
          className="h-7 w-7 object-contain opacity-80"
        />
      ) : (
        <span className="whitespace-pre-line">{label}</span>
      )}
    </button>
  );
}

export function FooterPlaybackRateControl({
  value,
  onDecrease,
  onIncrease,
}: {
  value: number;
  onDecrease: () => void;
  onIncrease: () => void;
}) {
  return (
    <div className="flex h-12 w-full overflow-hidden rounded-2xl border border-black/10 bg-white">
      <button
        type="button"
        aria-label="朗読速度を下げる"
        onClick={onDecrease}
        disabled={value <= 0.7}
        className="flex w-1/4 items-center justify-center border-r border-black/10 text-sm text-black transition hover:bg-neutral-50 disabled:text-neutral-400"
      >
        −
      </button>
      <div className="flex flex-1 items-center justify-center text-[10px] font-medium text-black sm:text-sm">
        ×{value.toFixed(1)}
      </div>
      <button
        type="button"
        aria-label="朗読速度を上げる"
        onClick={onIncrease}
        disabled={value >= 1.5}
        className="flex w-1/4 items-center justify-center border-l border-black/10 text-sm text-black transition hover:bg-neutral-50 disabled:text-neutral-400"
      >
        ＋
      </button>
    </div>
  );
}
