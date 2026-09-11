"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import type { UiLocale } from "./config";
import { isReaderPath, localizePath } from "./navigation";

const EN: Record<string, string> = {
  "無料枠あり": "Free tier available",
  "個人本棚 / 多言語対訳 / 読み上げ / AI生成": "Personal library / bilingual reading / read-aloud / AI generation",
  "読む、聴く、学ぶ。": "Read. Listen. Learn.",
  "外国語の長編を、自分の本棚で読み続ける。多言語対訳、読み上げ、AI物語、Web小説にも対応。": "Keep reading long-form stories in another language in your own library. Bilingual text, read-aloud, AI stories and web novels are all supported.",
  "PDF・EPUB・TXT・DOCXを作品単位で取り込み、章・話ごとの読書位置、対訳、栞を管理できます。公開作品を読む・聴く・投稿する機能と、時間に合わせたAI物語生成も同じ場所で利用できます。": "Import PDF, EPUB, TXT or DOCX files and keep reading position, bilingual text and bookmarks by work and chapter. Read, listen to and publish public works, or generate AI stories for the time you have.",
  "物語を生成する": "Generate a story",
  "個人本棚を開く": "Open My Library",
  "作品を探す": "Explore works",
  "作品を投稿する": "Create / publish a work",
  "作品を朗読する": "Create narration",
  "目次": "Contents",
  "LIB read の特徴": "About LIB read",
  "月額680円サブスク": "¥680 monthly subscription",
  "ブックマーク更新": "Bookmark updates",
  "新着更新": "Latest updates",
  "週間新作おすすめ": "Weekly new picks",
  "総合人気順": "Overall popular",
  "朗読視聴人気順": "Narration popularity",
  "月額680円で、長編の対訳を止めずに読む。": "Read long-form bilingual text without interruption for ¥680/month.",
  "無料版との違いを見る": "Compare with the free tier",
  "長編を読む・聴く・作る・学ぶための機能を、作品単位で管理する。": "Manage reading, listening, creation and learning tools around each work.",
  "個人本棚": "Personal library",
  "多言語対訳": "Multilingual bilingual reading",
  "読み上げ・栞": "Read-aloud & bookmarks",
  "AI物語・投稿": "AI stories & publishing",
  "最近更新された公開作品。": "Recently updated public works.",
  "新しめの作品から入りやすくする。": "Discover recently published works.",
  "現時点の人気寄り順で公開作品を表示。": "Public works ordered by current popularity.",
  "朗読視聴寄りの順で公開作品を表示。": "Public works ordered by narration activity.",
  "さらに表示": "Show more",
  "条件に合う公開作品がない。": "No public works match these conditions.",
  "公開検索": "Public search",
  "公開作品を探す": "Explore public works",
  "公開されている作品を、タグやジャンル、公開時期などから絞り込めます。": "Filter public works by tags, genres, publication period and more.",
  "ジャンル / タグで絞る（左に表示されてるものほど強く参照される）": "Filter by genre / tag (items further left are referenced more strongly)",
  "条件をクリア": "Clear filters",
  "ジャンル": "Genre",
  "タグ": "Tags",
  "続きを表示": "Show more",
  "閉じる": "Show less",
  "人気順": "Popularity",
  "更新順": "Recently updated",
  "検索する": "Search",
  "検索棚": "Discovery shelves",
  "新着更新順": "Latest updates",
  "週間新作おすすめ順": "Weekly new picks",
  "上の棚は作品を見つけるための入口。今の条件に一致した作品一覧は下でまとめて確認できる。": "Use the shelves above to discover works. The complete list matching the current filters appears below.",
  "日間": "Daily",
  "週間": "Weekly",
  "月間": "Monthly",
  "四半期": "Quarterly",
  "年間": "Yearly",
  "累計": "All time",
  "もっと見る": "View more",
  "検索結果": "Search results",
  "作品詳細": "Work details",
  "読み始める": "Start reading",
  "ファンタジー": "Fantasy",
  "恋愛": "Romance",
  "ホラー": "Horror",
  "コメディ": "Comedy",
  "ミステリー": "Mystery",
  "癒し": "Comfort",
  "異世界": "Isekai",
  "現代": "Contemporary",
  "歴史": "Historical",
  "冒険": "Adventure",
  "青春": "Coming of age",
  "投稿データベース": "Work workspace",
  "公開前の下書きから公開中の作品まで、投稿作品をまとめて管理する。": "Manage drafts and published works in one workspace.",
  "新しい作品を作る": "Create a new work",
  "マイページへ": "My Page",
  "作品一覧": "My works",
  "まだ作品がない。上のボタンから新しい作品を作成できる。": "You do not have any works yet. Create one with the button above.",
  "非公開": "Private",
  "公開": "Public",
  "公開準備": "Preparing to publish",
  "朗読許可": "Narration allowed",
  "朗読不可": "Narration unavailable",
  "朗読ページ": "Narration",
  "朗読管理トップ": "Narration dashboard",
  "朗読作品の検索、投稿済み朗読、ブックマーク作品、朗読状況をここでまとめて管理する。": "Search works for narration and manage published narrations, bookmarks and request status in one place.",
  "検索": "Search",
  "投稿朗読作品": "Published narrations",
  "ブックマーク作品": "Bookmarked works",
  "朗読状況": "Narration status",
  "すべて": "All",
  "投稿済": "Published",
  "朗読可": "Narration available",
  "ブックマーク": "Bookmark",
  "朗読制作へ": "Create narration",
  "作品ページへ": "Open work",
  "作品ページ": "Work page",
  "制作開始": "Start creating",
  "申請ページ": "Request page",
  "申請メッセージは未入力。": "No request message was entered.",
  "設定": "Settings",
  "一覧を見る": "View all",
};

const KO: Record<string, string> = {
  "無料枠あり": "무료 이용 가능",
  "個人本棚 / 多言語対訳 / 読み上げ / AI生成": "개인 서재 / 다국어 대역 / 읽어주기 / AI 생성",
  "読む、聴く、学ぶ。": "읽고, 듣고, 배우기.",
  "外国語の長編を、自分の本棚で読み続ける。多言語対訳、読み上げ、AI物語、Web小説にも対応。": "개인 서재에서 장편 외국어 작품을 이어 읽고, 다국어 대역·읽어주기·AI 이야기·웹소설을 함께 이용할 수 있습니다.",
  "PDF・EPUB・TXT・DOCXを作品単位で取り込み、章・話ごとの読書位置、対訳、栞を管理できます。公開作品を読む・聴く・投稿する機能と、時間に合わせたAI物語生成も同じ場所で利用できます。": "PDF, EPUB, TXT, DOCX를 작품 단위로 가져와 장·화별 읽던 위치, 대역, 책갈피를 관리할 수 있습니다. 공개 작품을 읽고 듣고 게시하거나 시간에 맞는 AI 이야기를 만들 수도 있습니다.",
  "物語を生成する": "AI 이야기 만들기",
  "個人本棚を開く": "개인 서재 열기",
  "作品を探す": "작품 찾기",
  "作品を投稿する": "작품 제작·게시",
  "作品を朗読する": "낭독 제작",
  "目次": "목차",
  "LIB read の特徴": "LIB read 특징",
  "月額680円サブスク": "월 ¥680 구독",
  "ブックマーク更新": "책갈피 작품 업데이트",
  "新着更新": "최근 업데이트",
  "週間新作おすすめ": "주간 신작 추천",
  "総合人気順": "종합 인기순",
  "朗読視聴人気順": "낭독 인기순",
  "月額680円で、長編の対訳を止めずに読む。": "월 ¥680으로 장편 대역을 끊김 없이 읽기.",
  "無料版との違いを見る": "무료 버전과 비교",
  "長編を読む・聴く・作る・学ぶための機能を、作品単位で管理する。": "장편을 읽고 듣고 만들고 학습하는 기능을 작품 단위로 관리합니다.",
  "個人本棚": "개인 서재",
  "多言語対訳": "다국어 대역",
  "読み上げ・栞": "읽어주기·책갈피",
  "AI物語・投稿": "AI 이야기·게시",
  "最近更新された公開作品。": "최근 업데이트된 공개 작품입니다.",
  "新しめの作品から入りやすくする。": "최근 공개된 작품을 발견합니다.",
  "現時点の人気寄り順で公開作品を表示。": "현재 인기순으로 공개 작품을 표시합니다.",
  "朗読視聴寄りの順で公開作品を表示。": "낭독 시청 활동순으로 공개 작품을 표시합니다.",
  "さらに表示": "더 보기",
  "条件に合う公開作品がない。": "조건에 맞는 공개 작품이 없습니다.",
  "公開検索": "공개 검색",
  "公開作品を探す": "공개 작품 찾기",
  "公開されている作品を、タグやジャンル、公開時期などから絞り込めます。": "공개 작품을 태그, 장르, 공개 시기 등으로 필터링할 수 있습니다.",
  "ジャンル / タグで絞る（左に表示されてるものほど強く参照される）": "장르 / 태그로 필터링 (왼쪽 항목일수록 우선 참조)",
  "条件をクリア": "조건 초기화",
  "ジャンル": "장르",
  "タグ": "태그",
  "続きを表示": "더 보기",
  "閉じる": "접기",
  "人気順": "인기순",
  "更新順": "업데이트순",
  "検索する": "검색",
  "検索棚": "탐색 선반",
  "新着更新順": "최근 업데이트순",
  "週間新作おすすめ順": "주간 신작 추천순",
  "上の棚は作品を見つけるための入口。今の条件に一致した作品一覧は下でまとめて確認できる。": "위 선반에서 작품을 발견하고 현재 조건과 일치하는 전체 목록은 아래에서 확인할 수 있습니다.",
  "日間": "일간",
  "週間": "주간",
  "月間": "월간",
  "四半期": "분기",
  "年間": "연간",
  "累計": "누적",
  "もっと見る": "더 보기",
  "検索結果": "검색 결과",
  "作品詳細": "작품 상세",
  "読み始める": "읽기 시작",
  "ファンタジー": "판타지",
  "恋愛": "로맨스",
  "ホラー": "호러",
  "コメディ": "코미디",
  "ミステリー": "미스터리",
  "癒し": "힐링",
  "異世界": "이세계",
  "現代": "현대",
  "歴史": "역사",
  "冒険": "모험",
  "青春": "청춘",
  "投稿データベース": "작품 워크스페이스",
  "公開前の下書きから公開中の作品まで、投稿作品をまとめて管理する。": "초안부터 공개 중인 작품까지 한 워크스페이스에서 관리합니다.",
  "新しい作品を作る": "새 작품 만들기",
  "マイページへ": "마이페이지",
  "作品一覧": "내 작품",
  "まだ作品がない。上のボタンから新しい作品を作成できる。": "아직 작품이 없습니다. 위 버튼에서 새 작품을 만들 수 있습니다.",
  "非公開": "비공개",
  "公開": "공개",
  "公開準備": "공개 준비",
  "朗読許可": "낭독 허용",
  "朗読不可": "낭독 불가",
  "朗読ページ": "낭독",
  "朗読管理トップ": "낭독 관리",
  "朗読作品の検索、投稿済み朗読、ブックマーク作品、朗読状況をここでまとめて管理する。": "낭독 작품 검색, 게시한 낭독, 책갈피 작품, 낭독 상태를 한곳에서 관리합니다.",
  "検索": "검색",
  "投稿朗読作品": "게시한 낭독",
  "ブックマーク作品": "책갈피 작품",
  "朗読状況": "낭독 상태",
  "すべて": "전체",
  "投稿済": "게시 완료",
  "朗読可": "낭독 가능",
  "ブックマーク": "책갈피",
  "朗読制作へ": "낭독 제작",
  "作品ページへ": "작품 페이지",
  "作品ページ": "작품 페이지",
  "制作開始": "제작 시작",
  "申請ページ": "신청 페이지",
  "申請メッセージは未入力。": "신청 메시지가 없습니다.",
  "設定": "설정",
  "一覧を見る": "전체 보기",
};

const PLACEHOLDER: Record<"en" | "ko", Record<string, string>> = {
  en: { "作品名、作者名、あらすじなどで検索": "Search by title, author, synopsis and more" },
  ko: { "作品名、作者名、あらすじなどで検索": "제목, 작가, 줄거리 등으로 검색" },
};

const LEGAL_JA_ONLY = new Set(["/terms", "/privacy", "/commercial-transactions"]);

function normalized(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function translateDynamic(value: string, locale: "en" | "ko"): string | null {
  const episodes = value.match(/^(\d+)話$/);
  if (episodes) return locale === "en" ? `${episodes[1]} episodes` : `${episodes[1]}화`;
  const requestAt = value.match(/^直近申請日時: (.+)$/);
  if (requestAt) return locale === "en" ? `Latest request: ${requestAt[1]}` : `최근 신청: ${requestAt[1]}`;
  return null;
}

function restyleDisclosureButtons(root: ParentNode) {
  root.querySelectorAll("button").forEach((element) => {
    if (!(element instanceof HTMLButtonElement)) return;
    const value = normalized(element.textContent ?? "");
    if (!["続きを表示", "閉じる", "Show more", "Show less", "더 보기", "접기"].includes(value)) return;
    element.className = "mt-2 text-xs text-neutral-500 underline decoration-black/20 underline-offset-4 transition hover:text-black";
    element.style.position = "static";
    element.style.boxShadow = "none";
  });
}

function localizeElement(root: ParentNode, locale: "en" | "ko") {
  const dictionary = locale === "en" ? EN : KO;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);

  for (const node of nodes) {
    const parent = node.parentElement;
    if (!parent || parent.closest("script, style, textarea, [data-no-ui-localize]") || parent.isContentEditable) continue;
    const value = normalized(node.data);
    if (!value) continue;
    const translated = dictionary[value] ?? translateDynamic(value, locale);
    if (!translated || translated === value) continue;
    const leading = node.data.match(/^\s*/)?.[0] ?? "";
    const trailing = node.data.match(/\s*$/)?.[0] ?? "";
    node.data = `${leading}${translated}${trailing}`;
  }

  root.querySelectorAll("input[placeholder]").forEach((element) => {
    if (!(element instanceof HTMLInputElement)) return;
    const translated = PLACEHOLDER[locale][element.placeholder];
    if (translated) element.placeholder = translated;
  });

  root.querySelectorAll("a[href]").forEach((element) => {
    if (!(element instanceof HTMLAnchorElement)) return;
    const rawHref = element.getAttribute("href") ?? "";
    if (!rawHref.startsWith("/") || rawHref.startsWith("//")) return;
    const pathOnly = rawHref.split(/[?#]/, 1)[0];
    if (LEGAL_JA_ONLY.has(pathOnly)) return;
    const nextHref = localizePath(rawHref, locale);
    if (nextHref !== rawHref) element.setAttribute("href", nextHref);
  });

  restyleDisclosureButtons(root);
}

export default function SiteUiLocaleBridge({ locale }: { locale: UiLocale }) {
  const pathname = usePathname();

  useEffect(() => {
    const reader = isReaderPath(pathname);
    const apply = () => {
      if (!reader && locale !== "ja") localizeElement(document.body, locale);
      restyleDisclosureButtons(document.body);
    };

    apply();
    let scheduled = false;
    const observer = new MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        apply();
      });
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: locale !== "ja" && !reader,
    });
    return () => observer.disconnect();
  }, [locale, pathname]);

  return null;
}
