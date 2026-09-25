import type { SearchLandingConfig } from "@/components/seo/SearchLandingPage";

export type JaSearchDiscoverySlug =
  | "english-novel-reader"
  | "web-novel-language-learning"
  | "pdf-bilingual-reader";

type Definition = {
  title: string;
  description: string;
  config: SearchLandingConfig;
};

const commonFacts = [
  {
    label: "Free",
    value: "¥0。公開作品の翻訳解放・個人本棚への取り込みが、合計1日3回の共通枠です。",
  },
  {
    label: "Premium",
    value: "月額680円（JPY）。公開作品の翻訳解放は1日30回、個人本棚への取り込みは日次回数制限なし。個人本棚は最大20作品です。",
  },
  {
    label: "公開作品の翻訳解放",
    value: "Bilingual（原文＋翻訳）とTranslation only（翻訳のみ）は同じ翻訳解放を利用します。",
  },
];

const publicTranslationFeatures = [
  {
    title: "長編で訳語が揺れにくい仕組み",
    body: "公開作品の翻訳では、人名・固有名詞・組織名・世界観用語を作品単位の用語集で保持し、直前の公開話から必要な範囲だけを限定コンテキストとして使います。作者は必要に応じて用語集の訳語を修正・固定できます。",
  },
  {
    title: "一つの作品を複数の読み方で",
    body: "公開作品は原文を正本として、Original・Bilingual・Translation onlyを切り替えて読みます。言語ごとに別作品を複製する構造ではありません。",
  },
  {
    title: "保存済みの公開翻訳を共有",
    body: "公開翻訳は同じ話・原文言語・翻訳言語・原文版の組み合わせで保存・再利用します。読者ごとに同じ翻訳を毎回作り直す構造ではありません。",
  },
];

const englishNovelReader: Definition = {
  title: "英語小説を日本語対訳で読む | LIB read",
  description:
    "英語小説・Web小説を原文のまま残し、日本語訳と対応させて長編を読み続ける方法。公開作品では作品単位の翻訳用語集、直前話の限定コンテキスト、保存済み翻訳の再利用に対応します。",
  config: {
    eyebrow: "ENGLISH NOVEL / BILINGUAL READING",
    title: "英語小説を、日本語対訳で読み続ける",
    intro:
      "英語本文を翻訳結果へ置き換えるのではなく、原文を残したまま日本語訳と対応させて長編を読む。LIB readは、公開作品と個人本棚の両方で、作品・章・話の流れを保ちながら読み続けるためのReaderです。",
    directAnswer:
      "公開作品では英語原文をOriginal、日本語とのBilingual、日本語だけのTranslation onlyで読み分けられます。手元の英語小説はTXT・EPUB・DOCX・テキストPDFとして個人本棚へ取り込み、原文と日本語訳を対応させて読めます。",
    features: [
      {
        title: "原文と日本語訳を同時に残す",
        body: "英語本文を消さず、原文と日本語訳を同じReaderで対応させて読みます。",
      },
      {
        title: "文単位で対応位置を追う",
        body: "対訳では対応する文の位置を同期し、長い段落でも原文と訳文の関係を追いやすくします。",
      },
      {
        title: "長編の続きから再開する",
        body: "章・話ごとの読書位置、栞、前話・次話の移動を使い、単発の翻訳作業ではなく一つの作品を継続して読めます。",
      },
      ...publicTranslationFeatures,
    ],
    demo: {
      sourceLabel: "ORIGINAL / ENGLISH",
      sourceText: "I opened the old wooden door and stepped into the quiet room.",
      translationLabel: "TRANSLATION / JAPANESE",
      translationText: "私は古い木の扉を開け、静かな部屋へ足を踏み入れた。",
      note: "実際のReaderでは、対応文の同期、読書位置・栞、表示設定、読み上げなどを利用できます。",
    },
    steps: [
      "公開作品検索で原文言語をEnglish、読む言語をJapaneseにして作品を探すか、手元の英語小説を個人本棚へ取り込みます。",
      "作品または章・話を開き、Original・Bilingual・Translation onlyから読み方を選びます。",
      "公開作品で翻訳が未解放なら、Readerの確認導線から日本語翻訳を解放します。検索結果を表示しただけでは翻訳生成や解放は始まりません。",
      "読書位置や栞を残し、次回は同じ作品の続きから再開します。",
    ],
    differences: [
      {
        title: "毎回コピーしない",
        body: "難しい文だけを翻訳サイトへ貼り直すのではなく、作品の中で原文と訳文の対応を保ったまま読み進めます。",
      },
      {
        title: "翻訳だけの別作品にしない",
        body: "原文を正本として翻訳レイヤーを重ねるため、英語原文と日本語訳を同じ作品の中で扱えます。",
      },
      {
        title: "長編の状態を維持する",
        body: "話数、読書位置、栞に加え、公開翻訳では作品用語集と直前話の限定コンテキストを使います。",
      },
    ],
    capabilities: [
      "Original / Bilingual / Translation only",
      "英語原文と日本語訳の文単位同期",
      "公開作品の作品単位翻訳用語集",
      "直前公開話の限定翻訳コンテキスト",
      "保存済み公開翻訳の再利用",
      "TXT・EPUB・DOCX・テキストPDFの個人本棚取り込み",
      "章・話単位の長編管理",
      "読書位置と栞",
      "ブラウザ読み上げ",
    ],
    facts: commonFacts,
    faq: [
      {
        question: "英語小説を日本語訳と同時に読めますか？",
        answer: "はい。英語原文を残したBilingual表示と、日本語訳だけを読むTranslation onlyを使い分けられます。",
      },
      {
        question: "長編で人名や固有名詞の訳は揃いますか？",
        answer: "公開作品では作品単位の翻訳用語集と直前話の限定コンテキストを使い、訳語の揺れを抑えます。ただしAI翻訳の完全な一貫性を保証するものではありません。",
      },
      {
        question: "翻訳は読むたびに毎回生成されますか？",
        answer: "公開作品では同じ話・原文言語・翻訳言語・原文版の保存済み翻訳を再利用します。個人本棚でも保存済みの対訳があれば再利用します。",
      },
      {
        question: "どのファイル形式を取り込めますか？",
        answer: "個人本棚はTXT、EPUB、DOCX、テキストレイヤーを持つPDFに対応しています。画像だけのスキャンPDFは対象外です。",
      },
    ],
    primaryCta: {
      href: "/search?source_language=en&read_language=ja",
      label: "英語原文を日本語で読める作品を探す",
    },
    secondaryCta: { href: "/library/import", label: "英語小説を個人本棚へ取り込む" },
    related: [
      {
        href: "/web-novel-language-learning",
        label: "ネット小説で外国語を学ぶ",
        description: "好きな長編を何話も読み続けながら外国語を学ぶ使い方。",
      },
      {
        href: "/pdf-bilingual-reader",
        label: "PDF・EPUBを対訳で読む",
        description: "手元の長編ファイルを作品として管理し、原文を残して読む方法。",
      },
      {
        href: "/subscription",
        label: "Free / Premium",
        description: "公開作品の翻訳解放を含む現在の利用枠と料金を確認します。",
      },
    ],
  },
};

const webNovelLearning: Definition = {
  title: "ネット小説で外国語を学ぶ | LIB read",
  description:
    "ネット小説や長編小説を原文と翻訳で読み続けながら外国語に触れる方法。読書位置・栞・文同期に加え、公開作品では長編向け翻訳用語集と保存済み翻訳の再利用に対応します。",
  config: {
    eyebrow: "WEB NOVEL / LANGUAGE LEARNING",
    title: "ネット小説を読み続けながら、外国語を学ぶ",
    intro:
      "短い例文ではなく、同じ登場人物・世界観が続く作品そのものを読み続ける。LIB readは原文を消さずに翻訳を参照し、話数・読書位置・栞を保ちながら長編・Web小説を継続するための読書プラットフォームです。",
    directAnswer:
      "原文を先に読み、必要なときだけBilingualやTranslation onlyへ切り替えられます。公開作品検索では原文言語と読む言語を別々に指定できるため、UIの表示言語とは独立して読みたい組み合わせを探せます。",
    features: [
      {
        title: "物語の長い文脈で読む",
        body: "同じ人物・世界観・語彙が続く作品を章や話をまたいで読み、翻訳を必要な範囲で参照できます。",
      },
      {
        title: "原文と訳文を文単位で対応させる",
        body: "Bilingualでは原文と翻訳を同じReaderで表示し、対応する文の位置を同期して追えます。",
      },
      {
        title: "読書の続きとして再開する",
        body: "読書位置、栞、前話・次話、表示設定を使い、教材を毎回探し直さず同じ長編を続けられます。",
      },
      ...publicTranslationFeatures,
    ],
    demo: {
      sourceLabel: "ORIGINAL",
      sourceText: "She hesitated for a moment, then nodded as if she had finally made up her mind.",
      translationLabel: "TRANSLATION",
      translationText: "彼女は少しためらった後、ようやく決心したかのようにうなずいた。",
      note: "実際のReaderでは、原文・対訳・翻訳のみの切替、文同期、読書位置・栞、読み上げを利用できます。",
    },
    steps: [
      "公開作品検索で原文言語と読む言語を選ぶか、自分で利用権限を持つ長編ファイルを個人本棚へ取り込みます。",
      "原文を中心に読み、必要に応じてBilingualまたはTranslation onlyへ切り替えます。",
      "公開作品では、許可された翻訳言語だけをReaderの確認導線から解放します。検索だけでは翻訳生成・解放・クレジット消費は発生しません。",
      "読書位置や栞を残し、次回は同じ作品の続きから再開します。",
    ],
    differences: [
      { title: "例文学習より文脈が長い", body: "人物関係や場面、語彙の反復を含む長い文脈の中で原文へ触れられます。" },
      { title: "翻訳だけに置き換えない", body: "原文と訳文を同じ作品で扱うため、理解できる部分は原文のまま読み進められます。" },
      { title: "その日の作業で終わらない", body: "話数、読書位置、栞と公開翻訳資産を作品単位で持ち、長編を継続して読みます。" },
    ],
    capabilities: [
      "原文 / 対訳 / 翻訳のみのReader mode",
      "原文言語と読む言語を分けた公開作品検索",
      "文単位の同期",
      "公開作品の作品単位翻訳用語集",
      "直前公開話の限定翻訳コンテキスト",
      "保存済み公開翻訳の再利用",
      "日本語・英語・韓国語など複数原文言語の公開作品",
      "読書位置と栞",
      "ブラウザ読み上げ",
    ],
    facts: commonFacts,
    faq: [
      { question: "UIが日本語でも英語原文を韓国語で読む作品を探せますか？", answer: "はい。UI言語、作品の原文言語、読む言語は別の設定です。公開作品検索で原文言語と読む言語を独立して選べます。" },
      { question: "翻訳済みの作品だけが検索に出ますか？", answer: "いいえ。読む言語の検索条件は既存翻訳cacheの有無ではなく、原文がその言語か、公開翻訳が許可されその言語が対応対象かで判定します。検索表示だけで翻訳は生成しません。" },
      { question: "URLを貼るだけで外部Web小説を取り込めますか？", answer: "現在は対応していません。個人本棚は自分で利用権限を持つTXT、EPUB、DOCX、テキストPDFを取り込みます。" },
      { question: "長編の翻訳一貫性は保証されますか？", answer: "保証はしません。公開翻訳では作品用語集と直前話の限定コンテキストを使い、訳語の揺れを抑える設計です。" },
    ],
    primaryCta: { href: "/search", label: "読む作品を探す" },
    secondaryCta: { href: "/library", label: "個人本棚を開く" },
    related: [
      { href: "/english-novel-reader", label: "英語小説を日本語対訳で読む", description: "英語原文を残し、日本語訳と対応させて長編を読む方法。" },
      { href: "/pdf-bilingual-reader", label: "PDF・EPUBを対訳で読む", description: "手元の長編ファイルを章・話単位で読み続ける方法。" },
      { href: "/subscription", label: "Free / Premium", description: "公開作品の翻訳解放を含む現在の利用枠と料金を確認します。" },
    ],
  },
};

const pdfReader: Definition = {
  title: "PDF・EPUBの長編小説を対訳で読む | LIB read",
  description:
    "PDF・EPUB・TXT・DOCXの長編小説を非公開の個人本棚へ取り込み、原文を残したまま対訳で読む方法。章・話単位の管理、読書位置、栞、読み上げに対応します。",
  config: {
    eyebrow: "PDF / EPUB / BILINGUAL READER",
    title: "PDF・EPUBの長編小説を、対訳のまま読み続ける",
    intro:
      "長編ファイルを翻訳結果だけの別ファイルへ変換するのではなく、原文を残し、章や話の構造を保ったまま読む。LIB readの個人本棚は、自分で利用権限を持つ長編ファイルを非公開の作品として管理します。",
    directAnswer:
      "TXT・EPUB・DOCX・テキストPDFを個人本棚へ取り込み、章・話単位で原文と翻訳を対応させて読めます。読書位置や栞も保存され、長い作品を日をまたいで続けられます。",
    features: [
      { title: "ファイルではなく作品として管理", body: "取り込んだ長編を章・話の単位へ分け、非公開の一作品として本棚に置きます。" },
      { title: "原文を残して対訳", body: "翻訳済みの別PDFへ置き換えず、原文と訳文を同じReaderで対応させて表示します。" },
      { title: "必要な話から続きを読む", body: "読書位置、栞、前話・次話を使い、前回の続きから再開できます。" },
      { title: "公開作品は別の共有翻訳構造", body: "個人本棚とは別に、公開作品では同一作品へ翻訳レイヤーを重ね、作品用語集・直前話の限定コンテキスト・保存済み翻訳の再利用を行います。" },
    ],
    demo: {
      sourceLabel: "ORIGINAL TEXT",
      sourceText: "The rain had stopped, but the stone road still reflected the pale morning light.",
      translationLabel: "PARALLEL TRANSLATION",
      translationText: "雨は上がっていたが、石畳の道はまだ淡い朝の光を映していた。",
      note: "実際の個人本棚Readerでは、取り込んだ本文を章・話ごとに開き、対訳・読書位置・栞・読み上げを利用できます。",
    },
    steps: [
      "ログイン後、個人本棚の取り込み画面から、自分で保存・翻訳する権利を持つTXT・EPUB・DOCX・テキストPDFを選びます。",
      "ブラウザ側で本文を抽出し、検出した章・話を非公開の作品として保存します。元ファイル自体はサーバーへ保存しません。",
      "作品目次から読みたい章・話を開き、必要に応じて対訳をオンにして読む言語を選びます。",
      "読書位置や栞を残して終了し、次回は同じ作品の続きから再開します。",
    ],
    differences: [
      { title: "全文翻訳PDFを作らない", body: "翻訳結果だけの別ファイルへ変換せず、原文を参照できる対訳状態をReader内に保ちます。" },
      { title: "長編の章・話を保つ", body: "単なるPDFビューアではなく、抽出した長編を章・話単位で管理し、作品目次から移動します。" },
      { title: "読書状態を次回へ持ち越す", body: "読書位置と栞を残せるため、数日かけて読む作品でも前回の続きへ戻れます。" },
    ],
    capabilities: [
      "TXTファイルの取り込み",
      "EPUBの目次・spine解析",
      "DOCXの見出し解析",
      "テキストレイヤーを持つPDFの解析",
      "章・話単位の分割と作品管理",
      "原文と翻訳の対訳表示",
      "読書位置と栞",
      "ブラウザ読み上げ",
    ],
    facts: commonFacts,
    faq: [
      { question: "画像だけのスキャンPDFにも対応していますか？", answer: "現在は対応していません。文字レイヤーを持つテキストPDFが対象で、画像OCRを前提としたスキャンPDFは取り込めません。" },
      { question: "EPUBやDOCXも使えますか？", answer: "使えます。現在の個人本棚はTXT、EPUB、DOCX、テキストPDFに対応しています。" },
      { question: "取り込んだ小説は公開されますか？", answer: "公開されません。個人本棚の作品は所有者本人だけが閲覧でき、公開一覧、検索、共有ページには表示されません。" },
      { question: "外部のWeb小説URLを貼って取り込めますか？", answer: "現在はURL取得に対応していません。自分で利用権限を持つファイルを用意して取り込みます。" },
    ],
    primaryCta: { href: "/library/import", label: "長編ファイルを個人本棚へ取り込む", note: "取り込みにはログインが必要です。著作権が切れた作品、自作作品、または保存・翻訳の権利を持つ作品だけを取り込んでください。" },
    secondaryCta: { href: "/guide", label: "取り込み手順を見る" },
    related: [
      { href: "/english-novel-reader", label: "英語小説を日本語対訳で読む", description: "英語原文を残して日本語訳と対応させながら長編を読む方法。" },
      { href: "/web-novel-language-learning", label: "ネット小説で外国語を学ぶ", description: "長編・Web小説を何話も読み続ける読書方法。" },
      { href: "/subscription", label: "Free / Premium", description: "¥0 Freeと月額680円Premiumの現在の利用枠を確認します。" },
    ],
  },
};

const definitions: Record<JaSearchDiscoverySlug, Definition> = {
  "english-novel-reader": englishNovelReader,
  "web-novel-language-learning": webNovelLearning,
  "pdf-bilingual-reader": pdfReader,
};

export function getJaSearchDiscoveryDefinition(slug: JaSearchDiscoverySlug): Definition {
  return definitions[slug];
}
