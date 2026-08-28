"use client";

import Image from "next/image";

const ICONS = {
  settings: "/player-icons/settings.png",
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
      aria-label={label}
      title={label}
      disabled
      className="flex h-12 w-full cursor-not-allowed items-center justify-center rounded-2xl border-0 bg-transparent px-2 text-center text-[10px] font-medium leading-tight opacity-35 sm:text-sm"
    >
      {icon ? (
        <Image
          src={icon}
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

export default function BilingualStoppedFooter() {
  return (
    <section
      aria-label="対訳中の朗読フッター"
      className="mt-5 border-t border-black/10 bg-white pt-3"
    >
      <div className="grid w-full grid-cols-4 gap-2">
        <StoppedAction label="栞" icon={ICONS.bookmark} />
        <StoppedAction label="前話" icon={ICONS.prev} />
        <StoppedAction label="次話" icon={ICONS.next} />
        <StoppedAction label="設定" icon={ICONS.settings} />
      </div>
    </section>
  );
}
