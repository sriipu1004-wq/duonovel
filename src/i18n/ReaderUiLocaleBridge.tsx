"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import type { UiLocale } from "./config";

type ReaderDictionary = {
  exact: Record<string, string>;
};

const dictionaries: Record<Exclude<UiLocale, "ja">, ReaderDictionary> = {
  en: {
    exact: {
      "作者": "Author",
      "編集": "Edited by",
      "あらすじ": "Synopsis",
      "ブラウザ朗読": "Browser narration",
      "ユーザー朗読": "User narration",
      "ユーザー朗読（未設定）": "User narration (not available)",
      "朗読者未設定": "Narrator unavailable",
      "朗読": "Narration",
      "朗読音量": "Narration volume",
      "表示演出": "Display effects",
      "マーカー表示": "Reading marker",
      "読み上げ中の文章を青いマーカーで強調する。": "Highlight the sentence currently being narrated.",
      "背景、文字装飾、挿絵を一括で隠す。": "Hide backgrounds, text effects, and illustrations together.",
      "設定表示中。本文は一時的に隠れている。": "Settings are open. The text is temporarily hidden.",
      "有料プランで利用できます。": "Available with a paid plan.",
      "ブラウザ朗読は画面表示中のみ再生し、話末で次の話へ移動する。": "Browser narration plays while this page is open and can continue to the next episode.",
      "ユーザー朗読はバックグラウンド再生に対応し、話末で次の話へ移動する。": "User narration supports background playback and can continue to the next episode.",
      "この話の感想": "Comments on this episode",
      "ログインして感想を書く": "Sign in to write a comment",
      "投稿順": "Post order",
      "いいね順": "Most liked",
      "感想一覧を読み込み中...": "Loading comments...",
      "感想がまだありません。": "No comments yet.",
      "感想を書く": "Write a comment",
      "感想を投稿": "Post comment",
      "投稿中...": "Posting...",
      "ログインしていいね": "Sign in to like",
      "♡ この感想にいいね": "♡ Like this comment",
      "♥ いいね済み": "♥ Liked",
      "処理中...": "Working...",
      "栞": "Bookmark",
      "朗読速度を下げる": "Decrease narration speed",
      "朗読速度を上げる": "Increase narration speed",
      "前話": "Previous episode",
      "次話": "Next episode",
      "再生": "Play",
      "停止": "Stop",
      "設定": "Settings",
      "自動追尾\nON": "Auto follow\nON",
      "自動追尾\nOFF": "Auto follow\nOFF",
      "自動追尾 ON": "Auto follow ON",
      "自動追尾 OFF": "Auto follow OFF",
    },
  },
  ko: {
    exact: {
      "作者": "작가",
      "編集": "편집",
      "あらすじ": "줄거리",
      "ブラウザ朗読": "브라우저 낭독",
      "ユーザー朗読": "사용자 낭독",
      "ユーザー朗読（未設定）": "사용자 낭독 (미설정)",
      "朗読者未設定": "낭독자 미설정",
      "朗読": "낭독",
      "朗読音量": "낭독 음량",
      "表示演出": "표시 효과",
      "マーカー表示": "읽기 마커",
      "読み上げ中の文章を青いマーカーで強調する。": "낭독 중인 문장을 파란 마커로 강조합니다.",
      "背景、文字装飾、挿絵を一括で隠す。": "배경, 문자 효과, 삽화를 한꺼번에 숨깁니다.",
      "設定表示中。本文は一時的に隠れている。": "설정을 표시 중입니다. 본문은 잠시 숨겨집니다.",
      "有料プランで利用できます。": "유료 플랜에서 이용할 수 있습니다.",
      "ブラウザ朗読は画面表示中のみ再生し、話末で次の話へ移動する。": "브라우저 낭독은 이 화면이 열린 동안 재생되며 다음 화로 이어갈 수 있습니다.",
      "ユーザー朗読はバックグラウンド再生に対応し、話末で次の話へ移動する。": "사용자 낭독은 백그라운드 재생을 지원하며 다음 화로 이어갈 수 있습니다.",
      "この話の感想": "이 화의 감상",
      "ログインして感想を書く": "로그인하고 감상 쓰기",
      "投稿順": "게시 순",
      "いいね順": "좋아요 순",
      "感想一覧を読み込み中...": "감상 목록 불러오는 중...",
      "感想がまだありません。": "아직 감상이 없습니다.",
      "感想を書く": "감상 쓰기",
      "感想を投稿": "감상 게시",
      "投稿中...": "게시 중...",
      "ログインしていいね": "로그인하고 좋아요",
      "♡ この感想にいいね": "♡ 이 감상에 좋아요",
      "♥ いいね済み": "♥ 좋아요 완료",
      "処理中...": "처리 중...",
      "栞": "책갈피",
      "朗読速度を下げる": "낭독 속도 낮추기",
      "朗読速度を上げる": "낭독 속도 높이기",
      "前話": "이전화",
      "次話": "다음화",
      "再生": "재생",
      "停止": "정지",
      "設定": "설정",
      "自動追尾\nON": "자동 추적\nON",
      "自動追尾\nOFF": "자동 추적\nOFF",
      "自動追尾 ON": "자동 추적 ON",
      "自動追尾 OFF": "자동 추적 OFF",
    },
  },
};

function translateValue(value: string, locale: Exclude<UiLocale, "ja">): string {
  const dictionary = dictionaries[locale].exact;
  const trimmed = value.trim();
  const exact = dictionary[trimmed];
  if (exact) {
    const leading = value.match(/^\s*/u)?.[0] ?? "";
    const trailing = value.match(/\s*$/u)?.[0] ?? "";
    return `${leading}${exact}${trailing}`;
  }

  let match = trimmed.match(/^感想\s*(\d+)件$/u);
  if (match) return locale === "en" ? `${match[1]} comments` : `감상 ${match[1]}개`;

  match = trimmed.match(/^(\d+)話感想一覧$/u);
  if (match) return locale === "en" ? `Episode ${match[1]} comments` : `${match[1]}화 감상 목록`;

  match = trimmed.match(/^全(\d+)ブロック$/u);
  if (match) return locale === "en" ? `${match[1]} blocks total` : `총 ${match[1]}블록`;

  return value;
}

function localizeInternalHref(rawHref: string, locale: Exclude<UiLocale, "ja">): string {
  if (!rawHref.startsWith("/") || rawHref.startsWith("//")) return rawHref;
  if (rawHref === `/${locale}` || rawHref.startsWith(`/${locale}/`)) return rawHref;

  try {
    const url = new URL(rawHref, window.location.origin);
    const localizable = ["/read/", "/works/", "/login", "/authors/", "/readers/"];
    if (!localizable.some((prefix) => url.pathname === prefix || url.pathname.startsWith(prefix))) {
      return rawHref;
    }

    if (url.pathname === "/login") {
      const next = url.searchParams.get("next");
      if (next && next.startsWith("/") && !next.startsWith(`/${locale}/`)) {
        url.searchParams.set("next", `/${locale}${next}`);
      }
    }

    return `/${locale}${url.pathname}${url.search}${url.hash}`;
  } catch {
    return rawHref;
  }
}

function translateTree(root: ParentNode, locale: Exclude<UiLocale, "ja">) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let current = walker.nextNode();

  while (current) {
    const text = current as Text;
    const parent = text.parentElement;
    if (parent && !parent.closest("article")) nodes.push(text);
    current = walker.nextNode();
  }

  for (const node of nodes) {
    const translated = translateValue(node.nodeValue ?? "", locale);
    if (translated !== node.nodeValue) node.nodeValue = translated;
  }

  root.querySelectorAll<HTMLElement>("[aria-label], [title], [placeholder]").forEach((element) => {
    for (const attr of ["aria-label", "title", "placeholder"] as const) {
      const value = element.getAttribute(attr);
      if (!value) continue;
      const translated = translateValue(value, locale);
      if (translated !== value) element.setAttribute(attr, translated);
    }
  });

  root.querySelectorAll<HTMLAnchorElement>("a[href]").forEach((anchor) => {
    const href = anchor.getAttribute("href");
    if (!href) return;
    const localized = localizeInternalHref(href, locale);
    if (localized !== href) anchor.setAttribute("href", localized);
  });
}

export default function ReaderUiLocaleBridge({ locale }: { locale: UiLocale }) {
  const pathname = usePathname();

  useEffect(() => {
    if (locale === "ja" || !pathname.includes("/read/")) return;

    const run = () => translateTree(document.body, locale);
    run();

    const observer = new MutationObserver(() => run());
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["aria-label", "title", "placeholder", "href"],
    });

    return () => observer.disconnect();
  }, [locale, pathname]);

  return null;
}
