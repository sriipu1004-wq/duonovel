import type { Metadata } from "next";
import type { UiLocale } from "@/i18n/config";
import { localizePath } from "@/i18n/navigation";
import {
  getSearchDiscoveryDefinition as getLegacySearchDiscoveryDefinition,
  type SearchDiscoverySlug,
} from "@/lib/seo/searchDiscovery";

const SITE_URL = "https://www.syosetu-libread.com";
type SearchLocale = Exclude<UiLocale, "ja">;
type Definition = ReturnType<typeof getLegacySearchDiscoveryDefinition>;

function replaceCurrentTerms(text: string, locale: SearchLocale): string {
  if (locale === "en") {
    return text
      .replace(/bilingual generations?/gi, "public-work translation unlocks")
      .replace(/bilingual generation/gi, "public-work translation unlock")
      .replace(/word explanations?/gi, "reading settings")
      .replace(
        /contextual word, idiom, and grammar explanations/gi,
        "sentence matching, bookmarks, and reading settings"
      )
      .replace(
        /contextual word meaning, part of speech, idioms, phrasal expressions, and grammar explanations/gi,
        "sentence matching, reading position, bookmarks, and read-aloud controls"
      )
      .replace(
        /word meaning, part of speech, idioms, phrasal expressions, and grammar explanations/gi,
        "sentence matching, reading position, bookmarks, and read-aloud controls"
      )
      .replace(
        /Check words and expressions in context/g,
        "Keep translation context across a long work"
      );
  }

  return text
    .replace(/대역 생성/g, "공개 작품 번역 잠금 해제")
    .replace(/단어 설명/g, "읽기 설정")
    .replace(/문맥 기반 단어·표현 설명/g, "문장 대응과 읽기 설정")
    .replace(
      /단어의 문맥상 의미와 품사, 관용 표현, 구동사, 문법 표현에 대한 설명/g,
      "문장 대응, 읽던 위치, 책갈피와 읽기 설정"
    )
    .replace(/문맥 속 단어와 표현 확인/g, "장편 번역 문맥 유지");
}

function mapStrings<T>(value: T, locale: SearchLocale): T {
  if (typeof value === "string") {
    return replaceCurrentTerms(value, locale) as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => mapStrings(item, locale)) as T;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        mapStrings(item, locale),
      ])
    ) as T;
  }
  return value;
}

function currentPlanFacts(locale: SearchLocale) {
  if (locale === "en") {
    return [
      {
        label: "Price",
        value: "Free is ¥0. Premium is ¥680 per month and is charged in Japanese yen (JPY).",
      },
      {
        label: "Free included daily allowance",
        value: "On Free, public-work translation unlocks and My Library imports share 3 uses per day in total.",
      },
      {
        label: "Premium included daily allowances",
        value: "Premium provides up to 30 public-work translation unlocks per day. My Library imports have no daily count limit.",
      },
      {
        label: "My Library capacity",
        value: "Free stores up to 3 works. Premium stores up to 20 works.",
      },
      {
        label: "Public translation unlock",
        value: "One unlock covers one public-work episode in one target language. Rereading the same episode in that language uses no additional allowance or credit, and Bilingual and Translation only share the same unlock. Original reading does not require a translation unlock.",
      },
    ];
  }

  return [
    {
      label: "요금",
      value: "Free는 ¥0입니다. Premium은 월 ¥680이며 일본 엔(JPY)으로 결제됩니다.",
    },
    {
      label: "Free 포함 일일 이용 한도",
      value: "Free에서는 공개 작품 번역 잠금 해제와 개인 서재 가져오기가 합산 하루 3회를 공유합니다.",
    },
    {
      label: "Premium 포함 일일 이용 한도",
      value: "Premium은 공개 작품 번역 잠금 해제 하루 최대 30회를 제공하며 개인 서재 가져오기는 일일 횟수 제한이 없습니다.",
    },
    {
      label: "개인 서재 보관 한도",
      value: "Free는 최대 3작품, Premium은 최대 20작품을 보관할 수 있습니다.",
    },
    {
      label: "공개 작품 번역 잠금 해제",
      value: "한 번의 잠금 해제는 공개 작품 1화 × 대상 언어 1개에 적용됩니다. 같은 화를 같은 언어로 다시 읽을 때는 추가 이용 한도나 크레딧이 필요하지 않으며 대역과 번역만 보기는 같은 잠금 해제를 공유합니다. 원문 읽기에는 번역 잠금 해제가 필요하지 않습니다.",
    },
  ];
}

function currentPublicTranslationFeatures(locale: SearchLocale) {
  if (locale === "en") {
    return [
      {
        title: "Keep terms steadier across a long series",
        body: "Public translation uses a work-level glossary for names, proper nouns, organizations, and world-specific terms, together with limited context from the immediately preceding public episode. Authors can adjust and lock glossary translations when needed.",
      },
      {
        title: "One work, multiple reading modes",
        body: "The source work stays canonical. Readers can use Original, Bilingual, or Translation only without creating a separate copy of the work for each language.",
      },
      {
        title: "Reuse saved public translations",
        body: "A public translation is saved for its episode, source language, target language, and source version, then reused when those conditions match instead of being regenerated for every reader.",
      },
    ];
  }

  return [
    {
      title: "장편에서 번역 용어의 흔들림 줄이기",
      body: "공개 번역은 인명·고유명사·조직명·세계관 용어를 위한 작품 단위 용어집과 바로 이전 공개 회차의 제한된 문맥을 함께 사용합니다. 작가는 필요할 때 용어집 번역을 수정하고 고정할 수 있습니다.",
    },
    {
      title: "한 작품, 여러 읽기 모드",
      body: "원문 작품을 정본으로 유지하고 독자는 원문·대역·번역만 보기로 읽습니다. 언어마다 별도 작품을 복제하는 구조가 아닙니다.",
    },
    {
      title: "저장된 공개 번역 재사용",
      body: "공개 번역은 회차·원문 언어·대상 언어·원문 버전 기준으로 저장되고 같은 조건에서 재사용됩니다. 독자마다 같은 번역을 매번 다시 생성하지 않습니다.",
    },
  ];
}

export function getSearchDiscoveryDefinition(
  slug: SearchDiscoverySlug,
  locale: SearchLocale
): Definition {
  const legacy = mapStrings(
    getLegacySearchDiscoveryDefinition(slug, locale),
    locale
  );

  return {
    ...legacy,
    config: {
      ...legacy.config,
      facts: currentPlanFacts(locale),
      features: [
        ...legacy.config.features,
        ...currentPublicTranslationFeatures(locale),
      ],
    },
  };
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
  const canonical = localizePath(`/${slug}`, locale);
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
  const path = localizePath(`/${slug}`, locale);
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
