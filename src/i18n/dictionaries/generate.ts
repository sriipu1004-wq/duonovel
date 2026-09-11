import type { UiLocale } from "../config";
import type { TranslationLearningLevel } from "@/lib/translation/translationLearningPreference";

const ja = {
  title: "空き時間に合わせて物語を生成する",
  description: "時間、利用シーン、ジャンルを選ぶと、その場で読める短編を生成します。生成後は読むページへ移動します。保存しない限り、生成結果はこのブラウザ内の一時データとして扱われます。",
  time: "時間",
  minutes: (value: number) => `${value}分`,
  scene: "利用シーン",
  genre: "ジャンル",
  learningTitle: "語学学習向けの対訳（任意）",
  learningLanguage: "学習する言語",
  none: "指定しない",
  difficulty: "対訳の難易度",
  learningHelp: "選んだ言語で対訳するとき、内容を省かず、語彙・文法・文の長さを難易度に合わせます。",
  translationRequest: "対訳への希望（任意）",
  translationPlaceholder: "例：韓国語の初級文法を中心にし、敬語は해요体で統一してください。",
  chars: "文字",
  customRequest: "追加の希望（任意）",
  customHelp: "登場人物、舞台、展開、結末、文体など、物語への希望を自由に入力できます。",
  customPlaceholder: "例：雨の夜の無人駅を舞台にして、最後は少し救いのある結末にしてください。",
  generating: "生成中...",
  generate: "物語を生成する",
  limitHelp: "AI小説生成は新規と続編を合算し、毎日0時（日本時間）に回復します。公開投稿や永続保存にはログインが必要です。",
  customTooLong: "追加の希望は500文字以内で入力してください。",
  translationTooLong: "対訳への希望は300文字以内で入力してください。",
  generationFailed: "AI短編の生成に失敗しました。",
  generationError: "AI短編の生成中にエラーが発生しました。",
  scenes: { 通勤: "通勤", 休憩: "休憩", 睡眠導入: "睡眠導入", 作業前: "作業前", その他: "その他" },
  genres: { ホラー: "ホラー", コメディ: "コメディ", 恋愛: "恋愛", SF: "SF", ミステリー: "ミステリー", ファンタジー: "ファンタジー", 癒し: "癒し" },
  levels: { starter: "入門", beginner: "初級", intermediate: "中級", advanced: "上級" },
} as const;

type GenerateDictionary = {
  [K in keyof typeof ja]: K extends "scenes" | "genres" | "levels"
    ? { [P in keyof (typeof ja)[K]]: string }
    : (typeof ja)[K] extends (...args: infer A) => string
      ? (...args: A) => string
      : string;
};

const en = {
  title: "Generate a story for the time you have",
  description: "Choose your available time, situation, and genre to generate a short story you can read immediately. After generation, LIB read opens it in the Reader. Unless you save it, the result stays as temporary data in this browser.",
  time: "Reading time",
  minutes: (value: number) => `${value} min`,
  scene: "Situation",
  genre: "Genre",
  learningTitle: "Bilingual text for language learning (optional)",
  learningLanguage: "Language to learn",
  none: "None",
  difficulty: "Translation difficulty",
  learningHelp: "When bilingual text is generated in the selected language, the full content is preserved while vocabulary, grammar, and sentence length are adjusted to the selected level.",
  translationRequest: "Translation preferences (optional)",
  translationPlaceholder: "Example: Keep the Korean suitable for beginners and use 해요-style polite endings where natural.",
  chars: "characters",
  customRequest: "Story preferences (optional)",
  customHelp: "Add characters, setting, plot direction, ending, writing style, or other preferences.",
  customPlaceholder: "Example: Set it at an empty station on a rainy night and end with a small sense of hope.",
  generating: "Generating...",
  generate: "Generate story",
  limitHelp: "Daily AI story limits include both new stories and continuations and reset at midnight Japan time. Logging in is required to publish or save permanently.",
  customTooLong: "Keep story preferences within 500 characters.",
  translationTooLong: "Keep translation preferences within 300 characters.",
  generationFailed: "Could not generate the AI story.",
  generationError: "An error occurred while generating the AI story.",
  scenes: { 通勤: "Commute", 休憩: "Break", 睡眠導入: "Before sleep", 作業前: "Before work", その他: "Other" },
  genres: { ホラー: "Horror", コメディ: "Comedy", 恋愛: "Romance", SF: "Sci-fi", ミステリー: "Mystery", ファンタジー: "Fantasy", 癒し: "Comforting" },
  levels: { starter: "Starter", beginner: "Beginner", intermediate: "Intermediate", advanced: "Advanced" },
} satisfies GenerateDictionary;

const ko = {
  title: "읽을 시간에 맞춰 AI 이야기 만들기",
  description: "읽을 시간, 상황, 장르를 선택하면 바로 읽을 수 있는 짧은 이야기를 생성합니다. 생성 후 Reader로 이동하며, 따로 저장하지 않으면 결과는 이 브라우저의 임시 데이터로만 유지됩니다.",
  time: "읽을 시간",
  minutes: (value: number) => `${value}분`,
  scene: "상황",
  genre: "장르",
  learningTitle: "언어 학습용 대역 (선택)",
  learningLanguage: "학습할 언어",
  none: "지정 안 함",
  difficulty: "번역 난이도",
  learningHelp: "선택한 언어로 대역을 만들 때 내용을 생략하지 않고 어휘, 문법, 문장 길이를 선택한 난이도에 맞춥니다.",
  translationRequest: "대역 번역 요청 (선택)",
  translationPlaceholder: "예: 한국어 초급 문법을 중심으로 하고 자연스러운 경우 해요체를 사용해 주세요.",
  chars: "자",
  customRequest: "이야기 추가 요청 (선택)",
  customHelp: "등장인물, 배경, 전개, 결말, 문체 등 원하는 내용을 자유롭게 입력할 수 있습니다.",
  customPlaceholder: "예: 비 오는 밤의 무인역을 배경으로 하고 마지막에는 약간의 희망이 남게 해 주세요.",
  generating: "생성 중...",
  generate: "이야기 만들기",
  limitHelp: "AI 이야기 생성 한도는 신규와 이어쓰기를 합산하며 매일 일본 시간 0시에 초기화됩니다. 공개 게시와 영구 저장에는 로그인이 필요합니다.",
  customTooLong: "이야기 추가 요청은 500자 이내로 입력하세요.",
  translationTooLong: "대역 번역 요청은 300자 이내로 입력하세요.",
  generationFailed: "AI 이야기를 생성하지 못했습니다.",
  generationError: "AI 이야기 생성 중 오류가 발생했습니다.",
  scenes: { 通勤: "이동 중", 休憩: "휴식", 睡眠導入: "잠들기 전", 作業前: "작업 전", その他: "기타" },
  genres: { ホラー: "호러", コメディ: "코미디", 恋愛: "로맨스", SF: "SF", ミステリー: "미스터리", ファンタジー: "판타지", 癒し: "힐링" },
  levels: { starter: "입문", beginner: "초급", intermediate: "중급", advanced: "고급" },
} satisfies GenerateDictionary;

export const generateDictionaries: Record<UiLocale, GenerateDictionary> = { ja, en, ko };

export function getLearningLevelLabel(locale: UiLocale, level: TranslationLearningLevel): string {
  return generateDictionaries[locale].levels[level];
}
