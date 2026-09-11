import type { Metadata } from "next";
import SearchLandingPage, {
  type SearchLandingConfig,
} from "@/components/seo/SearchLandingPage";

const DESCRIPTION =
  "ネット小説や長編小説を読み続けながら外国語を学ぶ方法。LIB readは原文と翻訳の対訳、文同期、単語・表現の文脈解説、読書位置、栞、読み上げに対応します。";

export const metadata: Metadata = {
  title: "ネット小説で外国語を学ぶ | LIB read",
  description: DESCRIPTION,
  alternates: {
    canonical: "/web-novel-language-learning",
  },
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    type: "website",
    locale: "ja_JP",
    siteName: "LIB read",
    url: "/web-novel-language-learning",
    title: "ネット小説で外国語を学ぶ | LIB read",
    description: DESCRIPTION,
    images: ["/opengraph-image"],
  },
  twitter: {
    card: "summary_large_image",
    title: "ネット小説で外国語を学ぶ | LIB read",
    description: DESCRIPTION,
    images: ["/opengraph-image"],
  },
};

const config: SearchLandingConfig = {
  eyebrow: "WEB NOVEL / LANGUAGE LEARNING",
  title: "ネット小説を読み続けながら、外国語を学ぶ",
  intro:
    "短い例文を何度も切り替えるのではなく、続きが気になる物語を何話も読むこと自体を語学学習にする。LIB read（ライブリード）は、長編小説・ネット小説を原文と翻訳の対訳で読み、分からない語や表現をその場で確認しながら継続するための読書プラットフォームです。",
  directAnswer:
    "小説で外国語を学ぶなら、原文を消さず、訳文との対応を保ち、読書位置を残して次の日も同じ作品を続けられる環境が重要です。LIB readは、その一連の読書状態を作品単位で維持します。",
  features: [
    {
      title: "物語の文脈ごと読む",
      body: "単発の英文や例文ではなく、同じ登場人物・世界観・語彙が続く長編を読み進められます。分からない部分だけ対訳を参照できます。",
    },
    {
      title: "原文と訳文を文単位で対応させる",
      body: "原文と翻訳を上下で表示し、対応する文を同期して追えます。訳文だけを読む状態になりにくく、原文へ戻りやすい構造です。",
    },
    {
      title: "語彙と文法表現を文脈で確認する",
      body: "単語の意味だけでなく、文脈上の意味、品詞、イディオム・句動詞・文法表現としての使われ方を確認できます。",
    },
    {
      title: "学習を読書の続きとして再開する",
      body: "読書位置、栞、前話・次話、表示設定を使い、教材を毎回探し直さずに同じ長編を継続できます。サブスク対象では次話対訳の先読みも利用できます。",
    },
  ],
  demo: {
    sourceLabel: "ORIGINAL",
    sourceText: "She hesitated for a moment, then nodded as if she had finally made up her mind.",
    translationLabel: "PARALLEL TRANSLATION",
    translationText: "彼女は少しためらった後、ようやく決心したかのようにうなずいた。",
    note: "対訳は答え合わせとして使えます。原文の文を選び、対応する訳文を確認し、必要なら語や表現の文脈上の意味まで掘り下げられます。",
  },
  steps: [
    "公開作品から読みたい小説を探すか、ログイン後に手元の長編ファイルを個人本棚へ取り込みます。",
    "読む画面で対訳をオンにし、学習したい言語と自分が理解できる言語の組み合わせで読み始めます。",
    "原文を先に読み、分からない文では対応する訳文を確認します。必要な語や表現はその文脈のまま意味を確認できます。",
    "読書位置や栞を残して終了します。次回は同じ作品の続きから再開し、章・話をまたいで読み続けます。",
  ],
  differences: [
    {
      title: "例文学習より文脈が長い",
      body: "同じ作品を読むため、人物関係や場面、語彙の反復を含む長い文脈の中で外国語に触れられます。",
    },
    {
      title: "全文機械翻訳より原文へ戻りやすい",
      body: "翻訳だけの文章を読むのではなく、原文と訳文の対応を維持するため、理解できた部分は原文のまま読み進められます。",
    },
    {
      title: "その日の作業で終わらない",
      body: "話数、読書位置、栞を残すので、長編を何日もかけて読む学習へつなげられます。",
    },
  ],
  capabilities: [
    "原文と翻訳の対訳表示",
    "文単位の同期と位置合わせ",
    "単語・イディオム・句動詞・文法表現の解説",
    "日本語・英語・韓国語・中国語・フランス語・ドイツ語・スペイン語への対訳",
    "公開作品と個人本棚の読書",
    "章・話単位の長編管理",
    "読書位置と栞の保存",
    "前話・次話への移動",
    "ブラウザ読み上げ",
  ],
  faq: [
    {
      question: "小説で英語を勉強できますか？",
      answer:
        "英語原文を日本語対訳と対応させて読み、分からない語や表現を文脈の中で確認できます。短い教材ではなく長編を続けて読む使い方を想定しています。",
    },
    {
      question: "英語以外の外国語にも使えますか？",
      answer:
        "現在の対訳先は日本語、英語、韓国語、中国語の簡体字・繁体字、フランス語、ドイツ語、スペイン語に対応しています。原文と同じ言語は対訳先に選びません。",
    },
    {
      question: "ネット小説のURLを貼るだけで取り込めますか？",
      answer:
        "現在、外部小説サイトのURL取得には対応していません。個人本棚へ取り込む場合は、自分で利用権限を持つTXT、EPUB、DOCX、テキストPDFを用意します。",
    },
    {
      question: "途中まで読んだ位置は残りますか？",
      answer:
        "残せます。読書位置と栞を使い、同じ作品の続きから再開できます。",
    },
    {
      question: "読み上げも使えますか？",
      answer:
        "読む画面ではブラウザ読み上げを利用できます。速度、音量、声、文字サイズ、行間などの読書設定も変更できます。",
    },
  ],
  primaryCta: {
    href: "/search",
    label: "読む作品を探す",
  },
  secondaryCta: {
    href: "/library",
    label: "個人本棚を開く",
  },
  related: [
    {
      href: "/english-novel-reader",
      label: "英語小説を日本語対訳で読む",
      description: "英語の原文を残し、日本語訳と対応させながら洋書・長編を読む方法。",
    },
    {
      href: "/pdf-bilingual-reader",
      label: "PDF・EPUBを対訳で読む",
      description: "手元の長編ファイルを個人本棚へ取り込み、章・話ごとに読み続ける方法。",
    },
    {
      href: "/guide",
      label: "LIB readの使い方",
      description: "対訳、単語解説、読み上げ、読書位置、栞などの操作をまとめています。",
    },
  ],
};

export default function WebNovelLanguageLearningPage() {
  return <SearchLandingPage config={config} />;
}
