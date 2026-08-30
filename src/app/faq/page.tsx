import Link from "next/link";
import FreePlanOnly from "@/features/billing/FreePlanOnly";
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
    <section className="space-y-3 rounded-[24px] border border-black/10 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-black">{title}</h2>
      <div className="space-y-3 text-sm leading-7 text-neutral-600">
        {children}
      </div>
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
    <div className="space-y-2 rounded-2xl border border-black/10 bg-neutral-50 p-4">
      <p className="font-semibold text-black">Q. {question}</p>
      <div className="text-neutral-600">A. {answer}</div>
    </div>
  );
}

export default function FaqPage() {
  return (
    <main className="min-h-screen bg-white text-black">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-10 sm:px-6">
      <header className="space-y-3">
        <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">LIB read</p>
        <h1 className="text-3xl font-bold text-black">FAQ</h1>
        <p className="text-sm leading-7 text-neutral-700">
          LIB read を初めて見る人が迷いやすい点を、よくある質問としてまとめています。
        </p>
        <div className="flex flex-wrap gap-4 text-sm">
          <Link className="text-neutral-700 underline underline-offset-4" href="/">
            トップへ戻る
          </Link>
          <Link className="text-neutral-700 underline underline-offset-4" href="/guide">
            使い方・取り扱い説明
          </Link>
          <Link className="text-neutral-700 underline underline-offset-4" href="/contact">
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
          answer={
            <>
              公開作品の閲覧、最大3作品の個人本棚、読み上げなどは無料で利用できます。AI機能には無料枠があります。
              <FreePlanOnly>
                {" "}月額680円の
                <Link className="underline underline-offset-4" href="/subscription">サブスク</Link>
                で生成上限の拡大、単語解説無制限、次話対訳の先読みを利用できます。
              </FreePlanOnly>
            </>
          }
        />
        <FaqItem
          question="個人本棚へ入れた作品は他の人に見える？"
          answer="見えません。個人本棚は所有者本人だけが開ける非公開機能で、公開一覧、検索、共有ページ、検索エンジンには表示されません。"
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
        {/* AI_FAQ_V1 */}
        <Section title="AI生成">
          <FaqItem
            question="AI生成は何ができる？"
            answer={
              <>
                <Link className="underline underline-offset-4" href="/generate">
                  AI生成ページ
                </Link>
                で、読む時間、場面、ジャンル、雰囲気を選び、その条件に合わせた短編を作れる。
              </>
            }
          />
          <FaqItem
            question="ログインしなくても生成できる？"
            answer="生成そのものはログインしなくても利用できる。生成後の保存、編集、公開にはログインが必要。"
          />
          <FaqItem
            question="生成した物語はどこに保存される？"
            answer="生成直後の内容は端末内の一時データとして扱われる。保存または公開の操作をした場合は、機能の提供に必要な範囲でサービス側にも保存される。"
          />
          <FaqItem
            question="AI生成結果をそのまま公開してよい？"
            answer="公開前に内容を確認し、公開するコンテンツについて利用者が責任を負う。第三者の権利侵害や規約違反がないかを確認する。"
          />
        </Section>

      </div>
    </main>
  );
}
