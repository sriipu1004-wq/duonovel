import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "利用規約 | LIB read",
  description: "LIB read の利用規約",
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

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-white text-black">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-10 sm:px-6">
        <header className="space-y-3">
          <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">LIB read</p>
          <h1 className="text-3xl font-bold text-black">利用規約</h1>
          <p className="text-sm leading-7 text-neutral-700">
            この利用規約は、LIB read が提供する小説投稿・閲覧・朗読関連サービスの利用条件を定めるものです。
            本サービスを利用した時点で、本規約に同意したものとみなします。
          </p>
          <div className="flex flex-wrap gap-4 text-sm">
            <Link className="text-neutral-700 underline underline-offset-4" href="/">
              トップへ戻る
            </Link>
            <Link className="text-neutral-700 underline underline-offset-4" href="/privacy">
              プライバシーポリシー
            </Link>
            <Link className="text-neutral-700 underline underline-offset-4" href="/contact">
              お問い合わせ
            </Link>
          </div>
        </header>

        <Section title="第1条 適用">
          <p>
            本規約は、LIB read に関するすべての利用に適用されます。運営者が本サービス上で個別に定める案内、
            注意事項、ガイドライン等は、本規約の一部を構成するものとします。
          </p>
        </Section>

        <Section title="第2条 サービス内容">
          <p>
            本サービスは、小説等の文章作品の投稿、公開、閲覧、検索、朗読音声の登録・再生、
            そのほか関連機能を提供するサービスです。
          </p>
          <p>
            本サービスの機能、表示、URL、仕様は予告なく追加、
            変更、中断、終了されることがあります。
          </p>
        </Section>

        <Section title="第3条 アカウントおよび利用者情報">
          <p>
            利用者は、自らの責任でアカウント情報や利用環境を管理するものとします。
            ログイン情報の管理不十分により生じた損害について、運営者は故意または重過失がある場合を除き責任を負いません。
          </p>
        </Section>

        <Section title="第4条 投稿作品・朗読音声・その他コンテンツ">
          <p>
            利用者は、自らが投稿、登録、送信、公開する文章、音声、画像、説明文、タイトル、
            サムネイルその他一切のコンテンツについて、必要な権利を有し、または適法に利用できる状態であることを保証するものとします。
          </p>
          <p>
            利用者は、第三者の著作権、著作者人格権、商標権、肖像権、パブリシティ権、プライバシー権、
            名誉その他の権利を侵害してはなりません。
          </p>
          <p>
            投稿作品に対する権利は原則として当該利用者または正当な権利者に留保されます。
            ただし、利用者は本サービスの提供、表示、配信、保守、審査、不具合対応、広報に必要な範囲で、
            運営者に対して当該コンテンツを無償で利用する非独占的な権利を許諾するものとします。
          </p>
        </Section>

        <Section title="第5条 朗読・音声機能に関する注意">
          <p>
            利用者は、朗読音声の登録、生成、公開、再生にあたり、音声そのもの、
            読み上げ元テキスト、使用した音声ライブラリやソフトウェア、キャラクター名表示、
            クレジット表記その他必要な条件を自ら確認し、遵守するものとします。
          </p>
          <p>
            運営者は、利用者が登録または公開した朗読音声の適法性、完全性、正確性、商用利用可否、
            ライセンス適合性を保証しません。
          </p>
        </Section>

        <Section title="第6条 禁止事項">
          <div className="space-y-2">
            <p>利用者は、以下の行為をしてはなりません。</p>
            <ul className="list-disc space-y-2 pl-5">
              <li>法令または公序良俗に反する行為</li>
              <li>第三者の権利を侵害する行為</li>
              <li>無断転載、無断朗読、無断配布、なりすまし行為</li>
              <li>虚偽情報の登録、権限のないコンテンツの投稿</li>
              <li>不正アクセス、脆弱性探索、過度な負荷をかける行為</li>
              <li>本サービスの運営を妨害する行為</li>
              <li>犯罪行為またはそれを助長する行為</li>
              <li>運営者が不適切と判断する行為</li>
            </ul>
          </div>
        </Section>

        <Section title="第7条 運営者による対応">
          <p>
            運営者は、利用者の投稿物や利用行為が本規約に違反し、または違反するおそれがあると判断した場合、
            事前通知なく、公開停止、削除、修正依頼、機能制限、アカウント停止その他必要な措置をとることがあります。
          </p>
          <p>
            権利侵害申告や削除依頼を受けた場合も、内容確認のうえで同様の措置を行うことがあります。
          </p>
        </Section>

        <Section title="第8条 免責">
          <p>
            運営者は、本サービスの継続性、完全性、正確性、有用性、特定目的適合性、第三者権利非侵害を保証しません。
          </p>
          <p>
            利用者間または第三者との間で生じた紛争については、当事者間で解決するものとし、
            運営者は故意または重過失がある場合を除き責任を負いません。
          </p>
        </Section>

        <Section title="第9条 規約の変更">
          <p>
            運営者は、必要に応じて本規約を変更できます。変更後の規約は、
            本サービス上に掲示した時点または別途定めた時点から効力を生じます。
          </p>
        </Section>

        <Section title="第10条 お問い合わせ">
          <p>
            本規約に関する問い合わせ、権利関係の申告、削除依頼等は、
            <Link className="underline underline-offset-4" href="/contact">
              お問い合わせページ
            </Link>
            から連絡してください。
          </p>
        </Section>
        {/* AI_GENERATION_TERMS_V1 */}
        <Section title="第11条 AI生成機能に関する注意">
          <p>
            AI生成機能による出力は、利用者が選択した条件に基づいて自動生成される参考用の文章です。
            内容の正確性、完全性、独自性、第三者権利の非侵害、特定の用途への適合性を保証するものではありません。
          </p>
          <p>
            利用者は、生成結果を保存、編集または公開する前に内容を確認し、公開するコンテンツについて自ら責任を負うものとします。
            公開された生成結果には、AI生成である旨を表示する場合があります。
          </p>
        </Section>

        <Section title="第12条 AI生成機能に関する禁止事項">
          <ul className="list-disc space-y-2 pl-5">
            <li>実在人物、第三者の作品、作家、キャラクター等を不当に模倣し、または誤認させる目的でコンテンツを生成・公開する行為</li>
            <li>未成年者を対象とする性的表現、違法行為を具体的に助長する内容、差別・嫌がらせ・過度な残虐表現を生成・公開する行為</li>
            <li>著作権、商標権、肖像権、プライバシーその他の第三者権利を侵害するコンテンツを生成・公開する行為</li>
            <li>安全対策または利用制限を回避しようとする行為</li>
          </ul>
        </Section>

      </div>
    </main>
  );
}
