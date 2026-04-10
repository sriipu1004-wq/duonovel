import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "運営状況 | LIB read",
  description: "LIB read の現在の試作状況、使える機能、調整中の内容",
};

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-2xl border border-neutral-800 bg-neutral-950/60 p-5">
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      <div className="space-y-3 text-sm leading-7 text-neutral-300">{children}</div>
    </section>
  );
}

export default function StatusPage() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-10 sm:px-6">
      <header className="space-y-3">
        <p className="text-xs uppercase tracking-[0.2em] text-neutral-400">LIB read</p>
        <h1 className="text-3xl font-bold text-white">運営状況</h1>
        <p className="text-sm leading-7 text-neutral-300">
          LIB read は現在、公開しながら整えている試作・改善段階のサービスです。
          使える機能と、まだ調整中の部分をこのページにまとめています。
        </p>
        <div className="flex flex-wrap gap-4 text-sm">
          <Link className="text-neutral-300 underline underline-offset-4" href="/">
            トップへ戻る
          </Link>
          <Link className="text-neutral-300 underline underline-offset-4" href="/news">
            お知らせ
          </Link>
          <Link className="text-neutral-300 underline underline-offset-4" href="/guide">
            使い方・取り扱い説明
          </Link>
        </div>
      </header>

      <Section title="1. 現在の状態">
        <p>
          LIB read は、小説投稿サイトとしての基本導線を保ちながら、朗読や演出も含めて楽しめる形を目指して調整中です。
        </p>
        <p>
          現時点でも公開作品の閲覧、作品導線の確認、説明ページの閲覧などは進められますが、
          一部の機能や画面は今後も改善・変更される可能性があります。
        </p>
      </Section>

      <Section title="2. 現在使える主機能">
        <ul className="list-disc space-y-2 pl-5">
          <li>トップページから公開作品を探す</li>
          <li>検索ページから作品を探す</li>
          <li>作品詳細や各話を読む</li>
          <li>朗読がある作品では、読むだけでなく聞く</li>
          <li>作者ページや公開導線をたどる</li>
          <li>使い方、FAQ、規約、問い合わせなどの説明ページを見る</li>
        </ul>
      </Section>

      <Section title="3. 現在調整中の主な内容">
        <ul className="list-disc space-y-2 pl-5">
          <li>朗読まわりの体験向上</li>
          <li>演出の見せ方や分かりやすさの改善</li>
          <li>導線や案内ページの整理</li>
          <li>公開中の機能説明と未完成部分の切り分け</li>
        </ul>
        <p>
          これらは「使えないから隠す」というより、公開しながら少しずつ整えている段階として理解してほしいです。
        </p>
      </Section>

      <Section title="4. 既知の制限">
        <ul className="list-disc space-y-2 pl-5">
          <li>作品ごとに、朗読の有無や演出の有無が異なります</li>
          <li>画面構成や文言、導線は今後変更されることがあります</li>
          <li>一部機能はログインや作品側の設定状況によって使い方が変わります</li>
          <li>試作段階のため、更新後に案内内容が変わることがあります</li>
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
    </main>
  );
}