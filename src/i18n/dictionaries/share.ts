import type { UiLocale } from "../config";

export type ShareDictionary = {
  heading: string;
  shareOnX: string;
  shareOnLine: string;
  shareOnFacebook: string;
  copyLink: string;
  copied: string;
  copyFailed: string;
  shareNative: string;
  quoteTitle: (title: string) => string;
};

const ja: ShareDictionary = {
  heading: "この作品を共有",
  shareOnX: "Xで共有",
  shareOnLine: "LINEで送る",
  shareOnFacebook: "Facebookで共有",
  copyLink: "URLをコピー",
  copied: "コピーしました",
  copyFailed: "コピーできませんでした",
  shareNative: "その他の方法で共有",
  quoteTitle: (title) => `「${title}」`,
};

const en: ShareDictionary = {
  heading: "Share this work",
  shareOnX: "Share on X",
  shareOnLine: "Send via LINE",
  shareOnFacebook: "Share on Facebook",
  copyLink: "Copy link",
  copied: "Link copied",
  copyFailed: "Could not copy the link",
  shareNative: "More ways to share",
  quoteTitle: (title) => `"${title}"`,
};

const ko: ShareDictionary = {
  heading: "이 작품 공유하기",
  shareOnX: "X에 공유",
  shareOnLine: "LINE으로 보내기",
  shareOnFacebook: "Facebook에 공유",
  copyLink: "링크 복사",
  copied: "링크를 복사했습니다",
  copyFailed: "링크를 복사하지 못했습니다",
  shareNative: "다른 방법으로 공유",
  quoteTitle: (title) => `「${title}」`,
};

export const shareDictionaries: Record<UiLocale, ShareDictionary> = { ja, en, ko };
