import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "使い方・取り扱い説明 | LIB read",
  description: "LIB read の使い方、取り扱い説明、朗読や演出の見方",
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

export default function GuidePage() {
  return (
    <main className="min-h-screen bg-white text-black">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-10 sm:px-6">
      <header className="space-y-3">
        <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">LIB read</p>
        <h1 className="text-3xl font-bold text-black">使い方・取り扱い説明</h1>
        <p className="text-sm leading-7 text-neutral-700">
          LIB read は、小説投稿サイトの基盤を保ちながら、朗読やささやかな演出も一緒に楽しめるサイトです。
          初見で迷いやすい点を、このページでまとめています。
        </p>
        <div className="flex flex-wrap gap-4 text-sm">
          <Link className="text-neutral-700 underline underline-offset-4" href="/">
            トップへ戻る
          </Link>
          <Link className="text-neutral-700 underline underline-offset-4" href="/faq">
            FAQ
          </Link>
          <Link className="text-neutral-700 underline underline-offset-4" href="/contact">
            お問い合わせ
          </Link>
        </div>
      </header>

      <Section title="1. LIB read って何のサイトか">
        <p>
          LIB read は、文章作品を読むだけでなく、朗読を聞いたり、作品に付いた演出も含めて楽しめる小説投稿サイトです。
        </p>
        <p>
          従来の小説投稿サイトのように使うこともできるし、朗読を中心に楽しむ使い方もできます。
          書く人、読む人、聞く人、読み上げる人がそれぞれ参加できるのが特徴です。
        </p>
      </Section>

      <Section title="2. まず最初に何をすればいいか">
        <p>初見なら、まずは次の流れで使うと分かりやすいです。</p>
        <ol className="list-decimal space-y-2 pl-5">
          <li>トップページや検索ページから作品を探す</li>
          <li>作品詳細ページであらすじや作者情報を見る</li>
          <li>本文を読むか、朗読がある場合は再生して聞く</li>
          <li>気になったら別作品や作者ページへ移動する</li>
        </ol>
      </Section>

      <Section title="3. 作品の探し方">
        <p>
          トップページでは、新着更新、週間新作おすすめ、総合人気順、朗読視聴人気順などから作品を探せます。
        </p>
        <p>
          さらに探したい場合は、
          <Link className="underline underline-offset-4" href="/search">
            検索ページ
          </Link>
          から条件に合う作品を探してください。
        </p>
      </Section>

      <Section title="4. 読み方・聞き方">
        <p>
          作品詳細ページから各話へ進み、通常の小説投稿サイトのように本文を読めます。
          朗読が登録されている場合は、読むだけでなく聞くこともできます。
        </p>
        <p>
          作品や話によっては、朗読の有無、演出の有無、表示のされ方が異なります。
          すべての作品に同じ機能が付くとは限りません。
        </p>
      </Section>

      <Section title="5. 朗読者や演出の見方">
        <p>
          LIB read では、作品本文そのものだけでなく、朗読や演出も表現の一部として扱います。
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>朗読者情報が表示されている場合は、誰が読んだかを確認できます</li>
          <li>作品によっては、文字や背景などに演出が付くことがあります</li>
          <li>演出は作品の雰囲気を広げるためのもので、作品ごとに有無や強さが違います</li>
        </ul>
        <p>
          まずは通常の閲覧感覚で入り、朗読や演出が付いていたら追加の楽しみとして触ってみるのがおすすめです。
        </p>
      </Section>

      <Section title="6. 投稿や朗読をしたい場合">
        <p>
          自分で作品を投稿したい場合は、
          <Link className="underline underline-offset-4" href="/write">
            投稿ページ
          </Link>
          側の導線から進みます。
        </p>
        <p>
          朗読を行いたい場合は、
          <Link className="underline underline-offset-4" href="/record">
            朗読ページ
          </Link>
          側の導線から進みます。
        </p>
        <p>
          作品や朗読の公開条件、権利関係、注意事項については、
          <Link className="underline underline-offset-4" href="/terms">
            利用規約
          </Link>
          も確認してください。
        </p>
      </Section>

      <Section title="7. 継続的な改善について">
        <p>
          LIB read は、公開中の機能を提供しながら、使いやすさや表示内容を継続的に改善しているサービスです。
          画面、機能、導線、仕様、表示内容は必要に応じて更新されることがあります。
        </p>
        <p>
          更新に伴い、表示位置や文言、利用できる導線が変わる場合があります。
          公開中の機能や案内内容が分かりやすくなるよう、改善を続けています。
        </p>
      </Section>

      <Section title="8. 困ったとき">
        <p>
          よくある疑問は
          <Link className="underline underline-offset-4" href="/faq">
            FAQ
          </Link>
          にまとめています。
        </p>
        <p>
          不具合報告、権利侵害申告、削除依頼、その他の連絡は
          <Link className="underline underline-offset-4" href="/contact">
            お問い合わせページ
          </Link>
          を使ってください。
        </p>
      </Section>
        {/* AI_GUIDE_V1 */}
        <Section title="9. AI生成で物語を作る">
          <p>
            AI生成ページでは、読む時間、場面、ジャンル、雰囲気を選んで、その条件に合わせた短編を作れます。
          </p>
          <ol className="list-decimal space-y-2 pl-5">
            <li>
              <Link className="underline underline-offset-4" href="/generate">
                AI生成ページ
              </Link>
              で条件を選ぶ
            </li>
            <li>生成された物語を読む。生成直後の内容は端末内の一時データとして扱われます</li>
            <li>残したい場合はログイン後に保存・編集し、公開したい場合は内容を確認して投稿する</li>
          </ol>
          <p>
            AI生成結果は自動出力であり、事実性や第三者権利の非侵害を保証するものではありません。
            公開前に必ず内容を確認してください。
          </p>
        </Section>

      </div>
    </main>
  );
}