import type { UiLocale } from "../config";

const ja = {
  notFound: "作品が見つかりません",
  privateWork: "非公開作品",
  noEpisodes: "公開話なし",
  untitled: "無題",
  unknownAuthor: "作者名未設定",
  noSummary: "あらすじはまだ登録されていません。",
  synopsis: "あらすじ",
  contents: "目次",
  episodes: (count: number) => `${count}話`,
  episodeFallback: (number: number) => `第${number}話`,
  read: "読む",
  backSearch: "作品を探す",
  author: "作者",
  genres: "ジャンル",
  startReading: "最初から読む",
} as const;

type WorkDictionary = {
  [K in keyof typeof ja]: (typeof ja)[K] extends (...args: infer A) => string
    ? (...args: A) => string
    : string;
};

const en = {
  notFound: "Work not found",
  privateWork: "Private work",
  noEpisodes: "No public episodes",
  untitled: "Untitled",
  unknownAuthor: "Author unavailable",
  noSummary: "No synopsis has been added yet.",
  synopsis: "Synopsis",
  contents: "Contents",
  episodes: (count: number) => `${count} ${count === 1 ? "episode" : "episodes"}`,
  episodeFallback: (number: number) => `Episode ${number}`,
  read: "Read",
  backSearch: "Explore works",
  author: "Author",
  genres: "Genres",
  startReading: "Start from episode 1",
} satisfies WorkDictionary;

const ko = {
  notFound: "작품을 찾을 수 없습니다",
  privateWork: "비공개 작품",
  noEpisodes: "공개된 화가 없습니다",
  untitled: "제목 없음",
  unknownAuthor: "작가 정보 없음",
  noSummary: "아직 줄거리가 등록되지 않았습니다.",
  synopsis: "줄거리",
  contents: "목차",
  episodes: (count: number) => `${count}화`,
  episodeFallback: (number: number) => `${number}화`,
  read: "읽기",
  backSearch: "작품 찾기",
  author: "작가",
  genres: "장르",
  startReading: "첫 화부터 읽기",
} satisfies WorkDictionary;

export const workDictionaries: Record<UiLocale, WorkDictionary> = { ja, en, ko };
