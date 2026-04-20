type PublicAdSlotProps = {
  slotId: string;
  title?: string;
  description?: string;
  className?: string;
  minHeightClassName?: string;
};

export default function PublicAdSlot({
  slotId,
  title = "広告掲載予定",
  description = "公開初期は読書導線を壊さない位置に限定して、後から本番広告タグを差し込める形だけ先に整えている。",
  className = "",
  minHeightClassName = "min-h-[140px]",
}: PublicAdSlotProps) {
  return (
    <section
      aria-label="広告枠"
      data-ad-slot={slotId}
      data-ad-placeholder="true"
      className={[
        "rounded-[24px] border border-dashed border-black/15 bg-neutral-50 p-4 sm:p-5",
        className,
      ].join(" ")}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="rounded-full border border-black/10 bg-white px-3 py-1 text-[11px] tracking-[0.18em] text-neutral-500">
            広告
          </span>
          <h2 className="mt-3 text-lg font-semibold text-black">{title}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-neutral-600">
            {description}
          </p>
        </div>

        <span className="rounded-full border border-black/10 bg-white px-3 py-1 text-xs text-neutral-500">
          本番タグ差し込み前
        </span>
      </div>

      <div
        className={[
          "mt-4 flex items-center justify-center rounded-[20px] border border-black/10 bg-white px-4 text-center text-sm leading-7 text-neutral-500",
          minHeightClassName,
        ].join(" ")}
      >
        この枠は広告プレースホルダー。読む・聞く・移動する操作と紛らわしい UI は置かない。
      </div>
    </section>
  );
}