type PublicAdSlotProps = {
  slotId: string;
  title?: string;
  description?: string;
  className?: string;
  minHeightClassName?: string;
};

/**
 * Public ad rendering remains disabled until ad approval and consent handling are ready.
 * Keep this component as the single future insertion point for approved ad code.
 */
export default function PublicAdSlot(props: PublicAdSlotProps) {
  void props;
  return null;
}
