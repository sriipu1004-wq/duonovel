import type { Metadata } from "next";
import SearchLandingPage, {
  type SearchLandingConfig,
} from "@/components/seo/SearchLandingPage";

const DESCRIPTION =
  "PDF・EPUB・TXT・DOCXの長編小説を個人本棚へ取り込み、原文を残したまま対訳で読む方法。章・話単位の管理、読書位置、栞、読み上げに対応します。";

export const metadata: Metadata = {
  title: "PDF・EPUBの長編小説を対訳で読む | LIB read",
  description: DESCRIPTION,
  alternates: {
    canonical: "/pdf-bilingual-reader",
  },
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    type: "website",
    locale: "ja_JP",
    siteName: "LIB read",
    url: "/pdf-bilingual-reader",
    title: "PDF・EPUBの長編小説を対訳で読む | LIB read",
    description: DESCRIPTION,
    images: ["/opengraph-image"],
  },
  twitter: {
    card: "summary_large_image",
    title: "PDF・EPUBの長編小説を対訳で読む | LIB read",
    description: DESCRIPTION,
    images: ["/opengraph-image"],
  },
};

const config: SearchLandingConfig = {
  eyebrow: "PDF / EPUB / BILINGUAL READER",
  title: "PDF・EPUBの長編小説を、対訳のまま読み続ける",
  intro:
    "PDFを一度翻訳して別ファイルを作るのではなく、原文を残し、章や話の構造を保ったまま対訳で読みたい。LIB read（ライブリード）の個人本棚では、手元の長編ファイルを作品として管理し、読む部分ごとに対訳を使いながら続きを読めます。",
  directAnswer:
    "TXT・EPUB・DOCX・テキストPDFを個人本棚へ取り込み、章・話単位に分けた状態で読むことができます。原文と翻訳は対訳として残り、読書位置や栞も保存できるため、長い作品を日をまたいで読み続ける用途に向いています。",
  features: [
    {
      title: "ファイルではなく作品として管理する",
      body: "取り込んだ長編を章・話の単位に分け、ひとつの作品として本棚に置きます。数百話規模でも目次から読み進める前提の構造です。",
    },
    {
      title: "原文を残して対訳する",
      body: "翻訳済みの別PDFへ置き換えるのではなく、原文と訳文を同じReader内で対応させて表示します。",
    },
    {
      title: "必要な話から続きを読む",
      body: "読書位置、栞、前話・次話を使い、前回の続きから再開できます。毎回ファイル内の位置を探し直す必要を減らします。",
    },
    {
      title: "読書中に語や表現も確認する",
      body: "対訳だけでなく、文脈上の単語の意味、品詞、イディオム・句動詞・文法表現の解説や読み上げも同じ読書画面で使えます。",
    },
  ],
  demo: {
    sourceLabel: "ORIGINAL TEXT",
    sourceText: "The rain had stopped, but the stone road still reflected the pale morning light.",
    translationLabel: "PARALLEL TRANSLATION",
    translationText: "雨は上がっていたが、石畳の道はまだ淡い朝の光を映していた。",
    note: "SEOページの例は静的表示です。実際の個人本棚Readerでは、取り込んだ本文を章・話ごとに開き、対訳・読書位置・栞・読み上げを利用できます。",
  },
  steps: [
    "ログイン後、個人本棚の「作品を取り込む」からTXT・EPUB・DOCX・テキストPDFを選びます。",
    "ブラウザ側で本文を抽出し、検出した章・話を作品として保存します。元ファイル自体はサーバーへ保存しません。",
    "作品目次から読みたい章・話を開き、必要に応じて対訳をオンにして読む言語を選びます。",
    "読書位置や栞を残して終了します。次回は作品目次や再開導線から続きを読めます。",
  ],
  differences: [
    {
      title: "全文翻訳PDFを作らない",
      body: "翻訳結果だけの別ファイルへ変換するのではなく、原文を参照できる対訳状態をReader内に保ちます。",
    },
    {
      title: "長編の章・話を保つ",
      body: "単なるPDFビューアではなく、抽出した長編を章・話単位で管理し、作品目次から移動できます。",
    },
    {
      title: "読書状態を次回へ持ち越す",
      body: "読書位置と栞を残せるため、数日かけて読む作品でも前回の続きへ戻れます。",
    },
  ],
  capabilities: [
    "TXTファイルの取り込み",
    "EPUBの目次・spine解析",
    "DOCXの見出し解析",
    "テキストレイヤーを持つPDFの解析",
    "章・話単位の分割と作品管理",
    "原文と翻訳の対訳表示",
    "読書位置と栞の保存",
    "前話・次話への移動",
    "ブラウザ読み上げ",
  ],
  faq: [
    {
      question: "PDFを日本語と英語で並べて読めますか？",
      answer:
        "本文を抽出できるテキストPDFであれば、個人本棚へ取り込み、原文と選択した言語の対訳を同じReaderで読めます。",
    },
    {
      question: "画像だけのスキャンPDFにも対応していますか？",
      answer:
        "現在は対応していません。文字レイヤーを持つテキストPDFが対象で、画像OCRを前提としたスキャンPDFは取り込めません。",
    },
    {
      question: "EPUBやDOCXも使えますか？",
      answer:
        "使えます。現在の個人本棚はTXT、EPUB、DOCX、テキストPDFに対応しています。",
    },
    {
      question: "取り込んだ小説は公開されますか？",
      answer:
        "公開されません。個人本棚の作品は所有者本人だけが閲覧でき、公開一覧、検索、共有ページには表示されません。",
    },
    {
      question: "外部のWeb小説URLを貼って取り込めますか？",
      answer:
        "現在はURLからの取得には対応していません。自分で利用権限を持つファイルを用意して取り込みます。",
    },
  ],
  primaryCta: {
    href: "/library/import",
    label: "長編ファイルを個人本棚へ取り込む",
    note: "個人本棚への取り込みにはログインが必要です。著作権が切れた作品、自作作品、または保存・翻訳の権利を持つ作品だけを取り込んでください。",
  },
  secondaryCta: {
    href: "/guide",
    label: "取り込み手順を見る",
  },
  related: [
    {
      href: "/english-novel-reader",
      label: "英語小説を日本語対訳で読む",
      description: "英語原文を残し、日本語訳と文単位で対応させながら長編を読む方法。",
    },
    {
      href: "/web-novel-language-learning",
      label: "ネット小説で外国語を学ぶ",
      description: "長編・ネット小説を何話も読み続けながら外国語を学ぶための使い方。",
    },
    {
      href: "/faq",
      label: "よくある質問",
      description: "個人本棚、無料利用、公開範囲など、LIB read全体のよくある質問。",
    },
  ],
};

export default function PdfBilingualReaderPage() {
  return <SearchLandingPage config={config} />;
}
