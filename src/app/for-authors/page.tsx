import type { Metadata } from "next";
import Link from "next/link";
import { getUiLocale } from "@/i18n/server";
import { localizePath } from "@/i18n/navigation";
import type { UiLocale } from "@/i18n/config";

/**
 * P9 author landing page (/for-authors, /en/for-authors).
 *
 * Every claim on this page must be backed by the current guide/FAQ copy or
 * by the code it describes (write workspace, permission bridges, content
 * rating). Do not add reader counts, monetization, reach to foreign readers,
 * or pricing beyond what /guide and /subscription already state.
 *
 * /ko/for-authors has no Korean copy yet: it shows the English copy, is
 * noindex, and points its canonical to /en/for-authors.
 */

const SITE_URL = "https://www.syosetu-libread.com";
const PATH = "/for-authors";
// Internal link: no utm_* (docs/p9-utm-measurement.md — UTM is for inbound links).
const SIGNUP_HREF = "/signup?next=%2Fwrite";

type CopyLocale = "ja" | "en";

type Copy = {
  title: string;
  description: string;
  eyebrow: string;
  heading: string;
  lead: string;
  signupCta: string;
  workspaceCta: string;
  featuresTitle: string;
  features: { title: string; body: string }[];
  translationTitle: string;
  translation: string[];
  stepsTitle: string;
  steps: { title: string; body: string }[];
  notesTitle: string;
  notes: string[];
  linksTitle: string;
  links: { href: string; label: string }[];
};

const COPY: Record<CopyLocale, Copy> = {
  ja: {
    title: "作品を投稿する方へ | LIB read",
    description:
      "LIB readに長編・短編を投稿する流れ。作品ワークスペースでの下書き・投稿・予約投稿、公開状態、原文言語、コンテンツ警告、AI翻訳とHuman translationの別々の許可設定をまとめています。",
    eyebrow: "FOR AUTHORS",
    heading: "作品を投稿する方へ",
    lead:
      "LIB readは、長編・Web小説を投稿・閲覧し、原文を正本としてOriginal・Bilingual・Translation onlyで読み分ける多言語読書サービスです。このページでは、作品を投稿すると何ができるか、どう始めるかをまとめています。",
    signupCta: "登録して投稿を始める",
    workspaceCta: "作品ワークスペースを開く",
    featuresTitle: "作品ワークスペースでできること",
    features: [
      {
        title: "長編・短編を話ごとに管理",
        body: "作品ごとに長編・短編を選び、話ごとに「下書き保存」「投稿」「予約投稿」を使い分けます。予約投稿の話は、予約時刻までは公開面に出ません。",
      },
      {
        title: "作品の公開・非公開",
        body: "作品の公開状態は「公開」「非公開」から選びます。公開作品の一覧に出るのは、公開状態が「公開」の作品です。",
      },
      {
        title: "原文言語の指定",
        body: "作品が最初に書かれた言語を、UIの表示言語とは別に指定します。読者は検索で原文言語を絞り込めます。",
      },
      {
        title: "ジャンル・タグ・表示設定",
        body: "ジャンルとタグ、背景・フォント・文字サイズ・文字色などの表示設定、レビューとコメントの表示を作品ごとに設定できます。",
      },
      {
        title: "コンテンツ警告（R18・暴力描写）",
        body: "「性的コンテンツを含む（R18）」「暴力描写あり」を作品単位で設定します。R18の作品は、R18表示設定がOFFの閲覧者には公開一覧・本文を表示しません。",
      },
      {
        title: "朗読許可の設定",
        body: "作品ごとに「朗読許可」「朗読不可」を設定できます。朗読許可にした公開作品は、人による朗読のほか、AI朗読の自動生成の対象になることがあります。朗読の扱いは朗読規約を確認してください。",
      },
    ],
    translationTitle: "翻訳の扱い（AI翻訳とHuman translationは別の許可）",
    translation: [
      "公開作品は、読者がReaderでOriginal・Bilingual・Translation onlyを切り替えて読みます。",
      "作品を投稿・公開しただけではOpenAIへ送信しません。AI翻訳を許可した作品で、読者がまだ生成されていない翻訳を利用するとき、対象話の本文と、用語・翻訳方針・直前の公開話など翻訳の一貫性に必要な限定情報をOpenAI APIへ送信することがあります。AI翻訳を許可しない設定では、新しいAI翻訳と新しいAI単語解説を実行しません。新しい作品では、AI翻訳とHuman translationの許可はどちらも最初は「許可」になっています。作品ワークスペースでいつでも変えられます。",
      "Human translationはAI翻訳とは別の許可です。許可すると、他のユーザーがこの作品を自分で翻訳し、LIB read上で公開できます。ONにしても本文をAIサービスへ送信せず、Human translationの処理自体はOpenAIを呼びません。OFFにすると新しいHuman translationの作成・公開を停止します（公開済みの翻訳は削除されません）。",
      "AI翻訳では作品単位の用語集と限定された前話コンテキストを使い、作者は用語集の訳語を修正・固定できます。ただし、完全な一貫性や人間同等の翻訳品質を保証するものではありません。",
    ],
    stepsTitle: "始め方",
    steps: [
      {
        title: "1. 登録する",
        body: "投稿にはログインが必要です。登録ページからアカウントを作成します。",
      },
      {
        title: "2. 作品ワークスペースで作品を作る",
        body: "投稿データベースの「新しい作品を作る」から、作品タイトルと原文言語を入力し、公開状態・コンテンツ警告・翻訳の許可を設定します。",
      },
      {
        title: "3. 話を書いて公開する",
        body: "話を「投稿」または「予約投稿」にします。作品の公開状態が「公開」なら、投稿した話はそのまま読者向けの公開対象に入ります。",
      },
    ],
    notesTitle: "投稿の前に",
    notes: [
      "作品や朗読の公開条件、権利関係、注意事項は利用規約を確認してください。",
      "読者がAI翻訳を解放するときの回数・クレジットの扱いは、使い方と料金ページにまとめています。",
    ],
    linksTitle: "関連ページ",
    links: [
      { href: "/guide", label: "使い方・取り扱い説明" },
      { href: "/faq", label: "FAQ" },
      { href: "/terms", label: "利用規約" },
      { href: "/record/terms", label: "朗読規約" },
      { href: "/subscription", label: "料金" },
      { href: "/contact", label: "お問い合わせ" },
    ],
  },
  en: {
    title: "For authors | LIB read",
    description:
      "How to post a long or short work on LIB read: drafts, posting and scheduled posting in the work workspace, public/private status, source language, content warnings, and separate permissions for AI translation and Human translation.",
    eyebrow: "FOR AUTHORS",
    heading: "For authors",
    lead:
      "LIB read is a multilingual reading service where long-form and web novels are posted and read, with the original text as the source of truth and three reading modes: Original, Bilingual and Translation only. This page explains what you can do by posting a work and how to start.",
    signupCta: "Sign up and start posting",
    workspaceCta: "Open the work workspace",
    featuresTitle: "What the work workspace offers",
    features: [
      {
        title: "Long or short works, managed by episode",
        body: "Choose long or short format per work, and save each episode as a draft, post it, or schedule it. A scheduled episode stays off public pages until its scheduled time.",
      },
      {
        title: "Public or private",
        body: "Set each work's status to public or private. Only works set to public appear in the public work lists.",
      },
      {
        title: "Source language",
        body: "Specify the language the work was originally written in, separately from the UI language. Readers can filter search by source language.",
      },
      {
        title: "Genres, tags and display settings",
        body: "Set genres and tags, display settings such as background, font, text size and text color, and whether reviews and comments are shown, per work.",
      },
      {
        title: "Content warnings (R18, violence)",
        body: "Mark a work as containing sexual content (R18) or violence. R18 works are not shown in public lists or as text to viewers whose R18 display setting is off.",
      },
      {
        title: "Narration permission",
        body: "Set narration as allowed or not allowed per work. A public work with narration allowed may, besides human narration, be included in automatic AI narration. See the narration terms for how narration is handled.",
      },
    ],
    translationTitle: "Translation (AI translation and Human translation are separate permissions)",
    translation: [
      "Readers read public works in the Reader, switching between Original, Bilingual and Translation only.",
      "Posting or publishing a work does not by itself send it to OpenAI. If you allow AI translation, when a reader requests a translation that has not been generated yet, LIB read may send the relevant episode text and limited consistency context—such as glossary terms, translation guidance, and the immediately preceding published episode—to the OpenAI API. If not allowed, no new AI translation or AI word explanation is generated. For a new work, both AI translation and Human translation start as allowed; you can change either in the work workspace at any time.",
      "Human translation is a separate permission. If allowed, other users can translate the work themselves and publish the translation on LIB read. Enabling it does not send the text to an AI provider, and Human translation itself does not call OpenAI. Turning it off stops new Human translations from being created or published; already-published translations are not deleted.",
      "AI translation uses a per-work glossary and limited context from preceding episodes, and the author can correct and lock glossary terms. Full consistency or human-level quality is not guaranteed.",
    ],
    stepsTitle: "How to start",
    steps: [
      {
        title: "1. Sign up",
        body: "Posting requires an account. Create one from the sign-up page.",
      },
      {
        title: "2. Create a work in the workspace",
        body: "From the posting database, create a new work: enter the title and source language, and set the public status, content warnings and translation permissions.",
      },
      {
        title: "3. Write and publish episodes",
        body: "Post or schedule an episode. If the work is public, a posted episode becomes publicly readable.",
      },
    ],
    notesTitle: "Before you post",
    notes: [
      "Read the Terms of Service for publication conditions, rights and other notes on works and narration.",
      "How AI translation unlocks, daily limits and credits work for readers is described in the guide and on the pricing page.",
    ],
    linksTitle: "Related pages",
    links: [
      { href: "/guide", label: "Guide" },
      { href: "/faq", label: "FAQ" },
      { href: "/terms", label: "Terms of Service (Japanese)" },
      { href: "/record/terms", label: "Narration terms (Japanese)" },
      { href: "/subscription", label: "Pricing" },
      { href: "/contact", label: "Contact" },
    ],
  },
};

function copyLocale(locale: UiLocale): CopyLocale {
  return locale === "ja" ? "ja" : "en";
}

function canonicalPath(locale: UiLocale): string {
  return locale === "ja" ? PATH : `/en${PATH}`;
}

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getUiLocale();
  const copy = COPY[copyLocale(locale)];
  const canonical = canonicalPath(locale);
  return {
    title: copy.title,
    description: copy.description,
    alternates: {
      canonical,
      languages: {
        ja: PATH,
        en: `/en${PATH}`,
        "x-default": PATH,
      },
    },
    robots: locale === "ko" ? { index: false, follow: true } : { index: true, follow: true },
    openGraph: {
      type: "website",
      locale: locale === "ja" ? "ja_JP" : "en_US",
      siteName: "LIB read",
      url: canonical,
      title: copy.title,
      description: copy.description,
      images: ["/opengraph-image"],
    },
    twitter: {
      card: "summary_large_image",
      title: copy.title,
      description: copy.description,
      images: ["/opengraph-image"],
    },
  };
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-[24px] border border-black/10 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-black">{title}</h2>
      <div className="space-y-3 text-sm leading-7 text-neutral-600">{children}</div>
    </section>
  );
}

export default async function ForAuthorsPage() {
  const locale = await getUiLocale();
  const lang = copyLocale(locale);
  const copy = COPY[lang];
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: copy.title,
    description: copy.description,
    url: `${SITE_URL}${canonicalPath(locale)}`,
    inLanguage: lang,
    isPartOf: {
      "@type": "WebSite",
      name: "LIB read",
      url: `${SITE_URL}/`,
    },
  };
  const href = (path: string) =>
    path === "/terms" || path === "/record/terms" ? path : localizePath(path, locale);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <main className="min-h-screen bg-white text-black">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-10 sm:px-6">
          <header className="space-y-3">
            <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">{copy.eyebrow}</p>
            <h1 className="text-3xl font-bold text-black">{copy.heading}</h1>
            <p className="text-sm leading-7 text-neutral-700">{copy.lead}</p>
            <div className="flex flex-wrap gap-3 pt-2">
              <Link
                href={SIGNUP_HREF}
                className="rounded-full bg-black px-5 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800"
              >
                {copy.signupCta}
              </Link>
              <Link
                href={href("/write")}
                className="rounded-full border border-black/10 bg-white px-5 py-3 text-sm text-neutral-800 transition hover:bg-neutral-50"
              >
                {copy.workspaceCta}
              </Link>
            </div>
          </header>

          <Section title={copy.featuresTitle}>
            <div className="grid gap-4 sm:grid-cols-2">
              {copy.features.map((item) => (
                <div key={item.title} className="rounded-2xl border border-black/10 bg-neutral-50 p-4">
                  <p className="font-semibold text-black">{item.title}</p>
                  <p className="mt-1">{item.body}</p>
                </div>
              ))}
            </div>
          </Section>

          <Section title={copy.translationTitle}>
            {copy.translation.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </Section>

          <Section title={copy.stepsTitle}>
            <ol className="space-y-3">
              {copy.steps.map((step) => (
                <li key={step.title}>
                  <p className="font-semibold text-black">{step.title}</p>
                  <p>{step.body}</p>
                </li>
              ))}
            </ol>
            <div className="pt-2">
              <Link
                href={SIGNUP_HREF}
                className="inline-block rounded-full bg-black px-5 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800"
              >
                {copy.signupCta}
              </Link>
            </div>
          </Section>

          <Section title={copy.notesTitle}>
            <ul className="list-disc space-y-2 pl-5">
              {copy.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </Section>

          <nav aria-label={copy.linksTitle} className="flex flex-wrap gap-3 text-sm">
            {copy.links.map((link) => (
              <Link
                key={link.href}
                className="rounded-full border border-black/10 px-4 py-2"
                href={href(link.href)}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      </main>
    </>
  );
}
