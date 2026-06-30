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
          LIB read は、小説投稿サイトとしての基本導線に加え、AI生成、保存・公開、Web Speech による読み上げ、朗読や演出を楽しめる形を提供しています。
        </p>
        <p>
          公開作品の閲覧・検索、作品詳細や各話の閲覧、AI生成、ログイン後の保存・投稿などを利用できます。
          一部の表示や導線、作品ごとの利用条件は今後も改善・更新される可能性があります。
        </p>
      </Section>

      <Section title="2. 現在使える主機能">
        <ul className="list-disc space-y-2 pl-5">
          <li>トップページや検索ページから公開作品を探す</li>
          <li>作品詳細や各話を読む</li>
          <li>Web Speech による読み上げを再生する</li>
          <li>AI生成ページで条件に合わせた短編を生成する</li>
          <li>ログイン後に生成した物語を保存、編集、投稿する</li>
          <li>作者ページ、使い方、FAQ、規約、問い合わせなどの案内ページを見る</li>
        </ul>
      </Section>

      <Section title="3. 継続的に改善している主な内容">
        <ul className="list-disc space-y-2 pl-5">
          <li>朗読まわりの体験向上</li>
          <li>演出の見せ方や分かりやすさの改善</li>
          <li>導線や案内ページの整理</li>
          <li>公開中の機能や案内内容の分かりやすさ</li>
        </ul>
        <p>
          公開済みの機能を利用できる状態を維持しながら、体験や案内を段階的に改善しています。
        </p>
      </Section>

      <Section title="4. 既知の制限">
        <ul className="list-disc space-y-2 pl-5">
          <li>作品ごとに、朗読の有無や演出の有無が異なります</li>
          <li>画面構成や文言、導線は今後変更されることがあります</li>
          <li>一部機能はログインや作品側の設定状況によって使い方が変わります</li>
          <li>機能や表示は順次改善・更新されるため、更新後に案内内容が変わることがあります</li>
        </ul>
      </Section>

      <Section title="5. 今後の予定">
        <p>
          今後も、朗読、演出、閲覧体験、案内ページ、公開導線の改善を継続していく予定です。
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
        </Section>

      </div>
    </main>
  );
}