import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "運営状況 | LIB read",
  description: "LIB read の現在の運営状況、利用できる機能、継続的な改善内容",
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

export default function StatusPage() {
  return (
    <main className="min-h-screen bg-white text-black">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-10 sm:px-6">
      <header className="space-y-3">
        <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">LIB read</p>
        <h1 className="text-3xl font-bold text-black">運営状況</h1>
        <p className="text-sm leading-7 text-neutral-700">
          LIB read は、公開中の機能を提供しながら、使いやすさや表示内容を継続的に改善しているサービスです。
          現在利用できる機能と、更新時に変わる可能性がある内容をこのページにまとめています。
        </p>
        <div className="flex flex-wrap gap-4 text-sm">
          <Link className="text-neutral-700 underline underline-offset-4" href="/">
            トップへ戻る
          </Link>
          <Link className="text-neutral-700 underline underline-offset-4" href="/news">
            お知らせ
          </Link>
          <Link className="text-neutral-700 underline underline-offset-4" href="/guide">
            使い方・取り扱い説明
          </Link>
        </div>
      </header>

      <Section title="1. 現在の状態">
        <p>
          LIB read は、個人本棚、多言語対訳、AI物語生成、Web小説の閲覧・投稿、ブラウザ読み上げ、投稿朗読を提供しています。
        </p>
        <p>
          個人本棚は本人限定・非公開で、ユーザー自身が用意したファイルを取り込む方式です。外部小説サイトのURLインポートやスクレイピングは提供していません。
        </p>
      </Section>

      <Section title="2. 現在使える主機能">
        <ul className="list-disc space-y-2 pl-5">
          <li>トップページや検索ページから公開作品を探す</li>
          <li>PDF・EPUB・TXT・DOCXを個人本棚へ取り込み、章・話単位で読む</li>
          <li>多言語対訳、文同期、単語解説、次話1話の先読みを利用する</li>
          <li>Web Speech による読み上げを再生する</li>
          <li>AI生成ページで条件に合わせた短編を生成する</li>
          <li>月額680円のサブスクを契約・解約し、有料機能を利用する</li>
          <li>生成した物語を保存し、作品ワークスペースで編集・続編生成・投稿する</li>
          <li>作者ページ、使い方、FAQ、規約、問い合わせなどの案内ページを見る</li>
        </ul>
      </Section>

      <Section title="3. 継続的に改善している主な内容">
        <ul className="list-disc space-y-2 pl-5">
          <li>超長編ファイルの取り込みと章・話分割精度</li>
          <li>長編内の固有名詞・用語・文体の統一</li>
          <li>スマートフォンの対訳Readerと読書進捗</li>
          <li>作品ページ（目次）・読む画面・作品ワークスペースの導線整理</li>
        </ul>
        <p>
          公開済みの機能を利用できる状態を維持しながら、体験や案内を段階的に改善しています。
        </p>
      </Section>

      <Section title="4. 既知の制限">
        <ul className="list-disc space-y-2 pl-5">
          <li>作品ごとに、朗読の有無や演出の有無が異なります</li>
          <li>無料利用のAI物語生成と対訳生成は共通で1日5回までです</li>
          <li>次話先読みと単語解説無制限はサブスク対象です</li>
          <li>サブスクのAI物語・対訳生成には日次上限と月間AI利用上限があります</li>
          <li>読書設定と栞は現在のブラウザに保存され、別端末には自動同期しません</li>
          <li>画面構成や文言、導線は今後変更されることがあります</li>
          <li>一部機能はログインや作品側の設定状況によって使い方が変わります</li>
          <li>機能や表示は順次改善・更新されるため、更新後に案内内容が変わることがあります</li>
        </ul>
      </Section>

      <Section title="5. 今後の予定">
        <p>
          今後は個人本棚を中心に、長編取り込み、章分割、逐次対訳、進捗管理、用語統一を優先して改善します。
        </p>
        <p>
          どこが更新されたかは、
          <Link className="underline underline-offset-4" href="/news">
            お知らせページ
          </Link>
          で確認してください。
        </p>
      </Section>

      <Section title="6. 困ったとき">
        <p>
          使い方を知りたい場合は
          <Link className="underline underline-offset-4" href="/guide">
            使い方・取り扱い説明
          </Link>
          と
          <Link className="underline underline-offset-4" href="/faq">
            FAQ
          </Link>
          を見てください。
        </p>
        <p>
          問い合わせや不具合報告、権利侵害申告、削除依頼は
          <Link className="underline underline-offset-4" href="/contact">
            お問い合わせページ
          </Link>
          から連絡してください。
        </p>
      </Section>
        {/* AI_STATUS_V1 */}
        <Section title="7. AI生成機能について">
          <p>
            AI生成ページでは、読む時間、場面、ジャンル、雰囲気を選び、条件に合わせた短編を生成できます。
          </p>
          <ul className="list-disc space-y-2 pl-5">
            <li>生成した物語を読む</li>
            <li>ログイン後に保存、編集、投稿する</li>
            <li>公開時にAI生成作品として表示する</li>
          </ul>
          <p>
            生成直後の内容は端末内の一時データとして扱われます。公開前には内容を確認し、利用規約に反しないことを確認してください。
          </p>
          <p>
            保存したAI生成作品は作品ワークスペースから続編を生成できます。生成・対訳などコストが発生する操作には利用回数を表示します。
          </p>
        </Section>

      </div>
    </main>
  );
}
