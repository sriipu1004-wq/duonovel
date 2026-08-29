import Link from "next/link";

type SubscriptionUpgradePromptProps = {
  compact?: boolean;
  className?: string;
};

export default function SubscriptionUpgradePrompt({
  compact = false,
  className = "",
}: SubscriptionUpgradePromptProps) {
  return (
    <div
      className={`${compact ? "px-3 py-2" : "px-4 py-3"} rounded-2xl border border-sky-200 bg-sky-50 text-sm leading-6 text-sky-950 ${className}`}
    >
      無料分を使い切りました。月額680円で生成上限を増やし、単語解説を無制限にできます。{" "}
      <Link href="/subscription" className="font-semibold underline underline-offset-4">
        サブスクを見る
      </Link>
    </div>
  );
}
