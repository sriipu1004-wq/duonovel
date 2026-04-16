import Link from "next/link";
import type { Metadata } from "next";
import { RecordingLegalFooter } from "@/components/recording/RecordingLegalFooter";

export const metadata: Metadata = {
  title: "朗読投稿規約 | LIB read",
  description: "LIB read の朗読投稿規約",
};

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[28px] border border-black/10 bg-white p-5 shadow-sm sm:p-6">
      <h2 className="text-xl font-bold text-black">{title}</h2>
      <div className="mt-4 space-y-3 text-sm leading-8 text-neutral-700">
        {children}
      </div>
    </section>
  );
}

export default function RecordTermsPage() {
  return (
    <main className="min-h-screen bg-[#f4f4f4] text-black">
      <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
        <header className="rounded-[28px] border border-black/10 bg-white p-5 shadow-sm sm:p-6">
          <p className="text-[11px] tracking-[0.24em] text-neutral-500">
            LIB READ RECORDING TERMS
          </p>
          <h1 className="mt-3 text-3xl font-bold text-black">朗読投稿規約</h1>
          <p className="mt-4 text-sm leading-8 text-neutral-700">
            このページは、LIB read における朗読投稿に関するルールをまとめたもの。
            一般の利用規約に加えて、朗読音声の投稿、公開、保存、配信に関して次の内容が適用される。
          </p>
          <div className="mt-4 text-sm text-neutral-500">
            <Link href="/record" className="underline underline-offset-4">
              朗読ページへ戻る
            </Link>
          </div>
        </header>

        <div className="mt-6 grid gap-6">
          <Section title="1. 適用範囲">
            <p>
              この規約は、LIB read 上で行う人力朗読の録音、音声アップロード、publish、
              公開後の再生・配信に適用する。
            </p>
          </Section>

          <Section title="2. 投稿者の確認責任">
            <p>
              投稿者は、投稿する音声について自分が必要な権利または利用条件を確認し、
              適法に利用できる状態であることを自らの責任で確認するものとする。
            </p>
            <p>
              作品ごとの設定、運営判断、権利状態、公開状態その他の事情により、
              朗読制作へ進める作品は変わることがある。
            </p>
          </Section>

          <Section title="3. 投稿者が保証すること">
            <p>
              投稿者は、自分で録音した音声、または自分が適法に利用できる音声のみを投稿するものとする。
            </p>
            <p>
              第三者が録音した音声の無断投稿、なりすまし、虚偽の表示名による投稿、
              権利侵害にあたる投稿をしてはならない。
            </p>
          </Section>

          <Section title="4. 公開・保存・配信">
            <p>
              投稿された音声、朗読者表示名、プロフィール情報、朗読コメント等は、
              サイト上で公開される場合がある。
            </p>
            <p>
              運営は、本サービス提供に必要な範囲で、音声の保存、変換、圧縮、配信、
              再生用データ生成、本文追尾用データ生成を行うことができる。
            </p>
          </Section>

          <Section title="5. 禁止事項">
            <ul className="list-disc space-y-2 pl-5">
              <li>第三者音声の無断投稿</li>
              <li>なりすまし</li>
              <li>権利侵害にあたる投稿</li>
              <li>個人情報、機密情報の混入</li>
              <li>法令違反、公序良俗違反、運営妨害</li>
            </ul>
          </Section>

          <Section title="6. 運営の対応">
            <p>
              運営は、規約違反または違反のおそれがあると判断した場合、
              事前通知なく、非公開化、削除、利用停止、その他必要な対応を行うことがある。
            </p>
          </Section>

          <Section title="7. 同意と更新">
            <p>
              朗読制作へ進む前に所定の確認画面で同意した時点で、
              投稿者は本規約に同意したものとみなす。
            </p>
            <p>
              規約内容が更新された場合、更新 version に応じて再度確認を求めることがある。
            </p>
          </Section>
        </div>

        <div className="mt-6">
          <RecordingLegalFooter />
        </div>
      </div>
    </main>
  );
}