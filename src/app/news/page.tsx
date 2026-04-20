import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "お知らせ | LIB read",
  description: "LIB read の更新履歴とお知らせ",
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

function NewsItem({
  date,
  title,
  children,
}: {
  date: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <article className="space-y-2 rounded-2xl border border-black/10 bg-neutral-50 p-4">
      <p className="text-xs tracking-[0.18em] text-neutral-500">{date}</p>
      <h3 className="text-base font-semibold text-black">{title}</h3>
      <div className="text-neutral-600">{children}</div>
    </article>
  );
}

export default function NewsPage() {
  return (
    <main className="min-h-screen bg-white text-black">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-10 sm:px-6">
      <header className="space-y-3">
        <p className="text-xs uppercase tracking-[0.2em] text-neutral-400">LIB read</p>
        <h1 className="text-3xl font-bold text-white">お知らせ</h1>
        <p className="text-sm leading-7 text-neutral-300">
          LIB read の更新履歴と、外から見て分かる範囲の変更内容をまとめています。
          今後の更新情報もこのページに集約していく想定です。
        </p>
        <div className="flex flex-wrap gap-4 text-sm">
          <Link className="text-neutral-300 underline underline-offset-4" href="/">
            トップへ戻る
          </Link>
          <Link className="text-neutral-300 underline underline-offset-4" href="/status">
            運営状況
          </Link>
          <Link className="text-neutral-300 underline underline-offset-4" href="/guide">
            使い方・取り扱い説明
          </Link>
        </div>
      </header>

      <Section title="直近のお知らせ">
        <NewsItem date="2026-04-10" title="運営状況ページ・お知らせページを追加">
          <p>
            現在の試作状況や更新情報の置き場として、
            <Link className="underline underline-offset-4" href="/status">
              運営状況
            </Link>
            と
            <Link className="underline underline-offset-4" href="/news">
              お知らせ
            </Link>
            を追加した。
          </p>
        </NewsItem>

        <NewsItem date="2026-04-10" title="使い方・FAQ を追加">
          <p>
            初見の人向けに、
            <Link className="underline underline-offset-4" href="/guide">
              使い方・取り扱い説明
            </Link>
            と
            <Link className="underline underline-offset-4" href="/faq">
              FAQ
            </Link>
            を追加した。
          </p>
        </NewsItem>

        <NewsItem date="2026-04-09" title="公開必須ページを整備">
          <p>
            利用規約、プライバシーポリシー、お問い合わせページを追加し、
            トップページから辿れるようにした。
          </p>
        </NewsItem>
      </Section>

      <Section title="最近の更新の見どころ">
        <ul className="list-disc space-y-2 pl-5">
          <li>公開トップから説明ページへ辿りやすくなった</li>
          <li>試作段階であることと、現在使える範囲が外から見て分かりやすくなった</li>
          <li>朗読、演出、閲覧の入口としての説明導線を整理した</li>
        </ul>
      </Section>

      <Section title="今後の更新情報について">
        <p>
          今後も、画面や導線、朗読体験、案内ページ、公開時の分かりやすさを中心に更新していく予定です。
        </p>
        <p>
          現在の状態を知りたいときは
          <Link className="underline underline-offset-4" href="/status">
            運営状況
          </Link>
          、使い方を知りたいときは
          <Link className="underline underline-offset-4" href="/guide">
            使い方・取り扱い説明
          </Link>
          を見てください。
        </p>
      </Section>
      </div>
    </main>
  );
}