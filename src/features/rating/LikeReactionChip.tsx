type LikeReactionChipProps = {
  liked: boolean;
  likeCount: number;
  disabled?: boolean;
  onClick?: () => void;
};

function HeartIcon({
  filled,
  className,
}: {
  filled: boolean;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 20.5c-.3 0-.6-.1-.9-.3C6.4 16.8 3 13.8 3 9.8 3 7 5 5 7.6 5c1.7 0 3.1.8 4.4 2.3C13.3 5.8 14.7 5 16.4 5 19 5 21 7 21 9.8c0 4-3.4 7-8.1 10.4-.3.2-.6.3-.9.3Z" />
    </svg>
  );
}

export default function LikeReactionChip({
  liked,
  likeCount,
  disabled = false,
  onClick,
}: LikeReactionChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={liked}
      className={[
        "inline-flex h-[46px] items-center gap-2 rounded-full border px-3.5 text-sm transition",
        liked
          ? "border-pink-200 bg-pink-50"
          : "border-black/10 bg-white hover:bg-neutral-50",
        disabled ? "opacity-70" : "",
      ].join(" ")}
    >
      <HeartIcon
        filled={liked}
        className={[
          "h-4 w-4",
          liked ? "text-pink-500" : "text-neutral-700",
        ].join(" ")}
      />
      <span
        className={[
          "font-medium",
          liked ? "text-pink-600" : "text-neutral-800",
        ].join(" ")}
      >
        {likeCount}
      </span>
    </button>
  );
}