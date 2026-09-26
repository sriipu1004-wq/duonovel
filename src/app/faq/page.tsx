import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "FAQ | LIB read",
  description: "LIB readのReader、AI翻訳、Human translation、個人本棚、料金、投稿に関するよくある質問。",
  alternates: {
    canonical: "/faq",
    languages: {
      ja: "/faq",
      en: "/en/faq",
      ko: "/ko/faq",
      "x-default": "/faq",
    },
  },
  robots: { index: false, follow: true },
  openGraph: {
    type: "website",
    locale: "ja_JP",
    siteName: "LIB read",
    url: "/faq",
    title: "FAQ | LIB read",
    description: "LIB readのReader、AI翻訳、Human translation、個人本棚、料金、投稿に関するよくある質問。",
    images: ["/opengraph-image"],
  },
  twitter: {
    card: "summary_large_image",
    title: "FAQ | LIB read",
    description: "LIB readのReader、AI翻訳、Human translation、個人本棚、料金、投稿に関するよくある質問。",
    images: ["/opengraph-image"],
  },
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
          answer="長編・Web小説を投稿・閲覧し、同じ作品をOriginal・Bilingual・Translation onlyで読める多言語読書プラットフォームです。AI翻訳とHuman translationは別の翻訳ソースとして扱い、個人本棚や読み上げも利用できます。"
        />
        <FaqItem
          question="無料で使える？"
          answer={
            <>
              はい。Freeは¥0で、公開作品の閲覧と最大3作品の個人本棚を利用できます。公開作品のAI翻訳解放と個人本棚への取り込みは合計1日3回の共通枠です。Premiumは月額680円で、公開AI翻訳解放は1日30回、個人本棚への取り込みは日次回数制限なし、個人本棚は最大20作品です。詳しくは
              {" "}
              <Link className="underline underline-offset-4" href="/subscription">料金ページ</Link>
              を確認してください。Human translationの閲覧にはAI利用枠やクレジットを使いません。
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
          answer="公開ページと公開作品はアカウントなしでも閲覧できます。個人本棚への取り込み、翻訳作成など、利用者本人の保存・投稿を伴う機能にはログインが必要です。"
        />
        <FaqItem
          question="Readerには何種類の読み方がある？"
          answer="Original・Bilingual・Translation onlyの3種類です。AI/Humanは4つ目のReader modeではなく、BilingualまたはTranslation onlyで使う翻訳ソースの選択です。"
        />
        <FaqItem
          question="朗読が付いている作品だけ聞ける？"
          answer="朗読が登録されている作品なら聞ける。すべての作品に朗読があるわけではない。"
        />
        <FaqItem
          question="Human translationはいつ選べる？"
          answer="その作品・対象言語に公開済みのHuman translationがある場合だけ、Readerに翻訳ソース選択が表示されます。すべての作品にHuman translationがあるわけではありません。"
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

      <Section title="投稿作品・AI翻訳・Human translation">
        <FaqItem
          question="投稿作品はLIB readのAI学習に使われる？"
          answer="現行実装には、通常の投稿作品をLIB read独自のモデル学習用データセットやfine-tuning用コーパスとして収集・出力する処理はありません。ただし、作者がAI翻訳を許可した作品で読者が未生成のAI翻訳等を利用すると、処理に必要な本文がOpenAI APIへ送信されることがあります。OpenAIの公開方針ではAPIの入力・出力は既定では学習に利用されませんが、組織が明示的にデータ共有へ参加した場合は別です。標準のabuse-monitoring logsでは内容が最大30日保持される場合があり、LIB readのOpenAIアカウント固有のdata sharing・Zero Data Retention・Modified Abuse Monitoring設定は現時点で未確認です。"
        />
        <FaqItem
          question="AI翻訳を許可すると何が起こる？"
          answer="作品を投稿・公開しただけではAIへ送信しません。読者がまだ生成されていない対訳を実際に利用するとき、対象話の本文と、用語・翻訳方針・直前の公開話など翻訳の一貫性に必要な限定情報をOpenAI APIへ送信することがあります。生成済み翻訳はLIB read内に保存し、同じ条件では再利用します。"
        />
        <FaqItem
          question="AI翻訳を許可しないことはできる？"
          answer="できます。AI翻訳を許可しない設定では、その作品について新しいAI翻訳と新しいAI単語解説を実行しません。既に生成済みの翻訳や単語解説は、再生成を避けるためLIB read内で再利用される場合があります。"
        />
        <FaqItem
          question="AI翻訳とHuman translationの許可は同じ設定？"
          answer="別です。作者はAI翻訳とHuman translationを別々に許可・停止できます。Human translationを許可してもOpenAIへ本文を送ることにはならず、人が作成する翻訳はAI利用枠・クレジット・AI unlockを消費しません。"
        />
        <FaqItem
          question="Human translationは誰でも公開できる？"
          answer="作者がHuman translationを許可している作品で、ログイン利用者が対象話・対象言語の翻訳をDraftとして作成し、編集後に公開できます。公開後は取り下げもできます。複数の翻訳者が同じ話・言語に別々の翻訳を公開できる設計です。"
        />
        <FaqItem
          question="AI翻訳の長編一貫性は保証される？"
          answer="保証されません。作品単位の用語集と限定された前話コンテキストを使って人名・固有名詞などの揺れを抑える設計ですが、完全な一貫性や人間同等の翻訳品質を保証するものではありません。"
        />
        <FaqItem
          question="LIB read OfficialならすべてPublic Domain？"
          answer="いいえ。Officialであること自体はPublic Domainの根拠ではありません。Public Domainとして扱うには、作品ごとの出典・権利状態を確認できるprovenanceとrights reviewが必要です。"
        />
        <FaqItem
          question="公開作品がAIクローラーに収集される問題も同じ？"
          answer="別の問題です。LIB readが翻訳のためにOpenAI APIへ本文を送る処理と、公開Webページを外部クローラーが巡回することは別経路です。現在のrobots設定は一般公開ページを主要AIクローラー専用には遮断していません。robotsの指定だけで収集や学習を完全に防げるとも限りません。"
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

      </div>
    </main>
  );
}
