type PublicAdSlotProps = {
  slotId: string;
  title?: string;
  description?: string;
  className?: string;
  minHeightClassName?: string;
};

export default function PublicAdSlot({
  slotId,
  className = "",
  minHeightClassName = "min-h-[88px]",
}: PublicAdSlotProps) {
  return (
    <section
      aria-label="広告枠"
      data-ad-slot={slotId}
      data-ad-placeholder="true"
      className={[
        "rounded-[20px] border border-dashed border-black/15 bg-neutral-50 p-3 sm:p-4",
        className,
      ].join(" ")}
    >
      <div
        className={[
          "flex items-center justify-center rounded-[16px] border border-black/10 bg-white px-4 text-center text-[11px] text-neutral-500",
          minHeightClassName,
        ].join(" ")}
      >
        広告掲載予定
      </div>
    </section>
  );
}