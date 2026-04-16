import Link from "next/link";
import { RECORDING_TERMS_HREF } from "@/lib/recording/recordingConsent";

export function RecordingLegalFooter() {
  return (
    <div className="text-xs leading-6 text-neutral-500">
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <Link
          href={RECORDING_TERMS_HREF}
          className="transition hover:text-black"
        >
          朗読投稿規約
        </Link>
        <Link href="/terms" className="transition hover:text-black">
          利用規約
        </Link>
        <Link href="/privacy" className="transition hover:text-black">
          プライバシーポリシー
        </Link>
        <Link href="/contact" className="transition hover:text-black">
          お問い合わせ
        </Link>
      </div>
    </div>
  );
}