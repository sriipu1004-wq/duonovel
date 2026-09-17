import {
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { getUiLocale } from "@/i18n/server";
import { localizePath } from "@/i18n/navigation";
import type { UiLocale } from "@/i18n/config";
import RecordPortalPage from "../record/page";

type RecordPageProps = Parameters<typeof RecordPortalPage>[0];
type RecordElementProps = {
  children?: ReactNode;
  href?: string;
  className?: string;
};

const JAPANESE_CANONICAL_PATHS = new Set([
  "/terms",
  "/privacy",
  "/commercial-transactions",
  "/record/terms",
]);

const EXPANDABLE_SERVER_COMPONENTS = new Set([
  "SectionFrame",
  "RecordCatalogCard",
  "RequestStatusCard",
  "RecordingLegalFooter",
]);

const SOURCE_TEXT_CLASSES = new Set([
  "text-lg font-semibold text-black",
  "mt-3 whitespace-pre-wrap text-sm leading-7 text-neutral-700",
  "mt-2 whitespace-pre-wrap text-sm leading-7 text-neutral-700",
  "rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs text-violet-700",
  "rounded-full border border-black/10 bg-neutral-50 px-3 py-1 text-xs text-neutral-600",
]);

const LOCALIZABLE_SOURCE_FALLBACKS = new Set([
  "作品概要はまだ設定されていない。",
  "無題",
  "申請メッセージは未入力。",
]);

const EN: Record<string, string> = {
  "作品概要はまだ設定されていない。": "Work summary has not been added yet.",
  "無題": "Untitled",
  "朗読許可": "Narration allowed",
  "朗読不可": "Narration unavailable",
  "朗読可": "Available",
  "未使用": "Pending",
  "却下": "Rejected",
  "取消済み": "Cancelled",
  "未申請": "Not requested",
  "朗読制作へ": "Create narration",
  "作品ページへ": "Work page",
  "作品ページ": "Work page",
  "投稿済": "Submitted",
  "ブックマーク": "Bookmarked",
  "朗読視聴": "Narration plays",
  "/ 閲覧": "/ Views",
  "/ いいね": "/ Likes",
  "/ ブックマーク": "/ Bookmarks",
  "閲覧": "Views",
  "いいね": "Likes",
  "直近申請日時:": "Latest request:",
  "申請メッセージは未入力。": "No request message.",
  "未記録": "Not recorded",
  "制作開始": "Start creating",
  "申請ページ": "Request page",
  "朗読ページ": "Narration",
  "朗読管理トップ": "Narration dashboard",
  "朗読作品の検索、投稿済み朗読、ブックマーク作品、朗読状況をここでまとめて管理する。":
    "Manage narration-ready works, submitted narrations, bookmarks, and narration status in one place.",
  "検索": "Search",
  "投稿朗読作品": "Submitted narrations",
  "ブックマーク作品": "Bookmarked works",
  "朗読状況": "Narration status",
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
  "条件に合う朗読関連作品はない。": "No narration-related works match these filters.",
  "すべて": "All",
  "人気順": "Popular",
  "更新順": "Updated",
  "朗読視聴順": "Narration plays",
  "未入力": "None",
  "未指定": "None",
  "朗読投稿規約": "Narration Posting Terms (Japanese)",
  "利用規約": "Terms (Japanese)",
  "プライバシーポリシー": "Privacy Policy (Japanese)",
  "お問い合わせ": "Contact",
};

const KO: Record<string, string> = {
  "作品概要はまだ設定されていない。": "작품 소개가 아직 설정되지 않았습니다.",
  "無題": "제목 없음",
  "朗読許可": "낭독 허용",
  "朗読不可": "낭독 불가",
  "朗読可": "낭독 가능",
  "未使用": "대기 중",
  "却下": "거절",
  "取消済み": "취소됨",
  "未申請": "미신청",
  "朗読制作へ": "낭독 만들기",
  "作品ページへ": "작품 페이지",
  "作品ページ": "작품 페이지",
  "投稿済": "제출 완료",
  "ブックマーク": "북마크",
  "朗読視聴": "낭독 재생",
  "/ 閲覧": "/ 조회",
  "/ いいね": "/ 좋아요",
  "/ ブックマーク": "/ 북마크",
  "閲覧": "조회",
  "いいね": "좋아요",
  "直近申請日時:": "최근 신청 일시:",
  "申請メッセージは未入力。": "신청 메시지가 없습니다.",
  "未記録": "기록 없음",
  "制作開始": "제작 시작",
  "申請ページ": "신청 페이지",
  "朗読ページ": "낭독",
  "朗読管理トップ": "낭독 관리",
  "朗読作品の検索、投稿済み朗読、ブックマーク作品、朗読状況をここでまとめて管理する。":
    "낭독 가능한 작품, 제출한 낭독, 북마크, 낭독 상태를 한곳에서 관리합니다.",
  "検索": "검색",
  "投稿朗読作品": "제출한 낭독",
  "ブックマーク作品": "북마크 작품",
  "朗読状況": "낭독 상태",
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
  "条件に合う朗読関連作品はない。": "조건에 맞는 낭독 관련 작품이 없습니다.",
  "すべて": "전체",
  "人気順": "인기순",
  "更新順": "업데이트순",
  "朗読視聴順": "낭독 재생순",
  "未入力": "입력 없음",
  "未指定": "지정 안 함",
  "朗読投稿規約": "낭독 게시 약관 (일본어)",
  "利用規約": "이용약관 (일본어)",
  "プライバシーポリシー": "개인정보 처리방침 (일본어)",
  "お問い合わせ": "문의",
};

function translateText(value: string, locale: Exclude<UiLocale, "ja">): string {
  const dictionary = locale === "en" ? EN : KO;
  if (dictionary[value]) return dictionary[value];

  const trimmed = value.trim();
  const translated = dictionary[trimmed];
  if (!translated) return value;

  const leading = value.match(/^\s*/)?.[0] ?? "";
  const trailing = value.match(/\s*$/)?.[0] ?? "";
  return `${leading}${translated}${trailing}`;
}

function localizeSourceFallbacks(
  node: ReactNode,
  locale: Exclude<UiLocale, "ja">
): ReactNode {
  if (typeof node === "string") {
    return LOCALIZABLE_SOURCE_FALLBACKS.has(node.trim())
      ? translateText(node, locale)
      : node;
  }

  if (Array.isArray(node)) {
    return node.map((child) => localizeSourceFallbacks(child, locale));
  }

  return node;
}

function localizeNestedNext(href: string, locale: UiLocale): string {
  if (locale === "ja" || !href.startsWith("/") || href.startsWith("//")) {
    return href;
  }

  const original = new URL(href, "https://libread.local");
  if (JAPANESE_CANONICAL_PATHS.has(original.pathname)) {
    return `${original.pathname}${original.search}${original.hash}`;
  }

  const localized = localizePath(href, locale);
  if (!localized.startsWith("/")) return localized;

  const url = new URL(localized, "https://libread.local");
  const next = url.searchParams.get("next");
  if (next?.startsWith("/") && !next.startsWith("//")) {
    const nextUrl = new URL(next, "https://libread.local");
    if (!JAPANESE_CANONICAL_PATHS.has(nextUrl.pathname)) {
      url.searchParams.set("next", localizePath(next, locale));
    }
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

function renderKnownServerComponent(
  element: ReactElement<RecordElementProps>
): ReactNode | null {
  if (typeof element.type !== "function") return null;
  if (!EXPANDABLE_SERVER_COMPONENTS.has(element.type.name)) return null;

  const render = element.type as unknown as (props: RecordElementProps) => ReactNode;
  return render(element.props);
}

function localizeNode(node: ReactNode, locale: Exclude<UiLocale, "ja">): ReactNode {
  if (typeof node === "string") return translateText(node, locale);

  if (Array.isArray(node)) {
    return node.map((child) => localizeNode(child, locale));
  }

  if (!isValidElement(node)) return node;

  const element = node as ReactElement<RecordElementProps>;
  const rendered = renderKnownServerComponent(element);
  if (rendered !== null) {
    return localizeNode(rendered, locale);
  }

  const nextProps: RecordElementProps = {};
  let changed = false;

  if ("children" in element.props) {
    const children = SOURCE_TEXT_CLASSES.has(element.props.className ?? "")
      ? localizeSourceFallbacks(element.props.children, locale)
      : localizeNode(element.props.children, locale);
    if (children !== element.props.children) {
      nextProps.children = children;
      changed = true;
    }
  }

  if (typeof element.props.href === "string" && element.props.href.startsWith("/")) {
    const href = localizeNestedNext(element.props.href, locale);
    if (href !== element.props.href) {
      nextProps.href = href;
      changed = true;
    }
  }

  return changed ? cloneElement(element, nextProps) : element;
}

export default async function LocaleRecordPage(props: RecordPageProps) {
  const locale = await getUiLocale();
  const page = await RecordPortalPage(props);
  if (locale === "ja") return page;
  return localizeNode(page, locale);
}
