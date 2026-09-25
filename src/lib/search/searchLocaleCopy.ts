import type { UiLocale } from "@/i18n/config";
import type { SavedFilterKey } from "@/lib/searchSavedFilters";

type SearchControlCopy = {
  title: string;
  description: string;
  placeholder: string;
  filterHint: string;
  clear: string;
  genre: string;
  tag: string;
  close: string;
  showMore: string;
  popular: string;
  updated: string;
  search: string;
  genreLimit: string;
};

export const publicSearchControlCopy: Record<UiLocale, SearchControlCopy> = {
  ja: {
    title: "公開作品を探す",
    description: "公開されている作品を、タグやジャンル、公開時期などから絞り込めます。",
    placeholder: "作品名、作者名、あらすじなどで検索",
    filterHint: "ジャンル / タグで絞る（左に表示されてるものほど強く参照される）",
    clear: "条件をクリア",
    genre: "ジャンル",
    tag: "タグ",
    close: "閉じる",
    showMore: "続きを表示",
    popular: "人気順",
    updated: "更新順",
    search: "検索する",
    genreLimit: "ジャンルは3つまで選択可能です",
  },
  en: {
    title: "Explore public works",
    description: "Filter public works by tags, genres, publication period, and more.",
    placeholder: "Search by title, author, or synopsis",
    filterHint: "Filter by genre / tag",
    clear: "Clear filters",
    genre: "Genre",
    tag: "Tag",
    close: "Close",
    showMore: "Show more",
    popular: "Popular",
    updated: "Recently updated",
    search: "Search",
    genreLimit: "You can select up to 3 genres.",
  },
  ko: {
    title: "공개 작품 찾기",
    description: "태그, 장르, 공개 기간 등으로 공개 작품을 좁혀 볼 수 있습니다.",
    placeholder: "작품명, 작가명, 줄거리 등으로 검색",
    filterHint: "장르 / 태그로 필터",
    clear: "조건 초기화",
    genre: "장르",
    tag: "태그",
    close: "닫기",
    showMore: "더 보기",
    popular: "인기순",
    updated: "업데이트순",
    search: "검색",
    genreLimit: "장르는 최대 3개까지 선택할 수 있습니다.",
  },
};

const savedFilterCopy: Record<UiLocale, Record<SavedFilterKey, string>> = {
  ja: {
    "bookmarked-works": "ブックマーク作品",
    "followed-authors": "フォローした作者",
    "liked-authors": "いいねした作者",
    "liked-works": "いいねした作品",
    "liked-readers": "いいねした朗読",
  },
  en: {
    "bookmarked-works": "Bookmarked works",
    "followed-authors": "Followed authors",
    "liked-authors": "Liked authors",
    "liked-works": "Liked works",
    "liked-readers": "Liked narrations",
  },
  ko: {
    "bookmarked-works": "북마크 작품",
    "followed-authors": "팔로우한 작가",
    "liked-authors": "좋아요한 작가",
    "liked-works": "좋아요한 작품",
    "liked-readers": "좋아요한 낭독",
  },
};

export function getLocalizedSavedFilterLabel(
  value: SavedFilterKey,
  locale: UiLocale
): string {
  return savedFilterCopy[locale][value];
}

const exactCopy: Record<Exclude<UiLocale, "ja">, Record<string, string>> = {
  en: {
    "公開検索": "Public search",
    "検索棚": "Search shelves",
    "総合人気順": "Overall popularity",
    "新着更新順": "Latest updates",
    "週間新作おすすめ順": "Weekly new works",
    "朗読視聴人気順": "Narration popularity",
    "上の棚は作品を見つけるための入口。今の条件に一致した作品一覧は下でまとめて確認できる。": "Use the shelves above to discover works. Works matching the current conditions are listed below.",
    "日間": "Daily",
    "週間": "Weekly",
    "月間": "Monthly",
    "四半期": "Quarterly",
    "年間": "Yearly",
    "累計": "All time",
    "直近1日で獲得した人気値順で表示。": "Ordered by popularity earned in the last day.",
    "直近7日で獲得した人気値順で表示。": "Ordered by popularity earned in the last 7 days.",
    "直近30日で獲得した人気値順で表示。": "Ordered by popularity earned in the last 30 days.",
    "直近90日で獲得した人気値順で表示。": "Ordered by popularity earned in the last 90 days.",
    "直近365日で獲得した人気値順で表示。": "Ordered by popularity earned in the last 365 days.",
    "全期間の人気値順で表示。": "Ordered by all-time popularity.",
    "直近1日で再生された朗読視聴数順で表示。": "Ordered by narration plays in the last day.",
    "直近7日で再生された朗読視聴数順で表示。": "Ordered by narration plays in the last 7 days.",
    "直近30日で再生された朗読視聴数順で表示。": "Ordered by narration plays in the last 30 days.",
    "直近90日で再生された朗読視聴数順で表示。": "Ordered by narration plays in the last 90 days.",
    "直近365日で再生された朗読視聴数順で表示。": "Ordered by narration plays in the last 365 days.",
    "全期間の朗読視聴数順で表示。": "Ordered by all-time narration plays.",
    "もっと見る": "View more",
    "条件に合う公開作品がない。": "No public works match these conditions.",
    "条件に合う公開作品がない": "No public works match these conditions",
    "更新順": "Recently updated",
    "暫定人気順": "Provisional popularity",
    "この条件に一致するジャンル別作品はまだありません。下の検索結果から公開作品を確認できます。": "There are no genre shelf results for these conditions yet. Check the search results below.",
    "直近7日で初公開されたジャンル別作品はまだありません。下の検索結果から公開作品を確認できます。": "There are no genre shelf results first published in the last 7 days. Check the search results below.",
    "この期間に朗読再生された公開作品がまだない。": "No public works have narration plays in this period yet.",
    "検索結果": "Search results",
    "今の条件に一致した作品を一覧で確認できる。条件を少し緩めると見つけやすくなる。": "Works matching the current conditions are listed here. Relaxing a condition may show more results.",
    "まずは気になる棚から見て、必要なら条件を足して絞り込める。": "Browse a shelf first, then add filters if you want to narrow the results.",
    "まだ公開作品がない。": "There are no public works yet.",
    "この保存一覧を見るにはログインが必要": "Sign in to view this saved list",
    "マイページから一覧ボタンを押して来た場合は、ログイン状態を確認してから開き直して。": "If you opened this list from My Page, check that you are signed in and open it again.",
    "ジャンルやタグを少し減らすか、期間を広げると見つかりやすい。": "Try fewer genres or tags, or widen the date range.",
    "期間を標準に戻す": "Reset period",
    "条件をクリア": "Clear filters",
    "指定期間人気値": "Period popularity",
    "人気値": "Popularity",
    "TOPへ戻る": "Back to home",
    "トップの一覧へ戻る": "Back to home list",
    "検索条件へ戻る": "Back to filters",
    "前へ": "Previous",
    "次へ": "Next",
    "広告掲載予定": "Ad space",
    "検索棚と検索結果一覧のあいだにだけ広告枠を置く。作品カード列や絞り込み操作の近くには寄せず、誤タップを避ける。": "Ad space between the search shelves and results, kept away from work cards and filter controls.",
    "ブックマーク作品": "Bookmarked works",
    "フォローした作者": "Followed authors",
    "いいねした作者": "Liked authors",
    "いいねした作品": "Liked works",
    "いいねした朗読": "Liked narrations",
    "期間閲覧": "Period views",
    "/ 期間いいね": "/ Period likes",
    "/ 期間ブックマーク": "/ Period bookmarks",
    "/ 人気値": "/ Popularity",
    "更新": "Updated",
    "/ いいね": "/ Likes",
    "/ ブックマーク": "/ Bookmarks",
    "閲覧": "Views",
    "期間再生": "Period plays",
    "/ 期間閲覧": "/ Period views",
    "累計再生": "Total plays",
    "指定期間再生": "Period plays",
  },
  ko: {
    "公開検索": "공개 검색",
    "検索棚": "검색 모음",
    "総合人気順": "종합 인기순",
    "新着更新順": "최신 업데이트순",
    "週間新作おすすめ順": "주간 신작 추천순",
    "朗読視聴人気順": "낭독 인기순",
    "上の棚は作品を見つけるための入口。今の条件に一致した作品一覧は下でまとめて確認できる。": "위 검색 모음에서 작품을 찾고, 현재 조건에 맞는 작품은 아래 목록에서 확인할 수 있습니다.",
    "日間": "일간",
    "週間": "주간",
    "月間": "월간",
    "四半期": "분기",
    "年間": "연간",
    "累計": "누적",
    "直近1日で獲得した人気値順で表示。": "최근 1일 동안 얻은 인기 점수순으로 표시합니다.",
    "直近7日で獲得した人気値順で表示。": "최근 7일 동안 얻은 인기 점수순으로 표시합니다.",
    "直近30日で獲得した人気値順で表示。": "최근 30일 동안 얻은 인기 점수순으로 표시합니다.",
    "直近90日で獲得した人気値順で表示。": "최근 90일 동안 얻은 인기 점수순으로 표시합니다.",
    "直近365日で獲得した人気値順で表示。": "최근 365일 동안 얻은 인기 점수순으로 표시합니다.",
    "全期間の人気値順で表示。": "전체 기간 인기 점수순으로 표시합니다.",
    "直近1日で再生された朗読視聴数順で表示。": "최근 1일 낭독 재생 수순으로 표시합니다.",
    "直近7日で再生された朗読視聴数順で表示。": "최근 7일 낭독 재생 수순으로 표시합니다.",
    "直近30日で再生された朗読視聴数順で表示。": "최근 30일 낭독 재생 수순으로 표시합니다.",
    "直近90日で再生された朗読視聴数順で表示。": "최근 90일 낭독 재생 수순으로 표시합니다.",
    "直近365日で再生された朗読視聴数順で表示。": "최근 365일 낭독 재생 수순으로 표시합니다.",
    "全期間の朗読視聴数順で表示。": "전체 기간 낭독 재생 수순으로 표시합니다.",
    "もっと見る": "더 보기",
    "条件に合う公開作品がない。": "조건에 맞는 공개 작품이 없습니다.",
    "条件に合う公開作品がない": "조건에 맞는 공개 작품이 없습니다",
    "更新順": "업데이트순",
    "暫定人気順": "임시 인기순",
    "この条件に一致するジャンル別作品はまだありません。下の検索結果から公開作品を確認できます。": "이 조건에 맞는 장르별 작품이 아직 없습니다. 아래 검색 결과에서 공개 작품을 확인할 수 있습니다.",
    "直近7日で初公開されたジャンル別作品はまだありません。下の検索結果から公開作品を確認できます。": "최근 7일 안에 처음 공개된 장르별 작품이 아직 없습니다. 아래 검색 결과에서 확인할 수 있습니다.",
    "この期間に朗読再生された公開作品がまだない。": "이 기간에 낭독이 재생된 공개 작품이 아직 없습니다.",
    "検索結果": "검색 결과",
    "今の条件に一致した作品を一覧で確認できる。条件を少し緩めると見つけやすくなる。": "현재 조건에 맞는 작품을 목록으로 확인할 수 있습니다. 조건을 조금 완화하면 더 쉽게 찾을 수 있습니다.",
    "まずは気になる棚から見て、必要なら条件を足して絞り込める。": "먼저 관심 있는 모음을 보고, 필요하면 조건을 추가해 결과를 좁힐 수 있습니다.",
    "まだ公開作品がない。": "아직 공개 작품이 없습니다.",
    "この保存一覧を見るにはログインが必要": "이 저장 목록을 보려면 로그인해야 합니다",
    "マイページから一覧ボタンを押して来た場合は、ログイン状態を確認してから開き直して。": "마이페이지에서 이 목록을 열었다면 로그인 상태를 확인한 뒤 다시 열어 주세요.",
    "ジャンルやタグを少し減らすか、期間を広げると見つかりやすい。": "장르나 태그를 줄이거나 기간을 넓히면 작품을 찾기 쉽습니다.",
    "期間を標準に戻す": "기간 초기화",
    "条件をクリア": "조건 초기화",
    "指定期間人気値": "기간 인기 점수",
    "人気値": "인기 점수",
    "TOPへ戻る": "홈으로 돌아가기",
    "トップの一覧へ戻る": "홈 목록으로 돌아가기",
    "検索条件へ戻る": "검색 조건으로 돌아가기",
    "前へ": "이전",
    "次へ": "다음",
    "広告掲載予定": "광고 영역",
    "検索棚と検索結果一覧のあいだにだけ広告枠を置く。作品カード列や絞り込み操作の近くには寄せず、誤タップを避ける。": "검색 모음과 결과 사이에 배치되는 광고 영역입니다.",
    "ブックマーク作品": "북마크 작품",
    "フォローした作者": "팔로우한 작가",
    "いいねした作者": "좋아요한 작가",
    "いいねした作品": "좋아요한 작품",
    "いいねした朗読": "좋아요한 낭독",
    "期間閲覧": "기간 조회",
    "/ 期間いいね": "/ 기간 좋아요",
    "/ 期間ブックマーク": "/ 기간 북마크",
    "/ 人気値": "/ 인기 점수",
    "更新": "업데이트",
    "/ いいね": "/ 좋아요",
    "/ ブックマーク": "/ 북마크",
    "閲覧": "조회",
    "期間再生": "기간 재생",
    "/ 期間閲覧": "/ 기간 조회",
    "累計再生": "누적 재생",
    "指定期間再生": "기간 재생",
  },
};

function preserveOuterWhitespace(original: string, translated: string): string {
  const leading = original.match(/^\s*/u)?.[0] ?? "";
  const trailing = original.match(/\s*$/u)?.[0] ?? "";
  return `${leading}${translated}${trailing}`;
}

export function localizeLegacySearchText(value: string, locale: UiLocale): string {
  if (locale === "ja") return value;

  const text = value.trim();
  if (!text) return value;

  const exact = exactCopy[locale][text];
  if (exact) return preserveOuterWhitespace(value, exact);

  const countMatch = text.match(/^(\d+)件$/u);
  if (countMatch) {
    const count = Number(countMatch[1]);
    const translated =
      locale === "en"
        ? `${count} ${count === 1 ? "work" : "works"}`
        : `${count}개 작품`;
    return preserveOuterWhitespace(value, translated);
  }

  const currentShelfMatch = text.match(/^現在表示:\s*(.+)$/u);
  if (currentShelfMatch) {
    const label = localizeLegacySearchText(currentShelfMatch[1], locale).trim();
    return preserveOuterWhitespace(
      value,
      locale === "en" ? `Current shelf: ${label}` : `현재 표시: ${label}`
    );
  }

  const savedListMatch = text.match(/^(.+) の一覧$/u);
  if (savedListMatch) {
    const label = localizeLegacySearchText(savedListMatch[1], locale).trim();
    return preserveOuterWhitespace(
      value,
      locale === "en" ? `${label} list` : `${label} 목록`
    );
  }

  const savedPeriodMatch = text.match(
    /^保存条件:\s*(.+?)\s*\/\s*指定期間:\s*(.+?)\s*\/\s*並び順:\s*(.+)$/u
  );
  if (savedPeriodMatch) {
    const saved = localizeLegacySearchText(savedPeriodMatch[1], locale).trim();
    const period = savedPeriodMatch[2];
    const order = localizeLegacySearchText(savedPeriodMatch[3], locale).trim();
    const translated =
      locale === "en"
        ? `Saved: ${saved} / Period: ${period} / Order: ${order}`
        : `저장 조건: ${saved} / 기간: ${period} / 정렬: ${order}`;
    return preserveOuterWhitespace(value, translated);
  }

  const periodMatch = text.match(/^指定期間:\s*(.+?)\s*\/\s*並び順:\s*(.+)$/u);
  if (periodMatch) {
    const order = localizeLegacySearchText(periodMatch[2], locale).trim();
    const translated =
      locale === "en"
        ? `Period: ${periodMatch[1]} / Order: ${order}`
        : `기간: ${periodMatch[1]} / 정렬: ${order}`;
    return preserveOuterWhitespace(value, translated);
  }

  const updatedGenreMatch = text.match(/^公開中の (.+) 作品を更新順で表示。$/u);
  if (updatedGenreMatch) {
    return preserveOuterWhitespace(
      value,
      locale === "en"
        ? `Showing public ${updatedGenreMatch[1]} works by latest update.`
        : `공개 중인 ${updatedGenreMatch[1]} 작품을 업데이트순으로 표시합니다.`
    );
  }

  const weeklyGenreMatch = text.match(
    /^直近7日で初公開された (.+) 作品を暫定人気順で表示。$/u
  );
  if (weeklyGenreMatch) {
    return preserveOuterWhitespace(
      value,
      locale === "en"
        ? `Showing ${weeklyGenreMatch[1]} works first published in the last 7 days by provisional popularity.`
        : `최근 7일 안에 처음 공개된 ${weeklyGenreMatch[1]} 작품을 임시 인기순으로 표시합니다.`
    );
  }

  const genreEmptyMatch = text.match(/^(.+) の公開作品はまだない。$/u);
  if (genreEmptyMatch) {
    return preserveOuterWhitespace(
      value,
      locale === "en"
        ? `There are no public ${genreEmptyMatch[1]} works yet.`
        : `${genreEmptyMatch[1]} 공개 작품이 아직 없습니다.`
    );
  }

  return value;
}
