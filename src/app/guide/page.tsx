import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "使い方・取り扱い説明 | LIB read",
  description: "個人本棚、多言語対訳、読み上げ、AI物語、作品投稿の使い方",
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
          個人本棚、多言語対訳、読み上げ、AI物語、Web小説の閲覧・投稿について、画面名と基本操作をまとめています。
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
          LIB read は、自分で用意した外国語の長編を個人本棚で管理して読み続ける機能と、公開Web小説、読み上げ、AI物語生成をまとめた読書サービスです。
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
          <li>読む画面で本文、対訳、読み上げ、栞を利用する</li>
          <li>物語を作る場合はAI生成または作品ワークスペースを使う</li>
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

      <Section title="5. 多言語対訳と単語解説">
        <p>
          「対訳をオン」を押して対訳言語を選びます。保存済み対訳があれば「対訳を開く」、なければ「対訳を生成」と表示されます。
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>原文と訳文は上下で同期してスクロールします</li>
          <li>文を選び、その中の語をタップすると対応する意味と品詞を確認できます</li>
          <li>複数話の作品では、チェックを入れると同じタブ内で対訳言語を固定できます</li>
          <li>サブスク対象では、読書が50%に達すると次の1話だけ先読み翻訳します</li>
        </ul>
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

      <Section title="8. 生成回数とAI物語">
        <p>
          無料利用では、AI物語生成と対訳生成を合わせて1日5回まで利用できます。各生成ボタンに現在の利用回数を表示します。単語解説は別枠で、サブスク対象では無制限です。
        </p>
        <p>
          保存したAI生成作品は作品ワークスペースから続きを生成できます。短編で最初の続きを作る場合は、元の第1話を残したまま長編へ切り替え、第2話を下書き保存します。
        </p>
        <p>
          <Link className="underline underline-offset-4" href="/subscription">月額680円のサブスク</Link>
          では、AI物語生成は1日10回、対訳生成は1日30回、単語解説は無制限になります。AI生成には日次上限に加えて月間AI利用上限があります。
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
        {/* AI_GUIDE_V1 */}
        <Section title="11. AI生成で物語を作る">
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
