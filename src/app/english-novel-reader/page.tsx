import type { Metadata } from "next";
import SearchLandingPage, {
  type SearchLandingConfig,
} from "@/components/seo/SearchLandingPage";

const DESCRIPTION =
  "英語小説を原文のまま残し、日本語対訳と文単位で対応させて読み続ける方法。LIB readでは長編の読書位置、栞、単語解説、読み上げもまとめて使えます。";

export const metadata: Metadata = {
  title: "英語小説を日本語対訳で読む | LIB read",
  description: DESCRIPTION,
  alternates: {
    canonical: "/english-novel-reader",
  },
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    type: "website",
    locale: "ja_JP",
    siteName: "LIB read",
    url: "/english-novel-reader",
    title: "英語小説を日本語対訳で読む | LIB read",
    description: DESCRIPTION,
    images: ["/opengraph-image"],
  },
  twitter: {
    card: "summary_large_image",
    title: "英語小説を日本語対訳で読む | LIB read",
    description: DESCRIPTION,
    images: ["/opengraph-image"],
  },
};

const config: SearchLandingConfig = {
  eyebrow: "ENGLISH NOVEL / BILINGUAL READING",
  title: "英語小説を、日本語対訳で読み続ける",
  intro:
    "英語の小説や洋書を読むたびに、分からない文を翻訳ツールへ貼り直す必要はありません。LIB read（ライブリード）は、英語の原文を残したまま日本語訳と対応させ、長編を何話も続けて読むための読書サービスです。",
  directAnswer:
    "手元の英語小説を個人本棚へ取り込み、日本語を対訳言語にすると、原文と訳文を対応させた状態で読めます。読書位置や栞も残るため、長編を数日かけて続きから読む使い方に向いています。",
  features: [
    {
      title: "原文と日本語訳を同時に残す",
      body: "英語本文を翻訳結果へ置き換えず、原文と日本語訳を上下の対訳として表示します。対応する文を確認しながら読めます。",
    },
    {
      title: "文単位で対応位置を追える",
      body: "対訳中は原文と訳文を同期して読み進められます。文を選ぶと対応する位置へ移動でき、長い段落でも関係を見失いにくくします。",
    },
    {
      title: "単語や表現を文脈で確認する",
      body: "対訳側の語を選び、文脈上の意味や品詞、イディオム・句動詞・文法表現としての使われ方を確認できます。",
    },
    {
      title: "長編の続きから再開する",
      body: "章・話ごとの読書位置、栞、前話・次話の移動を使い、単発の英文ではなく一冊・一作品を継続して読めます。",
    },
  ],
  demo: {
    sourceLabel: "ORIGINAL / ENGLISH",
    sourceText: "I opened the old wooden door and stepped into the quiet room.",
    translationLabel: "TRANSLATION / JAPANESE",
    translationText: "私は古い木の扉を開け、静かな部屋へ足を踏み入れた。",
    note: "実際のReaderでは、対応文の同期、文の選択、単語・表現の文脈解説、読み上げなどを同じ読書画面で利用できます。",
  },
  steps: [
    "ログイン後、個人本棚から手元の英語小説ファイルを取り込みます。TXT・EPUB・DOCX・テキストPDFに対応しています。",
    "取り込んだ作品の目次から読みたい章・話を開きます。原文言語は本文から判定されます。",
    "読む画面で対訳をオンにし、日本語を対訳言語として選びます。保存済みの対訳があれば再利用されます。",
    "原文と日本語訳を行き来しながら読み、必要な語を確認します。読書位置や栞を残せるので、次回は続きから再開できます。",
  ],
  differences: [
    {
      title: "毎回コピーしない",
      body: "分からない文だけを翻訳サイトへ貼り付ける方法と違い、作品の中で原文と訳文の対応を保ったまま読み進めます。",
    },
    {
      title: "翻訳だけの別ファイルにしない",
      body: "全文翻訳して原文を見失うのではなく、英語本文を残したまま日本語訳を参照できます。",
    },
    {
      title: "長編の状態を維持する",
      body: "章・話の構造、読書位置、栞を保つため、その日の翻訳作業ではなく継続読書として使えます。",
    },
  ],
  capabilities: [
    "英語原文と日本語訳の対訳表示",
    "原文・訳文の文単位同期",
    "文の選択と対応位置への移動",
    "単語・イディオム・文法表現の文脈解説",
    "TXT・EPUB・DOCX・テキストPDFの取り込み",
    "章・話単位の長編管理",
    "読書位置と栞の保存",
    "前話・次話への移動",
    "ブラウザ読み上げ",
  ],
  faq: [
    {
      question: "英語小説を日本語訳と同時に読めますか？",
      answer:
        "はい。英語の原文を残したまま、日本語を対訳言語として表示できます。翻訳文だけに置き換える方式ではありません。",
    },
    {
      question: "長編小説にも使えますか？",
      answer:
        "使えます。取り込んだ長編は章・話単位で管理し、読書位置や栞を残しながら続きから読めます。",
    },
    {
      question: "どのファイル形式を取り込めますか？",
      answer:
        "現在はTXT、EPUB、DOCX、テキストレイヤーを持つPDFに対応しています。画像だけのスキャンPDFは対象外です。",
    },
    {
      question: "原文は残りますか？",
      answer:
        "残ります。対訳は原文と訳文を対応させて読むための表示で、原文を翻訳文へ置き換えるものではありません。",
    },
    {
      question: "翻訳は読むたびに毎回生成されますか？",
      answer:
        "保存済みの対訳がある場合はそれを開けます。対訳がない場合に生成します。",
    },
  ],
  primaryCta: {
    href: "/library/import",
    label: "英語小説を個人本棚へ取り込む",
    note: "個人本棚への取り込みにはログインが必要です。取り込んだ作品は本人限定で、公開一覧や検索には表示されません。",
  },
  secondaryCta: {
    href: "/search",
    label: "公開作品を探す",
  },
  related: [
    {
      href: "/web-novel-language-learning",
      label: "ネット小説で外国語を学ぶ",
      description: "単発教材ではなく、好きな長編を読み続けながら語学学習する考え方と機能。",
    },
    {
      href: "/pdf-bilingual-reader",
      label: "PDF・EPUBを対訳で読む",
      description: "手元の長編ファイルを章・話単位で管理し、原文を残したまま対訳で読む方法。",
    },
    {
      href: "/guide",
      label: "LIB readの使い方",
      description: "個人本棚、対訳、読み上げ、栞などの基本操作をまとめています。",
    },
  ],
};

export default function EnglishNovelReaderPage() {
  return <SearchLandingPage config={config} />;
}
