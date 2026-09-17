"use client";

import { useLayoutEffect } from "react";
import type { UiLocale } from "./config";
import { stripUiLocalePrefix } from "./config";
import { localizePath } from "./navigation";

const JAPANESE_CANONICAL_PATHS = new Set([
  "/terms",
  "/privacy",
  "/commercial-transactions",
  "/record/terms",
]);

const EN: Record<string, string> = {
  "朗読作品を探す": "Find narration-ready works",
  "公開中の朗読関連作品を、検索語、ジャンル、タグ、期間、並び順、朗読向けフィルタで絞り込む。":
    "Filter public narration-related works by keyword, genre, tag, period, sort order, and narration status.",
  "ジャンル / タグで絞る（左に表示されてるものほど強く参照される）":
    "Filter by genre / tag (items shown further left are weighted more strongly)",
  "条件をクリア": "Clear filters",
  "朗読フィルタ": "Narration filter",
  "すべて": "All",
  "投稿済": "Submitted",
  "朗読可": "Available",
  "ジャンル": "Genre",
  "タグ": "Tags",
  "閉じる": "Collapse",
  "さらに表示": "Show more",
  "人気順": "Popular",
  "更新順": "Updated",
  "朗読視聴順": "Narration plays",
  "検索する": "Search",
  "ジャンルは3つまで選択可能": "You can select up to 3 genres.",
  "検索結果": "Search results",
  "公開中の朗読関連作品をまとめて見る。": "Browse public works related to narration.",
  "自分が朗読投稿済みの作品だけを見る。": "Show only works where you have submitted narration.",
  "今すぐ朗読制作へ進める作品だけを見る。": "Show only works available for narration now.",
  "自分が保存した作品だけを見る。": "Show only your bookmarked works.",
  "上の検索へ": "Back to search",
  "フィルタ:": "Filter:",
  "検索語:": "Query:",
  "タグ:": "Tags:",
  "ジャンル:": "Genre:",
  "並び順:": "Order:",
  "未入力": "None",
  "未指定": "None",
  "条件に合う朗読関連作品はない。": "No narration-related works match these filters.",
  "作品概要はまだ設定されていない。": "Work summary has not been added yet.",
  "無題": "Untitled",
  "朗読許可": "Narration allowed",
  "朗読不可": "Narration unavailable",
  "ブックマーク": "Bookmarked",
  "朗読視聴": "Narration plays",
  "閲覧": "Views",
  "/ 閲覧": "/ Views",
  "いいね": "Likes",
  "/ いいね": "/ Likes",
  "/ ブックマーク": "/ Bookmarks",
  "作品ページ": "Work page",
  "作品ページへ": "Work page",
  "朗読制作へ": "Create narration",
  "未使用": "Pending",
  "却下": "Rejected",
  "取消済み": "Cancelled",
  "未申請": "Not requested",
  "直近申請日時:": "Latest request:",
  "申請メッセージは未入力。": "No request message.",
  "制作開始": "Start creating",
  "申請ページ": "Request page",
  "朗読投稿規約": "Narration Posting Terms (Japanese)",
  "利用規約": "Terms (Japanese)",
  "プライバシーポリシー": "Privacy Policy (Japanese)",
  "お問い合わせ": "Contact",
};

const KO: Record<string, string> = {
  "朗読作品を探す": "낭독 가능한 작품 찾기",
  "公開中の朗読関連作品を、検索語、ジャンル、タグ、期間、並び順、朗読向けフィルタで絞り込む。":
    "공개 중인 낭독 관련 작품을 검색어, 장르, 태그, 기간, 정렬, 낭독 상태로 필터링합니다.",
  "ジャンル / タグで絞る（左に表示されてるものほど強く参照される）":
    "장르 / 태그로 필터링 (왼쪽 항목일수록 더 강하게 반영)",
  "条件をクリア": "조건 지우기",
  "朗読フィルタ": "낭독 필터",
  "すべて": "전체",
  "投稿済": "제출 완료",
  "朗読可": "낭독 가능",
  "ジャンル": "장르",
  "タグ": "태그",
  "閉じる": "접기",
  "さらに表示": "더 보기",
  "人気順": "인기순",
  "更新順": "업데이트순",
  "朗読視聴順": "낭독 재생순",
  "検索する": "검색",
  "ジャンルは3つまで選択可能": "장르는 최대 3개까지 선택할 수 있습니다.",
  "検索結果": "검색 결과",
  "公開中の朗読関連作品をまとめて見る。": "공개 중인 낭독 관련 작품을 모아 봅니다.",
  "自分が朗読投稿済みの作品だけを見る。": "내가 낭독을 제출한 작품만 봅니다.",
  "今すぐ朗読制作へ進める作品だけを見る。": "지금 낭독 제작을 시작할 수 있는 작품만 봅니다.",
  "自分が保存した作品だけを見る。": "내가 북마크한 작품만 봅니다.",
  "上の検索へ": "위 검색으로",
  "フィルタ:": "필터:",
  "検索語:": "검색어:",
  "タグ:": "태그:",
  "ジャンル:": "장르:",
  "並び順:": "정렬:",
  "未入力": "입력 없음",
  "未指定": "지정 안 함",
  "条件に合う朗読関連作品はない。": "조건에 맞는 낭독 관련 작품이 없습니다.",
  "作品概要はまだ設定されていない。": "작품 소개가 아직 설정되지 않았습니다.",
  "無題": "제목 없음",
  "朗読許可": "낭독 허용",
  "朗読不可": "낭독 불가",
  "ブックマーク": "북마크",
  "朗読視聴": "낭독 재생",
  "閲覧": "조회",
  "/ 閲覧": "/ 조회",
  "いいね": "좋아요",
  "/ いいね": "/ 좋아요",
  "/ ブックマーク": "/ 북마크",
  "作品ページ": "작품 페이지",
  "作品ページへ": "작품 페이지",
  "朗読制作へ": "낭독 만들기",
  "未使用": "대기 중",
  "却下": "거절",
  "取消済み": "취소됨",
  "未申請": "미신청",
  "直近申請日時:": "최근 신청 일시:",
  "申請メッセージは未入力。": "신청 메시지가 없습니다.",
  "制作開始": "제작 시작",
  "申請ページ": "신청 페이지",
  "朗読投稿規約": "낭독 게시 약관 (일본어)",
  "利用規約": "이용약관 (일본어)",
  "プライバシーポリシー": "개인정보 처리방침 (일본어)",
  "お問い合わせ": "문의",
};

const PLACEHOLDERS: Record<Exclude<UiLocale, "ja">, Record<string, string>> = {
  en: {
    "作品名、作者名、あらすじなどで検索": "Search by title, author, summary, and more",
  },
  ko: {
    "作品名、作者名、あらすじなどで検索": "작품명, 작가명, 줄거리 등으로 검색",
  },
};

function translateText(value: string, locale: Exclude<UiLocale, "ja">): string {
  const dictionary = locale === "en" ? EN : KO;
  const trimmed = value.trim();
  const translated = dictionary[trimmed];
  if (!translated) return value;
  const leading = value.match(/^\s*/)?.[0] ?? "";
  const trailing = value.match(/\s*$/)?.[0] ?? "";
  return `${leading}${translated}${trailing}`;
}

function localizeHref(value: string, locale: Exclude<UiLocale, "ja">): string {
  if (!value.startsWith("/") || value.startsWith("//")) return value;

  const url = new URL(value, "https://libread.local");
  const basePath = stripUiLocalePrefix(url.pathname);
  if (JAPANESE_CANONICAL_PATHS.has(basePath)) return `${basePath}${url.search}${url.hash}`;

  const localized = new URL(localizePath(`${url.pathname}${url.search}${url.hash}`, locale), "https://libread.local");
  const next = localized.searchParams.get("next");
  if (next?.startsWith("/") && !next.startsWith("//")) {
    localized.searchParams.set("next", localizePath(next, locale));
  }
  return `${localized.pathname}${localized.search}${localized.hash}`;
}

function setHrefIfChanged(anchor: HTMLAnchorElement | null, next: string) {
  if (!anchor) return;
  if (anchor.getAttribute("href") !== next) {
    anchor.setAttribute("href", next);
  }
}

function repairRecordNavigation(root: HTMLElement, locale: UiLocale) {
  setHrefIfChanged(
    root.querySelector<HTMLAnchorElement>('a[href="#record-submitted"]'),
    localizePath("/record?filter=submitted#record-search-results", locale)
  );

  setHrefIfChanged(
    root.querySelector<HTMLAnchorElement>('a[href="#record-bookmarked"]'),
    localizePath("/record?filter=bookmarked#record-search-results", locale)
  );

  const legacyRequests = root.querySelector<HTMLAnchorElement>('a[href="#record-requests"]');
  if (legacyRequests && !legacyRequests.hidden) {
    legacyRequests.hidden = true;
  }
}

function applyLocale(root: HTMLElement, locale: Exclude<UiLocale, "ja">) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);

  for (const node of nodes) {
    const parent = node.parentElement;
    if (!parent || ["SCRIPT", "STYLE", "TEXTAREA"].includes(parent.tagName)) continue;
    const translated = translateText(node.nodeValue ?? "", locale);
    if (translated !== node.nodeValue) node.nodeValue = translated;
  }

  for (const input of root.querySelectorAll<HTMLInputElement>("input[placeholder]")) {
    const next = PLACEHOLDERS[locale][input.placeholder];
    if (next) input.placeholder = next;
  }

  for (const anchor of root.querySelectorAll<HTMLAnchorElement>('a[href^="/"]')) {
    const raw = anchor.getAttribute("href");
    if (!raw) continue;
    const next = localizeHref(raw, locale);
    if (next !== raw) anchor.setAttribute("href", next);
  }
}

export default function RecordUiLocaleBridge({ locale }: { locale: UiLocale }) {
  useLayoutEffect(() => {
    if (stripUiLocalePrefix(window.location.pathname) !== "/record") return;

    const root = document.querySelector<HTMLElement>("main");
    if (!root) return;

    const run = () => {
      repairRecordNavigation(root, locale);
      if (locale !== "ja") applyLocale(root, locale);
    };
    run();

    const observer = new MutationObserver(run);
    observer.observe(root, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["href", "placeholder"],
    });

    return () => observer.disconnect();
  }, [locale]);

  return null;
}
