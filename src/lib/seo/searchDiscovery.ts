import type { Metadata } from "next";
import type { SearchLandingConfig, SearchLandingUi } from "@/components/seo/SearchLandingPage";
import type { UiLocale } from "@/i18n/config";
import { localizePath } from "@/i18n/navigation";

const SITE_URL = "https://www.syosetu-libread.com";

export type SearchDiscoverySlug =
  | "japanese-novel-reader"
  | "learn-japanese-with-web-novels"
  | "pdf-epub-bilingual-reader";

type SearchLocale = Exclude<UiLocale, "ja">;

type Definition = {
  title: string;
  description: string;
  config: SearchLandingConfig;
};

const uiByLocale: Record<SearchLocale, SearchLandingUi> = {
  en: {
    directAnswerLabel: "Direct answer",
    featuresEyebrow: "WHAT LIB READ DOES",
    featuresTitle: "What you can do with LIB read",
    demoEyebrow: "READER EXAMPLE",
    demoTitle: "Keep the original text visible beside the translation",
    howEyebrow: "HOW TO USE",
    howTitle: "How to use it",
    differencesEyebrow: "WHY PARALLEL READING",
    differencesTitle: "How it differs from ordinary translation",
    supportedEyebrow: "SUPPORTED",
    supportedTitle: "Supported reading features",
    factsEyebrow: "PLAN & ACCESS",
    factsTitle: "Pricing and access",
    faqEyebrow: "FAQ",
    faqTitle: "Frequently asked questions",
    relatedEyebrow: "RELATED",
    relatedTitle: "Related ways to read",
    finalTitle: "Keep reading long-form fiction with both languages in view.",
    finalBody:
      "LIB read keeps the original text, translation, chapter structure, bookmarks, and reading position together so a long novel remains a reading experience instead of a series of one-off translations.",
    guideLabel: "Read the guide",
    guideHref: "/en/guide",
  },
  ko: {
    directAnswerLabel: "바로 답하기",
    featuresEyebrow: "WHAT LIB READ DOES",
    featuresTitle: "LIB read에서 할 수 있는 것",
    demoEyebrow: "READER EXAMPLE",
    demoTitle: "원문을 남긴 채 번역과 함께 읽기",
    howEyebrow: "HOW TO USE",
    howTitle: "이용 방법",
    differencesEyebrow: "WHY PARALLEL READING",
    differencesTitle: "일반적인 번역 방식과 다른 점",
    supportedEyebrow: "SUPPORTED",
    supportedTitle: "지원하는 읽기 기능",
    factsEyebrow: "PLAN & ACCESS",
    factsTitle: "요금과 이용 조건",
    faqEyebrow: "FAQ",
    faqTitle: "자주 묻는 질문",
    relatedEyebrow: "RELATED",
    relatedTitle: "관련 읽기 방법",
    finalTitle: "장편소설을 원문과 번역이 함께 있는 상태로 이어 읽기.",
    finalBody:
      "LIB read는 번역 결과만 만드는 것이 아니라 원문, 번역, 장·화 구조, 책갈피, 읽던 위치를 같은 독서 흐름 안에서 유지합니다.",
    guideLabel: "이용 방법 보기",
    guideHref: "/ko/guide",
  },
};

const commonFacts: Record<SearchLocale, Array<{ label: string; value: string }>> = {
  en: [
    {
      label: "Price",
      value: "Free is ¥0. Premium is ¥680 per month and is charged in Japanese yen (JPY).",
    },
    {
      label: "Free daily allowance",
      value:
        "On Free, public-work translation unlocks and My Library imports share a total allowance of 3 uses per day. This is one shared allowance.",
    },
    {
      label: "Premium daily allowances",
      value:
        "Premium provides up to 30 public-work translation unlocks per day. My Library imports and word explanations have no daily count limit.",
    },
  ],
  ko: [
    {
      label: "요금",
      value: "Free는 ¥0입니다. Premium은 월 ¥680이며 일본 엔(JPY)으로 결제됩니다.",
    },
    {
      label: "Free 일일 이용량",
      value:
        "Free에서는 공개 작품 번역 잠금 해제와 개인 서재 가져오기가 합산 하루 3회의 공통 이용량을 공유합니다.",
    },
    {
      label: "Premium 일일 이용량",
      value:
        "Premium은 공개 작품 번역 잠금 해제를 하루 최대 30회 제공합니다. 개인 서재 가져오기와 단어 설명에는 일일 횟수 제한이 없습니다.",
    },
  ],
};

function href(path: string, locale: SearchLocale): string {
  return localizePath(path, locale);
}

function withSharedUi(
  locale: SearchLocale,
  config: Omit<SearchLandingConfig, "ui">
): SearchLandingConfig {
  return {
    ...config,
    ui: {
      ...uiByLocale[locale],
      guideHref: href("/guide", locale),
    },
  };
}

function japaneseNovelReader(locale: SearchLocale): Definition {
  if (locale === "en") {
    return {
      title: "Read Japanese novels with the original text and English translation | LIB read",
      description:
        "Read Japanese novels and web novels with the Japanese original kept on screen beside an English translation. LIB read supports sentence matching, long-form progress, bookmarks, word explanations, and read-aloud.",
      config: withSharedUi("en", {
        eyebrow: "JAPANESE NOVEL / ENGLISH TRANSLATION",
        title: "Read Japanese novels with the original text and English translation",
        intro:
          "LIB read is a bilingual long-form reading platform for novels and web novels. It keeps the Japanese original visible while you read an English translation, so you can continue through chapters without turning the book into a translation-only document.",
        directAnswer:
          "Yes. Open a Japanese public work or import a supported book into My Library, choose English as the bilingual target, and read the Japanese and English text as corresponding sentences. Reading position and bookmarks are kept so you can continue a long work later.",
        features: [
          {
            title: "Keep Japanese and English together",
            body: "The Japanese source remains visible. The English translation is shown as parallel text rather than replacing the original.",
          },
          {
            title: "Follow corresponding sentences",
            body: "The Reader aligns source and translation by sentence and lets you move between corresponding positions while reading longer passages.",
          },
          {
            title: "Check words and expressions in context",
            body: "Select language in the bilingual Reader to check contextual word meaning, part of speech, idioms, phrasal expressions, and grammar explanations.",
          },
          {
            title: "Continue across chapters",
            body: "Keep reading position and bookmarks, move to the previous or next episode, and return to the same long-form work instead of starting a new translation session each time.",
          },
        ],
        demo: {
          sourceLabel: "ORIGINAL / JAPANESE",
          translationLabel: "TRANSLATION / ENGLISH",
          instruction:
            "Scroll either panel to keep corresponding positions in sync. Tap a sentence to bring the matching sentence into view in both panels.",
          sentences: [
            { source: "雨が上がると、駅前の石畳が朝の光を反射していた。", translation: "When the rain stopped, the stone pavement in front of the station reflected the morning light." },
            { source: "私は濡れた傘を閉じ、古い時計塔を見上げた。", translation: "I closed my wet umbrella and looked up at the old clock tower." },
            { source: "約束の時間までは、まだ十分ほどある。", translation: "There were still about ten minutes until the time we had agreed to meet." },
            { source: "それでも、彼女はもう改札の向こうに立っていた。", translation: "Even so, she was already standing beyond the ticket gate." },
            { source: "こちらに気づくと、彼女は本を閉じて小さく手を振った。", translation: "When she noticed me, she closed her book and gave a small wave." },
          ],
          note:
            "The actual Reader also supports sentence-position matching, contextual language explanations, bookmarks, reading-position saving, and read-aloud controls.",
        },
        steps: [
          "Choose a Japanese work from public works, or sign in and import a supported file into My Library.",
          "Open the chapter or episode you want to read. The work remains organized as one long-form title across its chapters.",
          "Turn on bilingual reading and choose English as the translation language. If a saved translation is available, LIB read can reuse it.",
          "Read the Japanese first or use both panels together. Keep your bookmark and reading position, then continue from the same place later.",
        ],
        differences: [
          {
            title: "No repeated copy and paste",
            body: "Instead of sending each difficult sentence to a separate translator, the source and translation stay connected inside the work you are reading.",
          },
          {
            title: "Not a translation-only file",
            body: "The Japanese text remains available at all times, so the English version does not replace the source you are trying to read.",
          },
          {
            title: "Built for continuing a novel",
            body: "Chapter structure, reading position, bookmarks, and previous/next navigation make it suitable for books and serial fiction read over multiple sessions.",
          },
        ],
        capabilities: [
          "Japanese original + English parallel translation",
          "Sentence-level source/translation matching",
          "Contextual word, idiom, and grammar explanations",
          "TXT, EPUB, DOCX, and text-based PDF import",
          "Long-form chapter and episode management",
          "Reading position and bookmarks",
          "Previous/next episode navigation",
          "Browser read-aloud",
          "Public works and private My Library reading",
        ],
        facts: [
          ...commonFacts.en,
          {
            label: "Account",
            value:
              "Public works can be browsed without signing in. Importing your own book into the private My Library requires an account.",
          },
        ],
        faq: [
          {
            question: "Can I read Japanese novels with English translation?",
            answer:
              "Yes. LIB read keeps the Japanese original visible and can show an English translation as corresponding parallel text in the Reader.",
          },
          {
            question: "Does LIB read keep the original Japanese text?",
            answer:
              "Yes. Bilingual mode adds a translation alongside the source; it does not replace the Japanese original with English-only text.",
          },
          {
            question: "Can I use it for long novels?",
            answer:
              "Yes. Works are managed by chapter or episode with reading position, bookmarks, and previous/next navigation so you can continue over multiple sessions.",
          },
          {
            question: "Can I import EPUB or PDF books?",
            answer:
              "Yes. My Library supports TXT, EPUB, DOCX, and PDFs that contain extractable text. Image-only scanned PDFs are not supported.",
          },
          {
            question: "Is LIB read free?",
            answer:
              "There is a ¥0 Free plan. Premium is ¥680 per month in JPY. On Free, public-work translation unlocks and My Library imports share a total allowance of 3 uses per day.",
          },
        ],
        primaryCta: {
          href: href("/search", "en"),
          label: "Browse public works",
        },
        secondaryCta: {
          href: href("/library/import", "en"),
          label: "Import a book into My Library",
        },
        related: [
          {
            href: href("/learn-japanese-with-web-novels", "en"),
            label: "Learn Japanese with novels and web novels",
            description: "Use long-form fiction as continuing Japanese reading practice instead of isolated example sentences.",
          },
          {
            href: href("/pdf-epub-bilingual-reader", "en"),
            label: "PDF and EPUB bilingual reader",
            description: "Import supported long-form files and keep the source and translation together by chapter.",
          },
          {
            href: href("/subscription", "en"),
            label: "Free and Premium plans",
            description: "See the public plan comparison, daily allowances, library limits, and ¥680/month Premium price.",
          },
        ],
      }),
    };
  }

  return {
    title: "일본어 소설을 원문과 한국어 번역으로 함께 읽기 | LIB read",
    description:
      "일본어 장편소설과 웹소설을 일본어 원문을 남긴 채 한국어 번역과 함께 읽을 수 있습니다. 문장 대응, 읽던 위치, 책갈피, 단어 설명, 읽어주기를 지원합니다.",
    config: withSharedUi("ko", {
      eyebrow: "JAPANESE NOVEL / KOREAN TRANSLATION",
      title: "일본어 소설을 원문과 한국어 번역으로 함께 읽기",
      intro:
        "LIB read는 장편소설과 웹소설을 위한 다국어 독서 플랫폼입니다. 일본어 원문을 지우지 않고 한국어 번역과 함께 보여 주며, 장과 화를 넘어 같은 작품을 계속 읽을 수 있습니다.",
      directAnswer:
        "가능합니다. 일본어 공개 작품을 열거나 지원 파일을 개인 서재에 가져온 뒤 한국어를 대역 언어로 선택하면 일본어 원문과 한국어 번역을 대응하는 문장으로 함께 읽을 수 있습니다. 읽던 위치와 책갈피도 저장됩니다.",
      features: [
        { title: "일본어 원문과 한국어 번역을 함께 유지", body: "일본어 본문을 번역문으로 교체하지 않고 원문과 한국어 번역을 대역으로 표시합니다." },
        { title: "대응 문장을 따라 읽기", body: "Reader에서 원문과 번역의 문장 위치를 맞추고 긴 문단에서도 대응하는 위치를 오가며 읽을 수 있습니다." },
        { title: "문맥 속 단어와 표현 확인", body: "단어의 문맥상 의미와 품사, 관용 표현, 구동사, 문법 표현에 대한 설명을 Reader 안에서 확인할 수 있습니다." },
        { title: "장과 화를 넘어 이어 읽기", body: "읽던 위치와 책갈피를 저장하고 이전 화·다음 화로 이동해 긴 작품을 여러 번에 나누어 계속 읽을 수 있습니다." },
      ],
      demo: {
        sourceLabel: "ORIGINAL / JAPANESE",
        translationLabel: "TRANSLATION / KOREAN",
        instruction: "어느 쪽 패널을 스크롤해도 대응 위치가 함께 움직입니다. 문장을 누르면 양쪽에서 대응 문장이 같은 위치로 이동합니다.",
        sentences: [
          { source: "雨が上がると、駅前の石畳が朝の光を反射していた。", translation: "비가 그치자 역 앞 돌바닥이 아침 햇빛을 반사하고 있었다." },
          { source: "私は濡れた傘を閉じ、古い時計塔を見上げた。", translation: "나는 젖은 우산을 접고 오래된 시계탑을 올려다보았다." },
          { source: "約束の時間までは、まだ十分ほどある。", translation: "약속 시간까지는 아직 10분 정도 남아 있었다." },
          { source: "それでも、彼女はもう改札の向こうに立っていた。", translation: "그런데도 그녀는 이미 개찰구 너머에 서 있었다." },
          { source: "こちらに気づくと、彼女は本を閉じて小さく手を振った。", translation: "나를 알아본 그녀는 책을 덮고 작게 손을 흔들었다." },
        ],
        note: "실제 Reader에서는 문장 위치 대응, 문맥 설명, 책갈피, 읽던 위치 저장, 읽어주기도 함께 이용할 수 있습니다.",
      },
      steps: [
        "공개 작품에서 일본어 소설을 선택하거나 로그인 후 지원 파일을 개인 서재에 가져옵니다.",
        "읽고 싶은 장이나 화를 엽니다. 장편은 한 작품 안에서 장·화 구조를 유지합니다.",
        "대역 읽기를 켜고 한국어를 번역 언어로 선택합니다. 저장된 대역이 있으면 다시 이용할 수 있습니다.",
        "일본어 원문을 먼저 읽거나 두 언어를 함께 확인합니다. 읽던 위치와 책갈피를 남겨 다음에 이어 읽습니다.",
      ],
      differences: [
        { title: "매번 복사해서 번역하지 않기", body: "모르는 문장마다 별도 번역기에 붙여 넣지 않고 작품 안에서 원문과 번역의 대응을 유지합니다." },
        { title: "번역문만 남는 파일이 아님", body: "한국어 번역으로 원문을 대체하지 않기 때문에 일본어 원문으로 언제든 돌아갈 수 있습니다." },
        { title: "장편을 계속 읽는 구조", body: "장·화 구조, 읽던 위치, 책갈피, 이전·다음 화 이동을 유지해 여러 날에 걸친 독서에 맞습니다." },
      ],
      capabilities: [
        "일본어 원문 + 한국어 대역",
        "문장 단위 원문·번역 대응",
        "문맥 기반 단어·관용 표현·문법 설명",
        "TXT·EPUB·DOCX·텍스트 PDF 가져오기",
        "장·화 단위 장편 관리",
        "읽던 위치와 책갈피 저장",
        "이전 화·다음 화 이동",
        "브라우저 읽어주기",
        "공개 작품과 비공개 개인 서재",
      ],
      facts: [
        ...commonFacts.ko,
        { label: "로그인", value: "공개 작품은 로그인 없이 둘러볼 수 있습니다. 개인 파일을 비공개 개인 서재에 가져오려면 계정이 필요합니다." },
      ],
      faq: [
        { question: "일본어 소설을 한국어 번역과 함께 읽을 수 있나요?", answer: "가능합니다. 일본어 원문을 남긴 채 한국어 번역을 대응하는 대역으로 Reader에 표시할 수 있습니다." },
        { question: "일본어 원문은 그대로 남나요?", answer: "남습니다. 대역은 원문 옆에 번역을 추가하는 방식이며 일본어 본문을 한국어 번역으로 교체하지 않습니다." },
        { question: "긴 장편소설에도 사용할 수 있나요?", answer: "가능합니다. 장·화 단위 관리, 읽던 위치, 책갈피, 이전·다음 화 이동을 이용해 여러 번에 나누어 이어 읽을 수 있습니다." },
        { question: "EPUB이나 PDF도 가져올 수 있나요?", answer: "TXT, EPUB, DOCX와 텍스트를 추출할 수 있는 PDF를 지원합니다. 이미지뿐인 스캔 PDF는 지원하지 않습니다." },
        { question: "LIB read는 무료인가요?", answer: "¥0 Free 플랜이 있습니다. Premium은 월 ¥680(JPY)이며 Free에서는 공개 작품 번역 잠금 해제와 개인 서재 가져오기가 합산 하루 3회의 공통 이용량을 공유합니다." },
      ],
      primaryCta: { href: href("/search", "ko"), label: "공개 작품 찾기" },
      secondaryCta: { href: href("/library/import", "ko"), label: "개인 서재에 책 가져오기" },
      related: [
        { href: href("/learn-japanese-with-web-novels", "ko"), label: "소설과 웹소설로 일본어 공부하기", description: "짧은 예문 대신 좋아하는 장편을 계속 읽으며 일본어 독해를 연습합니다." },
        { href: href("/pdf-epub-bilingual-reader", "ko"), label: "PDF·EPUB 대역 리더", description: "지원하는 장편 파일을 가져와 장별로 원문과 번역을 함께 읽습니다." },
        { href: href("/subscription", "ko"), label: "Free와 Premium 비교", description: "공개 요금표에서 이용량, 개인 서재 한도, Premium 월 ¥680 요금을 확인합니다." },
      ],
    }),
  };
}

function learnJapanese(locale: SearchLocale): Definition {
  if (locale === "en") {
    return {
      title: "Learn Japanese by reading novels and web novels | LIB read",
      description:
        "Practice Japanese by continuing through novels and web novels with the original text, parallel translation, sentence matching, contextual explanations, bookmarks, and saved reading position.",
      config: withSharedUi("en", {
        eyebrow: "LEARN JAPANESE / WEB NOVELS",
        title: "Learn Japanese by reading novels and web novels",
        intro:
          "LIB read lets you use a story you actually want to continue as Japanese reading practice. Instead of switching between isolated example sentences, you can follow the same characters, vocabulary, and context across chapters while keeping an English translation available when you need it.",
        directAnswer:
          "To study Japanese with novels, keep the Japanese source visible, use the English translation as a reference, and preserve your place so the next study session starts with the next part of the same story. LIB read is designed around that continuing long-form reading loop.",
        features: [
          { title: "Learn inside a continuing story", body: "Read the same characters and setting across a long work, so repeated vocabulary and expressions appear inside a larger context rather than as disconnected exercises." },
          { title: "Check the translation without losing the source", body: "Japanese and English remain paired in the bilingual Reader. You can look at the translation when needed and return directly to the matching Japanese sentence." },
          { title: "Inspect language in context", body: "Use contextual word meaning, part-of-speech information, idiom and grammar explanations while the surrounding sentence remains visible." },
          { title: "Resume the same work next time", body: "Reading position, bookmarks, chapter structure, and previous/next navigation turn study into the continuation of a book instead of a new setup every day." },
        ],
        demo: {
          sourceLabel: "JAPANESE",
          translationLabel: "ENGLISH REFERENCE",
          instruction: "Scroll either panel to follow matching positions. Tap a sentence to focus the corresponding Japanese and English lines together.",
          sentences: [
            { source: "彼は返事をする前に、窓の外をしばらく見つめていた。", translation: "Before answering, he stared out the window for a while." },
            { source: "遠くの山には、昨日降った雪がまだ残っている。", translation: "Snow that had fallen the day before still remained on the distant mountains." },
            { source: "『本当に行くの？』と私はもう一度たずねた。", translation: "“Are you really going?” I asked once more." },
            { source: "彼は少し笑って、それから静かにうなずいた。", translation: "He smiled a little and then nodded quietly." },
          ],
          note: "Use the translation as a reference rather than replacing the Japanese text, and open contextual explanations only when a word or expression blocks comprehension.",
        },
        steps: [
          "Find a Japanese public work, or sign in and import a supported book that you are allowed to use.",
          "Open an episode and turn on bilingual reading with English as the translation language.",
          "Read the Japanese first. Check the matching English sentence and contextual word or grammar explanation only when needed.",
          "Save your place or a bookmark and continue with the next chapter or episode in the next session.",
        ],
        differences: [
          { title: "Longer context than example sentences", body: "A continuing story gives you recurring characters, situations, vocabulary, and writing style across many pages." },
          { title: "More source-focused than translation-only reading", body: "Because the Japanese remains visible beside the English reference, understood passages can be read directly in Japanese." },
          { title: "Study resumes where the story stopped", body: "The work, chapter, reading position, and bookmarks remain available, reducing the setup needed to continue the same Japanese text." },
        ],
        capabilities: [
          "Japanese + English parallel reading",
          "Sentence-level matching and synchronized positions",
          "Contextual word, idiom, and grammar explanations",
          "Public works and private imported books",
          "TXT, EPUB, DOCX, and text-based PDF import",
          "Long-form chapter and episode management",
          "Reading position and bookmarks",
          "Previous/next episode navigation",
          "Browser read-aloud",
        ],
        facts: [
          ...commonFacts.en,
          { label: "Login requirement", value: "You can browse public works without an account. Importing a private book and keeping it in My Library requires signing in." },
        ],
        faq: [
          { question: "Can I learn Japanese by reading novels?", answer: "Yes. LIB read is designed to keep Japanese fiction readable over multiple sessions with an English reference, sentence matching, contextual explanations, and saved progress." },
          { question: "Do I have to read the English translation all the time?", answer: "No. The original Japanese remains visible, so you can read it directly and use the English side only when you need help." },
          { question: "Can I study with web novels?", answer: "You can read public works on LIB read and use bilingual reading on supported content. LIB read does not currently import a novel automatically from an external web-novel URL." },
          { question: "Does it save where I stopped?", answer: "Yes. Reading position and bookmarks are part of the long-form Reader, so you can resume the same work later." },
          { question: "Is there a free plan?", answer: "Yes. Free costs ¥0. Premium costs ¥680/month in JPY. Public-work translation unlocks and My Library imports share a total allowance of 3 uses per day on Free." },
        ],
        primaryCta: { href: href("/search", "en"), label: "Find a Japanese work" },
        secondaryCta: { href: href("/library", "en"), label: "Open My Library" },
        related: [
          { href: href("/japanese-novel-reader", "en"), label: "Japanese novels with English translation", description: "See how the original Japanese and English translation stay aligned during long-form reading." },
          { href: href("/pdf-epub-bilingual-reader", "en"), label: "PDF and EPUB bilingual reader", description: "Bring supported long-form files into a private library and read them chapter by chapter." },
          { href: href("/subscription", "en"), label: "Free and Premium plans", description: "Check the public plan table, usage allowances, library limits, and current Premium price." },
        ],
      }),
    };
  }

  return {
    title: "웹소설과 장편소설을 읽으며 일본어 공부하기 | LIB read",
    description:
      "짧은 예문 대신 일본어 장편소설과 웹소설을 계속 읽으며 공부합니다. 원문·한국어 대역, 문장 대응, 문맥 설명, 책갈피, 읽던 위치 저장을 지원합니다.",
    config: withSharedUi("ko", {
      eyebrow: "LEARN JAPANESE / WEB NOVELS",
      title: "웹소설과 장편소설을 읽으며 일본어 공부하기",
      intro:
        "LIB read에서는 계속 읽고 싶은 이야기를 일본어 독해 학습에 사용할 수 있습니다. 짧은 예문을 반복해서 바꾸는 대신 같은 등장인물, 어휘, 문맥을 장과 화를 넘어 따라가면서 필요할 때 한국어 번역을 참고합니다.",
      directAnswer:
        "소설로 일본어를 공부하려면 일본어 원문을 그대로 두고 한국어 번역을 참고용으로 사용하며, 다음 학습 때 같은 작품의 이어지는 부분부터 다시 시작할 수 있어야 합니다. LIB read는 이 장편 독서 흐름을 유지합니다.",
      features: [
        { title: "이어지는 이야기 속에서 학습", body: "같은 작품을 읽기 때문에 인물, 상황, 어휘와 표현이 긴 문맥 속에서 반복됩니다." },
        { title: "원문을 놓치지 않고 번역 확인", body: "일본어와 한국어 번역을 대응시켜 표시하므로 필요한 순간에 번역을 확인하고 바로 같은 일본어 문장으로 돌아갈 수 있습니다." },
        { title: "문맥 속 언어 설명", body: "주변 문장을 유지한 채 단어의 문맥상 의미, 품사, 관용 표현, 문법 표현을 확인할 수 있습니다." },
        { title: "다음 학습도 같은 작품의 계속", body: "읽던 위치, 책갈피, 장·화 구조, 이전·다음 화 이동이 남아 매번 새 교재를 고르지 않고 이어서 읽을 수 있습니다." },
      ],
      demo: {
        sourceLabel: "JAPANESE",
        translationLabel: "KOREAN REFERENCE",
        instruction: "어느 쪽을 스크롤해도 대응 위치가 함께 움직입니다. 문장을 누르면 일본어와 한국어의 대응 문장을 함께 확인할 수 있습니다.",
        sentences: [
          { source: "彼は返事をする前に、窓の外をしばらく見つめていた。", translation: "그는 대답하기 전에 한동안 창밖을 바라보고 있었다." },
          { source: "遠くの山には、昨日降った雪がまだ残っている。", translation: "멀리 있는 산에는 어제 내린 눈이 아직 남아 있다." },
          { source: "『本当に行くの？』と私はもう一度たずねた。", translation: "“정말 갈 거야?”라고 나는 다시 한번 물었다." },
          { source: "彼は少し笑って、それから静かにうなずいた。", translation: "그는 조금 웃고 나서 조용히 고개를 끄덕였다." },
        ],
        note: "번역으로 일본어를 대체하지 않고 참고용으로 사용하며, 이해를 막는 단어나 표현이 있을 때만 문맥 설명을 확인할 수 있습니다.",
      },
      steps: [
        "공개된 일본어 작품을 찾거나 로그인 후 이용 권한이 있는 지원 파일을 개인 서재에 가져옵니다.",
        "화를 열고 대역 읽기를 켠 뒤 한국어를 번역 언어로 선택합니다.",
        "일본어를 먼저 읽고 필요할 때만 대응하는 한국어 문장이나 단어·문법 설명을 확인합니다.",
        "읽던 위치와 책갈피를 저장하고 다음 학습에서는 같은 작품의 다음 장·화부터 이어 읽습니다.",
      ],
      differences: [
        { title: "예문보다 긴 문맥", body: "하나의 작품을 계속 읽으므로 인물 관계, 상황, 반복 어휘와 문체를 긴 문맥 속에서 접할 수 있습니다." },
        { title: "번역문만 읽는 방식보다 원문 중심", body: "일본어가 한국어 참고 번역과 함께 남아 있으므로 이해한 부분은 일본어 그대로 읽기 쉽습니다." },
        { title: "학습이 이야기의 다음 부분으로 이어짐", body: "작품, 장·화, 읽던 위치와 책갈피가 유지되어 다음 학습 때 같은 일본어 텍스트를 바로 이어 읽을 수 있습니다." },
      ],
      capabilities: [
        "일본어 + 한국어 대역 읽기",
        "문장 단위 대응과 위치 동기화",
        "문맥 기반 단어·관용 표현·문법 설명",
        "공개 작품과 비공개 가져오기 작품",
        "TXT·EPUB·DOCX·텍스트 PDF 가져오기",
        "장·화 단위 장편 관리",
        "읽던 위치와 책갈피",
        "이전 화·다음 화 이동",
        "브라우저 읽어주기",
      ],
      facts: [
        ...commonFacts.ko,
        { label: "로그인 필요 여부", value: "공개 작품은 계정 없이 둘러볼 수 있습니다. 개인 파일을 가져와 개인 서재에 보관하려면 로그인이 필요합니다." },
      ],
      faq: [
        { question: "소설을 읽으며 일본어를 공부할 수 있나요?", answer: "가능합니다. 일본어 원문, 한국어 참고 번역, 문장 대응, 문맥 설명, 읽던 위치를 함께 유지해 같은 소설을 여러 번에 나누어 읽는 방식입니다." },
        { question: "항상 한국어 번역을 읽어야 하나요?", answer: "아닙니다. 일본어 원문이 계속 보이므로 일본어로 직접 읽고 이해가 어려운 부분에서만 한국어를 참고할 수 있습니다." },
        { question: "웹소설로도 공부할 수 있나요?", answer: "LIB read의 공개 작품을 읽고 지원되는 콘텐츠에서 대역을 사용할 수 있습니다. 현재 외부 웹소설 URL을 붙여 자동으로 가져오는 기능은 없습니다." },
        { question: "어디까지 읽었는지 저장되나요?", answer: "저장됩니다. 읽던 위치와 책갈피를 이용해 같은 작품의 이어지는 부분부터 다시 시작할 수 있습니다." },
        { question: "무료 플랜이 있나요?", answer: "있습니다. Free는 ¥0이고 Premium은 월 ¥680(JPY)입니다. Free의 공개 작품 번역 잠금 해제와 개인 서재 가져오기는 합산 하루 3회의 공통 이용량입니다." },
      ],
      primaryCta: { href: href("/search", "ko"), label: "일본어 작품 찾기" },
      secondaryCta: { href: href("/library", "ko"), label: "개인 서재 열기" },
      related: [
        { href: href("/japanese-novel-reader", "ko"), label: "일본어 소설을 한국어 대역으로 읽기", description: "일본어 원문과 한국어 번역을 장편 독서 중 어떻게 함께 유지하는지 확인합니다." },
        { href: href("/pdf-epub-bilingual-reader", "ko"), label: "PDF·EPUB 대역 리더", description: "지원하는 장편 파일을 비공개 개인 서재로 가져와 장별로 읽습니다." },
        { href: href("/subscription", "ko"), label: "Free와 Premium 비교", description: "공개 요금표에서 현재 요금, 이용량, 개인 서재 한도를 확인합니다." },
      ],
    }),
  };
}

function fileReader(locale: SearchLocale): Definition {
  if (locale === "en") {
    return {
      title: "PDF and EPUB bilingual reader for long novels | LIB read",
      description:
        "Import TXT, EPUB, DOCX, or text-based PDF novels into a private library and read the original text beside a parallel translation while preserving chapters, reading position, bookmarks, and read-aloud.",
      config: withSharedUi("en", {
        eyebrow: "PDF / EPUB / BILINGUAL READER",
        title: "Read PDF and EPUB novels with the original text and parallel translation",
        intro:
          "LIB read treats an imported long-form file as a book to keep reading, not as a one-time translation job. Supported files go into your private My Library, where chapters, source text, bilingual text, reading position, and bookmarks stay organized together.",
        directAnswer:
          "You can import TXT, EPUB, DOCX, and text-based PDF files, open the detected chapters in the Reader, and read the source alongside a selected translation. The original remains available and your place is saved for the next session.",
        features: [
          { title: "Keep a long file as one work", body: "Imported content is organized as a work with chapters or reading units so you can navigate a long novel instead of reopening a flat translated file." },
          { title: "Keep the source beside the translation", body: "Bilingual mode adds translated text without replacing the original, preserving access to both versions while you read." },
          { title: "Resume from the right place", body: "Reading position, bookmarks, and chapter navigation reduce the need to find your place again when a book takes days or weeks to finish." },
          { title: "Use language tools in the Reader", body: "The same reading view can provide sentence matching, contextual word and expression explanations, and browser read-aloud." },
        ],
        demo: {
          sourceLabel: "ORIGINAL TEXT",
          translationLabel: "PARALLEL TRANSLATION",
          instruction: "Scroll either panel to keep corresponding positions together. Tap a sentence to focus its matched translation in both panels.",
          sentences: [
            { source: "古い港町には、海から細い霧が流れ込んでいた。", translation: "A thin mist was drifting in from the sea over the old port town." },
            { source: "石段の上にある宿だけが、まだ明かりをつけている。", translation: "Only the inn above the stone steps still had its lights on." },
            { source: "私は鞄を持ち直し、濡れた坂道をゆっくり上った。", translation: "I adjusted my bag and slowly climbed the wet slope." },
            { source: "今夜ここに来るよう書かれていた理由は、まだ分からない。", translation: "I still did not know why the letter had told me to come here tonight." },
          ],
          note: "The example is static content. In My Library, supported books are opened by chapter or reading unit with bilingual text, reading-position saving, bookmarks, and read-aloud controls.",
        },
        steps: [
          "Sign in and choose the import option in My Library.",
          "Select a TXT, EPUB, DOCX, or text-based PDF that you are allowed to store and translate.",
          "Open a detected chapter or reading unit and turn on bilingual reading with the translation language you want.",
          "Stop at any point and return later using the saved reading position, bookmarks, and the work's chapter list.",
        ],
        differences: [
          { title: "Not a separate translated PDF", body: "The goal is not to replace the book with a translation-only output. The original stays available beside the translation in the Reader." },
          { title: "Keeps long-form structure", body: "The imported content remains organized by chapters or reading units, making navigation practical for a long novel." },
          { title: "Keeps reading state", body: "Bookmarks and reading position persist across sessions, so the workflow is continuous reading rather than repeated file conversion." },
        ],
        capabilities: [
          "TXT import",
          "EPUB chapter/spine processing",
          "DOCX heading-based processing",
          "Text-based PDF import",
          "Chapter and reading-unit management",
          "Original + parallel translation",
          "Sentence-level matching",
          "Reading position and bookmarks",
          "Browser read-aloud",
        ],
        facts: [
          ...commonFacts.en,
          { label: "Supported files", value: "TXT, EPUB, DOCX, and PDFs with extractable text are supported. Image-only scanned PDFs are not supported." },
          { label: "Privacy and login", value: "Imported My Library works require an account and are private to the owner; they are not listed as public works or search results." },
        ],
        faq: [
          { question: "Can I use a PDF as a bilingual reader?", answer: "Yes, if the PDF contains extractable text. Import it into My Library, open its reading units, and use bilingual mode to keep the source beside a selected translation." },
          { question: "Does LIB read support EPUB?", answer: "Yes. EPUB is supported along with TXT, DOCX, and text-based PDF files." },
          { question: "Does it work with scanned image PDFs?", answer: "No. Image-only scanned PDFs that require OCR are not currently supported." },
          { question: "Are imported books public?", answer: "No. My Library works are private to the owner and are not shown in the public works list or public search." },
          { question: "How much does it cost?", answer: "Free costs ¥0 and Premium costs ¥680/month in JPY. Public-work translation unlocks and My Library imports share a total allowance of 3 uses per day on Free." },
        ],
        primaryCta: { href: href("/library/import", "en"), label: "Import a long-form file" , note: "My Library import requires an account. Only import content you have the right to store and translate."},
        secondaryCta: { href: href("/subscription", "en"), label: "Compare Free and Premium" },
        related: [
          { href: href("/japanese-novel-reader", "en"), label: "Read Japanese novels with English translation", description: "Use Japanese source text and English parallel translation while keeping long-form reading progress." },
          { href: href("/learn-japanese-with-web-novels", "en"), label: "Learn Japanese with novels", description: "Turn the continuation of a novel or web novel into Japanese reading practice." },
          { href: href("/subscription", "en"), label: "Free and Premium plans", description: "See current prices, shared Free usage, Premium daily allowances, and My Library limits." },
        ],
      }),
    };
  }

  return {
    title: "PDF·EPUB 장편소설 대역 리더 | LIB read",
    description:
      "TXT·EPUB·DOCX·텍스트 PDF 장편소설을 비공개 개인 서재에 가져와 원문과 번역을 함께 읽고 장 구조, 읽던 위치, 책갈피, 읽어주기를 유지합니다.",
    config: withSharedUi("ko", {
      eyebrow: "PDF / EPUB / BILINGUAL READER",
      title: "PDF·EPUB 장편소설을 원문과 번역으로 함께 읽기",
      intro:
        "LIB read는 장편 파일을 한 번 번역하고 끝내는 대상이 아니라 계속 읽는 책으로 관리합니다. 지원 파일을 비공개 개인 서재에 가져오면 장·읽기 단위, 원문, 대역, 읽던 위치, 책갈피를 한곳에서 유지할 수 있습니다.",
      directAnswer:
        "TXT, EPUB, DOCX, 텍스트를 추출할 수 있는 PDF를 가져와 감지된 장·읽기 단위를 Reader에서 열고 원문과 선택한 언어의 번역을 함께 읽을 수 있습니다. 원문은 그대로 남고 읽던 위치도 저장됩니다.",
      features: [
        { title: "긴 파일을 한 작품으로 관리", body: "가져온 장편을 장·읽기 단위 구조로 관리해 평면적인 번역 파일을 다시 여는 대신 작품 목차를 따라 이동할 수 있습니다." },
        { title: "원문과 번역을 함께 유지", body: "대역 모드는 원문을 번역문으로 교체하지 않고 같은 Reader 안에서 두 텍스트를 대응시켜 보여 줍니다." },
        { title: "읽던 곳에서 다시 시작", body: "읽던 위치, 책갈피, 장 이동을 이용해 며칠 또는 몇 주가 걸리는 장편도 다시 위치를 찾는 작업을 줄일 수 있습니다." },
        { title: "Reader 안에서 언어 기능 사용", body: "문장 대응, 문맥 기반 단어·표현 설명, 브라우저 읽어주기를 같은 독서 화면에서 사용할 수 있습니다." },
      ],
      demo: {
        sourceLabel: "ORIGINAL TEXT",
        translationLabel: "PARALLEL TRANSLATION",
        instruction: "어느 쪽 패널을 스크롤해도 대응 위치가 함께 움직입니다. 문장을 누르면 양쪽에서 대응 문장을 함께 볼 수 있습니다.",
        sentences: [
          { source: "古い港町には、海から細い霧が流れ込んでいた。", translation: "오래된 항구 도시에는 바다에서 엷은 안개가 흘러들고 있었다." },
          { source: "石段の上にある宿だけが、まだ明かりをつけている。", translation: "돌계단 위에 있는 여관만 아직 불을 밝히고 있었다." },
          { source: "私は鞄を持ち直し、濡れた坂道をゆっくり上った。", translation: "나는 가방을 고쳐 들고 젖은 비탈길을 천천히 올라갔다." },
          { source: "今夜ここに来るよう書かれていた理由は、まだ分からない。", translation: "오늘 밤 이곳에 오라고 쓰여 있던 이유는 아직 알 수 없었다." },
        ],
        note: "이 예시는 정적 본문입니다. 실제 개인 서재에서는 지원 파일을 장·읽기 단위로 열고 대역, 읽던 위치, 책갈피, 읽어주기를 이용할 수 있습니다.",
      },
      steps: [
        "로그인 후 개인 서재에서 가져오기를 선택합니다.",
        "저장·번역할 권리가 있는 TXT, EPUB, DOCX 또는 텍스트 PDF를 선택합니다.",
        "감지된 장이나 읽기 단위를 열고 대역을 켠 뒤 원하는 번역 언어를 선택합니다.",
        "원하는 곳에서 독서를 멈추고 다음에는 저장된 읽던 위치, 책갈피, 작품 목차를 이용해 이어 읽습니다.",
      ],
      differences: [
        { title: "번역된 별도 PDF를 만드는 방식이 아님", body: "번역문만 남는 결과물로 원본을 대체하지 않고 Reader 안에서 원문을 번역과 함께 유지합니다." },
        { title: "장편 구조를 유지", body: "가져온 콘텐츠는 장·읽기 단위로 관리되어 긴 소설에서도 목차를 따라 이동하기 쉽습니다." },
        { title: "독서 상태를 유지", body: "읽던 위치와 책갈피가 세션을 넘어 남아 반복적인 파일 변환이 아니라 계속 읽는 흐름을 만듭니다." },
      ],
      capabilities: [
        "TXT 가져오기",
        "EPUB 장·spine 처리",
        "DOCX 제목 구조 처리",
        "텍스트 PDF 가져오기",
        "장·읽기 단위 관리",
        "원문 + 대역 번역",
        "문장 단위 대응",
        "읽던 위치와 책갈피",
        "브라우저 읽어주기",
      ],
      facts: [
        ...commonFacts.ko,
        { label: "지원 파일", value: "TXT, EPUB, DOCX, 텍스트를 추출할 수 있는 PDF를 지원합니다. 이미지뿐인 스캔 PDF는 지원하지 않습니다." },
        { label: "비공개와 로그인", value: "개인 서재 가져오기는 계정이 필요하며, 가져온 작품은 소유자만 볼 수 있는 비공개 콘텐츠로 공개 작품 목록이나 검색에 표시되지 않습니다." },
      ],
      faq: [
        { question: "PDF를 대역 리더로 사용할 수 있나요?", answer: "텍스트를 추출할 수 있는 PDF라면 가능합니다. 개인 서재에 가져와 읽기 단위를 열고 원문과 선택한 번역을 함께 볼 수 있습니다." },
        { question: "EPUB도 지원하나요?", answer: "지원합니다. EPUB 외에 TXT, DOCX, 텍스트 PDF도 가져올 수 있습니다." },
        { question: "스캔 이미지 PDF도 되나요?", answer: "현재는 지원하지 않습니다. OCR이 필요한 이미지뿐인 스캔 PDF는 가져오기 대상이 아닙니다." },
        { question: "가져온 책이 다른 사람에게 공개되나요?", answer: "아닙니다. 개인 서재 작품은 소유자에게만 공개되며 공개 작품 목록이나 공개 검색에 나오지 않습니다." },
        { question: "요금은 얼마인가요?", answer: "Free는 ¥0이고 Premium은 월 ¥680(JPY)입니다. Free의 공개 작품 번역 잠금 해제와 개인 서재 가져오기는 합산 하루 3회의 공통 이용량입니다." },
      ],
      primaryCta: { href: href("/library/import", "ko"), label: "장편 파일 가져오기", note: "개인 서재 가져오기는 로그인이 필요합니다. 저장·번역할 권리가 있는 콘텐츠만 가져오세요." },
      secondaryCta: { href: href("/subscription", "ko"), label: "Free와 Premium 비교" },
      related: [
        { href: href("/japanese-novel-reader", "ko"), label: "일본어 소설을 한국어 대역으로 읽기", description: "일본어 원문과 한국어 번역을 유지하면서 장편 독서를 이어갑니다." },
        { href: href("/learn-japanese-with-web-novels", "ko"), label: "소설로 일본어 공부하기", description: "소설과 웹소설의 다음 이야기를 읽는 흐름을 일본어 독해 학습으로 사용합니다." },
        { href: href("/subscription", "ko"), label: "Free와 Premium 비교", description: "현재 요금, Free 공통 이용량, Premium 일일 한도와 개인 서재 한도를 확인합니다." },
      ],
    }),
  };
}

export function getSearchDiscoveryDefinition(
  slug: SearchDiscoverySlug,
  locale: SearchLocale
): Definition {
  if (slug === "japanese-novel-reader") return japaneseNovelReader(locale);
  if (slug === "learn-japanese-with-web-novels") return learnJapanese(locale);
  return fileReader(locale);
}

function languageAlternates(slug: SearchDiscoverySlug) {
  if (slug === "pdf-epub-bilingual-reader") {
    return {
      ja: "/pdf-bilingual-reader",
      en: "/en/pdf-epub-bilingual-reader",
      ko: "/ko/pdf-epub-bilingual-reader",
      "x-default": "/pdf-bilingual-reader",
    };
  }
  return {
    en: `/en/${slug}`,
    ko: `/ko/${slug}`,
  };
}

export function buildSearchDiscoveryMetadata(
  slug: SearchDiscoverySlug,
  locale: SearchLocale
): Metadata {
  const definition = getSearchDiscoveryDefinition(slug, locale);
  const canonical = href(`/${slug}`, locale);
  return {
    title: definition.title,
    description: definition.description,
    alternates: {
      canonical,
      languages: languageAlternates(slug),
    },
    robots: { index: true, follow: true },
    openGraph: {
      type: "website",
      locale: locale === "en" ? "en_US" : "ko_KR",
      siteName: "LIB read",
      url: canonical,
      title: definition.title,
      description: definition.description,
      images: ["/opengraph-image"],
    },
    twitter: {
      card: "summary_large_image",
      title: definition.title,
      description: definition.description,
      images: ["/opengraph-image"],
    },
  };
}

export function buildSearchDiscoveryStructuredData(
  slug: SearchDiscoverySlug,
  locale: SearchLocale
) {
  const definition = getSearchDiscoveryDefinition(slug, locale);
  const path = href(`/${slug}`, locale);
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: definition.title,
    description: definition.description,
    url: `${SITE_URL}${path}`,
    inLanguage: locale,
    isPartOf: {
      "@type": "WebSite",
      name: "LIB read",
      url: `${SITE_URL}${locale === "en" ? "/en" : "/ko"}`,
    },
  };
}
