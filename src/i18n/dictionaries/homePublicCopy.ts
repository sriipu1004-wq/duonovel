import type { UiLocale } from "../config";
import type { HomeDictionary } from "./homeBase";

export const homePublicCopyOverrides: Record<
  UiLocale,
  Partial<HomeDictionary>
> = {
  ja: {
    lead:
      "長編・Web小説を、原文を残したまま別の言語でも読み続ける。公開作品、多言語対訳、個人本棚、読み上げを1つの読書基盤で扱います。",
    description:
      "公開作品は言語ごとに別作品へ複製せず、1つの作品に原文と翻訳レイヤーを持たせます。原文・対訳・翻訳のみを切り替えて読み、保存済みの公開翻訳は同じ話・原文言語・翻訳言語・原文バージョンなら再利用します。",
    featureBadge:
      "長編・Web小説 / 原文＋翻訳 / 翻訳一貫性 / 多言語",
    subscriptionTitle:
      "月額680円で、公開作品の翻訳解放と個人本棚の利用枠を広げる。",
    subscriptionDescription:
      "FreeではAI物語生成・公開作品の翻訳解放・個人本棚への取り込みが合計1日3回の共通枠です。PremiumではAI物語生成は1日10回、公開作品の翻訳解放は1日30回、個人本棚への取り込みは日次回数制限なし。個人本棚は最大20作品まで使えます。",
    featuresBody:
      "日本語・英語・韓国語など、異なる原文言語の作品を同じプラットフォームで扱い、1つの作品を原文・対訳・翻訳のみの各Readerモードで読めます。",
    bilingualTitle: "長編・Web小説の多言語読書",
    bilingualBody:
      "公開作品の翻訳では、人名・固有名詞・組織名・世界観用語を作品単位の用語集で扱い、直前の公開話から限定した原文・翻訳contextを利用して長編で訳語が揺れにくいようにします。作者は必要に応じて訳語を修正・固定できます。",
    worksBody:
      "日本語・英語・韓国語などの原文作品を同じ公開作品一覧から探し、翻訳が許可された作品は対応する別言語でも読めます。",
  },
  en: {
    lead:
      "Keep reading long-form fiction and web novels with the original text intact, even when you want to read in another language. Public works, bilingual reading, My Library, and read-aloud live in one reading platform.",
    description:
      "A public work is not duplicated into a separate work for every language. One work keeps its source text and translation layers, so readers can switch between Original, Bilingual, and Translation-only modes. Saved public translations are reused for the same episode, source language, target language, and source version.",
    featureBadge:
      "Long-form & web novels / original + translation / consistency / multilingual",
    subscriptionTitle:
      "Expand public-work translation unlocks and My Library limits for ¥680/month.",
    subscriptionDescription:
      "On Free, AI story generation, public-work translation unlocks, and My Library imports share 3 uses per day. Premium provides up to 10 AI story generations/day, 30 public-work translation unlocks/day, no daily count limit for My Library imports, and storage for up to 20 library works.",
    featuresBody:
      "Japanese-, English-, Korean-, and other-language originals can live on the same platform. A single work can be read in Original, Bilingual, or Translation-only mode without creating a separate work for each language.",
    bilingualTitle: "Multilingual long-form and web-novel reading",
    bilingualBody:
      "For public-work translation, a work-level glossary tracks names, proper nouns, organizations, and world-specific terms. Translation also uses limited context from the immediately previous public episode to reduce drift across a long series. Authors can correct and fix glossary translations when needed.",
    worksBody:
      "Browse public works with Japanese, English, Korean, and other source languages. When public translation is allowed, the same work can also be read in supported target languages.",
  },
  ko: {
    lead:
      "장편소설과 웹소설을 원문을 남긴 채 다른 언어로도 계속 읽습니다. 공개 작품, 다국어 대역, 개인 서재, 읽어주기를 하나의 독서 플랫폼에서 이용할 수 있습니다.",
    description:
      "공개 작품을 언어마다 별도 작품으로 복제하지 않고 하나의 작품에 원문과 번역 레이어를 둡니다. 원문·대역·번역만 보기 모드를 전환할 수 있으며, 같은 화·원문 언어·번역 언어·원문 버전의 저장된 공개 번역은 다시 이용합니다.",
    featureBadge:
      "장편·웹소설 / 원문+번역 / 번역 일관성 / 다국어",
    subscriptionTitle:
      "월 ¥680으로 공개 작품 번역 잠금 해제와 개인 서재 이용 한도를 넓히세요.",
    subscriptionDescription:
      "Free에서는 AI 이야기 생성·공개 작품 번역 잠금 해제·개인 서재 가져오기가 합산 하루 3회를 공유합니다. Premium은 AI 이야기 하루 10회, 공개 작품 번역 잠금 해제 하루 30회, 개인 서재 가져오기 일일 횟수 제한 없음, 개인 서재 최대 20작품을 제공합니다.",
    featuresBody:
      "일본어·영어·한국어 등 서로 다른 원문 언어의 작품을 같은 플랫폼에서 다루고, 하나의 작품을 원문·대역·번역만 보기 모드로 읽을 수 있습니다.",
    bilingualTitle: "장편·웹소설 다국어 읽기",
    bilingualBody:
      "공개 작품 번역에서는 인명·고유명사·조직명·세계관 용어를 작품 단위 용어집으로 관리하고, 바로 이전 공개 화의 제한된 원문·번역 문맥을 이용해 장편에서 번역어가 흔들리기 어렵게 합니다. 작가는 필요할 때 용어집 번역을 수정하고 고정할 수 있습니다.",
    worksBody:
      "일본어·영어·한국어 등 여러 원문 언어의 공개 작품을 같은 목록에서 찾고, 공개 번역이 허용된 작품은 지원되는 다른 언어로도 읽을 수 있습니다.",
  },
};
