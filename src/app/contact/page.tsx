import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "お問い合わせ | LIB read",
  description: "LIB read へのお問い合わせ、権利侵害申告、削除依頼の案内",
};

/**
 * 公開前に実際の連絡先へ差し替えること
 */
const CONTACT_EMAIL = "libread08@gmail.com";

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

export default function ContactPage() {
  return (
    <main className="min-h-screen bg-white text-black">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-10 sm:px-6">
        <header className="space-y-3">
          <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">LIB read</p>
          <h1 className="text-3xl font-bold text-black">お問い合わせ</h1>
          <p className="text-sm leading-7 text-neutral-700">
            一般的な問い合わせ、権利侵害申告、削除依頼、運営への連絡はこのページを参照してください。
          </p>
          <div className="flex flex-wrap gap-4 text-sm">
            <Link className="text-neutral-700 underline underline-offset-4" href="/">
              トップへ戻る
            </Link>
            <Link className="text-neutral-700 underline underline-offset-4" href="/terms">
              利用規約
            </Link>
            <Link className="text-neutral-700 underline underline-offset-4" href="/privacy">
              プライバシーポリシー
            </Link>
          </div>
        </header>

        <Section title="連絡先">
          <p>
            現在の連絡先:
            <a
              className="ml-2 underline underline-offset-4"
              href={`mailto:${CONTACT_EMAIL}`}
            >
              {CONTACT_EMAIL}
            </a>
          </p>
          <p>
            返信には時間がかかる場合があります。内容によっては返信できないことがあります。
          </p>
        </Section>

        <Section title="一般的な問い合わせ">
          <p>以下のような内容は一般問い合わせとして連絡してください。</p>
          <ul className="list-disc space-y-2 pl-5">
            <li>サービスの不具合報告</li>
            <li>アカウント、公開設定、表示に関する問い合わせ</li>
            <li>機能要望、改善提案</li>
            <li>その他運営への連絡</li>
          </ul>
        </Section>

        <Section title="権利侵害申告・削除依頼">
          <p>
            投稿作品、朗読音声、画像、説明文、プロフィールその他の掲載内容について、
            著作権、商標権、肖像権、プライバシー権等の侵害があると考える場合は、
            下記の情報をできるだけ具体的に記載して連絡してください。
          </p>
          <ul className="list-disc space-y-2 pl-5">
            <li>申告者の氏名または名称</li>
            <li>連絡先メールアドレス</li>
            <li>問題があると考えるページURL</li>
            <li>問題となる箇所の説明</li>
            <li>自分が権利者本人であること、または正当な代理権限を有することの説明</li>
            <li>必要に応じて権利を裏付ける資料</li>
          </ul>
          <p>
            内容確認のうえ、必要に応じて非公開化、削除、確認依頼その他の対応を行います。
          </p>
        </Section>

        <Section title="注意事項">
          <ul className="list-disc space-y-2 pl-5">
            <li>虚偽の申告や不当な削除要請はしないでください。</li>
            <li>調査や確認のため、追加情報の提出をお願いする場合があります。</li>
            <li>サービスは試作・改善段階を含むため、対応に時間を要する場合があります。</li>
            <li>緊急対応や法的判断を約束するものではありません。</li>
          </ul>
        </Section>
        {/* AI_CONTACT_REPORT_V1 */}
        <Section title="AI生成コンテンツに関する報告">
          <p>
            AI生成結果を含む掲載内容について、権利侵害、プライバシー侵害、なりすまし、差別・嫌がらせ、
            不適切な性的表現その他の利用規約違反があると考える場合は、以下をできるだけ具体的に記載して連絡してください。
          </p>
          <ul className="list-disc space-y-2 pl-5">
            <li>問題があると考えるページのURL、作品名または画面の説明</li>
            <li>問題となる箇所と、その内容が問題であると考える理由</li>
            <li>申告者の氏名または名称、および連絡先メールアドレス</li>
            <li>必要に応じて、権利または事実関係を裏付ける資料</li>
          </ul>
          <p>
            内容確認のうえ、必要に応じて非公開化、削除、確認依頼その他の対応を行います。
            虚偽の申告や不当な削除要請はしないでください。
          </p>
        </Section>

      </div>
    </main>
  );
}