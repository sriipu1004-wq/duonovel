import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "FAQ | LIB read",
  description: "LIB read のよくある質問",
};

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4 rounded-2xl border border-neutral-800 bg-neutral-950/60 p-5">
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      <div className="space-y-4 text-sm leading-7 text-neutral-300">{children}</div>
    </section>
  );
}

function FaqItem({
  question,
  answer,
}: {
  question: string;
  answer: React.ReactNode;
}) {
  return (
    <div className="space-y-2 rounded-2xl border border-neutral-800/80 bg-black/20 p-4">
      <p className="font-semibold text-white">Q. {question}</p>
      <div className="text-neutral-300">A. {answer}</div>
    </div>
  );
}

export default function FaqPage() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-10 sm:px-6">
      <header className="space-y-3">
        <p className="text-xs uppercase tracking-[0.2em] text-neutral-400">LIB read</p>
        <h1 className="text-3xl font-bold text-white">FAQ</h1>
        <p className="text-sm leading-7 text-neutral-300">
          LIB read を初めて見る人が迷いやすい点を、よくある質問としてまとめています。
        </p>
        <div className="flex flex-wrap gap-4 text-sm">
          <Link className="text-neutral-300 underline underline-offset-4" href="/">
            トップへ戻る
          </Link>
          <Link className="text-neutral-300 underline underline-offset-4" href="/guide">
            使い方・取り扱い説明
          </Link>
          <Link className="text-neutral-300 underline underline-offset-4" href="/contact">
            お問い合わせ
          </Link>
        </div>
      </header>

      <Section title="サイト全般">
        <FaqItem
          question="LIB read は何のサイト？"
          answer="小説投稿サイトを基盤にしつつ、朗読や演出も一緒に扱えるサイト。読むだけでも、聞くだけでも使える。"
        />
        <FaqItem
          question="無料で使える？"
          answer="現状の案内では、トップページでも完全無料サイトとして説明している。"
        />
        <FaqItem
          question="試作段階ってどういう意味？"
          answer="画面、機能、導線、仕様が今後変わる可能性があるという意味。まだ調整中の部分や今後追加される部分がある。"
        />
      </Section>

      <Section title="読む・聞く">
        <FaqItem
          question="アカウントがなくても使える？"
          answer="公開ページや公開作品の閲覧を中心に使える構成で進んでいる。ただし一部機能はログイン前提になることがある。"
        />
        <FaqItem
          question="朗読が付いている作品だけ聞ける？"
          answer="朗読が登録されている作品なら聞ける。すべての作品に朗読があるわけではない。"
        />
        <FaqItem
          question="演出って何を見るもの？"
          answer="文字や背景などの見せ方を含めた表現。作品によって有無や強さが違うので、通常の読書体験に追加される要素として見ると分かりやすい。"
        />
      </Section>

      <Section title="投稿・朗読">
        <FaqItem
          question="読むだけの利用でも問題ない？"
          answer="問題ない。読む人、聞く人、書く人、朗読する人のどこから入っても使える作りを目指している。"
        />
        <FaqItem
          question="作品を投稿したいときは？"
          answer={
            <>
              <Link className="underline underline-offset-4" href="/write">
                投稿ページ
              </Link>
              から進む。
            </>
          }
        />
        <FaqItem
          question="朗読したいときは？"
          answer={
            <>
              <Link className="underline underline-offset-4" href="/record">
                朗読ページ
              </Link>
              から進む。
            </>
          }
        />
        <FaqItem
          question="権利関係の注意はどこを見る？"
          answer={
            <>
              投稿や朗読の扱いは
              <Link className="underline underline-offset-4" href="/terms">
                利用規約
              </Link>
              を先に確認した方がいい。
            </>
          }
        />
      </Section>

      <Section title="困ったとき">
        <FaqItem
          question="不具合や要望はどこから送る？"
          answer={
            <>
              <Link className="underline underline-offset-4" href="/contact">
                お問い合わせページ
              </Link>
              から連絡する。
            </>
          }
        />
        <FaqItem
          question="権利侵害申告や削除依頼はどこ？"
          answer={
            <>
              連絡先や必要事項は
              <Link className="underline underline-offset-4" href="/contact">
                お問い合わせページ
              </Link>
              にまとめてある。
            </>
          }
        />
      </Section>
    </main>
  );
}