import type { UiLocale } from "../config";

const ja = {
  title: "作品を探す",
  description: "公開作品をタイトル、あらすじ、作者名から検索できます。",
  placeholder: "タイトル・作者・キーワード",
  search: "検索",
  clear: "条件をクリア",
  results: "検索結果",
  allWorks: "公開作品",
  count: (count: number) => `${count}件`,
  empty: "条件に合う公開作品がありません。",
  episodes: (count: number) => `${count}話`,
  details: "作品詳細",
  startReading: "読み始める",
} as const;

type SearchDictionary = {
  [K in keyof typeof ja]: (typeof ja)[K] extends (...args: infer A) => string
    ? (...args: A) => string
    : string;
};

const en = {
  title: "Explore works",
  description: "Search public works by title, synopsis, author, tag, or genre.",
  placeholder: "Title, author, or keyword",
  search: "Search",
  clear: "Clear",
  results: "Search results",
  allWorks: "Public works",
  count: (count: number) => `${count} ${count === 1 ? "work" : "works"}`,
  empty: "No public works match these conditions.",
  episodes: (count: number) => `${count} ${count === 1 ? "episode" : "episodes"}`,
  details: "Work details",
  startReading: "Start reading",
} satisfies SearchDictionary;

const ko = {
  title: "작품 찾기",
  description: "공개 작품을 제목, 줄거리, 작가, 태그, 장르로 검색할 수 있습니다.",
  placeholder: "제목, 작가 또는 키워드",
  search: "검색",
  clear: "초기화",
  results: "검색 결과",
  allWorks: "공개 작품",
  count: (count: number) => `${count}개 작품`,
  empty: "조건에 맞는 공개 작품이 없습니다.",
  episodes: (count: number) => `${count}화`,
  details: "작품 상세",
  startReading: "읽기 시작",
} satisfies SearchDictionary;

export const searchDictionaries: Record<UiLocale, SearchDictionary> = { ja, en, ko };
export type { SearchDictionary };
