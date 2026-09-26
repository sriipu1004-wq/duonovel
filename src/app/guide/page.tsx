import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "使い方・取り扱い説明 | LIB read",
  description: "Original・Bilingual・Translation only、AI/Human翻訳、個人本棚、読み上げ、作品投稿の使い方。",
  alternates: {
    canonical: "/guide",
    languages: {
      ja: "/guide",
      en: "/en/guide",
      ko: "/ko/guide",
      "x-default": "/guide",
    },
  },
  robots: { index: false, follow: true },
  openGraph: {
    type: "website",
    locale: "ja_JP",
    siteName: "LIB read",
    url: "/guide",
    title: "使い方・取り扱い説明 | LIB read",
    description: "Original・Bilingual・Translation only、AI/Human翻訳、個人本棚、読み上げ、作品投稿の使い方。",
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

export default function GuidePage() {
  return (
    <main className="min-h-screen bg-white text-black">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-10 sm:px-6">
      <header className="space-y-3">
        <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">LIB read</p>
        <h1 className="text-3xl font-bold text-black">使い方・取り扱い説明</h1>
        <p className="text-sm leading-7 text-neutral-700">
          3つのReader mode、AI/Human翻訳、個人本棚、読み上げ、Web小説の閲覧・投稿について、画面名と基本操作をまとめています。
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
          LIB read は、長編・Web小説を投稿・閲覧し、原文を正本としてOriginal・Bilingual・Translation onlyで読み分ける多言語読書サービスです。AI翻訳とHuman translationは別の翻訳ソースとして扱い、個人本棚や読み上げも利用できます。
        </p>
        <p>
          画面名は、作品の概要と各話一覧を「作品ページ（目次）」、本文を読む場所を「読む画面」、作者が編集する場所を「作品ワークスペース」と表記します。
        </p>
      </Section>

      <Section title="2. まず最初に何をすればいいか">
        <p>初見なら、まずは次の流れで使うと分かりやすいです。</p>
        <ol className="list-decimal space-y-2 pl-5">
          <li>手元の長編を読む場合は「個人本棚」を開き、ファイルを取り込む</li>
          <li>公開作品を読む場合はトップページまたは検索から作品ページ（目次）を開く</li>
          <li>ReaderでOriginal・Bilingual・Translation onlyを選び、必要なら翻訳先言語とAI/Humanの翻訳ソースを選ぶ</li>
          <li>物語を投稿する場合は作品ワークスペースを使う</li>
        </ol>
      </Section>

      <Section title="3. 個人本棚へ長編を取り込む">
        <p>
          <Link className="underline underline-offset-4" href="/library">
            個人本棚
          </Link>
          では、PDF・EPUB・TXT・DOCXを取り込み、検出した章・話をひとつの作品として管理できます。原文言語は本文から自動判定します。
        </p>
        <p>
          元ファイル自体はサーバーへ保存せず、ブラウザで抽出した本文を本人限定の領域へ保存します。個人本棚の作品は公開一覧、検索、共有ページには表示されません。保存数は無料プランが最大3作品、サブスクが最大20作品です。
        </p>
        <p>
          自分で作成した作品、著作権が切れた作品、または保存・翻訳の権利を持つ作品だけを取り込んでください。外部小説サイトのURL取得には対応していません。
        </p>
      </Section>

      <Section title="4. 作品ページ（目次）と読む画面">
        <p>
          長編の「作品ページ（目次）」には各話と読書状況が並びます。「読む」を押すと本文の「読む画面」へ移動します。個人本棚では同じ役割の画面を「作品目次」と表示します。
        </p>
        <p>
          栞を保存した話は目次に「栞」と表示され、次に開いたときは保存位置を画面上端へ戻します。読書位置と栞は現在のブラウザに保存されます。
        </p>
      </Section>

      <Section title="5. Reader modeと翻訳ソース">
        <p>
          公開作品のReader modeはOriginal・Bilingual・Translation onlyの3つです。modeは本文の見せ方を決めるもので、AI/Humanは別の「翻訳ソース」です。
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>Original：原文だけを読む</li>
          <li>Bilingual：原文と翻訳を対応させて読む</li>
          <li>Translation only：翻訳だけを読む</li>
          <li>公開済みHuman translationがある場合だけ、Bilingual / Translation onlyでAI/Humanの翻訳ソース選択が表示されます</li>
          <li>modeや翻訳ソースを切り替えても、読書位置と栞は原文側の位置を基準に扱います</li>
        </ul>
        <p>
          AI翻訳が未生成の場合は、作者のAI翻訳許可とアクセス・利用資格の確認後に生成されることがあります。作品を投稿・公開しただけではOpenAIへ送信しません。
          Human translationは作者が別途許可した作品で利用者がDraftを作成・編集・公開・取り下げでき、Human translationの処理自体はOpenAIを呼びません。
        </p>
        <p>
          AI翻訳では作品単位の用語集と限定された前話コンテキストを使い、長編での訳語の揺れを抑えます。ただし、完全な一貫性や人間同等の翻訳品質を保証するものではありません。
        </p>
      </Section>

      <Section title="6. 読み上げ・設定・栞">
        <p>
          読む画面の設定では、朗読停止、速度、音量、声、マーカー、文字サイズ、行間などを変更できます。設定はブラウザに保存され、再読み込み後や別作品でも引き継がれます。
        </p>
        <p>
          対訳中は本文の下に「栞・前話・次話・設定」のフッターが表示されます。栞は現在位置を保存し、前話・次話は存在する場合だけ利用できます。
        </p>
      </Section>

      <Section title="7. 投稿や朗読をしたい場合">
        <p>
          自分で作品を投稿したい場合は、
          <Link className="underline underline-offset-4" href="/write">
            作品ワークスペース
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

      <Section title="8. 利用回数・Premium・クレジット">
        <p>
          Freeは¥0です。公開作品のAI翻訳解放と個人本棚への取り込みは、合計1日3回の共通枠です。個人本棚は最大3作品です。
        </p>
        <p>
          <Link className="underline underline-offset-4" href="/subscription">Premium（月額680円）</Link>
          では、公開作品のAI翻訳解放は1日30回、個人本棚への取り込みは日次回数制限なし、個人本棚は最大20作品です。
        </p>
        <p>
          クレジットは5クレジット=300円、8クレジット=450円、12クレジット=600円で、有効期間は150日です。1クレジットで公開作品1話×対象言語1つのAI翻訳を解放できます。BilingualとTranslation onlyは同じ解放を共有し、Originalには解放が不要です。
        </p>
        <p>
          Human translationは無料で読め、AI利用枠・クレジット・AI unlockを消費しません。
        </p>
      </Section>

      <Section title="9. 継続的な改善について">
        <p>
          LIB read は、公開中の機能を提供しながら、使いやすさや表示内容を継続的に改善しているサービスです。
          画面、機能、導線、仕様、表示内容は必要に応じて更新されることがあります。
        </p>
        <p>
          更新に伴い、表示位置や文言、利用できる導線が変わる場合があります。
          公開中の機能や案内内容が分かりやすくなるよう、改善を続けています。
        </p>
      </Section>

      <Section title="10. 困ったとき">
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

      </div>
    </main>
  );
}
